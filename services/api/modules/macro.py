"""Macro news, calendar, FRED proxy and rates/yields routes."""

import email.utils
import re
import time as _time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import requests
import yfinance as yf
from flask import Blueprint, Response, jsonify, request
from services.fred import get_series_csv

bp = Blueprint("macro", __name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/html, */*",
}

# ── Macro News Scanner ───────────────────────────────────────────────────────
_MACRO_TOPICS = {
    'FED':       {'label':'Fed / Rates',    'emoji':'🏦', 'color':'#60a5fa',
                  'kw':['fed','fomc','powell','rate cut','rate hike','interest rate','basis point','fed funds','monetary policy','quantitative','taper','dot plot','balance sheet']},
    'INFLATION': {'label':'Inflation / CPI','emoji':'📈', 'color':'#f97316',
                  'kw':['cpi','inflation','pce','price index','deflation','stagflation','core inflation','ppi','consumer price','producer price']},
    'JOBS':      {'label':'Jobs',           'emoji':'💼', 'color':'#4ade80',
                  'kw':['jobs','unemployment','nonfarm','payroll','jobless','labor market','hiring','layoff','job openings','jolts','adp']},
    'GDP':       {'label':'GDP / Growth',   'emoji':'📊', 'color':'#a78bfa',
                  'kw':['gdp','growth','recession','contraction','expansion','economic output','q1','q2','q3','q4','ism','pmi','manufacturing']},
    'TRADE':     {'label':'Trade / Tariffs','emoji':'🌍', 'color':'#fbbf24',
                  'kw':['tariff','trade war','import','export','duties','wto','trade deficit','trade deal','sanctions','supply chain']},
    'FX':        {'label':'Dollar / FX',   'emoji':'💵', 'color':'#38bdf8',
                  'kw':['dollar','dxy','currency','forex','euro','yen','yuan','renminbi','sterling','pound','swiss franc','devaluation']},
    'ENERGY':    {'label':'Oil / Energy',  'emoji':'🛢️', 'color':'#fb923c',
                  'kw':['oil','crude','opec','wti','brent','natural gas','energy price','gasoline','petroleum','barrel']},
    'HOUSING':   {'label':'Housing',       'emoji':'🏠', 'color':'#34d399',
                  'kw':['housing','mortgage','existing home','building permit','case-shiller','home price','real estate','rent','30-year']},
    'DEBT':      {'label':'Debt / Fiscal', 'emoji':'📉', 'color':'#f87171',
                  'kw':['debt ceiling','deficit','treasury','bond yield','10-year','2-year','yield curve','spread','auction','fiscal']},
}

_COUNTRY_RULES = [
    ('CN', ['china', 'chinese', 'beijing', 'pboc', 'shanghai', 'xi jinping', 'yuan', 'renminbi', 'hong kong', 'taiwan strait']),
    ('EU', ['europe', 'european', 'ecb', 'eurozone', 'euro zone', 'lagarde', 'germany', 'german', 'france', 'french', 'italy', 'italian', 'spain', 'spanish', 'brussels', 'berlin', 'paris']),
    ('UK', ['uk ', 'u.k.', 'britain', 'british', 'bank of england', 'boe', 'london', 'sterling', 'pound', 'sunak', 'chancellor']),
    ('JP', ['japan', 'japanese', 'boj', 'bank of japan', 'tokyo', 'nikkei', 'yen', 'ueda', 'kishida']),
    ('IL', ['israel', 'israeli', 'shekel', 'tel aviv', 'bank of israel', 'boi rate', 'idf', 'gaza']),
    ('GLOBAL', ['imf', 'world bank', 'g7', 'g20', 'bis ', 'global ', 'worldwide', 'international monetary']),
]

def _macro_categorise(title: str) -> str:
    t = title.lower()
    for cat, cfg in _MACRO_TOPICS.items():
        if any(k in t for k in cfg['kw']):
            return cat
    return None  # not macro

def _detect_country(title: str, desc: str) -> str:
    text = (title + ' ' + desc).lower()
    for code, kws in _COUNTRY_RULES:
        if any(k in text for k in kws):
            return code
    return 'US'

@bp.route('/api/macro-news')
def macro_news():
    # NOTE: MarketWatch (feeds.content.dowjones.io) and Reuters (feeds.reuters.com)
    # were dropped — MarketWatch's feed responds 200 but serves months-old cached
    # headlines, and feeds.reuters.com no longer resolves (Reuters killed public
    # RSS years ago). Both silently injected stale stories into the feed.
    feeds = [
        ('https://www.cnbc.com/id/100003114/device/rss/rss.html', 'CNBC'),
        ('https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US', 'Yahoo Finance'),
        ('https://www.federalreserve.gov/feeds/press_all.xml', 'Federal Reserve'),
    ]
    seen, stories = set(), []
    for feed_url, source in feeds:
        try:
            r = requests.get(feed_url, headers=HEADERS, timeout=8)
            root = ET.fromstring(r.text)
            for item in root.findall('.//item'):
                title = (item.findtext('title') or '').strip()
                link  = (item.findtext('link')  or '#').strip()
                pub   = (item.findtext('pubDate') or '').strip()
                desc  = re.sub(r'<[^>]+>', '', item.findtext('description') or '')[:140].strip()
                cat   = _macro_categorise(title)
                if title and title not in seen and cat:
                    seen.add(title)
                    stories.append({
                        'title':    title,
                        'link':     link,
                        'source':   source,
                        'pub':      pub,
                        'desc':     desc,
                        'category': cat,
                        'label':    _MACRO_TOPICS[cat]['label'],
                        'emoji':    _MACRO_TOPICS[cat]['emoji'],
                        'color':    _MACRO_TOPICS[cat]['color'],
                        'country':  _detect_country(title, desc),
                    })
        except Exception:
            pass

    def _pub_key(s):
        # Raw RFC-822 pubDate strings ("Wed, 31 Jul 2024 ...") don't sort
        # chronologically as strings — parse to an actual datetime so old
        # stories can't outrank new ones just by weekday/day spelling.
        try:
            return email.utils.parsedate_to_datetime(s.get('pub', ''))
        except Exception:
            return datetime.min.replace(tzinfo=timezone.utc)
    stories.sort(key=_pub_key, reverse=True)
    return jsonify({'stories': stories[:60], 'topics': {k: v['label'] for k,v in _MACRO_TOPICS.items()}})


_econ_cal_cache = {'data': None, 'ts': 0}

@bp.route('/api/econ-calendar')
def econ_calendar():
    # Proxied server-side because nfs.faireconomy.media has no CORS headers,
    # so the browser was blocking this fetch outright (calendar stuck on
    # "Loading events..." forever). Cached for 15 min — this source also
    # 429s aggressively on repeat requests, and the calendar only needs to
    # refresh a few times a day anyway.
    if _econ_cal_cache['data'] is not None and _time.time() - _econ_cal_cache['ts'] < 900:
        return jsonify(_econ_cal_cache['data'])
    try:
        r = requests.get('https://nfs.faireconomy.media/ff_calendar_thisweek.json',
                          headers=HEADERS, timeout=10)
        data = r.json()
        _econ_cal_cache['data'] = data
        _econ_cal_cache['ts']   = _time.time()
        return jsonify(data)
    except Exception as e:
        if _econ_cal_cache['data'] is not None:
            return jsonify(_econ_cal_cache['data'])
        return jsonify({'error': str(e)}), 502


@bp.route('/api/fred')
def fred_proxy():
    series = request.args.get('series', '').strip()
    if not series or not re.fullmatch(r'[A-Za-z0-9_]+', series):
        return Response('invalid series', status=400)
    try:
        text, _from_cache = get_series_csv(series)
        return Response(text, mimetype='text/csv')
    except Exception as exc:
        return Response(str(exc), status=502)

# ── Rates & Yields ────────────────────────────────────────────────────────────
@bp.route('/api/yields')
def yields():
    CURVE = [
        ('3M', '^IRX'),
        ('2Y', '2YY=F'),
        ('5Y', '^FVX'),
        ('10Y', '^TNX'),
        ('30Y', '^TYX'),
    ]
    curve = []
    try:
        for label, sym in CURVE:
            try:
                hist = yf.Ticker(sym).history(period='5d', interval='1d')
                if hist.empty:
                    continue
                curr  = round(float(hist['Close'].iloc[-1]), 3)
                prev  = round(float(hist['Close'].iloc[-2]), 3) if len(hist) >= 2 else curr
                wk    = round(float(hist['Close'].iloc[0]),  3) if len(hist) >= 5 else prev
                curve.append({'label': label, 'symbol': sym, 'yield': curr,
                              'chg_day': round(curr - prev, 3), 'chg_week': round(curr - wk, 3)})
            except Exception:
                pass

        # 1-year history for 10Y chart
        hist10 = yf.Ticker('^TNX').history(period='1y', interval='1d')
        chart = []
        for dt, row in hist10.iterrows():
            chart.append({'date': str(dt)[:10], 'value': round(float(row['Close']), 3)})

        # Spreads
        y2  = next((c['yield'] for c in curve if c['label'] == '2Y'),  None)
        y10 = next((c['yield'] for c in curve if c['label'] == '10Y'), None)
        y30 = next((c['yield'] for c in curve if c['label'] == '30Y'), None)
        y3m = next((c['yield'] for c in curve if c['label'] == '3M'),  None)
        spread_2_10  = round(y10 - y2,  3) if y10 and y2  else None
        spread_3m_10 = round(y10 - y3m, 3) if y10 and y3m else None

        return jsonify({
            'curve':        curve,
            'chart10y':     chart[-60:],   # last 60 days
            'spread_2_10':  spread_2_10,
            'spread_3m_10': spread_3m_10,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


