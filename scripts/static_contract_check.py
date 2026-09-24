#!/usr/bin/env python3
from pathlib import Path
import sys

html = Path("apps/terminal/public/terminal_app.html").read_text(encoding="utf-8")
js = Path("apps/terminal/public/terminal.js").read_text(encoding="utf-8")
domain_js_paths = [
    Path("apps/terminal/public/terminal-market.js"),
    Path("apps/terminal/public/terminal-content.js"),
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
account_html = Path("apps/terminal/public/account.html").read_text(encoding="utf-8")
account_js = Path("apps/terminal/public/account.js").read_text(encoding="utf-8")
university_html = Path("apps/terminal/public/university.html").read_text(encoding="utf-8")
university_js = Path("apps/terminal/public/university.js").read_text(encoding="utf-8")
platform_js = Path("apps/terminal/public/platform.js").read_text(encoding="utf-8")
platform_css = Path("apps/terminal/public/platform.css").read_text(encoding="utf-8")
platform_cloud_js = Path("apps/terminal/public/platform-cloud.js").read_text(encoding="utf-8")
supabase_config_js = Path("apps/terminal/public/supabase-config.js").read_text(encoding="utf-8")
platform_search_js = Path("apps/terminal/public/platform-search.js").read_text(encoding="utf-8")
research_save_js = Path("apps/terminal/public/research-save.js").read_text(encoding="utf-8")
blog_html = Path("apps/terminal/public/blog.html").read_text(encoding="utf-8")
ai_tutor_js = Path("apps/terminal/public/ai-tutor.js").read_text(encoding="utf-8")
ai_tutor_css = Path("apps/terminal/public/ai-tutor.css").read_text(encoding="utf-8")
index_html = Path("apps/terminal/public/index.html").read_text(encoding="utf-8")
products_html = Path("apps/terminal/public/products.html").read_text(encoding="utf-8")

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
    ("Unified platform routes exposed", "serve_account" in frontend_server and "serve_university" in frontend_server),
    ("Unified platform assets allowlisted", all(x in frontend_server for x in ["account.html","university.html","platform.js","platform-cloud.js","supabase-config.js","platform.css"])),
    ("Cloud adapter uses publishable key only", "sb_publishable_" in supabase_config_js and "service_role" not in supabase_config_js and "sb_secret_" not in supabase_config_js),
    ("Cloud sync adapter wired", "WaveCloud" in platform_cloud_js and "student_progress" in platform_cloud_js and "watchlist_items" in platform_cloud_js),
    ("Supabase client pinned", "@supabase/supabase-js@2.117.1" in account_html and "@supabase/supabase-js@2.117.1" in university_html),
    ("Unified command search wired", "WaveSearch" in platform_search_js and "metaKey" in platform_search_js and "ctrlKey" in platform_search_js),
    ("Search assets allowlisted", "platform-search.js" in frontend_server),
    ("Research save bridge wired", "wireArticleSave" in research_save_js and "articleSaveBtn" in blog_html and "research-save.js" in blog_html),
    ("Research uses same-origin API", "var API = 'http://localhost:5001'" not in blog_html and "var API = ''" in blog_html),
    ("Search loaded across product shell", all("platform-search.js" in x for x in [html, account_html, university_html, blog_html])),
    ("AI Tutor assets allowlisted", "ai-tutor.js" in frontend_server and "ai-tutor.css" in frontend_server),
    ("AI Tutor client is server-key safe", "OPENAI_API_KEY" not in ai_tutor_js and "sk-" not in ai_tutor_js),
    ("AI Tutor requires cloud access token", "getAccessToken" in platform_cloud_js and "Bearer " in ai_tutor_js),
    ("AI Tutor has page context and modes", "pageContext" in ai_tutor_js and all(x in ai_tutor_js for x in ["explain","socratic","quiz","research"])),
    ("AI Tutor UI loaded across platform", all("ai-tutor.js" in x for x in [html, account_html, university_html, blog_html, index_html, products_html])),
    ("AI Tutor responsive CSS present", "@media(max-width:720px)" in ai_tutor_css),
    ("Account workspace wired", "WavePlatform" in account_js and "watchList" in account_html and "Alert Rules" in account_html),
    ("University progress wired", "advanceCourse" in university_js and "courseGrid" in university_html),
    ("Local-first state has versioned schema", "wave.platform.v1" in platform_js and "version:1" in platform_js),
    ("Platform responsive stylesheet present", "@media(max-width:720px)" in platform_css),
    ("Terminal links unified platform", "university.html" in html and "account.html" in html),
]

failed = 0
for name, ok in checks:
    print(("PASS" if ok else "FAIL") + " - " + name)
    if not ok:
        failed += 1

if failed:
    raise SystemExit(f"{failed} static contract check(s) failed")

print("All static contract checks passed.")
