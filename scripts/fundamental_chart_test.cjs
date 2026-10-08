const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const modelPath = require.resolve('../apps/terminal/public/fundamental-chart-model.js');
const model = require(modelPath);
const { buildSeries, relativeGrowth, periodKey, formatValue, metricLabel } = model;
const row = (date, value, extra = {}) => ({ date, value, ...extra });
const growth = (data, options = {}) => buildSeries(data, { metric: 'revenue', period: 'annual', mode: 'growth', ...options });
const last = values => values.at(-1);
function near(actual, expected) {
  assert.equal(typeof actual, 'number');
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}

test('UMD works in CommonJS, browser, and AMD without DOM or Chart.js', () => {
  const code = fs.readFileSync(modelPath, 'utf8');
  const browser = { window: {} };
  vm.runInNewContext(code, browser);
  assert.equal(typeof browser.window.WaveFundamentalChart.buildSeries, 'function');
  let exported;
  const amd = { define: (_deps, factory) => { exported = factory(); } };
  amd.define.amd = true;
  vm.runInNewContext(code, amd);
  assert.equal(typeof exported.relativeGrowth, 'function');
  assert.equal(typeof model.buildSeries, 'function');
});

test('annual growth is relative to preceding full fiscal-year report', () => {
  const points = growth([row('2023-06-30', 100), row('2024-06-30', 125), row('2025-06-30', 100)]);
  assert.equal(points[0].value, null);
  assert.equal(points[0].status, 'missing-prior');
  near(points[1].value, 25);
  near(points[2].value, -20);
  assert.equal(points[2].priorDate, '2024-06-30');
  assert.equal(points[2].priorValue, 125);
});

test('values mode preserves levels, including a first year without a growth base', () => {
  const points = buildSeries([row('2024-12-31', -2.5)], { metric: 'eps_diluted' });
  assert.equal(points[0].value, -2.5);
  assert.equal(points[0].status, 'ok');
  assert.equal(points[0].reason, null);
  assert.equal(points[0].growthStatus, 'missing-prior');
  assert.equal(formatValue(points[0].value, 'eps_diluted'), '-2.50');
});

test('quarterly growth compares same quarter prior year and is never QoQ', () => {
  const points = growth([
    row('2024-03-31', 100), row('2024-06-30', 200), row('2024-09-30', 300), row('2024-12-31', 400),
    row('2025-03-31', 120), row('2025-06-30', 240)
  ], { period: 'quarterly' });
  near(points[4].value, 20);
  near(points[5].value, 20);
  assert.equal(points[4].priorDate, '2024-03-31');
  assert.equal(points[3].value, null);
});

test('missing quarterly observations and omitted Q4 never turn positional lag into YoY', () => {
  const points = growth([
    row('2023-03-31', 10), row('2023-09-30', 50),
    row('2024-03-31', 15), row('2024-06-30', 100), row('2024-09-30', 75),
    row('2025-06-30', 110)
  ], { period: 'quarterly' });
  near(points[2].value, 50);
  assert.equal(points[3].value, null);
  near(points[4].value, 50);
  near(points[5].value, 10);
  assert.equal(points[5].priorDate, '2024-06-30');
});

test('missing calendar years are not silently treated as preceding years', () => {
  const points = growth([row('2022-12-31', 100), row('2024-12-31', 125)]);
  assert.equal(points[1].value, null);
  assert.equal(points[1].status, 'missing-prior');
});

test('52/53-week reporting shifts may cross a calendar quarter boundary', () => {
  const points = growth([row('2022-09-24', 100), row('2023-09-30', 120), row('2024-09-28', 150)], { period: 'quarterly' });
  near(points[1].value, 20);
  near(points[2].value, 25);
  const boundary = growth([row('2022-10-01', 100), row('2023-09-30', 150)], { period: 'quarterly' });
  near(last(boundary).value, 50);
  assert.equal(last(boundary).priorKey, '2022 Q4');
  assert.equal(last(boundary).key, '2023 Q3');
  assert.match(last(boundary).periodBasis, /calendar/);
});

test('52/53-week annual reporting shifts may cross a calendar year boundary', () => {
  const points = growth([row('2019-12-28', 100), row('2021-01-02', 130)]);
  near(last(points).value, 30);
  assert.equal(last(points).priorDate, '2019-12-28');
});

test('unsafe annual date shifts cannot use an arbitrary nearest report', () => {
  for (const prior of ['2024-05-31', '2024-07-31', '2023-06-30']) {
    assert.equal(last(growth([row(prior, 100), row('2025-06-30', 200)])).value, null);
  }
});

test('fiscal metadata selects same explicit fiscal quarter in prior fiscal year', () => {
  const points = growth([
    row('2024-06-29', 100, { fiscalYear: 2024, fiscalQuarter: 'Q3' }),
    row('2024-09-28', 500, { fiscalYear: 2024, fiscalQuarter: 'Q4' }),
    row('2025-06-28', 125, { fiscalYear: 2025, fiscalQuarter: 'Q3' })
  ], { period: 'quarterly' });
  near(last(points).value, 25);
  assert.equal(last(points).key, '2025 Q3');
  assert.equal(last(points).comparisonBasis, 'reported fiscal period');
  assert.equal(last(points).fiscalYear, 2025);
  assert.equal(last(points).fiscalQuarter, 3);
});

test('fiscal metadata survives a derived growth series and its relative-rate transformation', () => {
  const first = growth([
    row('2022-09-24', 100, { fiscalYear: 2023, fiscalQuarter: 1 }),
    row('2023-09-30', 120, { fiscalYear: 2024, fiscalQuarter: 1 }),
    row('2024-09-28', 150, { fiscalYear: 2025, fiscalQuarter: 1 })
  ], { period: 'quarterly' });
  const second = growth(first, { metric: 'revenue_growth', period: 'quarterly' });
  near(last(second).value, 25);
  assert.equal(last(second).key, '2025 Q1');
  assert.equal(last(second).priorKey, '2024 Q1');
});

test('explicit metadata does not fall back to another fiscal quarter or unverified dates', () => {
  const points = growth([
    row('2024-06-29', 100, { fiscal_year: 2024, fiscal_quarter: 2 }),
    row('2025-06-28', 125, { fiscal_year: 2025, fiscal_quarter: 3 })
  ], { period: 'quarterly' });
  assert.equal(last(points).value, null);
  const mixed = growth([row('2024-06-29', 100), row('2025-06-28', 125, { fiscal_year: 2025, fiscal_quarter: 3 })], { period: 'quarterly' });
  assert.equal(last(mixed).value, null);
});

test('period-label fixtures use exact year/quarter keys rather than row offsets', () => {
  near(last(growth([row('2024', 100), row('2025', 130)])).value, 30);
  const points = growth([row('2023 Q1', 10), row('2024 Q1', 15), row('2024 Q2', 500), row('2025 Q1', 30)], { period: 'quarterly' });
  near(last(points).value, 100);
  assert.equal(points[2].value, null);
  assert.equal(periodKey('2025 Q2', 'quarterly'), '2025 Q2');
});

test('first visible period retains its base from full history', () => {
  const points = growth([row('2022', 100), row('2023', 120), row('2024', 150)]);
  const visible = points.filter(point => point.key >= '2023');
  near(visible[0].value, 20);
  near(visible[1].value, 25);
});

test('missing, blank, boolean, zero, and non-finite bases never become invented zero growth', () => {
  for (const value of [null, undefined, '', ' ', false, NaN, Infinity, -Infinity]) {
    const point = last(growth([row('2024', value), row('2025', 120)]));
    assert.equal(point.value, null);
    assert.equal(point.priorValue, null);
    assert.equal(point.status, 'missing-prior');
  }
  const point = last(growth([row('2024', 0), row('2025', 120)]));
  assert.equal(point.value, null);
  assert.equal(point.status, 'zero-base');
  assert.equal(point.priorValue, 0);
  assert.equal(formatValue(point.value, 'revenue', 'growth'), 'N/A');
});

test('missing current values remain N/A without mutating or coercing input', () => {
  const data = [Object.freeze(row('2024', 100)), Object.freeze(row('2025', null))];
  Object.freeze(data);
  const point = last(growth(data));
  assert.equal(point.value, null);
  assert.equal(point.status, 'missing-current');
  assert.equal(data[1].value, null);
  near(last(growth([row('2024', '100'), row('2025', '125')])).value, 25);
});

test('negative earnings bases have explicit loss-transition labels and no numeric growth', () => {
  for (const metric of ['gross_profit', 'operating_income', 'net_income', 'eps_diluted', 'free_cash_flow']) {
    for (const [current, reason] of [[-50, 'Loss reduction'], [-150, 'Loss widened'], [50, 'Loss to profit'], [0, 'Loss to break-even'], [-100, 'Loss unchanged']]) {
      const point = last(growth([row('2024', -100), row('2025', current)], { metric }));
      assert.equal(point.value, null);
      assert.equal(point.status, 'negative-base');
      assert.ok(point.reason.startsWith(reason), point.reason);
    }
  }
});

test('negative percentage-valued bases use a generic negative-base explanation, not earnings labels', () => {
  for (const metric of ['gross_margin', 'operating_margin', 'net_margin', 'revenue_growth', 'op_income_growth', 'net_income_growth']) {
    const point = last(growth([row('2024', -10), row('2025', 10)], { metric }));
    assert.equal(point.value, null);
    assert.match(point.reason, /Negative prior-year base/);
    assert.doesNotMatch(point.reason, /Loss/);
  }
});

test('positive base to loss produces a true decline below -100%, without clipping', () => {
  const point = last(growth([row('2024', 100), row('2025', -50)], { metric: 'net_income' }));
  near(point.value, -150);
  assert.equal(formatValue(point.value, 'net_income', 'growth'), '-150.0%');
  near(relativeGrowth(0, 100, 'revenue').value, -100);
});

test('CapEx growth describes cash-outflow magnitude for either provider sign convention', () => {
  for (const [previous, current] of [[-100, -125], [100, 125], [-100, 125]]) {
    near(last(growth([row('2024', previous), row('2025', current)], { metric: 'capex' })).value, 25);
  }
  near(relativeGrowth(-50, -100, 'capex').value, -50);
  assert.equal(relativeGrowth(-100, 0, 'capex').value, null);
  assert.match(metricLabel('capex', 'growth'), /cash-outflow magnitude/);
});

test('percentage-valued metrics use relative percentage growth, never percentage-point differences', () => {
  for (const metric of ['gross_margin', 'operating_margin', 'net_margin', 'revenue_growth', 'op_income_growth', 'net_income_growth']) {
    near(last(growth([row('2024', 20), row('2025', 25)], { metric })).value, 25);
    assert.match(metricLabel(metric, 'growth'), /relative change/);
  }
});

test('legacy growth can be safely computed from level data and transformed again', () => {
  const revenue = growth([row('2022', 100), row('2023', 120), row('2024', 150)]);
  const rateRows = revenue.map(point => ({ ...point, date: point.date || point.key }));
  const levels = buildSeries(rateRows, { metric: 'revenue_growth', period: 'annual', mode: 'values' });
  near(last(levels).value, 25);
  assert.equal(levels[0].value, null);
  assert.equal(levels[0].reason, revenue[0].reason);
  const relative = growth(rateRows, { metric: 'revenue_growth' });
  near(last(relative).value, 25);
  assert.match(relative[1].reason, /Prior-year value unavailable/);
});

test('identical duplicates are deduplicated, conflicting duplicates are explicit N/A', () => {
  const duplicate = growth([row('2024-12-31', 100), row('2024-12-31', 100), row('2025-12-31', 125)]);
  near(last(duplicate).value, 25);
  const conflict = growth([row('2024-12-31', 100), row('2024-12-31', 200), row('2025-12-31', 125)]);
  assert.equal(conflict[0].status, 'ambiguous-period');
  assert.equal(last(conflict).status, 'ambiguous-prior');
  assert.equal(last(conflict).value, null);
});

test('multiple reporting-end candidates are ambiguous, including different calendar quarters', () => {
  const points = growth([row('2024-03-30', 100), row('2024-04-02', 200), row('2025-03-31', 150)], { period: 'quarterly' });
  assert.equal(last(points).value, null);
  assert.equal(last(points).status, 'ambiguous-prior');
});

test('two distinct observations in the same chart bucket do not silently overwrite', () => {
  const points = buildSeries([row('2024-01-01', 100), row('2024-12-31', 200)], { metric: 'revenue' });
  assert.equal(points.length, 1);
  assert.equal(points[0].value, null);
  assert.equal(points[0].status, 'ambiguous-period');
  assert.deepEqual(points[0].sourceDates, ['2024-01-01', '2024-12-31']);
});

test('row order cannot change growth or let one ticker leak into another series', () => {
  const data = [row('2023-12-31', 100), row('2024-12-31', 110), row('2025-12-31', 121)];
  assert.deepEqual(growth([...data].reverse()), growth(data));
  near(last(growth([row('2024-12-31', 1), row('2025-12-31', 3)])).value, 200);
  near(last(growth(data)).value, 10);
});

test('leap days are valid and impossible dates do not create made-up periods', () => {
  near(last(growth([row('2024-02-29', 100), row('2025-02-28', 125)], { period: 'quarterly' })).value, 25);
  for (const bad of ['2023-02-29', '2025-02-31', '2025-00-01', '2025-13-01', 'bad date', '2025 Q5']) {
    assert.equal(periodKey(bad, 'quarterly'), null);
    assert.deepEqual(growth([row(bad, 1)], { period: 'quarterly' }), []);
  }
});

test('formatting has one sign, no assumed currency, and explicit relative-growth labels', () => {
  assert.equal(formatValue(-2.5, 'eps_diluted'), '-2.50');
  assert.equal(formatValue(-1250000000, 'net_income'), '-1.3B');
  assert.equal(formatValue(20, 'net_margin'), '+20.0%');
  assert.equal(formatValue(-0.001, 'revenue', 'growth'), '0.0%');
  assert.doesNotMatch(formatValue(1000000, 'revenue'), /\$/);
  assert.equal(metricLabel('net_income', 'growth'), 'Net Income · YoY growth (%)');
  assert.equal(formatValue(Infinity, 'revenue'), 'N/A');
});

test('invalid configurations fail clearly and overflowing calculations stay unavailable', () => {
  assert.throws(() => buildSeries([], { period: 'monthly' }), /annual or quarterly/);
  assert.throws(() => buildSeries([], { mode: 'qoq' }), /values or growth/);
  assert.deepEqual(growth(null), []);
  assert.equal(relativeGrowth(Number.MAX_VALUE, Number.MIN_VALUE, 'revenue').status, 'non-finite');
  near(relativeGrowth(Number.MAX_VALUE, Number.MAX_VALUE, 'revenue').value, 0);
});
