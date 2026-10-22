"""Full Terminal shell QA. Synthetic history is injected only by this test."""
import asyncio
import functools
import json
import os
import subprocess
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('WAVE_MACRO_QA_OUT', '/tmp/wave-macro-qa'))
REAL_DATA = json.loads(Path(os.environ['WAVE_MACRO_REAL_DATA']).read_text()) if os.environ.get('WAVE_MACRO_REAL_DATA') else None
CATALOGUE = json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {catalogue} from './supabase/functions/wave-data/macro.ts';console.log(JSON.stringify(catalogue(Date.parse('2026-10-14T20:00:00Z'))));"],cwd=ROOT))

async def check(browser,width,lang):
    ctx = await browser.new_context(viewport={'width':width,'height':900},has_touch=width<600)
    await ctx.add_init_script("localStorage.setItem('wc_lang',"+json.dumps(lang)+")")
    page = await ctx.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    mode={'fail':False}
    async def api(route):
        u=urlparse(route.request.url)
        if u.path.endswith('/api/macro-series'):
            if mode['fail']:
                await route.fulfill(status=502,json={'error':'TEST outage'});return
            sid=parse_qs(u.query).get('series',[None])[0]
            if parse_qs(u.query).get('components') == ['1']:
                if REAL_DATA:
                    await route.fulfill(json=REAL_DATA['components'][sid]);return
                rows=[{'period':'2026-04-01','headline':2.2,'sum':2.22,'residual':-.02,'complete':True,'reconciled':True,'mom':.3,'yoy':3.4,'components':[{'name':name,'he':name,'value':value,'mom':.2,'yoy':2.5} for name,value in [('Consumption',2.51),('Investment',.82),('Exports',.56),('Imports',-1.66),('Government',-.01)]]}]
                await route.fulfill(json={'id':sid,'kind':'contributions' if sid=='gdp' else 'price_rates','status':'current_vintage','rows':rows,'sources':[]});return
            if sid:
                if REAL_DATA:
                    await route.fulfill(json=REAL_DATA['histories'][sid]);return
                await route.fulfill(json={'id':sid,'status':'current_vintage','history_basis':'latest_revised','fetched_at':'2026-10-14T20:00:00Z','points':[{'period':f'2026-{m:02}-01','value':-2 if sid=='gdp' and m==1 else 3+m*.1} for m in range(1,10)]})
            else:await route.fulfill(json=CATALOGUE)
        elif u.path.endswith('/api/macro-news'):await route.fulfill(json={'stories':[],'topics':{}})
        else:await route.fulfill(status=404,json={'error':'Outside isolated Macro test'})
    await page.route('**/api/**',api)
    chart=Path('/tmp/wave-chart-4.4.0.js')
    if chart.exists():await page.route('**/chart.umd.min.js',lambda r:r.fulfill(path=str(chart),content_type='application/javascript'))
    await page.goto('http://127.0.0.1:'+os.environ.get('WAVE_MACRO_QA_PORT','8774')+'/terminal_app.html',wait_until='load')
    await page.evaluate("navigate('macro')")
    await page.wait_for_function("document.querySelectorAll('.macro-indicator').length===13")
    await page.wait_for_function("document.querySelector('[data-macro-id=pce] strong').textContent !== '—'")
    await page.wait_for_function("document.querySelectorAll('.macro-indicator svg').length===11")
    assert await page.locator('#macroDashboard polyline').count()==0
    for sid in ['cpi','core_cpi','unemployment']:
        assert await page.locator('[data-macro-id='+sid+'] .macro-column').count()>1
    assert await page.locator('.macro-indicator .macro-column').evaluate_all("els=>els.every(e=>['x','y','width','height'].every(a=>Number.isFinite(Number(e.getAttribute(a)))))")
    await page.locator('.inflation .macro-indicator').first.wait_for(state='visible')
    cards=await page.locator('.inflation .macro-indicator').evaluate_all('(els)=>els.map(e=>{let r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})')
    assert len({round(c['y']) for c in cards})==1,cards
    assert all(c['width']>=44 and c['height']>=44 for c in cards),cards
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+2')
    assert await page.locator('.macro-indicator .macro-contributions').count()==0
    await page.locator('[data-macro-id=nfp]').focus()
    await page.keyboard.press('Enter')
    await page.locator('#macroDialog[open]').wait_for()
    assert await page.locator('#macroDialog polyline').count()==0
    assert await page.locator('#macroDialog .macro-column').count()>0
    assert await page.locator('.macro-contribution').count()==11
    assert await page.locator('.macro-contribution .negative').count()==5
    assert await page.locator('#macroDialogClose').evaluate('(e)=>document.activeElement===e')
    for _ in range(12):
        await page.keyboard.press('Tab')
        assert await page.evaluate("document.activeElement.closest('#macroDialog')!==null")
    if width<600:
        b=await page.locator('#macroDialog').bounding_box()
        assert b['width']==width and b['height']==900,b
    await page.locator('#macroDialog').evaluate('(e)=>e.scrollTop=0')
    await page.screenshot(path=str(OUT/f'{width}-{lang}-nfp.png'),full_page=True)
    await page.locator('#macroReleaseSelect').select_option('nfp:2026-09-04')
    assert await page.locator('.macro-contribution').count()==0
    await page.keyboard.press('Escape')
    assert await page.locator('[data-macro-id=nfp]').evaluate('(e)=>document.activeElement===e')
    await page.locator('[data-macro-id=cpi]').click()
    assert await page.locator('.macro-contribution').count()==3
    assert '-0.037' in await page.locator('#macroDetail').inner_text()
    await page.locator('#macroDialog').evaluate('(e)=>e.scrollTop=0')
    await page.screenshot(path=str(OUT/f'{width}-{lang}-cpi.png'),full_page=True)
    await page.locator('#macroDialogClose').click()
    for sid in ['gdp','pce']:
        await page.locator('[data-macro-id='+sid+']').click()
        await page.locator('#macroComponentPeriod').wait_for()
        if sid=='gdp':
            assert await page.locator('#macroDialog .macro-column.negative').count()>0
        assert await page.locator('#macroDialog .macro-axis-period').evaluate_all("els=>{const boxes=els.map(e=>e.getBBox()).sort((a,b)=>a.x-b.x);return boxes.every((b,i)=>i===0||boxes[i-1].x+boxes[i-1].width+3<=b.x)}")
        assert await page.locator('.macro-component-section table tbody tr').count()==(5 if sid=='gdp' else 6)
        content=await page.locator('.macro-component-section').inner_text()
        assert ('-0.02' in content) if sid=='gdp' else ('% MoM' in content and '% YoY' in content)
        assert await page.locator('#macroDialog').evaluate('(e)=>e.scrollWidth<=e.clientWidth+2')
        assert await page.locator('.macro-component-section .macro-table-wrap').evaluate('(e)=>e.scrollWidth<=e.clientWidth+2')
        await page.screenshot(path=str(OUT/f'{width}-{lang}-{sid}.png'),full_page=True)
        await page.keyboard.press('Escape')
    await page.locator('[data-macro-id=ism_services]').click()
    assert await page.locator('.macro-contribution').count()==0
    assert await page.locator('#macroDetail svg').count()==0
    await page.keyboard.press('Escape')
    await page.locator('#page-macro').evaluate('(e)=>{for(let p=e;p;p=p.parentElement)p.scrollTop=0;window.scrollTo(0,0)}')
    await page.screenshot(path=str(OUT/f'{width}-{lang}-overview.png'),full_page=True)
    await page.evaluate("navigate('sources')")
    assert 'US Macro' in await page.locator('#sourcesContent').inner_text()
    mode['fail']=True
    await page.evaluate("navigate('macro')")
    await page.locator('#macroDashboard [role=alert]').wait_for()
    assert not errors,errors
    await ctx.close()
    return {'width':width,'language':lang,'inflation_cards':cards,'passed':True,'data_basis':'captured official responses' if REAL_DATA else 'synthetic QA history'}

async def main():
    OUT.mkdir(exist_ok=True,parents=True)
    server=ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('WAVE_MACRO_QA_PORT','8774'))),functools.partial(SimpleHTTPRequestHandler,directory=str(ROOT/'apps/terminal/public')))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        async with async_playwright() as p:
            browser=await p.chromium.launch(executable_path=os.environ.get("WAVE_CHROMIUM_PATH"))
            results=[]
            for width,lang in [(1440,'en'),(1024,'he'),(375,'he'),(320,'en')]:
                results.append(await check(browser,width,lang))
            await browser.close()
            (OUT/'results.json').write_text(json.dumps(results,indent=2))
            print(json.dumps(results,indent=2))
    finally:server.shutdown()

if __name__=='__main__':asyncio.run(main())
