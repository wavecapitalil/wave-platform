"""Article generation, top-stories archive and blog routes."""

import email.utils
import os
import re
import sqlite3
import threading
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import requests
import yfinance as yf
from flask import Blueprint, jsonify, request, send_from_directory

bp = Blueprint("content", __name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/html, */*",
}

# ── AI Article Generation ─────────────────────────────────────────────────────
import json as _json

def _load_secrets():
    """Read provider credentials from process environment only."""
    keys = {}
    for key in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_MODEL", "OPENAI_MODEL"):
        value = os.environ.get(key)
        if value:
            keys[key] = value
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
        return {'error': 'No AI provider key is configured in the server environment.'}

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


@bp.route('/api/article')
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

DATA_DIR = os.path.abspath(os.getenv("WAVE_DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")))
_IMG_DIR = os.path.join(DATA_DIR, "article_images")
_CONTENT_DB = os.path.join(DATA_DIR, "wave_content.db")
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
    con = sqlite3.connect(_CONTENT_DB)
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
        time.sleep(2 * (attempt + 1))
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
        time.sleep(1800)  # check every 30 min; function itself no-ops once today's 8 exist

_content_scheduler_started = False

def start_content_scheduler():
    """Start the top-stories curator once per process."""
    global _content_scheduler_started
    if _content_scheduler_started:
        return
    threading.Thread(
        target=_top_stories_scheduler_loop,
        daemon=True,
        name="wave-content-scheduler",
    ).start()
    _content_scheduler_started = True


@bp.route('/article-images/<path:filename>')
def article_images(filename):
    return send_from_directory(_IMG_DIR, filename)


@bp.route('/api/top-stories')
def top_stories_route():
    con   = _articles_db()
    today = datetime.now().strftime('%Y-%m-%d')
    rows  = con.execute('''SELECT id, title, source, link, desc, category, pub, image_path, lead, created_at
                            FROM articles WHERE date(created_at)=? ORDER BY id DESC''', (today,)).fetchall()
    con.close()
    cols = ['id', 'title', 'source', 'link', 'desc', 'category', 'pub', 'image_url', 'lead', 'created_at']
    return jsonify({'stories': [dict(zip(cols, r)) for r in rows]})


@bp.route('/api/blog/articles')
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


@bp.route('/api/blog/article/<int:aid>')
def blog_article_route(aid):
    con  = _articles_db()
    row  = con.execute('''SELECT id, title, source, link, desc, category, pub, image_path, lead, body, created_at
                           FROM articles WHERE id=?''', (aid,)).fetchone()
    con.close()
    if not row:
        return jsonify({'error': 'not found'}), 404
    cols = ['id', 'title', 'source', 'link', 'desc', 'category', 'pub', 'image_url', 'lead', 'body', 'created_at']
    return jsonify(dict(zip(cols, row)))


