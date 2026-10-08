import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildValuationInputs} from '../supabase/functions/wave-data/valuation-inputs.ts';

const now = Date.parse('2026-10-08T09:00:00Z');
const ACCN = '0000123456-26-000010';
const PREV_ACCN = '0000123456-25-000010';
const quote = {price: 20, currency: 'USD', price_timestamp: '2026-10-07T20:00:00Z'};
const annual = (val, overrides = {}) => ({start: '2025-01-01', end: '2025-12-31', val, accn: ACCN, filed: '2026-02-20', form: '10-K', fp: 'FY', fy: 2025, ...overrides});
const instant = (val, end = '2025-12-31', overrides = {}) => ({end, val, accn: ACCN, filed: '2026-02-20', form: '10-K', fp: 'FY', fy: 2025, ...overrides});
function fixture() {
  return {ticker: 'TEST', fetched_at: '2026-10-08T08:00:00Z', document: {cik: 123456, entityName: 'Fixture Incorporated', facts: {
    'us-gaap': {
      RevenueFromContractWithCustomerExcludingAssessedTax: {units: {USD: [annual(1200), annual(1000, {start: '2024-01-01', end: '2024-12-31'})]}},
      OperatingIncomeLoss: {units: {USD: [annual(240), annual(100, {start: '2024-01-01', end: '2024-12-31'})]}},
      CommonStockSharesOutstanding: {units: {shares: [instant(95), instant(100, '2024-12-31')]}},
      WeightedAverageNumberOfDilutedSharesOutstanding: {units: {shares: [annual(107)]}},
      StockRepurchasedAndRetiredDuringPeriodShares: {units: {shares: [annual(10)]}},
      CashAndCashEquivalentsAtCarryingValue: {units: {USD: [instant(200)]}},
      DebtAndCapitalLeaseObligations: {units: {USD: [instant(300)]}},
    },
    dei: {EntityCommonStockSharesOutstanding: {units: {shares: [instant(94, '2026-02-01')]}}},
  }}};
}
const us = f => f.document.facts['us-gaap'];
const result = (f = fixture(), q = quote) => buildValuationInputs('test', f, q, now);
const add = (f, concept, unit, rows) => {us(f)[concept] = {units: {[unit]: rows}};};
function close(a, b, tolerance = 1e-9) {assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);}

test('full FY actuals, aligned margin, strict point-in-time shares and provenance', () => {
  const r = result();
  assert.equal(r.fiscal_year_start, '2025-01-01'); assert.equal(r.fiscal_year_end, '2025-12-31');
  assert.equal(r.fields.revenue.value, 1200); close(r.fields.revenue_growth_pct.value, 20);
  assert.equal(r.fields.operating_margin_pct.value, 20); assert.equal(r.fields.shares_outstanding.value, 95);
  assert.equal(r.fields.cash.value, 200); assert.equal(r.fields.total_debt.value, 300);
  assert.equal(r.fields.buyback_pct.value, 10); assert.equal(r.history[0].opening_shares_outstanding.value, 100);
  assert.equal(r.fields.gross_dilution_pct.value, null); assert.equal(r.fields.historical_ev_ebit.value, null);
  for (const f of Object.values(r.fields)) for (const key of ['value', 'unit', 'period_start', 'period_end', 'source', 'url', 'status']) assert.ok(key in f, key);
  assert.equal(r.fields.revenue.accession, ACCN); assert.equal(r.fields.revenue.filed, '2026-02-20');
  assert.equal(r.fields.revenue.concept, 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax');
  assert.match(r.fields.revenue.url, /123456\/000012345626000010\/0000123456-26-000010-index.html$/);
  assert.equal(r.fields.current_price.as_of, new Date(quote.price_timestamp).toISOString());
  assert.equal(r.fields.current_price.period_end, '2026-10-07');
});
test('accepts the raw document and does not mutate its inputs', () => {
  const f = fixture(), before = JSON.stringify(f), q = {...quote};
  assert.equal(result(f.document, q).fields.revenue.value, 1200);
  assert.equal(JSON.stringify(f), before); assert.deepEqual(q, quote);
});
test('null, non-numeric and missing amounts never become zero', () => {
  for (const bad of [null, undefined, NaN, Infinity, '', false, true, '0']) {
    const f = fixture(); us(f).CashAndCashEquivalentsAtCarryingValue.units.USD[0].val = bad;
    assert.equal(result(f).fields.cash.value, null);
  }
  const f = fixture(); delete us(f).CashAndCashEquivalentsAtCarryingValue;
  assert.equal(result(f).fields.cash.value, null);
});
test('reported zeros remain valid, but zero revenue cannot produce a margin', () => {
  const f = fixture();
  for (const key of ['CashAndCashEquivalentsAtCarryingValue', 'DebtAndCapitalLeaseObligations']) us(f)[key].units.USD[0].val = 0;
  us(f).StockRepurchasedAndRetiredDuringPeriodShares.units.shares[0].val = 0;
  const r = result(f); assert.equal(r.fields.cash.value, 0); assert.equal(r.fields.total_debt.value, 0); assert.equal(r.fields.buyback_pct.value, 0);
  us(f).RevenueFromContractWithCustomerExcludingAssessedTax.units.USD[0].val = 0;
  assert.equal(result(f).fields.revenue.value, 0); assert.equal(result(f).fields.operating_margin_pct.value, null);
});
test('negative operating income is preserved, negative cash/debt/shares are not', () => {
  const f = fixture(); us(f).OperatingIncomeLoss.units.USD[0].val = -120;
  us(f).CashAndCashEquivalentsAtCarryingValue.units.USD[0].val = -1;
  us(f).DebtAndCapitalLeaseObligations.units.USD[0].val = -1;
  us(f).CommonStockSharesOutstanding.units.shares[0].val = -1;
  const r = result(f); assert.equal(r.fields.operating_margin_pct.value, -10);
  for (const name of ['cash', 'total_debt', 'shares_outstanding']) assert.equal(r.fields[name].value, null);
});
test('quarterly and year-to-date duration facts cannot replace annual revenue', () => {
  const f = fixture();
  us(f).RevenueFromContractWithCustomerExcludingAssessedTax.units.USD.push(annual(9999, {start: '2026-01-01', end: '2026-06-30', filed: '2026-08-01', form: '10-Q', fp: 'Q2'}));
  const r = result(f); assert.equal(r.fields.revenue.value, 1200); assert.equal(r.fiscal_year_end, '2025-12-31');
});
test('rejects stub periods, invalid dates, future filings and future facts', () => {
  const f = fixture();
  us(f).RevenueFromContractWithCustomerExcludingAssessedTax.units.USD.push(
    annual(999, {start: '2026-01-01', end: '2026-09-30', filed: '2026-10-01'}),
    annual(999, {start: '2025-01-01', end: '2025-02-30'}),
    annual(888, {filed: '2027-01-01'}),
    annual(777, {start: '2026-01-01', end: '2026-12-31'}));
  assert.equal(result(f).fields.revenue.value, 1200);
});
test('newer operating FY with missing revenue is not silently replaced by old revenue', () => {
  const f = fixture();
  us(f).OperatingIncomeLoss.units.USD.push(annual(300, {start: '2025-07-01', end: '2026-06-30', filed: '2026-07-30'}));
  const r = result(f); assert.equal(r.fiscal_year_end, '2026-06-30'); assert.equal(r.fields.revenue.value, null);
});
test('a null latest revenue row remains missing rather than falling back to a prior year', () => {
  const f = fixture(); us(f).RevenueFromContractWithCustomerExcludingAssessedTax.units.USD[0].val = null;
  const r = result(f); assert.equal(r.fiscal_year_end, '2025-12-31'); assert.equal(r.fields.revenue.value, null);
});
test('newer low-priority total revenue concept wins by period, not concept order', () => {
  const f = fixture(); add(f, 'Revenues', 'USD', [annual(1500, {start: '2025-07-01', end: '2026-06-30', filed: '2026-07-30'})]);
  const r = result(f); assert.equal(r.fields.revenue.value, 1500); assert.equal(r.fiscal_year_end, '2026-06-30');
});
test('different revenue concepts and reporting bases are not blended', () => {
  const f = fixture(); us(f).RevenueFromContractWithCustomerExcludingAssessedTax.units.USD.pop();
  add(f, 'Revenues', 'USD', [annual(1000, {start: '2024-01-01', end: '2024-12-31'})]);
  assert.equal(result(f).fields.revenue_growth_pct.value, null);
  add(f, 'Revenues', 'USD', [annual(1400)]);
  assert.equal(result(f).fields.revenue.value, null); assert.equal(result(f).fields.revenue.status, 'ambiguous');
});
test('growth requires contiguous preceding FY and a positive denominator', () => {
  const f = fixture(), rows = us(f).RevenueFromContractWithCustomerExcludingAssessedTax.units.USD;
  rows[1] = annual(1000, {start: '2023-01-01', end: '2023-12-31'});
  assert.equal(result(f).fields.revenue_growth_pct.value, null);
  rows[1] = annual(0, {start: '2024-01-01', end: '2024-12-31'});
  assert.equal(result(f).fields.revenue_growth_pct.value, null);
});
test('mismatched FY periods or filings cannot produce operating margin or balance inputs', () => {
  const f = fixture(); us(f).OperatingIncomeLoss.units.USD[0].start = '2025-01-02';
  us(f).CashAndCashEquivalentsAtCarryingValue.units.USD[0].accn = PREV_ACCN;
  const r = result(f); assert.equal(r.fields.operating_margin_pct.value, null); assert.equal(r.fields.cash.value, null);
});
test('filing fy labels do not replace exact fiscal periods', () => {
  const f = fixture(); for (const rows of Object.values(us(f)).flatMap(v => Object.values(v.units))) for (const row of rows) row.fy = 2026;
  const r = result(f); assert.equal(r.fiscal_year_end, '2025-12-31'); close(r.fields.revenue_growth_pct.value, 20);
});
test('52/53-week fiscal years are allowed with exact preceding dates', () => {
  const f = fixture();
  add(f, 'RevenueFromContractWithCustomerExcludingAssessedTax', 'USD', [annual(416161e6, {start: '2024-09-29', end: '2025-09-27'}), annual(391035e6, {start: '2023-10-01', end: '2024-09-28'})]);
  add(f, 'OperatingIncomeLoss', 'USD', [annual(133050e6, {start: '2024-09-29', end: '2025-09-27'})]);
  const r = result(f); assert.equal(r.fiscal_year_end, '2025-09-27'); close(r.fields.revenue_growth_pct.value, (416161/391035-1)*100);
});
test('restatements replace prior filings, components from prior accession are not mixed in', () => {
  const f = fixture();
  const amended = '0000123456-26-000099';
  us(f).RevenueFromContractWithCustomerExcludingAssessedTax.units.USD.push(annual(1500, {accn: amended, filed: '2026-03-20', form: '10-K/A'}));
  const r = result(f); assert.equal(r.fields.revenue.value, 1500); assert.equal(r.fields.operating_margin_pct.value, null); assert.equal(r.fields.buyback_pct.value, null);
});
test('conflicting duplicate facts require manual review; exact duplicates are harmless', () => {
  const f = fixture(), rows = us(f).CommonStockSharesOutstanding.units.shares;
  rows.push(instant(95)); assert.equal(result(f).fields.shares_outstanding.value, 95);
  rows.push(instant(90)); assert.equal(result(f).fields.shares_outstanding.value, null);
});
test('weighted-average shares and shares issued are never substituted for outstanding shares', () => {
  const f = fixture(); delete us(f).CommonStockSharesOutstanding;
  add(f, 'CommonStockSharesIssued', 'shares', [instant(120)]);
  assert.equal(result(f).fields.shares_outstanding.value, null); assert.equal(result(f).fields.buyback_pct.value, null);
});
test('absent non-dimensional DEI class guard blocks aggregate shares for multi-class issuers', () => {
  const f = fixture(); delete f.document.facts.dei.EntityCommonStockSharesOutstanding;
  const r = result(f); assert.equal(r.fields.shares_outstanding.value, null); assert.equal(r.fields.shares_outstanding.status, 'ambiguous'); assert.equal(r.fields.buyback_pct.value, null);
});
test('dimensioned share facts are not accepted as entity-wide facts', () => {
  const f = fixture(); us(f).CommonStockSharesOutstanding.units.shares[0].dimensions = {'ClassOfStockAxis': 'ClassAMember'};
  assert.equal(result(f).fields.shares_outstanding.value, null);
});
test('material cover-vs-FY share count discrepancies do not create false per-share values', () => {
  const f = fixture(); f.document.facts.dei.EntityCommonStockSharesOutstanding.units.shares[0].val = 940;
  assert.equal(result(f).fields.shares_outstanding.value, null); assert.equal(result(f).fields.buyback_pct.value, null);
});
test('FY-end outstanding decline is never labeled as gross buybacks or dilution', () => {
  const f = fixture(); delete us(f).StockRepurchasedAndRetiredDuringPeriodShares;
  const r = result(f); assert.equal(r.fields.buyback_pct.value, null); assert.equal(r.fields.gross_dilution_pct.value, null);
});
test('repurchase cash flow cannot become repurchased shares or a buyback rate', () => {
  const f = fixture(); delete us(f).StockRepurchasedAndRetiredDuringPeriodShares;
  add(f, 'PaymentsForRepurchaseOfCommonStock', 'USD', [annual(500)]);
  assert.equal(result(f).fields.buyback_pct.value, null); assert.equal(result(f).history[0].repurchased_shares.value, null);
});
test('annual repurchases use opening shares from same filing and exact preceding FY-end', () => {
  const f = fixture(); us(f).CommonStockSharesOutstanding.units.shares[1].accn = PREV_ACCN;
  assert.equal(result(f).fields.buyback_pct.value, null);
  us(f).CommonStockSharesOutstanding.units.shares[1].accn = ACCN;
  us(f).CommonStockSharesOutstanding.units.shares[1].end = '2024-12-30';
  assert.equal(result(f).fields.buyback_pct.value, null);
});
test('multiple repurchase disposition tags are not added or treated as aliases', () => {
  const f = fixture(); add(f, 'TreasuryStockSharesAcquired', 'shares', [annual(10)]);
  const r = result(f); assert.equal(r.fields.buyback_pct.value, null); assert.equal(r.history[0].repurchased_shares.status, 'ambiguous');
});
test('known splits during repurchase year prevent incompatible buyback comparison', () => {
  const f = fixture(); add(f, 'StockholdersEquityNoteStockSplitConversionRatio1', 'pure', [{start:'2025-01-01',end:'2025-08-01',val:4,filed:'2025-09-01',form:'10-Q'}]);
  const r = result(f); assert.equal(r.fields.buyback_pct.value, null); assert.equal(r.fields.buyback_pct.status, 'ambiguous'); assert.equal(r.fields.shares_outstanding.value, 95);
});
test('known splits after the base FY block the old starting count against a current quote', () => {
  const f = fixture(); add(f, 'StockholdersEquityNoteStockSplitConversionRatio1', 'pure', [{end:'2026-08-01',val:4,filed:'2026-09-01',form:'10-Q'}]);
  const r = result(f); assert.equal(r.fields.shares_outstanding.value, null); assert.match(r.fields.shares_outstanding.reason, /subsequent stock split/);
});
test('long-term debt, liabilities and commercial paper alone are not total debt', () => {
  const f = fixture(); delete us(f).DebtAndCapitalLeaseObligations;
  add(f, 'LongTermDebt', 'USD', [instant(250)]); add(f, 'LongTermDebtCurrent', 'USD', [instant(50)]); add(f, 'LongTermDebtNoncurrent', 'USD', [instant(200)]);
  add(f, 'CommercialPaper', 'USD', [instant(25)]); add(f, 'Liabilities', 'USD', [instant(800)]);
  assert.equal(result(f).fields.total_debt.value, null);
});
test('complete current/noncurrent debt aggregates sum without double-counting', () => {
  const f = fixture(); delete us(f).DebtAndCapitalLeaseObligations;
  add(f, 'DebtCurrent', 'USD', [instant(50)]); add(f, 'LongTermDebtAndCapitalLeaseObligations', 'USD', [instant(200)]);
  add(f, 'LongTermDebt', 'USD', [instant(240)]); add(f, 'LongTermDebtCurrent', 'USD', [instant(40)]);
  assert.equal(result(f).fields.total_debt.value, 250); assert.equal(result(f).fields.total_debt.components.length, 2);
});
test('complete short-term plus all long-term-and-lease debt requires explicit zero components', () => {
  const f = fixture(); delete us(f).DebtAndCapitalLeaseObligations;
  add(f, 'LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities', 'USD', [instant(250)]);
  assert.equal(result(f).fields.total_debt.value, null);
  add(f, 'ShortTermBorrowings', 'USD', [instant(0)]); assert.equal(result(f).fields.total_debt.value, 250);
});
test('debt component currency, date or accession mismatch cannot fill missing total', () => {
  for (const change of [{end: '2024-12-31'}, {accn: PREV_ACCN}]) {
    const f = fixture(); delete us(f).DebtAndCapitalLeaseObligations;
    add(f, 'DebtCurrent', 'USD', [instant(50, '2025-12-31', change)]); add(f, 'LongTermDebtAndCapitalLeaseObligations', 'USD', [instant(200)]);
    assert.equal(result(f).fields.total_debt.value, null);
  }
  const f = fixture(); delete us(f).DebtAndCapitalLeaseObligations;
  add(f, 'DebtCurrent', 'EUR', [instant(50)]); add(f, 'LongTermDebtAndCapitalLeaseObligations', 'USD', [instant(200)]);
  assert.equal(result(f).fields.total_debt.value, null);
});
test('conflicting complete debt formulas are ambiguous', () => {
  const f = fixture(); delete us(f).DebtAndCapitalLeaseObligations;
  add(f, 'DebtCurrent', 'USD', [instant(50)]); add(f, 'LongTermDebtAndCapitalLeaseObligations', 'USD', [instant(200)]);
  add(f, 'ShortTermBorrowings', 'USD', [instant(0)]); add(f, 'LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities', 'USD', [instant(300)]);
  assert.equal(result(f).fields.total_debt.value, null); assert.equal(result(f).fields.total_debt.status, 'ambiguous');
});
test('quote currency never gates USD financial history; foreign reporting currencies and IFRS are unsupported', () => {
  for (const currency of ['EUR', 'GBp', null, undefined]) {const r = result(fixture(), {...quote, currency}); assert.equal(r.status, 'partial'); assert.equal(r.currency, 'USD'); assert.equal(r.fields.revenue.value, 1200); assert.equal(r.fields.current_price.value, null);}
  for (const q of [null, undefined, {}]) {const r = buildValuationInputs('TEST', fixture(), q, now); assert.equal(r.fields.revenue.value, 1200); assert.equal(r.history.length, 2); assert.equal(r.fields.current_price.value, null);}
  const f = fixture(); us(f).RevenueFromContractWithCustomerExcludingAssessedTax.units.EUR = [annual(1000)];
  assert.equal(result(f).status, 'unsupported'); assert.equal(result(f).fields.revenue.value, null);
  const foreign = fixture(); foreign.document.facts['ifrs-full'] = foreign.document.facts['us-gaap']; delete foreign.document.facts['us-gaap'];
  assert.equal(result(foreign).status, 'unsupported');
});
test('missing, invalid or future quote timestamps do not produce an available quote', () => {
  for (const price of [null, 0, -1, Infinity, '20']) assert.equal(result(fixture(), {...quote, price}).fields.current_price.value, null);
  for (const price_timestamp of [null, 'not-a-date', '2027-01-01T00:00:00Z']) assert.equal(result(fixture(), {...quote, price_timestamp}).fields.current_price.value, null);
});
test('no current-price-derived historical multiple is fabricated', () => {
  const r = result(fixture(), {...quote, price: 1000});
  assert.equal(r.fields.historical_ev_ebit.value, null); assert.match(r.fields.historical_ev_ebit.reason, /Current quote times dated shares/);
});
test('stale cache and old annual data are surfaced independently', () => {
  const f = fixture(); f.stale_fallback = true;
  const r = result(f); assert.ok(r.warnings.some(x => x.field === 'cache')); assert.equal(r.fetched_at, f.fetched_at);
});
test('module has no fetch, database writes, runtime credentials or imports', () => {
  const source = fs.readFileSync(new URL('../supabase/functions/wave-data/valuation-inputs.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|\bDeno\.env|\b(?:insert|update|upsert|rpc)\s*\(|^import\s/m);
});


test('every historical FY has typed growth, cash, debt, dilution and multiple fields', () => {
  const r = result();
  for (const year of r.history) for (const name of ['revenue_growth_pct', 'cash', 'total_debt', 'gross_dilution_pct', 'historical_ev_ebit', 'reported_long_term_debt', 'commercial_paper', 'finance_lease_liabilities']) {
    const value = year[name];
    assert.ok(value && 'value' in value && 'source' in value && 'unit' in value && 'status' in value, name);
    assert.equal(value.period_end, year.period_end, name);
  }
  assert.deepEqual(r.fields.revenue_growth_pct, r.history[0].revenue_growth_pct);
  assert.deepEqual(r.fields.cash, r.history[0].cash);
  assert.deepEqual(r.fields.total_debt, r.history[0].total_debt);
});

function comparativeFixture() {
  const f = fixture();
  // Later filing repeats the 2024 income statement but omits its balance sheet.
  const prior = (val, overrides = {}) => annual(val, {start:'2024-01-01', end:'2024-12-31', accn:PREV_ACCN, filed:'2025-02-20', fy:2024, ...overrides});
  us(f).RevenueFromContractWithCustomerExcludingAssessedTax.units.USD.push(prior(1000), prior(800, {start:'2023-01-01',end:'2023-12-31'}));
  us(f).OperatingIncomeLoss.units.USD.push(prior(100));
  us(f).CommonStockSharesOutstanding.units.shares = [instant(95), instant(100,'2024-12-31',{accn:PREV_ACCN,filed:'2025-02-20'}), instant(110,'2023-12-31',{accn:PREV_ACCN,filed:'2025-02-20'})];
  us(f).CashAndCashEquivalentsAtCarryingValue.units.USD.push(instant(150,'2024-12-31',{accn:PREV_ACCN,filed:'2025-02-20'}));
  us(f).StockRepurchasedAndRetiredDuringPeriodShares.units.shares.push(prior(12));
  f.document.facts.dei.EntityCommonStockSharesOutstanding.units.shares.push(instant(99,'2025-02-01',{accn:PREV_ACCN,filed:'2025-02-20'}));
  return f;
}
test('omitted comparative balance and repurchase facts use earlier reconciled filing', () => {
  const f = comparativeFixture(); const y = result(f).history.find(x => x.period_end === '2024-12-31');
  assert.equal(y.revenue.accession, ACCN); assert.equal(y.revenue.value, 1000);
  assert.equal(y.cash.value, 150); assert.equal(y.cash.accession, PREV_ACCN);
  assert.equal(y.shares_outstanding.value, 100); assert.equal(y.repurchased_shares.value, 12);
  close(y.buyback_pct.value, 12/110*100); close(y.revenue_growth_pct.value, 25);
  assert.ok(y.buyback_pct.components.every(x => x.accession === PREV_ACCN));
  assert.ok(y.revenue_growth_pct.components.every(x => x.accession === PREV_ACCN));
});
test('comparative fallback does not cross a revenue or operating-income restatement', () => {
  for (const concept of ['RevenueFromContractWithCustomerExcludingAssessedTax','OperatingIncomeLoss']) {
    const f = comparativeFixture();
    us(f)[concept].units.USD.find(x => x.accn === ACCN && x.end === '2024-12-31').val += 1;
    const y = result(f).history.find(x => x.period_end === '2024-12-31');
    assert.equal(y.cash.value, null); assert.equal(y.shares_outstanding.value, null); assert.equal(y.buyback_pct.value, null);
  }
});
test('explicit null or conflicting comparative facts are not replaced by older values', () => {
  const f = comparativeFixture(); us(f).CashAndCashEquivalentsAtCarryingValue.units.USD.push(instant(null, '2024-12-31'));
  assert.equal(result(f).history.find(x => x.period_end === '2024-12-31').cash.value, null);
});
test('reported debt component subtotal is distinct from complete borrowings and total debt', () => {
  const f = fixture(); delete us(f).DebtAndCapitalLeaseObligations;
  add(f,'LongTermDebt','USD',[instant(200)]); add(f,'CommercialPaper','USD',[instant(25)]); add(f,'FinanceLeaseLiability','USD',[instant(30)]);
  const r = result(f); assert.equal(r.fields.reported_long_term_debt.value,200);
  assert.equal(r.fields.commercial_paper.value,25); assert.equal(r.fields.finance_lease_liabilities.value,30);
  assert.equal(r.fields.reported_term_debt_and_commercial_paper.value,225);
  assert.equal(r.fields.reported_borrowings.value,null); assert.equal(r.fields.total_debt.value,null);
  add(f,'ShortTermBorrowings','USD',[instant(40)]);
  assert.equal(result(f).fields.reported_borrowings.value,240); assert.equal(result(f).fields.total_debt.value,null);
});

const snapshotPath = new URL('../../outputs/equity-valuation-history.json', import.meta.url);
test('reviewed static demo has five sourced historical columns and no fabricated quote or total debt', {skip: !fs.existsSync(snapshotPath)}, () => {
  const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const expected = {
    AAPL: [
      ['2025-09-27',416161,133050,14773.260,35934,90678,7979,1230],
      ['2024-09-28',391035,123216,15116.786,29943,96662,9967,896],
      ['2023-09-30',383285,114301,15550.061,29965,105103,5985,1024],
      ['2022-09-24',394328,119437,15943.425,23646,110087,9982,941],
      ['2021-09-25',365817,108949,16426.786,34940,118719,6000,848],
    ],
    MSFT: [
      ['2026-06-30',331839,155237,7427,20935,40294,null,66594],
      ['2025-06-30',281724,128528,7434,30242,43151,0,46172],
      ['2024-06-30',245122,109433,7434,18315,44937,6693,27145],
      ['2023-06-30',211915,88523,7432,34704,47237,0,17067],
      ['2022-06-30',198270,83383,7464,13931,49781,null,14902],
    ],
  };
  const names = ['revenue','operating_income','shares_outstanding','cash','reported_long_term_debt','commercial_paper','finance_lease_liabilities'];
  for (const [symbol, rows] of Object.entries(expected)) {
    const snapshot = data.snapshots[symbol];
    assert.equal(snapshot.currency,'USD'); assert.equal(snapshot.fields.current_price.value,null);
    assert.ok(snapshot.original_filings.length >= 5);
    for (let index=0;index<rows.length;index++) {
      const [end,...values] = rows[index], y = snapshot.history[index];
      assert.equal(y.period_end,end);
      for (let column=0;column<names.length;column++) {
        const f = y[names[column]], expectedValue = values[column];
        assert.equal(f.value == null ? null : f.value/1e6, expectedValue, `${symbol} ${end} ${names[column]}`);
        assert.equal(f.period_end,end);
        if (f.value != null) {assert.equal(f.status,'ok');assert.ok(f.accession);assert.ok(f.filed);assert.match(f.url,/https:\/\/www.sec.gov\/Archives\/edgar\/data\//);}
      }
      for (const name of ['revenue_growth_pct','operating_margin_pct','buyback_pct']) assert.ok(Number.isFinite(y[name].value));
      for (const name of ['total_debt','reported_borrowings','gross_dilution_pct','historical_ev_ebit']) assert.equal(y[name].value,null);
      close(y.operating_margin_pct.value,y.operating_income.value/y.revenue.value*100);
      close(y.buyback_pct.value,y.repurchased_shares.value/y.opening_shares_outstanding.value*100);
    }
  }
});
