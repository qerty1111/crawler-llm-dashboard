# crawler.py
import asyncio
import random
import threading
import time
import os
from concurrent.futures import ThreadPoolExecutor
from collections import deque

import psycopg2
import psycopg2.pool
from ddgs import DDGS

# ─── CONFIG ───────────────────────────────────────────────
from config import DB_CONFIG, PAGES_PER_QUERY, QUERIES_FILE, PROXIES_FILE
# ──────────────────────────────────────────────────────────


# ─── DATABASE ─────────────────────────────────────────────
def init_db():
    pool = psycopg2.pool.ThreadedConnectionPool(4, 50, **DB_CONFIG)
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS raw_sites (
                    id       SERIAL PRIMARY KEY,
                    url      TEXT UNIQUE NOT NULL,
                    title    TEXT,
                    snippet  TEXT,
                    query    TEXT,
                    found_at TIMESTAMP DEFAULT NOW()
                )
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_url ON raw_sites(url)")
        conn.commit()
    finally:
        pool.putconn(conn)
    print("[DB] Таблица raw_sites готова")
    return pool

def save_urls(db_pool, rows):
    if not rows:
        return 0
    conn = db_pool.getconn()
    saved = 0
    try:
        with conn.cursor() as cur:
            for r in rows:
                try:
                    cur.execute("""
                        INSERT INTO raw_sites (url, title, snippet, query)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (url) DO NOTHING
                    """, (r["url"], r.get("title",""), r.get("body",""), r.get("query","")))
                    if cur.rowcount:
                        saved += 1
                except Exception:
                    pass
        conn.commit()
    except Exception:
        pass
    finally:
        db_pool.putconn(conn)
    return saved


# ─── STATS ────────────────────────────────────────────────
class Stats:
    def __init__(self):
        self.lock          = threading.Lock()
        self.total_req     = 0
        self.ok_req        = 0
        self.fail_req      = 0
        self.total_urls    = 0
        self.queries_done  = 0
        self.queries_total = 0
        self.start         = time.time()
        self.recent        = deque(maxlen=8)
        self.rps_window    = deque(maxlen=100)
        self.active        = 0  # активных воркеров прямо сейчас

    def add(self, ok, new_urls, urls):
        with self.lock:
            self.total_req += 1
            if ok:
                self.ok_req += 1
            else:
                self.fail_req += 1
            self.total_urls += new_urls
            self.rps_window.append((time.time(), new_urls))
            for u in urls[-3:]:
                self.recent.appendleft(u)

    def urls_per_sec(self):
        now = time.time()
        window = [(t, c) for t, c in self.rps_window if now - t <= 10]
        return sum(c for _, c in window) / 10.0 if window else 0.0

    def elapsed(self):
        return time.time() - self.start


# ─── DASHBOARD ────────────────────────────────────────────
def dashboard(stats, proxy_status):
    while True:
        time.sleep(2)
        os.system("clear")
        e = stats.elapsed()
        ups = stats.urls_per_sec()
        avg = stats.total_urls / max(e, 1) * 3600

        with stats.lock:
            active = stats.active

        print("╔══════════════════════════════════════════════════════════╗")
        print("║              🔍  HOTEL SOFTWARE CRAWLER                  ║")
        print("╠══════════════════════════════════════════════════════════╣")
        print(f"║  ⏱  Время:         {int(e//3600):02d}:{int((e%3600)//60):02d}:{int(e%60):02d}                             ║")
        print(f"║  📋  Запросов:     {stats.queries_done:>7} / {stats.queries_total:<7}                    ║")
        print(f"║  🔀  Воркеров:     {active:>3} активных                              ║")
        print("╠══════════════════════════════════════════════════════════╣")
        print(f"║  🌐  Запросов к DDG:    {stats.total_req:>8}                         ║")
        print(f"║  ✅  Успешных:          {stats.ok_req:>8}                         ║")
        print(f"║  ❌  Ошибок:            {stats.fail_req:>8}                         ║")
        print("╠══════════════════════════════════════════════════════════╣")
        print(f"║  📦  Всего URL найдено: {stats.total_urls:>8}                         ║")
        print(f"║  ⚡  URL/сек (10s):    {ups:>8.1f}                         ║")
        print(f"║  📈  URL/час (avg):    {avg:>8.0f}                         ║")
        print("╠══════════════════════════════════════════════════════════╣")
        print("║  🕐  Последние найденные:                                ║")
        with stats.lock:
            recent = list(stats.recent)
        for url in recent:
            print(f"║    {url[:54].ljust(54)}  ║")
        for _ in range(8 - len(recent)):
            print("║    " + " " * 54 + "  ║")
        print("╚══════════════════════════════════════════════════════════╝")


# ─── WORKER: один прокси — своя очередь ──────────────────
def worker(proxy, task_queue, stats, db_pool):
    """Каждый воркер берёт задачи из общей очереди и выполняет их своим прокси"""
    with stats.lock:
        stats.active += 1

    backends = ["google", "bing", "brave", "auto"]

    while True:
        try:
            query, page = task_queue.get_nowait()
        except Exception:
            break  # очередь пуста

        results = []
        current_proxy = proxy
        for backend in backends:
            try:
                ddgs = DDGS(proxy=current_proxy, timeout=15) if current_proxy else DDGS(timeout=15)
                results = ddgs.text(
                    query,
                    region="wt-wt",
                    safesearch="off",
                    max_results=10,
                    page=page,
                    backend=backend,
                )
                if results:
                    break
            except Exception as e:
                err = str(e).lower()
                if current_proxy and any(x in err for x in ["proxy", "connect", "refused", "tunnel"]):
                    current_proxy = None  # fallback без прокси
                time.sleep(0.3)

        if results:
            rows = [{"url": r.get("href",""), "title": r.get("title",""),
                     "body": r.get("body",""), "query": query}
                    for r in results if r.get("href")]
            new_saved = save_urls(db_pool, rows)
            stats.add(True, new_saved, [r["url"] for r in rows])
        else:
            stats.add(False, 0, [])

        task_queue.task_done()

    with stats.lock:
        stats.active -= 1


# ─── MAIN LOOP ────────────────────────────────────────────
async def main():
    print("=" * 60)
    print("  HOTEL SOFTWARE CRAWLER  (per-proxy workers)")
    print("=" * 60)

    # 1. БД
    db_pool = init_db()

    # 2. Прокси
    try:
        with open(PROXIES_FILE) as f:
            proxies = [l.strip() for l in f if l.strip()]
    except FileNotFoundError:
        proxies = []
    # добавляем None = прямое подключение без прокси
    proxies.append(None)
    print(f"[PROXY] {len(proxies)-1} прокси + прямое подключение")

    # 3. Запросы
    with open(QUERIES_FILE, encoding="utf-8") as f:
        queries = [l.strip() for l in f if l.strip()]
    random.shuffle(queries)
    print(f"[QUERIES] Загружено {len(queries)} запросов")

    # 4. Общая очередь задач (query, page)
    import queue
    task_queue = queue.Queue()
    for query in queries:
        for page in range(1, PAGES_PER_QUERY + 1):
            task_queue.put((query, page))

    total_tasks = task_queue.qsize()
    print(f"[TASKS] Всего задач: {total_tasks}")

    # 5. Stats
    stats = Stats()
    stats.queries_total = len(queries)

    # 6. Dashboard
    proxy_status = {}
    threading.Thread(target=dashboard, args=(stats, proxy_status), daemon=True).start()

    # 7. Запускаем по одному воркеру на каждый прокси
    workers_count = len(proxies)
    print(f"[INFO] Запускаем {workers_count} воркеров...")

    with ThreadPoolExecutor(max_workers=workers_count) as ex:
        loop = asyncio.get_event_loop()
        futures = [
            loop.run_in_executor(ex, worker, proxy, task_queue, stats, db_pool)
            for proxy in proxies
        ]
        await asyncio.gather(*futures)

    print("\n[DONE] Готово!")

if __name__ == "__main__":
    asyncio.run(main())