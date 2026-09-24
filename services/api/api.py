"""
Wave Capital — Data API
Runs on http://localhost:5001
Serves all market data to terminal_app.html (no CORS/proxy issues)
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from concurrent.futures import ThreadPoolExecutor, as_completed
import os
import re
import requests
import yfinance as yf
import xml.etree.ElementTree as ET
import email.utils
from datetime import datetime, timezone
import warnings
warnings.filterwarnings('ignore')

app = Flask(__name__)

# CORS is limited to configured origins. In production prefer same-origin requests.
_ALLOWED_ORIGINS = [o.strip() for o in os.getenv(
    'WAVE_ALLOWED_ORIGINS',
    'http://localhost:5001,http://127.0.0.1:5001'
).split(',') if o.strip()]
CORS(app, resources={r"/api/*": {"origins": _ALLOWED_ORIGINS}})

# Stabilization modules validated against current product intent.
from modules.seasonality import bp as seasonality_bp
from modules.metals import bp as metals_bp
from modules.hormuz import bp as hormuz_bp
from modules.flows import bp as flows_bp
from modules.confluence import bp as confluence_bp
from modules.market import bp as market_bp
from modules.frontend import bp as frontend_bp
from modules.system import bp as system_bp
from modules.macro import bp as macro_bp
from modules.earnings import bp as earnings_bp
from modules.equities_core import bp as equities_core_bp
from modules.crypto_scanner import bp as crypto_scanner_bp
from modules.equities_research import bp as equities_research_bp
from modules.market_risk import bp as market_risk_bp
from modules.industries import bp as industries_bp
from modules.crypto_dashboard import bp as crypto_dashboard_bp
from modules.brief import bp as brief_bp, start_brief_scheduler

app.register_blueprint(seasonality_bp)
app.register_blueprint(metals_bp)
app.register_blueprint(hormuz_bp)
app.register_blueprint(flows_bp)
app.register_blueprint(confluence_bp)
app.register_blueprint(market_bp)
app.register_blueprint(frontend_bp)
app.register_blueprint(system_bp)
app.register_blueprint(macro_bp)
app.register_blueprint(earnings_bp)
app.register_blueprint(equities_core_bp)
app.register_blueprint(crypto_scanner_bp)
app.register_blueprint(equities_research_bp)
app.register_blueprint(market_risk_bp)
app.register_blueprint(industries_bp)
app.register_blueprint(crypto_dashboard_bp)
app.register_blueprint(brief_bp)
start_brief_scheduler()

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/html, */*',
}


# ── AI Article Generation ─────────────────────────────────────────────────────
import json as _json

def _load_secrets():
    """Read API keys from wave_secrets.env next to this file (KEY=VALUE lines).
    launchd background services do NOT inherit your shell environment, so the
    key must come from a file (or the process env as a fallback)."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wave_secrets.env')
    keys = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                keys[k.strip()] = v.strip().strip('"').strip("'")
    except Exception:
        pass
    for k in ('ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_MODEL', 'OPENAI_MODEL'):
        if k not in keys and os.environ.get(k):
            keys[k] = os.environ[k]
    return keys

def _looks_like_article(t):
    """Reject paywall/JS/config junk so we never feed garbage to the model."""
    if not t or len(t) < 350:
        return False
    code_chars = t.count('{') + t.count('}') + t.count(';') + t.count('=') + t.count('()')
    if code_chars > len(t) / 40:          # too much code/config
        return False
    junk = ('enable javascript', 'are you a robot', 'subscribe to continue',
            'access denied', 'var api', 'function(', 'window.__')
    low = t.lower()
    if sum(low.count(j) for j in junk) >= 2:
        return False
    return True

def _fetch_source_text(url):
    """Best-effort fetch + strip of the real article so the model writes from facts.
    Returns '' if the page is paywalled / JS-only / not real article prose."""
    if not url or not url.startswith('http'):
        return ''
    try:
        r = requests.get(url, headers=HEADERS, timeout=8)
        html = r.text
        html = re.sub(r'(?is)<(script|style|noscript|head)[^>]*>.*?</\1>', ' ', html)
        text = re.sub(r'(?s)<[^>]+>', ' ', html)
        text = re.sub(r'\s+', ' ', text).strip()
        text = text[:6000]
        return text if _looks_like_article(text) else ''
    except Exception:
        return ''

def _call_anthropic(key, model, prompt):
    # Try the configured model first, then fall back through known-good models
    # so this keeps working as Anthropic retires/renames models over time.
    candidates = [m for m in [model, 'claude-haiku-4-5-20251001', 'claude-3-5-haiku-latest',
                              'claude-sonnet-4-6', 'claude-3-5-sonnet-latest'] if m]
    seen, last = set(), None
    for mdl in candidates:
        if mdl in seen:
            continue
        seen.add(mdl)
        r = requests.post('https://api.anthropic.com/v1/messages',
            headers={'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
            json={'model': mdl, 'max_tokens': 2600,
                  'messages': [{'role': 'user', 'content': prompt}]},
            timeout=45)
        last = r
        if r.status_code == 404:   # model not found -> try the next candidate
            continue
        r.raise_for_status()
        d = r.json()
        return ''.join(p.get('text', '') for p in d.get('content', []))
    last.raise_for_status()
    d = last.json()
    return ''.join(p.get('text', '') for p in d.get('content', []))

def _call_openai(key, model, prompt):
    r = requests.post('https://api.openai.com/v1/chat/completions',
        headers={'Authorization': 'Bearer ' + key, 'content-type': 'application/json'},
        json={'model': model or 'gpt-4o-mini', 'max_tokens': 2600,
              'messages': [{'role': 'user', 'content': prompt}]},
        timeout=45)
    r.raise_for_status()
    return r.json()['choices'][0]['message']['content']

def _write_article(title, source, url, desc):
    """Core LLM article-writing logic, shared by /api/article (on-demand) and
    the top-stories curator (pre-generated). Returns a dict with lead/body/
    image_query/sources, or {'error': ...} if no key is configured or the
    LLM call fails."""
    secrets  = _load_secrets()
    key_anth = secrets.get('ANTHROPIC_API_KEY')
    key_oai  = secrets.get('OPENAI_API_KEY')
    if not key_anth and not key_oai:
        return {'error': 'No API key set. Double-click set-api-key.command to add your LLM key.'}

    source_text = _fetch_source_text(url)
    if source_text:
        grounding = ('Below is the real source article text (possibly truncated). Base the article ONLY on facts '
                     'found in it. Do NOT invent quotes, figures, dates, or events.\n\n=== SOURCE ===\n' + source_text)
    elif desc:
        grounding = ('The full article is paywalled, but here is the news-feed summary of the story. Expand it into a '
                     'readable article, adding general context a knowledgeable reader would already know. Do NOT invent '
                     'specific figures, quotes, dates, or named events beyond what the summary supports.\n\n'
                     '=== FEED SUMMARY ===\n' + desc)
    else:
        grounding = ('No source text is available. Write a SHORT contextual summary based on the headline alone, '
                     'making clear it is general context. Do NOT fabricate specific quotes, numbers, dates, or named events.')

    prompt = (
        "You are a financial news writer. Write a detailed, useful article (~600-900 words).\n"
        "Structure the body in 5-7 paragraphs covering: (1) what happened, (2) key details/numbers, "
        "(3) background and context, (4) market/sector implications, (5) what to watch next. You may use "
        "short markdown subheadings (## ) to separate sections.\n"
        "You may add widely-known general background and context to add depth, but do NOT invent specific "
        "figures, quotes, dates, or named events that are not supported by the source/summary below.\n"
        "IMPORTANT: Always produce an article. If information is limited, write a clearly hedged contextual "
        "piece instead of refusing. Never reply that you cannot write it.\n"
        f"HEADLINE: {title}\nSOURCE: {source}\n\n" + grounding + "\n\n"
        "Respond with STRICT JSON only (no code fences), keys exactly:\n"
        '{"lead": "one-sentence standfirst", "body": "markdown, 5-7 paragraphs", '
        '"image_query": "3-4 image keywords"}'
    )

    try:
        if key_anth:
            raw = _call_anthropic(key_anth, secrets.get('ANTHROPIC_MODEL'), prompt)
        else:
            raw = _call_openai(key_oai, secrets.get('OPENAI_MODEL'), prompt)
    except Exception as e:
        return {'error': 'LLM request failed: ' + str(e)}

    data = None
    try:
        data = _json.loads(raw)
    except Exception:
        m = re.search(r'\{.*\}', raw, re.S)
        if m:
            try: data = _json.loads(m.group(0))
            except Exception: data = None
    if not isinstance(data, dict):
        data = {'lead': '', 'body': raw, 'image_query': title}

    data.setdefault('lead', '')
    data.setdefault('image_query', title)
    body = (data.get('body') or '').strip()
    data['body'] = body + '\n\n*AI-generated — verify against the original source before acting.*'
    data['sources'] = [{'url': url, 'title': title, 'source': source or 'Source'}] if url else []
    return data


@app.route('/api/article')
def api_article():
    title  = request.args.get('title', '').strip()
    source = request.args.get('source', '').strip()
    url    = request.args.get('url', '').strip()
    desc   = request.args.get('desc', '').strip()
    if not title:
        return jsonify({'error': 'No headline provided.'}), 200
    return jsonify(_write_article(title, source, url, desc))


# ── Top Stories Archive ───────────────────────────────────────────────────────
# Picks a diversified set of "today's big stories" (macro/Fed, geopolitical,
# earnings/tech movers, energy, plus one data-driven divergence signal we
# compute ourselves), writes a full article + generates an image for each via
# _write_article/_gen_ai_image, and saves them permanently to wave_cache.db —
# both to power the home page carousel with real per-story images, and so the
# Blog page has a real, growing archive instead of "Coming Soon".
import hashlib as _hashlib
import random as _random

_IMG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'article_images')
os.makedirs(_IMG_DIR, exist_ok=True)

_TOPSTORY_FEEDS = [
    ('https://feeds.bloomberg.com/markets/news.rss',                                    'Bloomberg'),
    ('https://www.cnbc.com/id/100003114/device/rss/rss.html',                           'CNBC'),
    ('https://www.ft.com/?format=rss',                                                  'FT'),
    ('https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US','Yahoo Finance'),
    ('https://www.federalreserve.gov/feeds/press_all.xml',                              'Federal Reserve'),
]

# Pairs we watch for a same-sector relative-performance split worth calling
# out (e.g. SMH vs SOXX both track semis but can diverge on idiosyncratic
# single-name moves). All numbers below come from real yfinance closes.
_DIVERGENCE_PAIRS = [
    ('SMH', 'SOXX', 'Semiconductors'),
    ('XLE', 'XLF',  'Energy vs. Financials'),
    ('IWM', 'QQQ',  'Small Caps vs. Nasdaq 100'),
    ('XLK', 'XLC',  'Tech vs. Communication Services'),
]

def _articles_db():
    con = _sqlite3.connect(_PCR_DB)
    con.execute('''CREATE TABLE IF NOT EXISTS articles (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        story_hash  TEXT UNIQUE,
        title       TEXT,
        source      TEXT,
        link        TEXT,
        desc        TEXT,
        category    TEXT,
        pub         TEXT,
        image_path  TEXT,
        lead        TEXT,
        body        TEXT,
        created_at  TEXT
    )''')
    con.commit()
    return con

def _story_hash(title):
    return _hashlib.sha256(title.strip().lower().encode()).hexdigest()[:16]

def _collect_top_story_candidates():
    candidates, seen = [], set()
    for feed_url, source in _TOPSTORY_FEEDS:
        try:
            r = requests.get(feed_url, headers=HEADERS, timeout=8)
            root = ET.fromstring(r.text)
            for item in root.findall('.//item')[:20]:
                title = (item.findtext('title') or '').strip()
                link  = (item.findtext('link')  or '').strip()
                pub   = (item.findtext('pubDate') or '').strip()
                desc  = re.sub(r'<[^>]+>', '', item.findtext('description') or '')[:400].strip()
                if not title or title in seen:
                    continue
                seen.add(title)
                candidates.append({'title': title, 'link': link, 'source': source,
                                    'pub': pub, 'desc': desc, 'category': _categorise(title)})
        except Exception:
            pass
    return candidates

def _gen_divergence_story():
    """Real, computed relative-performance split between two same-sector
    ETFs over the last 5 trading days. Returns None if nothing is currently
    diverging meaningfully (>=3 pt spread) — we never fabricate a signal."""
    try:
        import pandas as pd
        best = None
        for a, b, label in _DIVERGENCE_PAIRS:
            hist = yf.download([a, b], period='1mo', interval='1d',
                                progress=False, auto_adjust=True)['Close'].dropna()
            if len(hist) < 6:
                continue
            ret_a = float((hist[a].iloc[-1] / hist[a].iloc[-6] - 1) * 100)
            ret_b = float((hist[b].iloc[-1] / hist[b].iloc[-6] - 1) * 100)
            spread = ret_a - ret_b
            if best is None or abs(spread) > abs(best['spread']):
                best = {'a': a, 'b': b, 'label': label, 'ret_a': ret_a, 'ret_b': ret_b, 'spread': spread}
        if best is None or abs(best['spread']) < 3:
            return None
        leader, lag = (best['a'], best['b']) if best['spread'] > 0 else (best['b'], best['a'])
        lead_ret, lag_ret = (best['ret_a'], best['ret_b']) if best['spread'] > 0 else (best['ret_b'], best['ret_a'])
        title = f"{leader} vs {lag}: {best['label']} splits {abs(best['spread']):.1f} pts over 5 days"
        desc  = (f"{leader} is {'up' if lead_ret>=0 else 'down'} {abs(lead_ret):.1f}% over the last 5 trading "
                 f"days while {lag} is {'up' if lag_ret>=0 else 'down'} {abs(lag_ret):.1f}% — a "
                 f"{abs(best['spread']):.1f} point relative divergence within {best['label'].lower()}.")
        return {'title': title, 'link': '', 'source': 'Wave Capital Signals',
                'pub': email.utils.format_datetime(datetime.now(timezone.utc)),
                'desc': desc, 'category': 'MARKETS'}
    except Exception:
        return None

def _pick_top_stories(n=8):
    pool = _collect_top_story_candidates()

    def pub_ts(s):
        try:
            return email.utils.parsedate_to_datetime(s['pub']).timestamp()
        except Exception:
            return 0
    pool.sort(key=pub_ts, reverse=True)

    buckets = {}
    for s in pool:
        buckets.setdefault(s['category'], []).append(s)

    picked = []
    # Categories the desk always wants represented, in priority order.
    for cat in ('MACRO', 'GEO', 'EARNINGS', 'TECH', 'ENERGY', 'MARKETS', 'CRYPTO'):
        if len(picked) >= n:
            break
        if buckets.get(cat):
            picked.append(buckets[cat].pop(0))

    div_story = _gen_divergence_story()
    if div_story:
        picked.insert(min(2, len(picked)), div_story)

    remaining = [s for lst in buckets.values() for s in lst]
    remaining.sort(key=pub_ts, reverse=True)
    for s in remaining:
        if len(picked) >= n:
            break
        picked.append(s)

    return picked[:n]

def _scrape_og_image(url, out_path):
    """Find the source article's real og:image and download it to out_path
    server-side. We re-host it locally rather than linking the publisher's
    URL directly — CNBC (and others) send 403s on hotlinked <img> requests
    from a different origin, which silently blanked out the card/hero image
    in the browser even though the URL itself was valid."""
    if not url:
        return False
    try:
        r = requests.get(url, headers=HEADERS, timeout=8)
        m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', r.text, re.I)
        if not m:
            m = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', r.text, re.I)
        if not m:
            return False
        img_url = m.group(1).replace('&amp;', '&')
        ir = requests.get(img_url, headers=HEADERS, timeout=10)
        if ir.status_code == 200 and ir.headers.get('content-type', '').startswith('image'):
            with open(out_path, 'wb') as f:
                f.write(ir.content)
            return True
        return False
    except Exception:
        return False

def _gen_ai_image(prompt, out_path, retries=3):
    """Free, keyless AI image generation via pollinations.ai. The service is
    shared/anonymous and occasionally 429s under load, so we retry with
    backoff; callers should treat a False return as 'no image' and fall
    back to the story's real og:image rather than blocking on this."""
    import urllib.parse
    q = urllib.parse.quote(prompt[:300])
    for attempt in range(retries):
        try:
            seed = _random.randint(1, 999_999)
            url = f'https://image.pollinations.ai/prompt/{q}?width=880&height=460&nologo=true&seed={seed}'
            r = requests.get(url, timeout=30)
            if r.status_code == 200 and r.headers.get('content-type', '').startswith('image'):
                with open(out_path, 'wb') as f:
                    f.write(r.content)
                return True
        except Exception:
            pass
        _time.sleep(2 * (attempt + 1))
    return False

def _generate_and_save_top_stories():
    con   = _articles_db()
    today = datetime.now().strftime('%Y-%m-%d')
    existing_today = con.execute(
        "SELECT COUNT(*) FROM articles WHERE date(created_at)=?", (today,)).fetchone()[0]
    if existing_today >= 8:
        con.close()
        return
    for s in _pick_top_stories(n=8):
        h = _story_hash(s['title'])
        if con.execute('SELECT 1 FROM articles WHERE story_hash=?', (h,)).fetchone():
            continue
        art = _write_article(s['title'], s['source'], s.get('link', ''), s.get('desc', ''))
        if 'error' in art:
            art = {'lead': '', 'body': '', 'image_query': s['title']}

        img_path = None
        out_file = os.path.join(_IMG_DIR, h + '.jpg')
        prompt = f"editorial photograph, {art.get('image_query', s['title'])}, financial news, photojournalism, no text, no watermark"
        if _gen_ai_image(prompt, out_file):
            img_path = '/article-images/' + h + '.jpg'
        elif _scrape_og_image(s.get('link'), out_file):
            img_path = '/article-images/' + h + '.jpg'

        con.execute('''INSERT OR IGNORE INTO articles
            (story_hash, title, source, link, desc, category, pub, image_path, lead, body, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
            (h, s['title'], s['source'], s.get('link', ''), s.get('desc', ''), s.get('category', 'MARKETS'),
             s.get('pub', ''), img_path, art.get('lead', ''), art.get('body', ''), datetime.now().isoformat()))
        con.commit()
    con.close()

def _top_stories_scheduler_loop():
    while True:
        try:
            _generate_and_save_top_stories()
        except Exception:
            pass
        _time.sleep(1800)  # check every 30 min; function itself no-ops once today's 8 exist

_threading.Thread(target=_top_stories_scheduler_loop, daemon=True).start()


@app.route('/article-images/<path:filename>')
def article_images(filename):
    return send_from_directory(_IMG_DIR, filename)


@app.route('/api/top-stories')
def top_stories_route():
    con   = _articles_db()
    today = datetime.now().strftime('%Y-%m-%d')
    rows  = con.execute('''SELECT id, title, source, link, desc, category, pub, image_path, lead, created_at
                            FROM articles WHERE date(created_at)=? ORDER BY id DESC''', (today,)).fetchall()
    con.close()
    cols = ['id', 'title', 'source', 'link', 'desc', 'category', 'pub', 'image_url', 'lead', 'created_at']
    return jsonify({'stories': [dict(zip(cols, r)) for r in rows]})


@app.route('/api/blog/articles')
def blog_articles_route():
    limit  = min(int(request.args.get('limit', 20)), 50)
    offset = int(request.args.get('offset', 0))
    con    = _articles_db()
    rows   = con.execute('''SELECT id, title, source, category, image_path, lead, created_at
                             FROM articles ORDER BY id DESC LIMIT ? OFFSET ?''', (limit, offset)).fetchall()
    total  = con.execute('SELECT COUNT(*) FROM articles').fetchone()[0]
    con.close()
    cols = ['id', 'title', 'source', 'category', 'image_url', 'lead', 'created_at']
    return jsonify({'articles': [dict(zip(cols, r)) for r in rows], 'total': total})


@app.route('/api/blog/article/<int:aid>')
def blog_article_route(aid):
    con  = _articles_db()
    row  = con.execute('''SELECT id, title, source, link, desc, category, pub, image_path, lead, body, created_at
                           FROM articles WHERE id=?''', (aid,)).fetchone()
    con.close()
    if not row:
        return jsonify({'error': 'not found'}), 404
    cols = ['id', 'title', 'source', 'link', 'desc', 'category', 'pub', 'image_url', 'lead', 'body', 'created_at']
    return jsonify(dict(zip(cols, row)))


# ── What Moved This Ticker — catalyst deep-dive ───────────────────────────────
def _mover_price(sym):
    """Live price + change. ALL math done here in code, never by the model."""
    try:
        t = yf.Ticker(sym)
        h = t.history(period='1mo', interval='1d')
        if h is None or h.empty or len(h) < 2:
            return None
        closes = h['Close'].dropna()
        last  = float(closes.iloc[-1])
        prev  = float(closes.iloc[-2])
        chg   = last - prev
        pct   = (chg / prev * 100.0) if prev else 0.0
        first5 = float(closes.iloc[-6]) if len(closes) >= 6 else float(closes.iloc[0])
        pct5  = ((last - first5) / first5 * 100.0) if first5 else 0.0
        return {'symbol': sym, 'price': round(last, 2), 'prev_close': round(prev, 2),
                'change': round(chg, 2), 'pct': round(pct, 2), 'pct_5d': round(pct5, 2),
                'asof': h.index[-1].strftime('%Y-%m-%d')}
    except Exception:
        return None

def _mover_news(sym):
    out = []
    try:
        url = f'https://news.google.com/rss/search?q={sym}+stock+when:7d&hl=en-US&gl=US&ceid=US:en'
        r = requests.get(url, headers=HEADERS, timeout=8)
        root = ET.fromstring(r.text)
        for item in root.findall('.//item')[:12]:
            out.append({'title': (item.findtext('title') or '').strip(),
                        'url':   (item.findtext('link') or '').strip(),
                        'date':  (item.findtext('pubDate') or '').strip(),
                        'source_type': 'news'})
    except Exception:
        pass
    return out

def _mover_reddit(sym):
    # Reddit blocks generic UAs / datacenter IPs. Try a browser UA + fallback host;
    # if it still blocks, return [] and the deep-dive simply proceeds without Reddit.
    out = []
    for base in ('https://www.reddit.com', 'https://old.reddit.com'):
        try:
            url = f'{base}/search.json?q=%24{sym}&sort=top&t=week&limit=12'
            r = requests.get(url, headers={'User-Agent': HEADERS['User-Agent'],
                                           'Accept': 'application/json'}, timeout=8)
            if r.status_code != 200:
                continue
            for c in r.json().get('data', {}).get('children', []):
                d = c.get('data', {})
                out.append({'title': d.get('title', ''),
                            'url': 'https://reddit.com' + d.get('permalink', ''),
                            'score': d.get('score', 0),
                            'sub': d.get('subreddit', ''),
                            'text': (d.get('selftext', '') or '')[:280],
                            'source_type': 'reddit'})
            if out:
                break
        except Exception:
            continue
    return out

def _mover_stocktwits(sym):
    res = {'messages': [], 'bullish': 0, 'bearish': 0}
    try:
        r = requests.get(f'https://api.stocktwits.com/api/2/streams/symbol/{sym}.json',
                         headers=HEADERS, timeout=8)
        for m in r.json().get('messages', [])[:25]:
            ent = (m.get('entities', {}) or {}).get('sentiment') or {}
            b = ent.get('basic')
            if b == 'Bullish':
                res['bullish'] += 1
            elif b == 'Bearish':
                res['bearish'] += 1
            res['messages'].append({'body': (m.get('body', '') or '')[:200], 'sentiment': b})
    except Exception:
        pass
    return res

def _mover_8k(sym):
    out = []
    try:
        cik = _edgar_get_cik(sym)
        if not cik:
            return out
        r = requests.get(f'https://data.sec.gov/submissions/CIK{cik}.json',
                         headers={'User-Agent': 'wave-capital research contact@example.com'}, timeout=10)
        recent = r.json().get('filings', {}).get('recent', {})
        forms = recent.get('form', [])
        dates = recent.get('filingDate', [])
        accns = recent.get('accessionNumber', [])
        docs  = recent.get('primaryDocument', [])
        items = recent.get('items', [''] * len(forms))
        for i, form in enumerate(forms):
            if form == '8-K' and i < len(dates):
                acc = accns[i].replace('-', '') if i < len(accns) else ''
                doc = docs[i] if i < len(docs) else ''
                link = f'https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc}/{doc}' if acc else ''
                out.append({'title': '8-K filed ' + dates[i] + (' — items ' + items[i] if i < len(items) and items[i] else ''),
                            'url': link, 'date': dates[i], 'source_type': 'sec_8k'})
            if len(out) >= 4:
                break
    except Exception:
        pass
    return out

@app.route('/api/ticker-mover')
def ticker_mover():
    sym = request.args.get('symbol', '').strip().upper()
    if not sym:
        return jsonify({'error': 'No ticker provided.'}), 200

    price = _mover_price(sym)
    news  = _mover_news(sym)
    reddit = _mover_reddit(sym)
    st    = _mover_stocktwits(sym)
    filings = _mover_8k(sym)

    sources = []
    sources += [{'title': n['title'], 'url': n['url'], 'source_type': 'news', 'date': n.get('date', '')} for n in news if n['title']]
    sources += [{'title': f"r/{r['sub']}: {r['title']} (▲{r['score']})", 'url': r['url'], 'source_type': 'reddit', 'date': ''} for r in reddit if r['title']]
    sources += [{'title': f['title'], 'url': f['url'], 'source_type': 'sec_8k', 'date': f.get('date', '')} for f in filings]

    secrets = _load_secrets()
    key_anth = secrets.get('ANTHROPIC_API_KEY')
    key_oai  = secrets.get('OPENAI_API_KEY')
    if not key_anth and not key_oai:
        return jsonify({'symbol': sym, 'price': price, 'sources': sources,
                        'sentiment': {'bullish': st['bullish'], 'bearish': st['bearish']},
                        'error': 'No API key set — showing raw sources only. Add a key via set-api-key.command for the AI deep-dive.'}), 200

    # Build a compact corpus for the model
    move_line = (f"{sym} is {('up' if price['pct'] >= 0 else 'down')} {price['pct']}% today "
                 f"(to ${price['price']} from ${price['prev_close']}), {price['pct_5d']}% over 5 days, as of {price['asof']}."
                 if price else f"{sym}: live price could not be confirmed.")
    corpus = "NEWS HEADLINES (last 7d):\n" + "\n".join(f"- {n['title']} ({n['date']})" for n in news[:12]) or "none"
    corpus += "\n\nSEC 8-K FILINGS (material events):\n" + ("\n".join(f"- {f['title']}" for f in filings) or "none")
    corpus += "\n\nREDDIT (top this week):\n" + ("\n".join(f"- [{r['sub']}, ▲{r['score']}] {r['title']} :: {r['text'][:140]}" for r in reddit[:10]) or "none")
    corpus += f"\n\nSTOCKTWITS SENTIMENT: {st['bullish']} bullish vs {st['bearish']} bearish tagged messages."
    corpus += "\nSTOCKTWITS RECENT:\n" + ("\n".join(f"- {m['body']}" for m in st['messages'][:8]) or "none")

    prompt = (
        "You are an equity analyst. A trader wants to know WHAT MOVED this stock and WHY, fast.\n"
        f"PRICE MOVE: {move_line}\n\n"
        "Below is material gathered from news, SEC 8-K filings, Reddit, and StockTwits. Using ONLY this material, "
        "identify the most likely catalysts for the move and rank them by likelihood. Be concrete. If the material "
        "does NOT clearly explain the move, say so plainly and describe the chatter instead — do NOT invent a reason, "
        "and do NOT state specific numbers/quotes/dates not present below.\n\n"
        + corpus + "\n\n"
        "Respond with STRICT JSON only (no code fences), keys exactly:\n"
        '{"lead": "one-sentence bottom-line on what moved it", '
        '"catalysts": [{"title": "short catalyst name", "why": "1-2 sentences", "source_type": "news|sec_8k|reddit|stocktwits", "confidence": "high|medium|low"}], '
        '"body": "markdown, 2-3 short paragraphs of context", '
        '"sentiment_note": "one line on retail/social sentiment"}'
    )

    try:
        if key_anth:
            raw = _call_anthropic(key_anth, secrets.get('ANTHROPIC_MODEL'), prompt)
        else:
            raw = _call_openai(key_oai, secrets.get('OPENAI_MODEL'), prompt)
    except Exception as e:
        return jsonify({'symbol': sym, 'price': price, 'sources': sources,
                        'sentiment': {'bullish': st['bullish'], 'bearish': st['bearish']},
                        'error': 'AI deep-dive failed: ' + str(e)}), 200

    analysis = None
    try:
        analysis = _json.loads(raw)
    except Exception:
        m = re.search(r'\{.*\}', raw, re.S)
        if m:
            try: analysis = _json.loads(m.group(0))
            except Exception: analysis = None
    if not isinstance(analysis, dict):
        analysis = {'lead': '', 'catalysts': [], 'body': raw, 'sentiment_note': ''}

    return jsonify({'symbol': sym, 'price': price, 'analysis': analysis, 'sources': sources,
                    'sentiment': {'bullish': st['bullish'], 'bearish': st['bearish']},
                    'disclaimer': 'AI synthesis of public sources — verify before trading.'})


if __name__ == '__main__':
    print('Wave Capital API → http://localhost:5001')
    app.run(host='127.0.0.1', port=5001, debug=False)