"""Portable Morning Brief serving and refresh scheduler."""

import datetime as dt
import os
import re
import threading
import time

from flask import Blueprint, jsonify

bp = Blueprint("brief", __name__)

# ── Daily Brief ───────────────────────────────────────────────────────────────

_brief_cache = {'content': None, 'filename': None, 'loaded_at': None, 'source_path': None}
_brief_lock  = threading.Lock()

# Portable storage:
# - production: point WAVE_BRIEF_DIR at a persistent mounted folder/object-sync target
# - local dev: defaults to services/api/data/briefs
_DEFAULT_BRIEF_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'briefs')
_BRIEF_DIR = os.path.abspath(os.getenv('WAVE_BRIEF_DIR', _DEFAULT_BRIEF_DIR))
_DATE_PAT = re.compile(r'(\d{4}-\d{2}-\d{2})')


def _brief_session(now):
    hour = now.hour
    if hour < 16:
        return 'morning'
    if hour < 23 or (hour == 23 and now.minute < 30):
        return 'opening'
    return 'eod'


def _load_brief_cache():
    """Load the most relevant briefing HTML from portable WAVE_BRIEF_DIR."""
    now_il = dt.datetime.utcnow() + dt.timedelta(hours=3)
    today = now_il.strftime('%Y-%m-%d')
    session_suffix = _brief_session(now_il)

    try:
        os.makedirs(_BRIEF_DIR, exist_ok=True)
    except Exception:
        pass

    candidates = []
    try:
        for root, _, files in os.walk(_BRIEF_DIR):
            for fname in files:
                if not fname.lower().endswith('.html'):
                    continue
                m = _DATE_PAT.search(fname)
                if not m:
                    continue
                full_path = os.path.join(root, fname)
                candidates.append((m.group(1), fname, full_path))
    except Exception as exc:
        print(f'[brief] scan failed: {exc}', flush=True)
        return

    if not candidates:
        with _brief_lock:
            _brief_cache['content'] = None
            _brief_cache['filename'] = None
            _brief_cache['source_path'] = None
            _brief_cache['loaded_at'] = dt.datetime.now().isoformat()
        print(f'[brief] no candidate files in {_BRIEF_DIR}', flush=True)
        return

    def _sort_key(item):
        date_str, fname, _ = item
        pri = 0 if (date_str == today and session_suffix in fname.lower()) else \
              1 if date_str == today else 2
        return (pri, [-int(x) for x in date_str.split('-')])

    candidates.sort(key=_sort_key)

    for _, fname, path in candidates:
        try:
            with open(path, 'r', encoding='utf-8', errors='replace') as fh:
                content = fh.read()
            if len(content.strip()) < 500:
                continue
            with _brief_lock:
                _brief_cache['content'] = content
                _brief_cache['filename'] = fname
                _brief_cache['source_path'] = path
                _brief_cache['loaded_at'] = dt.datetime.now().isoformat()
            print(f'[brief] loaded: {fname} ({len(content)} chars)', flush=True)
            return
        except Exception as exc:
            print(f'[brief] failed {path}: {exc}', flush=True)

    print(f'[brief] no usable file loaded from {len(candidates)} candidates', flush=True)


# ── Master Scheduler ──────────────────────────────────────────────────────────
# One background thread; each job tracks its own last_run and interval.

_SCHEDULE = [
    # (name, interval_seconds, function)
    # Brief: rescan the portable WAVE_BRIEF_DIR every 60 minutes.
    ('brief_refresh',    3_600,   _load_brief_cache),
]
_schedule_state = {name: {'last_run': None, 'last_status': 'pending'} for name, *_ in _SCHEDULE}


def _master_scheduler():
    """Single background thread running all scheduled jobs."""
    while True:
        now = time.time()
        for name, interval, fn in _SCHEDULE:
            state    = _schedule_state[name]
            last_run = state['last_run']
            if last_run is None or (now - last_run) >= interval:
                try:
                    fn()
                    state['last_status'] = 'ok'
                except Exception as _e:
                    state['last_status'] = f'error: {_e}'
                state['last_run'] = time.time()
        time.sleep(60)  # check every minute


_scheduler_started = False

def start_brief_scheduler():
    """Load the brief cache and start one scheduler thread per process."""
    global _scheduler_started
    if _scheduler_started:
        return
    _load_brief_cache()
    threading.Thread(target=_master_scheduler, daemon=True, name="wave-brief-scheduler").start()
    _scheduler_started = True


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
  var BASE = '';
  var TICKERS = [
    {sym:'SPY',  label:'SPY',  color:'#4a9eff'},
    {sym:'QQQ',  label:'QQQ',  color:'#a78bfa'},
    {sym:'IWM',  label:'IWM',  color:'#34d399'},
    {sym:'GLD',  label:'Gold', color:'#fbbf24'},
    {sym:'DX-Y.NYB', label:'DXY', color:'#94a3b8'},
    {sym:'BTC-USD', label:'BTC', color:'#f97316'},
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
    return fetch(BASE+'/api/quote?symbol='+encodeURIComponent(sym))
      .then(r=>r.json()).then(d=>({sym:sym,chg:d.pct||d.change_pct||0}));
  }

  function fetchHistory(sym,days){
    return fetch(BASE+'/api/history?symbol='+encodeURIComponent(sym)+'&days='+days)
      .then(r=>r.json()).then(function(d){
        var closes=d.closes||[], dates=d.dates||[];
        return closes.map(function(close,i){ return {date:dates[i]||'', close:close}; });
      });
  }

  Promise.all(TICKERS.map(t=>fetchQuote(t.sym).catch(()=>({sym:t.sym,chg:0}))))
    .then(function(quotes){
      document.getElementById('wcChartsSection').style.display='';

      // ── Index bars (SPY QQQ IWM) ──
      var indices = quotes.slice(0,3);
      new Chart(document.getElementById('wcIndexChart'),{
        type:'bar',
        data:{
          labels: indices.map(function(q){var t=TICKERS.find(function(x){return x.sym===q.sym;});return t?t.label:q.sym;}),
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

@bp.route('/api/daily-brief')
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


@bp.route('/api/daily-brief/refresh')
def daily_brief_refresh():
    """Force-reload brief cache — call after saving a new brief file."""
    _load_brief_cache()
    with _brief_lock:
        fn = _brief_cache['filename']
        ts = _brief_cache['loaded_at']
    if fn:
        return jsonify({'status': 'ok', 'file': fn, 'loaded_at': ts, 'storage': 'WAVE_BRIEF_DIR'})
    return jsonify({'status': 'not_found'}), 404


