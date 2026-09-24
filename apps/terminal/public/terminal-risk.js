// ══════════════════════════════════════════════════════════
//  RISK ON / OFF METER
// ══════════════════════════════════════════════════════════

function riskScoreToColor(s){
  if(s<=20)return'#ef4444';
  if(s<=40)return'#f97316';
  if(s<=60)return'#f59e0b';
  if(s<=80)return'#86efac';
  return'#22c55e';
}

function riskScoreToLabel(s){
  if(s<=20)return'EXTREME RISK-OFF';
  if(s<=40)return'RISK-OFF';
  if(s<=60)return'NEUTRAL';
  if(s<=80)return'RISK-ON';
  return'EXTREME RISK-ON';
}

function buildRiskGaugeSvg(score){
  score=Math.max(0,Math.min(100,score));
  var cx=150,cy=148,r=105,sw=16;
  function toRad(s){return Math.PI*(1-s/100);}
  function px(a,rad){return cx+(rad==null?r:rad)*Math.cos(a);}
  function py(a,rad){return cy-(rad==null?r:rad)*Math.sin(a);}
  function arc(s1,s2,col){
    var a1=toRad(s1),a2=toRad(s2);
    var x1=px(a1).toFixed(1),y1=py(a1).toFixed(1),x2=px(a2).toFixed(1),y2=py(a2).toFixed(1);
    var lg=(s2-s1)>50?1:0;
    return'<path d="M '+x1+','+y1+' A '+r+','+r+' 0 '+lg+' 1 '+x2+','+y2+'" fill="none" stroke="'+col+'" stroke-width="'+sw+'" stroke-linecap="butt"/>';
  }
  var svg='';
  svg+=arc(0,100,'rgba(255,255,255,0.05)');
  svg+=arc(0,25,'#ef4444');
  svg+=arc(25,50,'#f97316');
  svg+=arc(50,75,'#f59e0b');
  svg+=arc(75,100,'#22c55e');
  // Tick marks + labels at 0,25,50,75,100
  [0,25,50,75,100].forEach(function(t){
    var a=toRad(t);
    var ix=px(a,r-sw/2-1).toFixed(1),iy=py(a,r-sw/2-1).toFixed(1);
    var ox=px(a,r+sw/2+3).toFixed(1),oy=py(a,r+sw/2+3).toFixed(1);
    svg+='<line x1="'+ix+'" y1="'+iy+'" x2="'+ox+'" y2="'+oy+'" stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/>';
    var lrad=r+sw/2+13;
    var lx=px(a,lrad).toFixed(1),ly=(py(a,lrad)+3).toFixed(1);
    svg+='<text x="'+lx+'" y="'+ly+'" fill="#334155" font-size="8" font-family="Inter,sans-serif" font-weight="600" text-anchor="middle">'+t+'</text>';
  });
  // Needle
  var ang=toRad(score);
  var nx=px(ang,r*0.79).toFixed(1),ny=py(ang,r*0.79).toFixed(1);
  svg+='<line x1="'+cx+'" y1="'+cy+'" x2="'+nx+'" y2="'+ny+'" stroke="rgba(255,255,255,0.12)" stroke-width="8" stroke-linecap="round"/>';
  svg+='<line x1="'+cx+'" y1="'+cy+'" x2="'+nx+'" y2="'+ny+'" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity="0.92"/>';
  // Center dot
  var col=riskScoreToColor(score);
  svg+='<circle cx="'+cx+'" cy="'+cy+'" r="6.5" fill="'+col+'" stroke="#080810" stroke-width="3"/>';
  // Side labels
  svg+='<text x="24" y="164" fill="#475569" font-size="8" font-family="Inter,sans-serif" font-weight="700" text-anchor="middle">OFF</text>';
  svg+='<text x="276" y="164" fill="#475569" font-size="8" font-family="Inter,sans-serif" font-weight="700" text-anchor="middle">ON</text>';
  return'<svg viewBox="0 0 300 170" style="width:100%;max-width:340px;display:block;margin:0 auto">'+svg+'</svg>';
}

function scoreRiskSignals(data){
  var S={};
  // 1. VIX Level (15%)
  var vix=data.vix.current;
  var vs;
  if(vix<=12)vs=100;
  else if(vix<=15)vs=Math.round(100-(vix-12)/3*20);
  else if(vix<=20)vs=Math.round(80-(vix-15)/5*30);
  else if(vix<=25)vs=Math.round(50-(vix-20)/5*25);
  else if(vix<=30)vs=Math.round(25-(vix-25)/5*20);
  else vs=Math.max(0,Math.round(5-(vix-30)*1.5));
  S.vixLevel={score:vs,weight:.15,label:'VIX Level',icon:'⚡',
    value:vix.toFixed(1),
    detail:vix<=15?'Calm — market relaxed':vix<=20?'Elevated — caution zone':vix<=25?'High fear — risk-off pressure':'Panic — extreme risk-off'};
  // 2. VIX Term Structure (15%)
  var vxv=data.vxv||vix;
  var ratio=vxv>0?vix/vxv:1;
  var ts;
  if(ratio<0.85)ts=100;
  else if(ratio<0.92)ts=Math.round(100-(ratio-0.85)/0.07*25);
  else if(ratio<0.97)ts=Math.round(75-(ratio-0.92)/0.05*20);
  else if(ratio<1.02)ts=Math.round(55-(ratio-0.97)/0.05*25);
  else if(ratio<1.10)ts=Math.round(30-(ratio-1.02)/0.08*25);
  else ts=Math.max(0,Math.round(5-(ratio-1.1)*20));
  var tsText=ratio<0.90?'Deep contango — very calm':ratio<0.97?'Contango — normal':ratio<1.02?'Near flat — watch closely':ratio<1.10?'Backwardation — fear':'Extreme backwardation — panic';
  S.termStructure={score:ts,weight:.15,label:'VIX Term Structure',icon:'📐',
    value:'Ratio '+ratio.toFixed(3),
    detail:tsText+' (VXV '+vxv.toFixed(1)+')'};
  // 3. Credit Spreads (20%) — HYG vs LQD daily %
  var hyg=data.credit.hyg_pct,lqd=data.credit.lqd_pct;
  var csp=hyg-lqd;
  var cs=Math.round(50+csp/0.5*50);
  cs=Math.max(0,Math.min(100,cs));
  S.credit={score:cs,weight:.20,label:'Credit Spreads',icon:'🏦',
    value:(csp>=0?'+':'')+csp.toFixed(2)+'%',
    detail:'HYG '+(hyg>=0?'+':'')+hyg.toFixed(2)+'% vs LQD '+(lqd>=0?'+':'')+lqd.toFixed(2)+'%'};
  // 4. Market Breadth (15%) — RSP vs SPY
  var spy=data.breadth.spy_pct,rsp=data.breadth.rsp_pct;
  var bsp=rsp-spy;
  var bs=Math.round(50+bsp/0.5*50);
  bs=Math.max(0,Math.min(100,bs));
  S.breadth={score:bs,weight:.15,label:'Market Breadth',icon:'📊',
    value:(bsp>=0?'+':'')+bsp.toFixed(2)+'%',
    detail:'SPY '+(spy>=0?'+':'')+spy.toFixed(2)+'% · RSP '+(rsp>=0?'+':'')+rsp.toFixed(2)+'%'};
  // 5. Sector Rotation (15%) — risk-on vs defensive ETFs
  var sr=data.sector_rotation,ssp=sr.spread;
  var ss=Math.round(50+ssp/2.0*50);
  ss=Math.max(0,Math.min(100,ss));
  var ro=sr.risk_on_avg,rof=sr.risk_off_avg;
  S.sectorRotation={score:ss,weight:.15,label:'Sector Rotation',icon:'🔄',
    value:(ssp>=0?'+':'')+ssp.toFixed(2)+'%',
    detail:'Tech/Disc/Comm '+(ro>=0?'+':'')+ro.toFixed(2)+'% · Util/Staples/Health '+(rof>=0?'+':'')+rof.toFixed(2)+'%'};
  // 6. Put/Call Ratio (10%)
  var pcr=data.pcr||1.0;
  var ps=Math.round((1.3-pcr)/(1.3-0.5)*100);
  ps=Math.max(0,Math.min(100,ps));
  var pcrText=pcr<0.65?'Extreme call buying — greed':pcr<0.80?'Bullish options flow':pcr<0.95?'Balanced sentiment':pcr<1.10?'Defensive put buying':'Heavy put buying — fear';
  S.pcr={score:ps,weight:.10,label:'Put/Call Ratio',icon:'⚖️',
    value:pcr.toFixed(2),
    detail:pcrText};
  // 7. SPY 200DMA (10%)
  var pa=data.spy_200dma.pct_above;
  var ds;
  if(pa>8)ds=100;
  else if(pa>5)ds=Math.round(85+(pa-5)/3*15);
  else if(pa>2)ds=Math.round(65+(pa-2)/3*20);
  else if(pa>0)ds=Math.round(55+pa/2*10);
  else if(pa>-2)ds=Math.round(35+(pa+2)/2*20);
  else if(pa>-5)ds=Math.round(10+(pa+5)/3*25);
  else ds=Math.max(0,Math.round(10+(pa+5)*3));
  S.spy200dma={score:ds,weight:.10,label:'SPY 200-Day MA',icon:'📈',
    value:(pa>=0?'+':'')+pa.toFixed(1)+'%',
    detail:'SPY $'+data.spy_200dma.current.toFixed(0)+' · MA200 $'+data.spy_200dma.ma200.toFixed(0)};
  // Composite weighted average
  var total=0,wt=0;
  Object.values(S).forEach(function(sig){total+=sig.score*sig.weight;wt+=sig.weight;});
  var comp=Math.max(0,Math.min(100,Math.round(total/wt)));
  return{signals:S,composite:comp};
}

function generateRiskSummary(signals,composite){
  var arr=Object.values(signals).sort(function(a,b){return Math.abs(b.score-50)-Math.abs(a.score-50);});
  var lead=arr[0],second=arr[1];
  var mood=composite>=75?'Risk appetite is elevated':composite>=60?'Markets leaning risk-on':composite>=45?'Conditions broadly neutral':composite>=30?'Risk sentiment cautious':'Markets in risk-off mode';
  var ld=lead.score>=75?lead.label+' firmly bullish ('+lead.score+'/100)':lead.score>=60?lead.label+' mildly positive ('+lead.score+'/100)':lead.score<=25?lead.label+' signaling danger ('+lead.score+'/100)':lead.score<=40?lead.label+' leaning bearish ('+lead.score+'/100)':lead.label+' mixed';
  var sd=second.score>=65?' with '+second.label.toLowerCase()+' also supportive.':second.score<=35?' and '+second.label.toLowerCase()+' also concerning.':'.';
  return mood+'. '+ld+sd;
}

function renderRiskMeter(result,data){
  var composite=result.composite,signals=result.signals;
  var color=riskScoreToColor(composite);
  document.getElementById('riskGaugeSvgWrap').innerHTML=buildRiskGaugeSvg(composite);
  var sn=document.getElementById('riskScoreNum');
  sn.textContent=composite;sn.style.color=color;
  var rl=document.getElementById('riskLabel');
  rl.textContent=riskScoreToLabel(composite);rl.style.color=color;
  document.getElementById('riskSummary').textContent=generateRiskSummary(signals,composite);
  // Contributions (sorted best→worst)
  var arr=Object.entries(signals).sort(function(a,b){return b[1].score-a[1].score;});
  var cHtml='';
  arr.forEach(function(e){
    var sig=e[1],sc=riskScoreToColor(sig.score);
    cHtml+='<div class="rsig-contrib-row">'
      +'<div class="rsig-contrib-name">'+sig.icon+' '+sig.label+'</div>'
      +'<div class="rsig-contrib-track"><div class="rsig-contrib-fill" style="width:'+sig.score+'%;background:'+sc+'"></div></div>'
      +'<div class="rsig-contrib-score" style="color:'+sc+'">'+sig.score+'</div>'
      +'</div>';
  });
  document.getElementById('riskContribRows').innerHTML=cHtml;
  // Signal cards
  var gHtml='';
  Object.values(signals).forEach(function(sig){
    var sc=riskScoreToColor(sig.score);
    var bc=sig.score>=65?'ron':sig.score>=45?'neu':'rof';
    var bt=sig.score>=65?'RISK-ON':sig.score>=45?'NEUTRAL':'RISK-OFF';
    gHtml+='<div class="rsig-card">'
      +'<div class="rsig-card-head">'
        +'<div class="rsig-card-name">'+sig.icon+'&nbsp;'+sig.label+'</div>'
        +'<span class="rsig-badge '+bc+'">'+bt+'</span>'
      +'</div>'
      +'<div class="rsig-val" style="color:'+sc+'">'+sig.value+'</div>'
      +'<div class="rsig-detail">'+sig.detail+'</div>'
      +'<div class="rsig-bar-track"><div class="rsig-bar-fill" style="width:'+sig.score+'%;background:'+sc+'"></div></div>'
      +'<div class="rsig-bar-foot">'
        +'<div class="rsig-bar-score">Score '+sig.score+'/100</div>'
        +'<div class="rsig-bar-wt">WT '+(sig.weight*100|0)+'%</div>'
      +'</div>'
      +'</div>';
  });
  document.getElementById('riskSignalGrid').innerHTML=gHtml;
}

async function loadRiskMeter(){
  document.getElementById('riskLastUpdated').textContent='Loading...';
  document.getElementById('riskGaugeSvgWrap').innerHTML='<div style="color:#334155;font-size:12px;padding:40px 0">Fetching signals...</div>';
  document.getElementById('riskSignalGrid').innerHTML='';
  document.getElementById('riskContribRows').innerHTML='';
  try{
    var res=await fetch(API+'/api/risk-signals');
    var data=await res.json();
    if(data.error)throw new Error(data.error);
    var result=scoreRiskSignals(data);
    renderRiskMeter(result,data);
    document.getElementById('riskLastUpdated').textContent='Updated '+new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  }catch(e){
    document.getElementById('riskLastUpdated').textContent='Failed — '+e.message;
    document.getElementById('riskGaugeSvgWrap').innerHTML='';
    console.error('loadRiskMeter:',e);
  }
}


// ── PUT/CALL RATIO ────────────────────────────────────────────────────────────
var _pcrChart = null;

function pcrZone(v){
  if(v === null) return {label:'N/A', color:'#475569', bg:'#0f172a'};
  if(v < 0.80)  return {label:'EXTREME GREED', color:'#ef4444', bg:'#450a0a'};
  if(v < 1.00)  return {label:'GREED',         color:'#f97316', bg:'#431407'};
  if(v < 1.30)  return {label:'NEUTRAL',        color:'#94a3b8', bg:'#0f172a'};
  if(v < 1.60)  return {label:'FEAR',           color:'#60a5fa', bg:'#0c1a2e'};
  return                {label:'EXTREME FEAR',  color:'#a78bfa', bg:'#1e1040'};
}

function pcrRenderGauge(d){
  var v    = d.pcr;
  var zone = pcrZone(v);

  // Gauge: min=0.5 max=2.0, clamp position (SPY range)
  var MIN = 0.5, MAX = 2.0;
  var pct  = Math.max(0, Math.min(100, ((v - MIN) / (MAX - MIN)) * 100));

  // Zone boundaries as % of bar (SPY-calibrated)
  var zones = [
    {from: 0,    to: 20.0, color:'#ef4444', label:'Ext. Greed'},  // <0.80
    {from: 20.0, to: 33.3, color:'#f97316', label:'Greed'},       // 0.80–1.00
    {from: 33.3, to: 53.3, color:'#64748b', label:'Neutral'},     // 1.00–1.30
    {from: 53.3, to: 73.3, color:'#60a5fa', label:'Fear'},        // 1.30–1.60
    {from: 73.3, to:100,   color:'#a78bfa', label:'Ext. Fear'},   // >1.60
  ];

  var zoneBar = zones.map(function(z){
    return '<div style="position:absolute;top:0;bottom:0;left:'+z.from+'%;width:'+(z.to-z.from)+'%;background:'+z.color+';opacity:0.25"></div>';
  }).join('');

  var html = '<div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:18px">';

  // Big PCR value
  html += '<div style="background:'+zone.bg+';border:1px solid '+zone.color+'44;border-radius:10px;padding:16px 24px;text-align:center;min-width:130px">'
    + '<div style="font-size:36px;font-weight:700;color:'+zone.color+';line-height:1">'+( v !== null ? v.toFixed(3) : '—' )+'</div>'
    + '<div style="font-size:10px;font-weight:700;color:'+zone.color+';letter-spacing:1px;margin-top:4px">SPY P/C RATIO</div>'
    + '<div style="font-size:11px;font-weight:700;letter-spacing:2px;color:'+zone.color+';margin-top:6px;padding:3px 10px;background:'+zone.color+'22;border-radius:4px">'+zone.label+'</div>'
    + '</div>';

  // Meta
  html += '<div style="flex:1;min-width:200px">';
  html += '<div style="display:flex;gap:12px;margin-bottom:10px">';
  if(d.ma5)  html += '<div style="background:#0a0f1a;border:1px solid #1e293b;border-radius:6px;padding:8px 14px"><div style="font-size:18px;font-weight:600;color:#e2e8f0">'+d.ma5+'</div><div style="font-size:10px;color:#475569;margin-top:2px">5-DAY AVG</div></div>';
  if(d.ma20) html += '<div style="background:#0a0f1a;border:1px solid #1e293b;border-radius:6px;padding:8px 14px"><div style="font-size:18px;font-weight:600;color:#e2e8f0">'+d.ma20+'</div><div style="font-size:10px;color:#475569;margin-top:2px">20-DAY AVG</div></div>';
  html += '</div>';
  html += '<div style="font-size:11px;color:#475569">Put vol: <b style="color:#94a3b8">'+(d.put_vol||0).toLocaleString()+'</b> &nbsp;·&nbsp; Call vol: <b style="color:#94a3b8">'+(d.call_vol||0).toLocaleString()+'</b></div>';
  html += '<div style="font-size:10px;color:#334155;margin-top:4px">Source: CBOE SPX options chain · as of '+d.date+'</div>';
  html += '</div>';
  html += '</div>';

  // Zone gauge bar
  html += '<div style="position:relative;height:20px;border-radius:6px;overflow:hidden;background:#1e293b;margin-bottom:6px">';
  html += zoneBar;
  // marker
  html += '<div style="position:absolute;top:0;bottom:0;left:calc('+pct+'% - 2px);width:4px;background:#fff;border-radius:2px;box-shadow:0 0 6px #fff8"></div>';
  html += '</div>';

  // Zone labels
  html += '<div style="display:flex;justify-content:space-between;font-size:9px;color:#334155;letter-spacing:0.5px;margin-bottom:6px">';
  html += '<span style="color:#ef4444">EXT. GREED<br>(&lt; 0.80)</span>';
  html += '<span style="color:#f97316;text-align:center">GREED<br>(0.80–1.00)</span>';
  html += '<span style="color:#64748b;text-align:center">NEUTRAL<br>(1.00–1.30)</span>';
  html += '<span style="color:#60a5fa;text-align:center">FEAR<br>(1.30–1.60)</span>';
  html += '<span style="color:#a78bfa;text-align:right">EXT. FEAR<br>(&gt; 1.60)</span>';
  html += '</div>';

  document.getElementById('pcrContent').innerHTML = html;
}

function pcrRenderChart(history){
  if(!history || history.length < 2){ return; }
  document.getElementById('pcrChartWrap').style.display = '';
  var ctx = document.getElementById('pcrChart');
  if(_pcrChart){ _pcrChart.destroy(); _pcrChart = null; }

  var labels = history.map(function(h){ return h.date.slice(5); });
  var vals   = history.map(function(h){ return h.pcr; });

  _pcrChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: vals,
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96,165,250,0.08)',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {display: false},
        tooltip: {
          callbacks: {
            label: function(c){ return 'PCR: ' + c.parsed.y.toFixed(3); }
          }
        },
        annotation: {
          annotations: {
            neutral_lo: {type:'line', yMin:0.85, yMax:0.85, borderColor:'#475569', borderWidth:1, borderDash:[4,4]},
            neutral_hi: {type:'line', yMin:1.05, yMax:1.05, borderColor:'#475569', borderWidth:1, borderDash:[4,4]}
          }
        }
      },
      scales: {
        x: {ticks:{color:'#475569',font:{size:10}}, grid:{color:'#0f172a'}},
        y: {ticks:{color:'#475569',font:{size:10}}, grid:{color:'#1e293b'},
            min: 0.5, max: 1.6,
            afterBuildTicks: function(axis){ axis.ticks = [0.7,0.85,1.0,1.05,1.25,1.5].map(function(v){ return {value:v}; }); }}
      }
    }
  });
}

function pcrRenderExplainer(v){
  var zone = pcrZone(v);
  var bullets = [
    {icon:'📊', title:'What is the Put/Call Ratio?',
     text:'It measures how many put options (bets that the market goes down) are traded relative to call options (bets it goes up). A ratio above 1.0 means more puts than calls — traders are hedging or bearish. Below 1.0 means calls dominate — traders are bullish.'},
    {icon:'🔄', title:'Why is it a contrarian indicator?',
     text:'Extreme readings are contrarian signals. When everyone is buying puts (very high PCR), markets are often near a bottom — panic is already priced in. When everyone is buying calls (very low PCR), complacency may be setting in and a pullback could follow.'},
    {icon: zone.color === '#94a3b8' ? '✅' : (v < 0.85 ? '⚠️' : '🔔'),
     title: 'Right now: ' + zone.label + ' (' + (v !== null ? v.toFixed(3) : '—') + ')',
     text: v === null ? 'Data unavailable.'
       : v < 0.80 ? 'Very few puts being bought relative to calls. Markets may be overconfident. Watch for a surprise reversal — complacency can get punished quickly.'
       : v < 1.00 ? 'Call volume is elevated. Sentiment is optimistic. Not dangerous on its own, but a reading near lows warrants caution.'
       : v < 1.30 ? 'Balanced activity between puts and calls. No extreme signal. Markets are functioning with normal two-sided hedging activity.'
       : v < 1.60 ? 'Elevated put buying. Traders are paying up to hedge downside. This can indicate worry, but also a healthy wall of worry that markets often climb.'
       : 'Very high put activity. Fear is elevated. Historically, extreme PCR readings have preceded short-term bounces — though timing is imprecise.'},
    {icon:'💡', title:'Important caveats',
     text:'This ratio uses SPY (S&P 500 ETF) options — a mix of retail and institutional flow, making it a better sentiment gauge than pure index options (SPX). The zones are calibrated for SPY\'s natural range (higher than equity-only PCR). The 5-day and 20-day averages are better signals than any single day.'}
  ];

  var html = '<div class="mini-section"><div class="ms-header"><div class="ms-title">💬 Understanding the Put/Call Ratio</div></div>';
  html += '<div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">';
  bullets.forEach(function(b){
    html += '<div style="background:#0a0f1a;border:1px solid #1e293b;border-radius:8px;padding:14px 16px;display:flex;gap:14px">'
      +'<div style="font-size:20px;flex-shrink:0;margin-top:1px">'+b.icon+'</div>'
      +'<div>'
      +  '<div style="font-size:12px;font-weight:700;color:#e2e8f0;margin-bottom:4px">'+b.title+'</div>'
      +  '<div style="font-size:12px;color:#64748b;line-height:1.6">'+b.text+'</div>'
      +'</div>'
      +'</div>';
  });
  html += '</div></div>';
  document.getElementById('pcrExplainer').innerHTML = html;
}

function loadPcrSection(){
  fetch(API + '/api/pcr')
    .then(function(r){ return r.json(); })
    .then(function(d){
      if(d.error){ document.getElementById('pcrContent').innerHTML = '<div style="color:#ef4444;font-size:12px">PCR data unavailable: '+d.error+'</div>'; return; }
      pcrRenderGauge(d);
      pcrRenderChart(d.history);
      pcrRenderExplainer(d.pcr);
    })
    .catch(function(){ document.getElementById('pcrContent').innerHTML = '<div style="color:#475569;font-size:12px">Could not load PCR data.</div>'; });
}


// ══════════════════════════════════════════════════════════════
// HOUSING RISK GAUGE — Cross-Asset Macro Regime Model
// 8 signals, institutionally weighted, FRED + yfinance data
// ══════════════════════════════════════════════════════════════

var _hrgChart1=null, _hrgChart2=null, _hrgChart3=null;

async function hrgFred(series){
  var r = await fetch(API + '/api/fred?series=' + series);
  var txt = await r.text();
  var rows = txt.trim().split('\n').slice(1);
  var out = [];
  rows.forEach(function(line){
    var p = line.split(',');
    if(p[1] && p[1].trim() !== '.') out.push({date:p[0], value:parseFloat(p[1])});
  });
  return out;
}

async function hrgHist(symbol, days){
  var r = await fetch(API + '/api/history?symbol=' + encodeURIComponent(symbol) + '&days=' + days);
  return r.json();
}

function hrgRet(closes, lookback){
  if(!closes || closes.length <= lookback) return null;
  var n = closes.length;
  return (closes[n-1] / closes[n-1-lookback] - 1) * 100;
}

function hrgScoreSpread(aRet, bRet, range){
  // positive spread = a outperforms b = risk-on
  if(aRet === null || bRet === null) return 50;
  var r = range || 25;
  return Math.max(0, Math.min(100, Math.round(((aRet - bRet) + r) / (r*2) * 100)));
}

function hrgScoreHY(bps){
  if(bps < 200) return 92; if(bps < 250) return 84; if(bps < 300) return 74;
  if(bps < 350) return 62; if(bps < 400) return 50; if(bps < 450) return 38;
  if(bps < 500) return 28; if(bps < 600) return 18; return 8;
}

function hrgScoreCurve(v){
  if(v > 2.0) return 90; if(v > 1.5) return 82; if(v > 1.0) return 73;
  if(v > 0.5) return 64; if(v > 0.0) return 55; if(v > -0.5) return 40;
  if(v > -1.0) return 28; return 14;
}

function hrgScoreVIX(v){
  if(v < 12) return 92; if(v < 15) return 83; if(v < 18) return 73;
  if(v < 22) return 60; if(v < 28) return 42; if(v < 35) return 25; return 12;
}

function hrgScoreNFCI(v){
  // negative = loose = risk-on
  if(v < -0.7) return 90; if(v < -0.4) return 78; if(v < -0.1) return 65;
  if(v < 0.2)  return 50; if(v < 0.5)  return 35; if(v < 0.8)  return 22; return 10;
}

function hrgChartOpts(title){
  return {
    responsive:true, maintainAspectRatio:false,
    interaction:{mode:'index',intersect:false},
    plugins:{
      legend:{display:false},
      title:{display:true,text:title,color:'#475569',font:{size:10,weight:'700',family:'Inter,sans-serif'},padding:{bottom:8}},
      tooltip:{
        backgroundColor:'rgba(8,8,16,0.92)', borderColor:'rgba(255,255,255,0.08)', borderWidth:1,
        titleColor:'#94a3b8', bodyColor:'#e2e8f0', padding:10,
      },
    },
    scales:{
      x:{ticks:{color:'#334155',font:{size:8},maxTicksLimit:6,maxRotation:0},grid:{color:'rgba(255,255,255,0.03)'},border:{color:'rgba(255,255,255,0.06)'}},
      y:{ticks:{color:'#334155',font:{size:8}},grid:{color:'rgba(255,255,255,0.04)'},border:{color:'rgba(255,255,255,0.06)'}},
    }
  };
}

function hrgDrawCharts(woodH, gldH, copxH, hyData, curveData){
  // ── Chart 1: WOOD/GLD Ratio (normalized to 100) ──────────────
  if(_hrgChart1){_hrgChart1.destroy();_hrgChart1=null;}
  var c1 = document.getElementById('hrg-chart-1');
  if(c1 && woodH.closes && gldH.closes && woodH.closes.length && gldH.closes.length){
    var n1 = Math.min(woodH.closes.length, gldH.closes.length, 90);
    var wc = woodH.closes.slice(-n1), gc = gldH.closes.slice(-n1);
    var labels1 = (woodH.dates||[]).slice(-n1);
    var base = wc[0]/gc[0];
    var ratio = wc.map(function(w,i){ return +(w/gc[i]/base*100).toFixed(2); });
    var mn = ratio.reduce(function(a,b){return a+b;},0)/ratio.length;
    _hrgChart1 = new Chart(c1.getContext('2d'),{
      type:'line',
      data:{
        labels:labels1,
        datasets:[
          {label:'WOOD/GLD',data:ratio,
           segment:{borderColor:function(sc){return ((sc.p0.parsed.y+sc.p1.parsed.y)/2)>=mn?'#22c55e':'#ef4444';}},
           borderWidth:2,pointRadius:0,fill:false,tension:0.3},
          {label:'Mean',data:ratio.map(function(){return+mn.toFixed(2);}),
           borderColor:'rgba(74,158,255,0.45)',borderWidth:1.5,borderDash:[6,3],pointRadius:0,fill:false,tension:0},
        ]
      },
      options:hrgChartOpts('WOOD/GLD Ratio · Lumber vs Gold (90D)'),
    });
  }

  // ── Chart 2: HY Credit Spreads (bps) ────────────────────────
  if(_hrgChart2){_hrgChart2.destroy();_hrgChart2=null;}
  var c2 = document.getElementById('hrg-chart-2');
  if(c2 && hyData.length){
    var hy = hyData.slice(-90);
    var labels2 = hy.map(function(d){return d.date.slice(5);});
    var hyBps   = hy.map(function(d){return +(d.value*100).toFixed(0);});
    var hyMn    = hyBps.reduce(function(a,b){return a+b;},0)/hyBps.length;
    _hrgChart2 = new Chart(c2.getContext('2d'),{
      type:'line',
      data:{
        labels:labels2,
        datasets:[
          {label:'HY Spread (bps)',data:hyBps,
           segment:{borderColor:function(sc){return ((sc.p0.parsed.y+sc.p1.parsed.y)/2)>hyMn?'#ef4444':'#22c55e';}},
           borderWidth:2,pointRadius:0,fill:false,tension:0.3},
          {label:'Mean',data:hyBps.map(function(){return+hyMn.toFixed(0);}),
           borderColor:'rgba(74,158,255,0.45)',borderWidth:1.5,borderDash:[6,3],pointRadius:0,fill:false,tension:0},
        ]
      },
      options:hrgChartOpts('HY Credit Spread · ICE BofA OAS (bps)'),
    });
  }

  // ── Chart 3: 2s10s Yield Curve ──────────────────────────────
  if(_hrgChart3){_hrgChart3.destroy();_hrgChart3=null;}
  var c3 = document.getElementById('hrg-chart-3');
  if(c3 && curveData.length){
    var cv = curveData.slice(-90);
    var labels3 = cv.map(function(d){return d.date.slice(5);});
    var cvVals  = cv.map(function(d){return+d.value.toFixed(2);});
    _hrgChart3 = new Chart(c3.getContext('2d'),{
      type:'line',
      data:{
        labels:labels3,
        datasets:[
          {label:'2s10s (%)',data:cvVals,
           segment:{borderColor:function(sc){return ((sc.p0.parsed.y+sc.p1.parsed.y)/2)>=0?'#22c55e':'#ef4444';}},
           backgroundColor:function(ctx){
             var chart=ctx.chart,{ctx:c,chartArea:a}=chart;
             if(!a) return;
             var grad=c.createLinearGradient(0,a.top,0,a.bottom);
             grad.addColorStop(0,'rgba(34,197,94,0.07)');
             grad.addColorStop(0.5,'rgba(0,0,0,0)');
             grad.addColorStop(1,'rgba(239,68,68,0.07)');
             return grad;
           },
           fill:'origin',
           borderWidth:2,pointRadius:0,tension:0.3},
          {label:'Zero',data:cvVals.map(function(){return 0;}),
           borderColor:'rgba(255,255,255,0.1)',borderWidth:1,borderDash:[4,4],pointRadius:0,fill:false,tension:0},
        ]
      },
      options:hrgChartOpts('2s10s Yield Curve · Steepening = Risk-On (%)'),
    });
  }
}

function renderHrgPortfolio(composite){
  var ALLOC=[
    {asset:'US Equities (SPY)',     ron:'OW',  neu:'N',  rof:'UW',  rExpl:'Cyclical earnings expand',     nExpl:'Mixed backdrop',         fExpl:'Earnings risk, multiple compression'},
    {asset:'Cyclical Sectors (XLI/XLY)',ron:'OW+',neu:'N',rof:'UW-',rExpl:'Industrial/consumer lead',     nExpl:'Sector-neutral',         fExpl:'Defensives outperform'},
    {asset:'Homebuilders (XHB)',    ron:'OW',  neu:'N',  rof:'UW',  rExpl:'Housing cycle accelerating',   nExpl:'Rate-dependent',         fExpl:'Rising rates crush demand'},
    {asset:'Duration / Bonds (TLT)',ron:'UW',  neu:'N',  rof:'OW',  rExpl:'Rates rise, bonds weak',       nExpl:'Duration neutral',       fExpl:'Flight to safety, price appreciation'},
    {asset:'High Yield Credit',     ron:'OW',  neu:'N',  rof:'UW',  rExpl:'Spreads tighten, carry accrues',nExpl:'Spread-neutral',        fExpl:'Spread widening destroys returns'},
    {asset:'Commodities ex-Gold',   ron:'OW',  neu:'N',  rof:'UW',  rExpl:'Demand growth + capex cycle',  nExpl:'Range-bound demand',     fExpl:'Demand destruction'},
    {asset:'Gold (GLD)',            ron:'UW',  neu:'N',  rof:'OW',  rExpl:'Opportunity cost rises',       nExpl:'Neutral real rates',     fExpl:'Safe haven, real yield decline'},
    {asset:'USD (DXY)',             ron:'UW',  neu:'N',  rof:'OW',  rExpl:'Risk appetite = EM/growth bid',nExpl:'Fundamentals-driven',    fExpl:'Flight to safety'},
    {asset:'Volatility (VIX)',      ron:'Short',neu:'N', rof:'Long', rExpl:'Low vol regime, sell premium', nExpl:'Neutral positioning',    fExpl:'Hedge tail risk, buy protection'},
    {asset:'Emerging Markets (EEM)',ron:'OW',  neu:'N',  rof:'UW',  rExpl:'USD weakness + growth cycle',  nExpl:'EM-specific factors',    fExpl:'Dollar strength + risk aversion'},
  ];
  var isRon = composite >= 55, isRof = composite < 42;
  var key = isRon ? 'ron' : isRof ? 'rof' : 'neu';
  var exKey = isRon ? 'rExpl' : isRof ? 'fExpl' : 'nExpl';
  var html = '<table class="hrg-alloc-table"><thead><tr>'
    +'<th>Asset Class</th><th>Positioning</th><th>Rationale</th>'
    +'</tr></thead><tbody>';
  ALLOC.forEach(function(row){
    var val = row[key], expl = row[exKey];
    var isOW = val==='OW'||val==='OW+', isUW = val==='UW'||val==='UW-';
    var isSh = val==='Short', isLong = val==='Long';
    var pillCls = (isOW||isSh) ? 'hrg-ow' : (isUW||isLong) ? 'hrg-uw' : 'hrg-neu';
    var stanceCls = (isOW||isSh)?'hrg-stance-up':(isUW||isLong)?'hrg-stance-dn':'hrg-stance-ne';
    var stanceTxt = (isOW)?'▲ Overweight':(isUW)?'▼ Underweight':(isSh)?'▽ Short Vol':(isLong)?'△ Long Vol':'— Neutral';
    html+='<tr><td>'+row.asset+'</td>'
      +'<td><span class="hrg-pill '+pillCls+'">'+val+'</span></td>'
      +'<td class="'+stanceCls+'">'+expl+'</td>'
      +'</tr>';
  });
  html+='</tbody></table>';
  document.getElementById('hrg-portfolio').innerHTML = html;
}

function renderHousingGauge(signals, composite){
  var color = riskScoreToColor(composite);
  document.getElementById('hrg-gauge-wrap').innerHTML = buildRiskGaugeSvg(composite);
  var sn = document.getElementById('hrg-score-num');
  sn.textContent = composite; sn.style.color = color;
  var rl = document.getElementById('hrg-label');
  rl.textContent = riskScoreToLabel(composite); rl.style.color = color;

  var sArr = Object.values(signals);
  var bull = sArr.filter(function(s){return s.score>=60;}).length;
  var bear = sArr.filter(function(s){return s.score<=40;}).length;
  var lead = sArr.sort(function(a,b){return Math.abs(b.score-50)-Math.abs(a.score-50);})[0];
  var mood = composite>=68?'Cross-asset signals firmly risk-on':composite>=55?'Markets leaning into risk':composite>=42?'Mixed regime — no clear directional edge':composite>=30?'Risk-off pressure building across asset classes':'Extreme risk-off — defensive posture warranted';
  document.getElementById('hrg-summary').textContent = mood+'. '+bull+' of 8 signals bullish, '+bear+' defensive. Lead signal: '+lead.label+'.';

  // Contribution bars (sorted high→low)
  var sorted = Object.entries(signals).sort(function(a,b){return b[1].score-a[1].score;});
  var cHtml = '';
  sorted.forEach(function(e){
    var sig=e[1], sc=riskScoreToColor(sig.score);
    cHtml+='<div class="rsig-contrib-row">'
      +'<div class="rsig-contrib-name">'+sig.icon+' '+sig.label+'</div>'
      +'<div class="rsig-contrib-track"><div class="rsig-contrib-fill" style="width:'+sig.score+'%;background:'+sc+'"></div></div>'
      +'<div class="rsig-contrib-score" style="color:'+sc+'">'+sig.score+'</div>'
      +'</div>';
  });
  document.getElementById('hrg-contrib-rows').innerHTML = cHtml;

  // Signal cards (8, 4-col grid)
  var gHtml = '';
  Object.values(signals).forEach(function(sig){
    var sc = riskScoreToColor(sig.score);
    var bc = sig.score>=65?'ron':sig.score>=45?'neu':'rof';
    var bt = sig.score>=65?'RISK-ON':sig.score>=45?'NEUTRAL':'RISK-OFF';
    gHtml+='<div class="rsig-card">'
      +'<div class="rsig-card-head">'
        +'<div class="rsig-card-name">'+sig.icon+'&nbsp;'+sig.label+'</div>'
        +'<span class="rsig-badge '+bc+'">'+bt+'</span>'
      +'</div>'
      +'<div class="rsig-val" style="color:'+sc+'">'+sig.value+'</div>'
      +'<div class="rsig-detail">'+sig.detail+'</div>'
      +'<div class="rsig-bar-track"><div class="rsig-bar-fill" style="width:'+sig.score+'%;background:'+sc+'"></div></div>'
      +'<div class="rsig-bar-foot">'
        +'<div class="rsig-bar-score">Score '+sig.score+'/100</div>'
        +'<div class="rsig-bar-wt">WT '+Math.round(sig.weight*100)+'%</div>'
      +'</div>'
      +'</div>';
  });
  document.getElementById('hrg-signal-grid').innerHTML = gHtml;

  renderHrgPortfolio(composite);
}

async function loadHousingGauge(){
  var updEl = document.getElementById('hrg-updated');
  if(updEl) updEl.textContent = 'Loading...';
  document.getElementById('hrg-gauge-wrap').innerHTML = '<div style="color:#334155;font-size:12px;padding:40px 0;text-align:center">Fetching cross-asset data...</div>';
  document.getElementById('hrg-signal-grid').innerHTML = '';
  document.getElementById('hrg-contrib-rows').innerHTML = '';

  try{
    var LOOK = 65; // 13 weeks ≈ 65 trading days
    var [woodH, gldH, copxH, xhbH, spyH, vixH, dxyH, hyData, curveData, nfciData] = await Promise.all([
      hrgHist('WOOD',    100),
      hrgHist('GLD',     100),
      hrgHist('COPX',    100),
      hrgHist('XHB',     100),
      hrgHist('SPY',     100),
      hrgHist('^VIX',     30),
      hrgHist('DX-Y.NYB',100),
      hrgFred('BAMLH0A0HYM2'),
      hrgFred('T10Y2Y'),
      hrgFred('NFCI'),
    ]);

    var woodRet = hrgRet(woodH.closes, LOOK);
    var gldRet  = hrgRet(gldH.closes,  LOOK);
    var copxRet = hrgRet(copxH.closes, LOOK);
    var xhbRet  = hrgRet(xhbH.closes,  LOOK);
    var spyRet  = hrgRet(spyH.closes,  LOOK);
    var dxyRet  = hrgRet(dxyH.closes,  LOOK);
    var curVIX  = vixH.closes && vixH.closes.length ? vixH.closes[vixH.closes.length-1] : null;
    var curHY   = hyData.length  ? hyData[hyData.length-1].value * 100  : null; // % → bps
    var curCurve= curveData.length ? curveData[curveData.length-1].value : null;
    var curNFCI = nfciData.length  ? nfciData[nfciData.length-1].value  : null;

    var fmt1 = function(v){ return v!==null ? (v>0?'+':'')+v.toFixed(1)+'%' : '—'; };

    var signals = {
      woodGold:{
        score:   hrgScoreSpread(woodRet, gldRet, 25),
        weight:  0.18, label:'Lumber/Gold', icon:'🌲',
        value:   woodRet!==null&&gldRet!==null ? fmt1(woodRet-gldRet) : '—',
        detail:  'WOOD 13W '+fmt1(woodRet)+' · GLD '+fmt1(gldRet)+' · construction vs safe haven',
      },
      copxGold:{
        score:   hrgScoreSpread(copxRet, gldRet, 25),
        weight:  0.15, label:'Copper/Gold', icon:'🔶',
        value:   copxRet!==null&&gldRet!==null ? fmt1(copxRet-gldRet) : '—',
        detail:  'COPX 13W '+fmt1(copxRet)+' · GLD '+fmt1(gldRet)+' · industrial demand proxy',
      },
      hy:{
        score:   curHY!==null ? hrgScoreHY(curHY) : 50,
        weight:  0.20, label:'HY Credit', icon:'📉',
        value:   curHY!==null ? curHY.toFixed(0)+'bps' : '—',
        detail:  'ICE BofA HY OAS · tight=risk-on · wide=credit stress',
      },
      curve:{
        score:   curCurve!==null ? hrgScoreCurve(curCurve) : 50,
        weight:  0.15, label:'2s10s Curve', icon:'📐',
        value:   curCurve!==null ? (curCurve>0?'+':'')+curCurve.toFixed(2)+'%' : '—',
        detail:  'Steepening = expansion · Inverted = recession risk',
      },
      xhbSpy:{
        score:   hrgScoreSpread(xhbRet, spyRet, 15),
        weight:  0.12, label:'Homebuilders/SPY', icon:'🏠',
        value:   xhbRet!==null&&spyRet!==null ? fmt1(xhbRet-spyRet) : '—',
        detail:  'XHB 13W '+fmt1(xhbRet)+' · SPY '+fmt1(spyRet)+' · housing sector leadership',
      },
      vix:{
        score:   curVIX!==null ? hrgScoreVIX(curVIX) : 50,
        weight:  0.10, label:'VIX Regime', icon:'😰',
        value:   curVIX!==null ? curVIX.toFixed(1) : '—',
        detail:  curVIX<15?'Low fear · risk-on':curVIX<25?'Elevated uncertainty · mixed':'High fear · de-risking underway',
      },
      dxy:{
        score:   hrgScoreSpread(-1*(dxyRet||0), 0, 10) , // invert: DXY down = risk-on
        weight:  0.05, label:'Dollar (DXY)', icon:'💵',
        value:   fmt1(dxyRet),
        detail:  'DXY 13W change · weakening USD = risk-on for commodities & EM',
      },
      nfci:{
        score:   curNFCI!==null ? hrgScoreNFCI(curNFCI) : 50,
        weight:  0.05, label:'Financial Conditions', icon:'🏦',
        value:   curNFCI!==null ? curNFCI.toFixed(3) : '—',
        detail:  'Chicago Fed NFCI · negative=loose=risk-on · positive=tightening',
      },
    };

    var composite = 0;
    Object.values(signals).forEach(function(s){ composite += s.score * s.weight; });
    composite = Math.round(composite);

    renderHousingGauge(signals, composite);
    hrgDrawCharts(woodH, gldH, copxH, hyData, curveData);

    if(updEl) updEl.textContent = 'Updated '+new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  }catch(e){
    console.error('loadHousingGauge:',e);
    if(updEl) updEl.textContent = 'Error — '+e.message;
    document.getElementById('hrg-gauge-wrap').innerHTML = '';
  }
}
