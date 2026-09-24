"""Equity market structure, fundamentals, holders, sectors and news."""

import re
import requests
import yfinance as yf
import xml.etree.ElementTree as ET
from flask import Blueprint, jsonify, request
from services.sec import get_cik as _edgar_get_cik, get_company_facts as _edgar_get_facts

bp = Blueprint("equities_core", __name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/html, */*",
}

# ── Sub-sector stock universe ────────────────────────────────────────────────
SECTOR_DETAIL = {
    'XLK': {'name': 'Technology', 'subsectors': {
        'Semiconductors':       ['NVDA','AMD','AVGO','QCOM','MU','AMAT','LRCX','TXN','INTC'],
        'Software':             ['MSFT','CRM','ORCL','NOW','ADBE','INTU','PANW'],
        'Hardware & IT Svcs':   ['AAPL','CSCO','IBM','ACN','DELL','HPQ'],
    }},
    'XLC': {'name': 'Comm. Services', 'subsectors': {
        'Interactive Media':    ['META','GOOGL','SNAP','PINS','RDDT'],
        'Telecom':              ['VZ','T','TMUS'],
        'Entertainment':        ['NFLX','DIS','WBD','PARA'],
    }},
    'XLY': {'name': 'Consumer Disc.', 'subsectors': {
        'Retail & E-Commerce':  ['AMZN','HD','LOW','TJX','ROST','BKNG'],
        'Auto':                 ['TSLA','GM','F','RIVN'],
        'Hotels & Leisure':     ['MAR','HLT','MCD','SBUX','NKE','YUM'],
    }},
    'XLF': {'name': 'Financials', 'subsectors': {
        'Large Banks':          ['JPM','BAC','WFC','C','GS','MS'],
        'Insurance':            ['BRK-B','MET','PRU','AFL','TRV'],
        'Asset Management':     ['BLK','SCHW','ICE','CME'],
        'Regional Banks':       ['USB','TFC','PNC','CFG','FITB'],
    }},
    'XLI': {'name': 'Industrials', 'subsectors': {
        'Aerospace & Defense':  ['BA','LMT','RTX','NOC','GD','HII'],
        'Transportation':       ['UPS','FDX','CSX','UNP','DAL','UAL'],
        'Machinery':            ['CAT','DE','EMR','HON','ETN','PH'],
    }},
    'XLV': {'name': 'Healthcare', 'subsectors': {
        'Pharma':               ['LLY','JNJ','PFE','MRK','ABBV','BMY'],
        'Biotech':              ['AMGN','GILD','REGN','VRTX','BIIB'],
        'Medical Devices':      ['MDT','ABT','SYK','BSX','EW'],
        'Health Services':      ['UNH','CVS','CI','HUM'],
    }},
    'XLP': {'name': 'Consumer Staples', 'subsectors': {
        'Food & Beverage':      ['KO','PEP','MDLZ','GIS','K','CPB'],
        'Household Products':   ['PG','CL','KMB','CHD'],
        'Retail Staples':       ['WMT','COST','TGT','KR'],
        'Tobacco':              ['MO','PM'],
    }},
    'XLB': {'name': 'Materials', 'subsectors': {
        'Chemicals':            ['LIN','APD','DD','DOW','PPG','SHW','IFF'],
        'Mining & Metals':      ['FCX','NEM','GOLD','ALB','MP'],
        'Construction Matls':   ['VMC','MLM'],
        'Packaging':            ['IP','PKG','AMCR','SEE'],
    }},
    'XLE': {'name': 'Energy', 'subsectors': {
        'Integrated Oil':       ['XOM','CVX'],
        'E&P (Upstream)':       ['COP','EOG','DVN','MRO','APA'],
        'Oilfield Services':    ['SLB','HAL','BKR','NOV'],
        'Pipelines & Midstream':['ET','EPD','WMB','KMI','OKE'],
    }},
    'XLRE': {'name': 'Real Estate', 'subsectors': {
        'Data Centers':         ['EQIX','DLR','AMT','CCI','SBAC'],
        'Industrial REITs':     ['PLD','FR','EGP','REXR'],
        'Residential REITs':    ['EQR','AVB','ESS','MAA','UDR'],
        'Retail REITs':         ['SPG','O','REG','KIM','NNN'],
        'Office REITs':         ['BXP','SLG','VNO','HIW','CUZ'],
        'Healthcare REITs':     ['WELL','VTR','DOC'],
        'Self Storage':         ['PSA','EXR','CUBE','LSI'],
    }},
    'XLU': {'name': 'Utilities', 'subsectors': {
        'Electric Utilities':   ['NEE','DUK','SO','D','AEP','EXC','XEL','PCG'],
        'Multi-Utility':        ['SRE','WEC','ES','CMS','AES'],
        'Water':                ['AWK','WTRG'],
    }},
}

# period → (yf fetch period, lookback in trading days)
PERIOD_MAP = {
    '1d': ('5d',   2),
    '1w': ('1mo',  6),
    '1m': ('3mo', 22),
    '3m': ('6mo', 64),
}

@bp.route('/api/sector-detail')
def sector_detail():
    sector_sym = request.args.get('sector', '').upper().strip()
    period     = request.args.get('period', '1d')
    if sector_sym not in SECTOR_DETAIL:
        return jsonify({'error': 'unknown sector'}), 400
    info = SECTOR_DETAIL[sector_sym]
    yf_period, lookback = PERIOD_MAP.get(period, ('5d', 2))

    all_symbols = []
    for syms in info['subsectors'].values():
        all_symbols.extend(syms)

    try:
        raw   = yf.download(all_symbols, period=yf_period, interval='1d',
                            progress=False, auto_adjust=True)
        closes = raw['Close'] if len(all_symbols) > 1 else raw[['Close']].rename(columns={'Close': all_symbols[0]})

        result = []
        for sub_name, symbols in info['subsectors'].items():
            stocks = []
            for sym in symbols:
                try:
                    col  = closes[sym].dropna()
                    if len(col) < 2:
                        continue
                    last  = float(col.iloc[-1])
                    start = float(col.iloc[max(0, len(col) - lookback)])
                    pct   = (last - start) / start * 100
                    stocks.append({'symbol': sym, 'price': last, 'pct': round(pct, 2)})
                except Exception:
                    pass
            if not stocks:
                continue
            stocks.sort(key=lambda x: x['pct'], reverse=True)
            avg = sum(s['pct'] for s in stocks) / len(stocks)
            result.append({'name': sub_name, 'avg_pct': round(avg, 2), 'stocks': stocks})

        result.sort(key=lambda x: x['avg_pct'], reverse=True)
        return jsonify({'sector': info['name'], 'subsectors': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Fundamental charting — historical financials ──────────────────────────────

# Shared EDGAR provider helpers live in services/sec.py.

def _edgar_extract(facts, concepts, form, min_days=60, max_days=100):
    """Extract standalone period values for a metric. Tries concepts in order."""
    from datetime import datetime as _dt
    def diff_days(s, e):
        return (_dt.strptime(e, '%Y-%m-%d') - _dt.strptime(s, '%Y-%m-%d')).days

    for concept in concepts:
        raw = facts.get(concept, {}).get('units', {}).get('USD', [])
        if not raw:
            continue
        rows = [x for x in raw
                if x.get('form') == form and 'start' in x and 'end' in x
                and min_days <= diff_days(x['start'], x['end']) <= max_days]
        if not rows:
            continue
        # Deduplicate by end date — keep most recently filed
        seen = {}
        for x in rows:
            end = x['end']
            if end not in seen or x.get('filed','') > seen[end].get('filed',''):
                seen[end] = x
        return {end: float(x['val']) for end, x in seen.items()}
    return {}

def _edgar_extract_eps(facts, form, min_days=60, max_days=100):
    from datetime import datetime as _dt
    def diff_days(s, e):
        return (_dt.strptime(e, '%Y-%m-%d') - _dt.strptime(s, '%Y-%m-%d')).days
    concepts = ['EarningsPerShareDiluted']
    for concept in concepts:
        raw = facts.get(concept, {}).get('units', {}).get('USD/shares', [])
        if not raw:
            raw = facts.get(concept, {}).get('units', {}).get('USD', [])
        if not raw:
            continue
        rows = [x for x in raw
                if x.get('form') == form and 'start' in x and 'end' in x
                and min_days <= diff_days(x['start'], x['end']) <= max_days]
        seen = {}
        for x in rows:
            end = x['end']
            if end not in seen or x.get('filed','') > seen[end].get('filed',''):
                seen[end] = x
        if seen:
            return {end: float(x['val']) for end, x in seen.items()}
    return {}

# Annual EDGAR: period length 340-380 days, form 10-K
_EDGAR_ANNUAL_DAYS = (340, 380)
_EDGAR_Q_DAYS      = (60, 100)

EDGAR_CONCEPTS = {
    'revenue':          ['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet','SalesRevenueGoodsNet'],
    'gross_profit':     ['GrossProfit'],
    'operating_income': ['OperatingIncomeLoss'],
    'net_income':       ['NetIncomeLoss'],
    'rd_expense':       ['ResearchAndDevelopmentExpense'],
    'capex':            ['PaymentsToAcquirePropertyPlantAndEquipment'],
    'free_cash_flow':   [],  # computed: OCF - capex
}
EDGAR_OCF_CONCEPTS = ['NetCashProvidedByUsedInOperatingActivities']
EDGAR_CAPEX_CONCEPTS = ['PaymentsToAcquirePropertyPlantAndEquipment']

FUNDAMENTAL_METRICS = {
    'revenue':           ('financials',  'Total Revenue',    'absolute'),
    'gross_profit':      ('financials',  'Gross Profit',     'absolute'),
    'operating_income':  ('financials',  'Operating Income', 'absolute'),
    'net_income':        ('financials',  'Net Income',       'absolute'),
    'eps_diluted':       ('financials',  'Diluted EPS',      'absolute'),
    'rd_expense':        ('financials',  'Research And Development', 'absolute'),
    'free_cash_flow':    ('cashflow',    'Free Cash Flow',   'absolute'),
    'capex':             ('cashflow',    'Capital Expenditure', 'absolute'),
    'gross_margin':      ('financials',  None,               'margin'),   # computed
    'operating_margin':  ('financials',  None,               'margin'),
    'net_margin':        ('financials',  None,               'margin'),
    'revenue_growth':    ('financials',  'Total Revenue',    'growth'),
    'op_income_growth':  ('financials',  'Operating Income', 'growth'),
    'net_income_growth': ('financials',  'Net Income',       'growth'),
}

@bp.route('/api/fundamentals')
def fundamentals():
    symbol  = request.args.get('symbol', '').strip().upper()
    metric  = request.args.get('metric', 'revenue')
    period  = request.args.get('period', 'annual')   # annual | quarterly
    if not symbol:
        return jsonify({'error': 'symbol required'}), 400
    if metric not in FUNDAMENTAL_METRICS:
        return jsonify({'error': 'unknown metric'}), 400
    try:
        source, row_key, kind = FUNDAMENTAL_METRICS[metric]

        # --- EDGAR path for quarterly (deep history back to ~2010) ---
        if period == 'quarterly':
            cik = _edgar_get_cik(symbol)
            if cik:
                facts = _edgar_get_facts(cik)
                form, d_min, d_max = '10-Q', _EDGAR_Q_DAYS[0], _EDGAR_Q_DAYS[1]

                if metric == 'eps_diluted':
                    raw = _edgar_extract_eps(facts, form, d_min, d_max)
                elif metric == 'free_cash_flow':
                    ocf   = _edgar_extract(facts, EDGAR_OCF_CONCEPTS,   form, d_min, d_max)
                    capex = _edgar_extract(facts, EDGAR_CAPEX_CONCEPTS,  form, d_min, d_max)
                    raw = {d: ocf[d] - abs(capex.get(d, 0)) for d in ocf}
                elif metric in ('gross_margin', 'operating_margin', 'net_margin'):
                    rev_raw = _edgar_extract(facts, EDGAR_CONCEPTS['revenue'],          form, d_min, d_max)
                    num_key = {'gross_margin':'gross_profit','operating_margin':'operating_income','net_margin':'net_income'}[metric]
                    num_raw = _edgar_extract(facts, EDGAR_CONCEPTS[num_key],            form, d_min, d_max)
                    raw = {d: round(num_raw[d] / rev_raw[d] * 100, 2) for d in rev_raw if d in num_raw and rev_raw[d] != 0}
                elif metric in ('revenue_growth', 'op_income_growth', 'net_income_growth'):
                    base_key = {'revenue_growth':'revenue','op_income_growth':'operating_income','net_income_growth':'net_income'}[metric]
                    base_raw = _edgar_extract(facts, EDGAR_CONCEPTS[base_key], form, d_min, d_max)
                    sorted_d = sorted(base_raw)
                    raw = {}
                    for i in range(1, len(sorted_d)):
                        prev_v = base_raw[sorted_d[i-1]]
                        if prev_v and prev_v != 0:
                            raw[sorted_d[i]] = round((base_raw[sorted_d[i]] - prev_v) / abs(prev_v) * 100, 2)
                elif metric == 'capex':
                    raw_cap = _edgar_extract(facts, EDGAR_CAPEX_CONCEPTS, form, d_min, d_max)
                    raw = {d: -abs(v) for d, v in raw_cap.items()}
                else:
                    concepts = EDGAR_CONCEPTS.get(metric, [])
                    raw = _edgar_extract(facts, concepts, form, d_min, d_max) if concepts else {}

                if raw:
                    sorted_data = [{'date': k, 'value': v} for k, v in sorted(raw.items())]
                    name = yf.Ticker(symbol).info.get('shortName') or symbol
                    return jsonify({'symbol': symbol, 'name': name, 'metric': metric, 'period': period, 'data': sorted_data})
            # Fall through to yfinance if EDGAR fails or no CIK

        # --- yfinance path (annual, or quarterly fallback) ---
        t = yf.Ticker(symbol)
        if period == 'quarterly':
            fin = t.quarterly_financials
            cf  = t.quarterly_cashflow
        else:
            fin = t.financials
            cf  = t.cashflow

        def extract(df, key):
            if df is None or df.empty or key not in df.index:
                return {}
            row = df.loc[key].dropna()
            return {str(ts)[:10]: float(v) for ts, v in row.items()}

        if kind == 'margin':
            rev   = extract(fin, 'Total Revenue')
            if metric == 'gross_margin':
                num = extract(fin, 'Gross Profit')
            elif metric == 'operating_margin':
                num = extract(fin, 'Operating Income')
            else:
                num = extract(fin, 'Net Income')
            data = {}
            for d in rev:
                if d in num and rev[d] != 0:
                    data[d] = round(num[d] / rev[d] * 100, 2)
        elif kind == 'growth':
            raw = extract(fin, row_key)
            sorted_dates = sorted(raw.keys())
            data = {}
            for i in range(1, len(sorted_dates)):
                curr_d = sorted_dates[i]
                prev_d = sorted_dates[i - 1]
                prev_v = raw[prev_d]
                if prev_v and prev_v != 0:
                    data[curr_d] = round((raw[curr_d] - prev_v) / abs(prev_v) * 100, 2)
        elif source == 'cashflow':
            data = extract(cf, row_key)
        else:
            data = extract(fin, row_key)

        sorted_data = [{'date': k, 'value': v} for k, v in sorted(data.items())]
        name = yf.Ticker(symbol).info.get('shortName') or symbol
        return jsonify({'symbol': symbol, 'name': name, 'metric': metric, 'period': period, 'data': sorted_data})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Stock KPI detail ──────────────────────────────────────────────────────────
@bp.route('/api/stock-info')
def stock_info():
    symbol = request.args.get('symbol', '').strip().upper()
    if not symbol:
        return jsonify({'error': 'symbol required'}), 400
    try:
        t = yf.Ticker(symbol)
        info = t.info

        def g(key, default=None):
            v = info.get(key, default)
            return None if v in (None, 'N/A', float('inf'), float('-inf')) else v

        def pct(key):
            v = g(key)
            return round(v * 100, 2) if v is not None else None

        # Extract CEO from officers list
        officers = info.get('companyOfficers', [])
        ceo = next((o.get('name') for o in officers if 'CEO' in (o.get('title') or '')), None)

        return jsonify({
            'symbol':           symbol,
            'name':             g('longName') or g('shortName') or symbol,
            'description':      g('longBusinessSummary'),
            'sector':           g('sector'),
            'industry':         g('industry'),
            'website':          g('website'),
            'employees':        g('fullTimeEmployees'),
            'ceo':              ceo,
            'exchange':         g('exchange'),
            'shares_out':       g('sharesOutstanding'),
            'total_revenue':    g('totalRevenue'),
            'market_cap':       g('marketCap'),
            'price':            g('currentPrice') or g('regularMarketPrice'),
            'fifty_two_high':   g('fiftyTwoWeekHigh'),
            'fifty_two_low':    g('fiftyTwoWeekLow'),
            'beta':             g('beta'),
            'avg_volume':       g('averageVolume'),
            # Valuation
            'pe_trailing':      g('trailingPE'),
            'pe_forward':       g('forwardPE'),
            'ps_ratio':         g('priceToSalesTrailing12Months'),
            'pb_ratio':         g('priceToBook'),
            'ev_ebitda':        g('enterpriseToEbitda'),
            'peg_ratio':        g('pegRatio'),
            # Earnings & Growth
            'eps_trailing':     g('trailingEps'),
            'eps_forward':      g('forwardEps'),
            'revenue_growth':   pct('revenueGrowth'),
            'earnings_growth':  pct('earningsGrowth'),
            # Profitability
            'gross_margin':     pct('grossMargins'),
            'operating_margin': pct('operatingMargins'),
            'net_margin':       pct('profitMargins'),
            'roe':              pct('returnOnEquity'),
            'roa':              pct('returnOnAssets'),
            # Balance sheet
            'debt_to_equity':   g('debtToEquity'),
            'current_ratio':    g('currentRatio'),
            'quick_ratio':      g('quickRatio'),
            # Dividends
            'dividend_yield':   g('dividendYield'),   # already in % (e.g. 0.39 = 0.39%)
            'payout_ratio':     pct('payoutRatio'),
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Ownership / holders ───────────────────────────────────────────────────────
@bp.route('/api/holders')
def holders():
    symbol = request.args.get('symbol', '').strip().upper()
    if not symbol:
        return jsonify({'error': 'symbol required'}), 400
    try:
        t = yf.Ticker(symbol)
        # Major holders summary (index = Breakdown name)
        mh = t.major_holders
        insiders_pct     = float(mh.loc['insidersPercentHeld', 'Value']) * 100 if mh is not None and 'insidersPercentHeld' in mh.index else 0
        institutions_pct = float(mh.loc['institutionsPercentHeld', 'Value']) * 100 if mh is not None and 'institutionsPercentHeld' in mh.index else 0
        public_pct       = max(0, 100 - insiders_pct - institutions_pct)

        # Top institutional holders
        ih = t.institutional_holders
        top = []
        if ih is not None and not ih.empty:
            for _, row in ih.head(10).iterrows():
                top.append({
                    'name':       str(row['Holder']),
                    'pct':        round(float(row['pctHeld']) * 100, 3),
                    'shares':     int(row['Shares']),
                    'value':      int(row['Value']),
                    'pct_change': round(float(row['pctChange']) * 100, 2),
                    'date':       str(row['Date Reported'])[:10],
                })

        return jsonify({
            'insiders_pct':     round(insiders_pct, 3),
            'institutions_pct': round(institutions_pct, 2),
            'public_pct':       round(public_pct, 2),
            'top_holders':      top,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Sector strength (SPDR ETFs) ───────────────────────────────────────────────
SECTORS = [
    {'symbol': 'XLK',  'name': 'Technology'},
    {'symbol': 'XLC',  'name': 'Comm. Services'},
    {'symbol': 'XLY',  'name': 'Consumer Disc.'},
    {'symbol': 'XLF',  'name': 'Financials'},
    {'symbol': 'XLI',  'name': 'Industrials'},
    {'symbol': 'XLV',  'name': 'Healthcare'},
    {'symbol': 'XLP',  'name': 'Consumer Staples'},
    {'symbol': 'XLB',  'name': 'Materials'},
    {'symbol': 'XLE',  'name': 'Energy'},
    {'symbol': 'XLRE', 'name': 'Real Estate'},
    {'symbol': 'XLU',  'name': 'Utilities'},
]

@bp.route('/api/sectors')
def sectors():
    try:
        symbols = [s['symbol'] for s in SECTORS]
        tickers = yf.download(symbols, period='5d', interval='1d', progress=False, auto_adjust=True)
        closes = tickers['Close']
        result = []
        for s in SECTORS:
            sym = s['symbol']
            try:
                col = closes[sym].dropna()
                last = float(col.iloc[-1])
                prev = float(col.iloc[-2]) if len(col) >= 2 else last
                pct  = (last - prev) / prev * 100
                result.append({'symbol': sym, 'name': s['name'], 'price': last, 'pct': pct})
            except Exception:
                pass
        result.sort(key=lambda x: x['pct'], reverse=True)
        return jsonify({'sectors': result})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── News: RSS feeds ───────────────────────────────────────────────────────────
_NEWS_CATEGORIES = {
    'MACRO':    ['fed', 'rate', 'inflation', 'gdp', 'recession', 'economy', 'treasury', 'yield', 'fomc', 'powell', 'cpi', 'pce', 'jobs', 'unemployment'],
    'MARKETS':  ['s&p', 'nasdaq', 'dow', 'stock', 'index', 'equity', 'rally', 'selloff', 'market', 'wall street', 'bull', 'bear', 'spx', 'russell'],
    'EARNINGS': ['earnings', 'revenue', 'profit', 'eps', 'quarterly', 'guidance', 'beat', 'miss', 'results', 'q1', 'q2', 'q3', 'q4'],
    'CRYPTO':   ['bitcoin', 'btc', 'crypto', 'ethereum', 'eth', 'blockchain', 'defi', 'token', 'solana', 'binance'],
    'GEO':      ['war', 'sanctions', 'china', 'iran', 'russia', 'tariff', 'trade', 'geopolit', 'conflict', 'taiwan', 'opec', 'israel', 'ukraine'],
    'TECH':     ['ai', 'apple', 'nvidia', 'microsoft', 'google', 'meta', 'amazon', 'tesla', 'openai', 'chip', 'semiconductor'],
    'ENERGY':   ['oil', 'crude', 'opec', 'energy', 'natural gas', 'wti', 'brent', 'refin'],
}

def _categorise(title: str) -> str:
    t = title.lower()
    for cat, kws in _NEWS_CATEGORIES.items():
        if any(k in t for k in kws):
            return cat
    return 'MARKETS'

@bp.route('/api/news')
def news():
    from email.utils import parsedate_to_datetime
    # (url, source_name, priority_boost_minutes) — higher boost = bubbles up in sort
    feeds = [
        ('https://feeds.bloomberg.com/markets/news.rss',                                    'Bloomberg',   30),
        ('https://www.cnbc.com/id/100003114/device/rss/rss.html',                           'CNBC',        20),
        ('https://www.ft.com/?format=rss',                                                  'FT',          10),
        ('https://feeds.marketwatch.com/marketwatch/marketpulse/',                          'MarketWatch',  0),
        ('https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC&region=US&lang=en-US','Yahoo Finance',0),
    ]
    seen, stories = set(), []
    for feed_url, source, boost in feeds:
        try:
            r = requests.get(feed_url, headers=HEADERS, timeout=8)
            root = ET.fromstring(r.text)
            for item in root.findall('.//item'):
                title = (item.findtext('title') or '').strip()
                link  = (item.findtext('link')  or '#').strip()
                pub   = (item.findtext('pubDate') or '').strip()
                desc  = (item.findtext('description') or '').strip()
                desc  = re.sub(r'<[^>]+>', '', desc)[:600]
                if title and title not in seen:
                    seen.add(title)
                    try:
                        ts = parsedate_to_datetime(pub).timestamp() + boost * 60
                    except Exception:
                        ts = boost * 60
                    stories.append({
                        'title':    title,
                        'link':     link,
                        'source':   source,
                        'pub':      pub,
                        'desc':     desc,
                        'category': _categorise(title),
                        '_ts':      ts,
                    })
        except Exception:
            pass
    # Sort by recency (Bloomberg/CNBC get a priority boost to win ties)
    stories.sort(key=lambda s: s['_ts'], reverse=True)
    for s in stories:
        del s['_ts']
    return jsonify({'stories': stories[:12]})


