"""Cross-asset market risk and options-sentiment routes."""

from concurrent.futures import ThreadPoolExecutor
import os
import sqlite3 as _sqlite3
import threading
import time as _time

import requests
from flask import Blueprint, jsonify
from services.yahoo import quote as yahoo_quote, history_frame

bp = Blueprint("market_risk", __name__)

# ── Put/Call Ratio ────────────────────────────────────────────────────────────
DATA_DIR = os.path.abspath(os.getenv("WAVE_DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")))
os.makedirs(DATA_DIR, exist_ok=True)
_PCR_DB = os.path.join(DATA_DIR, "wave_cache.db")
_pcr_lock = threading.Lock()

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

@bp.route('/api/pcr')
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


# ── Risk Signals (7-factor composite) ─────────────────────────────────────────
_risk_signals_cache = {'data': None, 'ts': 0}
_RISK_SIGNALS_TTL   = 300  # 5-min cache

@bp.route('/api/risk-signals')
def risk_signals():
    import time as _t
    global _risk_signals_cache
    if _risk_signals_cache['data'] and (_t.time() - _risk_signals_cache['ts']) < _RISK_SIGNALS_TTL:
        return jsonify(_risk_signals_cache['data'])

    SYMS = ['^VIX', '^VIX3M', 'HYG', 'LQD', 'SPY', 'RSP', 'XLK', 'XLY', 'XLC', 'XLU', 'XLP', 'XLV']

    def _get(sym):
        try:
            data = yahoo_quote(sym)
            return data.price, data.pct
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
        h = history_frame('^VIX', period='7d', interval='1d')
        vix_closes = [round(float(v), 2) for v in h['Close'].dropna().tolist()[-5:]]
        if vix_closes:
            vix_price = vix_closes[-1]
    except Exception:
        pass

    # SPY 200-day MA
    spy_200dma, spy_pct_vs_200 = 0.0, 0.0
    try:
        h = history_frame('SPY', period='1y', interval='1d')
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


