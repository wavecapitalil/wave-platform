#!/usr/bin/env python3
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

BASE="http://127.0.0.1:5001"
OUT=Path("browser_qa")
OUT.mkdir(exist_ok=True)

PAGES=[
    ("seasonality","Seasonality Scanner"),
    ("commodities","Gold / Silver Ratio"),
    ("comm-flows","Cross-Asset Flows"),
    ("confluence","Confluence Monitor"),
    ("hormuz","Hormuz Energy Risk Monitor"),
]

async def assert_no_horizontal_overflow(page, label):
    overflow = await page.evaluate("""() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth
    })""")
    if overflow["sw"] > overflow["cw"] + 8:
        raise AssertionError(f"{label}: horizontal overflow {overflow}")

async def wait_not_loading(page, selector, timeout=45000):
    loc=page.locator(selector)
    await loc.wait_for(state="visible", timeout=timeout)
    try:
        await page.wait_for_function(
            """sel => {
              const el=document.querySelector(sel);
              if(!el) return false;
              const t=(el.innerText||'').toLowerCase();
              return !t.includes('loading') && !t.includes('select a lens');
            }""",
            arg=selector,
            timeout=timeout,
        )
    except PlaywrightTimeout:
        pass

async def run_viewport(browser, name, width, height):
    context=await browser.new_context(viewport={"width":width,"height":height})
    page=await context.new_page()
    page_errors=[]
    page.on("pageerror", lambda exc: page_errors.append(str(exc)))

    await page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_function("typeof navigate === 'function'", timeout=30000)

    report={"viewport":name,"pages":[]}

    for slug,title in PAGES:
        await page.evaluate(f"navigate('{slug}')")
        active=page.locator(f"#page-{slug}")
        await active.wait_for(state="visible", timeout=15000)

        # Product-level checks
        if slug=="seasonality":
            await page.locator("#seas-line-chart").wait_for(state="visible")
            await wait_not_loading(page,"#seas-updated",60000)
            await page.locator("#page-seasonality").screenshot(path=str(OUT/f"{name}-seasonality.png"))
        elif slug=="commodities":
            await page.locator("#gsrCurrent").wait_for(state="visible")
            await page.wait_for_function("""() => {
                const x=document.querySelector('#gsrCurrent');
                return x && x.innerText.trim() !== '—';
            }""", timeout=60000)
            body=(await active.inner_text()).upper()
            assert "STRONGLY FAVORS" not in body
            assert "FAVORS SILVER" not in body
            assert "FAVORS GOLD" not in body
            await active.screenshot(path=str(OUT/f"{name}-metals.png"))
        elif slug=="comm-flows":
            await page.locator("#flowTabCrypto").wait_for(state="visible")
            await wait_not_loading(page,"#flowContent",60000)
            assert "Advertising Intelligence" not in await active.inner_text()
            # Exercise another lens, not just the default.
            await page.locator("#flowTabOptions").click()
            await wait_not_loading(page,"#flowContent",60000)
            await active.screenshot(path=str(OUT/f"{name}-flows.png"))
        elif slug=="confluence":
            await page.locator("#confSymbol").fill("AAPL")
            await page.locator("#confSymbol").press("Enter")
            await page.wait_for_function("""() => {
                const x=document.querySelector('#confResults');
                return x && x.innerText.includes('/3');
            }""", timeout=120000)
            await active.screenshot(path=str(OUT/f"{name}-confluence.png"))
        elif slug=="hormuz":
            await page.wait_for_function("""() => {
                const x=document.querySelector('#hormuzThreatBig');
                return x && ['GREEN','YELLOW','RED'].includes(x.innerText.trim());
            }""", timeout=60000)
            body=await active.inner_text()
            assert "Sensitivity Score" not in body
            assert "top 15 stocks" not in body.lower()
            await active.screenshot(path=str(OUT/f"{name}-hormuz.png"))

        await assert_no_horizontal_overflow(page, f"{name}/{slug}")
        report["pages"].append({"page":slug,"ok":True})

    # Navigation naming checks
    nav_text=await page.locator(".nav-panel").inner_text()
    assert "Cross-Asset Flows" in nav_text
    assert "Confluence" in nav_text
    assert "Hormuz Risk" in nav_text

    report["page_errors"]=page_errors
    # Only fail on actual uncaught JS errors, not console warnings.
    if page_errors:
        raise AssertionError(f"{name}: uncaught JS errors: {page_errors[:5]}")

    await context.close()
    return report

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch()
        reports=[]
        reports.append(await run_viewport(browser,"desktop",1440,1000))
        reports.append(await run_viewport(browser,"ipad",1024,1366))
        await browser.close()

    (OUT/"report.json").write_text(json.dumps(reports,indent=2),encoding="utf-8")
    print(json.dumps(reports,indent=2))

asyncio.run(main())
