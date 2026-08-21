import asyncio
import random
import threading
import time
import queue
from concurrent.futures import ThreadPoolExecutor
from collections import deque

import psycopg2
import psycopg2.pool
from stem.control import Controller, EventType
from stem import StreamStatus
from ddgs import DDGS
import argostranslate.translate
from rich.console import Console
from rich.table import Table
from rich.live import Live
from rich.panel import Panel
from rich.columns import Columns
from rich.text import Text
from rich import box

# ─── CONFIG ───────────────────────────────────────────────
PAGES_PER_QUERY   = 20
DIRECT_WORKERS    = 5
TOR_CIRCUITS      = 100
TOR_BUILD_WORKERS = 60
QUERIES_FILE      = "queries_flat.txt"
TOR_CONTROL_PORT  = 9051
TOR_SOCKS_PORT    = 9050
TOR_PASSWORD      = "mypassword123"

DB_CONFIG = {
    "host": "185.86.76.127", "port": 5432,
    "dbname": "crawler", "user": "crawler_user", "password": "somepassword",
}

REGIONS = [
    ("de-de","de","Germany"), ("fr-fr","fr","France"), ("es-es","es","Spain"),
    ("it-it","it","Italy"),   ("nl-nl","nl","Netherlands"), ("pl-pl","pl","Poland"),
    ("tr-tr","tr","Turkey"),  ("jp-jp","ja","Japan"), ("kr-kr","ko","South Korea"),
    ("br-pt","pt","Brazil"),  ("mx-es","es","Mexico"), ("id-id","id","Indonesia"),
    ("my-ms","ms","Malaysia"),("th-th","th","Thailand"), ("vn-vi","vi","Vietnam"),
    ("se-sv","sv","Sweden"),  ("no-no","nb","Norway"), ("dk-da","da","Denmark"),
    ("fi-fi","fi","Finland"), ("il-he","he","Israel"), ("in-en","hi","India"),
    ("wt-wt","en","Global"),
]


# ─── ПЕРЕВОД (кэш + lazy init) ───────────────────────────
_translators = {}
_trans_lock  = threading.Lock()
_installed   = None

def _get_installed():
    global _installed
    if _installed is None:
        _installed = argostranslate.translate.get_installed_languages()
    return _installed

def get_translator(lang):
    if lang == "en": return None
    with _trans_lock:
        if lang not in _translators:
            installed = _get_installed()
            en = next((l for l in installed if l.code == "en"), None)
            to = next((l for l in installed if l.code == lang), None)
            _translators[lang] = en.get_translation(to) if en and to else None
        return _translators[lang]

# кэш переводов чтобы не переводить одно и то же 1000 раз
_translation_cache = {}
_cache_lock = threading.Lock()

def translate_query(query, lang):
    if lang == "en": return query
    key = (query, lang)
    with _cache_lock:
        if key in _translation_cache:
            return _translation_cache[key]
    try:
        t = get_translator(lang)
        result = t.translate(query) if t else query
    except:
        result = query
    with _cache_lock:
        _translation_cache[key] = result
    return result


# ─── DATABASE ─────────────────────────────────────────────
def init_db():
    pool = psycopg2.pool.ThreadedConnectionPool(4, 60, **DB_CONFIG)
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""CREATE TABLE IF NOT EXISTS raw_sites (
                id SERIAL PRIMARY KEY, url TEXT UNIQUE NOT NULL,
                title TEXT, snippet TEXT, query TEXT,
                region TEXT, found_at TIMESTAMP DEFAULT NOW())""")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_url ON raw_sites(url)")
        conn.commit()
    finally:
        pool.putconn(conn)
    return pool

def save_urls(db_pool, rows):
    if not rows: return 0
    conn = db_pool.getconn(); saved = 0
    try:
        with conn.cursor() as cur:
            for r in rows:
                try:
                    cur.execute(
                        "INSERT INTO raw_sites (url,title,snippet,query,region) VALUES (%s,%s,%s,%s,%s) ON CONFLICT (url) DO NOTHING",
                        (r["url"], r.get("title",""), r.get("body",""), r.get("query",""), r.get("region","")))
                    if cur.rowcount: saved += 1
                except: pass
        conn.commit()
    except: pass
    finally: db_pool.putconn(conn)
    return saved


# ─── TOR POOL ─────────────────────────────────────────────
class TorPool:
    def __init__(self):
        self.ctrl = Controller.from_port(port=TOR_CONTROL_PORT)
        self.ctrl.authenticate(TOR_PASSWORD)
        self.ctrl.set_conf('__LeaveStreamsUnattached', '1')
        self.thread_circuit = {}
        self.tlock = threading.Lock()
        self.ctrl.add_event_listener(self._on_stream, EventType.STREAM)
        routers      = list(self.ctrl.get_network_statuses())
        self.exits   = [r for r in routers if r.flags and 'Exit'    in r.flags and 'BadExit' not in r.flags]
        self.guards  = [r for r in routers if r.flags and 'Guard'   in r.flags]
        self.middles = [r for r in routers if r.flags and 'Running' in r.flags]
        self.pool = {}
        self.lock = asyncio.Lock()

    def _on_stream(self, stream):
        if stream.status != StreamStatus.NEW: return
        tid = threading.current_thread().ident
        with self.tlock: cid = self.thread_circuit.get(tid)
        try: self.ctrl.attach_stream(stream.id, cid if cid else 0)
        except: pass

    def _build_and_test(self):
        try:
            cid = self.ctrl.new_circuit([
                random.choice(self.guards).fingerprint,
                random.choice(self.middles).fingerprint,
                random.choice(self.exits).fingerprint,
            ], await_build=True, timeout=15)
        except: return None
        # быстрая проверка без DDG — просто что цепочка жива
        return cid

    async def fill(self, loop, target):
        need = target - len(self.pool)
        if need <= 0: return
        with ThreadPoolExecutor(max_workers=TOR_BUILD_WORKERS) as ex:
            tasks = [loop.run_in_executor(ex, self._build_and_test) for _ in range(need * 2)]
            built = 0
            for coro in asyncio.as_completed(tasks):
                cid = await coro
                if cid:
                    async with self.lock:
                        if len(self.pool) >= target: break
                        self.pool[cid] = True
                        built += 1
                if built >= need: break

    def circuits(self): return list(self.pool.keys())
    def get_circuit(self):
        c = self.circuits(); return random.choice(c) if c else None
    def remove_circuit(self, cid):
        self.pool.pop(cid, None)
        try: self.ctrl.close_circuit(cid)
        except: pass


# ─── STATS ────────────────────────────────────────────────
class Stats:
    def __init__(self):
        self.lock = threading.Lock()
        self.total_req = self.ok_req = self.fail_req = 0
        self.total_urls = self.queries_done = self.queries_total = 0
        self.start = time.time()
        self.recent = deque(maxlen=8)
        self.rps = deque(maxlen=60)

    def add(self, ok, n, urls):
        with self.lock:
            self.total_req += 1
            self.ok_req    += int(ok)
            self.fail_req  += int(not ok)
            self.total_urls += n
            self.rps.append((time.time(), n))
            for u in urls[-2:]: self.recent.appendleft(u)

    def ups(self):
        now = time.time()
        w = [(t,c) for t,c in self.rps if now-t <= 10]
        return sum(c for _,c in w)/10 if w else 0

    def elapsed(self): return time.time() - self.start


# ─── RICH DASHBOARD ───────────────────────────────────────
def make_layout(stats, tor_pool):
    e   = stats.elapsed()
    ups = stats.ups()
    avg = stats.total_urls / max(e,1) * 3600
    circuits = len(tor_pool.pool)

    t1 = Table(box=box.SIMPLE, show_header=False, padding=(0,1))
    t1.add_column("k", style="cyan",  width=22)
    t1.add_column("v", style="white", width=18)
    t1.add_row("⏱  Время",      f"{int(e//3600):02d}:{int((e%3600)//60):02d}:{int(e%60):02d}")
    t1.add_row("📋 Запросов",   f"{stats.queries_done} / {stats.queries_total}")
    t1.add_row("🔗 Tor цепочек", f"[green]{circuits}[/]")
    t1.add_row("🌐 DDG запросов", str(stats.total_req))
    t1.add_row("✅ Успешных",    f"[green]{stats.ok_req}[/]")
    t1.add_row("❌ Ошибок",      f"[red]{stats.fail_req}[/]")
    t1.add_row("📦 URL найдено", f"[bold yellow]{stats.total_urls}[/]")
    t1.add_row("⚡ URL/сек",     f"[bold green]{ups:.1f}[/]")
    t1.add_row("📈 URL/час",     f"[bold green]{avg:.0f}[/]")

    t2 = Table(box=box.SIMPLE, show_header=True, padding=(0,1))
    t2.add_column("🕐 Последние URL", style="dim cyan", width=62)
    with stats.lock: recent = list(stats.recent)
    for url in recent: t2.add_row(url[:62])
    for _ in range(8 - len(recent)): t2.add_row("")

    return Panel(
        Columns([t1, t2], padding=(0,3)),
        title="[bold magenta]🔍  HOTEL SOFTWARE CRAWLER  •  Mac + Tor[/]",
        border_style="bright_magenta"
    )

def dashboard(stats, tor_pool):
    console = Console()
    with Live(make_layout(stats, tor_pool), console=console,
              refresh_per_second=0.5, screen=True) as live:
        while True:
            time.sleep(2)
            live.update(make_layout(stats, tor_pool))


# ─── FETCH ────────────────────────────────────────────────
def do_fetch(query, page, region_code, lang, region_name, proxy, stats, db_pool):
    translated = translate_query(query, lang)
    results = []
    for backend in ["google", "bing", "brave", "auto"]:
        try:
            ddgs = DDGS(proxy=proxy, timeout=15) if proxy else DDGS(timeout=15)
            results = ddgs.text(translated, region=region_code,
                                safesearch="off", max_results=10,
                                page=page, backend=backend)
            if results: break
        except: time.sleep(0.2)

    if results:
        rows = [{"url": r.get("href",""), "title": r.get("title",""),
                 "body": r.get("body",""), "query": translated, "region": region_name}
                for r in results if r.get("href")]
        n = save_urls(db_pool, rows)
        stats.add(True, n, [r["url"] for r in rows])
    else:
        stats.add(False, 0, [])


# ─── WORKERS ──────────────────────────────────────────────
def worker_direct(task_queue, stats, db_pool):
    while True:
        try: query, page, rc, lang, rname = task_queue.get_nowait()
        except: break
        do_fetch(query, page, rc, lang, rname, None, stats, db_pool)
        task_queue.task_done()

def worker_tor(cid, tor_pool, task_queue, stats, db_pool):
    tid = threading.current_thread().ident
    proxy = f"socks5h://127.0.0.1:{TOR_SOCKS_PORT}"
    while True:
        try: query, page, rc, lang, rname = task_queue.get_nowait()
        except: break
        with tor_pool.tlock: tor_pool.thread_circuit[tid] = cid
        try: do_fetch(query, page, rc, lang, rname, proxy, stats, db_pool)
        finally:
            with tor_pool.tlock: tor_pool.thread_circuit.pop(tid, None)
        task_queue.task_done()


# ─── MAIN ─────────────────────────────────────────────────
async def main():
    console = Console()
    console.print("[bold magenta]HOTEL CRAWLER  •  Mac + Tor → Remote DB[/]")

    # 1. БД
    db_pool = init_db()
    console.print("[green]✓[/] БД подключена")

    # 2. Запросы — грузим сразу, с конца
    with open(QUERIES_FILE, encoding="utf-8") as f:
        queries = [l.strip() for l in f if l.strip()]
    queries.reverse()
    console.print(f"[green]✓[/] Запросов: {len(queries)} (с конца списка)")

    # 3. Прогрев кэша переводов в фоне (не блокирует старт)
    def warm_cache():
        sample = queries[:50]  # переводим первые 50 для прогрева
        for q in sample:
            for _, lang, _ in REGIONS:
                translate_query(q, lang)
    threading.Thread(target=warm_cache, daemon=True).start()

    # 4. Tor
    console.print(f"[yellow]⟳[/] Строим {TOR_CIRCUITS} Tor цепочек...")
    tor_pool = TorPool()
    loop = asyncio.get_event_loop()
    await tor_pool.fill(loop, target=TOR_CIRCUITS)
    console.print(f"[green]✓[/] Tor: {len(tor_pool.pool)} цепочек")

    # 5. Очередь задач
    task_queue = queue.Queue()
    for query in queries:
        for rc, lang, rname in REGIONS:
            for page in range(1, PAGES_PER_QUERY + 1):
                task_queue.put((query, page, rc, lang, rname))
    console.print(f"[green]✓[/] Задач: {task_queue.qsize():,}")

    # 6. Stats + dashboard
    stats = Stats()
    stats.queries_total = len(queries) * len(REGIONS)
    threading.Thread(target=dashboard, args=(stats, tor_pool), daemon=True).start()
    time.sleep(0.5)  # дать дашборду запуститься

    # 7. Поехали
    tor_circuits  = tor_pool.circuits()
    total_workers = DIRECT_WORKERS + len(tor_circuits)

    with ThreadPoolExecutor(max_workers=total_workers) as ex:
        futures = []
        for _ in range(DIRECT_WORKERS):
            futures.append(loop.run_in_executor(ex, worker_direct, task_queue, stats, db_pool))
        for cid in tor_circuits:
            futures.append(loop.run_in_executor(ex, worker_tor, cid, tor_pool, task_queue, stats, db_pool))
        await asyncio.gather(*futures)

    console.print("[bold green]DONE![/]")

if __name__ == "__main__":
    asyncio.run(main())