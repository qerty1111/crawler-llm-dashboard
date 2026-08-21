import argparse
import sys
import os
from config import DB_CONFIG, PROXIES_FILE, PROXIES_VERIFIED_FILE
from init_db import init_all_tables
from auth import register_user, login_user, decode_access_token

def check_proxies_status():
    print(f"[Proxy] Проверка файла прокси ({PROXIES_FILE})...")
    raw_proxies = []
    if os.path.exists(PROXIES_FILE):
        with open(PROXIES_FILE, 'r', encoding='utf-8') as f:
            raw_proxies = [l.strip() for l in f if l.strip() and not l.startswith('#')]
    print(f"[Proxy] Найдено {len(raw_proxies)} прокси в {PROXIES_FILE}")

    ver_proxies = []
    if os.path.exists(PROXIES_VERIFIED_FILE):
        with open(PROXIES_VERIFIED_FILE, 'r', encoding='utf-8') as f:
            ver_proxies = [l.strip() for l in f if l.strip() and not l.startswith('#')]
    print(f"[Proxy] Загружено {len(ver_proxies)} проверенных прокси в {PROXIES_VERIFIED_FILE}")

def main():
    parser = argparse.ArgumentParser(description="Главный управляющий бэкенд-скрипт (Crawler, LLM Classifier & Auth System)")
    parser.add_argument("--init-db", action="store_true", help="Инициализировать таблицы в базе данных PostgreSQL (включая users)")
    parser.add_argument("--status", action="store_true", help="Показать текущий статус БД, пользователей и прокси")
    parser.add_argument("--check-proxies", action="store_true", help="Проверить работоспособность прокси в файле")

    # Регистрация и Вход
    parser.add_argument("--register", action="store_true", help="Зарегистрировать нового пользователя")
    parser.add_argument("--login", action="store_true", help="Войти в систему под пользователем")
    parser.add_argument("--email", type=str, help="Email пользователя для входа/регистрации")
    parser.add_argument("--password", type=str, help="Пароль пользователя для входа/регистрации")
    parser.add_argument("--name", type=str, default="", help="Имя пользователя (при регистрации)")
    parser.add_argument("--role", type=str, default="user", help="Роль пользователя (admin, analyst, user)")

    args = parser.parse_args()

    if len(sys.argv) == 1:
        parser.print_help()
        print("\nПримеры команд регистрации и входа:")
        print("  python run_pipeline.py --register --email user@example.com --password secret123 --name 'Иван Иванов'")
        print("  python run_pipeline.py --login --email user@example.com --password secret123")
        print("  python run_pipeline.py --status")
        print("  python run_pipeline.py --init-db")
        sys.exit(0)

    if args.register:
        if not args.email or not args.password:
            print("[Error] Для регистрации укажите --email и --password!")
            sys.exit(1)
        ok, res = register_user(args.email, args.password, args.name, args.role)
        if ok:
            print(f"[SUCCESS] Пользователь успешно зарегистрирован!")
            print(f"  ID: {res['user_id']}")
            print(f"  Email: {res['email']}")
            print(f"  Role: {res['role']}")
            print(f"  JWT Token: {res['token']}")
        else:
            print(f"[FAIL] Ошибка регистрации: {res}")
        return

    if args.login:
        if not args.email or not args.password:
            print("[Error] Для входа укажите --email и --password!")
            sys.exit(1)
        ok, res = login_user(args.email, args.password)
        if ok:
            print(f"[SUCCESS] Авторизация успешна!")
            print(f"  Email: {res['email']}")
            print(f"  Имя: {res['full_name']}")
            print(f"  Роль: {res['role']}")
            print(f"  JWT Token: {res['token']}")
        else:
            print(f"[FAIL] Ошибка входа: {res}")
        return

    if args.init_db or args.status:
        init_all_tables()

    if args.check_proxies or args.status:
        check_proxies_status()

if __name__ == "__main__":
    main()
