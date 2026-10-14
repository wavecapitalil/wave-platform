"""Regression for reported five cramped KPI tiles on phones. Uses fixed display fixtures."""
import asyncio, functools, json, shutil, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'gold_expectations_browser_qa'; OUT.mkdir(exist_ok=True)
async def main():
    server=ThreadingHTTPServer(('127.0.0.1',8772),functools.partial(SimpleHTTPRequestHandler,directory=str(ROOT/'apps/terminal/public')))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    reports=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
        for width,height in [(320,740),(360,780),(390,844),(430,932),(834,1194),(1194,834),(1440,1000)]:
            context=await browser.new_context(viewport={'width':width,'height':height},has_touch=width<1200)
            page=await context.new_page()
            async def isolate(route):
                if route.request.url.startswith('http://127.0.0.1:8772/'): await route.continue_()
                else: await route.abort()
            await page.route('**/*',isolate)
            await page.goto('http://127.0.0.1:8772/terminal_app.html#page=commodities')
            await page.evaluate('''() => { renderGsrMetrics({current:69.1,mean:80.7,percentile:14,z_score:-1.27,gold_price:4216,silver_price:61.05,end_date:'2026-10-01',start_date:'2016-01-01',n_years:10}); }''')
            for lang in ['en','he']:
                await page.evaluate('(lang)=>setLang(lang)',lang)
                result=await page.evaluate('''() => ({overflow:document.documentElement.scrollWidth>innerWidth+2,tiles:[...document.querySelectorAll('#gsrMetrics .td-stat')].map(e=>({w:e.clientWidth,scroll:e.scrollWidth,top:e.getBoundingClientRect().top})),values:[...document.querySelectorAll('#gsrMetrics .td-stat-val')].map(e=>({w:e.clientWidth,scroll:e.scrollWidth,text:e.textContent})),targets:[...document.querySelectorAll('#gsrTimeTabs button')].map(e=>({w:e.offsetWidth,h:e.offsetHeight}))})''')
                assert not result['overflow'],(width,lang,result)
                assert all(t['scroll']<=t['w']+1 for t in result['tiles']+result['values']),(width,lang,result)
                assert all(t['h']>=44 and t['w']>=44 for t in result['targets'])
                assert result['values'][0]['text']=='69.1'
                assert result['values'][3]['text']=='$4,216'
                if width<=760: assert len(set(t['top'] for t in result['tiles']))==3
                else: assert len(set(t['top'] for t in result['tiles']))==1
                await page.locator('#gsrTimeTabs button').first.click()
                assert await page.locator('#gsrTimeTabs button').first.evaluate("e=>e.classList.contains('active')")
                await page.screenshot(path=str(OUT/f'ratio-{width}-{lang}.png'))
                reports.append({'width':width,'language':lang,'passed':True})
            await context.close()
        await browser.close()
    server.shutdown()
    (OUT/'ratio-report.json').write_text(json.dumps(reports,indent=2)); print(json.dumps(reports))
if __name__=='__main__': asyncio.run(main())
