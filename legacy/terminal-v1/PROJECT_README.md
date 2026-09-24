# WAVE Terminal — Export for merge into WAVE Platform

Snapshot taken **2026-09-24** from the live local install on Daniel's MacBook.
Nothing in the original folders was changed. Secrets, caches, logs, databases and git data are excluded.

## 1. Where it came from (verified)

| Item | Value |
|---|---|
| URL in use | `http://localhost:5001/terminal_app.html` |
| Server | Flask app `api.py` → `app.run(host='127.0.0.1', port=5001)` |
| Live project folder | `~/wave-server/` (`/Users/danielarad/wave-server`) |
| How it's verified | Bytes served on :5001 match `~/wave-server` exactly: `terminal_app.html` = 513,469 B, `api.py` = 151,518 B. `/api/health` → `{"service":"Wave Capital API","status":"ok"}`. `wave_cache.db` in that folder was written today. |
| How it's launched | `api.py` comments say it runs as a **macOS launchd background service** (reason it reads keys from a file, not shell env). The `.plist` lives in `~/Library/LaunchAgents/` and was not inspected. |
| Older copy | `~/wave_capital/` (git repo, last edited 2026-05-13) holds an **older** `terminal_app.html`/`api.py` plus the real modules the live version is missing → included under `legacy_modules/` (see §7). |

Process check not run directly (the file-access sandbox can't see macOS processes). To confirm the PID yourself:
`lsof -nP -iTCP:5001 -sTCP:LISTEN` and `launchctl list | grep -i wave`.

## 2. Main file

- **`terminal_app.html`** — the whole Terminal frontend in one file (~9,900 lines): CSS lines 8–967, HTML pages 969–2800, one inline JS block 2801–9902.
- `terminal.html` — redirect to `terminal_app.html`.
- `index.html`, `blog.html`, `products.html` — the public site pages linked from the Terminal top nav (Home / Blog / Products). `index.html` calls `/api/pcr` and `/api/quote`; `blog.html` calls `/api/blog/*`.
- `i18n.js` — shared EN/HE language toggle (RTL for Hebrew) used by all pages.

## 3. How to run

```bash
cd wave-terminal-export
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # flask, flask-cors, requests, yfinance (pulls pandas)
cp .env.example wave_secrets.env         # optional; fill in AI keys
python3 api.py                           # → http://localhost:5001  (serves terminal_app.html at / and /terminal)
```

Open `http://localhost:5001/terminal_app.html`. Always go through the Flask server — the frontend hard-codes `var API = 'http://localhost:5001'` (line 3090) and also uses relative `/api/...` calls, so opening the HTML as a `file://` won't work.

System needs: Python 3.9+, `curl` on PATH (the `/api/fred` route shells out to curl on purpose — see comment in `api.py` ~line 1210), internet access.

## 4. Stack

- **Frontend:** plain HTML + CSS + vanilla JavaScript (no framework, no build step, no package.json). **Chart.js 4.4.0** from jsDelivr CDN, Inter font from Google Fonts. No local images/icons/fonts — icons are emoji.
- **Backend:** Python **Flask** + **flask-cors**; `requests`, `yfinance` (+pandas), stdlib `sqlite3`, `xml.etree`, `concurrent.futures`, `subprocess` (curl).
- **Storage:** SQLite `wave_cache.db` next to `api.py`, auto-created on first run (tables `pcr_history`, `articles`). Schema only in `docs/wave_cache_schema.sql`. Generated article images are written to `article_images/` (auto-created, excluded from export).

## 5. Backend — yes (`api.py`, ~3,390 lines, single file)

Serves the static files **and** ~55 JSON routes. Everything under `/` falls through to a catch-all `/<path:filename>` static route.

Main route groups (line numbers in `api.py`):

| Group | Routes |
|---|---|
| Market data | `/api/quote` 49, `/api/intraday` 86, `/api/history` 1587, `/api/vix-history` 102, `/api/fear-greed` 30, `/api/yields` 1365, `/api/fred` 1202, `/api/pcr` 2200, `/api/risk-signals` 2249 |
| Equities | `/api/sectors` 570, `/api/sector-detail` 190, `/api/fundamentals` 346, `/api/stock-info` 448, `/api/holders` 518, `/api/analyst-estimates` 1836, `/api/peers` 1929, `/api/correlation` 1609, `/api/ticker-mover` 3311, `/api/ev-market` 2076 |
| Filings / flows | `/api/insider-buying` (+`/refresh`) 1499, `/api/insider-activity` 1521, `/api/institutions`, `/api/institutions-list` 1706–1711, `/api/earnings` (+`/refresh`) 1339 |
| News / calendar | `/api/news` 611, `/api/macro-news` 1125, `/api/econ-calendar` 1178, `/api/top-stories` 3170, `/api/article` 2926 (AI-written), `/api/blog/articles`, `/api/blog/article/<id>` 3181–3194, `/article-images/<file>` 3165 |
| Crypto | `/api/crypto-scanner` 681, `/api/crypto-global` 2373, `/api/cohort-performance` 2410, `/api/cohort-prices` 2460, `/api/cohort-news` 2728, `/api/onchain-history` 2513, `/api/onchain-kpi` 2588, `/api/token-detail` 2642 |
| Morning brief | `/api/daily-brief` 1042, `/api/daily-brief/refresh` 1068 |
| Comm flows | `/api/comm-flows/{latest,history,breakdown,trends,update}` 2005–2037, `/api/update-status` 2048 — **backed by a stub** (see §7) |
| Confluence | `/api/confluence`, `/api/confluence/run` 1571 — **returns 500: `confluence.py` is missing from the live folder** |
| Health | `/api/health` 2240 |

## 6. External APIs / data sources

No paid market-data keys are required. Sources hit by the backend: Yahoo Finance (`yfinance`, `feeds.finance.yahoo.com`), SEC EDGAR (`www.sec.gov`, `data.sec.gov` — sends a `WaveCapital …@wavecapital.com` User-Agent), FRED (`fred.stlouisfed.org` via curl), Federal Reserve, CBOE (`cdn.cboe.com`, put/call), Nasdaq (`api.nasdaq.com`), CNN Fear & Greed (`production.dataviz.cnn.io`), ForexFactory calendar (`nfs.faireconomy.media`), CoinGecko, DeFiLlama (`api.llama.fi`, `stablecoins.llama.fi`), Binance, GitHub API, StockTwits, Reddit, Google News + RSS (CNBC, Bloomberg, FT, MarketWatch, CoinDesk, Cointelegraph, Decrypt), `api.allorigins.win` (CORS proxy), `image.pollinations.ai` (article images), **Anthropic / OpenAI** (optional AI article writing).

Called **directly from the browser** (frontend): Binance `api/v3` (BTC/Gold page), `api.allorigins.win` + `query1.finance.yahoo.com` (commodities SMD panel), Chart.js CDN, Google Fonts, `loremflickr.com` / `images.unsplash.com` (placeholder images).

## 7. Known gaps — read before merging

1. **Frontend is ahead of backend.** `terminal_app.html` calls 8 routes that the live `api.py` does not define → 404 today: `/api/hormuz/{summary,watchlist,events,agent-log,agent-start}`, `/api/commodities/{metal-intel,gold-silver-ratio}`, `/api/seasonality`. They exist in the older backend: `legacy_modules/api_legacy_2026-05-13.py` (search for those route strings). Affected pages: Hormuz Oil Desk, Commodities, Seasonality Scanner.
2. **`comm_flows.py` in the root is a stub** (returns empty data so the server boots). The real engine is `legacy_modules/comm_flows.py` (Digital Ad Intelligence: Google/Meta/Amazon/TikTok ad revenue & share, SQLite `comm_flows.db`).
3. **`confluence.py` missing** in the live folder → `/api/confluence` 500. Real module: `legacy_modules/confluence.py` (13F + analyst revisions + insider buying score 0–100, SQLite `confluence.db`).
4. **Hormuz agent** `legacy_modules/hormuz_agent.py` — separate process (every 30 min, `schedule` lib, writes `hormuz.db`); started by the legacy route `/api/hormuz/agent-start` via `subprocess.Popen`.
5. Extra deps for the legacy modules/backend: `feedparser`, `anthropic`, `numpy`, `schedule` (plus `pandas`, already pulled in by yfinance). Not in `requirements.txt`.
6. **Morning Brief reads files outside the project** (`api.py` line 774 `_BRIEF_SEARCH_DIRS`): `~/Library/Application Support/Claude/local-agent-mode-sessions` (…/outputs/*.html) and `/Users/danielarad/Library/Mobile Documents/com~apple~CloudDocs/Trading Briefings` (iCloud). On another machine the page is empty until this is replaced with a configurable path/storage.
7. Hard-coded `http://localhost:5001` base URL in the frontend (line 3090) and `Runs on http://localhost:5001` in `api.py`.
8. **Security:** the catch-all static route serves any file in the folder. On the live install `http://localhost:5001/wave_secrets.env` and `/api.py` return 200 (localhost only, but fix before any deployment — whitelist static files).
9. "Coming soon" placeholders (no code): FX Monitor, Backtest Suite, Trade Ideas.

## 8. Environment variables

Read from `wave_secrets.env` next to `api.py` (KEY=VALUE), falling back to process env (`_load_secrets`, `api.py` ~line 2775). All optional:

| Var | Used for |
|---|---|
| `ANTHROPIC_API_KEY` | AI-written articles (`/api/article`) and ticker-mover explanations (`/api/ticker-mover`) |
| `ANTHROPIC_MODEL` | model override |
| `OPENAI_API_KEY` | fallback provider for the same features |
| `OPENAI_MODEL` | model override |

The legacy backend reads `ANTHROPIC_API_KEY` from a `.env` in the project root instead.

## 9. Folder structure

```
wave-terminal-export/
├── terminal_app.html      ← MAIN: entire Terminal UI (CSS + HTML + JS)
├── terminal.html          redirect → terminal_app.html
├── index.html / blog.html / products.html   public site pages (top nav)
├── i18n.js                EN/HE toggle, shared
├── api.py                 Flask backend + static server (port 5001) — LIVE version
├── comm_flows.py          stub (see §7)
├── requirements.txt       live deps
├── .env.example           variable names only
├── .gitignore
├── docs/wave_cache_schema.sql
├── legacy_modules/        from ~/wave_capital (older, NOT what runs today)
│   ├── api_legacy_2026-05-13.py   has hormuz / commodities / seasonality routes
│   ├── comm_flows.py  confluence.py  hormuz_agent.py
│   └── requirements_legacy.txt
├── PROJECT_README.md
└── FILE_TREE.txt
```

## 10. Terminal sections → code map

`navigate(page)` (line 2853) switches `<div class="page" id="page-X">` and calls the loader. Sidebar at lines 1037–1165.

| Sidebar group / page | HTML div (line) | JS entry (line) | Backend endpoints |
|---|---|---|---|
| **OVERVIEW** Home | `page-welcome` 1183 | `loadNews` 3616, `loadSectorPulse` 3532, `loadCalendar` 3498 | `/api/news`, `/api/top-stories`, `/api/article`, `/api/sectors`, `/api/econ-calendar`, `/api/earnings` |
| Morning Brief | `page-brief` 1338 | inside `navigate` (iframe, 2-min refresh) | `/api/daily-brief` |
| **MACRO** Risk Meter | `page-risk` 2650 | `loadRiskMeter` 6007 | `/api/risk-signals` |
| Macro Scanner | `page-macro` 1352 | `loadMacroScanner` 8149 | `/api/macro-news` |
| FX Monitor | `page-fx` 1379 | — | placeholder |
| Rates & Yields | `page-rates` 1382 | `loadRatesPage` 7668 | `/api/yields` |
| Commodities | `page-commodities` 1417 | `loadCommodities` 7253, `smdInit` 9166 | `/api/commodities/*` ⚠ legacy-only; browser → allorigins/Yahoo, FRED |
| Hormuz Oil Desk | `page-hormuz` 1702 | `loadHormuz` 6964 | `/api/hormuz/*` ⚠ legacy-only |
| BTC / Gold Ratio | `page-btcgold` 2513 | `loadBtcGoldPage` 3135, `drawNrgCharts` 3190 | `/api/quote`, `/api/intraday`, Binance (browser) |
| Put/Call Ratio | `page-pcr` 2578 | `loadPcrSection` 8121 | `/api/pcr` |
| Housing Risk Gauge | `page-housing` 2680 | `loadHousingGauge` 9802 | `/api/fred`, `/api/history` |
| Seasonality Scanner | `page-seasonality` 2727 | `seasLoad` 9473 | `/api/seasonality` ⚠ legacy-only |
| **EQUITIES** Sector Strength | `page-sectors` 1946 | `loadSectors` 3994 | `/api/sectors`, `/api/sector-detail` |
| Market Breadth | `page-breadth` 2013 | `loadBreadthPage` 3854 | `/api/quote` |
| Company Research | `page-research` 2087 | `runResearch` 5459 | `/api/stock-info`, `/api/analyst-estimates`, `/api/peers` (+ `/api/holders`, fetched at line 4301) |
| What's Moving | `page-mover` 1319 | `loadMover` 2951 | `/api/ticker-mover` (AI) |
| Institutional Holdings | `page-institutions` 2154 | `loadInstitutionsList` 4878 | `/api/institutions-list`, `/api/institutions` |
| Fundamental Chart | `page-fundchart` 2263 | `fc*` functions 4495–4725 | `/api/fundamentals` |
| Insider Buying | `page-confluence` 2394 | `loadInsiderBuying` 8604 | `/api/insider-buying`, `/api/insider-activity` |
| Earnings | `page-earnings` 2413 | `loadEarningsPage` 8401 | `/api/earnings`, `/api/stock-info` |
| Correlation | `page-correlation` 2450 | `runCorrelation` 4581 | `/api/correlation` |
| Comm. Flows | `page-comm-flows` 2174 | `loadCommFlows` 5060 | `/api/comm-flows/*`, `/api/update-status` (stub backend) |
| EV Industry | `page-ev` 1805 | `loadEvPage` 7838 | `/api/ev-market`, `/api/stock-info` |
| **CRYPTO** Crypto Dashboard | `page-crypto` 1850 | `loadCryptoDash` 6039 | `/api/crypto-global`, `/api/cohort-*`, `/api/onchain-history` |
| Crypto Scanner | `page-scanner` 2609 | `loadScannerData` 3745, `renderScannerTable` 3762 | `/api/crypto-scanner` |
| **TOOLS** Backtest Suite / Trade Ideas | `page-backtest` 2642 / `page-ideas` 2645 | — | placeholders |

Line numbers refer to the files in this export (identical to the live files).

## 11. Excluded on purpose

`wave_secrets.env` (real key), `wave_cache.db` (runtime cache), `article_images/` (16 generated JPGs, cache), `.impeccable/` (editor hook cache), `~/wave_capital/.git`, `api.log` (8.6 MB log), `hormuz_agent.log`, all `*.db` files, `daily_brief.html` / `session_brief.html` (old generated briefs, not referenced by the Terminal). No `node_modules`, venv or `__pycache__` existed.