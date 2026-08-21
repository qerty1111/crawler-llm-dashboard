"""
scorer.py — двухэтапный классификатор отельного ПО
==================================================
Этап 1: llama3.1:8b  — title+snippet → JSON {score, category, reasoning}
        Порог >= 6 → попадает в filtered_sites

Этап 2: llama3.1:8b  — открывает ГЛАВНУЮ страницу → JSON {score, category, reasoning}
        Порог >= 7 → попадает в classified_sites

8 инстансов Ollama на портах 11434-11441
"""

import json
import threading
import time
import re
import itertools
import queue
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor
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
from rich.layout import Layout
from rich.align import Align
from rich.text import Text
from rich import box

# ══════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════
MODEL         = "llama3.1:8b"
OLLAMA_PORTS  = [11434, 11435, 11436, 11437, 11438, 11439, 11440, 11441]
WORKERS       = 32        # параллельных воркеров
BATCH_SIZE    = 20        # доменов в одном батче (этап 1)
FETCH_SIZE    = 1000      # берём из БД за раз
PAGE_TIMEOUT  = 12
PAGE_WORKERS  = 40        # параллельных загрузок страниц
S1_MIN_SCORE  = 6
S2_MIN_SCORE  = 7
TIMEOUT       = 90        # таймаут Ollama

DB_CONFIG = {
    "host": "185.86.76.127", "port": 5432,
    "dbname": "crawler", "user": "crawler_user", "password": "somepassword",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.5",
}

SKIP_PATTERNS = [
    "bing.com/aclick", "google.com/aclk", "youtube.com", "facebook.com",
    "twitter.com", "instagram.com", "linkedin.com", "wikipedia.org",
    "reddit.com", "amazon.com", "tripadvisor.com", "booking.com",
    "expedia.com", "airbnb.com", "trustpilot.com", "capterra.com",
    "g2.com", "pinterest.com", "tiktok.com", "softwareadvice.com",
    "getapp.com", "sourceforge.net", "quora.com", "yahoo.com",
    "budget.com", "hertz.com", "hotels.com", "agoda.com",
    "kayak.com", "priceline.com", "trivago.com", "hoteltechreport.com",
    "thehotelgm.com", "selecthub.com", "worldmetrics.org",
]

VALID_CATS = {"pms", "rms", "ota", "channel manager", "booking engine"}

# ══════════════════════════════════════════════
# ПРОМПТЫ (взяты из рабочей версии апрель 2026)
# ══════════════════════════════════════════════

REFERENCE_SITES = """
HotelWeb (hotelweb.io) — PMS для малых отелей
Weltraum PMS (weltraumsoft.com) — Property Management System для отелей
RezEasy (hallisoft.com) — Reservation Management System
Noovy (noovy.com) — PMS для бутик-отелей
HotelFriend (hotelfriend.com) — PMS + Booking Engine
MiniHotel (minihotel.us) — мини PMS для хостелов
OtelMS (otelms.com) — система управления отелями
NOBEDS (nobeds.com) — Channel Manager + PMS
HotelBee (hotelbee.co) — PMS + Channel Manager
Roomsy (roomsy.com) — PMS для малых отелей
Loggro Alojamientos (loggro.com) — управление размещением
Hosroom (hosroom.com) — система управления хостелом
Cloudbeds (cloudbeds.com) — PMS + Channel Manager + Booking Engine
Mews (mews.com) — облачный PMS
Siteminder (siteminder.com) — Channel Manager
Little Hotelier (littlehotelier.com) — PMS для малых объектов
eviivo (eviivo.com) — PMS + Channel Manager для B&B
WebRezPro (webrezpro.com) — PMS для отелей и хостелов
Sirvoy (sirvoy.com) — Booking Engine + Channel Manager
eZee Absolute (ezeefrontdesk.com) — PMS для отелей
RMS Cloud (rmscloud.com) — PMS + RMS
"""

# Промпт этапа 1 — быстрый по title+snippet
S1_PROMPT = """You are an expert in hotel technology and hospitality software.

Your task: evaluate whether a website is a VENDOR of hotel software.

We are looking for software in these categories ONLY:
- PMS (Property Management System): software hotels use for daily operations, check-in/out, room management, billing
- RMS (Reservation Management System): software for managing hotel reservations and availability
- OTA (Online Travel Agency platform): B2B software platform for hotel distribution — NOT consumer booking sites like booking.com
- Channel Manager: software connecting hotel to online booking channels (Booking.com, Expedia etc)
- Booking Engine: software/widget for direct bookings on hotel's own website

Reference examples of IDEAL vendors:
{references}

NOT what we want:
- Consumer booking sites (booking.com, expedia, hotels.com, agoda)
- Hotel chains (marriott, hilton, ibis) — they USE software, don't sell it
- Review/comparison sites (tripadvisor, hoteltechreport, capterra)
- Car rental, airlines, restaurants
- General HR, accounting, CRM not specific to hotels
- Travel blogs, news, press releases

Evaluate this site:
- Domain: {domain}
- Page title: {title}
- Description: {description}

Score from 0 to 10:
- 9-10: Clear hotel software vendor (PMS, channel manager, booking engine, RMS, OTA platform)
- 7-8:  Likely hotel tech vendor, some uncertainty
- 5-6:  Hospitality related but unclear if software vendor
- 3-4:  Generic software or tangentially related
- 1-2:  Unrelated to hotel software
- 0:    Spam, aggregator, review site, social media, consumer booking

Category (pick one): PMS, Channel Manager, Booking Engine, RMS, OTA, Unrelated

Respond ONLY with valid JSON, no extra text:
{{"score": <0-10>, "category": "<category>", "reasoning": "<1 sentence in English>"}}"""

# Промпт этапа 2 — детальный по контенту главной страницы
S2_PROMPT = """You are an expert in hotel technology and hospitality software.

Your task: carefully analyze this hotel software website based on its homepage content.

We are looking ONLY for B2B software vendors in these categories:
- PMS (Property Management System): software hotels use for daily operations, check-in/out, room management, billing, guest profiles
- RMS (Reservation Management System): software specifically for managing hotel reservations and availability calendars
- OTA (Online Travel Agency platform): B2B software platform for hotel distribution — NOT consumer booking sites
- Channel Manager: software connecting hotel to multiple online booking channels simultaneously
- Booking Engine: widget/software installed on hotel's own website for direct bookings

Reference examples of CONFIRMED vendors:
{references}

STRICT RULES — score 1-4 for:
- Consumer booking sites where travelers book rooms (booking.com, expedia style)
- Hotel chains that USE software but don't sell it
- Review/aggregator/comparison sites
- Car rental, restaurants, spas, event venues
- General business software not specific to hotels
- Travel agencies (unless they sell B2B platform)
- Job boards, news, directories

Analyze this website:
- URL: {url}
- Title: {title}
- Homepage content: {content}

Score from 0 to 10:
- 9-10: Confirmed hotel software vendor — clearly sells PMS/RMS/OTA/Channel Manager/Booking Engine
- 7-8:  Very likely hotel software vendor
- 5-6:  Possibly related, some doubt
- 1-4:  Not a hotel software vendor

Category (pick one): PMS, Channel Manager, Booking Engine, RMS, OTA, Unrelated

Respond ONLY with valid JSON, no extra text:
{{"score": <0-10>, "category": "<category>", "reasoning": "<1 sentence in English>"}}"""


# ══════════════════════════════════════════════
# PORT ROTATION
# ══════════════════════════════════════════════
_port_cycle = itertools.cycle(OLLAMA_PORTS)
_port_lock  = threading.Lock()

def next_port():
    with _port_lock:
        return next(_port_cycle)


# ══════════════════════════════════════════════
# OLLAMA
# ══════════════════════════════════════════════
def ask_ollama(prompt: str) -> tuple:
    port = next_port()
    url  = f"http://localhost:{port}/api/generate"
    try:
        resp = requests.post(url, json={
            "model": MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": 120},
        }, timeout=TIMEOUT)
        raw = resp.json().get("response", "").strip()
        start = raw.find("{")
        end   = raw.rfind("}") + 1
        if start != -1 and end > start:
            data      = json.loads(raw[start:end])
            score     = max(0, min(10, float(data.get("score", 0))))
            category  = str(data.get("category", "Unknown"))[:40]
            reasoning = str(data.get("reasoning", ""))[:200]
            return score, category, reasoning
    except Exception as e:
        return 0.0, "error", str(e)[:80]
    return 0.0, "error", "no response"


# ══════════════════════════════════════════════
# DATABASE
# ══════════════════════════════════════════════
def init_db():
    pool = psycopg2.pool.ThreadedConnectionPool(4, 60, **DB_CONFIG)
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            # Этап 1 результаты
            cur.execute("""
                CREATE TABLE IF NOT EXISTS filtered_sites (
                    id              SERIAL PRIMARY KEY,
                    raw_site_id     INTEGER UNIQUE,
                    url             TEXT NOT NULL,
                    domain          TEXT,
                    title           TEXT,
                    snippet         TEXT,
                    s1_score        FLOAT,
                    s1_category     TEXT,
                    s1_reasoning    TEXT,
                    created_at      TIMESTAMP DEFAULT NOW()
                )
            """)
            # Этап 2 финальные результаты
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
                    reasoning    TEXT,
                    raw_site_id  INTEGER,
                    found_at     TIMESTAMP DEFAULT NOW()
                )
            """)
            for q in [
                "CREATE INDEX IF NOT EXISTS idx_fs_raw    ON filtered_sites(raw_site_id)",
                "CREATE INDEX IF NOT EXISTS idx_fs_domain ON filtered_sites(domain)",
                "CREATE INDEX IF NOT EXISTS idx_cs_url    ON classified_sites(url)",
                "CREATE INDEX IF NOT EXISTS idx_cs_domain ON classified_sites(domain)",
                "CREATE INDEX IF NOT EXISTS idx_cs_cat    ON classified_sites(category)",
                "CREATE INDEX IF NOT EXISTS idx_cs_score  ON classified_sites(score DESC)",
                "CREATE TABLE IF NOT EXISTS s1_done (raw_site_id INTEGER PRIMARY KEY)",
                "CREATE TABLE IF NOT EXISTS s2_done (filtered_id INTEGER PRIMARY KEY)",
                "ALTER TABLE raw_sites ADD COLUMN IF NOT EXISTS region TEXT",
                "ALTER TABLE filtered_sites ADD COLUMN IF NOT EXISTS s1_reasoning TEXT",
            ]:
                try: cur.execute(q)
                except: pass
        conn.commit()
    finally:
        pool.putconn(conn)
    return pool


def _skip_sql():
    return " AND ".join(f"r.url NOT LIKE '%%{p}%%'" for p in SKIP_PATTERNS)


def get_s1_batch(db_pool):
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT r.id, r.url, r.title, r.snippet
                FROM raw_sites r
                LEFT JOIN s1_done d ON r.id = d.raw_site_id
                WHERE d.raw_site_id IS NULL
                  AND r.snippet IS NOT NULL
                  AND length(trim(r.snippet)) > 20
                  AND {_skip_sql()}
                ORDER BY r.id ASC
                LIMIT %s
            """, (FETCH_SIZE,))
            return cur.fetchall()
    finally:
        db_pool.putconn(conn)


def mark_s1_done(db_pool, ids):
    if not ids: return
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.executemany("INSERT INTO s1_done VALUES (%s) ON CONFLICT DO NOTHING", [(i,) for i in ids])
        conn.commit()
    except: pass
    finally: db_pool.putconn(conn)


def get_domain(url):
    try:
        d = urlparse(url).netloc.lower()
        return d[4:] if d.startswith("www.") else d
    except: return ""


def domain_in_classified(db_pool, domain):
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM classified_sites WHERE domain=%s LIMIT 1", (domain,))
            return cur.fetchone() is not None
    finally:
        db_pool.putconn(conn)


def domain_in_filtered(db_pool, domain):
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM filtered_sites WHERE domain=%s LIMIT 1", (domain,))
            return cur.fetchone() is not None
    finally:
        db_pool.putconn(conn)


def save_filtered(db_pool, rows):
    if not rows: return 0
    conn = db_pool.getconn(); saved = 0
    try:
        with conn.cursor() as cur:
            for raw_id, url, domain, title, snippet, score, cat, reason in rows:
                try:
                    cur.execute("""
                        INSERT INTO filtered_sites
                          (raw_site_id,url,domain,title,snippet,s1_score,s1_category,s1_reasoning)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (raw_site_id) DO NOTHING
                    """, (raw_id, url, domain, (title or "")[:300],
                          (snippet or "")[:500], score, cat, (reason or "")[:200]))
                    if cur.rowcount: saved += 1
                except: pass
        conn.commit()
    except: pass
    finally: db_pool.putconn(conn)
    return saved


def get_s2_batch(db_pool):
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT f.id, f.url, f.title, f.snippet, f.s1_category, f.raw_site_id, f.domain
                FROM filtered_sites f
                LEFT JOIN s2_done d ON f.id = d.filtered_id
                WHERE d.filtered_id IS NULL
                ORDER BY f.s1_score DESC, f.id ASC
                LIMIT %s
            """, (FETCH_SIZE,))
            return cur.fetchall()
    finally:
        db_pool.putconn(conn)


def mark_s2_done(db_pool, ids):
    if not ids: return
    conn = db_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.executemany("INSERT INTO s2_done VALUES (%s) ON CONFLICT DO NOTHING", [(i,) for i in ids])
        conn.commit()
    except: pass
    finally: db_pool.putconn(conn)


def save_classified(db_pool, rows):
    if not rows: return 0
    conn = db_pool.getconn(); saved = 0
    try:
        with conn.cursor() as cur:
            for url, domain, title, snippet, content, cat, score, reason, raw_id in rows:
                try:
                    cur.execute("""
                        INSERT INTO classified_sites
                          (url,domain,title,snippet,page_content,category,score,reasoning,raw_site_id)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT (url) DO NOTHING
                    """, (url, domain, (title or "")[:300], (snippet or "")[:500],
                          (content or "")[:3000], cat, score, (reason or "")[:300], raw_id))
                    if cur.rowcount: saved += 1
                except: pass
        conn.commit()
    except: pass
    finally: db_pool.putconn(conn)
    return saved


# ══════════════════════════════════════════════
# PAGE FETCHER
# ══════════════════════════════════════════════
def get_homepage(url):
    try:
        parsed = urlparse(url)
        homepage = f"{parsed.scheme}://{parsed.netloc}/"
        r = requests.get(homepage, headers=HEADERS, timeout=PAGE_TIMEOUT, allow_redirects=True)
        if r.status_code != 200: return ""
        if "text/html" not in r.headers.get("content-type", ""): return ""
        soup = BeautifulSoup(r.text, "html.parser")
        for tag in soup(["script","style","nav","footer","header","aside","form","iframe"]): tag.decompose()
        text = re.sub(r'\s+', ' ', soup.get_text(separator=" ", strip=True)).strip()
        return text[:3000]
    except:
        return ""


# ══════════════════════════════════════════════
# STATS
# ══════════════════════════════════════════════
class Stats:
    def __init__(self):
        self.lock   = threading.Lock()
        self.s1_total = self.s1_passed = self.s1_rejected = 0
        self.s2_total = self.s2_saved  = self.s2_rejected = 0
        self.start  = time.time()
        self.recent = deque(maxlen=10)
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
    e    = stats.elapsed()
    s1p  = f"{stats.s1_passed/max(stats.s1_total,1)*100:.0f}%"
    s2p  = f"{stats.s2_saved/max(stats.s2_total,1)*100:.0f}%"
    etah = stats.s1_total / max(e, 1) * 3600

    tbl = Table(box=box.SIMPLE, show_header=True, padding=(0,1))
    tbl.add_column("",                     style="bold cyan",  width=22)
    tbl.add_column("🚀 Stage 1\nsnippet",  style="white",      width=16, justify="right")
    tbl.add_column("🎯 Stage 2\nhomepage", style="white",      width=16, justify="right")

    tbl.add_row("⏱  Время",
        f"{int(e//3600):02d}:{int((e%3600)//60):02d}:{int(e%60):02d}", "")
    tbl.add_row("🔄 Обработано",  str(stats.s1_total),   str(stats.s2_total))
    tbl.add_row("✅ Прошло",
        f"[green]{stats.s1_passed}[/] [dim]({s1p})[/]",
        f"[green]{stats.s2_saved}[/] [dim]({s2p})[/]")
    tbl.add_row("❌ Отклонено",
        f"[red]{stats.s1_rejected}[/]",
        f"[red]{stats.s2_rejected}[/]")
    tbl.add_row("⚡ /сек (10s)",
        f"[bold green]{stats.speed(stats.s1_win):.1f}[/]",
        f"[bold green]{stats.speed(stats.s2_win):.1f}[/]")
    tbl.add_row("📈 /час (avg)",
        f"[bold green]{etah:.0f}[/]", "")

    rec = Table(box=box.SIMPLE, show_header=True, padding=(0,1))
    rec.add_column("🏆 Финальные результаты", style="dim cyan", width=55)
    with stats.lock: recent = list(stats.recent)
    for u in recent: rec.add_row(u[:55])
    for _ in range(10 - len(recent)): rec.add_row("")

    return Panel(
        Columns([tbl, rec], padding=(0,2)),
        title="[bold magenta]🏨  HOTEL SOFTWARE SCORER  ·  8x llama3.1:8b  ·  PMS·RMS·OTA·CM·BE[/]",
        border_style="bright_magenta",
    )


def run_dashboard(stats):
    console = Console()
    with Live(make_ui(stats), console=console, refresh_per_second=0.5, screen=True) as live:
        while True:
            time.sleep(2)
            live.update(make_ui(stats))


# ══════════════════════════════════════════════
# STAGE 1 WORKER
# ══════════════════════════════════════════════
def process_s1_batch(rows, db_pool, stats):
    ids      = [r[0] for r in rows]
    urls     = [r[1] for r in rows]
    titles   = [r[2] or "" for r in rows]
    snippets = [r[3] or "" for r in rows]

    # дедупликация по домену
    seen = set()
    valid = []
    for i, url in enumerate(urls):
        d = get_domain(url)
        if not d or d in seen: continue
        if domain_in_classified(db_pool, d): continue
        if domain_in_filtered(db_pool, d): continue
        seen.add(d)
        valid.append(i)

    mark_s1_done(db_pool, ids)

    if not valid:
        stats.s1(len(rows), 0, len(rows))
        return

    to_save = []
    passed = rejected = 0

    for i in valid:
        domain = get_domain(urls[i])
        prompt = S1_PROMPT.format(
            references=REFERENCE_SITES,
            domain=domain,
            title=(titles[i] or "")[:200],
            description=(snippets[i] or "")[:400],
        )
        score, category, reasoning = ask_ollama(prompt)
        cat_low = category.strip().lower()

        if score >= S1_MIN_SCORE and cat_low in VALID_CATS:
            to_save.append((ids[i], urls[i], domain, titles[i], snippets[i], score, category, reasoning))
            passed += 1
        else:
            rejected += 1

    save_filtered(db_pool, to_save)
    stats.s1(len(rows), passed, rejected)


def s1_worker(task_queue, db_pool, stats):
    while True:
        try:
            rows = task_queue.get(timeout=10)
        except:
            break
        process_s1_batch(rows, db_pool, stats)
        task_queue.task_done()


# ══════════════════════════════════════════════
# STAGE 2 WORKER
# ══════════════════════════════════════════════
def process_s2_batch(rows, db_pool, stats):
    fids    = [r[0] for r in rows]
    urls    = [r[1] for r in rows]
    titles  = [r[2] or "" for r in rows]
    snippets= [r[3] or "" for r in rows]
    s1cats  = [r[4] or "" for r in rows]
    raw_ids = [r[5] for r in rows]
    domains = [r[6] or get_domain(r[1]) for r in rows]

    # параллельно скачиваем главные страницы
    with ThreadPoolExecutor(max_workers=PAGE_WORKERS) as ex:
        contents = list(ex.map(get_homepage, urls))

    mark_s2_done(db_pool, fids)

    to_save    = []
    saved_urls = []
    saved = rejected = 0

    for i in range(len(rows)):
        prompt = S2_PROMPT.format(
            references=REFERENCE_SITES,
            url=urls[i],
            title=(titles[i] or "")[:200],
            content=(contents[i] or snippets[i] or "")[:2000],
        )
        score, category, reasoning = ask_ollama(prompt)
        cat_low = category.strip().lower()

        if score >= S2_MIN_SCORE and cat_low in VALID_CATS:
            to_save.append((
                urls[i], domains[i], titles[i], snippets[i],
                contents[i], category.strip(), score, reasoning, raw_ids[i]
            ))
            saved_urls.append(urls[i])
            saved += 1
        else:
            rejected += 1

    save_classified(db_pool, to_save)
    stats.s2(len(rows), saved, rejected, saved_urls)


def s2_worker(task_queue, db_pool, stats):
    while True:
        try:
            rows = task_queue.get(timeout=10)
        except:
            break
        process_s2_batch(rows, db_pool, stats)
        task_queue.task_done()


# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════
def main():
    console = Console()
    console.print("[bold magenta]🏨  Hotel Software Scorer  ·  8x llama3.1:8b[/]")
    console.print(f"  Порты Ollama: {OLLAMA_PORTS}")
    console.print(f"  Воркеров: {WORKERS}  ·  S1≥{S1_MIN_SCORE} → S2≥{S2_MIN_SCORE}")

    # проверяем Ollama
    ok_ports = []
    for port in OLLAMA_PORTS:
        try:
            requests.get(f"http://localhost:{port}", timeout=2)
            ok_ports.append(port)
        except:
            console.print(f"[yellow]⚠ порт {port} недоступен[/]")
    console.print(f"[green]✓[/] Ollama: {len(ok_ports)}/{len(OLLAMA_PORTS)} портов активны")

    db_pool = init_db()
    console.print("[green]✓[/] БД подключена")

    stats = Stats()
    threading.Thread(target=run_dashboard, args=(stats,), daemon=True).start()
    time.sleep(0.5)

    s1_queue = queue.Queue(maxsize=50)
    s2_queue = queue.Queue(maxsize=50)

    # воркеры этапа 1
    s1_threads = []
    for _ in range(WORKERS):
        t = threading.Thread(target=s1_worker, args=(s1_queue, db_pool, stats), daemon=True)
        t.start()
        s1_threads.append(t)

    # воркеры этапа 2
    s2_threads = []
    for _ in range(WORKERS):
        t = threading.Thread(target=s2_worker, args=(s2_queue, db_pool, stats), daemon=True)
        t.start()
        s2_threads.append(t)

    # главный цикл — подаём данные в обе очереди
    while True:
        # этап 1
        rows_s1 = get_s1_batch(db_pool)
        if rows_s1:
            for i in range(0, len(rows_s1), BATCH_SIZE):
                s1_queue.put(rows_s1[i:i+BATCH_SIZE])

        # этап 2
        rows_s2 = get_s2_batch(db_pool)
        if rows_s2:
            for i in range(0, len(rows_s2), BATCH_SIZE):
                s2_queue.put(rows_s2[i:i+BATCH_SIZE])

        if not rows_s1 and not rows_s2:
            time.sleep(5)


if __name__ == "__main__":
    main()