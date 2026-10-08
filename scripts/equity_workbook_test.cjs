const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const modelPath = require.resolve('../apps/terminal/public/equity-workbook-model.js');
const { calculate, numeric, MAX_YEARS } = require(modelPath);

const base = { revenue: 1000, shares: 100, price: 20 };
const assumptions = { growth: 0, margin: 20, buyback: 0, dilution: 0, multiple: 10,
  cash: 100, debt: 200, claims: 0, capitalConfirmed: true };
const year = (overrides = {}) => ({ ...assumptions, ...overrides });
const run = (years = [year()], overrides = {}) => calculate({ ...base, ...overrides }, years);
const first = (overrides = {}, baseOverrides = {}) => run([year(overrides)], baseOverrides).forecast[0];
function near(actual, expected) {
  assert.equal(typeof actual, 'number');
  assert.ok(Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}
const hasError = (result, field, code) => result.errors.some(error => error.field === field && (!code || error.code === code));

test('UMD loads in CommonJS, a browser, and AMD', () => {
  const code = fs.readFileSync(modelPath, 'utf8');
  const browser = { window: {} };
  vm.runInNewContext(code, browser);
  assert.equal(typeof browser.window.WaveEquityWorkbook.calculate, 'function');
  let exported;
  const amd = { define: (_deps, factory) => { exported = factory(); } };
  amd.define.amd = true;
  vm.runInNewContext(code, amd);
  assert.equal(typeof exported.calculate, 'function');
  assert.equal(MAX_YEARS, 10);
});

test('zero rates link revenue, EBIT, EV, equity, and per-share price in million units', () => {
  const result = run();
  const row = result.forecast[0];
  assert.equal(result.valid, true);
  assert.equal(result.rows, result.forecast);
  assert.equal(result.years, 1);
  assert.equal(row.year, 1);
  assert.equal(row.revenue, 1000);
  assert.equal(row.ebit, 200);
  assert.equal(row.ev, 2000);
  assert.equal(row.equity, 1900);
  assert.equal(row.price, 19);
  assert.equal(row.shares, 100);
  assert.equal(row.shareChange, 0);
  assert.equal(row.shareChangePct, 0);
  assert.equal(row.valuationValid, true);
  near(row.upside, -5);
});

test('buyback-only compounds using each year opening shares', () => {
  const rows = run(Array.from({ length: 3 }, () => year({ buyback: 10 }))).forecast;
  near(rows[0].shares, 90);
  near(rows[1].startShares, 90);
  near(rows[1].buybackShares, 9);
  near(rows[2].shares, 72.9);
  near(rows[2].shareChange, -8.1);
  assert.equal(rows[2].shareChangePct, -10);
});

test('dilution-only compounds and preserves gross issuance amounts', () => {
  const rows = run(Array.from({ length: 3 }, () => year({ dilution: 10 }))).forecast;
  near(rows[0].dilutionShares, 10);
  near(rows[1].dilutionShares, 11);
  near(rows[2].shares, 133.1);
  assert.equal(rows[2].shareChangePct, 10);
});

test('both gross rates use opening shares rather than sequential multipliers', () => {
  const rows = run(Array.from({ length: 10 }, () => year({ buyback: 10, dilution: 10 }))).forecast;
  for (const row of rows) {
    near(row.shares, 100);
    near(row.buybackShares, 10);
    near(row.dilutionShares, 10);
    near(row.shareChange, 0);
    near(row.shareChangePct, 0);
  }
});

test('varying growth, margin, capital rates, and multiples use their exact year', () => {
  const rows = run([
    year({ growth: 10, margin: 25, buyback: 4, dilution: 1, multiple: 8, cash: 30, debt: 10, claims: 5 }),
    year({ growth: -20, margin: 10, buyback: 8, dilution: 3, multiple: 11, cash: 200, debt: 50, claims: 10 }),
    year({ growth: 25, margin: 30, buyback: 0, dilution: 5, multiple: 12, cash: 40, debt: 80, claims: 0 })
  ]).forecast;
  const expected = [
    { revenue: 1100, ebit: 275, shares: 97, ev: 2200, equity: 2215 },
    { revenue: 880, ebit: 88, shares: 92.15, ev: 968, equity: 1108 },
    { revenue: 1100, ebit: 330, shares: 96.7575, ev: 3960, equity: 3920 }
  ];
  rows.forEach((row, index) => {
    Object.entries(expected[index]).forEach(([key, value]) => near(row[key], value));
    near(row.price, expected[index].equity / expected[index].shares);
  });
});

test('an early growth edit cascades through later revenue and valuation only', () => {
  const original = [year({ growth: 10 }), year({ growth: 20 }), year({ growth: 30 })];
  const before = run(original).forecast;
  const after = run([year({ growth: 30 }), original[1], original[2]]).forecast;
  after.forEach((row, index) => {
    near(row.revenue, before[index].revenue * 1.3 / 1.1);
    assert.equal(row.shares, before[index].shares);
    assert.notEqual(row.price, before[index].price);
  });
});

test('an early buyback edit cascades through shares and price, not operating results', () => {
  const original = [year(), year({ buyback: 5 }), year({ dilution: 10 })];
  const before = run(original).forecast;
  const after = run([year({ buyback: 10 }), original[1], original[2]]).forecast;
  after.forEach((row, index) => {
    near(row.shares, before[index].shares * 0.9);
    near(row.price, before[index].price / 0.9);
    assert.equal(row.revenue, before[index].revenue);
    assert.equal(row.ebit, before[index].ebit);
    assert.equal(row.equity, before[index].equity);
  });
});

test('editing a later year cannot change preceding years', () => {
  const before = run([year(), year(), year()]).forecast;
  const after = run([year(), year(), year({ growth: 50, buyback: 20, cash: 999 })]).forecast;
  assert.deepEqual(after.slice(0, 2), before.slice(0, 2));
  assert.notEqual(after[2].price, before[2].price);
});

test('editing a margin or multiple affects its year, not later operating assumptions', () => {
  const before = run([year(), year(), year()]).forecast;
  const after = run([year({ margin: 50, multiple: 20 }), year(), year()]).forecast;
  assert.notEqual(after[0].price, before[0].price);
  assert.deepEqual(after.slice(1), before.slice(1));
});

test('missing capital balances do not blank revenue, EBIT, share counts, or EV', () => {
  for (const key of ['cash', 'debt', 'claims']) {
    const result = run([year({ [key]: null }), year()]);
    const [row, next] = result.forecast;
    assert.equal(result.valid, false);
    assert.equal(row[key], null);
    assert.equal(row.revenue, 1000);
    assert.equal(row.ebit, 200);
    assert.equal(row.shares, 100);
    assert.equal(row.ev, 2000);
    assert.equal(row.equity, null);
    assert.equal(row.price, null);
    assert.ok(hasError(row, key, 'required'));
    assert.equal(next.valid, true);
    assert.equal(next.price, 19);
  }
});

test('missing multiple leaves independent operating and capital results intact', () => {
  const [row, next] = run([year({ multiple: '' }), year()]).forecast;
  assert.equal(row.revenue, 1000);
  assert.equal(row.ebit, 200);
  assert.equal(row.shares, 100);
  assert.equal(row.cash, 100);
  assert.equal(row.ev, null);
  assert.equal(row.price, null);
  assert.equal(next.price, 19);
});

test('missing growth cascades revenue to future years but preserves shares and assumption cells', () => {
  const rows = run([year(), year({ growth: '' }), year({ growth: 20 })]).forecast;
  assert.equal(rows[0].price, 19);
  for (const row of rows.slice(1)) {
    assert.equal(row.revenue, null);
    assert.equal(row.ebit, null);
    assert.equal(row.ev, null);
    assert.equal(row.price, null);
    assert.equal(row.shares, 100);
    assert.equal(row.cash, 100);
    assert.ok(hasError(row, 'revenue', 'dependency'));
  }
  assert.equal(rows[2].growth, 20);
});

test('missing share rate cascades shares, but revenue, EBIT, EV, equity still calculate', () => {
  for (const key of ['buyback', 'dilution']) {
    const rows = run([year({ [key]: null }), year()]).forecast;
    rows.forEach(row => {
      assert.equal(row.revenue, 1000);
      assert.equal(row.ebit, 200);
      assert.equal(row.ev, 2000);
      assert.equal(row.equity, 1900);
      assert.equal(row.shares, null);
      assert.equal(row.price, null);
      assert.ok(hasError(row, 'shares', 'dependency'));
    });
    assert.equal(rows[0][key === 'buyback' ? 'dilutionShares' : 'buybackShares'], 0);
    assert.equal(rows[1].startShares, null);
    assert.equal(rows[1].shareChangePct, 0);
  }
});

test('missing margin only blocks that year EBIT-based valuation', () => {
  const [row, next] = run([year({ margin: null }), year({ growth: 10 })]).forecast;
  assert.equal(row.revenue, 1000);
  assert.equal(row.ebit, null);
  assert.equal(row.shares, 100);
  near(next.revenue, 1100);
  near(next.ebit, 220);
  near(next.price, 21);
});

test('missing historical revenue preserves shares; missing shares preserves operating outputs', () => {
  let result = run([year(), year()], { revenue: null });
  assert.ok(hasError(result, 'revenue', 'required'));
  result.forecast.forEach(row => { assert.equal(row.shares, 100); assert.equal(row.revenue, null); });
  result = run([year(), year()], { shares: null });
  result.forecast.forEach(row => {
    assert.equal(row.revenue, 1000);
    assert.equal(row.ebit, 200);
    assert.equal(row.ev, 2000);
    assert.equal(row.equity, 1900);
    assert.equal(row.shares, null);
    assert.equal(row.price, null);
  });
});

test('null, empty, invalid, boolean, and nonfinite inputs never silently become zero', () => {
  for (const value of [null, undefined, '', ' ', false, true, 'no', NaN, Infinity, -Infinity, {}, [], [0]]) {
    assert.equal(numeric(value), null);
    const row = first({ cash: value });
    assert.equal(row.cash, null);
    assert.equal(row.price, null);
    assert.equal(row.revenue, 1000);
  }
  assert.equal(numeric(0), 0);
  assert.equal(numeric('0'), 0);
  assert.equal(numeric(' 10.5 '), 10.5);
});

test('numeric strings from editable cells are accepted without mutating inputs', () => {
  const b = Object.freeze({ revenue: '1000', shares: '100', price: '20' });
  const a = Object.freeze(Object.fromEntries(Object.entries(assumptions).map(([key, value]) => [key, typeof value === 'number' ? String(value) : value])));
  const rows = Object.freeze([a]);
  const result = calculate(b, rows);
  assert.equal(result.valid, true);
  assert.equal(result.forecast[0].price, 19);
  assert.equal(b.revenue, '1000');
  assert.equal(a.multiple, '10');
  assert.deepEqual(calculate(b, rows), result);
});

test('zero and negative EBIT retain operating losses with no multiple-derived valuation', () => {
  for (const margin of [0, -20]) {
    const row = first({ margin });
    assert.equal(row.valid, true);
    assert.equal(row.valuationValid, false);
    assert.equal(row.ebit, margin * 10);
    assert.equal(row.ev, null);
    assert.equal(row.equity, null);
    assert.equal(row.price, null);
    assert.equal(row.upside, null);
    assert.ok(row.warnings.includes('nonpositive_ebit'));
  }
});

test('a profitable later year resumes valuation after an earlier operating loss', () => {
  const [loss, profit] = run([year({ margin: -10 }), year({ margin: 20, growth: 10 })]).forecast;
  assert.equal(loss.ebit, -100);
  assert.equal(loss.price, null);
  near(profit.revenue, 1100);
  near(profit.ebit, 220);
  near(profit.price, 21);
  assert.equal(profit.valuationValid, true);
});

test('negative equity retains its actual deficit while common-share price floors at zero', () => {
  const row = first({ debt: 3000, claims: 100 });
  assert.equal(row.equity, -1000);
  assert.equal(row.price, 0);
  assert.equal(row.upside, -100);
  assert.equal(row.valuationValid, true);
  assert.ok(row.warnings.includes('equity_deficit'));
});

test('exactly zero equity produces zero price without an equity-deficit warning', () => {
  const row = first({ debt: 2100 });
  assert.equal(row.equity, 0);
  assert.equal(row.price, 0);
  assert.ok(!row.warnings.includes('equity_deficit'));
});

test('claims are deducted from enterprise-to-equity bridge and do not affect EV', () => {
  const row = first({ claims: 100 });
  assert.equal(row.ev, 2000);
  assert.equal(row.equity, 1800);
  assert.equal(row.price, 18);
});

test('year-end cash already includes buyback funding and is never subtracted twice', () => {
  const row = first({ buyback: 10, cash: 0, debt: 0 });
  assert.equal(row.equity, 2000);
  near(row.price, 2000 / 90);
});

test('each year has independent cash/debt/claims rather than accumulating prior balances', () => {
  const rows = run([year({ cash: 500, debt: 20, claims: 30 }), year({ cash: 0, debt: 0, claims: 0 })]).forecast;
  assert.equal(rows[0].equity, 2450);
  assert.equal(rows[1].equity, 2000);
  assert.equal(rows[1].price, 20);
});

test('unconfirmed capital allocation produces a caveat without disabling recalculation', () => {
  const row = first({ buyback: 10, dilution: 5, capitalConfirmed: false });
  assert.equal(row.valid, true);
  assert.equal(row.valuationValid, true);
  assert.ok(row.warnings.includes('capital_balances_unconfirmed'));
  near(row.price, 1900 / 95);
  assert.ok(!first({ buyback: 10, capitalConfirmed: true }).warnings.includes('capital_balances_unconfirmed'));
  assert.ok(!first({ capitalConfirmed: false }).warnings.includes('capital_balances_unconfirmed'));
  assert.ok(first({ buyback: 10, capitalConfirmed: undefined }).warnings.includes('capital_balances_unconfirmed'));
});

test('missing or invalid current price only suppresses upside', () => {
  for (const price of [null, undefined, '', 0, -10, NaN, Infinity]) {
    const row = first({}, { price });
    assert.equal(row.valid, true);
    assert.equal(row.price, 19);
    assert.equal(row.upside, null);
    assert.ok(row.warnings.includes('missing_current_price'));
  }
});

test('uniform unit scaling of every monetary and share input leaves price unchanged', () => {
  const factor = 1000;
  const row = first({ cash: assumptions.cash * factor, debt: assumptions.debt * factor,
    claims: 100 * factor }, { revenue: base.revenue * factor, shares: base.shares * factor });
  assert.equal(row.price, 18);
  assert.equal(row.revenue, 1000000);
  assert.equal(row.shares, 100000);
});

test('zero forecast years is valid and empty, and all lengths up to ten are supported', () => {
  for (let length = 0; length <= 10; length++) {
    const result = run(Array.from({ length }, () => year()));
    assert.equal(result.valid, true);
    assert.equal(result.years, length);
    assert.equal(result.forecast.length, length);
    result.forecast.forEach(row => { assert.equal(row.shares, 100); assert.equal(row.revenue, 1000); });
  }
});

test('more than ten years is explicitly rejected rather than silently truncating', () => {
  const result = run(Array.from({ length: 11 }, () => year()));
  assert.equal(result.valid, false);
  assert.equal(result.forecast.length, 0);
  assert.ok(hasError(result, 'years', 'range'));
});

test('non-array assumptions and malformed base/rows are safely rejected', () => {
  for (const value of [null, undefined, {}, '1', 10]) {
    const result = calculate(base, value);
    assert.equal(result.valid, false);
    assert.ok(hasError(result, 'assumptions', 'array'));
  }
  assert.equal(calculate(null, [null]).valid, false);
  const result = calculate(base, new Array(2));
  assert.equal(result.forecast.length, 2);
  assert.equal(result.forecast[0].growth, null);
});

test('rate bounds are enforced independently and invalid values remain null', () => {
  const cases = [ ['buyback', -1], ['buyback', 100], ['buyback', 101],
    ['dilution', -1], ['dilution', 101], ['growth', -101], ['growth', 301],
    ['margin', -101], ['margin', 101], ['multiple', -1], ['multiple', 101],
    ['cash', -1], ['debt', -1], ['claims', -1],
    ['cash', 1e12 + 1], ['debt', 1e12 + 1], ['claims', 1e12 + 1] ];
  for (const [key, value] of cases) {
    const result = run([year({ [key]: value })]);
    assert.equal(result.valid, false, `${key}=${value}`);
    assert.equal(result.forecast[0][key], null);
    assert.ok(hasError(result, key, 'range'));
  }
});

test('boundary values, fractional percentages, zero multiple, and zero base revenue are accepted', () => {
  for (const change of [{ growth: -100 }, { growth: 300 }, { margin: -100 }, { margin: 100 },
    { buyback: 99.99 }, { dilution: 100 }, { multiple: 0 }, { multiple: 100 },
    { buyback: 0.25, dilution: 0.15 }, { cash: 1e12, debt: 1e12, claims: 1e12 }]) {
    assert.equal(first(change).valid, true, JSON.stringify(change));
  }
  const row = first({ multiple: 0, cash: 300 });
  assert.equal(row.ev, 0);
  assert.equal(row.equity, 100);
  assert.equal(row.price, 1);
  assert.equal(first({}, { revenue: 0 }).revenue, 0);
  assert.equal(first({}, { revenue: 0 }).valid, true);
});

test('invalid historical bases do not spill into unrelated chains', () => {
  for (const shares of [0, -1, 1e12 + 1]) {
    const result = run([year()], { shares });
    assert.ok(hasError(result, 'shares', 'range'));
    assert.equal(result.forecast[0].revenue, 1000);
    assert.equal(result.forecast[0].shares, null);
  }
  for (const revenue of [-1, 1e12 + 1]) {
    const result = run([year()], { revenue });
    assert.ok(hasError(result, 'revenue', 'range'));
    assert.equal(result.forecast[0].revenue, null);
    assert.equal(result.forecast[0].shares, 100);
  }
});

test('-100% growth makes subsequent revenues zero without treating zero as missing', () => {
  const result = run([year({ growth: -100 }), year({ growth: 300 })]);
  assert.equal(result.valid, true);
  result.forecast.forEach(row => {
    assert.equal(row.revenue, 0);
    assert.equal(row.ebit, 0);
    assert.equal(row.shares, 100);
    assert.equal(row.price, null);
  });
});

test('extreme assumptions warn without clamping and warnings are deduplicated globally', () => {
  const result = run([year({ growth: 100 }), year({ growth: 100, buyback: 25, capitalConfirmed: false })]);
  assert.equal(result.valid, true);
  assert.equal(result.forecast[1].revenue, 4000);
  assert.equal(result.warnings.filter(code => code === 'extreme_assumptions').length, 1);
  assert.ok(result.warnings.includes('capital_balances_unconfirmed'));
});

test('price overflow is reported locally without losing independently valid results', () => {
  const row = first({}, { shares: Number.MIN_VALUE });
  assert.equal(row.revenue, 1000);
  assert.equal(row.ebit, 200);
  assert.equal(row.equity, 1900);
  assert.equal(row.price, null);
  assert.ok(hasError(row, 'price', 'overflow'));
});

test('share-count underflow is explicit and does not turn into an infinite price', () => {
  const row = first({ buyback: 99 }, { shares: Number.MIN_VALUE });
  assert.equal(row.revenue, 1000);
  assert.equal(row.equity, 1900);
  assert.equal(row.shares, null);
  assert.equal(row.price, null);
  assert.ok(hasError(row, 'shares', 'underflow'));
});

test('upside overflow does not suppress an otherwise valid modeled price', () => {
  const row = first({}, { price: Number.MIN_VALUE });
  assert.equal(row.price, 19);
  assert.equal(row.upside, null);
  assert.equal(row.valuationValid, true);
  assert.ok(hasError(row, 'upside', 'overflow'));
});

test('varied ten-year paths preserve gross share accounting and all valuation identities', () => {
  // Fixed deterministic paths exercise fractional rates without randomness.
  for (let path = 0; path < 30; path++) {
    const inputs = Array.from({ length: 10 }, (_, index) => year({
      growth: ((path * 17 + index * 13) % 80) - 30,
      margin: 1 + ((path * 7 + index * 19) % 60),
      buyback: ((path * 3 + index * 7) % 200) / 10,
      dilution: ((path * 5 + index * 11) % 150) / 10,
      multiple: 1 + ((path * 11 + index * 17) % 50),
      cash: path * 15 + index * 20,
      debt: path * 8 + index * 10,
      claims: index * 5
    }));
    const result = run(inputs);
    assert.equal(result.valid, true);
    let revenue = base.revenue, shares = base.shares;
    result.forecast.forEach((row, index) => {
      const input = inputs[index];
      revenue *= 1 + input.growth / 100;
      near(row.revenue, revenue);
      near(row.startShares, shares);
      near(row.shares, shares - row.buybackShares + row.dilutionShares);
      shares *= 1 - input.buyback / 100 + input.dilution / 100;
      near(row.shares, shares);
      near(row.ebit, revenue * input.margin / 100);
      near(row.ev, row.ebit * input.multiple);
      near(row.equity, row.ev + input.cash - input.debt - input.claims);
      near(row.price, Math.max(0, row.equity) / shares);
      near(row.upside, (row.price / base.price - 1) * 100);
    });
  }
});

test('all error locations identify the year and the model never emits NaN or infinity', () => {
  const result = run([year({ cash: '' }), year({ growth: null, buyback: 100 }), year()]);
  for (const row of result.forecast) {
    row.errors.forEach(error => assert.equal(error.year, row.year));
    for (const value of Object.values(row)) if (typeof value === 'number') assert.equal(Number.isFinite(value), true);
  }
  assert.doesNotThrow(() => JSON.stringify(result));
});
