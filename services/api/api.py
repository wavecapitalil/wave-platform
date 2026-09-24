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

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/html, */*',
}


# ── Fear & Greed (CNN) ────────────────────────────────────────────────────────
@app.route('/api/fear-greed')
def fear_greed():
    try:
        r = requests.get(
            'https://production.dataviz.cnn.io/index/fearandgreed/current',
            headers={
                **HEADERS,
                'Referer': 'https://edition.cnn.com/markets/fear-and-greed',
                'Origin': 'https://edition.cnn.com',
            },
            timeout=10
        )
        r.raise_for_status()
        return jsonify(r.json())
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Single quote: price + daily % change ─────────────────────────────────────
@app.route('/api/quote')
def quote():
    symbol = request.args.get('symbol', '').strip()
    if not symbol:
        return jsonify({'error': 'symbol required'}), 400
    try:
        info  = yf.Ticker(symbol).info
        state = info.get('marketState', 'REGULAR')
        if state == 'PRE' and info.get('preMarketPrice') and info.get('preMarketChangePercent') is not None:
            price = info['preMarketPrice']
            pct   = info['preMarketChangePercent']
        elif state in ('POST', 'POSTPOST') and info.get('postMarketPrice') and info.get('postMarketChangePercent') is not None:
            price = info['postMarketPrice']
            pct   = info['postMarketChangePercent']
        else:
            price = info.get('regularMarketPrice') or info.get('currentPrice')
            pct   = info.get('regularMarketChangePercent', 0)
        if price is None:
            raise ValueError('no price in info')
        return jsonify({'price': price, 'pct': pct, 'symbol': symbol})
    except Exception:
        pass
    # Fallback: daily history
    try:
        hist = yf.Ticker(symbol).history(period='5d', interval='1d')
        if hist.empty:
            return jsonify({'error': 'no data'}), 404
        closes = hist['Close'].dropna().tolist()
        last = closes[-1]
        prev = closes[-2] if len(closes) >= 2 else last
        pct  = (last - prev) / prev * 100
        return jsonify({'price': last, 'pct': pct, 'symbol': symbol})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Intraday closes for sparklines (5m candles, today) ───────────────────────
@app.route('/api/intraday')
def intraday():
    symbol = request.args.get('symbol', '').strip()
    if not symbol:
        return jsonify({'error': 'symbol required'}), 400
    try:
        hist = yf.Ticker(symbol).history(period='1d', interval='5m')
        if hist.empty:
            return jsonify({'closes': []})
        closes = hist['Close'].ffill().dropna().tolist()
        return jsonify({'closes': closes})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── VIX: last 7 daily closes for 3-day trend ─────────────────────────────────
@app.route('/api/vix-history')
def vix_history():
    try:
        hist = yf.Ticker('^VIX').history(period='7d', interval='1d')
        if hist.empty:
            return jsonify({'error': 'no data'}), 404
        closes = hist['Close'].dropna().tolist()
        return jsonify({'closes': closes})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


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

@app.route('/api/sector-detail')
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

# EDGAR helpers — gives quarterly data back to 2010+
_edgar_cik_cache  = {}   # ticker → cik
_edgar_facts_cache = {}  # cik → (timestamp, facts_dict)
_EDGAR_CACHE_TTL  = 86400  # 24 hours

def _edgar_get_cik(ticker):
    if ticker in _edgar_cik_cache:
        return _edgar_cik_cache[ticker]
    import time as _t
    headers = {'User-Agent': 'WaveCapital contact@wavecapital.com'}
    r = requests.get('https://www.sec.gov/files/company_tickers.json', headers=headers, timeout=10)
    mapping = r.json()
    for v in mapping.values():
        _edgar_cik_cache[v['ticker'].upper()] = str(v['cik_str']).zfill(10)
    return _edgar_cik_cache.get(ticker)

def _edgar_get_facts(cik):
    import time as _t
    now = _t.time()
    if cik in _edgar_facts_cache:
        ts, facts = _edgar_facts_cache[cik]
        if now - ts < _EDGAR_CACHE_TTL:
            return facts
    headers = {'User-Agent': 'WaveCapital contact@wavecapital.com'}
    r = requests.get(f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json',
                     headers=headers, timeout=30)
    facts = r.json().get('facts', {}).get('us-gaap', {})
    _edgar_facts_cache[cik] = (now, facts)
    return facts

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

@app.route('/api/fundamentals')
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
@app.route('/api/stock-info')
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
@app.route('/api/holders')
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

@app.route('/api/sectors')
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

@app.route('/api/news')
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


# ── Serve explicitly allowlisted public files only ────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, '..', '..'))
PUBLIC_DIR = os.path.join(PROJECT_ROOT, 'apps', 'terminal', 'public')

_PUBLIC_FILES = {
    'terminal_app.html',
    'terminal.html',
    'index.html',
    'blog.html',
    'products.html',
    'i18n.js',
}

@app.route('/')
@app.route('/terminal')
def serve_terminal():
    return send_from_directory(PUBLIC_DIR, 'terminal_app.html')

@app.route('/<path:filename>')
def serve_public_file(filename):
    # Deliberately deny arbitrary project files (.env, .py, .db, logs, etc.).
    if filename not in _PUBLIC_FILES:
        return jsonify({'error': 'not found'}), 404
    return send_from_directory(PUBLIC_DIR, filename)

# ── Crypto Scanner — CoinGecko + DeFiLlama + GitHub ──────────────────────────
SCANNER_CHAINS = [
    {'name':'Ethereum',  'symbol':'ETH',  'cg':'ethereum',       'llama':'Ethereum',  'gh':'ethereum/go-ethereum'},
    {'name':'Solana',    'symbol':'SOL',  'cg':'solana',          'llama':'Solana',    'gh':'solana-labs/solana'},
    {'name':'BNB Chain', 'symbol':'BNB',  'cg':'binancecoin',     'llama':'BSC',       'gh':'bnb-chain/bsc'},
    {'name':'Avalanche', 'symbol':'AVAX', 'cg':'avalanche-2',     'llama':'Avalanche', 'gh':'ava-labs/avalanchego'},
    {'name':'Sui',       'symbol':'SUI',  'cg':'sui',             'llama':'Sui',       'gh':'MystenLabs/sui'},
    {'name':'Sei',       'symbol':'SEI',  'cg':'sei-network',     'llama':'Sei',       'gh':'sei-protocol/sei-chain'},
    {'name':'Arbitrum',  'symbol':'ARB',  'cg':'arbitrum',        'llama':'Arbitrum',  'gh':'OffchainLabs/nitro'},
    {'name':'Base',      'symbol':'BASE', 'cg':None,              'llama':'Base',      'gh':'base-org/node'},
]

@app.route('/api/crypto-scanner')
def crypto_scanner():
    result = {c['name']: {'name': c['name'], 'symbol': c['symbol']} for c in SCANNER_CHAINS}

    # 1. CoinGecko — price, market cap, volume, 24h%, 7d%, FDV
    try:
        cg_ids = ','.join(c['cg'] for c in SCANNER_CHAINS if c['cg'])
        r = requests.get(
            'https://api.coingecko.com/api/v3/coins/markets'
            '?vs_currency=usd&ids=' + cg_ids +
            '&order=market_cap_desc&per_page=20&sparkline=false'
            '&price_change_percentage=7d',
            timeout=12
        )
        for coin in r.json():
            for c in SCANNER_CHAINS:
                if c['cg'] == coin['id']:
                    result[c['name']].update({
                        'price':      coin.get('current_price'),
                        'market_cap': coin.get('market_cap'),
                        'fdv':        coin.get('fully_diluted_valuation'),
                        'volume_24h': coin.get('total_volume'),
                        'pct_24h':    coin.get('price_change_percentage_24h'),
                        'pct_7d':     coin.get('price_change_percentage_7d_in_currency'),
                    })
    except Exception:
        pass

    # 2. DeFiLlama — TVL per chain
    try:
        r = requests.get('https://api.llama.fi/v2/chains', timeout=10)
        llama_map = {item['name']: item.get('tvl') for item in r.json()}
        for c in SCANNER_CHAINS:
            tvl = llama_map.get(c['llama'])
            if tvl:
                result[c['name']]['tvl'] = tvl
    except Exception:
        pass

    # 3. DeFiLlama — stablecoin supply per chain
    try:
        r = requests.get('https://stablecoins.llama.fi/stablecoins?includePrices=true', timeout=12)
        chain_stable = {}
        for s in r.json().get('peggedAssets', []):
            for chain, data in s.get('chainCirculating', {}).items():
                amt = (data.get('current') or {}).get('peggedUSD') or 0
                key = chain.lower()
                chain_stable[key] = chain_stable.get(key, 0) + amt
        llama_key = {
            'Ethereum':'ethereum','Solana':'solana','BNB Chain':'bsc',
            'Avalanche':'avax','Sui':'sui','Sei':'sei',
            'Arbitrum':'arbitrum','Base':'base'
        }
        for name, key in llama_key.items():
            if key in chain_stable:
                result[name]['stablecoin_supply'] = chain_stable[key]
    except Exception:
        pass

    # 4. GitHub — dev commits last 30 days (last 4 weeks of commit_activity)
    for c in SCANNER_CHAINS:
        try:
            r = requests.get(
                'https://api.github.com/repos/' + c['gh'] + '/stats/commit_activity',
                headers={'Accept': 'application/vnd.github.v3+json'},
                timeout=8
            )
            if r.status_code == 200:
                weeks = r.json()
                result[c['name']]['dev_commits_30d'] = sum(w.get('total', 0) for w in weeks[-4:])
        except Exception:
            pass

    # 5. Derived metrics
    for d in result.values():
        mcap = d.get('market_cap')
        tvl  = d.get('tvl')
        vol  = d.get('volume_24h')
        if mcap and tvl and tvl > 0:
            d['mcap_tvl'] = round(mcap / tvl, 2)
        if mcap and vol and mcap > 0:
            d['vol_mcap_pct'] = round(vol / mcap * 100, 2)

    return jsonify({'chains': list(result.values())})


# ── Daily Brief ───────────────────────────────────────────────────────────────
import threading as _threading
import re as _re_brief
_brief_cache = {'content': None, 'filename': None, 'loaded_at': None}
_brief_lock  = _threading.Lock()

# Scan these locations for briefing HTML files (recursively for agent outputs)
_BRIEF_SEARCH_DIRS = [
    os.path.expanduser('~/Library/Application Support/Claude/local-agent-mode-sessions'),
    '/Users/danielarad/Library/Mobile Documents/com~apple~CloudDocs/Trading Briefings',
]
_DATE_PAT = _re_brief.compile(r'(\d{4}-\d{2}-\d{2})')


def _load_brief_cache():
    import datetime, subprocess as _sp
    now_il = datetime.datetime.utcnow() + datetime.timedelta(hours=3)
    today  = now_il.strftime('%Y-%m-%d')
    hour   = now_il.hour
    if hour < 16:
        session_suffix = 'morning'
    elif hour < 23 or (hour == 23 and now_il.minute < 30):
        session_suffix = 'opening'
    else:
        session_suffix = 'eod'

    # Collect (date_str, full_path) for every dated .html in outputs/ folders
    candidates = []
    for base in _BRIEF_SEARCH_DIRS:
        try:
            for root, dirs, files in os.walk(base):
                # Only look inside */outputs/ subfolders for agent sessions;
                # for the iCloud dir, accept the top level too
                in_outputs = root.endswith('/outputs') or root == base
                if not in_outputs:
                    continue
                for fname in files:
                    if not fname.endswith('.html'):
                        continue
                    m = _DATE_PAT.search(fname)
                    if m:
                        candidates.append((m.group(1), fname, os.path.join(root, fname)))
        except Exception:
            continue

    if not candidates:
        print('[brief] no candidate files found', flush=True)
        return

    # Sort: today+session first, today next, then most recent date
    def _sort_key(item):
        date_str, fname, _ = item
        pri = 0 if (date_str == today and session_suffix in fname.lower()) else \
              1 if date_str == today else 2
        return (pri, [-int(x) for x in date_str.split('-')])

    candidates.sort(key=_sort_key)

    for date_str, fname, path in candidates:
        try:
            result = _sp.run(['cat', path], capture_output=True, timeout=10)
            content = result.stdout.decode('utf-8', errors='replace')
            if len(content.strip()) < 500:   # skip stubs / empty shells
                continue
            with _brief_lock:
                _brief_cache['content']  = content
                _brief_cache['filename'] = fname
                _brief_cache['loaded_at'] = datetime.datetime.now().isoformat()
            print(f'[brief] loaded: {fname} ({len(content)} chars)', flush=True)
            return
        except Exception as _e:
            print(f'[brief] failed {path}: {_e}', flush=True)
            continue
    print(f'[brief] no file loaded from {len(candidates)} candidates', flush=True)


def _brief_refresh_loop():
    import time
    while True:
        time.sleep(600)
        _load_brief_cache()


# ── Master Scheduler ──────────────────────────────────────────────────────────
# One background thread; each job tracks its own last_run and interval.
import time as _time

_SCHEDULE = [
    # (name, interval_seconds, function)
    # Brief: every 60 min (iCloud TCC works in main thread at startup,
    #   subsequent refreshes try from the scheduler thread — may fail silently)
    ('brief_refresh',    3_600,   _load_brief_cache),
    # Comm. Flows earnings: every 24 hours
    ('comm_flows_edgar', 86_400,  lambda: _cf.check_and_update()),
]
_schedule_state = {name: {'last_run': None, 'last_status': 'pending'} for name, *_ in _SCHEDULE}


def _master_scheduler():
    """Single background thread running all scheduled jobs."""
    while True:
        now = _time.time()
        for name, interval, fn in _SCHEDULE:
            state    = _schedule_state[name]
            last_run = state['last_run']
            if last_run is None or (now - last_run) >= interval:
                try:
                    fn()
                    state['last_status'] = 'ok'
                except Exception as _e:
                    state['last_status'] = f'error: {_e}'
                state['last_run'] = _time.time()
        _time.sleep(60)  # check every minute


# Load at startup from main thread — has terminal TCC permissions for iCloud
_load_brief_cache()
# Run initial comm-flows update at startup
try:
    _cf.check_and_update()
    _schedule_state['comm_flows_edgar']['last_run'] = _time.time()
    _schedule_state['comm_flows_edgar']['last_status'] = 'ok'
except Exception:
    pass
# Start master scheduler
_threading.Thread(target=_master_scheduler, daemon=True).start()


_CHART_INJECT = """
<style>
.wc-charts-section{max-width:960px;margin:0 auto 48px;padding:0 0px}
.wc-charts-title{font-size:16px;font-weight:700;color:#4a9eff;text-transform:uppercase;letter-spacing:2px;margin-bottom:18px;padding-bottom:8px;border-bottom:1px solid #1e293b;font-family:'Inter',-apple-system,sans-serif}
.wc-chart-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.wc-chart-box{background:#0f1729;border:1px solid #1e293b;border-radius:10px;padding:16px}
.wc-chart-box h4{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:12px;font-family:'Inter',-apple-system,sans-serif}
.wc-chart-full{background:#0f1729;border:1px solid #1e293b;border-radius:10px;padding:16px;margin-bottom:16px}
.wc-chart-full h4{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:12px;font-family:'Inter',-apple-system,sans-serif}
.wc-err{font-size:12px;color:#475569;padding:20px;text-align:center}
@media(max-width:600px){.wc-chart-row{grid-template-columns:1fr}}
</style>
<div class="wc-charts-section" id="wcChartsSection" style="display:none">
  <div class="wc-charts-title">📊 Live Market Snapshot</div>
  <div class="wc-chart-full">
    <h4>Indices — Daily % Change</h4>
    <canvas id="wcIndexChart" height="120"></canvas>
  </div>
  <div class="wc-chart-row">
    <div class="wc-chart-box">
      <h4>Cross-Asset — Daily % Change</h4>
      <canvas id="wcAssetChart" height="240"></canvas>
    </div>
    <div class="wc-chart-box">
      <h4>VIX vs SPY — 30-Day Trend</h4>
      <canvas id="wcVixChart" height="240"></canvas>
    </div>
  </div>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<script>
(function(){
  var BASE = 'http://localhost:5001';
  var TICKERS = [
    {sym:'SPY',  label:'SPY',  color:'#4a9eff'},
    {sym:'QQQ',  label:'QQQ',  color:'#a78bfa'},
    {sym:'IWM',  label:'IWM',  color:'#34d399'},
    {sym:'GLD',  label:'Gold', color:'#fbbf24'},
    {sym:'DX-Y.NYB', label:'DXY', color:'#94a3b8'},
    {sym:'BTCUSDT', label:'BTC', color:'#f97316'},
    {sym:'^VIX', label:'VIX',  color:'#ef4444'},
  ];
  var CHART_DEFAULTS = {
    plugins:{legend:{display:false}},
    scales:{
      x:{ticks:{color:'#64748b',font:{size:11}},grid:{color:'#1e293b'}},
      y:{ticks:{color:'#64748b',font:{size:11}},grid:{color:'#1e293b'}}
    },
    animation:false
  };

  function fetchQuote(sym){
    if(sym==='BTCUSDT'){
      return fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT')
        .then(r=>r.json()).then(d=>({sym:'BTC',chg:parseFloat(d.priceChangePercent)}));
    }
    return fetch(BASE+'/api/quote?symbol='+encodeURIComponent(sym))
      .then(r=>r.json()).then(d=>({sym:sym,chg:d.pct||d.change_pct||0}));
  }

  function fetchHistory(sym,days){
    return fetch(BASE+'/api/history?symbol='+encodeURIComponent(sym)+'&days='+days)
      .then(r=>r.json()).then(d=>d.prices||[]);
  }

  Promise.all(TICKERS.map(t=>fetchQuote(t.sym).catch(()=>({sym:t.sym,chg:0}))))
    .then(function(quotes){
      document.getElementById('wcChartsSection').style.display='';

      // ── Index bars (SPY QQQ IWM) ──
      var indices = quotes.slice(0,3);
      new Chart(document.getElementById('wcIndexChart'),{
        type:'bar',
        data:{
          labels: indices.map(q=>TICKERS.find(t=>t.sym===q.sym||t.label==='BTC'&&q.sym==='BTC')?TICKERS.find(t=>t.sym===q.sym).label:q.sym),
          datasets:[{
            data: indices.map(q=>q.chg),
            backgroundColor: indices.map(q=>q.chg>=0?'rgba(34,197,94,0.7)':'rgba(239,68,68,0.7)'),
            borderColor: indices.map(q=>q.chg>=0?'#22c55e':'#ef4444'),
            borderWidth:1, borderRadius:4
          }]
        },
        options:{...CHART_DEFAULTS,
          indexAxis:'x',
          plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return c.parsed.y.toFixed(2)+'%'}}}},
          scales:{
            x:{ticks:{color:'#94a3b8',font:{size:13,weight:'600'}},grid:{display:false}},
            y:{ticks:{color:'#64748b',font:{size:11},callback:function(v){return v.toFixed(1)+'%'}},grid:{color:'#1e293b'}}
          }
        }
      });

      // ── Cross-asset horizontal bar (all) ──
      var allQ = quotes.map(function(q,i){return{label:TICKERS[i].label,chg:q.chg,color:TICKERS[i].color}});
      allQ.sort(function(a,b){return a.chg-b.chg});
      new Chart(document.getElementById('wcAssetChart'),{
        type:'bar',
        data:{
          labels: allQ.map(q=>q.label),
          datasets:[{
            data: allQ.map(q=>q.chg),
            backgroundColor: allQ.map(q=>q.chg>=0?'rgba(34,197,94,0.6)':'rgba(239,68,68,0.6)'),
            borderColor: allQ.map(q=>q.chg>=0?'#22c55e':'#ef4444'),
            borderWidth:1, borderRadius:3
          }]
        },
        options:{...CHART_DEFAULTS,
          indexAxis:'y',
          plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return c.parsed.x.toFixed(2)+'%'}}}},
          scales:{
            x:{ticks:{color:'#64748b',font:{size:10},callback:function(v){return v.toFixed(1)+'%'}},grid:{color:'#1e293b'}},
            y:{ticks:{color:'#94a3b8',font:{size:12,weight:'600'}},grid:{display:false}}
          }
        }
      });
    }).catch(function(){});

  // ── VIX vs SPY 30-day line ──
  Promise.all([fetchHistory('^VIX',30).catch(()=>[]),fetchHistory('SPY',30).catch(()=>[])])
    .then(function(res){
      var vixH=res[0], spyH=res[1];
      if(!vixH.length||!spyH.length) return;
      var labels=vixH.map(function(p){var d=new Date(p.date);return (d.getMonth()+1)+'/'+(d.getDate())});
      new Chart(document.getElementById('wcVixChart'),{
        type:'line',
        data:{
          labels:labels,
          datasets:[
            {label:'VIX',data:vixH.map(p=>p.close),borderColor:'#ef4444',backgroundColor:'rgba(239,68,68,0.08)',tension:0.3,pointRadius:0,yAxisID:'y'},
            {label:'SPY',data:spyH.map(p=>p.close),borderColor:'#4a9eff',backgroundColor:'rgba(74,158,255,0.06)',tension:0.3,pointRadius:0,yAxisID:'y2'}
          ]
        },
        options:{
          animation:false,
          plugins:{legend:{display:true,labels:{color:'#94a3b8',font:{size:11},boxWidth:12}}},
          scales:{
            x:{ticks:{color:'#64748b',font:{size:9},maxTicksLimit:6},grid:{color:'#1e293b'}},
            y:{position:'left',ticks:{color:'#ef4444',font:{size:10}},grid:{color:'#1e293b'},title:{display:true,text:'VIX',color:'#ef4444',font:{size:10}}},
            y2:{position:'right',ticks:{color:'#4a9eff',font:{size:10}},grid:{display:false},title:{display:true,text:'SPY',color:'#4a9eff',font:{size:10}}}
          }
        }
      });
    }).catch(function(){});
})();
</script>
"""

@app.route('/api/daily-brief')
def daily_brief():
    with _brief_lock:
        content  = _brief_cache['content']
        filename = _brief_cache['filename']
    if content:
        # Strip any market snapshot / ticker table section
        cleaned = re.sub(
            r'<!--\s*(?:FULL\s+)?MARKET SNAPSHOT[^>]*-->.*?(?=<!--|\Z)',
            '', content, flags=re.DOTALL | re.IGNORECASE
        )
        # Also strip standalone snapshot <div class="section"> by section-title text
        cleaned = re.sub(
            r'<div class="section">\s*<div class="section-title">[^<]*(?:Market Snapshot|Full Market Snapshot)[^<]*</div>.*?</div>\s*</div>',
            '', cleaned, flags=re.DOTALL | re.IGNORECASE
        )
        injected = cleaned.replace('</body>', _CHART_INJECT + '\n</body>', 1)
        if injected == cleaned:
            injected = cleaned + _CHART_INJECT
        return injected, 200, {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Brief-File': filename or '',
        }
    return '<p style="color:#888;font-family:sans-serif;padding:40px">No briefing found for today.</p>', 404


@app.route('/api/daily-brief/refresh')
def daily_brief_refresh():
    """Force-reload brief cache — call after saving a new brief file."""
    _load_brief_cache()
    with _brief_lock:
        fn = _brief_cache['filename']
        ts = _brief_cache['loaded_at']
    if fn:
        return jsonify({'status': 'ok', 'file': fn, 'loaded_at': ts})
    return jsonify({'status': 'not_found'}), 404


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

@app.route('/api/macro-news')
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

@app.route('/api/econ-calendar')
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


_fred_cache = {}  # series -> {'text': str, 'ts': float}

@app.route('/api/fred')
def fred_proxy():
    # Same CORS problem as econ-calendar: fred.stlouisfed.org's CSV endpoint
    # sends no Access-Control-Allow-Origin, so the two frontend features that
    # used to hit it directly (Housing Risk Gauge's hrgFred, and smdFred)
    # always failed in the browser. Proxied here and cached 1h since these
    # are daily/weekly-updated macro series.
    #
    # Uses curl via subprocess, not `requests`: on this machine, `requests`
    # (urllib3 on the system's LibreSSL build) reliably hangs to a read
    # timeout against FRED's Akamai edge specifically, while curl completes
    # in well under a second. Other hosts (e.g. the econ-calendar source)
    # are unaffected — this is FRED-specific.
    import subprocess
    from flask import Response
    series = request.args.get('series', '').strip()
    if not series or not re.fullmatch(r'[A-Za-z0-9_]+', series):
        return Response('invalid series', status=400)
    cached = _fred_cache.get(series)
    if cached and _time.time() - cached['ts'] < 3600:
        return Response(cached['text'], mimetype='text/csv')
    try:
        p = subprocess.run(
            ['curl', '-s', '-f', '--max-time', '15',
             'https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + series],
            capture_output=True, text=True, timeout=20)
        if p.returncode != 0 or not p.stdout.strip():
            raise RuntimeError(f'curl failed (rc={p.returncode}): {p.stderr.strip()}')
        _fred_cache[series] = {'text': p.stdout, 'ts': _time.time()}
        return Response(p.stdout, mimetype='text/csv')
    except Exception as e:
        if cached:
            return Response(cached['text'], mimetype='text/csv')
        return Response(str(e), status=502)


# ── Earnings Calendar ────────────────────────────────────────────────────────
import threading as _threading
_earnings_cache = {'data': [], 'ts': None}
_earnings_lock  = _threading.Lock()

def _fetch_earnings_universe():
    from datetime import datetime, timedelta
    today   = datetime.now().date()
    results = []

    NASDAQ_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.nasdaq.com',
        'Referer': 'https://www.nasdaq.com/earnings-calendar',
    }

    def parse_mktcap(s):
        if not s:
            return None
        try:
            return round(float(s.replace('$','').replace(',','')) / 1e9, 1)
        except Exception:
            return None

    def parse_eps(s):
        if not s or s in ('N/A', '—', '-', ''):
            return None
        try:
            s = s.strip()
            # Accounting negative: ($0.19) → -0.19
            negative = s.startswith('(') and s.endswith(')')
            s = s.replace('(','').replace(')','').replace('$','').replace(',','')
            val = round(float(s), 2)
            return -val if negative else val
        except Exception:
            return None

    # Fetch 14 past weekdays + 30 forward (covers full earnings season)
    dates_to_fetch = []
    d = today - timedelta(days=20)  # ~14 past weekdays
    while len(dates_to_fetch) < 44:
        if d.weekday() < 5:
            dates_to_fetch.append(d)
        d += timedelta(days=1)

    def fetch_day(dt):
        try:
            url = f'https://api.nasdaq.com/api/calendar/earnings?date={dt}'
            r = requests.get(url, headers=NASDAQ_HEADERS, timeout=10)
            data = r.json()
            rows = data.get('data', {}).get('rows') or []
            day_results = []
            for row in rows:
                sym = (row.get('symbol') or '').strip()
                if not sym:
                    continue
                timing_raw = row.get('time', '')
                timing = 'BMO' if 'pre' in timing_raw else ('AMC' if 'after' in timing_raw else None)
                mktcap_B   = parse_mktcap(row.get('marketCap'))
                eps_est    = parse_eps(row.get('epsForecast'))
                eps_actual = parse_eps(row.get('eps'))
                surprise_raw = row.get('surprise', '')
                try:
                    surprise = round(float(str(surprise_raw).replace('%','').replace('N/A','')), 2) if surprise_raw and surprise_raw != 'N/A' else None
                except Exception:
                    surprise = None
                day_results.append({
                    'ticker':     sym,
                    'name':       row.get('name', sym),
                    'date':       str(dt),
                    'timing':     timing,
                    'eps_est':    eps_est,
                    'eps_actual': eps_actual,
                    'surprise':   surprise,
                    'mktcap_B':   mktcap_B,
                    'fiscal_q':   row.get('fiscalQuarterEnding', ''),
                    'n_ests':     row.get('noOfEsts', ''),
                })
            return day_results
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(fetch_day, dt) for dt in dates_to_fetch]
        for f in as_completed(futs):
            results.extend(f.result())

    results.sort(key=lambda x: (x['date'], -(x['mktcap_B'] or 0)))
    # Deduplicate: keep earliest date per ticker (each company reports once/quarter)
    seen_dedup = set()
    deduped = []
    for r in results:
        if r['ticker'] not in seen_dedup:
            seen_dedup.add(r['ticker'])
            deduped.append(r)
    results = deduped
    with _earnings_lock:
        _earnings_cache['data'] = results
        _earnings_cache['ts']   = datetime.now().isoformat()

@app.route('/api/earnings')
def earnings():
    from datetime import datetime, timedelta
    with _earnings_lock:
        data = _earnings_cache['data']
        ts   = _earnings_cache['ts']
    if not data:
        _threading.Thread(target=_fetch_earnings_universe, daemon=True).start()
        return jsonify({'status': 'loading', 'results': [], 'ts': None})
    # Auto-refresh if data older than 6 hours
    if ts:
        try:
            age = datetime.now() - datetime.fromisoformat(ts)
            if age > timedelta(hours=6):
                _threading.Thread(target=_fetch_earnings_universe, daemon=True).start()
        except Exception:
            pass
    return jsonify({'status': 'ready', 'results': data, 'ts': ts})

@app.route('/api/earnings/refresh', methods=['POST'])
def earnings_refresh():
    _threading.Thread(target=_fetch_earnings_universe, daemon=True).start()
    return jsonify({'status': 'refreshing'})


# ── Rates & Yields ────────────────────────────────────────────────────────────
@app.route('/api/yields')
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


# ── Insider Buying ────────────────────────────────────────────────────────────
import threading as _ib_threading
_insider_cache = {'data': [], 'ts': None}
_insider_lock  = _ib_threading.Lock()

def _fetch_insider_buying():
    from datetime import datetime, timedelta
    try:
        from api import SECTOR_DETAIL
    except Exception:
        SECTOR_DETAIL = {}
    # Build ticker universe from SECTOR_DETAIL
    tickers = []
    seen = set()
    for etf, info in SECTOR_DETAIL.items():
        for sub, syms in info.get('subsectors', {}).items():
            for s in syms:
                if s not in seen:
                    seen.add(s)
                    tickers.append(s)

    cutoff = datetime.now() - timedelta(days=180)
    results = []

    def fetch_one(sym):
        try:
            t = yf.Ticker(sym)
            ins = t.insider_transactions
            if ins is None or ins.empty:
                return []
            buys = ins[ins['Text'].str.contains('[Pp]urchase|[Aa]cquisition', na=False)]
            rows = []
            for _, row in buys.iterrows():
                try:
                    dt = row['Start Date']
                    if hasattr(dt, 'to_pydatetime'):
                        dt = dt.to_pydatetime()
                    if dt and dt < cutoff:
                        continue
                    val = float(row['Value']) if row['Value'] == row['Value'] else None
                    shares = int(row['Shares']) if row['Shares'] == row['Shares'] else None
                    # price per share from text: "Purchase at price 46.94 per share."
                    price = None
                    text = str(row.get('Text', ''))
                    import re as _re
                    pm = _re.search(r'price ([\d,.]+ ?[-–] ?[\d,.]+|[\d,.]+) per', text)
                    if pm:
                        try:
                            price = round(float(pm.group(1).replace(',','').split('-')[0].strip()), 2)
                        except Exception:
                            pass
                    rows.append({
                        'ticker':   sym,
                        'insider':  str(row.get('Insider', '')).title(),
                        'title':    str(row.get('Position', '')),
                        'shares':   shares,
                        'value':    val,
                        'price':    price,
                        'date':     str(dt)[:10] if dt else '',
                        'text':     text,
                    })
                except Exception:
                    pass
            return rows
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = [ex.submit(fetch_one, sym) for sym in tickers]
        for f in as_completed(futs):
            results.extend(f.result())

    # Deduplicate by (ticker, insider, date), then sort newest first
    seen_keys = set()
    deduped = []
    for r in results:
        k = (r['ticker'], r['insider'], r['date'])
        if k not in seen_keys:
            seen_keys.add(k)
            deduped.append(r)
    deduped.sort(key=lambda x: x['date'], reverse=True)

    with _insider_lock:
        _insider_cache['data'] = deduped[:200]
        _insider_cache['ts']   = datetime.now().isoformat()

@app.route('/api/insider-buying')
def insider_buying():
    from datetime import datetime, timedelta
    with _insider_lock:
        data = _insider_cache['data']
        ts   = _insider_cache['ts']
    if not data:
        _ib_threading.Thread(target=_fetch_insider_buying, daemon=True).start()
        return jsonify({'status': 'loading', 'results': [], 'ts': None})
    if ts:
        try:
            if datetime.now() - datetime.fromisoformat(ts) > timedelta(hours=12):
                _ib_threading.Thread(target=_fetch_insider_buying, daemon=True).start()
        except Exception:
            pass
    return jsonify({'status': 'ready', 'results': data, 'ts': ts})

@app.route('/api/insider-buying/refresh', methods=['POST'])
def insider_buying_refresh():
    _ib_threading.Thread(target=_fetch_insider_buying, daemon=True).start()
    return jsonify({'status': 'refreshing'})

@app.route('/api/insider-activity')
def insider_activity():
    symbol = request.args.get('symbol', '').upper().strip()
    if not symbol:
        return jsonify({'error': 'symbol required'}), 400
    try:
        t = yf.Ticker(symbol)
        ins = t.insider_transactions
        if ins is None or ins.empty:
            return jsonify({'results': []})
        rows = []
        for _, row in ins.iterrows():
            text = str(row.get('Text', ''))
            is_buy = bool(__import__('re').search(r'[Pp]urchase|[Aa]cquisition', text))
            is_sale = bool(__import__('re').search(r'[Ss]ale|[Ss]old', text))
            val = None
            try:
                v = row['Value']
                if v == v: val = float(v)
            except Exception: pass
            shares = None
            try:
                s = row['Shares']
                if s == s: shares = int(s)
            except Exception: pass
            # parse price from text
            price = None
            pm = __import__('re').search(r'price ([\d,.]+)', text)
            if pm:
                try: price = round(float(pm.group(1).replace(',','')), 2)
                except Exception: pass
            dt = row.get('Start Date', '')
            rows.append({
                'insider': str(row.get('Insider', '')).title(),
                'title':   str(row.get('Position', '')),
                'shares':  shares,
                'value':   val,
                'price':   price,
                'date':    str(dt)[:10] if dt else '',
                'text':    text,
                'is_buy':  is_buy,
                'is_sale': is_sale,
            })
        rows.sort(key=lambda x: x['date'], reverse=True)
        return jsonify({'results': rows[:30]})
    except Exception as e:
        return jsonify({'error': str(e), 'results': []})


# ── Confluence endpoints ──────────────────────────────────────────────────────
@app.route('/api/confluence')
def confluence_results():
    from confluence import get_results
    return jsonify(get_results(top_n=20))

@app.route('/api/confluence/run', methods=['POST'])
def confluence_run():
    from confluence import run_confluence, _RUNNING
    if _RUNNING:
        return jsonify({'status': 'already_running'})
    import threading
    threading.Thread(target=run_confluence, daemon=True).start()
    return jsonify({'status': 'started'})


# ── Historical daily closes ───────────────────────────────────────────────────
@app.route('/api/history')
def history():
    symbol = request.args.get('symbol', '').strip()
    days   = int(request.args.get('days', 30))
    if not symbol:
        return jsonify({'error': 'symbol required'}), 400
    try:
        if days <= 7:    period = '7d'
        elif days <= 30: period = '1mo'
        elif days <= 90: period = '3mo'
        elif days <= 180:period = '6mo'
        else:            period = '1y'
        hist = yf.Ticker(symbol).history(period=period, interval='1d')
        if hist.empty:
            return jsonify({'error': 'no data'}), 404
        closes = hist['Close'].dropna().tail(days)
        dates  = [d.strftime('%b %d') for d in closes.index]
        return jsonify({'closes': closes.tolist(), 'dates': dates})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/correlation')
def correlation():
    import pandas as pd
    symbol    = request.args.get('symbol', '').strip().upper()
    benchmark = request.args.get('benchmark', 'SPY').strip().upper()
    if not symbol:
        return jsonify({'error': 'symbol required'}), 400
    try:
        raw = yf.download([symbol, benchmark], period='3y', interval='1d',
                           progress=False, auto_adjust=True)['Close']
        raw = raw.dropna(how='any')
        if raw.empty or symbol not in raw.columns or benchmark not in raw.columns:
            return jsonify({'error': f'no overlapping data for {symbol} vs {benchmark}'}), 404
        rets = raw.pct_change().dropna()

        def corr_over(days=None, start=None):
            r = rets.tail(days) if days else (rets[rets.index >= start] if start is not None else rets)
            if len(r) < 5:
                return None, len(r)
            return round(float(r[symbol].corr(r[benchmark])), 3), int(len(r))

        now = rets.index[-1]
        ytd_start = pd.Timestamp(year=now.year, month=1, day=1, tz=now.tz)
        mtd_start = pd.Timestamp(year=now.year, month=now.month, day=1, tz=now.tz)

        c_cur, n_cur = corr_over(days=20)
        c_mtd, n_mtd = corr_over(start=mtd_start)
        c_ytd, n_ytd = corr_over(start=ytd_start)
        c_y1,  n_y1  = corr_over(days=252)
        c_y3,  n_y3  = corr_over()

        roll = rets[symbol].rolling(60).corr(rets[benchmark]).dropna()
        return jsonify({
            'corr': {'current': c_cur, 'mtd': c_mtd, 'ytd': c_ytd, 'y1': c_y1, 'y3': c_y3},
            'n':    {'current': n_cur, 'mtd': n_mtd, 'ytd': n_ytd, 'y1': n_y1, 'y3': n_y3},
            'as_of': now.strftime('%Y-%m-%d'),
            'rolling': {
                'dates':  [d.strftime('%Y-%m-%d') for d in roll.index],
                'values': [round(float(v), 3) for v in roll.values],
            },
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Institutional Holdings (SEC EDGAR 13F) ────────────────────────────────────
SEC_HEADERS = {
    'User-Agent': 'WaveCapital research@wavecapital.com',
    'Accept-Encoding': 'gzip, deflate',
}

INSTITUTIONS = [
    {'name': 'Berkshire Hathaway', 'short': 'Buffett',  'cik': '1067983', 'emoji': '🎩'},
    {'name': 'ARK Invest',          'short': 'Wood',     'cik': '1697748', 'emoji': '🚀'},
    {'name': 'Citadel Advisors',    'short': 'Griffin',  'cik': '1423053', 'emoji': '🏰'},
    {'name': 'Pershing Square',     'short': 'Ackman',   'cik': '1336528', 'emoji': '🎯'},
    {'name': 'Bridgewater',         'short': 'Dalio',    'cik': '1350694', 'emoji': '🌊'},
    {'name': 'Goldman Sachs',       'short': 'Goldman',  'cik': '886982',  'emoji': '💰'},
    {'name': 'JPMorgan Chase',      'short': 'JPM',      'cik': '19617',   'emoji': '🏦'},
]


def _fetch_13f_holdings(cik_str, acc_number):
    """Fetch and parse the infotable XML for a given accession number."""
    acc_nodash = acc_number.replace('-', '')
    index_url  = f'https://www.sec.gov/Archives/edgar/data/{cik_str}/{acc_nodash}/'
    r = requests.get(index_url, headers=SEC_HEADERS, timeout=15)
    xml_paths  = re.findall(r'/Archives/edgar/data/[^"]+\.xml', r.text, re.IGNORECASE)
    for path in xml_paths:
        fname = path.split('/')[-1].lower()
        if 'primary' in fname:
            continue
        try:
            xr       = requests.get(f'https://www.sec.gov{path}', headers=SEC_HEADERS, timeout=30)
            holdings = _parse_infotable(xr.text)
            if holdings:
                return holdings
        except Exception:
            continue
    return []


def _parse_infotable(xml_text):
    """Parse 13F information table XML into a list of holding dicts."""
    root = ET.fromstring(xml_text)
    def sn(tag): return tag.split('}')[-1]
    holdings = []
    for entry in root.iter():
        if sn(entry.tag) == 'infoTable':
            h   = {sn(c.tag): c.text for c in entry}
            amt = entry.find('.//{*}sshPrnamt')
            if amt is not None:
                h['shares'] = amt.text
            holdings.append(h)
    return holdings


@app.route('/api/institutions-list')
def institutions_list():
    return jsonify({'institutions': INSTITUTIONS})


@app.route('/api/institutions')
def institutions():
    cik = request.args.get('cik', '').strip()
    if not cik:
        return jsonify({'error': 'cik required'}), 400

    cik_int    = int(cik)
    cik_padded = str(cik_int).zfill(10)

    try:
        subs = requests.get(
            f'https://data.sec.gov/submissions/CIK{cik_padded}.json',
            headers=SEC_HEADERS, timeout=15
        ).json()

        rec     = subs['filings']['recent']
        forms   = rec['form']
        accs    = rec['accessionNumber']
        dates   = rec['filingDate']
        periods = rec.get('reportDate', [''] * len(forms))

        # Two most recent 13F-HR (not amendments)
        idxs = [i for i, f in enumerate(forms) if f == '13F-HR'][:2]
        if not idxs:
            return jsonify({'error': 'no 13F-HR filings found'}), 404

        quarters = []
        for idx in idxs:
            h_list = _fetch_13f_holdings(str(cik_int), accs[idx])
            if h_list:
                quarters.append({
                    'acc':      accs[idx],
                    'filed':    dates[idx],
                    'period':   periods[idx] if idx < len(periods) else '',
                    'holdings': h_list,
                })

        if not quarters:
            return jsonify({'error': 'could not parse 13F holdings'}), 500

        current = quarters[0]
        prev    = quarters[1] if len(quarters) > 1 else None

        def aggregate_by_cusip(holdings):
            """Sum shares and value per CUSIP (institutions report same CUSIP across multiple accounts)."""
            agg = {}
            for h in holdings:
                cusip = h.get('cusip', '')
                if not cusip:
                    continue
                val    = int(h.get('value', 0) or 0)
                shares = int(h.get('shares') or h.get('sshPrnamt') or 0)
                if cusip in agg:
                    agg[cusip]['value']  += val
                    agg[cusip]['shares'] += shares
                else:
                    agg[cusip] = {
                        'name':   h.get('nameOfIssuer', ''),
                        'cusip':  cusip,
                        'value':  val,
                        'shares': shares,
                    }
            return agg

        curr_agg = aggregate_by_cusip(current['holdings'])
        prev_agg = aggregate_by_cusip(prev['holdings']) if prev else {}

        total_val = sum(v['value'] for v in curr_agg.values())

        rows = []
        for cusip, h in curr_agg.items():
            val    = h['value']
            shares = h['shares']
            pct    = round(val / total_val * 100, 2) if total_val > 0 else 0

            ph = prev_agg.get(cusip)
            if ph is None:
                chg_type = 'NEW'; chg_pct = None
            else:
                ps = ph['shares']
                if ps == 0:
                    chg_type = 'NEW'; chg_pct = None
                else:
                    diff     = shares - ps
                    chg_pct  = round(diff / ps * 100, 1)
                    chg_type = 'INCREASED' if diff > 0 else ('DECREASED' if diff < 0 else 'UNCHANGED')

            rows.append({
                'name':     h['name'],
                'cusip':    cusip,
                'value':    val,
                'shares':   shares,
                'pct_port': pct,
                'chg_type': chg_type,
                'chg_pct':  chg_pct,
            })

        # Exited positions (in prev but not current)
        sold = []
        if prev:
            for cusip, ph in prev_agg.items():
                if cusip not in curr_agg:
                    sold.append({'name': ph['name'], 'value': ph['value']})
            sold.sort(key=lambda x: x['value'], reverse=True)
            sold = sold[:10]

        rows.sort(key=lambda x: x['value'], reverse=True)

        return jsonify({
            'name':            subs['name'],
            'cik':             cik,
            'period':          current['period'],
            'filed':           current['filed'],
            'prev_period':     prev['period'] if prev else None,
            'total_value':     total_val,
            'total_positions': len(curr_agg),
            'holdings':        rows[:50],
            'sold':            sold,
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Analyst estimates ─────────────────────────────────────────────────────────
@app.route('/api/analyst-estimates')
def analyst_estimates():
    symbol = request.args.get('symbol', '').upper().strip()
    if not symbol:
        return jsonify({'error': 'symbol required'}), 400
    try:
        t = yf.Ticker(symbol)
        info = t.info or {}

        # Price targets
        apt = t.analyst_price_targets or {}
        current_price = info.get('currentPrice') or info.get('regularMarketPrice')
        price_target = {
            'current': current_price,
            'mean':    apt.get('mean'),
            'median':  apt.get('median'),
            'high':    apt.get('high'),
            'low':     apt.get('low'),
        }

        # Recommendations summary (current month)
        rec = {'strongBuy': 0, 'buy': 0, 'hold': 0, 'sell': 0, 'strongSell': 0}
        try:
            rs = t.recommendations_summary
            if rs is not None and not rs.empty:
                row = rs[rs['period'] == '0m']
                if not row.empty:
                    r = row.iloc[0]
                    rec = {
                        'strongBuy':  int(r.get('strongBuy', 0)),
                        'buy':        int(r.get('buy', 0)),
                        'hold':       int(r.get('hold', 0)),
                        'sell':       int(r.get('sell', 0)),
                        'strongSell': int(r.get('strongSell', 0)),
                    }
        except Exception:
            pass

        # EPS estimates
        eps_rows = []
        try:
            ee = t.earnings_estimate
            if ee is not None and not ee.empty:
                period_labels = {'0q': 'This Qtr', '+1q': 'Next Qtr', '0y': 'This Year', '+1y': 'Next Year'}
                for idx, row in ee.iterrows():
                    def safe(v):
                        try: return None if (v != v) else round(float(v), 2)
                        except: return None
                    eps_rows.append({
                        'period':    period_labels.get(str(idx), str(idx)),
                        'avg':       safe(row.get('avg')),
                        'low':       safe(row.get('low')),
                        'high':      safe(row.get('high')),
                        'year_ago':  safe(row.get('yearAgoEps')),
                        'growth':    safe(row.get('growth')),
                        'n_analysts':int(row['numberOfAnalysts']) if row.get('numberOfAnalysts') == row.get('numberOfAnalysts') else None,
                    })
        except Exception:
            pass

        # Revenue estimates
        rev_rows = []
        try:
            re_ = t.revenue_estimate
            if re_ is not None and not re_.empty:
                period_labels = {'0q': 'This Qtr', '+1q': 'Next Qtr', '0y': 'This Year', '+1y': 'Next Year'}
                for idx, row in re_.iterrows():
                    def safe(v):
                        try: return None if (v != v) else float(v)
                        except: return None
                    rev_rows.append({
                        'period':   period_labels.get(str(idx), str(idx)),
                        'avg':      safe(row.get('avg')),
                        'low':      safe(row.get('low')),
                        'high':     safe(row.get('high')),
                        'year_ago': safe(row.get('yearAgoRevenue')),
                        'growth':   safe(row.get('growth')),
                    })
        except Exception:
            pass

        return jsonify({
            'symbol':        symbol,
            'price_target':  price_target,
            'recommendation': rec,
            'eps_estimates': eps_rows,
            'rev_estimates': rev_rows,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Peer comparison ───────────────────────────────────────────────────────────
@app.route('/api/peers')
def peers():
    symbol = request.args.get('symbol', '').upper().strip()
    if not symbol:
        return jsonify({'error': 'symbol required'}), 400

    # Find which subsector the symbol belongs to
    sym_meta = None
    for etf, sector_info in SECTOR_DETAIL.items():
        for sub_name, symbols in sector_info['subsectors'].items():
            if symbol in symbols:
                sym_meta = {
                    'sector': sector_info['name'],
                    'subsector': sub_name,
                    'peers': symbols,
                }
                break
        if sym_meta:
            break

    if not sym_meta:
        return jsonify({'error': 'symbol not in peer universe'}), 404

    def fetch_peer(p):
        try:
            info = yf.Ticker(p).info

            def g(key):
                v = info.get(key)
                return None if v in (None, 'N/A', float('inf'), float('-inf')) else v

            def pct(key):
                v = g(key)
                return round(v * 100, 2) if v is not None else None

            return {
                'symbol':           p,
                'name':             g('shortName') or p,
                'market_cap':       g('marketCap'),
                'pe_trailing':      g('trailingPE'),
                'pe_forward':       g('forwardPE'),
                'gross_margin':     pct('grossMargins'),
                'operating_margin': pct('operatingMargins'),
                'net_margin':       pct('profitMargins'),
                'roe':              pct('returnOnEquity'),
                'revenue_growth':   pct('revenueGrowth'),
                'is_target':        p == symbol,
            }
        except Exception:
            return {'symbol': p, 'is_target': p == symbol}

    peer_list = sym_meta['peers']
    results_map = {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = {ex.submit(fetch_peer, p): p for p in peer_list}
        for f in as_completed(futures):
            r = f.result()
            results_map[r['symbol']] = r

    # Preserve original subsector order
    results = [results_map[p] for p in peer_list if p in results_map]

    return jsonify({
        'symbol':    symbol,
        'sector':    sym_meta['sector'],
        'subsector': sym_meta['subsector'],
        'peers':     results,
    })


# ── Comm. Flows — Digital Ad Intelligence ─────────────────────────────────────
import sys as _sys
_sys.path.insert(0, os.path.dirname(__file__))
import comm_flows as _cf
_cf.init_db()

@app.route('/api/comm-flows/latest')
def comm_flows_latest():
    try:
        return jsonify(_cf.get_latest_quarter())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/comm-flows/history')
def comm_flows_history():
    try:
        company = request.args.get('company')
        from_year = int(request.args.get('from_year', 2022))
        return jsonify({'data': _cf.get_history(company, from_year)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/comm-flows/breakdown')
def comm_flows_breakdown():
    try:
        year    = int(request.args.get('year', 2024))
        quarter = int(request.args.get('quarter', 4))
        return jsonify({'data': _cf.get_regional_breakdown(year, quarter)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/comm-flows/trends')
def comm_flows_trends():
    try:
        return jsonify({'signals': _cf.detect_trends()})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/comm-flows/update', methods=['POST'])
def comm_flows_update():
    """Manually trigger an EDGAR update check."""
    try:
        events = _cf.check_and_update()
        _schedule_state['comm_flows_edgar']['last_run']    = _time.time()
        _schedule_state['comm_flows_edgar']['last_status'] = 'ok'
        return jsonify({'events': events, 'count': len(events)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/update-status')
def update_status():
    """Return freshness info for all data sources."""
    import datetime as _dt
    cf_status = _cf.get_update_status()
    jobs = []
    for name, interval, _ in _SCHEDULE:
        state   = _schedule_state[name]
        last    = state['last_run']
        next_in = max(0, round((last + interval - _time.time()) / 60)) if last else 0
        jobs.append({
            'name':        name,
            'interval_h':  round(interval / 3600, 1),
            'last_run':    _dt.datetime.fromtimestamp(last).isoformat() if last else None,
            'next_in_min': next_in,
            'status':      state['last_status'],
        })
    return jsonify({
        'comm_flows':  cf_status,
        'scheduler':   jobs,
        'brief_file':  _brief_cache['filename'],
        'brief_loaded_at': _brief_cache['loaded_at'],
        'server_time': _dt.datetime.now().isoformat(),
    })


# ── Health check ──────────────────────────────────────────────────────────────
# ── EV Industry ───────────────────────────────────────────────────────────────
@app.route('/api/ev-market')
def ev_market():
    # Global adoption: IEA / BloombergNEF annual data (BEV+PHEV, millions)
    ADOPTION = [
        {'year': 2018, 'ev': 2.1,  'total': 86.0},
        {'year': 2019, 'ev': 2.2,  'total': 90.3},
        {'year': 2020, 'ev': 3.1,  'total': 77.9},
        {'year': 2021, 'ev': 6.6,  'total': 82.7},
        {'year': 2022, 'ev': 10.5, 'total': 85.3},
        {'year': 2023, 'ev': 14.1, 'total': 92.7},
        {'year': 2024, 'ev': 17.1, 'total': 94.3},
    ]
    for row in ADOPTION:
        row['ice'] = round(row['total'] - row['ev'], 1)
        row['ev_pct'] = round(row['ev'] / row['total'] * 100, 1)

    # 2024 delivery rankings (thousands of units)
    DELIVERIES_BEV = [
        {'company': 'Tesla',        'k': 1789, 'ticker': 'TSLA', 'flag': '🇺🇸'},
        {'company': 'BYD',          'k': 1765, 'ticker': 'BYDDY','flag': '🇨🇳'},
        {'company': 'VW Group',     'k': 715,  'ticker': 'VWAGY','flag': '🇩🇪'},
        {'company': 'Hyundai/Kia',  'k': 493,  'ticker': None,   'flag': '🇰🇷'},
        {'company': 'BMW Group',    'k': 374,  'ticker': None,   'flag': '🇩🇪'},
        {'company': 'SAIC (MG)',    'k': 337,  'ticker': None,   'flag': '🇨🇳'},
        {'company': 'Mercedes',     'k': 241,  'ticker': None,   'flag': '🇩🇪'},
        {'company': 'Stellantis',   'k': 227,  'ticker': 'STLA', 'flag': '🇪🇺'},
        {'company': 'Geely/Volvo',  'k': 200,  'ticker': None,   'flag': '🇨🇳'},
        {'company': 'GM',           'k': 190,  'ticker': 'GM',   'flag': '🇺🇸'},
    ]
    DELIVERIES_TOTAL = [  # BEV + PHEV
        {'company': 'BYD',          'k': 4272, 'ticker': 'BYDDY','flag': '🇨🇳'},
        {'company': 'Tesla',        'k': 1789, 'ticker': 'TSLA', 'flag': '🇺🇸'},
        {'company': 'VW Group',     'k': 1104, 'ticker': 'VWAGY','flag': '🇩🇪'},
        {'company': 'BMW Group',    'k': 572,  'ticker': None,   'flag': '🇩🇪'},
        {'company': 'Hyundai/Kia',  'k': 568,  'ticker': None,   'flag': '🇰🇷'},
        {'company': 'Mercedes',     'k': 370,  'ticker': None,   'flag': '🇩🇪'},
        {'company': 'SAIC (MG)',    'k': 337,  'ticker': None,   'flag': '🇨🇳'},
        {'company': 'Stellantis',   'k': 260,  'ticker': 'STLA', 'flag': '🇪🇺'},
        {'company': 'Geely/Volvo',  'k': 250,  'ticker': None,   'flag': '🇨🇳'},
        {'company': 'GM',           'k': 190,  'ticker': 'GM',   'flag': '🇺🇸'},
    ]

    # Live financials for public EV companies
    FX = {}
    try:
        FX['CNY'] = float(yf.Ticker('CNYUSD=X').info.get('regularMarketPrice', 0.138))
        FX['EUR'] = float(yf.Ticker('EURUSD=X').info.get('regularMarketPrice', 1.08))
    except Exception:
        FX = {'CNY': 0.138, 'EUR': 1.08}

    COMPANY_META = [
        {'ticker': 'TSLA',  'name': 'Tesla',       'flag': '🇺🇸', 'currency': 'USD'},
        {'ticker': 'BYDDY', 'name': 'BYD',         'flag': '🇨🇳', 'currency': 'CNY'},
        {'ticker': 'VWAGY', 'name': 'Volkswagen',  'flag': '🇩🇪', 'currency': 'EUR'},
        {'ticker': 'GM',    'name': 'General Motors','flag':'🇺🇸', 'currency': 'USD'},
        {'ticker': 'F',     'name': 'Ford',         'flag': '🇺🇸', 'currency': 'USD'},
        {'ticker': 'STLA',  'name': 'Stellantis',   'flag': '🇪🇺', 'currency': 'EUR'},
        {'ticker': 'NIO',   'name': 'NIO',          'flag': '🇨🇳', 'currency': 'CNY'},
        {'ticker': 'LI',    'name': 'Li Auto',      'flag': '🇨🇳', 'currency': 'CNY'},
        {'ticker': 'XPEV',  'name': 'XPeng',        'flag': '🇨🇳', 'currency': 'CNY'},
        {'ticker': 'RIVN',  'name': 'Rivian',       'flag': '🇺🇸', 'currency': 'USD'},
        {'ticker': 'LCID',  'name': 'Lucid',        'flag': '🇺🇸', 'currency': 'USD'},
    ]

    def fetch_company(meta):
        try:
            info = yf.Ticker(meta['ticker']).info
            rev   = info.get('totalRevenue')
            mc    = info.get('marketCap')
            gm    = info.get('grossMargins')
            price = info.get('regularMarketPrice') or info.get('currentPrice')
            chg   = info.get('regularMarketChangePercent', 0)
            fx    = FX.get(meta['currency'], 1.0)
            return {
                'ticker':   meta['ticker'],
                'name':     meta['name'],
                'flag':     meta['flag'],
                'rev_usd':  round(rev * fx / 1e9, 1) if rev else None,
                'mc_usd':   round(mc  * fx / 1e9, 1) if mc  else None,
                'gm_pct':   round(gm * 100, 1)       if gm  else None,
                'price':    price,
                'chg_pct':  round(chg, 2),
            }
        except Exception:
            return None

    companies = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(fetch_company, m): m for m in COMPANY_META}
        for fut in as_completed(futs):
            res = fut.result()
            if res:
                companies.append(res)
    companies.sort(key=lambda c: c['mc_usd'] or 0, reverse=True)

    return jsonify({
        'adoption':        ADOPTION,
        'deliveries_bev':  DELIVERIES_BEV,
        'deliveries_total':DELIVERIES_TOTAL,
        'companies':       companies,
    })


# ── Put/Call Ratio ────────────────────────────────────────────────────────────
import sqlite3 as _sqlite3

_PCR_DB   = os.path.join(os.path.dirname(__file__), 'wave_cache.db')
_pcr_lock = _ib_threading.Lock()

def _pcr_db():
    con = _sqlite3.connect(_PCR_DB)
    con.execute('CREATE TABLE IF NOT EXISTS pcr_history (date TEXT PRIMARY KEY, pcr REAL, put_vol INTEGER, call_vol INTEGER)')
    con.commit()
    return con

def _fetch_pcr_live():
    url = 'https://cdn.cboe.com/api/global/delayed_quotes/options/SPY.json'
    r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=20)
    opts = r.json()['data']['options']
    put_vol  = sum((o.get('volume') or 0) for o in opts if o['option'][-9] == 'P')
    call_vol = sum((o.get('volume') or 0) for o in opts if o['option'][-9] == 'C')
    pcr = round(put_vol / call_vol, 3) if call_vol else None
    return pcr, int(put_vol), int(call_vol)

@app.route('/api/pcr')
def pcr_route():
    from datetime import date as _date
    try:
        today = _date.today().isoformat()
        con = _pcr_db()
        # Try to get today's cached value
        row = con.execute('SELECT pcr, put_vol, call_vol FROM pcr_history WHERE date=?', (today,)).fetchone()
        if row is None:
            pcr_val, pv, cv = _fetch_pcr_live()
            if pcr_val is not None:
                with _pcr_lock:
                    con.execute('INSERT OR REPLACE INTO pcr_history VALUES (?,?,?,?)', (today, pcr_val, pv, cv))
                    con.commit()
        else:
            pcr_val, pv, cv = row

        # Last 20 trading days of history
        rows = con.execute('SELECT date, pcr FROM pcr_history ORDER BY date DESC LIMIT 20').fetchall()
        con.close()
        history = [{'date': r[0], 'pcr': r[1]} for r in reversed(rows)]

        # 5-day and 20-day averages
        vals = [r['pcr'] for r in history if r['pcr'] is not None]
        ma5  = round(sum(vals[-5:])  / len(vals[-5:]),  3) if len(vals) >= 5  else None
        ma20 = round(sum(vals[-20:]) / len(vals[-20:]), 3) if len(vals) >= 20 else None

        return jsonify({
            'pcr':      pcr_val,
            'put_vol':  pv,
            'call_vol': cv,
            'ma5':      ma5,
            'ma20':     ma20,
            'history':  history,
            'date':     today,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'service': 'Wave Capital API'})


# ── Risk Signals (7-factor composite) ─────────────────────────────────────────
_risk_signals_cache = {'data': None, 'ts': 0}
_RISK_SIGNALS_TTL   = 300  # 5-min cache

@app.route('/api/risk-signals')
def risk_signals():
    import time as _t
    global _risk_signals_cache
    if _risk_signals_cache['data'] and (_t.time() - _risk_signals_cache['ts']) < _RISK_SIGNALS_TTL:
        return jsonify(_risk_signals_cache['data'])

    SYMS = ['^VIX', '^VIX3M', 'HYG', 'LQD', 'SPY', 'RSP', 'XLK', 'XLY', 'XLC', 'XLU', 'XLP', 'XLV']

    def _get(sym):
        try:
            info  = yf.Ticker(sym).info
            state = info.get('marketState', 'REGULAR')
            if state == 'PRE' and info.get('preMarketPrice'):
                pct   = float(info.get('preMarketChangePercent') or 0)
                price = float(info['preMarketPrice'])
            elif state in ('POST', 'POSTPOST') and info.get('postMarketPrice'):
                pct   = float(info.get('postMarketChangePercent') or 0)
                price = float(info['postMarketPrice'])
            else:
                pct   = float(info.get('regularMarketChangePercent') or 0)
                price = float(info.get('regularMarketPrice') or info.get('currentPrice') or 0)
            return price, pct
        except Exception:
            return 0.0, 0.0

    with ThreadPoolExecutor(max_workers=12) as ex:
        futs = {sym: ex.submit(_get, sym) for sym in SYMS}
        d    = {sym: futs[sym].result(timeout=15) for sym in SYMS}

    vix_price, _       = d['^VIX']
    vxv_price, _       = d['^VIX3M']
    _, hyg_pct         = d['HYG']
    _, lqd_pct         = d['LQD']
    spy_price, spy_pct = d['SPY']
    _, rsp_pct         = d['RSP']

    # VIX recent closes for trend display
    vix_closes = []
    try:
        h = yf.Ticker('^VIX').history(period='7d', interval='1d')
        vix_closes = [round(float(v), 2) for v in h['Close'].dropna().tolist()[-5:]]
        if vix_closes:
            vix_price = vix_closes[-1]
    except Exception:
        pass

    # SPY 200-day MA
    spy_200dma, spy_pct_vs_200 = 0.0, 0.0
    try:
        h = yf.Ticker('SPY').history(period='1y', interval='1d')
        closes = h['Close'].dropna()
        if len(closes) >= 200:
            spy_200dma     = round(float(closes.tail(200).mean()), 2)
            spy_pct_vs_200 = round((spy_price - spy_200dma) / spy_200dma * 100, 2)
    except Exception:
        pass

    # PCR from SQLite cache
    pcr_val = 1.1
    try:
        con = _pcr_db()
        row = con.execute('SELECT pcr FROM pcr_history ORDER BY date DESC LIMIT 1').fetchone()
        con.close()
        if row:
            pcr_val = float(row[0])
    except Exception:
        pass

    ro_avg  = round(sum(d[s][1] for s in ['XLK','XLY','XLC']) / 3, 3)
    rof_avg = round(sum(d[s][1] for s in ['XLU','XLP','XLV']) / 3, 3)

    result = {
        'vix':             {'current': round(vix_price, 2), 'closes': vix_closes},
        'vxv':             round(vxv_price, 2),
        'credit':          {'hyg_pct': round(hyg_pct, 3), 'lqd_pct': round(lqd_pct, 3)},
        'breadth':         {'spy_pct': round(spy_pct, 3),  'rsp_pct': round(rsp_pct, 3)},
        'sector_rotation': {
            'spread':           round(ro_avg - rof_avg, 3),
            'risk_on_avg':      ro_avg,
            'risk_off_avg':     rof_avg,
            'risk_on_detail':   {s: round(d[s][1], 2) for s in ['XLK','XLY','XLC']},
            'risk_off_detail':  {s: round(d[s][1], 2) for s in ['XLU','XLP','XLV']},
        },
        'spy_200dma':      {'current': spy_price, 'ma200': spy_200dma, 'pct_above': spy_pct_vs_200},
        'pcr':             round(pcr_val, 3),
    }
    _risk_signals_cache = {'data': result, 'ts': _t.time()}
    return jsonify(result)


# ── Crypto Dashboard ──────────────────────────────────────────────────────────

# Cohort definitions: 1 representative per cohort for price history,
# multiple coins for average-change calculation
COHORT_COINS = {
    'BTC':           ['bitcoin'],
    'ETH Network':   ['ethereum', 'lido-dao', 'rocket-pool'],
    'SOL Network':   ['solana', 'jito-governance-token', 'marinade'],
    'Large Caps':    ['ethereum', 'binancecoin', 'ripple', 'cardano', 'solana', 'avalanche-2'],
    'L1s':           ['solana', 'avalanche-2', 'cardano', 'near', 'aptos', 'sui', 'sei-network'],
    'L2s':           ['matic-network', 'arbitrum', 'optimism', 'starknet'],
    'DEX Tokens':    ['uniswap', 'pancakeswap-token', 'curve-dao-token', 'aerodrome-finance', 'jupiter-exchange-solana'],
    'DeFi':          ['aave', 'maker', 'compound-governance-token', 'sky-governance-token'],
    'AI Tokens':     ['bittensor', 'render-token', 'fetch-ai', 'akash-network', 'ocean-protocol'],
    'Privacy':       ['monero', 'zcash', 'dash', 'secret'],
    'Infra/Oracle':  ['chainlink', 'the-graph', 'filecoin', 'api3'],
    'RWA':           ['ondo-finance', 'centrifuge', 'maple'],
    'Memes':         ['dogecoin', 'shiba-inu', 'pepe', 'bonk'],
}

COHORT_REP = {
    'BTC': 'bitcoin', 'ETH Network': 'ethereum', 'SOL Network': 'solana',
    'Large Caps': 'binancecoin', 'L1s': 'avalanche-2', 'L2s': 'arbitrum',
    'DEX Tokens': 'uniswap', 'DeFi': 'aave', 'AI Tokens': 'bittensor',
    'Privacy': 'monero', 'Infra/Oracle': 'chainlink', 'RWA': 'ondo-finance',
    'Memes': 'dogecoin',
}

_cg_global_cache = {'data': None, 'ts': 0}
_cohort_perf_cache = {}
_cohort_prices_cache = {}
_onchain_cache2 = {}

@app.route('/api/crypto-global')
def crypto_global():
    import time as _t
    global _cg_global_cache
    if _cg_global_cache['data'] and (_t.time() - _cg_global_cache['ts']) < 120:
        return jsonify(_cg_global_cache['data'])
    try:
        import requests as _req
        headers = {'User-Agent': 'Mozilla/5.0'}
        r1 = _req.get('https://api.coingecko.com/api/v3/global', headers=headers, timeout=12)
        d  = r1.json().get('data', {})
        total_mc  = d.get('total_market_cap', {}).get('usd', 0)
        chg_24h   = round(float(d.get('market_cap_change_percentage_24h_usd', 0)), 2)
        btc_dom   = round(float(d.get('market_cap_percentage', {}).get('btc', 0)), 1)
        eth_dom   = round(float(d.get('market_cap_percentage', {}).get('eth', 0)), 1)
        total_vol = d.get('total_volume', {}).get('usd', 0)
        # 7d change: use BTC+ETH average as proxy
        r2 = _req.get(
            'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd'
            '&ids=bitcoin,ethereum&price_change_percentage=7d',
            headers=headers, timeout=12)
        coins = r2.json() or []
        chg_7d = round(sum((c.get('price_change_percentage_7d_in_currency') or 0) for c in coins) / max(len(coins), 1), 2)
        result = {
            'total_market_cap': round(total_mc),
            'mc_change_24h': chg_24h,
            'mc_change_7d': chg_7d,
            'btc_dominance': btc_dom,
            'eth_dominance': eth_dom,
            'total_volume_24h': round(total_vol),
        }
        _cg_global_cache = {'data': result, 'ts': _t.time()}
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)})


@app.route('/api/cohort-performance')
def cohort_performance():
    import time as _t
    global _cohort_perf_cache
    period = request.args.get('period', '24h')   # 24h | 7d | 30d | 1y
    cache_key = period
    if _cohort_perf_cache.get(cache_key) and (_t.time() - _cohort_perf_cache.get(cache_key + '_ts', 0)) < 600:
        return jsonify(_cohort_perf_cache[cache_key])
    try:
        import requests as _req
        field_map = {
            '24h': 'price_change_percentage_24h_in_currency',
            '7d':  'price_change_percentage_7d_in_currency',
            '30d': 'price_change_percentage_30d_in_currency',
            '1y':  'price_change_percentage_1y_in_currency',
        }
        pct_field = field_map.get(period, field_map['24h'])
        all_ids = list(set(cid for coins in COHORT_COINS.values() for cid in coins))
        url = ('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd'
               '&ids=' + ','.join(all_ids) +
               '&price_change_percentage=24h,7d,30d,1y&per_page=250&order=market_cap_desc')
        r = _req.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=20)
        raw = {c['id']: c for c in (r.json() or [])}
        result = []
        for cohort, ids in COHORT_COINS.items():
            vals = [raw[i][pct_field] for i in ids if i in raw and raw[i].get(pct_field) is not None]
            if not vals:
                continue
            avg = round(sum(vals) / len(vals), 2)
            coins_detail = []
            for cid in ids:
                c = raw.get(cid)
                if not c:
                    continue
                coins_detail.append({
                    'id': cid,
                    'name': c.get('symbol', cid).upper(),
                    'change': round(c.get(pct_field) or 0, 2),
                    'price': c.get('current_price', 0),
                    'mcap_b': round((c.get('market_cap') or 0) / 1e9, 1),
                })
            result.append({'cohort': cohort, 'change': avg, 'n': len(vals), 'coins': coins_detail})
        result.sort(key=lambda x: x['change'], reverse=True)
        _cohort_perf_cache[cache_key] = result
        _cohort_perf_cache[cache_key + '_ts'] = _t.time()
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)})


@app.route('/api/cohort-prices')
def cohort_prices():
    import time as _t
    global _cohort_prices_cache
    days = request.args.get('days', '30')
    cache_key = days
    if _cohort_prices_cache.get(cache_key) and (_t.time() - _cohort_prices_cache.get(cache_key + '_ts', 0)) < 1800:
        return jsonify(_cohort_prices_cache[cache_key])
    try:
        import requests as _req, time as _time
        headers = {'User-Agent': 'Mozilla/5.0'}
        result = {}
        for cohort, rep_id in COHORT_REP.items():
            try:
                url = (f'https://api.coingecko.com/api/v3/coins/{rep_id}/market_chart'
                       f'?vs_currency=usd&days={days}&interval=daily')
                r = _req.get(url, headers=headers, timeout=12)
                if r.status_code == 429:
                    _time.sleep(2)
                    r = _req.get(url, headers=headers, timeout=12)
                prices_raw = r.json().get('prices', [])
                if len(prices_raw) < 2:
                    continue
                base = prices_raw[0][1]
                if base == 0:
                    continue
                result[cohort] = {
                    'timestamps': [p[0] for p in prices_raw],
                    'indexed':    [round(p[1] / base * 100, 2) for p in prices_raw],
                }
                _time.sleep(0.35)
            except Exception:
                continue
        _cohort_prices_cache[cache_key] = result
        _cohort_prices_cache[cache_key + '_ts'] = _t.time()
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)})


_onchain_hist_cache = {}

ONCHAIN_DEFAULTS = {
    'tvl':        [('lido','Lido'),('aave-v3','Aave V3'),('makerdao','MakerDAO'),
                   ('compound-v3','Compound'),('uniswap','Uniswap'),('eigenlayer','EigenLayer')],
    'dex_volume': [('uniswap-v4','Uni V4'),('uniswap-v3','Uni V3'),('pancakeswap-v3','Cake V3'),
                   ('aerodrome-slipstream','Aerodrome'),('curve','Curve'),('raydium','Raydium')],
    'fees':       [('uniswap-v3','Uni V3'),('uniswap-v4','Uni V4'),('lido','Lido'),
                   ('aave-v3','Aave V3'),('pancakeswap-v3','Cake V3'),('hyperliquid-perp','Hyperliquid')],
    'revenue':    [('makerdao','MakerDAO'),('lido','Lido'),('aave-v3','Aave V3'),
                   ('compound-v3','Compound'),('uniswap-v3','Uni V3'),('curve','Curve')],
}

@app.route('/api/onchain-history')
def onchain_history():
    import time as _t
    global _onchain_hist_cache
    kpi   = request.args.get('kpi', 'tvl')
    days  = int(request.args.get('days', '30'))
    slugs = request.args.get('protocols', '')   # comma-sep slug:name pairs, optional

    cache_key = f'{kpi}_{days}_{slugs}'
    if (_onchain_hist_cache.get(cache_key) and
            _t.time() - _onchain_hist_cache.get(cache_key+'_ts', 0) < 1800):
        return jsonify(_onchain_hist_cache[cache_key])

    import requests as _req, time as _time
    headers = {'User-Agent': 'Mozilla/5.0'}
    cutoff  = int(_t.time()) - days * 86400

    if slugs:
        pairs = []
        for part in slugs.split(','):
            if ':' in part:
                s, n = part.split(':', 1)
                pairs.append((s.strip(), n.strip()))
            else:
                pairs.append((part.strip(), part.strip().title()))
    else:
        pairs = ONCHAIN_DEFAULTS.get(kpi, ONCHAIN_DEFAULTS['tvl'])

    def _fetch(slug_name):
        slug, name = slug_name
        try:
            if kpi == 'tvl':
                r = _req.get(f'https://api.llama.fi/protocol/{slug}',
                             headers=headers, timeout=12)
                if r.status_code != 200:
                    return name, None
                pts = [(p['date'], p['totalLiquidityUSD'])
                       for p in r.json().get('tvl', [])
                       if p.get('date', 0) >= cutoff]
            else:
                endpoint  = 'dexs' if kpi == 'dex_volume' else 'fees'
                data_type = {'dex_volume':'dailyVolume','fees':'dailyFees','revenue':'dailyRevenue'}.get(kpi,'dailyFees')
                r = _req.get(f'https://api.llama.fi/summary/{endpoint}/{slug}',
                             headers=headers, timeout=12)
                if r.status_code != 200:
                    return name, None
                key = 'totalDataChart'
                pts = [(p[0], p[1])
                       for p in r.json().get(key, [])
                       if p[0] >= cutoff]
            if len(pts) < 3:
                return name, None
            return name, {
                'timestamps': [p[0] * 1000 for p in pts],   # ms for JS
                'values':     [round(p[1]) for p in pts],
            }
        except Exception:
            return name, None

    result = {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = [ex.submit(_fetch, p) for p in pairs]
        for f in futs:
            name, data = f.result(timeout=25)
            if data:
                result[name] = data

    # Also return available protocol list for the picker
    result['__protocols__'] = [{'slug': s, 'name': n} for s, n in pairs]

    _onchain_hist_cache[cache_key]         = result
    _onchain_hist_cache[cache_key + '_ts'] = _t.time()
    return jsonify(result)


@app.route('/api/onchain-kpi')
def onchain_kpi():
    import time as _t
    global _onchain_cache2
    kpi = request.args.get('kpi', 'tvl')   # tvl | dex_volume | fees | revenue
    if _onchain_cache2.get(kpi) and (_t.time() - _onchain_cache2.get(kpi + '_ts', 0)) < 600:
        return jsonify(_onchain_cache2[kpi])
    try:
        import requests as _req
        result = []
        if kpi == 'tvl':
            r = _req.get('https://api.llama.fi/protocols', timeout=15)
            protos = r.json()
            top = sorted(
                [p for p in protos if p.get('tvl') and p.get('category') not in ('Chain',)],
                key=lambda x: x.get('tvl', 0), reverse=True)[:20]
            result = [{'name': p['name'], 'value': round(p.get('tvl', 0)),
                       'change_1d': round(p.get('change_1d') or 0, 2),
                       'change_7d': round(p.get('change_7d') or 0, 2),
                       'category': p.get('category', ''), 'chain': p.get('chain', '')} for p in top]
        elif kpi in ('fees', 'revenue'):
            r = _req.get('https://api.llama.fi/overview/fees'
                         '?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true', timeout=15)
            protos = r.json().get('protocols', [])
            vk = 'total24h'
            rk = 'revenue24h' if kpi == 'revenue' else None
            key = rk if kpi == 'revenue' else vk
            top = sorted([p for p in protos if p.get(key)],
                         key=lambda x: x.get(key, 0) or 0, reverse=True)[:20]
            result = [{'name': p.get('displayName') or p.get('name', ''),
                       'value': round(p.get(key) or 0),
                       'value_7d': round(p.get('total7d') or 0),
                       'value_30d': round(p.get('total30d') or 0),
                       'category': p.get('category', '')} for p in top]
        elif kpi == 'dex_volume':
            r = _req.get('https://api.llama.fi/overview/dexs'
                         '?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true', timeout=15)
            protos = r.json().get('protocols', [])
            top = sorted([p for p in protos if p.get('total24h')],
                         key=lambda x: x.get('total24h', 0) or 0, reverse=True)[:20]
            result = [{'name': p.get('displayName') or p.get('name', ''),
                       'value': round(p.get('total24h') or 0),
                       'value_7d': round(p.get('total7d') or 0),
                       'value_30d': round(p.get('total30d') or 0),
                       'category': p.get('category', 'DEX')} for p in top]
        _onchain_cache2[kpi] = result
        _onchain_cache2[kpi + '_ts'] = _t.time()
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)})


_token_detail_cache = {}

@app.route('/api/token-detail')
def token_detail():
    import time as _t
    coin_id = request.args.get('id', '').strip().lower()
    if not coin_id:
        return jsonify({'error': 'missing id'})
    now = _t.time()
    if coin_id in _token_detail_cache:
        entry = _token_detail_cache[coin_id]
        if now - entry['ts'] < 300:
            return jsonify(entry['data'])
    headers = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'}
    try:
        r = requests.get(
            f'https://api.coingecko.com/api/v3/coins/{coin_id}'
            '?localization=false&tickers=false&market_data=true'
            '&community_data=true&developer_data=true&sparkline=false',
            headers=headers, timeout=12)
        d = r.json()
        # 30-day price history
        hist_r = requests.get(
            f'https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart'
            '?vs_currency=usd&days=30&interval=daily',
            headers=headers, timeout=12)
        hist = hist_r.json()
        md = d.get('market_data', {})
        links = d.get('links', {})
        result = {
            'id': coin_id,
            'name': d.get('name'),
            'symbol': (d.get('symbol') or '').upper(),
            'image': d.get('image', {}).get('large'),
            'description': (d.get('description', {}).get('en') or '')[:3000],
            'categories': d.get('categories', [])[:6],
            'genesis_date': d.get('genesis_date'),
            'whitepaper': links.get('whitepaper') or '',
            'homepage': ((links.get('homepage') or [''])[0]) or '',
            'twitter': links.get('twitter_screen_name') or '',
            'reddit': links.get('subreddit_url') or '',
            'github': ((links.get('repos_url', {}).get('github') or [''])[0]) or '',
            'coingecko_score': d.get('coingecko_score'),
            'developer_score': d.get('developer_score'),
            'community_score': d.get('community_score'),
            'sentiment_up': d.get('sentiment_votes_up_percentage'),
            'watchlist_users': d.get('watchlist_portfolio_users'),
            'market_cap_rank': d.get('market_cap_rank'),
            'price': md.get('current_price', {}).get('usd'),
            'price_change_24h': md.get('price_change_percentage_24h'),
            'price_change_7d': md.get('price_change_percentage_7d'),
            'price_change_30d': md.get('price_change_percentage_30d'),
            'market_cap': md.get('market_cap', {}).get('usd'),
            'fdv': md.get('fully_diluted_valuation', {}).get('usd'),
            'volume_24h': md.get('total_volume', {}).get('usd'),
            'circulating_supply': md.get('circulating_supply'),
            'total_supply': md.get('total_supply'),
            'max_supply': md.get('max_supply'),
            'ath': md.get('ath', {}).get('usd'),
            'ath_change_pct': md.get('ath_change_percentage', {}).get('usd'),
            'ath_date': (md.get('ath_date', {}).get('usd') or '')[:10],
            'atl': md.get('atl', {}).get('usd'),
            'atl_change_pct': md.get('atl_change_percentage', {}).get('usd'),
            'prices_30d': hist.get('prices', []),
        }
        _token_detail_cache[coin_id] = {'ts': now, 'data': result}
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)})


_cohort_news_cache = {}
_COHORT_KEYWORDS = {
    'BTC': ['bitcoin','btc'],
    'ETH Network': ['ethereum','eth','lido','staking'],
    'SOL Network': ['solana','sol','jito'],
    'Large Caps': ['ethereum','bnb','xrp','cardano','ripple'],
    'L1s': ['solana','avalanche','cardano','near','aptos','sui','sei'],
    'L2s': ['polygon','arbitrum','optimism','starknet','base','layer 2'],
    'DEX Tokens': ['uniswap','pancakeswap','curve','aerodrome','dex','decentralized exchange'],
    'DeFi': ['aave','makerdao','compound','defi','lending','yield'],
    'AI Tokens': ['bittensor','render','fetch.ai','akash','ocean','ai tokens'],
    'Privacy': ['monero','zcash','dash','privacy coin'],
    'Infra/Oracle': ['chainlink','the graph','filecoin','oracle','infrastructure'],
    'RWA': ['ondo','centrifuge','maple','real world asset','rwa','tokenized'],
    'Memes': ['dogecoin','shiba','pepe','bonk','meme coin','memecoin'],
}

@app.route('/api/cohort-news')
def cohort_news():
    import time as _t, xml.etree.ElementTree as ET, html as _html
    cohort = request.args.get('cohort', '')
    now = _t.time()
    cache_key = f'cnews_{cohort}'
    if cache_key in _cohort_news_cache:
        e = _cohort_news_cache[cache_key]
        if now - e['ts'] < 600:
            return jsonify(e['data'])
    keywords = [k.lower() for k in _COHORT_KEYWORDS.get(cohort, [cohort.lower()])]
    feeds = [
        'https://www.coindesk.com/arc/outboundfeeds/rss/',
        'https://cointelegraph.com/rss',
        'https://decrypt.co/feed',
    ]
    stories = []
    for feed_url in feeds:
        try:
            proxy_url = f'https://api.allorigins.win/get?url={requests.utils.quote(feed_url)}'
            fr = requests.get(proxy_url, headers={'User-Agent':'Mozilla/5.0'}, timeout=8)
            raw = fr.json().get('contents','')
            root = ET.fromstring(raw)
            ns = {'atom': 'http://www.w3.org/2005/Atom'}
            items = root.findall('.//item')
            for item in items[:30]:
                title = (item.findtext('title') or '').strip()
                link  = (item.findtext('link') or '').strip()
                desc  = _html.unescape((item.findtext('description') or '')[:300]).strip()
                pub   = (item.findtext('pubDate') or '')[:16]
                combined = (title + ' ' + desc).lower()
                if any(kw in combined for kw in keywords):
                    stories.append({'title': title, 'url': link, 'desc': desc, 'pub': pub,
                                    'source': feed_url.split('/')[2].replace('www.','')})
            if len(stories) >= 8:
                break
        except Exception:
            continue
    stories = stories[:8]
    result = stories
    _cohort_news_cache[cache_key] = {'ts': now, 'data': result}
    return jsonify(result)


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