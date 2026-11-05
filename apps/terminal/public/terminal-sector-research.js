(function () {
  var CHIPS = ['SOXX', 'SMH', 'XLK', 'XLF', 'XLE', 'XLV', 'QQQ', 'SPY'];
  var COLORS = ['#4a9eff', '#22c55e', '#f59e0b', '#a78bfa', '#38bdf8', '#fb7185', '#34d399', '#fbbf24', '#818cf8', '#2dd4bf'];
  var SPECS = [
    ['aum', 'sector.aum', 'AUM', function (m) { return formatAum(m.aum); }],
    ['pe', 'sector.pe', 'Avg P/E', function (m) { return formatNumber(m.pe); }],
    ['pe_5y', 'sector.pe5y', '5Y avg P/E', function (m) { return formatNumber(m.pe_5y); }],
    ['momentum_1m', 'sector.m1', '1M', function (m) { return formatPct(m.momentum_1m, true); }, true],
    ['momentum_3m', 'sector.m3', '3M', function (m) { return formatPct(m.momentum_3m, true); }, true],
    ['momentum_6m', 'sector.m6', '6M', function (m) { return formatPct(m.momentum_6m, true); }, true],
    ['momentum_12m', 'sector.m12', '12M', function (m) { return formatPct(m.momentum_12m, true); }, true],
    ['vs_50dma', 'sector.vs50', 'vs 50DMA', function (m) { return formatPct(m.vs_50dma, true); }, true],
    ['vs_200dma', 'sector.vs200', 'vs 200DMA', function (m) { return formatPct(m.vs_200dma, true); }, true],
    ['dividend_yield', 'sector.yield', 'Div. yield', function (m) { return formatPct(m.dividend_yield); }],
    ['expense_ratio', 'sector.expense', 'Expense ratio', function (m) { return formatPct(m.expense_ratio); }],
    ['holdings_count', 'sector.count', 'Holdings', function (m) { return m.holdings_count == null ? na() : String(m.holdings_count); }],
    ['top10', 'sector.top10', 'Top 10', function (m) { return formatPct(m.top10); }],
    ['beta', 'sector.beta', 'Beta', function (m) { return formatNumber(m.beta); }],
    ['volatility', 'sector.vol', 'Volatility', function (m) { return formatPct(m.volatility); }],
    ['range_52w', 'sector.range', '52W', function (m) { return formatRange(m.low_52w, m.high_52w); }]
  ];
  var chart = null;
  var generation = 0;
  var current = null;
  var opened = false;

  function na() { return t('sector.na', 'n/a'); }
  function finite(value) { return typeof value === 'number' && isFinite(value); }
  function formatNumber(value) { return finite(value) ? value.toFixed(2) : na(); }
  function formatPct(value, signed) {
    if (!finite(value)) return na();
    var body = Math.abs(value).toFixed(2) + '%';
    if (value < 0) return '-' + body;
    if (signed && value > 0) return '+' + body;
    return body;
  }
  function formatAum(value) {
    if (!finite(value)) return na();
    var sign = value < 0 ? '-' : '';
    var magnitude = Math.abs(value);
    if (magnitude >= 1e12) return sign + '$' + (magnitude / 1e12).toFixed(2) + 'T';
    if (magnitude >= 1e9) return sign + '$' + (magnitude / 1e9).toFixed(2) + 'B';
    if (magnitude >= 1e6) return sign + '$' + (magnitude / 1e6).toFixed(2) + 'M';
    return sign + '$' + magnitude.toFixed(0);
  }
  function formatRange(low, high) {
    if (!finite(low) || !finite(high)) return na();
    return low.toFixed(2) + '–' + high.toFixed(2);
  }
  function apiBase() {
    if (typeof API === 'string') return API;
    var host = location.hostname;
    return (host === 'localhost' || host === '127.0.0.1')
      ? 'http://localhost:5001'
      : 'https://nqmtayofbhletydmiujz.supabase.co/functions/v1/wave-data';
  }
  function node(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }
  function sliceLabel(slice) {
    return slice.symbol === 'OTHER' ? t('sector.other', 'Other') : (slice.symbol || slice.name || '');
  }
  function sliceColor(slice, index) {
    return slice.symbol === 'OTHER' ? '#64748b' : COLORS[index % COLORS.length];
  }
  function markChip(symbol) {
    document.querySelectorAll('#srChips .ratio-btn').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-symbol') === symbol);
    });
  }
  function emptyMetrics() {
    var metrics = {};
    SPECS.forEach(function (spec) { metrics[spec[0]] = null; });
    metrics.low_52w = null;
    metrics.high_52w = null;
    return metrics;
  }
  function renderMetrics(metrics) {
    var host = document.getElementById('srMetrics');
    if (!host) return;
    host.textContent = '';
    SPECS.forEach(function (spec) {
      var card = node('div', 'summary-card');
      card.appendChild(node('div', 'sc-label', t(spec[1], spec[2])));
      var value = node('div', 'sc-val' + (spec[0] === 'range_52w' ? ' sr-range' : ''), spec[3](metrics));
      if (spec[4] && finite(metrics[spec[0]]) && metrics[spec[0]] !== 0) {
        value.classList.add(metrics[spec[0]] > 0 ? 'sr-up' : 'sr-dn');
      }
      card.appendChild(value);
      host.appendChild(card);
    });
  }
  function renderChart(slices) {
    var canvas = document.getElementById('srChart');
    var legend = document.getElementById('srLegend');
    if (chart) { chart.destroy(); chart = null; }
    if (legend) legend.textContent = '';
    if (canvas) canvas.setAttribute('aria-label', t('sector.holdings', 'Holdings'));
    if (!canvas || !slices || !slices.length || typeof Chart === 'undefined') return;
    slices.forEach(function (slice, index) {
      var item = node('li');
      var swatch = node('i', 'sr-swatch');
      swatch.style.background = sliceColor(slice, index);
      item.appendChild(swatch);
      item.appendChild(node('span', null, sliceLabel(slice)));
      item.appendChild(node('b', null, formatPct(slice.weight)));
      legend.appendChild(item);
    });
    chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: slices.map(sliceLabel),
        datasets: [{
          data: slices.map(function (slice) { return slice.weight; }),
          backgroundColor: slices.map(sliceColor),
          borderColor: '#141620',
          borderWidth: 2,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function () { return ''; },
              label: function (item) {
                var slice = slices[item.dataIndex];
                return sliceLabel(slice) + '  ' + formatPct(slice.weight);
              }
            }
          }
        }
      }
    });
  }
  function recordLog(symbol, payload) {
    var log = payload && payload.log || { fetched_at: new Date().toISOString(), fields: [] };
    var entry = {
      page: 'sector-research',
      key: 'sector-research:' + symbol,
      title: 'Sector Research · ' + symbol,
      symbol: symbol,
      fetchedAt: log.fetched_at || null,
      fields: log.fields || []
    };
    if (window.WaveDataLog) WaveDataLog.record(entry.key, entry);
    if (window.WaveSources) {
      var body = entry.fields.map(function (field) {
        return [field.label, field.display || 'n/a', field.unit || '', field.source || '', field.note || ''].filter(Boolean).join('\n');
      }).join('\n\n');
      var links = [];
      entry.fields.forEach(function (field) {
        (field.links || []).forEach(function (link) {
          if (link && link.url && !links.some(function (item) { return item.url === link.url; })) links.push(link);
        });
      });
      WaveSources.record(entry.key, entry.title, body, links);
    }
  }
  function show(payload) {
    current = payload;
    var name = document.getElementById('srName');
    var symbol = document.getElementById('srSymbol');
    if (name) name.textContent = payload.name || payload.symbol || '';
    if (symbol) symbol.textContent = payload.symbol || '';
    renderChart(payload.slices || []);
    renderMetrics(payload.metrics || emptyMetrics());
    recordLog(payload.symbol || '', payload);
  }
  function fail(symbol) {
    current = { symbol: symbol, name: symbol, slices: [], metrics: emptyMetrics(), log: {
      fetched_at: new Date().toISOString(),
      fields: [{
        id: 'request',
        label: 'Request',
        value: null,
        display: 'n/a',
        unit: null,
        source: apiBase() + '/api/etf-holdings',
        note: 'The holdings request failed. No figures were substituted.',
        links: []
      }]
    }};
    var name = document.getElementById('srName');
    var symbolNode = document.getElementById('srSymbol');
    if (name) name.textContent = symbol;
    if (symbolNode) symbolNode.textContent = symbol;
    renderChart([]);
    renderMetrics(current.metrics);
    recordLog(symbol, current);
  }
  function load(raw) {
    var symbol = String(raw || '').trim().toUpperCase();
    if (!symbol) return;
    var input = document.getElementById('srInput');
    if (input) input.value = symbol;
    markChip(symbol);
    var name = document.getElementById('srName');
    if (name) name.textContent = t('sector.loading', 'Loading');
    var id = ++generation;
    opened = true;
    fetch(apiBase() + '/api/etf-holdings?symbol=' + encodeURIComponent(symbol))
      .then(function (response) { return response.json().then(function (body) { return { ok: response.ok, body: body }; }); })
      .then(function (result) {
        if (id !== generation) return;
        if (!result.ok || !result.body || result.body.error) { fail(symbol); return; }
        show(result.body);
        markChip(result.body.symbol || symbol);
        if (input && result.body.symbol) input.value = result.body.symbol;
      })
      .catch(function () { if (id === generation) fail(symbol); });
  }
  function open() { if (!opened) load('SOXX'); }
  function submit() {
    var input = document.getElementById('srInput');
    load(input ? input.value : '');
  }
  window.SectorResearch = { open: open, load: load, submit: submit };
  var previous = window.onLangChange;
  window.onLangChange = function (lang) {
    if (typeof previous === 'function') previous(lang);
    if (current) show(current);
  };
})();
