"""Equity research routes: insider activity, institutions, correlation,
analyst estimates and peer comparison.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
import re
import threading as _ib_threading
import xml.etree.ElementTree as ET

import requests
import yfinance as yf
from flask import Blueprint, jsonify, request

bp = Blueprint("equities_research", __name__)

# ── Insider Buying ────────────────────────────────────────────────────────────
_insider_cache = {'data': [], 'ts': None}
_insider_lock  = _ib_threading.Lock()

def _fetch_insider_buying():
    from datetime import datetime, timedelta
    try:
        from modules.equities_core import SECTOR_DETAIL
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

@bp.route('/api/insider-buying')
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

@bp.route('/api/insider-buying/refresh', methods=['POST'])
def insider_buying_refresh():
    _ib_threading.Thread(target=_fetch_insider_buying, daemon=True).start()
    return jsonify({'status': 'refreshing'})

@bp.route('/api/insider-activity')
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


@bp.route('/api/correlation')
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


@bp.route('/api/institutions-list')
def institutions_list():
    return jsonify({'institutions': INSTITUTIONS})


@bp.route('/api/institutions')
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
@bp.route('/api/analyst-estimates')
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
@bp.route('/api/peers')
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


