"""Private workspace UI QA against synthetic local responses; never live auth."""
import asyncio
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import threading
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.getenv('WAVE_PROCESS_QA_OUT','/tmp/wave-process-workspace-qa'))
OUT.mkdir(parents=True,exist_ok=True)
REGISTRY=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {PROCESS_REGISTRY} from './supabase/functions/wave-data/process-registry.ts'; console.log(JSON.stringify(PROCESS_REGISTRY))"],cwd=ROOT))
DEFINITIONS=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {DEFINITIONS} from './supabase/functions/wave-data/calculations.ts'; console.log(JSON.stringify(DEFINITIONS))"],cwd=ROOT))
KEY='wc_'+'a'*64 # Synthetic test key, intercepted locally; never submitted to live service.

async def check(browser,name,width,height,base):
    context=await browser.new_context(viewport={'width':width,'height':height},has_touch=width<=1024)
    page=await context.new_page();errors=[];calls=[]
    page.on('pageerror',lambda err:errors.append(str(err)))
    async def api(route):
        calls.append(route.request.url)
        if 'view=processes' in route.request.url:
            await route.fulfill(json={'schema_version':'wave.process-workspace/1','registry':REGISTRY,'runs':[],'run_store':{'status':'not_connected'}})
        else:
            await route.fulfill(json={'config':{'revision':1,'formulas':{},'updated_at':'2026-01-09T00:00:00Z'},'definitions':DEFINITIONS,'history':[],'catalog':[],'provider_fields':[]})
    await page.route('https://**/*',api)
    await page.goto(base+'/calculation-workspace.html#key='+KEY)
    await page.locator('#process-title').filter(has_text='בריף בוקר').wait_for()
    assert '#' not in page.url
    assert await page.locator('#formula-workflow').is_hidden()
    async def choose(process):
        if width<=700: await page.locator('#process-menu').click()
        await page.locator('[data-process="'+process+'"]').click()
    await choose('terminal:commodities')
    assert await page.locator('#process-title').inner_text()=='סחורות'
    await page.locator('[data-process-tab=draft]').click()
    await page.locator('#process-rules').fill('בדיקה סינתטית: מקור → תאריך → חישוב → תוצר')
    await page.locator('#process-validation').fill('בדיקה סינתטית: אין להשתמש במפת מקורות ישנה בלי התאמה')
    await page.locator('#process-reason').fill('שינוי לצורך בדיקת הדגמה בלבד')
    await page.locator('#process-preview').click()
    assert await page.locator('#process-save').is_enabled()
    await page.locator('#process-save').click()
    assert await page.locator('#process-draft-history .history-row').count()==1
    await choose('morning-brief');await choose('terminal:commodities')
    assert 'בדיקה סינתטית' in await page.locator('#process-rules').input_value()
    async with page.expect_download() as info: await page.locator('#process-export').click()
    download=await info.value;await download.save_as(OUT/(name+'-synthetic-draft.json'))
    await page.locator('[data-process-tab=runs]').click()
    assert 'אין ריצות' in await page.locator('#process-run-list').inner_text()
    count=len(calls);await page.locator('#process-demo').click()
    assert await page.locator('.synthetic-label').is_visible()
    assert 'פער בין חיתוך' in await page.locator('#process-evidence').inner_text()
    assert 'סיבת ההחלטה לא תועדה' in await page.locator('#process-evidence').inner_text()
    assert len(calls)==count
    await page.locator('#process-import').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"credentials":"synthetic-invalid"}'})
    await page.wait_for_function("document.querySelector('#process-import-status').textContent.includes('לא ניתן לקרוא')")
    assert len(calls)==count
    await page.screenshot(path=str(OUT/(name+'-evidence.png')),full_page=True)
    await choose('terminal:research')
    assert await page.locator('#formula-workflow').is_visible()
    assert await page.locator('#formulas .formula').count()==14
    await choose('full-validation');await page.locator('[data-process-tab=overview]').click()
    assert await page.locator('#formula-workflow').is_hidden()
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    await page.screenshot(path=str(OUT/(name+'-overview.png')),full_page=True)
    if width<=700:
        await page.locator('#process-menu').click();await page.keyboard.press('Escape')
        assert await page.locator('#process-sidebar').is_hidden()
    await page.locator('#logout').click()
    assert await page.locator('#workspace').is_hidden()
    assert not await page.locator('#process-evidence').inner_text()
    assert not await page.locator('#process-rules').input_value()
    assert not errors,errors
    await context.close()
    return {'viewport':name,'passed':True,'api_calls':len(calls)}

async def check_compatibility(browser,base):
    outcomes=[]
    for mode in ['legacy','process-error','process-revoked','process-revoked-html']:
        context=await browser.new_context(viewport={'width':1280,'height':900})
        page=await context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        async def api(route):
            formula={'config':{'revision':1,'formulas':{},'updated_at':'2026-01-09T00:00:00Z'},'definitions':DEFINITIONS,'history':[],'catalog':[],'provider_fields':[]}
            if 'view=processes' in route.request.url and mode=='process-revoked-html':
                await route.fulfill(status=403,content_type='text/html',body='<p>Synthetic access denied</p>')
            elif 'view=processes' in route.request.url and mode!='legacy':
                await route.fulfill(status=403 if mode=='process-revoked' else 503,json={'error':'synthetic failure'})
            else: await route.fulfill(json=formula)
        await page.route('https://**/*',api)
        await page.goto(base+'/calculation-workspace.html#key='+KEY)
        if mode.startswith('process-revoked'):
            await page.wait_for_function("document.querySelector('#auth-status').textContent.includes('נסגרה')")
            assert await page.locator('#workspace').is_hidden()
            assert await page.locator('#formulas .formula').count()==0
        else:
            await page.locator('#formula-workflow').wait_for(state='visible')
            assert await page.locator('#formulas .formula').count()==14
            assert 'אינה זמינה' in await page.locator('#process-connection').inner_text()
        assert not errors,errors
        await context.close();outcomes.append({'compatibility':mode,'passed':True})
    return outcomes

async def main():
    handler=functools.partial(SimpleHTTPRequestHandler,directory=str(ROOT/'apps/terminal/public'))
    server=ThreadingHTTPServer(('127.0.0.1',0),handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        async with async_playwright() as p:
            browser=await p.chromium.launch(executable_path=os.getenv('CHROMIUM_PATH') or None,args=['--no-sandbox'])
            results=[]
            for name,w,h in [('desktop',1440,1000),('tablet',1024,1366),('phone',390,844)]:results.append(await check(browser,name,w,h,'http://127.0.0.1:'+str(server.server_port)))
            results.extend(await check_compatibility(browser,'http://127.0.0.1:'+str(server.server_port)))
            await browser.close()
            (OUT/'results.json').write_text(json.dumps(results,indent=2));print(json.dumps(results))
    finally: server.shutdown()
if __name__=='__main__': asyncio.run(main())
