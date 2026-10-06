#!/usr/bin/env python3
import asyncio
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

BASE=os.getenv("WAVE_BROWSER_BASE","http://127.0.0.1:5001").rstrip("/")
IS_PRODUCTION=not ("127.0.0.1" in BASE or "localhost" in BASE)
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
    context=await browser.new_context(viewport={"width":width,"height":height}, has_touch=(width <= 480), is_mobile=(width <= 480))
    page=await context.new_page()
    page_errors=[]
    page.on("pageerror", lambda exc: page_errors.append(str(exc)))

    report={"viewport":name,"pages":[]}

    # Public Home: live terminal preview + sourced market story.
    await page.goto(BASE + "/index.html", wait_until="domcontentloaded", timeout=60000)
    await page.locator("#latestStoryTitle").wait_for(state="visible", timeout=30000)
    await page.wait_for_function("""() => {
      const t=document.querySelector('#latestStoryTitle');
      const s=document.querySelector('#latestStorySummary');
      const src=document.querySelector('#latestStorySource');
      const a=document.querySelector('#latestStoryLink');
      return t && s && src && a &&
             t.innerText.trim() && !t.innerText.includes('Fetching') &&
             s.innerText.trim() && s.innerText.trim() !== '—' &&
             src.innerText.trim() && src.innerText.trim() !== '—' &&
             a.href.startsWith('https://');
    }""", timeout=60000)
    await page.wait_for_function("""() => {
      const v=document.querySelector('#tpVix');
      const b=document.querySelector('#tpBtc');
      const g=document.querySelector('#tpGold');
      return [v,b,g].every(x => x && x.innerText.trim() && x.innerText.trim() !== '—');
    }""", timeout=60000)
    await assert_no_horizontal_overflow(page, f"{name}/home")
    await page.screenshot(path=str(OUT/f"{name}-home.png"), full_page=True)
    report["home"]={"ok":True,"story":await page.locator("#latestStoryTitle").inner_text()}

    # Terminal application.
    await page.goto(BASE + "/terminal_app.html", wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_function("typeof navigate === 'function'", timeout=30000)

    # Terminal Home itself must populate market data from the production gateway.
    await page.wait_for_function("""() => {
      const ids=['s-sp','s-qqq','s-vix','s-10y','s-wti','s-gold','s-btc'];
      return ids.every(id => {
        const el=document.getElementById(id);
        return el && el.innerText.trim() && el.innerText.trim() !== '—';
      });
    }""", timeout=90000)
    report["terminal_home_market_data"]={
        "sp":await page.locator("#s-sp").inner_text(),
        "qqq":await page.locator("#s-qqq").inner_text(),
        "vix":await page.locator("#s-vix").inner_text(),
        "ten_year":await page.locator("#s-10y").inner_text(),
        "wti":await page.locator("#s-wti").inner_text(),
        "gold":await page.locator("#s-gold").inner_text(),
        "btc":await page.locator("#s-btc").inner_text(),
    }

    if width <= 480:
        # Mobile Home must be a real one-column flow with no card overlap.
        await page.evaluate("navigate('welcome')")
        await page.wait_for_timeout(300)
        news=page.locator(".home-news-side")
        sidebar=page.locator(".hero-sidebar")
        nb=await news.bounding_box()
        sb=await sidebar.bounding_box()
        assert nb and sb
        assert sb["y"] >= nb["y"] + nb["height"] - 2, f"Home overlap: news={nb} sidebar={sb}"
        home_cols=await page.locator(".home-content-row").evaluate("(el)=>getComputedStyle(el).gridTemplateColumns")
        assert " " not in home_cols.strip(), f"Home still multi-column on iPhone: {home_cols}"

        # Mobile drawer is closed by default and must not cover the content.
        await page.wait_for_function("""() => {
          const p=document.querySelector('#navPanel');
          return p && p.classList.contains('collapsed');
        }""", timeout=10000)
        reopen=page.locator("#navReopen")
        await reopen.wait_for(state="visible")
        await reopen.click()
        await page.wait_for_function("""() => {
          const p=document.querySelector('#navPanel');
          return p && !p.classList.contains('collapsed');
        }""", timeout=10000)

        # Drawer must be viewport-fixed below the topbar+ticker, not tied to page scroll.
        nav=page.locator("#navPanel")
        pos=await nav.evaluate("(el)=>({position:getComputedStyle(el).position,top:parseFloat(getComputedStyle(el).top)})")
        ticker_bottom=await page.locator(".ticker-bar").evaluate("(el)=>el.getBoundingClientRect().bottom")
        assert pos["position"] == "fixed", pos
        assert abs(float(pos["top"]) - float(ticker_bottom)) < 2, f"drawer top {pos['top']} != ticker bottom {ticker_bottom}"
        before=await nav.bounding_box()
        await page.locator(".main").evaluate("(el)=>{el.scrollTop=700}")
        await page.wait_for_timeout(120)
        after=await nav.bounding_box()
        assert before and after and abs(before["y"]-after["y"]) < 2, f"Drawer moved with page scroll: {before} -> {after}"

        # Drawer itself must scroll to the last navigation item.
        last_item=page.locator("#navPanel .nav-item").last
        await last_item.scroll_into_view_if_needed()
        last_box=await last_item.bounding_box()
        nav_box=await nav.bounding_box()
        assert last_box and nav_box and last_box["y"] + last_box["height"] <= nav_box["y"] + nav_box["height"] + 4

        # A real scroll gesture inside the drawer must never close it.
        await nav.hover()
        await page.mouse.wheel(0,-700)
        await page.wait_for_timeout(150)
        assert not await nav.evaluate("(el)=>el.classList.contains('collapsed')")

        # Simulate iOS touch movement ending over a nav item; gesture guard must
        # suppress the synthetic click that used to close the drawer.
        await page.evaluate("""() => {
          const p=document.querySelector('#navPanel');
          const item=p.querySelector('.nav-item[data-page="risk"]');
          const t={clientY:500,clientX:40};
          p.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[new Touch({identifier:1,target:item,clientX:40,clientY:500})]}));
          p.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,touches:[new Touch({identifier:1,target:item,clientX:40,clientY:430})]}));
          item.click();
        }""")
        await page.wait_for_timeout(100)
        assert not await nav.evaluate("(el)=>el.classList.contains('collapsed')")

        # Choosing Risk with a genuine tap closes the drawer and leaves the Risk page full-width.
        risk_nav=page.locator('#navPanel .nav-item[data-page="risk"]')
        await risk_nav.scroll_into_view_if_needed()
        await risk_nav.click()
        await page.wait_for_function("""() => document.querySelector('#navPanel').classList.contains('collapsed')""")
        await page.locator("#page-risk").wait_for(state="visible")
        cols=await page.locator("#page-risk .rsig-top-row").evaluate("(el)=>getComputedStyle(el).gridTemplateColumns")
        assert " " not in cols.strip(), f"phone risk top row is not single-column: {cols}"
        grid_cols=await page.locator("#riskSignalGrid").evaluate("(el)=>getComputedStyle(el).gridTemplateColumns")
        assert " " not in grid_cols.strip(), f"phone risk cards are not single-column: {grid_cols}"
        await assert_no_horizontal_overflow(page, f"{name}/terminal-mobile")
        await page.screenshot(path=str(OUT/f"{name}-terminal-mobile.png"), full_page=True)
        report["mobile_drawer"]={"scrollable":True,"auto_closes":True,"risk_single_column":True}

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
            crypto_text=await page.locator("#flowContent").inner_text()
            if IS_PRODUCTION:
                assert "Global Accounts" in crypto_text and "Top Trader Accounts" in crypto_text and "Top Trader Positions" in crypto_text
                assert "L/S ratio: —" not in crypto_text, f"Crypto positioning missing values: {crypto_text}"
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
            await page.wait_for_function("""() => {
                const x=document.querySelector('#confResults');
                return x && x.innerText.includes('/3') && !x.innerText.toLowerCase().includes('checking');
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

    # Canonical Risk Meter must render the backend composite exactly.
    await page.evaluate("navigate('risk')")
    await page.locator("#page-risk").wait_for(state="visible", timeout=15000)
    await page.wait_for_function("""() => {
      const x=document.querySelector('#riskScoreNum');
      return x && Number.isFinite(Number(x.innerText.trim()));
    }""", timeout=60000)
    canonical=await page.evaluate("""async () => {
      const r=await fetch(window.API + '/api/risk-signals');
      const d=await r.json();
      if(d.score && Number.isFinite(Number(d.score.composite))) return Number(d.score.composite);
      if(typeof scoreRiskSignals === 'function') return Number(scoreRiskSignals(d).composite);
      return null;
    }""")
    visible=int((await page.locator("#riskScoreNum").inner_text()).strip())
    assert canonical is not None, "Risk canonical/fallback score unavailable"
    assert visible == int(canonical), f"Risk UI {visible} != expected {canonical}"
    await page.locator("#page-risk").screenshot(path=str(OUT/f"{name}-risk.png"))
    report["risk"]={"visible":visible,"canonical":canonical}

    # Company Research: arbitrary ticker not dependent on a pre-warmed cache.
    await page.evaluate("navigate('research')")
    await page.locator("#page-research").wait_for(state="visible", timeout=15000)
    await page.locator("#researchInput").fill("BE")
    await page.evaluate("runResearch()")
    await page.wait_for_function("""() => {
      const result=document.querySelector('#researchResult');
      const name=document.querySelector('#resNameLine');
      const price=document.querySelector('#resPriceLine');
      const status=document.querySelector('#researchStatus');
      return result && result.style.display !== 'none' &&
             name && /Bloom Energy/i.test(name.innerText) &&
             price && price.innerText.trim() !== '—' &&
             (!status || !status.innerText.startsWith('Error'));
    }""", timeout=90000)
    assert "Industrials" in await page.locator("#resIndustryLine").inner_text()
    report["company_research_dynamic"]={"ticker":"BE","ok":True}

        # Fundamental comparison: two companies, multiple KPIs, real chart + table.
    await page.evaluate("navigate('fundchart')")
    await page.locator("#page-fundchart").wait_for(state="visible", timeout=15000)
    await page.locator("#fcTicker1").fill("MSFT")
    await page.locator("#fcTicker2").fill("HOOD")
    net_margin=page.locator("#fcMetricPills button", has_text="Net Margin")
    await net_margin.click()
    await page.evaluate("runFundChart()")
    await page.wait_for_function("""() => {
      const wrap=document.querySelector('#fcChartWrap');
      const legend=document.querySelector('#fcLegend');
      const table=document.querySelector('#fcTable');
      const status=document.querySelector('#fcStatus');
      return wrap && wrap.style.display !== 'none' &&
             legend && legend.innerText.includes('MSFT') && legend.innerText.includes('HOOD') &&
             table && table.innerText.includes('MSFT') && table.innerText.includes('HOOD') &&
             (!status || !status.innerText.startsWith('Error'));
    }""", timeout=120000)
    chart_state=await page.evaluate("""() => {
      const c=document.querySelector('#fcCanvas');
      const r=c?c.getBoundingClientRect():null;
      return {width:r?.width||0,height:r?.height||0,hasChart:!!window._fcChart};
    }""")
    assert chart_state["width"] > 100 and chart_state["height"] > 100 and chart_state["hasChart"], f"Fundamental chart not rendered: {chart_state}"
    await page.locator("#page-fundchart").screenshot(path=str(OUT/f"{name}-fundamentals.png"))
    report["fundamentals"]={"pair":"MSFT vs HOOD","metrics":["revenue","net_margin"],"ok":True}

    # Broad page activation regression after JS domain extraction.
    generic_page_failures=[]
    for slug in ALL_NAV_PAGES:
        await page.evaluate(f"navigate('{slug}')")
        active_page=page.locator(f"#page-{slug}")
        await active_page.wait_for(state="visible", timeout=10000)
        await page.wait_for_timeout(350)
        body=(await active_page.inner_text()).lower()
        bad_markers=[
            "route_not_available_on_edge",
            "http 404",
            "http 500",
            "failed —",
            "failed to load",
            "networkerror",
            "typeerror:",
        ]
        hits=[x for x in bad_markers if x in body]
        if hits:
            generic_page_failures.append({"page":slug,"markers":hits})
    assert not generic_page_failures, f"Terminal page failures: {generic_page_failures}"
    report["navigation_pages"]=len(ALL_NAV_PAGES)

    # Navigation naming checks
    nav_text=await page.locator(".nav-panel").inner_text()
    assert "Cross-Asset Flows" in nav_text
    assert "Confluence" in nav_text
    assert "Hormuz Risk" in nav_text

    # Unified platform shell: Account persistence + University progress.
    await page.goto(BASE + "/account.html", wait_until="domcontentloaded", timeout=30000)
    await page.locator("#watchList").wait_for(state="visible")
    await page.wait_for_function("() => typeof WavePlatform === 'object' && typeof WaveCloud === 'object'")
    await page.locator("#watchSymbol").fill("AAPL")
    await page.locator("#watchForm button[type=submit]").click()
    await page.wait_for_function("() => document.querySelector('#watchList').innerText.includes('AAPL')")
    await assert_no_horizontal_overflow(page, f"{name}/account")
    await page.screenshot(path=str(OUT/f"{name}-account.png"), full_page=True)

    await page.goto(BASE + "/university.html", wait_until="domcontentloaded", timeout=30000)
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

    # Internal operations page stays outside customer navigation, but must render
    # production telemetry correctly on desktop and iPad.
    if not IS_PRODUCTION:
        await page.route("**/wave-data/api/data-health**", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body=json.dumps({
            "generated_at":"2026-10-03T20:00:00Z",
            "engine_cadence_minutes":60,
            "summary":{"total":3,"ok":3,"partial":0,"error":0,"stale":0,"fallback":0,"groups":3},
            "datasets":[
                {"dataset_key":"market:core","dataset_group":"market","source":"Yahoo Finance","source_timestamp":"2026-10-03T19:59:00Z","fetched_at":"2026-10-03T19:59:10Z","calculated_at":"2026-10-03T19:59:12Z","expires_at":"2026-10-03T20:14:12Z","logic_version":"market_snapshot_v1.0","freshness":"60m_snapshot","stale":False,"fallback":False,"status":"ok","error":None,"updated_at":"2026-10-03T19:59:12Z","age_seconds":48,"expires_in_seconds":852},
                {"dataset_key":"risk:composite","dataset_group":"risk","source":"Yahoo Finance + CBOE","source_timestamp":"2026-10-03T19:59:00Z","fetched_at":"2026-10-03T19:59:10Z","calculated_at":"2026-10-03T19:59:14Z","expires_at":"2026-10-03T20:14:14Z","logic_version":"risk_meter_v1.0","freshness":"15m_snapshot","stale":False,"fallback":False,"status":"ok","error":None,"updated_at":"2026-10-03T19:59:14Z","age_seconds":46,"expires_in_seconds":854},
                {"dataset_key":"api:/api/earnings","dataset_group":"earnings","source":"WAVE Flask route /api/earnings","source_timestamp":"2026-10-03T19:55:00Z","fetched_at":"2026-10-03T19:55:00Z","calculated_at":"2026-10-03T19:55:03Z","expires_at":"2026-10-04T01:55:03Z","logic_version":"flask_route_v1.0","freshness":"360m_snapshot","stale":False,"fallback":False,"status":"ok","error":None,"updated_at":"2026-10-03T19:55:03Z","age_seconds":297,"expires_in_seconds":21303}
            ]
        })
        ))
    await page.goto(BASE + "/data-health.html", wait_until="domcontentloaded", timeout=30000)
    if IS_PRODUCTION:
        await page.wait_for_function("() => Number(document.querySelector('#statTotal')?.innerText || 0) >= 300", timeout=30000)
        assert int((await page.locator("#statIssues").inner_text()).strip()) == 0
        assert await page.locator("#healthRows tr").count() >= 300
    else:
        await page.wait_for_function("() => document.querySelector('#statTotal') && document.querySelector('#statTotal').innerText === '3'", timeout=15000)
        assert "All production datasets healthy" in await page.locator("#bannerTitle").inner_text()
        assert await page.locator("#healthRows tr").count() == 3
    await page.locator("#searchInput").fill("risk")
    await page.wait_for_timeout(100)
    assert await page.locator("#healthRows tr").count() == 1
    await page.locator("#healthRows tr").first.click()
    await page.locator("#detailDrawer").wait_for(state="visible")
    assert "risk:composite" in await page.locator("#drawerTitle").inner_text()
    await assert_no_horizontal_overflow(page, f"{name}/data-health")
    await page.screenshot(path=str(OUT/f"{name}-data-health.png"), full_page=True)
    report["platform_pages"].append("data-health")

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
        reports.append(await run_viewport(browser,"iphone",390,844))
        await browser.close()

    (OUT/"report.json").write_text(json.dumps(reports,indent=2),encoding="utf-8")
    print(json.dumps(reports,indent=2))

asyncio.run(main())
