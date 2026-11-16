/* UBER TRACKER. Plots the checked-in public bundle. Empty series stay empty. */
(function(root){
  'use strict';
  var SVG = 'http://www.w3.org/2000/svg';
  var bundle = null;
  var host = null;

  function he(){return true;}
  function L(h, e){return he() ? h : e;}
  function bdi(value){
    var node = document.createElement('bdi');
    node.dir = 'ltr';
    node.textContent = value == null || value === '' ? '—' : String(value);
    return node;
  }
  function el(tag, cls, text){
    var node = document.createElement(tag);
    if(cls) node.className = cls;
    if(text != null){
      if(/[\u0590-\u05FF]/.test(text)){
        node.dir = 'rtl';
        fillHebrew(node, text);
      }else{
        node.textContent = text;
        if(/[A-Za-z]/.test(text)) node.dir = 'ltr';
      }
    }
    return node;
  }
  function fillHebrew(node, text){
    var re = /(https?:\/\/\S+|\$[\d,.]+(?:[–-][\d,.]+)?%?|(?<![A-Za-z])\d{1,2}:\d{2}(?!\d)|(?<![A-Za-z])\d{4}-\d{2}(?:-\d{2})?(?!\d)|(?<![A-Za-z])[+-]?\d[\d,]*(?:\.\d+)?%?(?![A-Za-z]))/g;
    var last = 0, match;
    while((match = re.exec(text))){
      if(match.index > last) node.appendChild(document.createTextNode(text.slice(last, match.index)));
      node.appendChild(bdi(match[1]));
      last = match.index + match[1].length;
    }
    if(last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
  }
  function fmt(value, digits){
    if(value == null || value === '') return '—';
    var n = Number(value);
    if(!isFinite(n)) return '—';
    return n.toLocaleString('en-US', {maximumFractionDigits: digits == null ? 1 : digits, minimumFractionDigits: digits == null ? 0 : digits});
  }
  function signed(value, digits){
    if(value == null || value === '') return '—';
    var n = Number(value);
    return (n > 0 ? '+' : '') + fmt(n, digits);
  }
  function asset(file){
    return (location.pathname.indexOf('/research/') >= 0 ? '../' : '') + 'data/uber-tracker/' + file;
  }
  function dataUrl(){return asset('bundle.json');}
  function svg(name, attrs){
    var node = document.createElementNS(SVG, name);
    Object.keys(attrs || {}).forEach(function(key){node.setAttribute(key, attrs[key]);});
    if(name === 'svg'){
      node.setAttribute('direction', 'ltr');
      node.style.direction = 'ltr';
      node.style.unicodeBidi = 'isolate';
    }
    return node;
  }
  function svgText(attrs, text){
    var node = svg('text', attrs);
    if(text && /[\u0590-\u05FF]/.test(text)){
      node.setAttribute('direction', 'rtl');
      node.setAttribute('unicode-bidi', 'plaintext');
    }
    node.textContent = text;
    return node;
  }
  function titleOf(chart){return L(chart.title_he, chart.title_en);}

  function card(parent, wide){
    var node = el('article', 'ut-card' + (wide ? ' ut-wide' : ''));
    parent.appendChild(node);
    return node;
  }
  function heading(parent, title, gloss){
    parent.appendChild(el('h3', null, title));
    if(gloss == null || gloss === '') return;
    parent.appendChild(gloss.nodeType ? gloss : el('p', 'ut-gloss', gloss));
  }
  function badge(parent, cls, text){
    parent.appendChild(el('span', 'ut-badge ' + cls, text));
  }
  function table(headers, rows){
    var wrap = el('div', 'ut-scroll');
    var tableNode = document.createElement('table');
    var head = document.createElement('thead');
    var hr = document.createElement('tr');
    headers.forEach(function(item){
      var cell = document.createElement('th');
      cell.textContent = item[0];
      if(/[A-Za-z]/.test(item[0]) && !/[\u0590-\u05FF]/.test(item[0])) cell.dir = 'ltr';
      if(item[1]) cell.className = 'num';
      hr.appendChild(cell);
    });
    head.appendChild(hr);
    var body = document.createElement('tbody');
    rows.forEach(function(row){
      var tr = document.createElement('tr');
      row.forEach(function(cell, index){
        var td = document.createElement('td');
        if(headers[index][1]) td.className = 'num';
        if(cell && cell.nodeType) td.appendChild(cell);
        else td.appendChild(bdi(cell));
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    tableNode.appendChild(head);
    tableNode.appendChild(body);
    wrap.appendChild(tableNode);
    return wrap;
  }

  function emptyPlot(label){
    var plot = svg('svg', {viewBox:'0 0 640 220', role:'img'});
    var title = svg('title');
    title.textContent = label;
    plot.appendChild(title);
    plot.appendChild(svg('rect', {x:48, y:18, width:560, height:160, class:'ut-empty', fill:'none', stroke:'#64748b', 'stroke-dasharray':'5 5', rx:8}));
    [40, 80, 120, 160].forEach(function(y){
      plot.appendChild(svg('line', {x1:48, y1:y, x2:608, y2:y, stroke:'#334155', 'stroke-width':1}));
    });
    plot.appendChild(svgText({x:328, y:110, 'text-anchor':'middle', fill:'#cbd5e1', 'font-size':16}, L('אין עדיין נתונים', 'No figures yet')));
    return plot;
  }

  function linePlot(series, labels){
    var plot = svg('svg', {viewBox:'0 0 680 250', role:'img'});
    var values = [];
    series.forEach(function(s){s.points.forEach(function(p){if(p != null) values.push(p);});});
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var pad = (max - min) * 0.12 || 1;
    min -= pad; max += pad;
    var left = 62, right = 16, top = 16, bottom = 36, width = 680 - left - right, height = 250 - top - bottom;
    function y(value){return top + (max - value) / (max - min) * height;}
    function x(index){return left + (labels.length === 1 ? width / 2 : index * width / (labels.length - 1));}
    for(var tick = 0; tick < 4; tick++){
      var value = min + (max - min) * tick / 3;
      var yy = y(value);
      plot.appendChild(svg('line', {x1:left, y1:yy, x2:680 - right, y2:yy, stroke:'#243044'}));
      var label = svg('text', {x:left - 8, y:yy + 4, 'text-anchor':'end', fill:'#94a3b8', 'font-size':11});
      label.textContent = fmt(value / 1000, 0);
      plot.appendChild(label);
    }
    series.forEach(function(s){
      var d = '';
      var started = false;
      s.points.forEach(function(point, index){
        if(point == null){started = false; return;}
        d += (started ? 'L' : 'M') + x(index) + ' ' + y(point) + ' ';
        started = true;
      });
      plot.appendChild(svg('path', {d:d, fill:'none', stroke:s.color, 'stroke-width':2.4}));
      s.points.forEach(function(point, index){
        if(point == null) return;
        plot.appendChild(svg('circle', {cx:x(index), cy:y(point), r:3, fill:s.color}));
      });
    });
    labels.forEach(function(label, index){
      if(index % 2 && index !== labels.length - 1) return;
      var text = svg('text', {x:x(index), y:232, 'text-anchor':'middle', fill:'#94a3b8', 'font-size':11});
      text.textContent = label.slice(2);
      plot.appendChild(text);
    });
    var title = svg('title');
    title.textContent = series.map(function(s){return s.name;}).join(', ');
    plot.appendChild(title);
    return plot;
  }

  function barPlot(rows){
    var plot = svg('svg', {viewBox:'0 0 680 230', role:'img'});
    var max = Math.max.apply(null, rows.map(function(row){return row.value;}));
    var left = 24, base = 190, width = 90, gap = 150;
    rows.forEach(function(row, index){
      var h = row.value / max * 150;
      var x = left + index * gap;
      plot.appendChild(svg('rect', {x:x, y:base - h, width:width, height:h, rx:6, fill:'#4a9eff'}));
      var value = svg('text', {x:x + width / 2, y:base - h - 8, 'text-anchor':'middle', fill:'#e2e8f0', 'font-size':12});
      value.textContent = fmt(row.value, 0);
      plot.appendChild(value);
      var label = svg('text', {x:x + width / 2, y:210, 'text-anchor':'middle', fill:'#94a3b8', 'font-size':12});
      label.textContent = row.label;
      plot.appendChild(label);
    });
    var title = svg('title');
    title.textContent = rows.map(function(row){return row.label + ' ' + fmt(row.value, 0);}).join(', ');
    plot.appendChild(title);
    return plot;
  }

  function bonusPlot(rows){
    var plot = svg('svg', {viewBox:'0 0 680 280', role:'img'});
    var max = Math.max.apply(null, rows.map(function(row){return row.guarantee_usd;}));
    rows.forEach(function(row, index){
      var y = 16 + index * 26;
      var width = row.guarantee_usd / max * 430;
      plot.appendChild(svg('text', {x:168, y:y + 12, 'text-anchor':'end', fill:'#cbd5e1', 'font-size':12}));
      plot.lastChild.textContent = row.city;
      plot.appendChild(svg('rect', {x:178, y:y, width:width, height:16, rx:4, fill:'#4a9eff'}));
      var value = svg('text', {x:186 + width, y:y + 12, fill:'#e2e8f0', 'font-size':12});
      value.textContent = '$' + fmt(row.guarantee_usd, 0);
      plot.appendChild(value);
    });
    var title = svg('title');
    title.textContent = L('בונוס מובטח לנהג לפי עיר', 'Driver guarantee by city');
    plot.appendChild(title);
    return plot;
  }

  function chartArticle(parent, chart, plot, wide){
    var node = card(parent, wide);
    badge(node, 'ut-un', L('לא נצפה', 'Unobserved'));
    heading(node, titleOf(chart), null);
    node.appendChild(plot || emptyPlot(titleOf(chart)));
    return node;
  }

  function registerSources(data){
    if(!root.WaveSources && !root.WaveDataLog) return;
    var text = (data.methodology || []).map(function(item){
      var parts = (he() ? item.calc_he : item.calc_en).concat(he() ? item.freq_he : item.freq_en);
      return L(item.title_he, item.title_en) + '\n' + parts.map(function(part){return part.text || '';}).join('');
    }).join('\n\n');
    var links = [];
    (data.methodology || []).forEach(function(item){
      (item.links || []).forEach(function(part){
        if(part.url && /^https?:/i.test(part.url)) links.push({title: part.text || part.url, url: part.url});
      });
    });
    if(root.WaveSources) root.WaveSources.record('uber-tracker', L('UBER TRACKER · מקורות ומתודולוגיה', 'UBER TRACKER · sources and methodology'), text, links);
    if(root.WaveDataLog){
      (data.methodology || []).forEach(function(item){
        var parts = he() ? item.calc_he : item.calc_en;
        var freq = he() ? item.freq_he : item.freq_en;
        var note = (parts || []).concat(freq || []).map(function(part){return part.text || '';}).join('');
        var itemLinks = (item.links || []).filter(function(part){return part.url && /^https?:/i.test(part.url);}).map(function(part){return {title: part.text || part.url, url: part.url};});
        root.WaveDataLog.record('uber-tracker:' + item.id, {section:'UBER TRACKER', metric:L(item.title_he, item.title_en), source:itemLinks.length ? itemLinks[0].title : '', pulledAt:'', notes:note, links:itemLinks, skipSources:true});
      });
    }
  }

  function render(data){
    host.replaceChildren();
    host.className = 'ut';
    host.dir = he() ? 'rtl' : 'ltr';
    host.lang = he() ? 'he' : 'en';
    registerSources(data);

    var head = el('header');
    head.appendChild(el('div', 'ut-kicker', L('מחקרים', 'Research')));
    var h1 = el('h1');
    h1.appendChild(bdi('UBER TRACKER'));
    head.appendChild(h1);
    head.appendChild(el('p', 'ut-gloss', L('מבט אחד על Uber Drive ועל Uber Eats.', 'One view of Uber Drive and Uber Eats.')));
    host.appendChild(head);

    var read = el('section', 'ut-read');
    badge(read, 'ut-inf', L('הסקה מהפרוקסי', 'Inference from proxies'));
    var strong = el('strong');
    strong.appendChild(document.createTextNode(L(data.inference.label_he, data.inference.label_en)));
    read.appendChild(strong);
    read.appendChild(el('p', null, L(data.inference.line_he, data.inference.line_en)));
    host.appendChild(read);

    var facts = card(host, true);
    badge(facts, 'ut-fact', L('עובדה', 'Fact'));
    heading(facts, L('הדפסת Q3 2026', 'Q3 2026 print'), 'Exhibit 99.1 · UBER');
    var grid = el('div', 'ut-facts');
    data.sec_print.forEach(function(row){
      var metric = el('div', 'ut-metric');
      metric.appendChild(el('div', 'ut-gloss', L(row.label_he, row.label_en)));
      var value = el('b');
      value.appendChild(bdi(fmt(row.q3_2026, row.unit === 'USD' ? 2 : 0)));
      metric.appendChild(value);
      var change = el('div', 'ut-gloss');
      change.appendChild(document.createTextNode(L('מול ', 'vs ') ));
      change.appendChild(bdi(fmt(row.q3_2025, row.unit === 'USD' ? 2 : 0)));
      change.appendChild(document.createTextNode(' · '));
      change.appendChild(bdi(signed(row.yoy_pct, 0) + '%'));
      if(row.cc_yoy_pct != null){
        change.appendChild(document.createTextNode(L(' · מטבע קבוע ', ' · constant currency ')));
        change.appendChild(bdi(signed(row.cc_yoy_pct, 0) + '%'));
      }
      metric.appendChild(change);
      grid.appendChild(metric);
    });
    facts.appendChild(grid);
    var guide = el('p');
    guide.dir = he() ? 'rtl' : 'ltr';
    guide.appendChild(document.createTextNode(L('תחזית החברה ל-Q4, לא קונצנזוס: הזמנות ברוטו ', 'Company Q4 outlook, not consensus: Gross Bookings ')));
    guide.appendChild(bdi('$' + data.q4_guide.low_usd_b + '–' + data.q4_guide.high_usd_b + 'B'));
    guide.appendChild(document.createTextNode(L(', צמיחה במטבע קבוע ', ', constant-currency growth ')));
    guide.appendChild(bdi(data.q4_guide.cc_yoy_low_pct + '–' + data.q4_guide.cc_yoy_high_pct + '%'));
    guide.appendChild(document.createTextNode('.'));
    facts.appendChild(guide);
    host.appendChild(facts);

    host.appendChild(el('h2', null, 'נסיעות · Uber Drive'));

    var observed = el('div', 'ut-grid');
    var nycCard = card(observed, true);
    badge(nycCard, 'ut-fact', L('עובדה', 'Fact'));
    var nyc = data.series.nyc_hvfhv.observations;
    heading(nycCard, L('נסיעות HVFHV ביום, ניו יורק', 'NYC HVFHV trips per day'), 'Uber מול Lyft · ' + nyc[0].month + '–' + nyc[nyc.length-1].month);
    nycCard.appendChild(linePlot([
      {name:'Uber', color:'#4a9eff', points:nyc.map(function(row){return row.uber_trips_per_day;})},
      {name:'Lyft', color:'#fb923c', points:nyc.map(function(row){return row.lyft_trips_per_day;})}
    ], nyc.map(function(row){return row.month;})));
    nycCard.appendChild(el('p', 'ut-gloss', L('כחול: Uber. כתום: Lyft. הציר ביחידות של אלף נסיעות ביום.', 'Blue: Uber. Orange: Lyft. The axis is in thousands of trips per day.')));
    nycCard.appendChild(table(
      [[L('חודש', 'Month'), true], ['Uber', true], ['Lyft', true], [L('נתח Uber', 'Uber share'), true], [L('מול שנה', 'YoY'), true]],
      nyc.map(function(row){return [row.month, fmt(row.uber_trips_per_day, 1), fmt(row.lyft_trips_per_day, 1), fmt(row.uber_share_pct, 1) + '%', row.uber_yoy_pct == null ? '—' : signed(row.uber_yoy_pct, 1) + '%'];})
    ));

    var laxCard = card(observed);
    badge(laxCard, 'ut-fact', L('עובדה', 'Fact'));
    var lax = data.series.lax_tnc.observations;
    heading(laxCard, L('נסיעות TNC ב-LAX', 'LAX TNC trips'), 'LAWA · ' + lax.map(function(row){return row.month;}).join(' · '));
    laxCard.appendChild(barPlot(lax.map(function(row){return {label:row.month, value:row.tnc_monthly};})));
    laxCard.appendChild(table(
      [[L('חודש', 'Month'), true], [L('נסיעות', 'Trips'), true], [L('מול שנה', 'YoY'), true], [L('מצטבר מול שנה', 'YTD YoY'), true]],
      lax.map(function(row){return [row.month, fmt(row.tnc_monthly, 0), row.yoy_pct == null ? '—' : signed(row.yoy_pct, 1) + '%', row.ytd_yoy_pct == null ? '—' : signed(row.ytd_yoy_pct, 1) + '%'];})
    ));

    var bonusCard = card(observed);
    badge(bonusCard, 'ut-fact', L('עובדה', 'Fact'));
    heading(bonusCard, L('מודעות בונוס לנהגים', 'Driver guarantee ads'), L('5 בנובמבר 2026', '5 November 2026'));
    var bonuses = data.series.driver_bonuses.observations;
    bonusCard.appendChild(bonusPlot(bonuses));
    bonusCard.appendChild(table(
      [[L('עיר', 'City'), false], [L('ערובה $', 'Guarantee $'), true], [L('נסיעות נדרשות', 'Trips required'), true], [L('חלון, ימים', 'Window, days'), true]],
      bonuses.map(function(row){return [row.city, fmt(row.guarantee_usd, 0), fmt(row.trips_required, 0), fmt(row.window_days, 0)];})
    ));
    host.appendChild(observed);

    var quoteGrid = el('div', 'ut-grid');
    ['drive_price_index', 'drive_eta', 'drive_surge', 'drive_tightness'].forEach(function(id){
      chartArticle(quoteGrid, data.charts[id], emptyPlot(titleOf(data.charts[id])), false);
    });
    var mobility = card(quoteGrid, true);
    badge(mobility, 'ut-un', L('לא דורג', 'Unscored'));
    heading(mobility, L('פאנל מול קונצנזוס Mobility', 'Panel versus Mobility consensus'), 'חם / בקו / קר');
    var slots = el('div', 'ut-facts');
    [['פאנל', '—'], ['קונצנזוס', '—'], ['הדפסה', signed(data.sec_print.filter(function(row){return row.metric === 'Mobility_GB_USD_m';})[0].yoy_pct, 0) + '% / ' + signed(data.sec_print.filter(function(row){return row.metric === 'Mobility_GB_USD_m';})[0].cc_yoy_pct, 0) + '% מט"ק']].forEach(function(pair){
      var slot = el('div', 'ut-metric');
      slot.appendChild(el('div', 'ut-gloss', pair[0]));
      var value = el('b');
      value.appendChild(bdi(pair[1]));
      slot.appendChild(value);
      slots.appendChild(slot);
    });
    mobility.appendChild(slots);
    host.appendChild(quoteGrid);

    host.appendChild(el('h2', null, 'Uber Eats · משלוחים'));
    var eatsIntro = el('div', 'ut-split');
    var customer = card(eatsIntro);
    heading(customer, L('לקוח', 'Customer'), L('אותה כתובת בית ומשרד בכל עיר', 'The same home and office address in each city'));
    var merchant = card(eatsIntro);
    heading(merchant, L('סוחר והיצע', 'Merchant and supply'), L('אותן ערים ואותם חלונות', 'The same cities and time windows'));
    host.appendChild(eatsIntro);

    var eatsGrid = el('div', 'ut-grid');
    ['eats_coverage', 'eats_eta', 'eats_cost', 'eats_promo', 'eats_expansion'].forEach(function(id){
      chartArticle(eatsGrid, data.charts[id], emptyPlot(titleOf(data.charts[id])), false);
    });
    chartArticle(eatsGrid, data.charts.eats_coverage_vs_eta, emptyPlot(titleOf(data.charts.eats_coverage_vs_eta)), true);
    var delivery = card(eatsGrid, true);
    badge(delivery, 'ut-un', L('לא דורג', 'Unscored'));
    heading(delivery, L('פאנל מול קונצנזוס Delivery', 'Panel versus Delivery consensus'), 'חם / בקו / קר');
    var deliverySlots = el('div', 'ut-facts');
    var deliveryPrint = data.sec_print.filter(function(row){return row.metric === 'Delivery_GB_USD_m';})[0];
    [['פאנל', '—'], ['קונצנזוס', '—'], ['הדפסה', signed(deliveryPrint.yoy_pct, 0) + '% / ' + signed(deliveryPrint.cc_yoy_pct, 0) + '% מט"ק']].forEach(function(pair){
      var slot = el('div', 'ut-metric');
      slot.appendChild(el('div', 'ut-gloss', pair[0]));
      var value = el('b');
      value.appendChild(bdi(pair[1]));
      slot.appendChild(value);
      deliverySlots.appendChild(slot);
    });
    delivery.appendChild(deliverySlots);
    host.appendChild(eatsGrid);
    renderMethodology(host, data);

    var foot = el('p', 'ut-sources');
    var sourceLink = el('a', null, L('מקורות ומתודולוגיה', 'Sources and methodology'));
    if(document.getElementById('navPanel') && typeof root.navigate === 'function'){
      sourceLink.href = '#page=sources';
      sourceLink.addEventListener('click', function(event){event.preventDefault(); root.navigate('sources');});
    }else{
      sourceLink.href = '?view=sources';
    }
    foot.appendChild(sourceLink);
    foot.appendChild(document.createTextNode(L(' · קלט מחקר, לא המלצת מסחר.', ' · Research input, not a trade recommendation.')));
    host.appendChild(foot);
  }

  function partNode(part){
    if(part.url){
      var href = /^https?:/i.test(part.url) ? part.url : asset(part.url);
      var link = document.createElement('a');
      link.href = href;
      link.dir = 'ltr';
      if(/^https?:/i.test(href)){link.target = '_blank'; link.rel = 'noopener noreferrer';}
      link.appendChild(bdi(part.text || part.url));
      return link;
    }
    if(part.ltr) return bdi(part.text);
    var span = document.createElement('span');
    if(part.text && /[\u0590-\u05FF]/.test(part.text)) fillHebrew(span, part.text);
    else span.textContent = part.text || '';
    return span;
  }
  function fillParts(node, parts){
    (parts || []).forEach(function(part){node.appendChild(partNode(part));});
  }
  function renderMethodology(parent, data){
    var section = el('section', 'ut-method');
    section.dir = he() ? 'rtl' : 'ltr';
    section.appendChild(el('h2', null, L('איך זה מחושב', 'How this is calculated')));
    (data.methodology || []).forEach(function(item){
      var block = el('article');
      block.appendChild(el('h3', null, L(item.title_he, item.title_en)));
      var calc = el('p');
      fillParts(calc, he() ? item.calc_he : item.calc_en);
      block.appendChild(calc);
      if(item.links && item.links.length){
        var links = el('p', 'ut-links');
        fillParts(links, item.links);
        block.appendChild(links);
      }
      var freq = el('p', 'ut-note');
      fillParts(freq, he() ? item.freq_he : item.freq_en);
      block.appendChild(freq);
      section.appendChild(block);
    });
    parent.appendChild(section);
  }

  function mount(node){
    host = node;
    if(!host) return Promise.resolve();
    if(bundle){render(bundle); return Promise.resolve();}
    host.className = 'ut';
    host.dir = he() ? 'rtl' : 'ltr';
    host.textContent = L('טוען את תמונת המצב הציבורית…', 'Loading the public snapshot…');
    return fetch(dataUrl(), {cache:'no-cache'}).then(function(response){
      if(!response.ok) throw new Error('bundle');
      return response.json();
    }).then(function(data){
      bundle = data;
      render(bundle);
    }).catch(function(){
      host.replaceChildren();
      host.appendChild(el('p', null, L('תמונת המצב לא נטענה.', 'The snapshot did not load.')));
      var retry = el('button', null, L('ניסיון נוסף', 'Retry'));
      retry.type = 'button';
      retry.addEventListener('click', function(){bundle = null; mount(host);});
      host.appendChild(retry);
    });
  }

  var previous = root.onLangChange;
  root.onLangChange = function(lang){
    if(typeof previous === 'function') previous(lang);
    if(bundle && host) render(bundle);
  };
  root.WaveUberTracker = {open:function(){return mount(document.getElementById('uberTracker'));}, mount:mount};
})(typeof window !== 'undefined' ? window : globalThis);
