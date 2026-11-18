import asyncio,json,os
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True); c=await b.new_context(viewport={"width":1280,"height":1800}); pg=await c.new_page()
    m=json.load(open(os.path.expanduser("~/.cache/lovable-auth/session.json")))
    await pg.goto("http://localhost:8080"); await pg.evaluate("([k,v])=>localStorage.setItem(k,v)",[m["storage_key"],json.dumps(m["session"])])
    await pg.goto("http://localhost:8080/logistica"); await pg.wait_for_timeout(8000)
    print(await pg.get_by_text("Controle Logístico").count(), await pg.get_by_text("Custo logístico total",exact=False).count())
    await b.close()
asyncio.run(main())
