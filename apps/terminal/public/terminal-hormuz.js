// ── Hormuz Oil Desk ────────────────────────────────────────────────────────
var _hormuzData = {};

var _THREAT_COLORS = {
  RED:    {bg:'rgba(239,68,68,0.13)',  border:'rgba(239,68,68,0.45)',  text:'#ef4444', glow:'rgba(239,68,68,0.25)'},
  YELLOW: {bg:'rgba(234,179,8,0.12)', border:'rgba(234,179,8,0.45)',   text:'#eab308', glow:'rgba(234,179,8,0.2)'},
  GREEN:  {bg:'rgba(34,197,94,0.10)', border:'rgba(34,197,94,0.4)',    text:'#22c55e', glow:'rgba(34,197,94,0.15)'},
};
var _THREAT_LABEL = {
  RED:    'Active Incident',
  YELLOW: 'Elevated Risk',
  GREEN:  'Calm',
};

async function loadHormuz(){
  try {
    var s = await fetch(API + '/api/hormuz/summary').then(function(r){return r.json();});
    if(s.error){ _hormuzShowEmpty(); return; }
    _hormuzData.summary = s;

    var thr = s.risk_state || 'GREEN';
    var tc  = _THREAT_COLORS[thr] || _THREAT_COLORS.GREEN;

    var big = document.getElementById('hormuzThreatBig');
    var dot = document.getElementById('hormuzThreatDot');
    var hero = document.getElementById('hormuzHero');
    if(big){ big.textContent = thr; big.style.color = tc.text; }
    if(dot){ dot.style.background = tc.text; dot.style.boxShadow = '0 0 8px '+tc.glow; }
    if(hero){ hero.style.borderColor = tc.border; hero.style.background = tc.bg; }

    var tb = document.getElementById('hormuzThreatBlock');
    if(tb){
      var ex = tb.querySelector('.h-explain');
      if(!ex){ ex = document.createElement('div'); ex.className='h-explain'; tb.appendChild(ex); }
      ex.style.cssText = 'font-size:10px;color:'+tc.text+';margin-top:6px;max-width:160px;line-height:1.4;text-align:center';
      ex.textContent = _THREAT_LABEL[thr] || thr;
    }

    var bp = s.brent && s.brent.price, bc = s.brent && s.brent.daily_pct;
    var wp = s.wti && s.wti.price,   wc = s.wti && s.wti.daily_pct;
    var bEl = document.getElementById('hormuzBrent');
    var wEl = document.getElementById('hormuzWti');
    if(bEl && bp != null) bEl.innerHTML = '$'+Number(bp).toFixed(2)
      +' <span style="font-size:13px;color:'+((bc||0)>=0?'#22c55e':'#ef4444')+'">'+((bc||0)>=0?'+':'')+Number(bc||0).toFixed(1)+'%</span>';
    if(wEl && wp != null) wEl.innerHTML = '$'+Number(wp).toFixed(2)
      +' <span style="font-size:13px;color:'+((wc||0)>=0?'#22c55e':'#ef4444')+'">'+((wc||0)>=0?'+':'')+Number(wc||0).toFixed(1)+'%</span>';

    var events = s.events || [];
    var lt = document.getElementById('hormuzLatestTitle');
    var ls = document.getElementById('hormuzLatestSummary');
    if(lt) lt.textContent = events.length ? events[0].title : 'No material Hormuz headline detected';
    if(ls) ls.textContent = s.price_confirmation
      ? 'Oil price action is confirming elevated market concern.'
      : 'Oil price action is not currently confirming a major supply shock.';

    var ev = document.getElementById('hormuzEventCount');
    if(ev) ev.textContent = (s.event_counts && s.event_counts.total) || events.length || 0;

    // New product intent: macro supply-risk monitor, not stock ranking.
    ['hTab-watchlist','hTab-daily','hTab-log'].forEach(function(id){
      var el=document.getElementById(id); if(el) el.style.display='none';
    });
    ['hPanel-watchlist','hPanel-daily','hPanel-log'].forEach(function(id){
      var el=document.getElementById(id); if(el) el.style.display='none';
    });

    var eventsTab = document.getElementById('hTab-events');
    if(eventsTab){ eventsTab.classList.add('active'); eventsTab.textContent='📋 Supply-Risk Developments'; }
    var eventsPanel = document.getElementById('hPanel-events');
    if(eventsPanel) eventsPanel.style.display='';

    var list = document.getElementById('hormuzEventList');
    if(list){
      if(!events.length){
        list.innerHTML='<div style="color:#475569;font-size:12px;padding:24px;text-align:center">No recent Hormuz-specific developments found.</div>';
      } else {
        list.innerHTML=events.map(function(item){
          var sev=item.severity||'LOW';
          var col=sev==='HIGH'?'#ef4444':sev==='MEDIUM'?'#eab308':'#22c55e';
          return '<div style="padding:13px 16px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface2)">'
            +'<div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">'
            +'<span style="font-size:9px;font-weight:800;color:'+col+'">'+sev+'</span>'
            +'<span style="font-size:9px;color:#475569;margin-left:auto">'+(item.published||'')+'</span>'
            +'</div>'
            +'<a href="'+(item.link||'#')+'" target="_blank" rel="noopener" style="font-size:12px;font-weight:700;color:#e2e8f0;text-decoration:none;line-height:1.45">'+item.title+'</a>'
            +'</div>';
        }).join('');
      }
    }
  } catch(e){
    console.error('Hormuz load failed', e);
    _hormuzShowEmpty();
  }
}

function _hormuzShowEmpty(){
  var list=document.getElementById('hormuzEventList');
  if(list) list.innerHTML='<div class="callout red">Hormuz risk data is currently unavailable.</div>';
}

