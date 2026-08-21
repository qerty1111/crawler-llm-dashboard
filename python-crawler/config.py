import os
from pathlib import Path

# Load .env file if present
env_file = Path(__file__).parent / ".env"
if env_file.exists():
    with open(env_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip())

DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "port":     int(os.getenv("DB_PORT", "5432")),
    "dbname":   os.getenv("DB_NAME", "crawler"),
    "user":     os.getenv("DB_USER", "crawler_user"),
    "password": os.getenv("DB_PASSWORD", "somepassword"),
}

OLLAMA_URL       = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
STAGE1_MODEL     = os.getenv("STAGE1_MODEL", "llama3.2:3b")
STAGE2_MODEL     = os.getenv("STAGE2_MODEL", "llama3.1:8b")

PAGES_PER_QUERY       = int(os.getenv("PAGES_PER_QUERY", "20"))
QUERIES_FILE          = os.getenv("QUERIES_FILE", "queries_flat.txt")
PROXIES_FILE          = os.getenv("PROXIES_FILE", "proxies.txt")
PROXIES_VERIFIED_FILE = os.getenv("PROXIES_VERIFIED_FILE", "proxies_verified.txt")
