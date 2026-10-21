#!/usr/bin/env python3
"""Real homepage assets served through Flask; no provider calls or account actions."""
import asyncio,json,os,sys,threading
from pathlib import Path
from flask import Flask
from werkzeug.serving import make_server
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'services/api'))
from modules.frontend import bp
OUT=Path(os.environ.get('WAVE_HOME_QA_OUT','/tmp/wave-homepage-qa'))
async def main():
    app=Flask(__name__,static_folder=None);app.register_blueprint(bp)
    server=make_server('127.0.0.1',0,app,threaded=True)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}';OUT.mkdir(parents=True,exist_ok=True)
    results=[]
    try:
        async with async_playwright() as p:
            browser=await p.chromium.launch(**({'executable_path':os.environ['WAVE_BROWSER_EXECUTABLE']} if os.environ.get('WAVE_BROWSER_EXECUTABLE') else {}))
            for width,height in [(1440,1000),(390,844)]:
                context=await browser.new_context(viewport={'width':width,'height':height})
                # External APIs are outside this source-serving test; actual local film and vendor assets are untouched.
                await context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base) else r.abort())
                page=await context.new_page();errors=[];bad=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.on('response',lambda r:bad.append(r.url) if r.url.startswith(base) and '/api/' not in r.url and r.status>=400 else None)
                await page.goto(base+'/',wait_until='load')
                # Preserve the exact existing Browser QA homepage expectation.
                await page.wait_for_function("() => {const a=document.querySelector('a[data-app]');return a && /terminal_app\\.html$/.test(a.getAttribute('href')||'');}")
                for target in ['terminal_app.html','university.html','products.html']:
                    links=page.locator('[data-sys="'+target+'"]')
                    assert await links.first.get_attribute('href')==target
                    assert await links.first.get_attribute('hidden') is None
                await page.wait_for_function("() => document.querySelector('video').readyState>=2",timeout=30000)
                await page.evaluate("window.scrollTo({top:0,behavior:'instant'})")
                await page.wait_for_function("() => document.querySelector('video').currentTime<0.3")
                await page.mouse.wheel(0,700)
                await page.wait_for_function("() => document.querySelector('video').currentTime>0.3")
                assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
                await page.screenshot(path=str(OUT/f'home-{width}.png'),full_page=False)
                assert not errors,errors
                assert not bad,bad
                home_errors=list(errors);home_bad=list(bad)
                for target in ['terminal','university','products']:
                    await page.goto(base+'/'+target,wait_until='domcontentloaded')
                    await page.locator('#wave-back a').wait_for()
                    assert await page.locator('#wave-back a').get_attribute('href')=='index.html'
                    await page.locator('#wave-back a').click()
                    await page.wait_for_url('**/index.html')
                    assert await page.locator('#hero video').count()==1
                results.append({'width':width,'passed':True,'film_loaded_and_scrubbed':True,'homepage_errors':home_errors,'homepage_asset_failures':home_bad})
                await context.close()
            context=await browser.new_context(java_script_enabled=False)
            page=await context.new_page();await page.goto(base+'/')
            await page.locator('[data-app]').first.click();await page.wait_for_url('**/terminal_app.html')
            for target in ['university.html','products.html']:
                await page.goto(base+'/');await page.locator('[data-sys="'+target+'"]').first.click();await page.wait_for_url('**/'+target)
            await context.close();await browser.close()
        (OUT/'report.json').write_text(json.dumps(results,indent=2));print(json.dumps({'passed':True,'results':results}))
    finally:server.shutdown()
if __name__=='__main__':asyncio.run(main())
