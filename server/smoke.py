#!/usr/bin/env python3
"""
Простой smoke-тест для API.

- Тянет /openapi.json
- Проверяет все GET/HEAD/OPTIONS ручки
- Подставляет заглушки в {id}, {uuid}, {date}
- Возвращает список проблемных ручек
"""

import os
import re
import sys
import json
import urllib.request
import urllib.error

BASE = os.getenv("BASE_URL", "http://localhost:8000").rstrip("/")
TOKEN = os.getenv("ACCESS_TOKEN")

HDRS = {"Accept": "application/json"}
if TOKEN:
    HDRS["Authorization"] = f"Bearer {TOKEN}"


def fetch(url):
    req = urllib.request.Request(url, headers=HDRS, method="GET")
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.read()


def sub_path_params(path: str) -> str:
    """Подставляем заглушки для {param}"""
    def repl(m):
        name = m.group(1).lower()
        if "uuid" in name or name.endswith("id") or name == "id":
            return "00000000-0000-0000-0000-000000000000"
        if "date" in name:
            return "2025-01-01"
        return "test"
    return re.sub(r"\{([^}/]+)\}", repl, path)


def main():
    try:
        spec = json.loads(fetch(f"{BASE}/openapi.json"))
    except Exception as e:
        print(f"[FAIL] не могу получить openapi.json с {BASE}: {e}")
        sys.exit(1)

    paths = spec.get("paths", {})
    errors = []
    checked = 0

    for path, methods in paths.items():
        for method in list(methods.keys()):
            m = method.lower()
            if m not in ("get", "head", "options"):
                continue
            url = f"{BASE}{sub_path_params(path)}"
            req = urllib.request.Request(url, headers=HDRS, method=m.upper())
            try:
                with urllib.request.urlopen(req, timeout=10) as r:
                    code = r.getcode()
            except urllib.error.HTTPError as e:
                code = e.code
            except Exception as e:
                errors.append((m, url, f"EXC:{e}"))
                continue

            checked += 1
            if code >= 400:
                errors.append((m, url, code))

    print(f"\n=== SMOKE DONE ===")
    print(f"BASE: {BASE}")
    print(f"Проверено эндпоинтов (GET/HEAD/OPTIONS): {checked}")
    if errors:
        print(f"Проблемы: {len(errors)}")
        for m, url, msg in errors:
            print(f"  - {m.upper()} {url} -> {msg}")
        sys.exit(2)
    else:
        print("Все проверенные ручки ответили < 400. ✅")


if __name__ == "__main__":
    main()