"""
Hotel Software Classifier v2
=============================
Stage 1: llama3.2:3b  — title + snippet → score 0-10, порог >= 7
Stage 2: llama3.1:8b  — главная страница → финальный вердикт, порог >= 7

Ищем ТОЛЬКО B2B software vendors:
- PMS  = Property Management System (управление номерами, бронями, гостями)
- RMS  = Revenue/Reservation Management System (управление доходами/тарифами)
- OTA  = Online Travel Agency (B2B платформа для дистрибуции, не потребительский сайт)
- Channel Manager = управление каналами продаж (Booking, Expedia, Airbnb и др.)
- Booking Engine = движок прямого бронирования для сайта отеля
"""

import asyncio
import threading
import time
import re
from concurrent.futures import ThreadPoolExecutor
from collections import deque
from urllib.parse import urlparse

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

# ══════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════
STAGE1_MODEL      = "llama3.2:3b"
STAGE2_MODEL      = "llama3.1:8b"
OLLAMA_URL        = "http://localhost:11434/api/generate"

STAGE1_MIN_SCORE  = 7.0
STAGE2_MIN_SCORE  = 7.0
STAGE1_BATCH_SIZE = 20   # больше батч = GPU загружен больше
STAGE2_BATCH_SIZE = 8
STAGE1_PARALLEL   = 4    # параллельных запросов к stage1 (загружаем GPU)
STAGE2_PARALLEL   = 2    # параллельных запросов к stage2
FETCH_BATCH       = 500
PAGE_TIMEOUT      = 8
PAGE_WORKERS      = 30

DB_CONFIG = {
    "host": "185.86.76.127", "port": 5432,
    "dbname": "crawler", "user": "crawler_user", "password": "somepassword",
}

# Домены которые скипаем полностью
SKIP_DOMAINS = {
    "bing.com", "google.com", "youtube.com", "facebook.com", "twitter.com",
    "instagram.com", "linkedin.com", "wikipedia.org", "reddit.com",
    "amazon.com", "tripadvisor.com", "booking.com", "expedia.com",
    "airbnb.com", "trustpilot.com", "capterra.com", "g2.com",
    "pinterest.com", "tiktok.com", "softwareadvice.com", "getapp.com",
    "sourceforge.net", "quora.com", "yahoo.com", "hotels.com",
    "agoda.com", "kayak.com", "trivago.com", "skyscanner.com",
    "budget.com", "hertz.com", "avis.com", "enterprise.com",
    "marriott.com", "hilton.com", "hyatt.com", "ihg.com",
    "hotelminder.com", "thehotelgm.com", "hoteltechreport.com",
    "softwaresuggest.com", "selecthub.com", "worldmetrics.org",
    "altexsoft.com", "stayfi.com", "roommaster.com",
}

VALID_CATEGORIES = {"pms", "rms", "ota", "channel manager", "booking engine"}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
}

# ══════════════════════════════════════════════
# PROMPTS
# ══════════════════════════════════════════════
SYSTEM_PROMPT = """You are an expert at identifying hotel software vendors.

WHAT WE WANT — B2B software products/vendors for hotels only:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS (Property Management System)
  = Software that manages hotel operations: room inventory, check-in/out,
    guest profiles, housekeeping, billing. Sold to hotels as a product.
  Examples: Opera PMS, Cloudbeds, Mews, Little Hotelier, WebRezPro

RMS (Revenue/Reservation Management System)
  = Software for pricing, yield management, demand forecasting for hotels.
  Examples: IDeaS, Duetto, RoomPriceGenie, Atomize

OTA (Online Travel Agency) — B2B PLATFORM SIDE ONLY
  = Software platform that helps hotels distribute inventory to booking channels.
  NOT consumer booking sites like Booking.com or Expedia (those are end-user sites).
  Examples: SiteMinder (as distribution platform), Derbysort, Staah

Channel Manager
  = Software connecting hotel PMS to multiple booking channels (OTAs, GDS).
    Syncs rates and availability across Booking.com, Expedia, Airbnb etc.
  Examples: SiteMinder, Cloudbeds channel manager, MyAllocator, Cubilis

Booking Engine
  = Software widget/system on hotel website enabling direct bookings.
    Reduces commission costs vs OTAs.
  Examples: Bookassist, Fastbooking, Availpro, Triptease

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT WE DO NOT WANT — score these 1-4:
- Consumer hotel booking sites (booking.com, hotels.com, agoda)
- Hotel chains (Marriott, Hilton) — they USE software, don't sell it
- Travel blogs, review sites, "best PMS list" articles
- Car rental, airlines, restaurants
- General accounting, HR, CRM not specific to hotels
- Job boards, news sites, press releases
- Software comparison/review sites (G2, Capterra, GetApp)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SCORING:
9-10 = Definitely a hotel software vendor (clear product, pricing page, demo request)
7-8  = Likely hotel software vendor
5-6  = Possibly related but unclear
1-4  = Not what we want"""


# ══════════════════════════════════════════════
# DATABASE
# ══════════════════════════════════════════════
def init_db():
    pool = psycopg2.pool.ThreadedConnectionPool(4, 50, **DB_CONFIG)
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS filtered_sites (
                    id              SERIAL PRIMARY KEY,
                    raw_site_id     INTEGER UNIQUE,
                    url             TEXT NOT NULL,
                    domain          TEXT,
                    title           TEXT,
                    snippet         TEXT,
                    stage1_score    FLOAT,
                    stage1_category TEXT,
                    created_at      TIMESTAMP DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS classified_sites (
                    id           SERIAL PRIMARY KEY,
                    url          TEXT UNIQUE NOT NULL,
                    domain       TEXT UNIQUE,
                    title        TEXT,
                    snippet      TEXT,
                    page_content TEXT,
                    category     TEXT,
                    score        FLOAT,
                    raw_site_id  INTEGER,
                    found_at     TIMESTAMP DEFAULT NOW()
                )
            """)
            for idx in [
                "CREATE INDEX IF NOT EXISTS idx_fs_raw    ON filtered_sites(raw_site_id)",
                "CREATE INDEX IF NOT EXISTS idx_fs_domain ON filtered_sites(domain)",
                "CREATE INDEX IF NOT EXISTS idx_cs_url    ON classified_sites(url)",
                "CREATE INDEX IF NOT EXISTS idx_cs_domain ON classified_sites(domain)",
                "CREATE INDEX IF NOT EXISTS idx_cs_cat    ON classified_sites(category)",
                "CREATE INDEX IF NOT EXISTS idx_cs_score  ON classified_sites(score DESC)",
            ]:
                cur.execute(idx)
            cur.execute("CREATE TABLE IF NOT EXISTS stage1_done (raw_site_id INTEGER PRIMARY KEY)")
            cur.execute("CREATE TABLE IF NOT EXISTS stage2_done (filtered_site_id INTEGER PRIMARY KEY)")
            cur.execute("ALTER TABLE raw_sites ADD COLUMN IF NOT EXISTS region TEXT")

            # чистим дубли доменов в raw_sites
            cur.execute("""
                DELETE FROM raw_sites
                WHERE id NOT IN (
                    SELECT MIN(id)
                    FROM raw_sites
                    GROUP BY substring(url from '(?:https?://)?(?:www\.)?([^/?#]+)')
                )
                AND id NOT IN (SELECT raw_site_id FROM stage1_done WHERE raw_site_id IS NOT NULL)
            """)
            deleted = cur.rowcount
            if deleted > 0:
                print(f"[DB] Удалено дублей доменов: {deleted}")

        conn.commit()
    finally:
        pool.putconn(conn)
    return pool


def get_domain(url: str) -> str:
    try:
        p = urlparse(url)
        d = p.netloc.lower()
        return d[4:] if d.startswith("www.") else d
    except:
        return ""


def should_skip(url: str) -> bool:
    domain = get_domain(url)
    if not domain: return True
    for skip in SKIP_DOMAINS:
        if domain == skip or domain.endswith("." + skip):
            return True
    return False


def get_stage1_batch(db_pool):
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT r.id, r.url, r.title, r.snippet
                FROM raw_sites r
                LEFT JOIN stage1_done d ON r.id = d.raw_site_id
                WHERE d.raw_site_id IS NULL
                  AND r.snippet IS NOT NULL
                  AND length(trim(r.snippet)) > 30
                ORDER BY r.id ASC
                LIMIT %s
            """, (FETCH_BATCH,))
            rows = cur.fetchall()
            # фильтруем скип домены в памяти
            return [r for r in rows if not should_skip(r[1])]
    finally:
        db_pool.putconn(conn)


def mark_done(db_pool, table, col, ids):
    if not ids: return
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.executemany(
                f"INSERT INTO {table} ({col}) VALUES (%s) ON CONFLICT DO NOTHING",
                [(i,) for i in ids])
        conn.commit()
    except: pass
    finally: db_pool.putconn(conn)


def domain_known_filtered(db_pool, domain: str) -> bool:
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM filtered_sites WHERE domain=%s LIMIT 1", (domain,))
            return cur.fetchone() is not None
    finally:
        db_pool.putconn(conn)


def domain_known_classified(db_pool, domain: str) -> bool:
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM classified_sites WHERE domain=%s LIMIT 1", (domain,))
            return cur.fetchone() is not None
    finally:
        db_pool.putconn(conn)


def save_filtered(db_pool, rows):
    if not rows: return 0
    conn = db_pool.getconn(); saved = 0
    try:
        with conn.cursor() as cur:
            for raw_id, url, domain, title, snippet, score, cat in rows:
                try:
                    cur.execute("""
                        INSERT INTO filtered_sites
                          (raw_site_id,url,domain,title,snippet,stage1_score,stage1_category)
                        VALUES (%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (raw_site_id) DO NOTHING
                    """, (raw_id, url, domain, (title or "")[:300], (snippet or "")[:500], score, cat))
                    if cur.rowcount: saved += 1
                except: pass
        conn.commit()
    except: pass
    finally: db_pool.putconn(conn)
    return saved


def get_stage2_batch(db_pool):
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT f.id, f.url, f.domain, f.title, f.snippet, f.stage1_category, f.raw_site_id
                FROM filtered_sites f
                LEFT JOIN stage2_done d ON f.id = d.filtered_site_id
                WHERE d.filtered_site_id IS NULL
                ORDER BY f.stage1_score DESC, f.id ASC
                LIMIT %s
            """, (FETCH_BATCH,))
            return cur.fetchall()
    finally:
        db_pool.putconn(conn)


def save_classified(db_pool, rows):
    if not rows: return 0
    conn = db_pool.getconn(); saved = 0
    try:
        with conn.cursor() as cur:
            for url, domain, title, snippet, content, cat, score, raw_id in rows:
                try:
                    cur.execute("""
                        INSERT INTO classified_sites
                          (url,domain,title,snippet,page_content,category,score,raw_site_id)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (url) DO NOTHING
                    """, (url, domain, (title or "")[:300], (snippet or "")[:500],
                          (content or "")[:3000], cat, score, raw_id))
                    if cur.rowcount: saved += 1
                except: pass
        conn.commit()
    except: pass
    finally: db_pool.putconn(conn)
    return saved


# ══════════════════════════════════════════════
# STATS
# ══════════════════════════════════════════════
class Stats:
    def __init__(self):
        self.lock = threading.Lock()
        self.s1_total = self.s1_passed = self.s1_rejected = 0
        self.s2_total = self.s2_saved  = self.s2_rejected = 0
        self.start  = time.time()
        self.recent = deque(maxlen=6)
        self.s1_win = deque(maxlen=60)
        self.s2_win = deque(maxlen=60)

    def s1(self, total, passed, rejected):
        with self.lock:
            self.s1_total    += total
            self.s1_passed   += passed
            self.s1_rejected += rejected
            self.s1_win.append((time.time(), total))

    def s2(self, total, saved, rejected, urls):
        with self.lock:
            self.s2_total    += total
            self.s2_saved    += saved
            self.s2_rejected += rejected
            self.s2_win.append((time.time(), total))
            for u in urls: self.recent.appendleft(u)

    def speed(self, win):
        now = time.time()
        w = [(t,c) for t,c in win if now-t <= 10]
        return sum(c for _,c in w)/10 if w else 0

    def elapsed(self): return time.time() - self.start


# ══════════════════════════════════════════════
# DASHBOARD
# ══════════════════════════════════════════════
def make_ui(stats):
    e = stats.elapsed()
    s1pct = f"{stats.s1_passed/max(stats.s1_total,1)*100:.0f}%"
    s2pct = f"{stats.s2_saved/max(stats.s2_total,1)*100:.0f}%"

    tbl = Table(box=box.SIMPLE, show_header=True, padding=(0,1))
    tbl.add_column("",                     style="bold cyan", width=22)
    tbl.add_column("🚀 Stage 1\n3b fast",  style="white",     width=16, justify="right")
    tbl.add_column("🎯 Stage 2\n8b deep",  style="white",     width=16, justify="right")

    tbl.add_row("⏱  Время",
        f"{int(e//3600):02d}:{int((e%3600)//60):02d}:{int(e%60):02d}", "")
    tbl.add_row("🔄 Обработано",   str(stats.s1_total),   str(stats.s2_total))
    tbl.add_row("✅ Прошло",
        f"[green]{stats.s1_passed}[/] [dim]({s1pct})[/]",
        f"[green]{stats.s2_saved}[/] [dim]({s2pct})[/]")
    tbl.add_row("❌ Отклонено",
        f"[red]{stats.s1_rejected}[/]",
        f"[red]{stats.s2_rejected}[/]")
    tbl.add_row("⚡ /сек (10s)",
        f"[bold green]{stats.speed(stats.s1_win):.1f}[/]",
        f"[bold green]{stats.speed(stats.s2_win):.1f}[/]")

    rec = Table(box=box.SIMPLE, show_header=True, padding=(0,1))
    rec.add_column("🏆 Финальные результаты", style="dim cyan", width=55)
    with stats.lock: recent = list(stats.recent)
    for u in recent: rec.add_row(u[:55])
    for _ in range(6 - len(recent)): rec.add_row("")

    return Panel(
        Columns([tbl, rec], padding=(0,2)),
        title="[bold magenta]🏨  HOTEL SOFTWARE CLASSIFIER  ·  PMS · RMS · OTA · Channel Manager · Booking Engine[/]",
        border_style="bright_magenta",
    )


def run_dashboard(stats):
    console = Console()
    with Live(make_ui(stats), console=console, refresh_per_second=0.5, screen=True) as live:
        while True:
            time.sleep(2)
            live.update(make_ui(stats))


# ══════════════════════════════════════════════
# OLLAMA
# ══════════════════════════════════════════════
def ollama_call(model: str, prompt: str, max_tokens: int = 512) -> str:
    try:
        r = requests.post(OLLAMA_URL, json={
            "model": model,
            "system": SYSTEM_PROMPT,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.05,
                "num_predict": max_tokens,
                "top_p": 0.9,
                "num_gpu": 99,  # максимально на GPU
            },
        }, timeout=120)
        return r.json().get("response", "")
    except:
        return ""


def parse_results(text: str, n: int) -> list:
    results = []
    for i in range(1, n + 1):
        m = re.search(
            rf"SITE\s*{i}\s*[:\-]\s*score\s*[=:]\s*(\d+(?:\.\d+)?)\s+category\s*[=:]\s*([A-Za-z\s]+)",
            text, re.IGNORECASE
        )
        if m:
            score = min(10.0, max(1.0, float(m.group(1))))
            cat   = m.group(2).strip()
            results.append((score, cat))
        else:
            results.append((0.0, "parse_error"))
    return results


# ══════════════════════════════════════════════
# STAGE 1 — llama3.2:3b (title + snippet)
# ══════════════════════════════════════════════
def stage1_process_chunk(chunk, db_pool, stats):
    ids      = [r[0] for r in chunk]
    urls     = [r[1] for r in chunk]
    titles   = [r[2] or "" for r in chunk]
    snippets = [r[3] or "" for r in chunk]

    lines = []
    for i, (url, title, snippet) in enumerate(zip(urls, titles, snippets), 1):
        lines.append(
            f"SITE {i}:\n"
            f"URL: {url}\n"
            f"Title: {title or 'N/A'}\n"
            f"Description: {snippet[:300]}"
        )

    prompt = (
        f"Analyze these {len(chunk)} websites. Only title and description provided.\n"
        f"Respond EXACTLY one line per site:\n"
        f"SITE N: score=X category=Y\n\n"
        f"Categories: PMS, RMS, OTA, Channel Manager, Booking Engine, Unrelated\n\n"
        + "\n---\n".join(lines)
        + "\n\nRespond now, one line per site:"
    )

    text    = ollama_call(STAGE1_MODEL, prompt, max_tokens=len(chunk) * 15 + 30)
    results = parse_results(text, len(chunk))

    passed_rows = []
    passed = rejected = 0
    all_ids = list(ids)

    for i, (score, cat) in enumerate(results):
        domain = get_domain(urls[i])
        cat_low = cat.strip().lower()

        if (score >= STAGE1_MIN_SCORE
                and cat_low in VALID_CATEGORIES
                and not domain_known_filtered(db_pool, domain)):
            passed_rows.append((ids[i], urls[i], domain, titles[i], snippets[i], score, cat.strip()))
            passed += 1
        else:
            rejected += 1

    save_filtered(db_pool, passed_rows)
    mark_done(db_pool, "stage1_done", "raw_site_id", all_ids)
    stats.s1(len(chunk), passed, rejected)


async def stage1_loop(db_pool, stats):
    loop = asyncio.get_event_loop()
    while True:
        rows = get_stage1_batch(db_pool)
        if not rows:
            await asyncio.sleep(5)
            continue

        # разбиваем на чанки и запускаем параллельно
        chunks = [rows[i:i+STAGE1_BATCH_SIZE] for i in range(0, len(rows), STAGE1_BATCH_SIZE)]

        tasks = [
            loop.run_in_executor(None, stage1_process_chunk, chunk, db_pool, stats)
            for chunk in chunks[:STAGE1_PARALLEL]  # параллельно N чанков
        ]
        await asyncio.gather(*tasks)


# ══════════════════════════════════════════════
# STAGE 2 — llama3.1:8b (главная страница)
# ══════════════════════════════════════════════
def get_homepage(url: str) -> tuple[str, str]:
    """Возвращает (homepage_url, content)"""
    try:
        # берём только главную страницу (root domain)
        parsed = urlparse(url)
        homepage = f"{parsed.scheme}://{parsed.netloc}/"

        r = requests.get(homepage, headers=HEADERS, timeout=PAGE_TIMEOUT, allow_redirects=True)
        if r.status_code != 200: return homepage, ""
        if "text/html" not in r.headers.get("content-type", ""): return homepage, ""

        soup = BeautifulSoup(r.text, "html.parser")

        # title
        title_tag = soup.find("title")
        page_title = title_tag.get_text(strip=True) if title_tag else ""

        # meta description
        meta = soup.find("meta", attrs={"name": "description"})
        meta_desc = meta.get("content", "") if meta else ""

        # основной текст (без навигации, футера и т.д.)
        for tag in soup(["script","style","nav","footer","header","aside","form","iframe"]):
            tag.decompose()

        text = soup.get_text(separator=" ", strip=True)
        text = re.sub(r'\s+', ' ', text).strip()

        # собираем: title + meta + контент
        content = f"Title: {page_title}\nMeta: {meta_desc}\nContent: {text[:3000]}"
        return homepage, content
    except:
        return url, ""


def stage2_process_chunk(chunk, db_pool, stats):
    fids    = [r[0] for r in chunk]
    urls    = [r[1] for r in chunk]
    domains = [r[2] or "" for r in chunk]
    titles  = [r[3] or "" for r in chunk]
    snippets= [r[4] or "" for r in chunk]
    s1cats  = [r[5] or "" for r in chunk]
    raw_ids = [r[6] for r in chunk]

    # параллельно открываем главные страницы
    with ThreadPoolExecutor(max_workers=PAGE_WORKERS) as ex:
        page_results = list(ex.map(get_homepage, urls))

    homepage_urls = [p[0] for p in page_results]
    contents      = [p[1] for p in page_results]

    lines = []
    for i, (url, domain, title, snippet, s1cat, content) in enumerate(
            zip(urls, domains, titles, snippets, s1cats, contents), 1):
        body = content if content.strip() else f"Title: {title}\nDescription: {snippet}"
        lines.append(
            f"SITE {i}:\n"
            f"Domain: {domain}\n"
            f"Stage1 hint: {s1cat}\n"
            f"Homepage content:\n{body[:1000]}"
        )

    prompt = (
        f"Carefully analyze these {len(chunk)} hotel software websites based on their homepage content.\n"
        f"Respond EXACTLY one line per site:\n"
        f"SITE N: score=X category=Y\n\n"
        f"Categories: PMS, RMS, OTA, Channel Manager, Booking Engine, Unrelated\n"
        f"Score 9-10 only if clearly a software vendor with product features/pricing.\n\n"
        + "\n---\n".join(lines)
        + "\n\nRespond now:"
    )

    text    = ollama_call(STAGE2_MODEL, prompt, max_tokens=len(chunk) * 20 + 50)
    results = parse_results(text, len(chunk))

    to_save    = []
    saved_urls = []
    saved = rejected = 0

    for i, (score, cat) in enumerate(results):
        cat_low = cat.strip().lower()
        domain  = domains[i]

        if (score >= STAGE2_MIN_SCORE
                and cat_low in VALID_CATEGORIES
                and not domain_known_classified(db_pool, domain)):
            to_save.append((
                homepage_urls[i], domain, titles[i], snippets[i],
                contents[i], cat.strip(), score, raw_ids[i]
            ))
            saved_urls.append(homepage_urls[i])
            saved += 1
        else:
            rejected += 1

    save_classified(db_pool, to_save)
    mark_done(db_pool, "stage2_done", "filtered_site_id", fids)
    stats.s2(len(chunk), saved, rejected, saved_urls)


async def stage2_loop(db_pool, stats):
    loop = asyncio.get_event_loop()
    while True:
        rows = get_stage2_batch(db_pool)
        if not rows:
            await asyncio.sleep(10)
            continue

        chunks = [rows[i:i+STAGE2_BATCH_SIZE] for i in range(0, len(rows), STAGE2_BATCH_SIZE)]

        tasks = [
            loop.run_in_executor(None, stage2_process_chunk, chunk, db_pool, stats)
            for chunk in chunks[:STAGE2_PARALLEL]
        ]
        await asyncio.gather(*tasks)


# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════
async def main():
    console = Console()
    console.print("[bold magenta]🏨  Hotel Software Classifier v2[/]")
    console.print(f"  Stage 1: [cyan]{STAGE1_MODEL}[/] — title + snippet, batch={STAGE1_BATCH_SIZE}x{STAGE1_PARALLEL}")
    console.print(f"  Stage 2: [cyan]{STAGE2_MODEL}[/] — homepage content, batch={STAGE2_BATCH_SIZE}x{STAGE2_PARALLEL}")

    db_pool = init_db()
    console.print("[green]✓[/] БД подключена, дубли доменов очищены")

    try:
        requests.get("http://localhost:11434", timeout=3)
        console.print("[green]✓[/] Ollama запущена")
    except:
        console.print("[red]✗[/] Ollama недоступна! Запусти: ollama serve")
        return

    stats = Stats()
    threading.Thread(target=run_dashboard, args=(stats,), daemon=True).start()
    time.sleep(0.5)

    await asyncio.gather(
        stage1_loop(db_pool, stats),
        stage2_loop(db_pool, stats),
    )


if __name__ == "__main__":
    asyncio.run(main())