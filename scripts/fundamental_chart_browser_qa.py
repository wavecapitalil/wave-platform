#!/usr/bin/env python3
"""Fixture-only Fundamental Chart regression in real Chromium and Chart.js.

Run: python scripts/fundamental_chart_browser_qa.py
Optional: WAVE_CHARTJS_PATH=/path/to/chart.umd.min.js WAVE_BROWSER_EXECUTABLE=/usr/bin/chromium

Loads the production Terminal shell, intercepts financial API calls, and never
contacts accounts or writes to remote services. Chart.js itself is NOT mocked.
Screenshots, downloaded PNGs and a JSON report go to fundamental_chart_browser_qa/.
The iPad-sized cases are Chromium viewport/touch emulation, not iPad/Safari QA.
"""
import asyncio
import base64
import functools
import hashlib
import json
import math
import os
import re
import struct
import threading
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get("WAVE_FC_QA_OUT", ROOT / "fundamental_chart_browser_qa"))
CHART_URL = "https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"
METRICS = [
    "revenue", "gross_profit", "operating_income", "net_income", "eps_diluted",
    "free_cash_flow", "capex", "rd_expense", "gross_margin", "operating_margin",
    "net_margin", "revenue_growth", "op_income_growth", "net_income_growth",
]
MARGINS = {"gross_margin", "operating_margin", "net_margin"}
LEGACY_GROWTH = {"revenue_growth", "op_income_growth", "net_income_growth"}
VIEWPORTS = [
    ("desktop", 1440, 1000, False),
    ("ipad-portrait-viewport", 820, 1180, True),
    ("ipad-landscape-viewport", 1180, 820, True),
    ("narrow", 390, 844, True),
]


def fixture(symbol, metric, period):
    """Reported-date fixtures; different annual fiscal ends must align by year."""
    if symbol in {"REPORTAPPLE", "REPORTNVDA"}:
        apple = symbol == "REPORTAPPLE"
        annual = [
            {"fiscal_year": 2024, "fiscal_quarter": None, "period_end": "2024-09-28" if apple else "2024-01-28"},
            {"fiscal_year": 2025, "fiscal_quarter": None, "period_end": "2025-09-27" if apple else "2025-01-26"},
        ]
        if not apple:
            annual.append({"fiscal_year": 2026, "fiscal_quarter": None, "period_end": "2026-01-25"})
        quarterly = {"fiscal_year": 2026 if apple else 2027, "fiscal_quarter": 3 if apple else 2,
                     "period_end": "2026-06-27" if apple else "2026-07-26"}
        return {"symbol": symbol, "metric": metric, "period": period, "currency": "USD",
                "data": [{"date": p["period_end"], "fiscalYear": p["fiscal_year"], "value": v}
                         for p, v in zip(annual, [391035000000, 416161000000] if apple else [60922000000, 130497000000, 215938000000])],
                "reporting": {"status": "verified", "filing_coverage_verified": True, "latest_annual": annual[-1], "latest_quarterly": quarterly,
                              "annual_periods": annual, "quarterly_periods": [quarterly]}}
    if symbol == "FAIL":
        return {"error": "Deliberate fundamentals fixture failure"}
    if symbol == "EMPTY":
        return {"symbol": symbol, "metric": metric, "period": period, "data": []}
    if symbol == "EDGE":
        dates = [f"{year}-09-30" for year in range(2017, 2024)]
        values = [-100, -50, 0, 50, -25, None, 100]
    elif symbol == "LOSS":
        dates, values = ["2022-09-30", "2023-09-30"], [-100, 50]
    elif symbol == "GAPS" and period == "annual":
        dates, values = ["2020-09-30", "2022-09-30", "2023-09-30"], [100, 200, 300]
    elif symbol == "GAPS":
        dates = ["2022-03-31", "2022-06-30", "2022-12-31", "2023-03-31", "2023-06-30", "2023-09-30", "2023-12-31"]
        values = [10, 40, 160, 20, 80, 180, 240]
    elif symbol == "SHIFT":
        dates, values = ["2023-04-01", "2024-03-30"], [100, 120]
    elif period == "quarterly":
        dates = [f"{year}-{end}" for year in (2022, 2023) for end in ("03-31", "06-30", "09-30", "12-31")]
        values = [10, 40, 90, 160, 20, 100, 180, 240]
    else:
        end = "06-30" if symbol == "MSFT" else "09-30"
        dates = [f"{year}-{end}" for year in (2022, 2023, 2024)]
        values = [80, 200, 320] if symbol == "MSFT" else [100, 200, 300]
    if metric in MARGINS and symbol not in {"EDGE", "LOSS", "GAPS", "SHIFT"}:
        values = [20, 30, 45] if period == "annual" else [20, 25, 30, 35, 30, 37.5, 45, 52.5]
    elif metric == "eps_diluted" and symbol not in {"EDGE", "LOSS", "GAPS", "SHIFT"}:
        values = [v / 100 for v in values]
    elif metric == "capex":
        values = [-abs(v) if v is not None else None for v in values]
    elif metric in LEGACY_GROWTH:
        # The UI must request underlying reported values, not these deliberately
        # wrong legacy endpoint values, before deriving either display mode.
        values = [777] * len(dates)
    return {
        "symbol": symbol, "metric": metric, "period": period,
        "currency": "USD", "source": "Deterministic browser QA fixture",
        "data": [{"date": date, "value": value} for date, value in zip(dates, values)],
    }


class Gate:
    def __init__(self, symbol, period=None, metric=None):
        self.symbol, self.period, self.metric = symbol, period, metric
        self.seen = asyncio.Event()
        self.release = asyncio.Event()
        self.finished = asyncio.Event()

    def matches(self, symbol, period, metric):
        return (symbol == self.symbol and (not self.period or self.period == period)
                and (not self.metric or self.metric == metric))


class Fixtures:
    def __init__(self, chart_bytes):
        self.chart_bytes = chart_bytes
        self.requests = []
        self.gates = []
        self.external = []

    def hold(self, symbol, period=None, metric=None):
        gate = Gate(symbol, period, metric)
        self.gates.append(gate)
        return gate

    async def route(self, route):
        url = urlparse(route.request.url)
        if "chart.js@4.4.0" in route.request.url:
            return await route.fulfill(status=200, content_type="text/javascript", body=self.chart_bytes)
        if "/api/" in url.path:
            if url.path.endswith("/api/fundamentals"):
                query = parse_qs(url.query)
                symbol = query.get("symbol", ["AAPL"])[0]
                metric = query.get("metric", ["revenue"])[0]
                period = query.get("period", ["annual"])[0]
                self.requests.append({"symbol": symbol, "metric": metric, "period": period})
                matching = [g for g in self.gates if not g.release.is_set() and g.matches(symbol, period, metric)]
                for gate in matching:
                    gate.seen.set()
                    await gate.release.wait()
                body = fixture(symbol, metric, period)
                try:
                    await route.fulfill(status=404 if symbol == "FAIL" else 200, json=body)
                finally:
                    for gate in matching:
                        gate.finished.set()
                return
            return await route.fulfill(status=200, json={"error": "Outside isolated Fundamental Chart fixture"})
        if url.hostname in {"127.0.0.1", "localhost"}:
            return await route.continue_()
        # Isolate unrelated third-party scripts (including authentication), image
        # requests and telemetry. The production modules remain unmodified.
        self.external.append(route.request.url)
        return await route.fulfill(status=200, content_type="text/javascript" if route.request.resource_type == "script" else "text/plain", body="")


async def ready(page):
    await page.wait_for_function("""() => window._fcChart && !window._fcLoading
      && !document.querySelector('#fcDownloadPng').disabled
      && getComputedStyle(document.querySelector('#fcChartWrap')).display !== 'none'""", timeout=15000)
    status = await page.locator("#fcStatus").inner_text()
    assert not re.search(r"error|loading", status, re.I), status


async def set_mode(page, mode):
    label = "Value" if mode == "absolute" else "YoY change %"
    await page.locator("#fcModeBtns").get_by_role("button", name=label, exact=True).click()
    assert await page.evaluate("_fcValueMode") == mode
    assert await page.locator("#fcModeBtns [aria-pressed=true]").count() == 1


async def set_metrics(page, metrics):
    current = await page.evaluate("_fcMetrics.slice()")
    for metric in metrics:
        if metric not in current:
            await page.locator(f'#fcMetricPills button[onclick*="\'{metric}\'"]').click()
    for metric in current:
        if metric not in metrics:
            await page.locator(f'#fcMetricPills button[onclick*="\'{metric}\'"]').click()
    assert set(await page.evaluate("_fcMetrics.slice()")) == set(metrics)


async def load(page, symbol="AAPL", metrics=("revenue",), period="annual", second="", mode="absolute"):
    await page.locator("#fcTicker1").fill(symbol)
    await page.locator("#fcTicker2").fill(second)
    await set_metrics(page, metrics)
    await page.locator("#fcPeriodBtns").get_by_role("button", name=period.capitalize(), exact=True).click()
    await set_mode(page, mode)
    await page.locator('#page-fundchart button[onclick="runFundChart()"]').click()
    await ready(page)


async def values(page, index=0):
    return await page.evaluate("i => _fcChart.data.datasets[i].data.slice()", index)


def equal_values(actual, expected):
    assert len(actual) == len(expected), (actual, expected)
    for actual_value, expected_value in zip(actual, expected):
        if expected_value is None:
            assert actual_value is None, (actual, expected)
        else:
            assert actual_value is not None and math.isclose(actual_value, expected_value, rel_tol=1e-9, abs_tol=1e-9), (actual, expected)


async def table_details(page):
    return await page.locator("#fcTable").evaluate("""el => ({text:el.innerText,
      titles:Array.from(el.querySelectorAll('[title]'), x=>x.title),
      labels:Array.from(el.querySelectorAll('[aria-label]'), x=>x.getAttribute('aria-label'))})""")


async def assert_layout(page):
    await page.locator("#fcDownloadPng").scroll_into_view_if_needed()
    layout = await page.evaluate("""() => {
      const canvas=document.querySelector('#fcCanvas'), box=canvas.getBoundingClientRect();
      const controls=['#fcTicker1','#fcTicker2','#fcModeBtns','#fcDownloadPng'];
      return {pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,
        chart:{width:box.width,height:box.height},controls:controls.map(sel=>{
          const r=document.querySelector(sel).getBoundingClientRect();
          return {selector:sel,left:r.left,right:r.right,width:r.width,height:r.height};
        })};
    }""")
    assert layout["pageWidth"] <= layout["viewport"] + 2, layout
    assert layout["chart"]["width"] > 100 and layout["chart"]["height"] > 100, layout
    for control in layout["controls"]:
        assert control["left"] >= -2 and control["right"] <= layout["viewport"] + 2, layout
        assert control["width"] > 0 and control["height"] > 0, layout
    return layout


async def range_from(page, lo):
    slider = page.locator("#fcRangeMin")
    await slider.focus()
    await slider.press("Home")
    for _ in range(lo):
        await slider.press("ArrowRight")
    assert int(await slider.input_value()) == lo
    await page.wait_for_function("n => _fcChart.data.labels.length === _fcAllDates.length - n", arg=lo)


async def download_png(page, name, required_text):
    await page.evaluate("window.__qaCanvasText = []")
    before = await page.evaluate("JSON.stringify({labels:_fcChart.data.labels,data:_fcChart.data.datasets.map(d=>d.data),mode:_fcValueMode,range:_fcVisibleDates})")
    async with page.expect_download(timeout=20000) as download_event:
        await page.locator("#fcDownloadPng").click()
    download = await download_event.value
    assert download.suggested_filename.lower().endswith(".png"), download.suggested_filename
    target = OUT / f"{name}-download.png"
    await download.save_as(str(target))
    assert await download.failure() is None
    content = target.read_bytes()
    assert content.startswith(b"\x89PNG\r\n\x1a\n"), content[:32]
    width, height = struct.unpack(">II", content[16:24])
    assert width >= 1600 and height >= 600, (width, height)
    assert len(content) > 15000, len(content)
    rendered_text = await page.evaluate("window.__qaCanvasText.filter(t=>t.canvas !== 'fcCanvas').map(t=>t.text).join(' | ')")
    for token in required_text:
        assert re.search(token, rendered_text, re.I), {"missing": token, "rendered_text": rendered_text}
    # Decode the actual downloaded bytes in Chromium, not the source canvas.
    pixels = await page.evaluate("""async b64 => {
      const image=new Image();image.src='data:image/png;base64,'+b64;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      const colors=new Set();let transparent=0;
      for(let y=0;y<canvas.height;y+=7)for(let x=0;x<canvas.width;x+=7){
        const n=(y*canvas.width+x)*4;colors.add(pixels[n]+','+pixels[n+1]+','+pixels[n+2]);
        if(pixels[n+3]!==255)transparent++;
      }
      return {width:image.width,height:image.height,colors:colors.size,transparent};
    }""", base64.b64encode(content).decode())
    assert pixels["colors"] > 20 and pixels["transparent"] == 0, pixels
    after = await page.evaluate("JSON.stringify({labels:_fcChart.data.labels,data:_fcChart.data.datasets.map(d=>d.data),mode:_fcValueMode,range:_fcVisibleDates})")
    assert before == after, "Export changed the live chart's data or selected range"
    return {"file": str(target.relative_to(OUT)), "suggested_filename": download.suggested_filename,
            "bytes": len(content), "dimensions": [width, height], "pixels": pixels,
            "rendered_text": rendered_text, "sha256": hashlib.sha256(content).hexdigest()}


async def release_and_settle(page, gate):
    gate.release.set()
    await asyncio.wait_for(gate.finished.wait(), 10)
    # Permit the deliberately late response's promise/microtask chain to finish.
    await page.wait_for_timeout(150)


async def exhaustive(page, router):
    result = {}
    # Every existing metric must work in both views. Toggles are local redraws.
    metric_results = []
    for metric in METRICS:
        await load(page, metrics=(metric,))
        expected = ([None, 100, 50] if metric in LEGACY_GROWTH else
                    [20, 30, 45] if metric in MARGINS else
                    [1, 2, 3] if metric == "eps_diluted" else
                    [-100, -200, -300] if metric == "capex" else [100, 200, 300])
        equal_values(await values(page), expected)
        start = len(router.requests)
        await set_mode(page, "growth")
        expected_growth = [None, None, -50] if metric in LEGACY_GROWTH else [None, 50, 50] if metric in MARGINS else [None, 100, 50]
        equal_values(await values(page), expected_growth)
        assert len(router.requests) == start, "Mode change refetched financial data"
        assert "%" in await page.locator("#fcTable").inner_text()
        assert re.search(r"YoY|year.over.year", await page.locator("#fcChartTitle").inner_text(), re.I)
        if metric == "capex":
            assert re.search(r"magnitude", await page.locator("#fcLegend").inner_text(), re.I)
        await set_mode(page, "absolute")
        equal_values(await values(page), expected)
        metric_results.append({"metric": metric, "value": expected, "yoy": expected_growth})
    assert not any(r["metric"] in LEGACY_GROWTH for r in router.requests), "Unsafe legacy growth endpoint was requested"
    result["all_14_metrics"] = metric_results

    # Annual missing base is not replaced with the immediately preceding row.
    await load(page, "GAPS", mode="growth")
    equal_values(await values(page), [None, None, 50])
    result["annual_missing_year"] = await table_details(page)

    # Quarterly YoY is the same prior-year quarter, not the previous quarter.
    await load(page, period="quarterly", mode="growth")
    equal_values(await values(page), [None, None, None, None, 100, 150, 100, 50])
    await range_from(page, 4)
    equal_values(await values(page), [100, 150, 100, 50])
    result["quarterly_range_base_outside_window"] = await values(page)
    await load(page, "GAPS", period="quarterly", mode="growth")
    equal_values(await values(page), [None, None, None, 100, 100, None, 50])
    result["quarterly_missing_period"] = await table_details(page)
    await load(page, "SHIFT", period="quarterly", mode="growth")
    equal_values(await values(page), [None, 20])
    result["52_53_week_date_shift"] = await values(page)

    # Negative earnings bases and zero/missing bases carry visible N/A reasons.
    await load(page, "EDGE", metrics=("net_income",), mode="growth")
    equal_values(await values(page), [None, None, None, None, -150, None, None])
    edge = await table_details(page)
    detail = json.dumps(edge).lower()
    for expected_reason in (r"loss|negative", r"zero", r"missing|unavailable|not available"):
        assert re.search(expected_reason, detail), edge
    assert "-150" in edge["text"], edge
    assert not re.search(r"(?<![a-z])(?:nan|infinity)(?![a-z])", detail), edge
    result["negative_zero_missing"] = edge
    await load(page, "LOSS", metrics=("net_income",), mode="growth")
    equal_values(await values(page), [None, None])
    loss = await table_details(page)
    assert re.search(r"loss.to.profit|turnaround|negative", json.dumps(loss), re.I), loss
    result["loss_to_profit"] = loss

    # Mixed dollars, EPS and margins use distinguishable axes in Value mode;
    # every growth dataset uses the same relative-percent scale.
    await load(page, metrics=("revenue", "eps_diluted", "gross_margin"), second="MSFT")
    axes = await page.evaluate("_fcChart.data.datasets.map(d=>({label:d.label,axis:d.yAxisID}))")
    assert len(axes) == 6 and len({x["axis"] for x in axes}) >= 3, axes
    legend = await page.locator("#fcLegend").inner_text()
    for token in ("AAPL", "MSFT", "Revenue", "EPS", "Margin"):
        assert token in legend, legend
    await set_mode(page, "growth")
    growth_axes = await page.evaluate("_fcChart.data.datasets.map(d=>d.yAxisID)")
    assert len(set(growth_axes)) == 1, growth_axes
    ticks = await page.evaluate("Object.values(_fcChart.scales).filter(s=>s.axis==='y').flatMap(s=>s.ticks.map(t=>String(t.label)))")
    assert ticks and all("%" in tick for tick in ticks), ticks
    tooltip = await page.evaluate("""() => {
      const d=_fcChart.data.datasets[0];return _fcChart.options.plugins.tooltip.callbacks.label({dataset:d,raw:d.data[1],datasetIndex:0,dataIndex:1,parsed:{y:d.data[1]}});
    }""")
    assert "%" in tooltip and "$" not in tooltip, tooltip
    result["multi_ticker_axes"] = {"value": axes, "growth": growth_axes, "ticks": ticks, "tooltip": tooltip}
    for chart_type in ("Line", "Stacked", "Bar"):
        await page.locator("#fcTypeBtns").get_by_role("button", name=chart_type, exact=True).click()
        equal_values(await values(page), [None, 100, 50])
    result["chart_types"] = ["line", "stacked", "bar"]
    result["multi_export"] = await download_png(page, "desktop-multi", ["AAPL", "MSFT", "Revenue", "EPS", "Margin", "Annual", "YoY", "%", "2022", "2024"])

    # Ticker input invalidates the old chart immediately, even before another run.
    await page.locator("#fcTicker1").fill("SLOW")
    assert await page.locator("#fcDownloadPng").is_disabled()
    assert not await page.locator("#fcChartWrap").is_visible()
    await page.locator("#fcTicker2").fill("")
    await set_metrics(page, ["revenue"])
    gate = router.hold("SLOW", "annual")
    await page.locator('#page-fundchart button[onclick="runFundChart()"]').click()
    await asyncio.wait_for(gate.seen.wait(), 10)
    assert await page.locator("#fcDownloadPng").is_disabled()
    await load(page, "MSFT")
    equal_values(await values(page), [80, 200, 320])
    await release_and_settle(page, gate)
    assert await page.evaluate("_fcTickers") == ["MSFT"]
    equal_values(await values(page), [80, 200, 320])
    result["stale_ticker_response"] = "newer MSFT result preserved"

    # A pending quarterly response cannot overwrite a newer annual response.
    await load(page)
    gate = router.hold("AAPL", "quarterly")
    await page.locator("#fcPeriodBtns").get_by_role("button", name="Quarterly", exact=True).click()
    await asyncio.wait_for(gate.seen.wait(), 10)
    await page.locator("#fcPeriodBtns").get_by_role("button", name="Annual", exact=True).click()
    await ready(page)
    await release_and_settle(page, gate)
    equal_values(await values(page), [100, 200, 300])
    assert await page.evaluate("_fcPeriod") == "annual"
    result["stale_period_response"] = "annual result preserved"

    # Rapid metric changes cannot reintroduce a removed dataset.
    gate = router.hold("AAPL", "annual", "gross_profit")
    gross = page.locator('#fcMetricPills button[onclick*="\'gross_profit\'"]')
    await gross.click()
    await asyncio.wait_for(gate.seen.wait(), 10)
    await gross.click()
    await ready(page)
    await release_and_settle(page, gate)
    assert await page.evaluate("_fcMetrics") == ["revenue"]
    assert await page.evaluate("_fcChart.data.datasets.length") == 1
    result["stale_metric_response"] = "removed metric stays removed"

    # Repeated mode clicks during a fetch retain the last choice, without
    # refetching or exposing/exporting stale data.
    gate = router.hold("SLOW", "annual")
    await page.locator("#fcTicker1").fill("SLOW")
    await page.locator('#page-fundchart button[onclick="runFundChart()"]').click()
    await asyncio.wait_for(gate.seen.wait(), 10)
    count = len(router.requests)
    for mode in ["growth", "absolute"] * 5 + ["growth"]:
        await set_mode(page, mode)
    assert len(router.requests) == count
    assert await page.locator("#fcDownloadPng").is_disabled()
    await release_and_settle(page, gate)
    await ready(page)
    equal_values(await values(page), [None, 100, 50])
    result["rapid_mode_changes"] = "last growth mode retained, no extra API requests"

    # Failure is terminal and recoverable; never offer an old chart download.
    await page.locator("#fcTicker1").fill("FAIL")
    await page.locator('#page-fundchart button[onclick="runFundChart()"]').click()
    await page.wait_for_function("/error|fail/i.test(document.querySelector('#fcStatus').textContent)")
    assert await page.locator("#fcDownloadPng").is_disabled()
    assert not await page.locator("#fcChartWrap").is_visible()
    await load(page)
    equal_values(await values(page), [100, 200, 300])
    result["error_recovery"] = "failed fetch disabled export; subsequent load recovered"
    await page.locator("#fcTicker1").fill("EMPTY")
    await page.locator('#page-fundchart button[onclick="runFundChart()"]').click()
    await page.wait_for_function("/no reported periods/i.test(document.querySelector('#fcStatus').textContent)")
    assert await page.locator("#fcDownloadPng").is_disabled()
    assert not await page.locator("#fcChartWrap").is_visible()
    await load(page)
    count = len(router.requests)
    await page.locator('#fcMetricPills button[onclick*="\'revenue\'"]').click()
    assert await page.evaluate("_fcMetrics") == ["revenue"]
    assert len(router.requests) == count
    equal_values(await values(page), [100, 200, 300])
    result["empty_history_and_last_metric"] = "empty history cannot export; final metric cannot be deselected"
    return result


async def check(browser, base, chart_bytes, name, width, height, touch):
    context = await browser.new_context(viewport={"width": width, "height": height}, has_touch=touch, accept_downloads=True, locale="en-US")
    await context.add_init_script("""localStorage.setItem('wc_lang','en');
      window.__qaCanvasText=[];
      const originalFillText=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(text,...args){
        window.__qaCanvasText.push({text:String(text),canvas:this.canvas.id,width:this.canvas.width,height:this.canvas.height});
        return originalFillText.call(this,text,...args);
      };""")
    router = Fixtures(chart_bytes)
    await context.route("**/*", router.route)
    page = await context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    report = {"viewport": name, "dimensions": [width, height], "touch_emulation": touch,
              "browser": browser.version, "real_ipad_test": False}
    try:
        await page.goto(base + "/terminal_app.html#page=fundchart", wait_until="domcontentloaded")
        await page.locator("#page-fundchart").wait_for(state="visible")
        await page.wait_for_function("typeof Chart==='function' && Chart.version==='4.4.0'")
        assert await page.locator("#fcDownloadPng").is_disabled()
        assert await page.locator("#fcModeBtns").get_by_role("button").count() == 2
        await load(page)
        equal_values(await values(page), [100, 200, 300])
        if name == "desktop":
            report["value_export"] = await download_png(page, name + "-value", ["AAPL", "Revenue", "Annual", "Values", "USD", "2022", "2024"])
        await set_mode(page, "growth")
        equal_values(await values(page), [None, 100, 50])
        await range_from(page, 1)
        equal_values(await values(page), [100, 50])
        await set_mode(page, "absolute")
        equal_values(await values(page), [200, 300])
        await set_mode(page, "growth")
        equal_values(await values(page), [100, 50])
        report["layout"] = await assert_layout(page)
        await page.screenshot(path=str(OUT / f"{name}-growth.png"), full_page=True)
        report["export"] = await download_png(page, name, ["AAPL", "Revenue", "Annual", "YoY", "%", "2023", "2024"])
        # A second download must remain functional after completion.
        if name == "desktop":
            report["repeat_export"] = await download_png(page, name + "-repeat", ["AAPL", "YoY", "2023", "2024"])
            report["regressions"] = await exhaustive(page, router)
        else:
            await load(page, period="quarterly", mode="growth", second="MSFT", metrics=("revenue", "gross_margin"))
            equal_values(await values(page), [None, None, None, None, 100, 150, 100, 50])
            await range_from(page, 4)
            equal_values(await values(page), [100, 150, 100, 50])
            report["multi_layout"] = await assert_layout(page)
            await page.screenshot(path=str(OUT / f"{name}-quarterly-multi.png"), full_page=True)
            report["multi_export"] = await download_png(page, name + "-multi", ["AAPL", "MSFT", "Revenue", "Margin", "Quarterly", "YoY", "2023"])
        # Same annual view as the reported AAPL/NVDA issue. A null is a
        # explained full-year reporting status, not a false missing-data error.
        await load(page, "REPORTAPPLE", second="REPORTNVDA", mode="growth")
        details = await table_details(page)
        assert "Full-year report pending" in details["text"], details
        assert "FY2026 Q3" in details["text"] and "2026-06-27" in details["text"], details
        assert "FY2026 · ended 2026-01-25" in details["text"], details
        status = await page.locator("#fcDataStatus").inner_text()
        assert "full-year report is not yet available" in status and "different fiscal-year end dates" in status, status
        assert await values(page) == [None, (416161000000 / 391035000000 - 1) * 100, None]
        assert (await values(page, 1))[-1] > 65
        report["reporting_status"] = {"status": status, "table": details, "layout": await assert_layout(page)}
        await page.locator("#fcDataStatus").scroll_into_view_if_needed()
        await page.screenshot(path=str(OUT / f"{name}-reporting-status.png"), full_page=True)
        assert not errors, errors
        report.update({"passed": True, "page_errors": errors, "financial_requests": router.requests,
                       "isolated_external_requests": sorted(set(router.external))})
    except Exception as error:
        report.update({"passed": False, "failure": str(error), "page_errors": errors,
                       "financial_requests": router.requests})
        try:
            report["state"] = await page.evaluate("""() => ({status:document.querySelector('#fcStatus')?.innerText,
              mode:window._fcValueMode,period:window._fcPeriod,metrics:window._fcMetrics,
              labels:window._fcChart?.data.labels,data:window._fcChart?.data.datasets.map(d=>d.data),
              table:document.querySelector('#fcTable')?.innerText})""")
            await page.screenshot(path=str(OUT / f"{name}-failure.png"), full_page=True)
        finally:
            (OUT / f"{name}-report.json").write_text(json.dumps(report, indent=2))
        raise
    finally:
        for gate in router.gates:
            gate.release.set()
        await context.close()
    (OUT / f"{name}-report.json").write_text(json.dumps(report, indent=2))
    return report


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def chart_bundle():
    path = Path(os.environ.get("WAVE_CHARTJS_PATH", OUT / "chart.umd.min.js"))
    if not path.is_file():
        with urllib.request.urlopen(CHART_URL, timeout=60) as response:
            content = response.read()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    content = path.read_bytes()
    assert len(content) > 150000 and b"Chart.js v4.4.0" in content, "Provide the real Chart.js 4.4.0 UMD bundle"
    return content


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    chart_bytes = chart_bundle()
    server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT / "apps/terminal/public")))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    results = []
    try:
        async with async_playwright() as p:
            options = {}
            if os.environ.get("WAVE_BROWSER_EXECUTABLE"):
                options["executable_path"] = os.environ["WAVE_BROWSER_EXECUTABLE"]
            browser = await p.chromium.launch(**options)
            try:
                for viewport in VIEWPORTS:
                    print(f"Checking Fundamental Chart: {viewport[0]}", flush=True)
                    results.append(await check(browser, base, chart_bytes, *viewport))
                    (OUT / "report.json").write_text(json.dumps(results, indent=2))
            finally:
                await browser.close()
        print(json.dumps({"passed": True, "viewports": [r["viewport"] for r in results],
                          "chartjs_sha256": hashlib.sha256(chart_bytes).hexdigest(), "report": str(OUT / "report.json")}), flush=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    asyncio.run(main())
