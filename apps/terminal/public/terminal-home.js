/* Homepage additions: ranked snapshot, morning-brief delta, sector heatmap.
   Public feeds only. Missing data stays empty. */
(function (root) {
  'use strict';

  var INDEXES = {SPY: 'S&P 500', QQQ: 'Nasdaq 100', IWM: 'Russell 2000', DIA: 'Dow'};
  var MACRO_IDS = {cpi: 1, nfp: 1, pce: 1, gdp: 1, claims: 1};
  var SKIP_SECTIONS = {'source-core': 1, 'source-method': 1};
  var HEAT_MS = 30 * 60 * 1000;
  var SNAP_MS = 10 * 60 * 1000;
  var state = {movers: null, macro: null, catalyst: null, heat: null, changed: null};
  var heatAt = 0;
  var snapAt = 0;
  var timers = [];

  function lang() { return typeof getLang === 'function' && getLang() === 'he' ? 'he' : 'en'; }
  function tr(key, fallback) { return typeof t === 'function' ? t(key, fallback) : fallback; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
    });
  }
  function finite(n) { return typeof n === 'number' && Number.isFinite(n); }
  function el(id) { return typeof document === 'undefined' ? null : document.getElementById(id); }

  function fmtNum(n) {
    if (!finite(n)) return null;
    var abs = Math.abs(n);
    var digits = abs >= 100 ? 0 : 2;
    return n.toLocaleString('en-US', {maximumFractionDigits: digits});
  }
  function fmtPct(n) {
    if (!finite(n)) return '';
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtPrice(n) {
    if (!finite(n)) return '';
    return n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  }
  function shortStamp(iso) {
    var ms = Date.parse(iso || '');
    if (!Number.isFinite(ms)) return '';
    return new Date(ms).toLocaleString(lang() === 'he' ? 'he-IL' : 'en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
  }
  function withUnit(n, unit) {
    var num = fmtNum(n);
    if (num == null) return '';
    if (!unit) return num;
    return unit.charAt(0) === '%' ? num + unit : num + ' ' + unit;
  }
  function oldest(stamps) {
    var best = '';
    stamps.forEach(function (iso) {
      var ms = Date.parse(iso || '');
      if (!Number.isFinite(ms)) return;
      if (!best || ms < Date.parse(best)) best = iso;
    });
    return best;
  }

  function treemap(items, width, height) {
    var rects = [];
    var data = items.filter(function (it) { return it && it.size > 0; }).slice().sort(function (a, b) { return b.size - a.size; });
    var sum = data.reduce(function (s, it) { return s + it.size; }, 0);
    if (!data.length || !(width > 0) || !(height > 0) || !(sum > 0)) return rects;
    var scale = (width * height) / sum;
    data.forEach(function (it) { it._area = it.size * scale; });
    function worst(row, side) {
      if (!row.length || !(side > 0)) return Infinity;
      var total = 0, hi = 0, lo = Infinity, i;
      for (i = 0; i < row.length; i++) {
        total += row[i]._area;
        if (row[i]._area > hi) hi = row[i]._area;
        if (row[i]._area < lo) lo = row[i]._area;
      }
      var side2 = side * side;
      return Math.max((side2 * hi) / (total * total), (total * total) / (side2 * lo));
    }
    function layoutRow(row, box) {
      var total = row.reduce(function (s, it) { return s + it._area; }, 0);
      var stackY = box.w >= box.h;
      if (stackY) {
        var colW = total / box.h;
        var y = box.y;
        row.forEach(function (it) {
          var h = it._area / colW;
          rects.push({item: it, x: box.x, y: y, w: colW, h: h});
          y += h;
        });
        return {x: box.x + colW, y: box.y, w: box.w - colW, h: box.h};
      }
      var rowH = total / box.w;
      var x = box.x;
      row.forEach(function (it) {
        var w = it._area / rowH;
        rects.push({item: it, x: x, y: box.y, w: w, h: rowH});
        x += w;
      });
      return {x: box.x, y: box.y + rowH, w: box.w, h: box.h - rowH};
    }
    function squarify(children, row, box) {
      if (!children.length) {
        if (row.length) layoutRow(row, box);
        return;
      }
      var side = Math.min(box.w, box.h);
      var next = children[0];
      if (!row.length || worst(row, side) >= worst(row.concat([next]), side)) squarify(children.slice(1), row.concat([next]), box);
      else squarify(children, [], layoutRow(row, box));
    }
    squarify(data, [], {x: 0, y: 0, w: width, h: height});
    return rects;
  }

  function normalizeSectors(payload) {
    var body = payload && payload.data && Array.isArray(payload.data.sectors) ? payload.data : payload;
    var rows = body && (body.sectors || body.rows);
    if (!Array.isArray(rows)) return {rows: [], at: ''};
    var meta = (payload && payload.meta) || (body && body.meta) || {};
    var at = meta.source_timestamp || meta.calculated_at || meta.fetched_at || body.updated_at || body.as_of || body.fetched_at || '';
    var session = body.session || meta.session || '';
    var out = [];
    rows.forEach(function (row) {
      if (!row) return;
      var symbol = String(row.symbol || row.ticker || row.etf || '').trim();
      var pct = finite(row.pct) ? row.pct : finite(row.change_pct) ? row.change_pct : finite(row.pct_change) ? row.pct_change : null;
      if (!symbol || pct == null) return;
      var price = finite(row.price) ? row.price : finite(row.last) ? row.last : finite(row.close) ? row.close : null;
      out.push({
        symbol: symbol,
        name: String(row.name || row.sector || symbol),
        pct: pct,
        price: price,
        at: at,
        source: meta.source || body.source || ''
      });
    });
    return {rows: out, at: at, session: session, source: meta.source || (body && body.source) || '', stale: !!(meta && meta.stale)};
  }

  function briefChanges(current, previous) {
    if (!current || !Array.isArray(current.sections) || !previous || !Array.isArray(previous.sections)) return [];
    var prior = {};
    previous.sections.forEach(function (section) { if (section && section.id) prior[section.id] = section; });
    var lines = [];
    var seen = {};
    current.sections.forEach(function (section) {
      if (!section || !section.id || SKIP_SECTIONS[section.id]) return;
      var title = String(section.title || '').trim();
      if (!title || seen[title]) return;
      var old = prior[section.id];
      if (!old || String(old.title || '').trim() !== title) {
        seen[title] = 1;
        lines.push(title);
      }
    });
    return lines.slice(0, 4);
  }

  function sectorLabel(row, rect) {
    var key = 'home.sector.' + row.symbol;
    var localized = tr(key, '');
    var full = localized && localized !== key ? localized : (row.name || row.symbol);
    if (!rect || lang() === 'he' || rect.w >= 96) return full;
    var shorts = {XLV: 'Health', XLU: 'Utilities', XLP: 'Staples', XLY: 'Discr.', XLF: 'Financials', XLC: 'Comm.'};
    return shorts[row.symbol] || full;
  }
  function isolate(text) { return '\u2068' + text + '\u2069'; }

  function paintRow(id, text, stamp, page, title) {
    var button = el('homeSnap' + id);
    var label = el('homeSnap' + id + 'Text');
    var time = el('homeSnap' + id + 'Time');
    if (!button || !label || !time) return;
    var missing = !text;
    label.textContent = missing ? tr('home.unavailable', 'Unavailable') : text;
    label.dir = 'ltr';
    label.classList.toggle('is-missing', missing);
    time.textContent = missing ? '' : shortStamp(stamp);
    time.dateTime = missing || !stamp ? '' : stamp;
    button.disabled = missing || !page;
    button.dataset.page = page || '';
    button.title = title || '';
  }

  function renderMovers() {
    var pack = state.movers;
    if (!pack || !pack.rows.length) {
      paintRow('Movers', '', '', '', '');
      return;
    }
    var top = pack.rows.slice(0, 3);
    paintRow('Movers', top.map(function (row) { return row.symbol + ' ' + fmtPct(row.pct); }).join(' · '), oldest(top.map(function (row) { return row.at; })), pack.page,
      top.map(function (row) {
        return row.symbol + ' · ' + row.name + (row.price == null ? '' : ' · ' + fmtPrice(row.price));
      }).join('\n'));
  }

  function macroName(pack) { return lang() === 'he' ? pack.nameHe : pack.nameEn; }
  function renderMacro() {
    var pack = state.macro;
    if (!pack) { paintRow('Macro', '', '', '', ''); return; }
    var name = macroName(pack);
    var bits = [name + ' ' + withUnit(pack.actual, pack.unit)];
    if (pack.prior != null) bits.push(isolate(tr('home.prior', 'prior')) + ' ' + withUnit(pack.prior, pack.unit));
    if (pack.consensus != null) bits.push(isolate(tr('home.consensus', 'consensus')) + ' ' + withUnit(pack.consensus, pack.unit));
    var detail = [name, pack.period || '', withUnit(pack.actual, pack.unit)];
    if (pack.priorReported != null && pack.priorRevised != null && pack.priorReported !== pack.priorRevised) {
      detail.push(tr('home.prior', 'prior') + ' ' + withUnit(pack.priorReported, pack.unit));
      detail.push(tr('home.priorRevised', 'revised') + ' ' + withUnit(pack.priorRevised, pack.unit));
    }
    paintRow('Macro', bits.join(' · '), pack.at, 'macro', detail.filter(Boolean).join(' · '));
  }

  function renderCatalyst() {
    var story = state.catalyst;
    if (!story || !story.title) { paintRow('Catalyst', '', '', '', ''); return; }
    paintRow('Catalyst', story.title, story.pub, story.page, [story.source, story.title].filter(Boolean).join(' · '));
  }

  function renderChanged() {
    var list = el('homeChangedList');
    if (!list) return;
    list.replaceChildren();
    var lines = state.changed && state.changed.lines;
    if (!lines || !lines.length) {
      var empty = document.createElement('li');
      empty.className = 'home-changed-empty';
      empty.textContent = tr('home.unavailable', 'Unavailable');
      list.appendChild(empty);
      return;
    }
    lines.forEach(function (line) {
      var item = document.createElement('li');
      item.dir = 'auto';
      item.textContent = line;
      list.appendChild(item);
    });
  }

  function heatColor(pct, maxAbs) {
    var mag = maxAbs > 0 ? Math.min(1, Math.abs(pct) / maxAbs) : 0;
    var alpha = (0.42 + 0.53 * mag).toFixed(3);
    var rgb = pct >= 0 ? '34,197,94' : '239,68,68';
    return 'rgba(' + rgb + ',' + alpha + ')';
  }

  function renderHeat() {
    var map = el('homeHeatmapMap');
    var time = el('homeHeatmapTime');
    if (!map) return;
    var pack = state.heat;
    map.replaceChildren();
    if (!pack || !pack.rows.length) {
      var empty = document.createElement('div');
      empty.className = 'home-heatmap-empty';
      empty.textContent = tr('home.unavailable', 'Unavailable');
      map.appendChild(empty);
      if (time) { time.textContent = ''; time.dateTime = ''; }
      return;
    }
    if (time) {
      var stamp = shortStamp(pack.at);
      time.textContent = stamp ? tr('home.heatmap.updated', 'Updated') + ' ' + stamp : '';
      time.dateTime = pack.at || '';
    }
    var width = map.clientWidth || 0;
    var height = map.clientHeight || 0;
    if (width < 20 || height < 20) {
      if (!renderHeat.wait) {
        renderHeat.wait = 1;
        requestAnimationFrame(function () { renderHeat.wait = 0; renderHeat(); });
      }
      return;
    }
    var maxAbs = 0;
    pack.rows.forEach(function (row) { maxAbs = Math.max(maxAbs, Math.abs(row.pct)); });
    var rects = treemap(pack.rows.map(function (row) {
      return {size: Math.max(Math.abs(row.pct), 0.05), row: row};
    }), width, height);
    rects.forEach(function (rect) {
      var row = rect.item.row;
      var tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'home-heat-tile';
      tile.style.left = rect.x + 'px';
      tile.style.top = rect.y + 'px';
      tile.style.width = Math.max(0, rect.w - 2) + 'px';
      tile.style.height = Math.max(0, rect.h - 2) + 'px';
      tile.style.background = heatColor(row.pct, maxAbs);
      if (rect.h < 36 || rect.w < 64) tile.classList.add('is-tight');
      var name = document.createElement('span');
      name.className = 'home-heat-name';
      name.textContent = sectorLabel(row, rect);
      var pct = document.createElement('span');
      pct.className = 'home-heat-pct';
      pct.textContent = fmtPct(row.pct);
      tile.append(name, pct);
      var price = row.price == null ? '' : fmtPrice(row.price);
      tile.title = row.symbol + (price ? ' · ' + price : '') + ' · ' + (row.name || '');
      tile.addEventListener('click', function () { if (typeof navigate === 'function') navigate('sectors'); });
      map.appendChild(tile);
    });
  }

  function renderAll() {
    renderMovers();
    renderMacro();
    renderCatalyst();
    renderChanged();
    renderHeat();
  }

  function log(key, entry) {
    if (root.WaveDataLog) root.WaveDataLog.record(key, entry);
  }
  function source(key, title, body, links) {
    if (root.WaveSources) root.WaveSources.record(key, title, body, links || []);
  }

  async function getJSON(url, options) {
    var response = await fetch(url, options);
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  }

  async function loadHeat(force) {
    if (!force && heatAt && Date.now() - heatAt < HEAT_MS) return;
    try {
      var payload = await getJSON(API + '/api/sectors?t=' + Date.now(), {cache: 'no-store'});
      var pack = normalizeSectors(payload);
      state.heat = pack.rows.length ? pack : null;
      heatAt = Date.now();
      var body = pack.rows.length
        ? ['Sector pulse snapshot. Regular-session move versus the prior completed session.', pack.source || 'Yahoo Finance chart API regular session', pack.session ? 'Session ' + pack.session : '', pack.at || '', pack.stale ? 'Snapshot is past its expiry.' : '', pack.rows.map(function (row) {
          return row.symbol + ' ' + row.name + ' ' + fmtPct(row.pct) + (row.price == null ? '' : ' ' + fmtPrice(row.price));
        }).join('\n')].filter(Boolean).join('\n')
        : 'Sector snapshot returned no moves.';
      source('home:heatmap', 'Home · Sector heatmap', body, []);
      log('home:heatmap', {
        section: 'Home',
        metric: 'Sector heatmap',
        source: pack.source || 'Yahoo Finance chart API regular session',
        pulledAt: pack.at || '',
        coverage: [pack.session || '', pack.rows.length + ' sectors'].filter(Boolean).join(' · '),
        notes: 'Tile area is the absolute regular-session percent move. Green is up and red is down. The sector pulse workflow republishes during the NYSE session. ' + (pack.rows.length ? '' : 'No rows.'),
        skipSources: true
      });
    } catch (e) {
      state.heat = null;
      log('home:heatmap', {section: 'Home', metric: 'Sector heatmap', source: 'Sector ETFs', notes: 'Sector feed unavailable.', skipSources: true});
    }
    renderHeat();
  }

  async function quote(symbol) {
    var payload = await getJSON(API + '/api/quote?symbol=' + encodeURIComponent(symbol));
    if (!payload || payload.error || !finite(payload.pct)) return null;
    var meta = payload.meta || {};
    return {
      symbol: payload.symbol || symbol,
      name: INDEXES[symbol] || symbol,
      pct: payload.pct,
      price: finite(payload.price) ? payload.price : null,
      at: meta.calculated_at || meta.fetched_at || meta.source_timestamp || '',
      source: meta.source || ''
    };
  }

  async function loadMovers() {
    var indexes = [];
    await Promise.all(Object.keys(INDEXES).map(async function (symbol) {
      try {
        var row = await quote(symbol);
        if (row) indexes.push(row);
      } catch (e) {}
    }));
    var sectors = state.heat && state.heat.rows ? state.heat.rows : [];
    if (!sectors.length) {
      try { sectors = normalizeSectors(await getJSON(API + '/api/sectors?t=' + Date.now(), {cache: 'no-store'})).rows; } catch (e) { sectors = []; }
    }
    var rows = indexes.concat(sectors).filter(function (row) { return finite(row.pct); });
    rows.sort(function (a, b) { return Math.abs(b.pct) - Math.abs(a.pct); });
    var top = rows[0];
    var page = top && INDEXES[top.symbol] ? 'breadth' : (top ? 'sectors' : '');
    state.movers = rows.length ? {rows: rows, page: page} : null;
    var shown = rows.slice(0, 3);
    source('home:movers', 'Home · Biggest movers', shown.length ? shown.map(function (row) {
      return row.symbol + ' ' + fmtPct(row.pct) + (row.price == null ? '' : ' @ ' + fmtPrice(row.price));
    }).join('\n') : 'No equity moves in the market snapshot or sector feed.', []);
    log('home:movers', {
      section: 'Home',
      metric: 'Biggest movers',
      source: (shown[0] && shown[0].source) || 'Market snapshot and sector ETFs',
      pulledAt: oldest(shown.map(function (row) { return row.at; })),
      coverage: 'SPY QQQ IWM DIA and sector ETFs',
      notes: shown.length ? shown.map(function (row) { return row.symbol + ' ' + fmtPct(row.pct); }).join(' · ') : 'Unavailable.',
      skipSources: true
    });
    renderMovers();
  }

  function verifiedConsensus(release, series) {
    var c = release && release.consensus;
    var stamp = release && (release.released_at || release.scheduled_at);
    if (!c || c.access_verified !== true || !finite(c.value) || !series) return null;
    if (c.unit !== series.unit || c.sa !== series.sa || c.period !== release.period) return null;
    if (!/^https:\/\//.test(c.source || '')) return null;
    if (!Number.isFinite(Date.parse(c.captured_at)) || !Number.isFinite(Date.parse(stamp))) return null;
    if (Date.parse(c.captured_at) >= Date.parse(stamp) || Date.parse(c.captured_at) > Date.now()) return null;
    return c.value;
  }

  async function loadMacro() {
    state.macro = null;
    try {
      var payload = await getJSON(API + '/api/macro-series');
      var best = null;
      (payload.series || []).forEach(function (series) {
        if (!MACRO_IDS[series.id]) return;
        (series.releases || []).forEach(function (release) {
          if (!finite(release.actual) || !release.released_at) return;
          if (!best || release.released_at > best.release.released_at) best = {series: series, release: release};
        });
      });
      if (best) {
        var series = best.series, release = best.release;
        var priorReported = finite(release.prior) ? release.prior : null;
        var priorRevised = finite(release.revised_prior) ? release.revised_prior : null;
        state.macro = {
          nameEn: series.name || series.id,
          nameHe: series.he || series.name || series.id,
          unit: series.unit || '',
          actual: release.actual,
          prior: priorRevised != null ? priorRevised : priorReported,
          priorReported: priorReported,
          priorRevised: priorRevised,
          consensus: verifiedConsensus(release, series),
          period: release.period || '',
          at: release.released_at,
          source: release.source || ''
        };
      }
    } catch (e) { state.macro = null; }
    var pack = state.macro;
    source('home:macro', 'Home · Macro print', pack
      ? [pack.nameEn, pack.period, withUnit(pack.actual, pack.unit), pack.prior == null ? '' : 'prior ' + withUnit(pack.prior, pack.unit), pack.consensus == null ? 'Consensus not verified.' : 'consensus ' + withUnit(pack.consensus, pack.unit), pack.source].filter(Boolean).join('\n')
      : 'No CPI, NFP, PCE, GDP or claims release in the macro catalogue.', pack && /^https:\/\//.test(pack.source) ? [{title: pack.nameEn, url: pack.source}] : []);
    log('home:macro', {
      section: 'Home',
      metric: pack ? pack.nameEn : 'Macro print',
      source: 'US macro releases',
      pulledAt: pack ? pack.at : '',
      coverage: 'CPI, NFP, PCE, GDP, claims',
      notes: pack ? pack.nameEn + ' ' + withUnit(pack.actual, pack.unit) : 'Unavailable.',
      links: pack && /^https:\/\//.test(pack.source) ? [{title: pack.nameEn, url: pack.source}] : [],
      skipSources: true
    });
    renderMacro();
  }

  async function loadCatalyst() {
    state.catalyst = null;
    var stories = [];
    try {
      var top = await getJSON(API + '/api/top-stories');
      stories = top && top.stories || [];
      if (!stories.length) {
        var news = await getJSON(API + '/api/news');
        stories = news && news.stories || [];
      }
    } catch (e) { stories = []; }
    var best = null;
    stories.forEach(function (story) {
      if (!story || !story.title) return;
      var ms = Date.parse(story.pub || '');
      if (!best) { best = story; return; }
      var bestMs = Date.parse(best.pub || '');
      if (Number.isFinite(ms) && (!Number.isFinite(bestMs) || ms > bestMs)) best = story;
    });
    if (best) state.catalyst = {title: String(best.title), source: best.source || '', pub: best.pub || '', page: 'catalysts', story: best};
    source('home:catalyst', 'Home · Latest catalyst', best
      ? [best.title, best.source || '', best.pub || '', best.link || ''].filter(Boolean).join('\n')
      : 'News feed returned no story. The catalyst calendar is per ticker and was not scanned.',
      best && /^https:\/\//.test(best.link || '') ? [{title: best.source || best.title, url: best.link}] : []);
    log('home:catalyst', {
      section: 'Home',
      metric: 'Latest catalyst',
      source: best && best.source || 'News',
      pulledAt: best && best.pub || '',
      notes: best ? best.title : 'Unavailable.',
      links: best && /^https:\/\//.test(best.link || '') ? [{title: best.source || 'Source', url: best.link}] : [],
      skipSources: true
    });
    renderCatalyst();
  }

  function editionDate(date, days) {
    var cursor = new Date(date + 'T12:00:00Z');
    cursor.setUTCDate(cursor.getUTCDate() - days);
    return cursor.toISOString().slice(0, 10);
  }

  async function loadChanged() {
    state.changed = null;
    try {
      var latest = await getJSON('briefs/latest.json');
      if (!latest || latest.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(latest.date || '') || latest.path !== 'briefs/' + latest.date + '/edition.json') throw new Error('latest');
      var current = await getJSON(latest.path);
      if (!current || current.date !== latest.date || !Array.isArray(current.sections)) throw new Error('edition');
      var previous = null;
      var previousDate = '';
      for (var i = 1; i <= 10 && !previous; i++) {
        previousDate = editionDate(latest.date, i);
        try {
          var candidate = await getJSON('briefs/' + previousDate + '/edition.json');
          if (candidate && candidate.date === previousDate && Array.isArray(candidate.sections)) previous = candidate;
        } catch (e) {}
      }
      var lines = briefChanges(current, previous);
      state.changed = lines.length ? {lines: lines, date: latest.date, previous: previousDate} : null;
      source('home:changed', 'Home · What changed since yesterday', lines.length
        ? 'Compared ' + latest.date + ' with ' + previousDate + '.\n' + lines.join('\n')
        : 'No section-title change versus the prior brief, or the prior brief is unavailable.', []);
      log('home:changed', {
        section: 'Home',
        metric: 'What changed since yesterday',
        source: 'Morning brief',
        pulledAt: latest.date,
        coverage: previous ? latest.date + ' vs ' + previousDate : latest.date,
        notes: lines.length ? lines.join('\n') : 'Unavailable.',
        skipSources: true
      });
    } catch (e) {
      state.changed = null;
      log('home:changed', {section: 'Home', metric: 'What changed since yesterday', source: 'Morning brief', notes: 'Brief unavailable.', skipSources: true});
    }
    renderChanged();
  }

  async function refresh(force) {
    if (typeof API === 'undefined') return;
    await loadHeat(!!force);
    await Promise.all([loadMovers(), loadMacro(), loadCatalyst(), loadChanged()]);
    snapAt = Date.now();
  }

  function boot() {
    document.querySelectorAll('.home-snap-row').forEach(function (button) {
      button.addEventListener('click', function () {
        if (button.disabled) return;
        var page = button.dataset.page;
        if (page === 'catalysts' && state.catalyst && state.catalyst.story && typeof openArticleFromStory === 'function') {
          openArticleFromStory(state.catalyst.story);
          return;
        }
        if (page && typeof navigate === 'function') navigate(page);
      });
    });
    var previous = root.onLangChange;
    root.onLangChange = function (code) {
      if (typeof previous === 'function') previous(code);
      renderAll();
    };
    var previousNavigate = root.navigate;
    if (typeof previousNavigate === 'function') {
      root.navigate = function (page) {
        previousNavigate(page);
        if ((page === 'welcome' || page === 'home') && (!snapAt || Date.now() - snapAt > SNAP_MS)) refresh(false);
      };
    }
    root.addEventListener('resize', function () { if (state.heat) renderHeat(); });
    refresh(true);
    timers.push(setInterval(function () { if (!document.hidden) loadHeat(true); }, HEAT_MS));
    timers.push(setInterval(function () { if (!document.hidden) refresh(false); }, SNAP_MS));
  }

  root.WaveHome = {
    refresh: refresh,
    treemap: treemap,
    briefChanges: briefChanges,
    normalizeSectors: normalizeSectors,
    verifiedConsensus: verifiedConsensus
  };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
