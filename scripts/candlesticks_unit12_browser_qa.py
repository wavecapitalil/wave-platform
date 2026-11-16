#!/usr/bin/env python3
"""Browser smoke QA for all WAVE Course Unit 1–2 exercises and illustrations.
Run from repo root after installing Playwright Chromium.
Creates browser_qa/unit12/report.json and screenshots for desktop/mobile.
"""
import functools
import http.server
import json
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps" / "terminal" / "public"
OUT = ROOT / "browser_qa" / "unit12"
PAGES = [f"candlesticks-lesson-0{i}.html" for i in range(1, 5)] + [
    f"candlesticks-lesson-2-{i}.html" for i in range(1, 6)
]
EXPECTED_FIGURES = {
    "candlesticks-lesson-2-1.html": ["fig-2-1-03.png", "fig-2-1-02.png"],
    "candlesticks-lesson-2-2.html": ["fig-2-2-03.png", "fig-2-2-02-verified.svg", "fig-2-2-01.png"],
    "candlesticks-lesson-2-3.html": ["fig-2-3-01.png", "fig-2-3-02.png", "fig-2-3-03.png"],
    "candlesticks-lesson-2-4.html": ["fig-2-4-01.png", "fig-2-4-03.png", "fig-2-4-02.png"],
    "candlesticks-lesson-2-5.html": ["fig-2-5-01.png", "fig-2-5-02.png", "fig-2-5-03.png"],
}

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        return

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    handler = functools.partial(QuietHandler, directory=str(PUBLIC))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}"
    records = []
    failures = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=["--no-sandbox"])
            for viewport_name, width, height in [("desktop", 1440, 900), ("mobile", 390, 844)]:
                context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=2 if viewport_name == "mobile" else 1)
                for file in PAGES:
                    page = context.new_page()
                    js_errors = []
                    page.on("pageerror", lambda exc: js_errors.append(str(exc)))
                    record = {"page": file, "viewport": viewport_name, "status": "pass", "errors": []}
                    try:
                        response = page.goto(f"{base}/{file}", wait_until="domcontentloaded", timeout=20000)
                        assert response and response.status == 200, "page did not load with HTTP 200"
                        assert page.locator("#complete").count() == 1, "completion control absent"
                        assert page.locator("details.wave-reveal-solutions, details.pedagogy-solution").count() >= 1, "solution reveal absent"
                        summary = page.locator("details.wave-reveal-solutions summary, details.pedagogy-solution summary").first
                        summary.click()
                        assert summary.evaluate("(x) => x.parentElement.open"), "solution disclosure did not open"
                        if file in EXPECTED_FIGURES:
                            fig_src = page.locator("figure.visual img").evaluate_all("(xs) => xs.map(x => x.src.split('/').pop().split('?')[0])")
                            assert fig_src == EXPECTED_FIGURES[file], f"incorrect order of source illustrations: {fig_src}"
                            assert page.locator("figure.visual figcaption").count() == 3, "not all figures have descriptive captions"
                            page.wait_for_function(
                                "() => Array.from(document.querySelectorAll('figure.visual img')).every(x => x.complete)",
                                timeout=20000
                            )
                            broken = page.locator("figure.visual img").evaluate_all("(xs) => xs.filter(x => x.naturalWidth === 0).map(x => x.src)")
                            assert not broken, f"broken image files: {broken}"
                            record["figure_images_loaded"] = len(fig_src)
                        if file == "candlesticks-lesson-02.html":
                            page.locator("circle[data-day='1']").click()
                            assert "100" in page.locator("#point-feedback").inner_text(), "interactive line chart data do not match example"
                            record["line_chart_interaction"] = "pass"
                        if file == "candlesticks-lesson-2-1.html":
                            page.locator("#close-range").evaluate("(x) => {x.value='90'; x.dispatchEvent(new Event('input',{bubbles:true}))}")
                            assert "דובי" in page.locator("#candle-state").inner_text(), "bearish candle slider interaction broken"
                            record["candle_slider_interaction"] = "pass"
                        if viewport_name == "mobile":
                            width_stats = page.evaluate("({scroll:document.documentElement.scrollWidth, viewport:window.innerWidth})")
                            record["width_stats"] = width_stats
                            assert width_stats["scroll"] <= width_stats["viewport"] + 16, f"horizontal overflow: {width_stats}"
                        screenshot = OUT / f"{file.replace('.html','')}-{viewport_name}.png"
                        page.screenshot(path=str(screenshot), full_page=True, animations="disabled")
                        record["screenshot"] = str(screenshot.relative_to(ROOT))
                        if js_errors:
                            record["browser_js_errors"] = js_errors
                    except Exception as exc:
                        record["status"] = "fail"
                        record["errors"].append(str(exc))
                        failures.append(f"{file} [{viewport_name}]: {exc}")
                    records.append(record)
                    page.close()
                context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    report = {"checked_pages": len(records), "passed": sum(x["status"] == "pass" for x in records), "failed": len(failures), "results": records}
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k:v for k,v in report.items() if k!="results"},ensure_ascii=False))
    for failure in failures:
        print("FAIL:", failure)
    if failures:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
