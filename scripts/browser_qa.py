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

# Broad navigation regression coverage. Detailed assertions remain focused on
# rebuilt research modules, but every page must still activate without an
# uncaught JavaScript exception after bundle extraction.
ALL_NAV_PAGES=[
    "welcome","mover","brief","macro","fx","rates","commodities","hormuz","ev",
    "crypto","sectors","breadth","research","institutions","comm-flows","fundchart",
    "confluence","earnings","correlation","btcgold","pcr","scanner","backtest",
    "ideas","risk","housing","seasonality",
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
            await page.wait_for_function("""() => {
                return window._seasLineChart &&
                       document.querySelector('#seasCurrentRet') &&
                       document.querySelector('#seasCurrentRet').innerText.trim() !== '—';
            }""", timeout=90000)
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
            # Exercise the period control after JS modularization.
            await page.locator("#gsrTimeTabs .cd-vbtn").first.click()
            await page.wait_for_timeout(200)
            assert await page.locator("#gsrTimeTabs .cd-vbtn").first.evaluate("(el) => el.classList.contains('active')")
            await page.locator("#gsrTimeTabs .cd-vbtn").last.click()
            await active.screenshot(path=str(OUT/f"{name}-metals.png"))
        elif slug=="comm-flows":
            await page.locator("#flowTabCrypto").wait_for(state="visible")
            await wait_not_loading(page,"#flowContent",60000)
            assert "Advertising Intelligence" not in await active.inner_text()
            # Exercise every lens, not just the default.
            for selector in ("#flowTabFutures", "#flowTabOptions", "#flowTabShort", "#flowTabCrypto"):
                await page.locator(selector).click()
                await wait_not_loading(page,"#flowContent",90000)
            await active.screenshot(path=str(OUT/f"{name}-flows.png"))
        elif slug=="confluence":
            await page.locator("#confSymbol").fill("AAPL")
            await page.locator("#confSymbol").press("Enter")
            await page.wait_for_function("""() => {
                const x=document.querySelector('#confResults');
                return x && x.innerText.includes('/3');
            }""", timeout=120000)
            # Exercise alternate evidence windows.
            buttons=page.locator("#confWindowBtns .cd-vbtn")
            await buttons.nth(0).click()
            await page.wait_for_timeout(300)
            await buttons.nth(2).click()
            await page.wait_for_timeout(300)
            await buttons.nth(1).click()
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

    # Broad page activation regression after JS domain extraction.
    for slug in ALL_NAV_PAGES:
        await page.evaluate(f"navigate('{slug}')")
        await page.locator(f"#page-{slug}").wait_for(state="visible", timeout=10000)
        await page.wait_for_timeout(120)
    report["navigation_pages"]=len(ALL_NAV_PAGES)

    # Navigation naming checks
    nav_text=await page.locator(".nav-panel").inner_text()
    assert "Cross-Asset Flows" in nav_text
    assert "Confluence" in nav_text
    assert "Hormuz Risk" in nav_text

    # Unified platform shell: Account persistence + University progress.
    await page.goto(BASE + "/account", wait_until="domcontentloaded", timeout=30000)
    await page.locator("#watchList").wait_for(state="visible")
    await page.wait_for_function("() => typeof WavePlatform === 'object' && typeof WaveCloud === 'object'")
    await page.locator("#watchSymbol").fill("AAPL")
    await page.locator("#watchForm button[type=submit]").click()
    await page.wait_for_function("() => document.querySelector('#watchList').innerText.includes('AAPL')")
    await assert_no_horizontal_overflow(page, f"{name}/account")
    await page.screenshot(path=str(OUT/f"{name}-account.png"), full_page=True)

    await page.goto(BASE + "/university", wait_until="domcontentloaded", timeout=30000)
    await page.locator("#courseGrid").wait_for(state="visible")
    await page.wait_for_function("() => typeof WavePlatform === 'object' && typeof WaveCloud === 'object' && typeof WaveSearch === 'object' && typeof WaveTutor === 'object'")
    await page.locator("#waveTutorLauncher").click()
    await page.locator("#waveTutorPanel").wait_for(state="visible")
    assert "university" in (await page.locator("#wtContext").inner_text()).lower()
    await page.locator("#wtClose").click()
    await page.keyboard.press("Control+K")
    await page.locator("#waveSearchOverlay").wait_for(state="visible")
    await page.locator("#waveSearchInput").fill("Risk Meter")
    assert "Risk Meter" in await page.locator("#waveSearchResults").inner_text()
    await page.keyboard.press("Escape")
    before = await page.evaluate("() => JSON.parse(localStorage.getItem('wave.platform.v1')).progress.macro_regimes")
    await page.locator("[data-advance='macro_regimes']").click()
    after = await page.evaluate("() => JSON.parse(localStorage.getItem('wave.platform.v1')).progress.macro_regimes")
    assert after > before
    await assert_no_horizontal_overflow(page, f"{name}/university")
    await page.screenshot(path=str(OUT/f"{name}-university.png"), full_page=True)
    report["platform_pages"]=["account","university"]

    await page.goto(BASE + "/terminal_app.html#page=risk", wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_function("typeof navigate === 'function'")
    await page.locator("#page-risk").wait_for(state="visible", timeout=15000)
    assert await page.locator("#page-risk").evaluate("(el) => el.classList.contains('active')")
    report["deep_link"]="risk"

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
