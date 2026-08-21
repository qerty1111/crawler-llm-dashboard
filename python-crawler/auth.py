import os
import time
import json
import base64
import hashlib
import hmac
import secrets

try:
    import psycopg2
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False

from config import DB_CONFIG

SECRET_KEY = os.getenv("SECRET_KEY", "super_secret_jwt_key_change_me_in_production_2026")

# ─── PASSWORD SECURITY ───────────────────────────────────────
def hash_password(password: str, salt: str = None):
    """Хеширует пароль с помощью PBKDF2 (SHA-256) и случайной соли."""
    if not salt:
        salt = secrets.token_hex(16)
    pwd_hash = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    ).hex()
    return pwd_hash, salt

def verify_password(password: str, pwd_hash: str, salt: str) -> bool:
    """Проверяет соответствие введенного пароля сохраненному хешу."""
    check_hash, _ = hash_password(password, salt)
    return hmac.compare_digest(check_hash, pwd_hash)

# ─── TOKEN GENERATION (JWT) ──────────────────────────────────
def create_access_token(user_id: int, email: str, role: str = 'user', expires_in_days: int = 7) -> str:
    """Генерирует JWT токен авторизации на указанное количество дней."""
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "exp": int(time.time()) + (86400 * expires_in_days)
    }

    b64_header = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip('=')
    b64_payload = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip('=')

    sig_input = f"{b64_header}.{b64_payload}".encode('utf-8')
    signature = hmac.new(SECRET_KEY.encode('utf-8'), sig_input, hashlib.sha256).digest()
    b64_sig = base64.urlsafe_b64encode(signature).decode().rstrip('=')

    return f"{b64_header}.{b64_payload}.{b64_sig}"

def decode_access_token(token: str):
    """Проверяет подпись токена и возвращает данные пользователя (payload)."""
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        b64_header, b64_payload, b64_sig = parts

        sig_input = f"{b64_header}.{b64_payload}".encode('utf-8')
        expected_sig = hmac.new(SECRET_KEY.encode('utf-8'), sig_input, hashlib.sha256).digest()

        # Padding restore
        rem = len(b64_sig) % 4
        if rem > 0:
            b64_sig += '=' * (4 - rem)

        actual_sig = base64.urlsafe_b64decode(b64_sig.encode('utf-8'))
        if not hmac.compare_digest(expected_sig, actual_sig):
            print("[Auth Error] Токен не прошел проверку подписи!")
            return None

        rem_p = len(b64_payload) % 4
        if rem_p > 0:
            b64_payload += '=' * (4 - rem_p)

        payload = json.loads(base64.urlsafe_b64decode(b64_payload.encode('utf-8')).decode('utf-8'))
        if payload.get("exp", 0) < time.time():
            print("[Auth Error] Срок действия токена истек!")
            return None

        return payload
    except Exception as e:
        print(f"[Auth Error] Ошибка проверки токена: {e}")
        return None

# ─── DATABASE USER REGISTRATION & LOGIN ─────────────────────
def register_user(email: str, password: str, full_name: str = "", role: str = "user"):
    """Регистрирует нового пользователя в базе данных PostgreSQL."""
    email = email.strip().lower()
    if not email or "@" not in email:
        return False, "Некорректный email адрес"
    if len(password) < 6:
        return False, "Пароль должен содержать минимум 6 символов"

    if not HAS_PSYCOPG2:
        return False, "Библиотека psycopg2 не установлена"

    pwd_hash, salt = hash_password(password)

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO users (email, password_hash, salt, full_name, role)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id;
        """, (email, pwd_hash, salt, full_name, role))
        user_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()

        token = create_access_token(user_id, email, role)
        print(f"[Auth SUCCESS] Пользователь {email} успешно зарегистрирован (ID: {user_id})!")
        return True, {"user_id": user_id, "email": email, "role": role, "token": token}
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            return False, f"Пользователь с email {email} уже зарегистрирован!"
        return False, f"Ошибка базы данных: {e}"

def login_user(email: str, password: str):
    """Авторизует пользователя по email и паролю."""
    email = email.strip().lower()
    if not HAS_PSYCOPG2:
        return False, "Библиотека psycopg2 не установлена"

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        cur.execute("""
            SELECT id, password_hash, salt, full_name, role FROM users WHERE email = %s;
        """, (email,))
        row = cur.fetchone()
        cur.close()
        conn.close()

        if not row:
            return False, "Пользователь с таким email не найден!"

        user_id, pwd_hash, salt, full_name, role = row
        if not verify_password(password, pwd_hash, salt):
            return False, "Неверный пароль!"

        token = create_access_token(user_id, email, role)
        print(f"[Auth SUCCESS] Пользователь {email} успешно вошел в систему!")
        return True, {"user_id": user_id, "email": email, "full_name": full_name, "role": role, "token": token}
    except Exception as e:
        return False, f"Ошибка базы данных: {e}"
