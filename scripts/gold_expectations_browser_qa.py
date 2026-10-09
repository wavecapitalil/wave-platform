"""Gold expectations integration/visual regression, external APIs isolated."""
import asyncio
import functools
import json
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'apps/terminal/public'
OUT = ROOT / 'gold_expectations_browser_qa'
OUT.mkdir(exist_ok=True)
DATA = json.loads((PUBLIC / 'data/gold-expectations.json').read_text())

async def check(browser, label, width, height):
    context = await browser.new_context(viewport={'width':width,'height':height},has_touch=width<=1024)
    page = await context.new_page()
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    async def isolate(route):
        if route.request.url.startswith('http://127.0.0.1:8771/'):
            await route.continue_()
        elif '/api/' in route.request.url:
            await route.fulfill(status=200,json={})
        else:
            await route.abort()
    await page.route('**/*',isolate)
    await page.goto('http://127.0.0.1:8771/terminal_app.html#page=commodities',wait_until='load')
    panel=page.locator('#goldExpectationsPanel')
    await panel.locator('svg').wait_for()
    assert await panel.locator('g[role=button]').count()==len(DATA['rows'])
    assert await page.locator('#gsrChart').count()==1
    positions=await page.evaluate('({ratio:document.querySelector("#gsrSection").getBoundingClientRect().bottom,panel:document.querySelector("#goldExpectationsPanel").getBoundingClientRect().top})')
    assert positions['panel']>positions['ratio']
    assert await panel.evaluate('e=>e.scrollWidth<=e.clientWidth+2')
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
    assert 'own institution' in await panel.inner_text()
    assert '2023 · “Don’t know” removed' in await panel.inner_text()
    await panel.locator('button').filter(has_text='2020').click()
    assert 'Published total: 101%' in await panel.inner_text()
    assert '20%' in await panel.inner_text()
    await panel.locator('button').filter(has_text='2023').focus()
    await page.keyboard.press('Enter')
    assert 'Published total: 99%' in await panel.inner_text()
    assert 'Not offered' in await panel.inner_text()
    await panel.locator('button').last.click()
    await panel.scroll_into_view_if_needed()
    await panel.screenshot(path=str(OUT/f'{label}-panel.png'))
    await page.screenshot(path=str(OUT/f'{label}-page.png'))
    await page.evaluate("navigate('sources')")
    source=page.locator('.sources-card').filter(has_text='Central-bank gold expectations')
    assert await source.locator('a').count()>=len(DATA['rows'])
    assert 'OWN institution' in await source.inner_text()
    await page.evaluate("navigate('commodities');navigate('welcome');navigate('commodities')")
    assert await panel.locator('svg').count()==1
    assert await page.locator('#page-commodities').is_visible()
    # A failed initial load is recoverable by explicit Retry.
    await page.route('**/data/gold-expectations.json',lambda r:r.fulfill(status=503,body='unavailable'))
    await page.reload(wait_until='load')
    await panel.get_by_text('The annual survey series could not be loaded.').wait_for()
    await page.unroute('**/data/gold-expectations.json')
    await panel.get_by_role('button',name='Retry').click()
    await panel.locator('svg').wait_for()
    assert await panel.locator('g[role=button]').count()==len(DATA['rows'])
    await context.close()
    return {'viewport':label,'size':[width,height],'passed':True,'positions':positions,'external_isolation_errors':errors}

async def main():
    server=ThreadingHTTPServer(('127.0.0.1',8771),functools.partial(SimpleHTTPRequestHandler,directory=str(PUBLIC)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
        reports=[await check(browser,*v) for v in [('desktop',1440,1000),('ipad',834,1194),('phone',390,844)]]
        await browser.close()
    server.shutdown()
    (OUT/'report.json').write_text(json.dumps(reports,indent=2))
    print(json.dumps(reports,indent=2))

if __name__=='__main__':asyncio.run(main())
