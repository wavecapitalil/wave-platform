/* Shared catalyst dots (Equity Research + Catalyst Calendar).
 * Equity Research calls drawDot for the selected event. The calendar page
 * draws every dot and shows the one-line description only in the hover tooltip.
 */
(function(){
  'use strict';
  var COLORS = {positive:'#60d5b0', negative:'#ef8590', neutral:'#a6b3c3'};
  var TYPES = {
    earnings:['Earnings','דוחות'],
    governance:['Item 5.02','סעיף 5.02'],
    leadership:['Officer change','שינוי נושא משרה'],
    activist:['13D','13D'],
    buyback:['Buyback','רכישה עצמית'],
    fda:['FDA','FDA'],
    transactions:['Transaction','עסקה'],
    restructuring:['Restructuring','ארגון מחדש'],
    regulatory:['Regulatory','רגולציה'],
    guidance:['Guidance','תחזית'],
    products:['Product','מוצר'],
    partnerships:['Partnership','שותפות'],
    capital_returns:['Capital return','החזר הון'],
    news:['News','חדשות']
  };
  var GUIDE = 'Catalyst Calendar keeps filings, headlines, earnings dates and FDA decisions that the sources actually returned. Empty sources are left empty.\n'
    + 'Reaction window: percent change from the close before the event session to the close three trading sessions after that session. Above +1.0% is green (rally). Below -1.0% is red (drop). Inside ±1.0%, a future event, or an unfinished window is gray and unclassified. The change is not a causal claim.\n'
    + 'SEC dates with no clock, and timestamps at or after 16:00 America/New_York, align to the next session. The cutoff does not model early closes. Earnings-calendar dates and FDA status dates are used as published. A two-date earnings range is dropped.\n'
    + 'Upcoming dots sit at the latest close on their own date so they remain visible; that height is not a forecast. Item 5.02 is an officer, director or compensation filing, not a named appointment. Buyback rows matched a repurchase phrase. Schedule 13D rows are full-text hits and do not include a stake size. News color does not come from the headline.\n'
    + 'Per-ticker source status and the retrieval time are recorded on this page when a ticker loads.';
  var state = {request:0, filter:'all', data:null, chart:null};

  function he(){return typeof getLang==='function' && getLang()==='he';}
  function label(en, heText){return he()?heText:en;}
  function typeLabel(key){
    var pair = TYPES[key];
    return pair ? (he()?pair[1]:pair[0]) : String(key||'');
  }
  function typeLabelEn(key){return (TYPES[key]&&TYPES[key][0]) || String(key||'');}
  function toneOf(outcome){return outcome==='positive'||outcome==='negative'?outcome:'neutral';}
  function color(tone){return COLORS[tone]||COLORS.neutral;}
  function finite(value){return typeof value==='number' && Number.isFinite(value);}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function el(id){return document.getElementById(id);}
  function drawDot(ctx, x, y, tone, opts){
    opts = opts||{};
    var fill = color(tone);
    ctx.save();
    if(opts.stemTo!=null){
      ctx.strokeStyle = fill;
      ctx.setLineDash([3,4]);
      ctx.beginPath();
      ctx.moveTo(x, opts.stemTo);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, opts.radius||4, 0, Math.PI*2);
    ctx.fill();
    if(opts.ring){
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0d1524';
      ctx.stroke();
    }
    ctx.restore();
  }
  var outsideBound = false;
  function bindPointer(canvas, chart){
    function hit(event){
      var rect = canvas.getBoundingClientRect();
      var x = event.clientX - rect.left;
      var y = event.clientY - rect.top;
      var best = null;
      var bestDistance = 22 * 22;
      (chart.$dotPositions||[]).forEach(function(point){
        if(!point || !point.visible || !point.row || !point.row.line) return;
        var dx = point.px - x;
        var dy = point.py - y;
        var distance = dx * dx + dy * dy;
        if(distance <= bestDistance){best = point; bestDistance = distance;}
      });
      return best;
    }
    function show(event){
      var best = hit(event);
      if(!best){hideTip(); return;}
      showTip(best.row, event.clientX, event.clientY);
    }
    var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    canvas.style.touchAction = 'manipulation';
    canvas.onpointermove = function(event){if(fine) show(event);};
    canvas.onpointerup = function(event){show(event);};
    canvas.onpointerleave = function(){if(fine) hideTip();};
    canvas.onpointercancel = function(){if(fine) hideTip();};
    if(!outsideBound){
      outsideBound = true;
      document.addEventListener('pointerdown', function(event){
        var node = el('wave-catalyst-tip');
        if(!node || node.hidden) return;
        if(event.target && event.target.closest && event.target.closest('canvas')) return;
        hideTip();
      });
    }
  }
  function tipNode(){
    var node = el('wave-catalyst-tip');
    if(!node){
      node = document.createElement('div');
      node.id = 'wave-catalyst-tip';
      node.setAttribute('role','tooltip');
      node.hidden = true;
      document.body.appendChild(node);
    }
    return node;
  }
  function hideTip(){var node = el('wave-catalyst-tip'); if(node) node.hidden = true;}
  function showTip(catalyst, clientX, clientY){
    if(!catalyst || !catalyst.line){hideTip(); return;}
    var node = tipNode();
    node.replaceChildren();
    var pip = document.createElement('i');
    pip.style.background = color(toneOf(catalyst.outcome));
    var text = document.createElement('span');
    text.textContent = catalyst.line;
    node.append(pip, text);
    node.hidden = false;
    var left = clientX + 14;
    var top = clientY + 16;
    node.style.left = left + 'px';
    node.style.top = top + 'px';
    var rect = node.getBoundingClientRect();
    if(rect.right > window.innerWidth - 8) node.style.left = Math.max(8, clientX - rect.width - 12) + 'px';
    if(rect.bottom > window.innerHeight - 8) node.style.top = Math.max(8, clientY - rect.height - 12) + 'px';
  }
  function money(value, currency){
    if(!finite(value)) return '';
    if(currency && /^[A-Z]{3}$/.test(currency)){
      try{return new Intl.NumberFormat('en-US',{style:'currency',currency:currency,maximumFractionDigits:2}).format(value);}catch(e){}
    }
    return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value);
  }
  function formatDate(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))) return '—';
    return new Date(value+'T12:00:00Z').toLocaleDateString(he()?'he-IL':'en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  }
  function outcomeText(row){
    if((row.outcome==='positive'||row.outcome==='negative'||row.outcome==='flat') && finite(row.reaction_pct)){
      return (row.reaction_pct>0?'+':'')+row.reaction_pct.toFixed(1)+'%';
    }
    if(row.outcome==='upcoming') return t('catalysts.upcoming','Upcoming');
    if(row.outcome==='pending') return t('catalysts.pending','Pending');
    return '—';
  }
  function visibleCatalysts(data){
    return (data.catalysts||[]).filter(function(row){
      return state.filter==='all' || row.type===state.filter;
    }).filter(function(row){
      return Number.isInteger(row.plot_index) && finite(row.plot_close) && row.plot_index>=0 && row.plot_index<(data.points||[]).length;
    });
  }
  function destroy(){
    hideTip();
    if(state.chart){state.chart.destroy(); state.chart=null;}
  }
  function mount(canvas, model){
    destroy();
    if(!canvas || !window.Chart) return null;
    var points = model.points||[];
    var catalysts = model.catalysts||[];
    var closes = points.map(function(point){return finite(point.close)?point.close:null;});
    var real = closes.filter(finite);
    var scatter = catalysts.map(function(row, index){
      var stack = 0;
      for(var i=0;i<index;i++) if(catalysts[i].plot_index===row.plot_index) stack++;
      return {x: points[row.plot_index].date, y: row.plot_close * (1 + 0.012 * stack), catalyst: row};
    });
    var positions = [];
    var plugin = {id:'waveCatalystDots', afterDatasetsDraw:function(chart){
      var area = chart.chartArea;
      positions = scatter.map(function(point){
        var row = point.catalyst;
        var px = chart.scales.x.getPixelForValue(row.plot_index);
        var py = chart.scales.y.getPixelForValue(point.y);
        return {px:px, py:py, row:row, visible:px>=area.left-8 && px<=area.right+8 && py>=area.top-8 && py<=area.bottom+8};
      });
      chart.$dotPositions = positions;
      positions.forEach(function(point){
        if(!point.visible || !Number.isFinite(point.px) || !Number.isFinite(point.py)) return;
        drawDot(chart.ctx, point.px, point.py, toneOf(point.row.outcome), {radius:5, ring:true});
      });
    }};
    state.chart = new Chart(canvas, {
      type:'line',
      data:{
        labels: points.map(function(point){return point.date;}),
        datasets:[
          {label: model.symbol||'', data: closes, borderColor:'#63b3ff', borderWidth:2, pointRadius:0, pointHitRadius:0, tension:0, spanGaps:false},
          {type:'scatter', data: scatter.map(function(point){return {x:point.x, y:point.y};}), pointRadius:0, pointHoverRadius:0, pointHitRadius:12, borderWidth:0}
        ]
      },
      plugins:[plugin],
      options:{
        responsive:true,
        maintainAspectRatio:false,
        animation:false,
        interaction:{mode:'nearest', intersect:true},
        plugins:{
          legend:{display:false},
          tooltip:{enabled:false}
        },
        scales:{
          x:{type:'category', grid:{display:false}, ticks:{color:'#9cacc2', maxTicksLimit:6, maxRotation:0, autoSkipPadding:12, callback:function(value){var label=this.getLabelForValue(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(String(label||'')))return label;return new Date(label+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',year:'2-digit',timeZone:'UTC'});}}},
          y:{
            suggestedMin: real.length?Math.min.apply(null, real):undefined,
            suggestedMax: real.length?Math.max.apply(null, real)+(Math.max.apply(null, real)-Math.min.apply(null, real))*0.08:undefined,
            grid:{color:'rgba(148,163,184,.09)'},
            ticks:{color:'#9cacc2', maxTicksLimit:6, callback:function(value){return money(value, model.currency);}}
          }
        }
      }
    });
    bindPointer(canvas, state.chart);
    return state.chart;
  }
  function setStatus(text, retrySymbol){
    var node = el('ccStatus');
    if(!node) return;
    node.replaceChildren();
    if(text) node.appendChild(document.createTextNode(text));
    if(retrySymbol){
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'cc-retry';
      button.textContent = t('catalysts.retry','Retry');
      button.addEventListener('click', function(){load(retrySymbol);});
      node.appendChild(document.createTextNode(' '));
      node.appendChild(button);
    }
  }
  function render(){
    var data = state.data;
    var host = el('ccChart');
    var body = el('ccBody');
    if(!data || !host || !body) return;
    var types = [];
    (data.catalysts||[]).forEach(function(row){if(types.indexOf(row.type)<0) types.push(row.type);});
    if(state.filter!=='all' && types.indexOf(state.filter)<0) state.filter = 'all';
    var filters = '<button type="button" data-cc-filter="all" aria-pressed="'+(state.filter==='all')+'">'+esc(t('catalysts.all','All'))+'</button>'
      + types.map(function(key){return '<button type="button" data-cc-filter="'+esc(key)+'" aria-pressed="'+(state.filter===key)+'">'+esc(typeLabel(key))+'</button>';}).join('');
    el('ccFilters').innerHTML = filters;
    el('ccLegendRally').textContent = t('catalysts.rally','Rally');
    el('ccLegendDrop').textContent = t('catalysts.drop','Drop');
    el('ccLegendOpen').textContent = t('catalysts.open','Open');
    var shown = (data.catalysts||[]).filter(function(row){return state.filter==='all' || row.type===state.filter;});
    var head = '<thead><tr><th>'+esc(t('catalysts.date','Date'))+'</th><th>'+esc(t('catalysts.type','Type'))+'</th><th>'+esc(t('catalysts.symbol','Ticker'))+'</th><th>'+esc(t('catalysts.outcome','Outcome'))+'</th></tr></thead>';
    var rows = shown.map(function(row){
      var tone = toneOf(row.outcome);
      return '<tr><td>'+esc(formatDate(row.date))+'</td><td>'+esc(typeLabel(row.type))+'</td><td>'+esc(row.ticker||data.symbol)+'</td><td class="cc-outcome '+tone+'"><i class="cc-pip '+tone+'"></i> '+esc(outcomeText(row))+'</td></tr>';
    }).join('');
    el('ccTable').innerHTML = head + '<tbody>'+(rows||'<tr><td colspan="4" class="cc-empty">'+esc(t('catalysts.empty','No catalysts'))+'</td></tr>')+'</tbody>';
    setStatus('');
    mount(host, {symbol:data.symbol, currency:data.currency, points:data.points, catalysts:visibleCatalysts(data)});
  }
  function record(data){
    if(!window.WaveSources || !data) return;
    var lines = [data.methodology||GUIDE, ''];
    (data.sources||[]).forEach(function(source){
      lines.push(source.name+': '+source.status+' · '+source.rows);
    });
    if(data.fetched_at) lines.push('Retrieved '+data.fetched_at);
    var links = (data.catalysts||[]).filter(function(row){return row.url;}).slice(0, 40).map(function(row){
      return {title: typeLabelEn(row.type)+' · '+row.date, url: row.url};
    });
    WaveSources.record('catalysts:'+data.symbol, 'Catalyst Calendar · '+data.symbol, lines.join('\n'), links);
  }
  function load(symbol){
    symbol = String(symbol||'').trim().toUpperCase();
    var input = el('ccTicker');
    if(input) input.value = symbol;
    if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)){
      destroy();
      state.data = null;
      setStatus(t('catalysts.unavailable','Catalysts unavailable'));
      return;
    }
    var id = ++state.request;
    setStatus(t('catalysts.loading','Loading'));
    var controller = typeof AbortController==='function' ? new AbortController() : null;
    var timer = setTimeout(function(){if(controller) controller.abort();}, 30000);
    var root = (typeof API==='string') ? API : '';
    fetch(root+'/api/catalysts?symbol='+encodeURIComponent(symbol), controller?{signal:controller.signal}:undefined)
      .then(function(response){return response.json().then(function(body){return {ok:response.ok, body:body};});})
      .then(function(result){
        if(id!==state.request) return;
        if(!result.ok || !result.body || !Array.isArray(result.body.points) || result.body.points.length<2) throw new Error('unavailable');
        state.data = result.body;
        state.filter = 'all';
        record(result.body);
        render();
      })
      .catch(function(){
        if(id!==state.request) return;
        state.data = null;
        destroy();
        if(window.WaveSources) WaveSources.record('catalysts:'+symbol, 'Catalyst Calendar · '+symbol, 'Request failed. No catalysts or prices were substituted.');
        setStatus(t('catalysts.unavailable','Catalysts unavailable'), symbol);
      })
      .finally(function(){clearTimeout(timer);});
  }
  function open(){
    var input = el('ccTicker');
    var symbol = String((input&&input.value)||'AAPL').trim().toUpperCase()||'AAPL';
    if(state.data && state.data.symbol===symbol){render(); return;}
    load(symbol);
  }
  function bind(){
    var form = el('ccForm');
    if(!form || form.dataset.bound==='1') return;
    form.dataset.bound = '1';
    form.addEventListener('submit', function(event){
      event.preventDefault();
      load(el('ccTicker').value);
    });
    var page = el('page-catalysts');
    if(!page) return;
    page.addEventListener('click', function(event){
      var quick = event.target.closest('[data-cc-symbol]');
      if(quick){load(quick.getAttribute('data-cc-symbol')); return;}
      var filter = event.target.closest('[data-cc-filter]');
      if(filter && state.data){state.filter = filter.getAttribute('data-cc-filter'); render();}
    });
  }
  bind();
  var previous = window.onLangChange;
  window.onLangChange = function(lang){
    if(typeof previous==='function') previous(lang);
    if(state.data && el('page-catalysts') && el('page-catalysts').classList.contains('active')) render();
  };
  if(window.WaveSources){
    WaveSources.record('guide:catalysts', 'Catalyst Calendar', GUIDE, [
      {title:'SEC EDGAR', url:'https://www.sec.gov/edgar'},
      {title:'EDGAR full text', url:'https://efts.sec.gov/LATEST/search-index'},
      {title:'openFDA Drugs@FDA', url:'https://open.fda.gov/apis/drug/drugsfda/'},
      {title:'Yahoo Finance', url:'https://finance.yahoo.com/'}
    ]);
  }
  window.WaveCatalystChart = {colors:COLORS, color:color, drawDot:drawDot, bindPointer:bindPointer, hideTip:hideTip};
  window.WaveCatalysts = {open:open, load:load};
})();
