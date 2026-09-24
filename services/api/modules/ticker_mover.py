"""Ticker catalyst deep-dive route."""

import json as _json
import re
import xml.etree.ElementTree as ET

import requests
from flask import Blueprint, jsonify, request

from services.sec import get_cik
from services.yahoo import history_frame
from services.ai import load_ai_config, call_anthropic, call_openai

bp = Blueprint("ticker_mover", __name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/html, */*",
}

# ── What Moved This Ticker — catalyst deep-dive ───────────────────────────────
def _mover_price(sym):
    """Live price + change. ALL math done here in code, never by the model."""
    try:
        h = history_frame(sym, period='1mo', interval='1d')
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
        cik = get_cik(sym)
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

@bp.route('/api/ticker-mover')
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

    secrets = load_ai_config()
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
            raw = call_anthropic(key_anth, secrets.get('ANTHROPIC_MODEL'), prompt)
        else:
            raw = call_openai(key_oai, secrets.get('OPENAI_MODEL'), prompt)
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