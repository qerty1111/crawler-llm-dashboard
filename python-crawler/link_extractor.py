import asyncio
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse, urljoin
from collections import deque

import psycopg2
import psycopg2.pool
import requests
from bs4 import BeautifulSoup
from rich.console import Console
from rich.table import Table
from rich.live import Live
from rich.panel import Panel
from rich.columns import Columns
from rich import box

# ─── CONFIG ───────────────────────────────────────────────
WORKERS         = 100
BATCH_SIZE      = 200
REQUEST_TIMEOUT = 10

DB_CONFIG = {
    "host": "185.86.76.127", "port": 5432,
    "dbname": "crawler", "user": "crawler_user", "password": "somepassword",
}

SKIP_DOMAINS = {
    "google.com", "google.ru", "youtube.com", "facebook.com", "twitter.com",
    "instagram.com", "linkedin.com", "wikipedia.org", "reddit.com",
    "amazon.com", "apple.com", "microsoft.com", "github.com",
    "t.me", "telegram.org", "whatsapp.com", "tiktok.com",
    "baidu.com", "zhihu.com", "weibo.com", "vk.com", "ok.ru",
    "booking.com", "airbnb.com", "tripadvisor.com", "expedia.com",
    "yelp.com", "trustpilot.com", "g2.com", "capterra.com",
    "pinterest.com", "tumblr.com", "medium.com", "substack.com",
    "wordpress.com", "blogspot.com", "wix.com", "squarespace.com",
    "shopify.com", "ebay.com", "alibaba.com", "aliexpress.com",
    "quora.com", "stackoverflow.com", "yahoo.com", "bing.com",
    "duckduckgo.com", "hoteltechreport.com", "softwareadvice.com",
}

SKIP_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".zip", ".rar",
    ".mp4", ".mp3", ".avi", ".mov", ".css", ".js", ".xml", ".json",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}


# ─── DATABASE ─────────────────────────────────────────────
def init_db():
    pool = psycopg2.pool.ThreadedConnectionPool(4, 120, **DB_CONFIG)
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS crawled_urls (
                    id         SERIAL PRIMARY KEY,
                    url        TEXT UNIQUE NOT NULL,
                    crawled_at TIMESTAMP DEFAULT NOW()
                )
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_crawled_url ON crawled_urls(url)")
            cur.execute("ALTER TABLE raw_sites ADD COLUMN IF NOT EXISTS region TEXT")
        conn.commit()
    finally:
        pool.putconn(conn)
    return pool

def get_batch(db_pool):
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT r.url FROM raw_sites r
                LEFT JOIN crawled_urls c ON r.url = c.url
                WHERE c.url IS NULL
                ORDER BY r.id ASC
                LIMIT %s
            """, (BATCH_SIZE,))
            return [row[0] for row in cur.fetchall()]
    finally:
        db_pool.putconn(conn)

def mark_crawled(db_pool, url):
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO crawled_urls (url) VALUES (%s) ON CONFLICT DO NOTHING", (url,))
        conn.commit()
    except: pass
    finally: db_pool.putconn(conn)

def save_new_urls(db_pool, urls: list) -> int:
    # urls = list of (url, title, snippet, source_url)
    if not urls: return 0
    conn = db_pool.getconn()
    saved = 0
    try:
        with conn.cursor() as cur:
            for url, title, snippet, source in urls:
                try:
                    cur.execute("""
                        INSERT INTO raw_sites (url, title, snippet, query, region)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (url) DO NOTHING
                    """, (url, title[:300], snippet[:500], "link_extractor", f"from:{source[:100]}"))
                    if cur.rowcount: saved += 1
                except: pass
        conn.commit()
    except: pass
    finally: db_pool.putconn(conn)
    return saved

# кэш доменов в памяти чтобы не дёргать БД каждый раз
_domain_cache = set()
_domain_cache_lock = threading.Lock()

def load_domain_cache(db_pool):
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT url FROM raw_sites")
            for (url,) in cur.fetchall():
                d = get_domain(url)
                if d:
                    with _domain_cache_lock:
                        _domain_cache.add(d)
    finally:
        db_pool.putconn(conn)

def domain_known(domain: str) -> bool:
    with _domain_cache_lock:
        return domain in _domain_cache

def add_domain_to_cache(domain: str):
    with _domain_cache_lock:
        _domain_cache.add(domain)


# ─── STATS ────────────────────────────────────────────────
class Stats:
    def __init__(self):
        self.lock      = threading.Lock()
        self.processed = 0
        self.ok        = 0
        self.fail      = 0
        self.new_urls  = 0
        self.skipped   = 0
        self.start     = time.time()
        self.recent    = deque(maxlen=8)
        self.rps       = deque(maxlen=60)

    def add(self, ok, new, skipped, urls):
        with self.lock:
            self.processed += 1
            self.ok        += int(ok)
            self.fail      += int(not ok)
            self.new_urls  += new
            self.skipped   += skipped
            self.rps.append((time.time(), new))
            for u in urls[-2:]: self.recent.appendleft(u)

    def ups(self):
        now = time.time()
        w = [(t,c) for t,c in self.rps if now-t <= 10]
        return sum(c for _,c in w)/10 if w else 0

    def elapsed(self): return time.time() - self.start


# ─── RICH DASHBOARD ───────────────────────────────────────
def make_layout(stats):
    e   = stats.elapsed()
    ups = stats.ups()
    avg = stats.new_urls / max(e,1) * 3600

    t1 = Table(box=box.SIMPLE, show_header=False, padding=(0,1))
    t1.add_column("k", style="cyan",  width=22)
    t1.add_column("v", style="white", width=16)
    t1.add_row("⏱  Время",        f"{int(e//3600):02d}:{int((e%3600)//60):02d}:{int(e%60):02d}")
    t1.add_row("🌐 Обработано",    f"[white]{stats.processed}[/]")
    t1.add_row("✅ Успешных",       f"[green]{stats.ok}[/]")
    t1.add_row("❌ Ошибок",         f"[red]{stats.fail}[/]")
    t1.add_row("⏭  Пропущено",     f"[yellow]{stats.skipped}[/]")
    t1.add_row("📦 Новых URL",      f"[bold yellow]{stats.new_urls}[/]")
    t1.add_row("⚡ URL/сек (10s)",  f"[bold green]{ups:.1f}[/]")
    t1.add_row("📈 URL/час (avg)",  f"[bold green]{avg:.0f}[/]")

    t2 = Table(box=box.SIMPLE, show_header=True, padding=(0,1))
    t2.add_column("🔗 Последние найденные URL", style="dim cyan", width=60)
    with stats.lock: recent = list(stats.recent)
    for url in recent: t2.add_row(url[:60])
    for _ in range(8 - len(recent)): t2.add_row("")

    return Panel(
        Columns([t1, t2], padding=(0,3)),
        title="[bold magenta]🕷  LINK EXTRACTOR  •  рекурсивный краулер[/]",
        border_style="bright_magenta"
    )

def dashboard(stats):
    console = Console()
    with Live(make_layout(stats), console=console,
              refresh_per_second=0.5, screen=True) as live:
        while True:
            time.sleep(2)
            live.update(make_layout(stats))


# ─── URL HELPERS ──────────────────────────────────────────
def get_domain(url: str) -> str:
    try:
        p = urlparse(url)
        d = p.netloc.lower()
        return d[4:] if d.startswith("www.") else d
    except: return ""

def is_valid_url(url: str) -> bool:
    try:
        p = urlparse(url)
        if p.scheme not in ("http", "https"): return False
        if not p.netloc: return False
        if any(p.path.lower().endswith(ext) for ext in SKIP_EXTENSIONS): return False
        return True
    except: return False

def should_skip_domain(domain: str) -> bool:
    if not domain: return True
    for skip in SKIP_DOMAINS:
        if domain == skip or domain.endswith("." + skip): return True
    return False

def get_snippet_for_link(tag, soup) -> str:
    """Берём текст вокруг ссылки как сниппет"""
    try:
        # текст родительского элемента
        parent = tag.parent
        if parent:
            text = parent.get_text(separator=" ", strip=True)
            if len(text) > 30:
                return text[:400]
        # fallback — просто текст ссылки
        return tag.get_text(strip=True)[:200]
    except: return ""


# ─── CORE WORKER ──────────────────────────────────────────
def process_url(url: str, db_pool, stats: Stats):
    mark_crawled(db_pool, url)

    try:
        resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT,
                            allow_redirects=True)
        if resp.status_code != 200:
            stats.add(False, 0, 0, [])
            return

        if "text/html" not in resp.headers.get("content-type", ""):
            stats.add(False, 0, 0, [])
            return

        soup = BeautifulSoup(resp.text, "html.parser")

        # сниппет самой страницы (meta description)
        page_meta = soup.find("meta", attrs={"name": "description"})
        page_snippet = page_meta.get("content", "")[:400] if page_meta else ""

        # title страницы
        page_title_tag = soup.find("title")
        page_title = page_title_tag.get_text(strip=True)[:200] if page_title_tag else ""

        new_urls = []
        skipped  = 0
        seen_domains = set()

        for tag in soup.find_all("a", href=True):
            href = tag.get("href", "").strip()
            if not href: continue

            abs_url = urljoin(url, href)
            if not is_valid_url(abs_url): continue

            link_domain = get_domain(abs_url)
            if should_skip_domain(link_domain):
                skipped += 1
                continue

            if link_domain in seen_domains:
                continue
            seen_domains.add(link_domain)

            # проверяем кэш доменов
            if domain_known(link_domain):
                skipped += 1
                continue

            # title ссылки — текст тега или title атрибут
            link_text = tag.get_text(strip=True)[:200]
            link_title_attr = tag.get("title", "")[:200]
            title = link_text or link_title_attr or link_domain

            # сниппет — текст вокруг ссылки
            snippet = get_snippet_for_link(tag, soup)
            if not snippet and page_snippet:
                snippet = page_snippet  # fallback на мета описание страницы

            new_urls.append((abs_url, title, snippet, url))
            add_domain_to_cache(link_domain)

        saved = save_new_urls(db_pool, new_urls)
        stats.add(True, saved, skipped, [u[0] for u in new_urls[:3]])

    except Exception:
        stats.add(False, 0, 0, [])


# ─── MAIN ─────────────────────────────────────────────────
async def main():
    console = Console()
    console.print("[bold magenta]🕷  LINK EXTRACTOR[/]")

    db_pool = init_db()
    console.print("[green]✓[/] БД подключена")

    # грузим кэш доменов из БД в память
    console.print("[yellow]⟳[/] Загружаем кэш доменов...")
    load_domain_cache(db_pool)
    with _domain_cache_lock:
        count = len(_domain_cache)
    console.print(f"[green]✓[/] Кэш загружен: {count} доменов")

    stats = Stats()
    threading.Thread(target=dashboard, args=(stats,), daemon=True).start()
    time.sleep(0.3)

    loop = asyncio.get_event_loop()

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        while True:
            batch = get_batch(db_pool)

            if not batch:
                await asyncio.sleep(5)
                continue

            tasks = [
                loop.run_in_executor(ex, process_url, url, db_pool, stats)
                for url in batch
            ]
            await asyncio.gather(*tasks)

if __name__ == "__main__":
    asyncio.run(main())