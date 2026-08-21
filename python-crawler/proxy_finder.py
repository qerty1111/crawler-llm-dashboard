# test_proxies.py
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from ddgs import DDGS

PROXIES = """http://91.242.229.129:8092
http://178.156.224.42:3128
http://220.121.143.33:3128
http://113.160.132.26:8080
http://217.182.195.221:30000
http://34.71.229.255:3128
http://38.211.245.18:999
http://200.174.198.32:8888
http://47.83.168.191:4000
http://38.211.245.54:999
http://181.78.44.63:999
http://45.59.122.132:80
http://38.211.245.91:999
http://181.119.97.24:999
http://190.217.17.10:999
http://5.161.50.82:8118
http://45.173.12.140:1994
http://177.234.217.237:999
http://177.234.217.84:999
http://20.27.14.220:8561
http://103.245.96.161:3214
http://20.164.75.153:8080
http://179.1.113.129:999
http://103.161.69.233:2698
http://103.30.31.209:32323
http://2.78.60.10:3129
http://38.211.245.93:999
http://38.188.247.12:999
http://38.211.245.55:999
http://109.224.242.26:8080
http://38.211.245.51:999
http://186.97.200.214:999
http://190.210.62.131:8080
http://179.1.126.25:999
http://186.5.94.206:999
http://20.27.13.35:8561
http://103.184.67.117:8080
http://190.217.19.121:999
http://181.129.185.132:999
http://174.114.24.95:3128
http://181.78.195.137:999
http://45.71.186.214:999
http://38.211.245.82:999
http://45.125.67.37:8443
http://38.211.245.90:999
http://177.234.217.88:999
http://38.172.160.160:999""".strip().splitlines()

working = []
lock = threading.Lock()

def test(proxy):
    try:
        t0 = time.time()
        r = DDGS(proxy=proxy, timeout=6).text("hotel software", max_results=3, backend="google")
        latency = time.time() - t0
        if r:
            with lock:
                working.append((proxy, latency))
                print(f"  ✅ {proxy} ({latency:.1f}s)")
            return
    except:
        pass
    print(f"  ❌ {proxy}")

print(f"Тестируем {len(PROXIES)} прокси...")
with ThreadPoolExecutor(max_workers=47) as ex:
    list(ex.map(test, PROXIES))

working.sort(key=lambda x: x[1])
print(f"\nРабочих: {len(working)}")
for p, l in working:
    print(f"  {p} ({l:.1f}s)")

if working:
    with open("proxies_verified.txt", "w") as f:
        for p, _ in working:
            f.write(p + "\n")
    print(f"\nСохранено в proxies_verified.txt")