"""Scoped full-shell browser regression; fixture financial data, no external writes.

Covers real Chromium layout/events in the production Terminal shell. External
market requests are isolated from this UI regression and live-API checks run
separately after the backend deploy.
"""
import asyncio
import functools
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "fixtures/equity-valuation-history.json").read_text())["snapshots"]
OUT = ROOT / "valuation_browser_qa"
OUT.mkdir(exist_ok=True)

async def route_api(route):
    url = urlparse(route.request.url)
    symbol = parse_qs(url.query).get("symbol", ["AAPL"])[0]
    if url.path.endswith("/api/valuation-inputs"):
        if symbol not in DATA:
            await route.fulfill(status=404, json={"error": "unsupported test ticker"})
        else:
            await route.fulfill(status=200, json=DATA[symbol])
    else:
        await route.fulfill(status=200, json={"error": "outside isolated valuation UI fixture"})

async def check(browser, name, width, height, lang="he"):
    context = await browser.new_context(viewport={"width": width, "height": height}, has_touch=width<=1024)
    await context.add_init_script("localStorage.setItem('wc_lang',"+json.dumps(lang)+")")
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    await page.route("**/api/**", route_api)
    # Prove the actual homepage -> Terminal -> Equities path, not just a deep link.
    await page.goto("http://127.0.0.1:8765/index.html", wait_until="domcontentloaded")
    await page.locator('a[data-i18n="hero.enter"]').click()
    await page.wait_for_url("**/terminal_app.html")
    assert await page.locator("#page-welcome").is_visible()
    menu = page.locator("#terminalMenuButton")
    panel = page.locator("#navPanel")
    assert await menu.is_visible()
    assert ("תפריט הטרמינל" if lang=="he" else "Terminal menu") in await menu.inner_text()
    menu_box = await menu.bounding_box()
    assert menu_box and menu_box["height"] >= 44 and menu_box["x"] >= 0 and menu_box["x"]+menu_box["width"] <= width
    if width <= 800:
        assert await panel.get_attribute("aria-hidden") == "true"
        assert await panel.evaluate("el=>el.inert")
        await menu.focus()
        await page.keyboard.press("Enter")
    assert await panel.get_attribute("aria-hidden") == "false"
    assert await menu.get_attribute("aria-expanded") == "true"
    if width <= 800:
        await page.wait_for_function("""() => Math.abs(document.querySelector('#navPanel').getBoundingClientRect().right-document.querySelector('#navBackdrop').getBoundingClientRect().left)<1""")
        bounds=await page.evaluate("""() => ({panel:document.querySelector('#navPanel').getBoundingClientRect().right,backdrop:document.querySelector('#navBackdrop').getBoundingClientRect().left})""")
        assert abs(bounds["panel"]-bounds["backdrop"]) <= 1, bounds
        await page.locator("#navBackdrop").click(position={"x":5,"y":5})
        assert await panel.get_attribute("aria-hidden") == "true"
        await menu.click()
    valuation_link = page.locator("#items-equities a[data-page=valuation]")
    assert await valuation_link.get_attribute("href") == "#valuation"
    await valuation_link.scroll_into_view_if_needed()
    await page.screenshot(path=str(OUT / f"{name}-menu.png"), full_page=True)
    await valuation_link.click()
    assert page.url.endswith("#valuation")
    assert await valuation_link.get_attribute("aria-current") == "page"
    assert await page.locator(".top-nav").is_visible()
    if width <= 800:
        assert await panel.get_attribute("aria-hidden") == "true"
        await menu.click()
        assert await panel.get_attribute("aria-hidden") == "false"
        await page.keyboard.press("Escape")
        assert await panel.get_attribute("aria-hidden") == "true"
        assert await menu.evaluate("el=>el===document.activeElement")
    else:
        assert await panel.get_attribute("aria-hidden") == "false"
    await page.locator("#vw-summary-base").filter(has_text="$242.08").wait_for(timeout=30000)
    assert await page.locator("#items-equities [data-page=valuation]").count() == 1
    assert await page.locator(".vw-scenario").count() == 3
    assert await page.locator("#vw-advanced-toggle").get_attribute("aria-expanded") == "false"
    assert await page.locator("#vw-tbody tr:not([hidden])").count() == 7
    assert not await page.locator("[data-row=cash]").is_visible()
    await page.screenshot(path=str(OUT / f"{name}-basic.png"), full_page=True)
    # Direct jump must bring the actual worksheet into the scrollable main pane.
    await page.locator(".vw-jump-table").click()
    await page.locator("[data-row=revenue]").scroll_into_view_if_needed()
    metrics = await page.evaluate("""() => {
      const main=document.querySelector('.main'), table=document.querySelector('#vw-table-panel');
      const cell=document.querySelector('[data-row=revenue]').getBoundingClientRect();
      return {pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,
        mainOverflow:getComputedStyle(main).overflowY,mainClient:main.clientHeight,mainScroll:main.scrollHeight,
        tableClient:table.clientWidth,tableScroll:table.scrollWidth,tableHeight:table.clientHeight,
        tableContent:table.scrollHeight,rowTop:cell.top,rowBottom:cell.bottom,viewportHeight:innerHeight};
    }""")
    assert metrics["pageWidth"] <= metrics["viewport"]+2, metrics
    assert metrics["mainOverflow"] == "auto", metrics
    assert metrics["mainScroll"] > metrics["mainClient"], metrics
    assert metrics["tableContent"] <= metrics["tableHeight"]+3, metrics
    assert 0 <= metrics["rowTop"] < metrics["viewportHeight"], metrics
    assert page.url.endswith("#valuation"), page.url
    # Per-year edit propagates without a hidden acknowledgement step.
    await page.locator("#vw-cell-growth-0").fill("20")
    assert "$242.08" != await page.locator("#vw-summary-base").inner_text()
    assert ("השתנה" if lang=="he" else "changed") in await page.locator("#vw-change-sentence").inner_text()
    await page.locator("#vw-advanced-toggle").click()
    assert await page.locator("[data-row=cash]").is_visible()
    before = await page.locator("#vw-summary-base").inner_text()
    await page.locator("#vw-cell-claims-4").fill("10000")
    assert before != await page.locator("#vw-summary-base").inner_text()
    # Advanced rows can be reached vertically; last forecast year horizontally.
    await page.locator("#vw-cell-claims-4").scroll_into_view_if_needed()
    scrolled = await page.locator("#vw-table-panel").evaluate("el=>el.scrollLeft")
    assert scrolled>0, scrolled
    await page.screenshot(path=str(OUT / f"{name}-advanced.png"), full_page=True)
    await page.locator("#vw-advanced-toggle").click()
    assert not await page.locator("[data-row=cash]").is_visible()
    assert await page.locator("#vw-cell-growth-0").input_value() == "20"
    await page.locator("#vw-reference summary").click()
    model_price = await page.locator("#vw-summary-base").inner_text()
    await page.locator("#vw-reference-price").fill("200")
    assert ("ללא מחיר" if lang=="he" else "No price comparison") in await page.locator("#vw-upside-base").inner_text()
    await page.locator("#vw-reference-date").fill("2020-01-01")
    assert "%" in await page.locator("#vw-upside-base").inner_text()
    assert await page.locator("#vw-summary-base").inner_text() == model_price
    await page.locator("[data-company=MSFT]").click()
    await page.locator("#vw-company-symbol").filter(has_text="MSFT").wait_for(timeout=30000)
    assert await page.locator("#vw-reference-price").input_value() == ""
    assert "331,839" in await page.locator("#vw-tbody").inner_text()
    # Return through another real menu item and reopen valuation in the same shell.
    if width <= 800: await menu.click()
    await page.locator('#items-equities [data-page="research"]').click()
    assert await page.locator("#page-research").is_visible()
    assert not page.url.endswith("#valuation")
    if width <= 800: await menu.click()
    await valuation_link.click()
    assert await page.locator("#page-valuation").is_visible()
    assert page.url.endswith("#valuation")
    # A reload and the legacy route must retain the full shell and selected item.
    await page.reload(wait_until="domcontentloaded")
    await page.locator("#vw-summary-base").filter(has_text="$242.08").wait_for(timeout=30000)
    assert await page.locator('#items-equities [aria-current="page"]').get_attribute("data-page") == "valuation"
    await page.goto("http://127.0.0.1:8765/terminal.html#valuation", wait_until="domcontentloaded")
    await page.wait_for_url("**/terminal_app.html#valuation")
    await page.locator("#vw-summary-base").filter(has_text="$242.08").wait_for(timeout=30000)
    assert await page.locator("#terminalMenuButton").is_visible()
    assert await page.locator(".top-nav").is_visible()
    # Source navigation and return do not expose private admin navigation.
    await page.locator("#vw-advanced-toggle").click()
    await page.locator("#vw-method").click()
    assert await page.locator("#page-sources").is_visible()
    await page.evaluate("navigate('valuation')")
    assert await page.locator("#page-valuation").is_visible()
    assert await page.locator(".nav-panel a[href*='calculation']").count() == 0
    report={"viewport":name,"dimensions":[width,height],"passed":True,"layout":metrics,"other_page_errors":errors}
    await context.close()
    return report

async def main():
    server = ThreadingHTTPServer(("127.0.0.1",8765), functools.partial(SimpleHTTPRequestHandler,directory=str(ROOT/"apps/terminal/public")))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        async with async_playwright() as p:
            browser=await p.chromium.launch()
            results=[]
            for args in [("desktop",1440,900),("desktop-compact",1100,800),("desktop-compact-en",1100,800,"en"),("tablet-boundary",800,800),("desktop-boundary",801,800),("narrow-embed",750,650),("ipad-landscape",1024,768),("ipad-portrait",768,1024),("phone",390,844)]:
                print("Checking viewport: "+args[0],flush=True)
                results.append(await check(browser,*args))
                (OUT/"report.json").write_text(json.dumps(results,ensure_ascii=False,indent=2))
            await browser.close()
            (OUT/"report.json").write_text(json.dumps(results,ensure_ascii=False,indent=2))
            print(json.dumps(results,ensure_ascii=False))
    finally:
        server.shutdown()

if __name__=="__main__":asyncio.run(main())
