#!/usr/bin/env python3
from pathlib import Path
import sys

html = Path("apps/terminal/public/terminal_app.html").read_text(encoding="utf-8")
js = Path("apps/terminal/public/terminal.js").read_text(encoding="utf-8")
domain_js_paths = [
    Path("apps/terminal/public/terminal-flows.js"),
    Path("apps/terminal/public/terminal-hormuz.js"),
    Path("apps/terminal/public/terminal-metals.js"),
    Path("apps/terminal/public/terminal-confluence.js"),
    Path("apps/terminal/public/terminal-seasonality.js"),
    Path("apps/terminal/public/terminal-equities.js"),
    Path("apps/terminal/public/terminal-risk.js"),
    Path("apps/terminal/public/terminal-crypto.js"),
    Path("apps/terminal/public/terminal-rates.js"),
    Path("apps/terminal/public/terminal-industries.js"),
    Path("apps/terminal/public/terminal-macro.js"),
    Path("apps/terminal/public/terminal-earnings.js"),
]
domain_js = "\n".join(path.read_text(encoding="utf-8") for path in domain_js_paths)
css = Path("apps/terminal/public/terminal.css").read_text(encoding="utf-8")
frontend = html + "\n" + js + "\n" + domain_js
api = Path("services/api/api.py").read_text(encoding="utf-8")
factory = Path("services/api/app_factory.py").read_text(encoding="utf-8")
frontend_server = Path("services/api/modules/frontend.py").read_text(encoding="utf-8")
brief_module = Path("services/api/modules/brief.py").read_text(encoding="utf-8")

checks = [
    ("Seasonality uses new contract", "historical_average" in frontend and "seas-line-chart" in frontend),
    ("No legacy seasonality monthly contract", "data.monthly" not in frontend),
    ("Cross-Asset Flows UI wired", "/api/flows/" in frontend and "Cross-Asset Flows" in frontend),
    ("No legacy Comm Flows API calls", "/api/comm-flows/" not in frontend),
    ("Confluence v2 UI wired", "/api/confluence?symbol=" in frontend and "Confluence Monitor" in frontend),
    ("No old Insider Buying page loader", "loadInsiderBuying" not in frontend),
    ("Metals removed directional verdict language", "STRONGLY FAVORS" not in frontend),
    ("No dead metal-intel API calls", "/api/commodities/metal-intel" not in frontend),
    ("Hormuz has no legacy watchlist API", "/api/hormuz/watchlist" not in frontend),
    ("Hormuz has no legacy agent start API", "/api/hormuz/agent-start" not in frontend),
    ("Unsafe static catch-all removed", "send_from_directory(BASE_DIR, filename)" not in frontend_server and "PUBLIC_FILES" in frontend_server),
    ("Theme is loaded", "wave-university-theme.css" in html),
    ("Base Terminal CSS extracted", "terminal.css" in html and len(css) > 10000),
    ("Terminal JS extracted", "terminal.js" in html and "function navigate(page)" in js and len(js) > 1000),
    ("Domain JS modules loaded", all(path.name in html for path in domain_js_paths)),
    ("Dead Silver Stress code removed", "smdInit" not in frontend and "SMD_TIMER" not in frontend),
    ("Morning Brief uses portable storage", "WAVE_BRIEF_DIR" in brief_module),
    ("No Daniel-local iCloud path remains", "/Users/danielarad/" not in brief_module),
    ("No Claude local-session dependency remains", "local-agent-mode-sessions" not in brief_module),
    ("Brief charts use same-origin API", "var BASE = 'http://localhost:5001'" not in brief_module),
    ("API entrypoint uses app factory", "from app_factory import create_app" in api and "BLUEPRINTS" in factory),
    ("Standard metadata helper is wired", "from core.meta import build_meta" in Path("services/api/modules/seasonality.py").read_text(encoding="utf-8")),
]

failed = 0
for name, ok in checks:
    print(("PASS" if ok else "FAIL") + " - " + name)
    if not ok:
        failed += 1

if failed:
    raise SystemExit(f"{failed} static contract check(s) failed")

print("All static contract checks passed.")
