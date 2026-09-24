// ── METALS / GOLD-SILVER RATIO ──────────────────────────────
var _gsrChart = null;
var _gsrData = null;
var _gsrPeriod = '10y';

function setGsrPeriod(period, btn){
  _gsrPeriod = period || '10y';
  document.querySelectorAll('#gsrTimeTabs .cd-vbtn').forEach(function(b){
    b.classList.toggle('active', b === btn);
  });
  if(_gsrData) renderGsrChart(_gsrData);
}

async function loadCommodities(){
  var canvas = document.getElementById('gsrChart');
  if(!canvas) return;

  if(_gsrData){
    renderGsrChart(_gsrData);
    return;
  }
  canvas.style.opacity = '0.3';
  document.getElementById('gsrMeta').textContent = 'Loading historical data…';
  try{
    var r = await fetch(API + '/api/commodities/gold-silver-ratio');
    var d = await r.json();
    if(d.error){ document.getElementById('gsrMeta').textContent = 'Error: ' + d.error; return; }
    _gsrData = d;
    renderGsrMetrics(d);
    renderGsrChart(d);
  }catch(e){ console.error('loadCommodities:', e); }
}

function renderGsrMetrics(d){
  var current=d.current, mean=d.mean;
  var diff=current-mean;
  var pctDiff=mean ? diff/mean*100 : null;
  var percentile=d.percentile;
  var z=d.z_score;

  document.getElementById('gsrCurrent').textContent=current!=null?current.toFixed(1):'—';
  document.getElementById('gsrCurrentSub').textContent=d.end_date||'';
  document.getElementById('gsrMeanLabel').textContent=(d.n_years||10)+'Y Mean';
  document.getElementById('gsrMean').textContent=mean!=null?mean.toFixed(1):'—';
  document.getElementById('gsrMeanSub').textContent=d.start_date ? d.start_date.slice(0,4)+'–present' : '';
  document.getElementById('gsrVsMean').textContent=percentile!=null?percentile.toFixed(0)+'th':'—';
  document.getElementById('gsrSignal').textContent=z!=null ? 'z-score '+(z>=0?'+':'')+z.toFixed(2)+'σ' : '';
  document.getElementById('gsrGold').textContent=d.gold_price!=null?'$'+d.gold_price.toLocaleString(undefined,{maximumFractionDigits:0}):'—';
  document.getElementById('gsrSilver').textContent=d.silver_price!=null?'$'+Number(d.silver_price).toFixed(2):'—';

  var verdict=document.getElementById('gsrVerdict');
  if(verdict) verdict.style.display='none';

  var banner=document.getElementById('gsrBanner');
  if(!banner) return;
  banner.style.display='block';
  banner.style.background='rgba(85,170,255,.06)';
  banner.style.border='1px solid rgba(85,170,255,.18)';
  banner.style.color='#b9d9f4';

  var relation='near the center of its 10-year distribution';
  if(percentile!=null && percentile>=80) relation='high relative to its 10-year distribution; silver is relatively cheap versus gold compared with most observations in the sample';
  else if(percentile!=null && percentile<=20) relation='low relative to its 10-year distribution; gold is relatively cheap versus silver compared with most observations in the sample';

  var meanText=(pctDiff==null)?'':(' It is '+Math.abs(pctDiff).toFixed(1)+'% '+(pctDiff>=0?'above':'below')+' the 10-year mean.');
  banner.innerHTML='<b>Historical context:</b> The Gold/Silver Ratio is '+relation+'.'+meanText
    +' This is descriptive relative-value context, not a mean-reversion or trade signal.';

  var meta=document.getElementById('gsrMeta');
  if(meta) meta.textContent='Source: '+((d.meta&&d.meta.source)||'Yahoo Finance')+' · 10-year lookback · Updated '+new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
}


function renderGsrChart(d){
  var canvas = document.getElementById('gsrChart');
  if(!canvas) return;
  if(_gsrChart){ _gsrChart.destroy(); _gsrChart = null; }
  canvas.style.opacity = '1';

  // Pick dataset by period
  var monthly = d.monthly || [];
  var now = new Date();
  var cutoff;
  if(_gsrPeriod === 'ytd')      cutoff = new Date(now.getFullYear(), 0, 1);
  else if(_gsrPeriod === '1y')  cutoff = new Date(now.getFullYear()-1, now.getMonth(), 1);
  else if(_gsrPeriod === '5y')  cutoff = new Date(now.getFullYear()-5, now.getMonth(), 1);
  else if(_gsrPeriod === '10y') cutoff = new Date(now.getFullYear()-10, now.getMonth(), 1);
  else cutoff = new Date('1990-01-01');

  var useDailyPeriod = (_gsrPeriod === '1y' || _gsrPeriod === 'ytd') && d.daily_1y && d.daily_1y.length;
  var source = useDailyPeriod
    ? d.daily_1y.filter(function(p){ return new Date(p.date) >= cutoff; })
    : monthly.filter(function(p){ return new Date(p.date) >= cutoff; });

  var labels = source.map(function(p){ return p.date; });
  var values = source.map(function(p){ return p.ratio; });
  var mean   = d.mean;
  var meanArr= values.map(function(){ return mean; });
  var hi1sd  = values.map(function(){ return mean + d.std; });
  var lo1sd  = values.map(function(){ return mean - d.std; });

  // Format labels nicely
  var fmtLabel = function(dateStr){
    var dt = new Date(dateStr);
    return useDailyPeriod
      ? dt.toLocaleDateString('en-US',{month:'short',day:'numeric'})
      : dt.toLocaleDateString('en-US',{year:'numeric',month:'short'});
  };
  var displayLabels = labels.map(fmtLabel);

  var ctx = canvas.getContext('2d');

  var step = Math.max(1, Math.floor(displayLabels.length / 10));

  _gsrChart = new Chart(canvas, {
    type: 'line',
    data:{
      labels: displayLabels,
      datasets:[
        // ±1 std dev upper bound (invisible, just for fill)
        {
          label: '+1σ',
          data: hi1sd,
          borderWidth: 0, pointRadius: 0,
          backgroundColor: 'rgba(255,255,255,0.03)',
          fill: '+1',  // fill to next dataset (lo1sd)
        },
        // ±1 std dev lower bound
        {
          label: '−1σ',
          data: lo1sd,
          borderWidth: 0, pointRadius: 0,
          borderDash: [],
          backgroundColor: 'rgba(74,158,255,0.04)',
          fill: false,
        },
        // Mean line
        {
          label: d.n_years+'Y Mean ('+mean.toFixed(1)+')',
          data: meanArr,
          borderColor: 'rgba(74,158,255,0.6)',
          borderWidth: 2,
          borderDash: [8, 4],
          pointRadius: 0,
          fill: false,
          tension: 0,
        },
        // Ratio line — per-segment color: silver when above mean, gold when below
        {
          label: 'Gold/Silver Ratio',
          data: values,
          segment: {
            borderColor: function(segCtx){
              var avg = (segCtx.p0.parsed.y + segCtx.p1.parsed.y) / 2;
              return avg > mean ? '#94a3b8' : '#f59e0b';
            },
            backgroundColor: function(segCtx){
              var avg = (segCtx.p0.parsed.y + segCtx.p1.parsed.y) / 2;
              return avg > mean ? 'rgba(148,163,184,0.10)' : 'rgba(245,158,11,0.10)';
            },
          },
          borderWidth: 2.5,
          pointRadius: 0,
          pointHoverRadius: 5,
          fill: true,
          tension: 0.3,
        },
      ]
    },
    options:{
      responsive: true, maintainAspectRatio: false,
      interaction:{ mode:'index', intersect:false },
      plugins:{
        legend:{
          display: true,
          position: 'top',
          align: 'end',
          labels:{ color:'#475569', font:{size:10,weight:'700'}, boxWidth:20, padding:14,
            filter: function(item){ return item.text !== '+1σ' && item.text !== '−1σ'; }
          }
        },
        tooltip:{
          backgroundColor:'rgba(10,14,33,0.92)',
          borderColor:'rgba(255,255,255,0.08)', borderWidth:1,
          titleColor:'#94a3b8', bodyColor:'#e2e8f0', padding:10,
          callbacks:{
            label: function(ctx){
              if(ctx.dataset.label.includes('σ')) return null;
              if(ctx.dataset.label.includes('Mean'))
                return '  Mean: ' + ctx.raw.toFixed(2);
              var v = ctx.raw;
              var dev = v - mean;
              return ['  Ratio: ' + v.toFixed(2),
                      '  vs Mean: '+(dev>0?'+':'')+dev.toFixed(2)];
            },
            filter: function(item){ return item.dataset.label !== '+1σ' && item.dataset.label !== '−1σ'; }
          }
        }
      },
      scales:{
        x:{
          grid:{color:'rgba(255,255,255,0.04)'}, border:{color:'transparent'},
          ticks:{
            color:'#475569', maxRotation:0, maxTicksLimit:10,
            callback: function(val, idx){ return idx % step === 0 ? displayLabels[idx] : ''; }
          }
        },
        y:{
          grid:{color:'rgba(255,255,255,0.04)'}, border:{color:'transparent'},
          ticks:{color:'#475569', callback:function(v){ return v.toFixed(0)+'x'; }},
          title:{display:true, text:'Oz of Silver per Oz of Gold', color:'#334155', font:{size:10}}
        }
      }
    }
  });

  document.getElementById('gsrMeta').textContent =
    'Gold (GC=F) ÷ Silver (SI=F) · Monthly closes · Mean computed over '
    + d.n_years + ' years (' + d.start_date + ' – ' + d.end_date + ') · Source: CME via Yahoo Finance';
}

