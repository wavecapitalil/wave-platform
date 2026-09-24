// ══════════════════════════════════════════════════════════════
// SEASONALITY SCANNER — 10Y average path vs current year
// ══════════════════════════════════════════════════════════════

var _seasSymbol = 'SPY';
var _seasLabel  = 'S&P 500';
var _seasLineChart = null;

async function seasFetch(sym){
  var r = await fetch(API + '/api/seasonality?symbol=' + encodeURIComponent(sym) + '&years=10');
  return r.json();
}

function seasFmtLabel(key){
  var parts=(key||'').split('-');
  if(parts.length!==2) return key;
  var d=new Date(2000, parseInt(parts[0],10)-1, parseInt(parts[1],10));
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

function seasRender(data){
  var hist=data.historical_average||[];
  var cur=data.current_path||[];
  var canvas=document.getElementById('seas-line-chart');
  if(!canvas) return;

  var currentByKey={};
  cur.forEach(function(p){currentByKey[p.date_key]=p.return_pct;});

  var labels=hist.map(function(p){return p.date_key;});
  var avgVals=hist.map(function(p){return p.return_pct;});
  var curVals=labels.map(function(k){return currentByKey[k]!==undefined?currentByKey[k]:null;});

  if(_seasLineChart){_seasLineChart.destroy();_seasLineChart=null;}
  _seasLineChart=new Chart(canvas.getContext('2d'),{
    type:'line',
    data:{
      labels:labels.map(seasFmtLabel),
      datasets:[
        {
          label:'10Y Average',
          data:avgVals,
          borderColor:'#90a8c2',
          backgroundColor:'rgba(144,168,194,.08)',
          borderWidth:2,
          pointRadius:0,
          tension:.2
        },
        {
          label:String(data.current_year||'Current Year'),
          data:curVals,
          borderColor:'#55aaff',
          backgroundColor:'rgba(85,170,255,.10)',
          borderWidth:3,
          pointRadius:0,
          tension:.18,
          spanGaps:false
        }
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{labels:{color:'#b9d9f4',boxWidth:12}},
        tooltip:{
          backgroundColor:'rgba(5,12,21,.96)',
          borderColor:'#244e73',
          borderWidth:1,
          titleColor:'#9bd1ff',
          bodyColor:'#edf6ff',
          callbacks:{label:function(ctx){var v=ctx.parsed.y;return ctx.dataset.label+': '+(v>=0?'+':'')+v.toFixed(2)+'%';}}
        }
      },
      scales:{
        x:{
          grid:{display:false},
          ticks:{color:'#597895',maxTicksLimit:12,maxRotation:0},
          border:{color:'#173752'}
        },
        y:{
          grid:{color:'rgba(23,55,82,.45)'},
          ticks:{color:'#597895',callback:function(v){return (v>=0?'+':'')+v+'%';}},
          border:{color:'#173752'}
        }
      }
    }
  });

  var latestCur=null,latestKey=null;
  for(var i=cur.length-1;i>=0;i--){if(cur[i]&&cur[i].return_pct!=null){latestCur=cur[i].return_pct;latestKey=cur[i].date_key;break;}}
  var avgMap={}; hist.forEach(function(p){avgMap[p.date_key]=p.return_pct;});
  var latestAvg=latestKey&&avgMap[latestKey]!=null?avgMap[latestKey]:null;
  var gap=(latestCur!=null&&latestAvg!=null)?latestCur-latestAvg:null;

  function put(id,val){
    var el=document.getElementById(id); if(!el)return;
    el.textContent=val==null?'—':(val>=0?'+':'')+Number(val).toFixed(2)+'%';
    if(val!=null) el.style.color=val>=0?'#48d18a':'#ff6f82';
  }
  put('seasCurrentRet',latestCur);
  put('seasAvgRet',latestAvg);
  put('seasGap',gap);
  var sm=document.getElementById('seasSample');
  if(sm) sm.textContent=(data.years_used||[]).length;
}

async function seasLoad(sym,label,btn){
  _seasSymbol=sym; _seasLabel=label||sym;
  if(btn){
    document.querySelectorAll('.seas-asset-btn').forEach(function(b){b.classList.remove('active');});
    btn.classList.add('active');
  }
  var upd=document.getElementById('seas-updated');
  var title=document.getElementById('seasChartTitle');
  if(upd) upd.textContent='Loading '+_seasLabel+'...';
  if(title) title.textContent=_seasSymbol+' · Current year vs 10Y average';
  try{
    var data=await seasFetch(sym);
    if(data.error) throw new Error(data.error);
    seasRender(data);
    if(upd) upd.textContent=_seasLabel+' · 10Y historical average vs '+data.current_year+' · Updated '+new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  }catch(e){
    console.error('seasLoad:',e);
    if(upd) upd.textContent='Error: '+e.message;
  }
}

