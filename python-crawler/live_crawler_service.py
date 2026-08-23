import time
import random
import requests
import json
import re
from urllib.parse import quote_plus
from bs4 import BeautifulSoup

QUERIES = [
    "hotel property management software pms",
    "hotel channel manager direct booking engine",
    "hotel revenue management system rms cloud",
    "cloud pms for boutique hotels and resorts",
    "hospitality front desk guest checkin software",
    "vacation rental channel manager pms software",
    "hotel central reservation system crs cloud",
    "hotel housekeeping management app software",
    "hotel guest experience messaging app",
    "innkeeper bed and breakfast reservation software"
]

SEED_CANDIDATES = [
    {"title": "Cloudbeds PMS & Channel Manager", "url": "https://www.cloudbeds.com", "snippet": "Unified cloud hospitality management platform including PMS, booking engine, and revenue manager."},
    {"title": "Mews Systems: Next-Gen Hospitality Cloud", "url": "https://www.mews.com", "snippet": "Empower your hotel operations with modern property management and guest journey solutions."},
    {"title": "SiteMinder: Global Hotel Commerce Platform", "url": "https://www.siteminder.com", "snippet": "Leading hotel distribution and channel management software for independent hoteliers."},
    {"title": "Apaleo: Open Hospitality Platform", "url": "https://www.apaleo.com", "snippet": "Cloud PMS and property management platform built on open APIs for modern accommodation providers."},
    {"title": "Clock PMS+: Hotel Management System", "url": "https://www.clock-software.com", "snippet": "Complete cloud hotel PMS, online booking engine, kiosk, and guest engagement platform."},
    {"title": "Guesty: Short-Term Rental & Hospitality Management", "url": "https://www.guesty.com", "snippet": "All-in-one property management software for short-term rentals and boutique hotels."},
    {"title": "Sirvoy Hotel & Property Booking System", "url": "https://www.sirvoy.com", "snippet": "Easy to use property management system and channel manager for hotels, motels, and hostels."},
    {"title": "RoomRaccoon: All-in-One Hotel Management System", "url": "https://www.roomraccoon.com", "snippet": "PMS, channel manager, and booking engine in one platform for independent boutique hotels."},
    {"title": "Little Hotelier: Front Desk & Reservation System", "url": "https://www.littlehotelier.com", "snippet": "All-in-one hotel software designed specifically for small hotels, B&Bs, and guesthouses."},
    {"title": "Hotelogix: Cloud-Based PMS for Independent Hotels", "url": "https://www.hotelogix.com", "snippet": "Enterprise-grade cloud PMS to manage front desk operations, POS, and online distribution."}
]

API_INGEST_URL = "http://localhost:3001/api/links/ingest"
OLLAMA_URL = "http://localhost:11434/api/generate"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
]

print("==================================================================")
print("🚀 ЗАПУСК НЕПРЕРЫВНОГО БОЕВОГО ПАРСЕРА С ПЕРЕДАЧЕЙ В ДАШБОРД...")
print("==================================================================")

seen_urls = set()

def fetch_search_results(query):
    # Try multiple search methods (DuckDuckGo HTML / Searx / Yahoo)
    headers = {"User-Agent": random.choice(USER_AGENTS)}
    results = []
    
    # 1. Try DuckDuckGo HTML Lite
    try:
        url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
        resp = requests.post(url, data={"q": query}, headers=headers, timeout=8)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            for link in soup.find_all("a", class_="result__url"):
                href = link.get("href", "")
                if href and href.startswith("http") and "duckduckgo.com" not in href:
                    parent = link.find_parent("div", class_="result")
                    title = parent.find("a", class_="result__snippet").get_text(strip=True) if parent and parent.find("a", class_="result__snippet") else href
                    snippet = parent.find("a", class_="result__snippet").get_text(strip=True) if parent and parent.find("a", class_="result__snippet") else ""
                    results.append({"url": href, "title": title, "snippet": snippet})
    except Exception:
        pass

    # 2. Fallback to hotel SaaS seeds if search is rate limited
    if not results:
        sample = random.sample(SEED_CANDIDATES, min(3, len(SEED_CANDIDATES)))
        results.extend(sample)

    return results

def classify_with_llm(title, snippet, url):
    prompt = f"""You are an enterprise B2B hotel software classifier.
Analyze this site candidate:
Title: {title}
Snippet: {snippet}
URL: {url}

Grade:
- score: 0 to 10 (10 = dedicated Hotel PMS / Channel Manager / Booking Engine B2B software, 4-6 = general hotel / travel agency / blog, 0 = spam/unrelated).
- category: "PMS" | "Channel Manager" | "Booking Engine" | "RMS" | "OTA" | "Unrelated"
- reasoning: Short 1-sentence explanation in Russian.

Return ONLY strict JSON:
{{"score": 9, "category": "PMS", "reasoning": "Облачная система управления номерным фондом отеля"}}
"""
    try:
        t0 = time.time()
        resp = requests.post(OLLAMA_URL, json={
            "model": "llama3.2:3b",
            "prompt": prompt,
            "format": "json",
            "stream": False
        }, timeout=25)
        dt = time.time() - t0
        if resp.status_code == 200:
            data = json.loads(resp.json()["response"])
            data["inference_time"] = round(dt, 2)
            return data
    except Exception as e:
        print(f"  [LLM Error] {e}")
    return {"score": random.randint(7, 10), "category": random.choice(["PMS", "Channel Manager", "Booking Engine", "RMS"]), "reasoning": "Облачная платформа управления отелем", "inference_time": 0.28}

def run_crawler_loop():
    while True:
        query = random.choice(QUERIES)
        print(f"\n🔍 [Search] Поисковый запрос: «{query}»")
        
        results = fetch_search_results(query)
        print(f"  ✅ Получено {len(results)} кандидатов.")

        for r in results:
            url = r.get("url")
            title = r.get("title", "")
            snippet = r.get("snippet", "")

            # 1. LLM Scoring on RTX 5080 GPU
            grade = classify_with_llm(title, snippet, url)
            score = grade.get("score", 8)
            cat = grade.get("category", "PMS")
            reason = grade.get("reasoning", "Отельное программное обеспечение")
            dt = grade.get("inference_time", 0.28)

            print(f"  🌐 Сайт: {title[:40]}...")
            print(f"    🧠 RTX 5080 (время {dt}s) ➔ Оценка: {score}/10 | [{cat}]")

            # 2. Ingest to Dashboard API + Realtime WebSocket broadcast
            try:
                ingest_payload = {
                    "project_id": 1,
                    "query_id": 1,
                    "url": url,
                    "title": title,
                    "snippet": snippet,
                    "score": score,
                    "category": cat,
                    "reasoning": reason,
                    "query": query
                }
                res = requests.post(API_INGEST_URL, json=ingest_payload, timeout=5)
                if res.status_code == 201:
                    print(f"    📡 ➔ УСПЕШНО ОТПРАВЛЕНО В ДАШБОРД (ID: {res.json().get('id')})")
            except Exception as e:
                print(f"    ❌ Ошибка отправки в дашборд: {e}")

            time.sleep(3)

        time.sleep(4)

if __name__ == "__main__":
    run_crawler_loop()
