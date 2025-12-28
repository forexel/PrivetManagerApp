import os

import pytest, httpx

BASE = os.getenv("SMOKE_BASE", "http://localhost:8000")

@pytest.mark.asyncio
async def test_all_paths():
    async with httpx.AsyncClient(base_url=BASE, timeout=2.0) as client:
        try:
            r = await client.get("/openapi.json")
        except httpx.HTTPError as exc:
            pytest.skip(f"Smoke server unavailable at {BASE}: {exc}")
        r.raise_for_status()
        spec = r.json()
        errors = []
        for path, methods in spec["paths"].items():
            for m in methods.keys():
                if m.lower() == "get":   # только GET для smoke
                    url = path.replace("{id}", "test")  # заглушки
                    resp = await client.get(url)
                    if resp.status_code >= 400:
                        errors.append((m, url, resp.status_code))
        assert not errors, f"Ошибки: {errors}"
