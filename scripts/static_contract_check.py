#!/usr/bin/env python3
from pathlib import Path
import sys

html = Path("apps/terminal/public/terminal_app.html").read_text(encoding="utf-8")
api = Path("services/api/api.py").read_text(encoding="utf-8")

checks = [
    ("Seasonality uses new contract", "historical_average" in html and "seas-line-chart" in html),
    ("No legacy seasonality monthly contract", "data.monthly" not in html),
    ("Cross-Asset Flows UI wired", "/api/flows/" in html and "Cross-Asset Flows" in html),
    ("No legacy Comm Flows API calls", "/api/comm-flows/" not in html),
    ("Confluence v2 UI wired", "/api/confluence?symbol=" in html and "Confluence Monitor" in html),
    ("No old Insider Buying page loader", "loadInsiderBuying" not in html),
    ("Metals removed directional verdict language", "STRONGLY FAVORS" not in html),
    ("No dead metal-intel API calls", "/api/commodities/metal-intel" not in html),
    ("Hormuz has no legacy watchlist API", "/api/hormuz/watchlist" not in html),
    ("Hormuz has no legacy agent start API", "/api/hormuz/agent-start" not in html),
    ("Unsafe static catch-all removed", "return send_from_directory(BASE_DIR, filename)" not in api),
    ("Theme is loaded", "wave-university-theme.css" in html),
    ("Morning Brief uses portable storage", "WAVE_BRIEF_DIR" in api),
    ("No Daniel-local iCloud path remains", "/Users/danielarad/" not in api),
    ("No Claude local-session dependency remains", "local-agent-mode-sessions" not in api),
    ("Brief charts use same-origin API", "var BASE = 'http://localhost:5001'" not in api),
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
