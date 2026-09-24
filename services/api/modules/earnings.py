"""Earnings calendar routes and refresh cache."""

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
import threading as _threading

import requests
from flask import Blueprint, jsonify

bp = Blueprint("earnings", __name__)

# ── Earnings Calendar ────────────────────────────────────────────────────────
_earnings_cache = {'data': [], 'ts': None}
_earnings_lock  = _threading.Lock()

def _fetch_earnings_universe():
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

@bp.route('/api/earnings')
def earnings():
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

@bp.route('/api/earnings/refresh', methods=['POST'])
def earnings_refresh():
    _threading.Thread(target=_fetch_earnings_universe, daemon=True).start()
    return jsonify({'status': 'refreshing'})


