"""Deterministic full-shell UI QA; synthetic fixtures are tests only, never served in production."""
import asyncio
import functools
import json
import os
import threading
from datetime import date, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get("WAVE_PRICE_QA_OUT", "/tmp/wave-price-events-qa"))
CHART = Path(os.environ.get("WAVE_CHART_JS", "/tmp/wave-chart-4.4.0.js"))


def fixture(symbol="AAPL", selected_range="1y", no_events=False):
    points = []
    day = date(2026, 5, 1)
    for i in range(90):
        day += timedelta(days=1)
        if day.weekday() > 4:
            continue
        value = 150 + i * .3 + (i % 8 - 4) * 2
        points.append({"date": day.isoformat(), "close": value, "raw_close": value,
                       "change_pct": 1.2, "benchmark_change_pct": .2, "excess_change_pp": 1})
    events = [] if no_events else [{"id": "test-" + str(i), "date": points[i]["date"], "index": i,
        "price": points[i]["close"], "title": "Fixture earnings release <not HTML>",
        "summary": "A test-only company announcement near a large move, without causal attribution.",
        "source": "Test fixture", "url": "https://example.com/release-" + str(i),
        "published_at": points[i]["date"], "relationship": "context", "reason": "large_move",
        "change_pct": 5.3, "benchmark_change_pct": .2, "excess_change_pp": 5.1,
        "timing": "Date-only publication → next session"} for i in (10, 25, 42)]
    return {"symbol": symbol, "range": selected_range, "currency": "USD", "exchange_timezone": "America/New_York",
        "price_basis": "split_dividend_adjusted", "points": points, "events": events,
        "summary": {"start_date": points[0]["date"], "end_date": points[-1]["date"],
                    "change_pct": 12.4, "high": max(p["close"] for p in points), "low": min(p["close"] for p in points)},
        "meta": {"fetched_at": "2026-10-08T18:00:00Z", "news_status": "ok", "news_coverage": "Recent headlines only", "limitations": ["TEST FIXTURE"], "benchmark": "SPY"}}


async def check(browser, name, width, height, lang):
    context = await browser.new_context(viewport={"width": width, "height": height}, has_touch=width <= 1024)
    await context.add_init_script("localStorage.setItem('wc_lang'," + json.dumps(lang) + ")")
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    settings = {"failure": False, "empty": False, "delay": False, "mismatch": False}

    async def api(route):
        u = urlparse(route.request.url)
        q = parse_qs(u.query)
        symbol = q.get("symbol", ["AAPL"])[0]
        selected_range = q.get("range", ["1y"])[0]
        if u.path.endswith("/api/price-history"):
            if settings["delay"] and symbol == "AAPL":
                await asyncio.sleep(.8)
            if settings["failure"]:
                await route.fulfill(status=502, json={"error": "test outage"})
            else:
                data = fixture(symbol, selected_range, settings["empty"])
                if settings["mismatch"]:
                    data["symbol"] = "WRONG"
                await route.fulfill(json=data)
        elif u.path.endswith("/api/stock-info"):
            if settings["delay"] and symbol == "AAPL":
                await asyncio.sleep(.9)
            await route.fulfill(json={"symbol": symbol, "name": symbol + " Test Company", "price": 180.2, "market_cap": 1e12})
        elif u.path.endswith("/api/peers"):
            await route.fulfill(json={"error": "Fixture does not cover peers"})
        else:
            await route.fulfill(json={"error": "Outside isolated price-chart fixture"})
    await page.route("**/api/**", api)
    if CHART.exists():
        await page.route("**/chart.umd.min.js", lambda r: r.fulfill(path=str(CHART), content_type="application/javascript"))
    await page.goto("http://127.0.0.1:8771/terminal_app.html", wait_until="domcontentloaded")
    await page.evaluate("navigate('research'); researchTicker('AAPL')")
    await page.locator("#ph-body:not([hidden])").wait_for()
    await page.wait_for_function("Chart.getChart('ph-chart')?.width > 0")
    assert await page.locator("#ph-events button").count() == 3
    assert await page.locator("#ph-detail h4").inner_text() == "Fixture earnings release <not HTML>"
    assert await page.locator("#ph-detail a").get_attribute("rel") == "noopener noreferrer"
    metrics = await page.evaluate("""() => {const c=Chart.getChart('ph-chart'); const b=document.querySelector('#resPriceHistory').getBoundingClientRect(); return {scroll:document.documentElement.scrollWidth,viewport:innerWidth,width:b.width,canvas:c.width,points:c.data.datasets[0].data.length,events:c.data.datasets[1].data.length};}""")
    assert metrics["scroll"] <= width + 2, metrics
    assert metrics["canvas"] > 150, metrics
    await page.locator("#resPriceHistory").scroll_into_view_if_needed()
    await page.screenshot(path=str(OUT / (name + ".png")), full_page=True)
    await page.locator('[data-ph-event="test-42"]').focus()
    await page.keyboard.press("Enter")
    assert await page.locator('[data-ph-event="test-42"]').get_attribute("aria-pressed") == "true"
    assert "release-42" in await page.locator("#ph-detail a").get_attribute("href")
    # An actual canvas marker click focuses its corresponding event button.
    await page.locator("#ph-chart").scroll_into_view_if_needed()
    point = await page.evaluate("""() => {const c=Chart.getChart('ph-chart'),p=c.getDatasetMeta(1).data[1],r=c.canvas.getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};}""")
    await page.mouse.click(point["x"], point["y"])
    assert await page.locator('[data-ph-event="test-25"]').get_attribute("aria-pressed") == "true"
    await page.locator('[data-ph-range="1mo"]').click()
    await page.wait_for_function("Chart.getChart('ph-chart') && document.querySelector('[data-ph-range=\"1mo\"]').getAttribute('aria-pressed')==='true'")
    # Late stock-info and chart responses cannot overwrite a newer stock.
    settings["delay"] = True
    await page.evaluate("researchTicker('AAPL'); researchTicker('MSFT')")
    await page.locator("#resNameLine").filter(has_text="MSFT").wait_for()
    await page.wait_for_timeout(1100)
    assert "MSFT" in await page.locator("#ph-period").inner_text()
    assert "MSFT" in await page.locator("#resNameLine").inner_text()
    settings["delay"] = False
    settings["failure"] = True
    await page.locator('[data-ph-range="3mo"]').click()
    await page.locator("#ph-retry").wait_for()
    assert await page.locator("#ph-body").is_hidden()
    assert await page.evaluate("Chart.getChart('ph-chart')===undefined")
    settings["failure"] = False
    settings["empty"] = True
    await page.locator("#ph-retry").click()
    await page.locator(".ph-empty").wait_for()
    assert await page.locator("#ph-chart").is_visible()
    assert await page.locator("#ph-detail").is_hidden()
    assert await page.locator("#ph-events button").count() == 0
    # Wrong-symbol responses fail closed.
    settings["mismatch"] = True
    await page.locator('[data-ph-range="6mo"]').click()
    await page.locator("#ph-retry").wait_for()
    assert await page.locator("#ph-body").is_hidden()
    settings["mismatch"] = False
    await page.locator("#ph-retry").click()
    await page.locator(".ph-empty").wait_for()
    await page.locator("#ph-sources").click()
    assert await page.locator("#page-sources").is_visible()
    assert "TEST FIXTURE" in await page.locator("#sourcesContent").inner_text()
    await page.evaluate("navigate('research')")
    assert await page.locator("#ph-chart").is_visible()
    assert errors == [], errors
    await context.close()
    return {"viewport": name, "passed": True, "layout": metrics, "errors": errors}


async def main():
    OUT.mkdir(exist_ok=True, parents=True)
    server = ThreadingHTTPServer(("127.0.0.1", 8771), functools.partial(SimpleHTTPRequestHandler, directory=str(ROOT / "apps/terminal/public")))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        async with async_playwright() as p:
            options = {}
            if os.environ.get("WAVE_BROWSER_EXECUTABLE"):
                options["executable_path"] = os.environ["WAVE_BROWSER_EXECUTABLE"]
            browser = await p.chromium.launch(**options)
            results = []
            for args in [("desktop",1440,900,"en"),("ipad-landscape",1024,768,"he"),("ipad-portrait",768,1024,"he"),("phone",390,844,"en")]:
                results.append(await check(browser,*args))
                print(json.dumps(results[-1]), flush=True)
            await browser.close()
            (OUT / "report.json").write_text(json.dumps(results,indent=2))
    finally:
        server.shutdown()

if __name__ == "__main__":
    asyncio.run(main())
