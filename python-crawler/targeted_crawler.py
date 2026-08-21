"""
targeted_crawler.py — точечный краулер с 30 прокси
Каждый прокси работает независимо в своём потоке
Запросы переведены на языки Тир1/Тир2
"""

import asyncio
import random
import threading
import time
import queue
import itertools
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor
from collections import deque

import psycopg2
import psycopg2.pool
from ddgs import DDGS
from deep_translator import GoogleTranslator
from rich.console import Console
from rich.table import Table
from rich.live import Live
from rich.panel import Panel
from rich.columns import Columns
from rich import box

# ─── CONFIG ───────────────────────────────────────────────
PAGES_PER_QUERY = 5
WORKERS_PER_PROXY = 1   # 1 поток на прокси = 30 параллельных потоков
PROXIES_FILE    = "proxies.txt"

DB_CONFIG = {
    "host": "185.86.76.127", "port": 5432,
    "dbname": "crawler", "user": "crawler_user", "password": "somepassword",
}

# ─── РЕГИОНЫ ──────────────────────────────────────────────
REGIONS = [
    ("wt-wt", "en", "Global"),
    ("wt-wt", "en", "Global"),
    ("wt-wt", "en", "Global"),
    ("de-de", "de", "Germany"),
    ("fr-fr", "fr", "France"),
    ("gb-en", "en", "UK"),
    ("nl-nl", "nl", "Netherlands"),
    ("se-sv", "sv", "Sweden"),
    ("no-no", "nb", "Norway"),
    ("dk-da", "da", "Denmark"),
    ("fi-fi", "fi", "Finland"),
    ("es-es", "es", "Spain"),
    ("it-it", "it", "Italy"),
    ("pl-pl", "pl", "Poland"),
    ("pt-pt", "pt", "Portugal"),
    ("jp-jp", "ja", "Japan"),
    ("kr-kr", "ko", "South Korea"),
    ("sg-en", "en", "Singapore"),
    ("in-en", "hi", "India"),
    ("id-id", "id", "Indonesia"),
    ("my-ms", "ms", "Malaysia"),
    ("th-th", "th", "Thailand"),
    ("vn-vi", "vi", "Vietnam"),
    ("tr-tr", "tr", "Turkey"),
    ("il-he", "he", "Israel"),
    ("ae-ar", "ar", "UAE"),
    ("br-pt", "pt", "Brazil"),
    ("mx-es", "es", "Mexico"),
    ("ar-es", "es", "Argentina"),
    ("za-en", "en", "South Africa"),
]

# ─── ЗАПРОСЫ ──────────────────────────────────────────────
BASE_QUERIES = [
    '"hotel PMS" "free trial"',
    '"property management system" "book a demo" hotel',
    '"hotel software" "pricing plans"',
    '"hotel management software" "request demo"',
    '"cloud PMS" hotel "sign up"',
    '"hotel PMS" software vendor pricing',
    '"hotel management system" "try free"',
    '"PMS" "channel manager" hotel software pricing',
    '"hotel property management" software "get started"',
    '"property management system" hotel "monthly pricing"',
    '"channel manager" hotel "free trial"',
    '"channel manager" "book a demo" hotel',
    '"hotel channel manager" pricing plans',
    '"channel manager" hotel "request demo"',
    '"hotel distribution" software "sign up"',
    '"OTA integration" hotel software pricing',
    '"booking engine" hotel "free trial"',
    '"direct booking" hotel software pricing',
    '"hotel booking engine" "request demo"',
    '"booking widget" hotel software vendor',
    '"hotel booking" software "pricing plans"',
    '"reservation management system" hotel software pricing',
    '"RMS" hotel software "free trial"',
    '"hotel reservation" software pricing vendor',
    '"all-in-one" hotel software PMS "free trial"',
    '"hotel software" "channel manager" "booking engine" pricing',
    '"hospitality software" PMS pricing vendor',
    '"property management" "booking engine" hotel software pricing',
    '"hostel management software" pricing demo',
    '"hostel software" "free trial"',
    '"boutique hotel software" pricing demo',
    '"vacation rental" software "channel manager" pricing',
    '"resort management software" pricing demo',
    '"guesthouse software" PMS pricing demo',
    '"alternative to Cloudbeds" hotel software',
    '"alternative to Mews" hotel PMS',
    '"alternative to Little Hotelier"',
    '"alternative to Siteminder" channel manager',
    '"cloud hotel PMS" pricing demo',
    '"SaaS hotel software" PMS pricing',
    '"front desk software" hotel pricing demo',
    '"hotel revenue management" software pricing vendor',
    '"yield management" hotel software pricing demo',
]

# ─── ФИЛЬТР МУСОРА ────────────────────────────────────────
JUNK_DOMAINS = {
    "bing.com", "google.com", "googleadservices.com",
    "capterra.com", "softwareadvice.com", "getapp.com", "g2.com",
    "hoteltechreport.com", "thehotelgm.com", "softwarefinder.com",
    "selecthub.com", "techradar.com", "pcmag.com", "cnet.com",
    "trustpilot.com", "clutch.co", "sourceforge.net", "worldmetrics.org",
    "wikipedia.org", "youtube.com", "facebook.com", "twitter.com",
    "instagram.com", "linkedin.com", "reddit.com", "quora.com",
    "yahoo.com", "amazon.com", "trello.com", "slack.com",
    "sap.com", "salesforce.com", "oracle.com", "microsoft.com",
    "hubspot.com", "zendesk.com", "concur.com", "halliburton.com",
    "bloomberg.com", "forbes.com", "windowsreport.com",
    "booking.com", "expedia.com", "hotels.com", "agoda.com",
    "airbnb.com", "tripadvisor.com", "kayak.com", "priceline.com",
    "trivago.com", "hostelworld.com", "vrbo.com", "airdna.co",
    "stayfi.com", "roommaster.com",
}

def get_domain(url):
    try:
        d = urlparse(url).netloc.lower()
        return d[4:] if d.startswith("www.") else d
    except: return ""

def is_junk(url):
    if not url or not url.startswith("http"): return True
    d = get_domain(url)
    if not d: return True
    for j in JUNK_DOMAINS:
        if d == j or d.endswith("." + j): return True
    if "bing.com/aclick" in url or "google.com/aclk" in url: return True
    return False


# ─── ПЕРЕВОДЧИК (deep-translator) ─────────────────────────
_trans_cache = {}
_cache_lock  = threading.Lock()

def translate_query(query, lang):
    if lang == "en": return query
    key = (query, lang)
    with _cache_lock:
        if key in _trans_cache: return _trans_cache[key]
    try:
        clean = query.replace('"', '')
        result = GoogleTranslator(source="en", target=lang).translate(clean) or clean
    except:
        result = query.replace('"', '')
    with _cache_lock:
        _trans_cache[key] = result
    return result


# ─── ПРОКСИ ───────────────────────────────────────────────
def load_proxies(filepath):
    proxies = []
    try:
        with open(filepath) as f:
            for line in f:
                line = line.strip()
                if not line: continue
                # формат: user:pass@ip:port
                proxies.append(f"http://{line}")
    except Exception as e:
        print(f"[PROXY] Ошибка загрузки: {e}")
    return proxies


# ─── DATABASE ─────────────────────────────────────────────
def init_db():
    pool = psycopg2.pool.ThreadedConnectionPool(4, 40, **DB_CONFIG)
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            for table in ["raw_sites_targeted", "raw_sites"]:
                cur.execute(f"""
                    CREATE TABLE IF NOT EXISTS {table} (
                        id       SERIAL PRIMARY KEY,
                        url      TEXT UNIQUE NOT NULL,
                        title    TEXT,
                        snippet  TEXT,
                        query    TEXT,
                        region   TEXT,
                        found_at TIMESTAMP DEFAULT NOW()
                    )
                """)
                cur.execute(f"CREATE INDEX IF NOT EXISTS idx_{table}_url ON {table}(url)")
        conn.commit()
    finally:
        pool.putconn(conn)
    return pool

def save_urls(db_pool, rows):
    if not rows: return 0, 0
    conn = db_pool.getconn()
    saved = filtered = 0
    try:
        with conn.cursor() as cur:
            for r in rows:
                url = r.get("url", "")
                if is_junk(url):
                    filtered += 1
                    continue
                for table in ["raw_sites_targeted", "raw_sites"]:
                    try:
                        cur.execute(f"""
                            INSERT INTO {table} (url,title,snippet,query,region)
                            VALUES (%s,%s,%s,%s,%s)
                            ON CONFLICT (url) DO NOTHING
                        """, (url, r.get("title","")[:300], r.get("body","")[:500],
                              r.get("query","")[:200], r.get("region","")))
                        if cur.rowcount and table == "raw_sites_targeted":
                            saved += 1
                    except: pass
        conn.commit()
    except: pass
    finally: db_pool.putconn(conn)
    return saved, filtered


# ─── STATS ────────────────────────────────────────────────
class Stats:
    def __init__(self, n_proxies):
        self.lock = threading.Lock()
        self.total_req = self.ok_req = self.fail_req = 0
        self.total_urls = self.filtered = 0
        self.queries_done = self.queries_total = 0
        self.n_proxies = n_proxies
        self.start = time.time()
        self.recent = deque(maxlen=8)
        self.rps = deque(maxlen=60)

    def add(self, ok, saved, filt, urls):
        with self.lock:
            self.total_req += 1
            self.ok_req    += int(ok)
            self.fail_req  += int(not ok)
            self.total_urls += saved
            self.filtered   += filt
            self.rps.append((time.time(), saved))
            for u in urls[-2:]: self.recent.appendleft(u)

    def ups(self):
        now = time.time()
        w = [(t,c) for t,c in self.rps if now-t <= 10]
        return sum(c for _,c in w)/10 if w else 0

    def elapsed(self): return time.time() - self.start


# ─── DASHBOARD ────────────────────────────────────────────
def make_ui(stats):
    e = stats.elapsed()
    avg = stats.total_urls / max(e,1) * 3600

    t1 = Table(box=box.SIMPLE, show_header=False, padding=(0,1))
    t1.add_column("k", style="cyan",  width=22)
    t1.add_column("v", style="white", width=18)
    t1.add_row("⏱  Время",          f"{int(e//3600):02d}:{int((e%3600)//60):02d}:{int(e%60):02d}")
    t1.add_row("🔀 Прокси",         f"[green]{stats.n_proxies}[/] активных")
    t1.add_row("📋 Запросов",       f"{stats.queries_done} / {stats.queries_total}")
    t1.add_row("🌐 DDG запросов",    str(stats.total_req))
    t1.add_row("✅ Успешных",        f"[green]{stats.ok_req}[/]")
    t1.add_row("❌ Ошибок",          f"[red]{stats.fail_req}[/]")
    t1.add_row("📦 Сохранено",       f"[bold yellow]{stats.total_urls}[/]")
    t1.add_row("🗑  Отфильтровано",   f"[dim]{stats.filtered}[/]")
    t1.add_row("⚡ URL/сек (10s)",   f"[bold green]{stats.ups():.1f}[/]")
    t1.add_row("📈 URL/час (avg)",   f"[bold green]{avg:.0f}[/]")

    t2 = Table(box=box.SIMPLE, show_header=True, padding=(0,1))
    t2.add_column("🎯 Последние найденные", style="dim cyan", width=55)
    with stats.lock: recent = list(stats.recent)
    for url in recent: t2.add_row(url[:55])
    for _ in range(8 - len(recent)): t2.add_row("")

    return Panel(
        Columns([t1, t2], padding=(0,3)),
        title="[bold magenta]🎯  TARGETED CRAWLER  •  30 прокси  •  Тир1+Тир2[/]",
        border_style="bright_magenta"
    )

def run_dashboard(stats):
    console = Console()
    with Live(make_ui(stats), console=console, refresh_per_second=0.5, screen=True) as live:
        while True:
            time.sleep(2)
            live.update(make_ui(stats))


# ─── WORKER — один поток на прокси ────────────────────────
def proxy_worker(proxy, task_queue, stats, db_pool):
    """Каждый воркер привязан к одному прокси и берёт задачи из общей очереди"""
    while True:
        try:
            query, page, region_code, lang, region_name = task_queue.get_nowait()
        except:
            break

        translated = translate_query(query, lang)
        results = []

        for backend in ["google", "bing", "brave", "auto"]:
            try:
                ddgs = DDGS(proxy=proxy, timeout=15)
                results = ddgs.text(
                    translated, region=region_code,
                    safesearch="off", max_results=10,
                    page=page, backend=backend,
                )
                if results: break
            except Exception as e:
                err = str(e).lower()
                # если прокси мёртвый — выходим из воркера
                if any(x in err for x in ["proxy", "refused", "tunnel", "407"]):
                    task_queue.task_done()
                    return
                time.sleep(0.3)

        if results:
            rows = [{"url": r.get("href",""), "title": r.get("title",""),
                     "body": r.get("body",""), "query": translated, "region": region_name}
                    for r in results if r.get("href")]
            saved, filt = save_urls(db_pool, rows)
            good = [r["url"] for r in rows if not is_junk(r["url"])]
            stats.add(True, saved, filt, good)
        else:
            stats.add(False, 0, 0, [])

        if page == 1:
            with stats.lock: stats.queries_done += 1

        task_queue.task_done()


# ─── MAIN ─────────────────────────────────────────────────
async def main():
    console = Console()
    console.print("[bold magenta]🎯  Targeted Hotel Software Crawler  •  30 прокси[/]")

    # загружаем прокси
    proxies = load_proxies(PROXIES_FILE)
    if not proxies:
        console.print("[red]✗ Прокси не загружены![/]")
        return
    console.print(f"[green]✓[/] Прокси: {len(proxies)}")

    db_pool = init_db()
    console.print("[green]✓[/] БД подключена")

    # генерируем задачи
    all_tasks = []
    for query in BASE_QUERIES:
        for region_code, lang, region_name in REGIONS:
            for page in range(1, PAGES_PER_QUERY + 1):
                all_tasks.append((query, page, region_code, lang, region_name))

    random.shuffle(all_tasks)

    task_queue = queue.Queue()
    for t in all_tasks: task_queue.put(t)

    total_q = len(BASE_QUERIES) * len(REGIONS)
    console.print(f"[green]✓[/] {len(BASE_QUERIES)} запросов × {len(REGIONS)} регионов = {total_q:,} задач")
    console.print(f"[green]✓[/] Всего задач с пагинацией: {len(all_tasks):,}")

    stats = Stats(len(proxies))
    stats.queries_total = total_q
    threading.Thread(target=run_dashboard, args=(stats,), daemon=True).start()
    time.sleep(0.5)

    # запускаем по одному воркеру на каждый прокси
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=len(proxies)) as ex:
        futures = [
            loop.run_in_executor(ex, proxy_worker, proxy, task_queue, stats, db_pool)
            for proxy in proxies
        ]
        await asyncio.gather(*futures)

    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM raw_sites_targeted")
            console.print(f"\n[bold green]✓ Итого в raw_sites_targeted: {cur.fetchone()[0]}[/]")
    finally: db_pool.putconn(conn)


if __name__ == "__main__":
    asyncio.run(main())