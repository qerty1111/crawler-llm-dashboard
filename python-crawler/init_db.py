try:
    import psycopg2
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False

from config import DB_CONFIG

def init_all_tables():
    print(f"[DB] Проверка параметров подключения ({DB_CONFIG['host']}:{DB_CONFIG['port']} / {DB_CONFIG['dbname']})...")
    if not HAS_PSYCOPG2:
        print("[DB Notice] [!] Библиотека psycopg2 не установлена. Для работы с PostgreSQL выполните: pip install -r requirements.txt")
        return False

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()

        # 0. Таблица пользователей (Аутентификация & Авторизация)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            SERIAL PRIMARY KEY,
                email         VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                salt          VARCHAR(255) NOT NULL,
                full_name     VARCHAR(255),
                role          VARCHAR(50) DEFAULT 'user',
                created_at    TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        """)

        # 1. Таблица сырых найденных доменов
        cur.execute("""
            CREATE TABLE IF NOT EXISTS raw_sites (
                id       SERIAL PRIMARY KEY,
                url      TEXT UNIQUE NOT NULL,
                title    TEXT,
                snippet  TEXT,
                query    TEXT,
                found_at TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_raw_url ON raw_sites(url);
        """)

        # 2. Таблица отфильтрованных сайтов (Stage 1)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS filtered_sites (
                id           SERIAL PRIMARY KEY,
                url          TEXT UNIQUE NOT NULL,
                title        TEXT,
                snippet      TEXT,
                stage1_score NUMERIC,
                reasoning    TEXT,
                category     TEXT,
                created_at   TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_filtered_url ON filtered_sites(url);
        """)

        # 3. Таблица итоговых классифицированных B2B вендоров (Stage 2)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS classified_sites (
                id           SERIAL PRIMARY KEY,
                url          TEXT UNIQUE NOT NULL,
                title        TEXT,
                snippet      TEXT,
                html_summary TEXT,
                stage2_score NUMERIC,
                category     TEXT,
                reasoning    TEXT,
                classified_at TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_classified_url ON classified_sites(url);
        """)

        conn.commit()
        print("[DB] [OK] Все таблицы (users, raw_sites, filtered_sites, classified_sites) успешно созданы и готовы к работе!")

        # Вывод статистики
        cur.execute("SELECT COUNT(*) FROM users;")
        users_cnt = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM raw_sites;")
        raw_cnt = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM filtered_sites;")
        filt_cnt = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM classified_sites;")
        class_cnt = cur.fetchone()[0]

        print(f"[DB Status] users: {users_cnt} | raw_sites: {raw_cnt} | filtered_sites: {filt_cnt} | classified_sites: {class_cnt}")

        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"[DB Notice] Информация о подключении к PostgreSQL: {e}")
        return False

if __name__ == "__main__":
    init_all_tables()
