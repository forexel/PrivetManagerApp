import pytest, httpx

BASE = "http://localhost:8000"

@pytest.mark.asyncio
async def test_all_paths():
    async with httpx.AsyncClient(base_url=BASE) as client:
        r = await client.get("/openapi.json")
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