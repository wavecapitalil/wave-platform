"""Scoped native-brief browser regression, isolated from external market APIs."""
import asyncio
import functools
import hashlib
import json
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'brief_browser_qa'
OUT.mkdir(exist_ok=True)
PUBLIC = ROOT / 'apps/terminal/public'
MANIFEST = json.loads((PUBLIC / 'briefs/latest.json').read_text())
EDITION = json.loads((PUBLIC / MANIFEST['path']).read_text())
SECTIONS = EDITION['sections']
CHARTS = [chart for section in SECTIONS for chart in section.get('charts', [])]
BAR_CHARTS = [chart for chart in CHARTS if chart.get('type') == 'bars']
TIME_CHARTS = [chart for chart in CHARTS if chart.get('type') in ('line', 'stacked')]


async def check(browser, label, width, height):
    context = await browser.new_context(viewport={'width': width, 'height': height}, has_touch=width <= 1024)
    page = await context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    async def isolate(route):
        if route.request.url.startswith('http://127.0.0.1:8768/'):
            await route.continue_()
        elif '/api/' in route.request.url:
            await route.fulfill(status=200,json={})
        else:
            await route.abort()
    await page.route('**/*',isolate)
    await page.goto('http://127.0.0.1:8768/terminal_app.html#page=brief',wait_until='load')
    await page.locator('.brief-paper h1').wait_for()
    assert await page.locator('.brief-story').count()==len(SECTIONS)
    assert await page.locator('.brief-chart img').count()==sum('src' in chart for chart in CHARTS)
    assert await page.locator('.brief-interactive').count()==len(BAR_CHARTS)+len(TIME_CHARTS)
    assert await page.locator('.brief-series-svg').count()==len(TIME_CHARTS)
    assert await page.locator('#briefFrame').count()==0
    date_text = await page.evaluate("d=>new Date(d+'T12:00:00Z').toLocaleDateString('he-IL',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jerusalem'})", EDITION['date'])
    assert date_text in await page.locator('#briefDate').inner_text()
    assert 'PARTIAL EDITION' not in await page.locator('#page-brief').inner_text()
    assert EDITION['sections'][0]['title'] == await page.locator('.brief-paper h1').inner_text()
    if TIME_CHARTS:
        await page.wait_for_function("document.querySelector('.brief-series-svg path, .brief-series-svg rect') !== null")
    layout=await page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,article:document.querySelector(".brief-paper").getBoundingClientRect().width})')
    assert layout['scroll']<=width+2,layout
    article_layout=await page.locator('#briefArticle').evaluate('el=>({scroll:el.scrollWidth,width:el.clientWidth})')
    await page.screenshot(path=str(OUT/f'{label}-layout.png'))
    assert article_layout['scroll']<=article_layout['width']+2,(label,article_layout)
    await page.wait_for_function("document.querySelector('.brief-progress').value === 0")
    assert await page.locator('.brief-contents button').count()==len(SECTIONS)
    # The copy is actual selectable text, not a PDF/plugin/page-image viewer.
    selected=await page.locator('.brief-story-body p').first.evaluate('el=>{const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);return s.toString();}')
    first_text = next(p['text'] for section in SECTIONS for p in section['paragraphs'] if p['kind'] == 'text')
    assert selected == first_text
    await page.evaluate('getSelection().removeAllRanges()')
    theme=await page.evaluate(r"""() => {
      const article = document.querySelector('.brief-paper');
      const rgb = c => c.match(/[\d.]+/g).slice(0,3).map(Number);
      const lum = values => values.reduce((sum,v,i) => {
        v/=255; return sum+[.2126,.7152,.0722][i]*(v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
      },0);
      const ratio = color => (lum(rgb(color))+.05)/(lum([10,10,15])+.05);
      const selectors=['.brief-story h1','.brief-deck','.brief-edition-line','.brief-kicker','.brief-story-body','.brief-chart-period','.brief-chart-detail'];
      return {background:getComputedStyle(article).backgroundColor,
        text:selectors.map(s=>({selector:s,contrast:ratio(getComputedStyle(article.querySelector(s)).color)})),
        marks:[...article.querySelectorAll('.brief-bar')].map(el=>ratio(getComputedStyle(el).backgroundColor)),
        imageFilter:[...article.querySelectorAll('img')].map(el=>getComputedStyle(el).filter)};
    }""")
    assert theme['background']=='rgba(0, 0, 0, 0)',theme
    assert all(item['contrast']>=4.5 for item in theme['text']),theme
    assert all(ratio>=4.5 for ratio in theme['marks']),theme
    assert all('invert(1)' in value and 'brightness(1.18)' in value for value in theme['imageFilter']),theme
    await page.screenshot(path=str(OUT/f'{label}-top.png'))
    if await page.locator('.brief-chart img').count():
        for i, image in enumerate(await page.locator('.brief-chart img').all()):
            await image.scroll_into_view_if_needed()
            # Later sections use native lazy loading; wait for the actual image
            # before decoding, without hiding failed or unavailable assets.
            await page.wait_for_function(
                'img => img.complete && img.naturalWidth > 0',
                arg=await image.element_handle(), timeout=10000)
            await image.evaluate('el=>el.decode()')
            await page.screenshot(path=str(OUT/f'{label}-original-chart-{i+1}.png'))
    if BAR_CHARTS:
        first_chart=page.locator('.brief-interactive:not(.brief-time-series)').first
        index=min(1,len(BAR_CHARTS[0]['rows'])-1)
        await first_chart.locator('.brief-bar-row').nth(index).click()
        assert BAR_CHARTS[0]['rows'][index]['display'] in await first_chart.locator('.brief-chart-detail').inner_text()
        await first_chart.locator('.brief-bar-row').first.focus()
        await page.keyboard.press('Enter')
        assert BAR_CHARTS[0]['rows'][0]['display'] in await first_chart.locator('.brief-chart-detail').inner_text()
    for chart in BAR_CHARTS:
        for row in chart['rows']:
            if row['value'] is None:
                assert await page.locator('.brief-bar-row').filter(has_text=row['label']).first.locator('.brief-bar').count()==0
    if TIME_CHARTS:
        time_chart=page.locator('.brief-time-series').first
        await time_chart.locator('input[type=range]').focus()
        await page.keyboard.press('Home')
        assert TIME_CHARTS[0]['labels'][0] in await time_chart.locator('.brief-chart-detail').inner_text()
        await page.keyboard.press('End')
        assert TIME_CHARTS[0]['labels'][-1] in await time_chart.locator('.brief-chart-detail').inner_text()
    await page.locator('.brief-interactive').first.scroll_into_view_if_needed()
    await page.screenshot(path=str(OUT/f'{label}-interactive.png'))
    await page.locator('.brief-contents button').last.click()
    await page.wait_for_function("document.querySelector('.brief-contents button:last-child').getAttribute('aria-current') === 'location'")
    assert await page.locator('.brief-next-chapter').is_disabled()
    await page.locator('.brief-paper-footer').scroll_into_view_if_needed()
    await page.wait_for_function("document.querySelector('.brief-progress').value === 100")
    assert 'נותרו 0%' in await page.locator('.brief-progress-label').inner_text()
    await page.screenshot(path=str(OUT/f'{label}-reader-at-end.png'))
    await page.locator('.brief-contents button').first.click()
    await page.wait_for_function("document.querySelector('.brief-contents button:first-child').getAttribute('aria-current') === 'location'")
    await page.locator('.brief-next-chapter').click()
    await page.wait_for_function("document.querySelector('.brief-contents button:nth-child(2)').getAttribute('aria-current') === 'location'")
    await page.locator('.brief-story').last.scroll_into_view_if_needed()
    await page.screenshot(path=str(OUT/f'{label}-risk.png'))
    # Source details remain reachable from the article itself.
    await page.locator('.brief-source-link').click()
    assert await page.locator('#page-sources').is_visible()
    source_card=page.locator('.sources-card').filter(has_text='בריף הבוקר · '+date_text)
    assert await source_card.locator('a').count()==len(EDITION['sources'])
    assert EDITION['methodology'] in await source_card.text_content()
    await page.evaluate("navigate('brief'); navigate('brief'); navigate('home'); navigate('brief')")
    assert await page.locator('.brief-story').count()==len(SECTIONS)
    assert await page.locator('#page-brief').is_visible()
    # Finish the coalesced navigation refresh before installing the failure fixture.
    await page.evaluate('WaveBrief.reload()')
    # Failed refresh preserves the actual previously loaded date/content.
    await page.route('**/briefs/latest.json',lambda route:route.fulfill(status=503,body='unavailable'))
    await page.evaluate('WaveBrief.reload()')
    assert 'לא ניתן לבדוק' in await page.locator('#briefStatus').inner_text()
    assert await page.locator('.brief-story').count()==len(SECTIONS)
    assert date_text in await page.locator('#briefDate').inner_text()
    await page.unroute('**/briefs/latest.json')
    await page.locator('#briefStatus button').click()
    await page.wait_for_function("document.querySelector('#briefStatus').textContent === ''")
    await page.reload(wait_until='load')
    await page.locator('.brief-paper h1').wait_for()
    assert await page.locator('.brief-story').count()==len(SECTIONS)
    # The archived fixture exercises line/stacked marks that today's edition may not contain.
    archived_path='briefs/2026-10-08/edition.json'
    archived_bytes=(PUBLIC/archived_path).read_bytes()
    await page.route('**/briefs/latest.json',lambda route:route.fulfill(json={
        'schemaVersion':1,'date':'2026-10-08','path':archived_path,
        'revision':hashlib.sha256(archived_bytes).hexdigest()}))
    await page.evaluate('WaveBrief.reload()')
    await page.wait_for_function("document.querySelector('.brief-series-svg path') !== null")
    assert await page.locator('.brief-contents button').count()==9
    assert await page.locator('.brief-reader-rail').count()==1
    await page.locator('.brief-time-series').first.scroll_into_view_if_needed()
    await page.screenshot(path=str(OUT/f'{label}-archived-series.png'))
    assert await page.locator('.brief-series-svg text').first.evaluate('e=>getComputedStyle(e).fill')=='rgb(203, 214, 226)'
    await page.locator('.brief-chart-slider').first.focus()
    await page.keyboard.press('Home')
    assert '01.10.2026 05:00 UTC' in await page.locator('.brief-series-detail').first.inner_text()
    report={'viewport':label,'theme':theme,'size':[width,height],'passed':True,'layout':layout,'isolated_external_errors':errors}
    await context.close()
    return report

async def main():
    handler=functools.partial(SimpleHTTPRequestHandler,directory=str(ROOT/'apps/terminal/public'))
    server=ThreadingHTTPServer(('127.0.0.1',8768),handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
        reports=[]
        for spec in [('desktop',1440,1000),('ipad',834,1194),('ipad-landscape',1194,834),('phone',390,844),('phone-small',360,780)]:
            reports.append(await check(browser,*spec))
        await browser.close()
    server.shutdown()
    (OUT/'report.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2))
    print(json.dumps(reports,ensure_ascii=False,indent=2))

if __name__=='__main__':asyncio.run(main())
