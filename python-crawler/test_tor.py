import psycopg2
import time
import os

DB_CONFIG = {
    "host": "185.86.76.127", "port": 5432,
    "dbname": "crawler", "user": "crawler_user", "password": "somepassword",
}


def get_stats():
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM classified_sites")
    total = cur.fetchone()[0]

    cur.execute("SELECT category, COUNT(*) FROM classified_sites GROUP BY category ORDER BY COUNT(*) DESC")
    cats = cur.fetchall()

    cur.execute("SELECT COUNT(*) FROM filtered_sites")
    filtered = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM raw_sites_targeted")
    raw = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM s1_done")
    s1_done = cur.fetchone()[0]

    conn.close()
    return total, cats, filtered, raw, s1_done


start = time.time()
prev_total = 0

while True:
    os.system("clear")
    total, cats, filtered, raw, s1_done = get_stats()
    e = time.time() - start
    speed = (total - prev_total) / 2 if prev_total else 0
    prev_total = total

    print("=" * 45)
    print("  🏨  HOTEL SOFTWARE FINDER  —  LIVE")
    print("=" * 45)
    print(f"  ⏱  Время:          {int(e // 3600):02d}:{int((e % 3600) // 60):02d}:{int(e % 60):02d}")
    print(f"  📦  Raw targeted:   {raw:,}")
    print(f"  ✅  S1 проверено:   {s1_done:,}")
    print(f"  🔍  Filtered:       {filtered:,}")
    print(f"  🏆  ФИНАЛЬНЫХ:      {total:,}  (+{speed:.1f}/2сек)")
    print("-" * 45)
    print("  По категориям:")
    icons = {"PMS": "🏠", "Channel Manager": "📡", "Booking Engine": "🎟", "RMS": "📋", "OTA": "✈️"}
    for cat, cnt in cats:
        icon = icons.get(cat, "•")
        bar = "█" * (cnt // 5)
        print(f"  {icon}  {cat:<18} {cnt:>4}  {bar}")
    print("=" * 45)

    time.sleep(2)