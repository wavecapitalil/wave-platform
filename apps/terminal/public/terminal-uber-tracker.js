/* UBER TRACKER. Plots the checked-in public bundle. Empty series stay empty. */
(function(root){
  'use strict';
  var SVG = 'http://www.w3.org/2000/svg';
  var bundle = null;
  var host = null;

  function he(){return typeof root.getLang !== 'function' || root.getLang() === 'he';}
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
      node.textContent = text;
      // A full English line inside the Hebrew page keeps left-to-right word order.
      // A Hebrew line stays right-to-left, and the browser isolates the Latin runs inside it.
      if(/[A-Za-z]/.test(text) && !/[\u0590-\u05FF]/.test(text)) node.dir = 'ltr';
      else if(/[\u0590-\u05FF]/.test(text)) node.dir = 'rtl';
    }
    return node;
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
    return node;
  }
  function titleOf(chart){return L(chart.title_he, chart.title_en);}
  function glossOf(chart){return L(chart.title_en, chart.title_he);}

  function card(parent, wide){
    var node = el('article', 'ut-card' + (wide ? ' ut-wide' : ''));
    parent.appendChild(node);
    return node;
  }
  function heading(parent, title, gloss){
    parent.appendChild(el('h3', null, title));
    parent.appendChild(el('p', 'ut-gloss', gloss));
  }
  function captions(parent, shows, doesNot){
    parent.appendChild(el('p', 'ut-cap', L('מה רואים: ', 'Shows: ') + shows));
    parent.appendChild(el('p', 'ut-cap', L('מה לא רואים: ', 'Does not show: ') + doesNot));
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
    var text = svg('text', {x:328, y:104, 'text-anchor':'middle', fill:'#cbd5e1', 'font-size':16});
    text.textContent = L('אין תצפיות', 'No observations');
    plot.appendChild(text);
    var sub = svg('text', {x:328, y:128, 'text-anchor':'middle', fill:'#94a3b8', 'font-size':12});
    sub.textContent = L('תא ריק אינו אפס', 'An empty cell is not zero');
    plot.appendChild(sub);
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
      label.textContent = fmt(value / 1000, 0) + 'k';
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
    title.textContent = L('בונוס מובטח לנהג לפי עיר, תאריך אחד', 'Driver guarantee by city, one date');
    plot.appendChild(title);
    return plot;
  }

  function quadrant(){
    var plot = svg('svg', {viewBox:'0 0 640 220', role:'img'});
    plot.appendChild(svg('rect', {x:40, y:16, width:560, height:188, fill:'none', stroke:'#334155'}));
    plot.appendChild(svg('line', {x1:320, y1:16, x2:320, y2:204, stroke:'#334155'}));
    plot.appendChild(svg('line', {x1:40, y1:110, x2:600, y2:110, stroke:'#334155'}));
    function label(x, y, text){
      var node = svg('text', {x:x, y:y, 'text-anchor':'middle', fill:'#cbd5e1', 'font-size':12});
      node.textContent = text;
      plot.appendChild(node);
    }
    label(180, 70, L('כיסוי עולה, ETA עולה', 'Coverage up, ETA up'));
    label(180, 90, L('צמיחה שבירה', 'Fragile growth'));
    label(460, 150, L('כיסוי עולה, ETA יציב', 'Coverage up, ETA stable'));
    label(460, 170, L('אימוץ בריא', 'Healthy adoption'));
    label(320, 118, L('אין עיר', 'No city plotted'));
    var title = svg('title');
    title.textContent = L('מיפוי כיסוי מול ETA, בלי נקודות', 'Coverage versus ETA map, no points');
    plot.appendChild(title);
    return plot;
  }

  function chartArticle(parent, chart, plot, wide){
    var node = card(parent, wide);
    badge(node, 'ut-un', L('לא נצפה', 'Unobserved'));
    heading(node, titleOf(chart), glossOf(chart));
    node.appendChild(plot || emptyPlot(titleOf(chart)));
    captions(node, L(chart.shows_he, chart.shows_en), L(chart.does_not_show_he, chart.does_not_show_en));
    return node;
  }

  function registerSources(data){
    if(!root.WaveSources) return;
    var nyc = data.series.nyc_hvfhv.observations;
    var text = L(
      'UBER TRACKER הוא קלט מחקר. הוא מפריד עובדה מהסקה ואינו המלצת מסחר.\n' +
      'הקריאה הכוללת "' + data.inference.label_he + '" היא הסקה מפרוקסי הנפח הציבוריים, בפס שטוח של ' + data.inference.flat_band_pct + '% לכל רכיב. כשהרכיבים חלוקים, הקריאה יציבה. הדפסת ה-SEC אינה נכנסת לציון. סדרה ריקה אינה אפס.\n' +
      data.inference.components.map(function(row){return row.id + ': ' + row.change_pct + '% ' + row.read + ' (' + row.detail + ')';}).join('\n') + '\n' +
      data.inference.excluded.join('\n') + '\n' +
      'ניו יורק: ממוצע יומי של נסיעות HVFHV, Uber מול Lyft, מספטמבר 2025 עד אוגוסט 2026. המקור הוא אגרגציית TLC Help של קובצי TLC (HV0003/HV0005), שנמשכה ב-' + nyc[0].source_pulled + '. זה לא ציטוט מחיר ולא נפח ארצי. החודש האחרון בקובץ הוא אוגוסט 2026.\n' +
      'LAX: נסיעות TNC חודשיות מדוחות LAWA. זה לא Uber בלבד ולא כל העיר. חודשים שאינם בקובץ לא הושלמו.\n' +
      'בונוס נהגים: מודעות פומביות מאתר הפניה עצמאי, אומתו ב-5 בנובמבר 2026. לא מספר נהגים ולא מספר נסיעות.\n' +
      'הדפסת Q3 2026: Exhibit 99.1, הוגש ב-4 בנובמבר 2026. מדד Q4 הוא תחזית החברה, לא קונצנזוס מכירות.\n' +
      'ציטוטי Drive ו-Eats, כיסוי מסעדות, מבצעים וסל מנות: אין שורות. איסוף בתוך האפליקציה דורש סשן מחובר, והמשימה אינה נכנסת לחשבון.\n' +
      'קצב: בדיקת מקורות ציבוריים ב-08:00, 12:00, 17:30 ו-23:00 לפי UTC+2, וחלון סל Eats בימי שני 09:00. בשעון הקיץ בישראל הריצות מוקדמות בשעה. זו סריקה, לא זרם מחירים.\n' +
      data.baseline_pull.note_he,
      'UBER TRACKER is research input. It separates fact from inference and is not a trade recommendation.\n' +
      'The overall read "' + data.inference.label_en + '" is an inference from the public volume proxies, using a flat band of ' + data.inference.flat_band_pct + '% per component. Disagreement is read as stable. The SEC print is not an input. An empty series is not zero.\n' +
      data.inference.components.map(function(row){return row.id + ': ' + row.change_pct + '% ' + row.read + ' (' + row.detail + ')';}).join('\n') + '\n' +
      data.inference.excluded.join('\n') + '\n' +
      'New York: HVFHV daily averages, Uber versus Lyft, September 2025 through August 2026. Source is the TLC Help aggregation of TLC files (HV0003/HV0005), pulled ' + nyc[0].source_pulled + '. Not a fare quote and not national volume. The latest month in the file is August 2026.\n' +
      'LAX: monthly TNC trips from LAWA reports. Not Uber-only and not citywide. Missing months are not filled.\n' +
      'Driver guarantees: public ads on an independent referral site, verified 5 November 2026. Not driver counts and not trip counts.\n' +
      'Q3 2026 print: Exhibit 99.1, filed 4 November 2026. The Q4 range is the company outlook, not sell-side consensus.\n' +
      'Drive and Eats quotes, restaurant coverage, promos, and the dish basket have no rows. In-app collection needs an authenticated session, and this job does not log in.\n' +
      'Cadence: public-source checks at 08:00, 12:00, 17:30, and 23:00 on a UTC+2 clock, plus an Eats basket window on Monday at 09:00. During Israel summer time the jobs run one hour earlier. This is a poll, not a price tick.\n' +
      data.baseline_pull.note_en
    );
    var links = [{title:'Exhibit 99.1 Q3 2026', url:data.sec_print[0].source_url}];
    nyc[0].source_urls.forEach(function(url){links.push({title:'NYC HVFHV', url:url});});
    data.series.lax_tnc.observations.forEach(function(row){links.push({title:'LAX TNC ' + row.month, url:row.source_url});});
    data.series.driver_bonuses.observations.forEach(function(row){links.push({title:row.city + ' driver ad', url:row.source_url});});
    root.WaveSources.record('uber-tracker', L('UBER TRACKER · מקורות ומתודולוגיה', 'UBER TRACKER · sources and methodology'), text, links);
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
    head.appendChild(el('p', 'ut-gloss', L('מבט אחד על Uber Drive ועל Uber Eats. עובדה לחוד, הסקה לחוד.', 'One view of Uber Drive and Uber Eats. Facts and inferences stay apart.')));
    var pull = el('p');
    pull.appendChild(document.createTextNode(L('משיכת בסיס: ', 'Baseline pull: ')));
    pull.appendChild(bdi(data.baseline_pull.collected_on + ' Asia/Jerusalem (UTC+2)'));
    pull.appendChild(document.createTextNode(L('. שעת השעון לא נרשמה.', '. Clock time was not logged.')));
    head.appendChild(pull);
    if(data.last_attempt && data.last_attempt.at){
      var attempt = el('p');
      attempt.appendChild(document.createTextNode(L('בדיקה ציבורית אחרונה: ', 'Latest public check: ')));
      attempt.appendChild(bdi(data.last_attempt.at));
      attempt.appendChild(document.createTextNode(' '));
      attempt.appendChild(bdi(data.last_attempt.timezone + ' ' + (data.last_attempt.utc_offset || '')));
      attempt.appendChild(document.createTextNode(L('. תצפיות חדשות: ', '. New observations: ')));
      attempt.appendChild(bdi(String(data.last_attempt.new_observations)));
      attempt.appendChild(document.createTextNode(L('. מקורות שענו: ', '. Sources reached: ')));
      attempt.appendChild(bdi(data.last_attempt.reachable + '/' + data.last_attempt.checked));
      head.appendChild(attempt);
    }
    head.appendChild(el('p', 'ut-note', L(
      'הדף נסרק ב-08:00, 12:00, 17:30 ו-23:00 לפי UTC+2, וחלון סל Eats הוא יום שני ב-09:00. בשעון הקיץ הריצות מוקדמות בשעה. זו סריקה מתוזמנת, לא זרם מחירים.',
      'The page is checked at 08:00, 12:00, 17:30, and 23:00 on a UTC+2 clock, with the Eats basket window on Monday at 09:00. In summer those runs are an hour earlier in Jerusalem. This is a scheduled poll, not a price tick.'
    )));
    host.appendChild(head);

    var read = el('section', 'ut-read');
    badge(read, 'ut-inf', L('הסקה מהפרוקסי', 'Inference from proxies'));
    var strong = el('strong');
    strong.appendChild(document.createTextNode(L(data.inference.label_he, data.inference.label_en)));
    if(he()){
      strong.appendChild(document.createTextNode(' · '));
      strong.appendChild(bdi(data.inference.label_en));
    }
    read.appendChild(strong);
    read.appendChild(el('p', null, L(data.inference.line_he, data.inference.line_en)));
    host.appendChild(read);

    var facts = card(host, true);
    badge(facts, 'ut-fact', L('עובדה', 'Fact'));
    heading(facts, L('הדפסת Q3 2026', 'Q3 2026 print'), 'Exhibit 99.1 · 4 Nov 2026 · UBER');
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
      if(row.headline_note_he || row.headline_note_en) metric.appendChild(el('div', 'ut-gloss', L(row.headline_note_he, row.headline_note_en)));
      grid.appendChild(metric);
    });
    facts.appendChild(grid);
    var guide = el('p');
    guide.dir = he() ? 'rtl' : 'ltr';
    guide.appendChild(document.createTextNode(L('תחזית החברה ל-Q4, לא קונצנזוס: הזמנות ברוטו ', 'Company Q4 outlook, not consensus: Gross Bookings ')));
    guide.appendChild(bdi('$' + data.q4_guide.low_usd_b + '–' + data.q4_guide.high_usd_b + 'B'));
    guide.appendChild(document.createTextNode(L(', צמיחה במטבע קבוע ', ', constant-currency growth ')));
    guide.appendChild(bdi(data.q4_guide.cc_yoy_low_pct + '–' + data.q4_guide.cc_yoy_high_pct + '%'));
    guide.appendChild(document.createTextNode(L('. הדוח מניח רוח נגדית של כנקודת אחוז לצמיחה המדווחת.', '. The filing assumes about a 1 percentage-point headwind to reported growth.')));
    facts.appendChild(guide);
    captions(facts,
      L('המספרים שפורסמו לרבעון שהסתיים ב-30 בספטמבר 2026, והטווח שהחברה נתנה לרבעון הבא.', 'Figures published for the quarter ended 30 September 2026, and the range the company gave for the next quarter.'),
      L('זה לא פאנל הערים, לא קונצנזוס מכירות, ולא ציון hot / in-line / cold.', 'This is not the city panel, not a sell-side consensus, and not a hot / in-line / cold score.')
    );
    host.appendChild(facts);

    host.appendChild(el('h2', null, L('Uber Drive · נסיעות', 'Uber Drive')));
    host.appendChild(el('p', 'ut-note', L(
      'מחיר גבוה יכול לשקף ביקוש חזק או מעט נהגים. בלי המתנה ובלי סימון שאין רכבים אי אפשר להפריד. סל של 15 ערים ו-46 מסלולים מוגדר, ועדיין אין ציטוט אחד.',
      'A high price can be strong demand or thin driver supply. Wait time and a no-cars flag are required to separate them. The 15-city, 46-route basket is defined, and there is still not one quote.'
    )));

    var observed = el('div', 'ut-grid');
    var nycCard = card(observed, true);
    badge(nycCard, 'ut-fact', L('עובדה', 'Fact'));
    heading(nycCard, L('נסיעות HVFHV ביום, ניו יורק', 'NYC HVFHV trips per day'), 'Uber vs Lyft · Sep 2025–Aug 2026');
    var nyc = data.series.nyc_hvfhv.observations;
    nycCard.appendChild(linePlot([
      {name:'Uber', color:'#4a9eff', points:nyc.map(function(row){return row.uber_trips_per_day;})},
      {name:'Lyft', color:'#fb923c', points:nyc.map(function(row){return row.lyft_trips_per_day;})}
    ], nyc.map(function(row){return row.month;})));
    nycCard.appendChild(el('p', 'ut-gloss', L('כחול: Uber. כתום: Lyft. הציר ביחידות של אלף נסיעות ביום.', 'Blue: Uber. Orange: Lyft. The axis is in thousands of trips per day.')));
    nycCard.appendChild(table(
      [[L('חודש', 'Month'), true], ['Uber', true], ['Lyft', true], [L('נתח Uber', 'Uber share'), true]],
      nyc.map(function(row){return [row.month, fmt(row.uber_trips_per_day, 0), fmt(row.lyft_trips_per_day, 0), fmt(row.uber_share_pct, 1) + '%'];})
    ));
    captions(nycCard,
      L('ממוצע נסיעות ביום ברישומי TLC לרישיונות HV0003 ו-HV0005.', 'Average daily trips in the TLC records for licenses HV0003 and HV0005.'),
      L('זה לא מחיר, לא זמן המתנה, ולא נפח של נובמבר 2026. האגרגציה נמשכה ב-12 באוקטובר 2026.', 'Not a fare, not a wait time, and not November 2026 volume. The aggregation was pulled on 12 October 2026.')
    );

    var laxCard = card(observed);
    badge(laxCard, 'ut-fact', L('עובדה', 'Fact'));
    heading(laxCard, L('נסיעות TNC ב-LAX', 'LAX TNC trips'), 'LAWA · three published months');
    var lax = data.series.lax_tnc.observations;
    laxCard.appendChild(barPlot(lax.map(function(row){return {label:row.month, value:row.tnc_monthly};})));
    laxCard.appendChild(table(
      [[L('חודש', 'Month'), true], [L('נסיעות', 'Trips'), true], [L('מול שנה', 'YoY'), true], [L('מצטבר מול שנה', 'YTD YoY'), true]],
      lax.map(function(row){return [row.month, fmt(row.tnc_monthly, 0), row.yoy_pct == null ? '—' : signed(row.yoy_pct, 1) + '%', row.ytd_yoy_pct == null ? '—' : signed(row.ytd_yoy_pct, 1) + '%'];})
    ));
    captions(laxCard,
      L('נסיעות שירותי הזמנה בשדה, בחודשים שהדוח הרשמי כולל.', 'Ride-hail trips at the airport, for the months the official report includes.'),
      L('זה לא Uber בלבד ולא כל לוס אנג׳לס. חודשים חסרים לא שורטטו כאפס.', 'Not Uber-only and not all of Los Angeles. Missing months are not drawn as zero.')
    );

    var bonusCard = card(observed);
    badge(bonusCard, 'ut-fact', L('עובדה', 'Fact'));
    heading(bonusCard, L('מודעות בונוס לנהגים', 'Driver guarantee ads'), L('תאריך אחד · 5 בנובמבר 2026', 'One date · 5 November 2026'));
    var bonuses = data.series.driver_bonuses.observations;
    bonusCard.appendChild(bonusPlot(bonuses));
    bonusCard.appendChild(table(
      [[L('עיר', 'City'), false], [L('ערובה $', 'Guarantee $'), true], [L('נסיעות נדרשות', 'Trips required'), true], [L('חלון, ימים', 'Window, days'), true]],
      bonuses.map(function(row){return [row.city, fmt(row.guarantee_usd, 0), fmt(row.trips_required, 0), fmt(row.window_days, 0)];})
    ));
    captions(bonusCard,
      L('סכום הערובה שפורסם בעמוד הפניה פומבי, עם מספר הנסיעות והחלון שפורסמו לידו.', 'The guarantee published on a public referral page, with the trip count and window printed beside it.'),
      L('זה לא מספר נהגים, לא שכר, ולא דירוג הצפיפות. אין תקופה קודמת להשוות אליה.', 'Not a driver count, not earnings, and not the tightness rank. There is no prior period to compare.')
    );
    host.appendChild(observed);

    var quoteGrid = el('div', 'ut-grid');
    ['drive_price_index', 'drive_eta', 'drive_surge', 'drive_tightness'].forEach(function(id){
      chartArticle(quoteGrid, data.charts[id], emptyPlot(titleOf(data.charts[id])), false);
    });
    var mobility = card(quoteGrid, true);
    badge(mobility, 'ut-un', L('לא דורג', 'Unscored'));
    heading(mobility, L('פאנל מול קונצנזוס Mobility', 'Panel versus Mobility consensus'), 'hot / in-line / cold');
    var slots = el('div', 'ut-facts');
    [['Panel', '—'], ['Consensus', '—'], [L('הדפסה', 'Print'), signed(data.sec_print.filter(function(row){return row.metric === 'Mobility_GB_USD_m';})[0].yoy_pct, 0) + '% / ' + signed(data.sec_print.filter(function(row){return row.metric === 'Mobility_GB_USD_m';})[0].cc_yoy_pct, 0) + '% CC']].forEach(function(pair){
      var slot = el('div', 'ut-metric');
      slot.appendChild(el('div', 'ut-gloss', pair[0]));
      var value = el('b');
      value.appendChild(bdi(pair[1]));
      slot.appendChild(value);
      slots.appendChild(slot);
    });
    mobility.appendChild(slots);
    mobility.appendChild(el('p', null, L(data.consensus.note_he, data.consensus.note_en)));
    captions(mobility,
      L('המקום שבו יופיע ציון הפאנל מול קונצנזוס, כששניהם יימצאו.', 'Where the panel-versus-consensus score will appear once both exist.'),
      L('אחוז ה-SEC שמוצג ליד הריקים הוא עובדה נפרדת. הוא לא הופך את הריבוע ל-hot.', 'The SEC percent beside the blanks is a separate fact. It does not turn the box hot.')
    );
    host.appendChild(quoteGrid);

    host.appendChild(el('h2', null, 'Uber Eats'));
    var eatsIntro = el('div', 'ut-split');
    var customer = card(eatsIntro);
    heading(customer, L('לקוח', 'Customer'), L('אותה כתובת בית ומשרד בכל עיר', 'The same home and office address in each city'));
    customer.appendChild(el('p', 'ut-note', L(
      'דמי משלוח, ETA, מינימום, מבצעים ומספר מסעדות. החזרה השבועית היא באותו יום ושעה מקומיים. הכתובות עדיין לא נקבעו, ולכן אין קריאה.',
      'Delivery fee, ETA, minimum, promos, and restaurant count. The weekly repeat is the same local weekday and hour. Addresses are not set, so there is no reading.'
    )));
    var merchant = card(eatsIntro);
    heading(merchant, L('סוחר והיצע', 'Merchant and supply'), L('אותן ערים ואותם חלונות', 'The same cities and time windows'));
    merchant.appendChild(el('p', 'ut-note', L(
      'מסעדות, נוחות וסופר באותה כתובת, חדש מול תקופה קודמת, רשתות מול DoorDash בארה״ב או Glovo ו-Deliveroo באירופה, ומודעות בונוס לשליחים. אין שורות.',
      'Restaurants, convenience, and grocery at the same address, new versus the prior period, chains versus DoorDash in the US or Glovo and Deliveroo in Europe, and courier bonus ads. There are no rows.'
    )));
    host.appendChild(eatsIntro);

    var eatsGrid = el('div', 'ut-grid');
    ['eats_coverage', 'eats_eta', 'eats_cost', 'eats_promo', 'eats_expansion'].forEach(function(id){
      chartArticle(eatsGrid, data.charts[id], emptyPlot(titleOf(data.charts[id])), false);
    });
    chartArticle(eatsGrid, data.charts.eats_coverage_vs_eta, quadrant(), true);
    var delivery = card(eatsGrid, true);
    badge(delivery, 'ut-un', L('לא דורג', 'Unscored'));
    heading(delivery, L('פאנל מול קונצנזוס Delivery', 'Panel versus Delivery consensus'), 'hot / in-line / cold');
    var deliverySlots = el('div', 'ut-facts');
    var deliveryPrint = data.sec_print.filter(function(row){return row.metric === 'Delivery_GB_USD_m';})[0];
    [['Panel', '—'], ['Consensus', '—'], [L('הדפסה', 'Print'), signed(deliveryPrint.yoy_pct, 0) + '% / ' + signed(deliveryPrint.cc_yoy_pct, 0) + '% CC']].forEach(function(pair){
      var slot = el('div', 'ut-metric');
      slot.appendChild(el('div', 'ut-gloss', pair[0]));
      var value = el('b');
      value.appendChild(bdi(pair[1]));
      slot.appendChild(value);
      deliverySlots.appendChild(slot);
    });
    delivery.appendChild(deliverySlots);
    delivery.appendChild(el('p', null, L(data.consensus.note_he, data.consensus.note_en)));
    captions(delivery,
      L('השוואת הפאנל לקונצנזוס הרבעון, כששני המספרים קיימים.', 'The quarter comparison of the panel with consensus, once both numbers exist.'),
      L('צמיחת Delivery בהדפסה אינה ציון cold או hot של הפאנל.', 'Delivery growth in the print is not a cold or hot score for the panel.')
    );
    host.appendChild(eatsGrid);

    var files = card(host, true);
    heading(files, L('קבצי ההיסטוריה', 'History files'), L('השורות נשמרות כאן כדי שהסדרה תצטבר.', 'Rows stay here so the series can compound.'));
    var links = el('div', 'ut-links');
    ['bundle.json', 'route_basket.csv', 'nyc_hvfhv_monthly.csv', 'lax_tnc_monthly.csv', 'driver_signup_bonuses.csv', 'sec_q3_2026.csv', 'drive_quotes.csv', 'eats_customer.csv', 'eats_basket.csv', 'eats_merchant.csv', 'schema.json', 'fetch_log.jsonl'].forEach(function(file){
      var link = el('a', null, file);
      link.href = asset(file);
      link.dir = 'ltr';
      links.appendChild(link);
    });
    files.appendChild(links);
    host.appendChild(files);

    var foot = el('p', 'ut-sources');
    var sourceLink = el('a', null, L('מקורות ומתודולוגיה', 'Sources and methodology'));
    if(document.getElementById('navPanel') && typeof root.navigate === 'function'){
      sourceLink.href = '#page=sources';
      sourceLink.addEventListener('click', function(event){event.preventDefault(); root.navigate('sources');});
    }else{
      sourceLink.href = '?view=sources';
    }
    foot.appendChild(sourceLink);
    foot.appendChild(document.createTextNode(L(' · קלט מחקר, לא המלצת מסחר. תא ריק הוא ערך שלא נצפה.', ' · Research input, not a trade recommendation. An empty cell was not observed.')));
    host.appendChild(foot);
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
