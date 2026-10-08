/**
 * Read-only, deterministic SEC CompanyFacts adapter. No fetch, cache write, or
 * forecast defaults live here. Amounts are unscaled USD; percentages are points.
 *
 * Primary definitions: https://xbrl.fasb.org/us-gaap/2026/elts/us-gaap-doc-2026.xml
 * API scope: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
 * A missing tag is not a zero. CompanyFacts omits custom and dimensional facts.
 */
export type ValuationField = {
  value: number | null;
  unit: string;
  period_start: string | null;
  period_end: string | null;
  source: string;
  url: string | null;
  status: 'ok' | 'missing' | 'unsupported' | 'ambiguous';
  reason: string | null;
  concept?: string;
  accession?: string;
  filed?: string;
  form?: string;
  as_of?: string | null;
  components?: ValuationField[];
};
type Fact = {concept: string; namespace: string; unit: string; row: any};
type Context = {doc: any; facts: any; today: string; cik: string; sourceUrl: string | null};
const DAY = 86400000;
const ANNUAL_FORMS = new Set(['10-K', '10-K/A']);
const REVENUE = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RegulatedAndUnregulatedOperatingRevenue'];
const REPURCHASE = ['StockRepurchasedAndRetiredDuringPeriodShares', 'StockRepurchasedDuringPeriodShares', 'TreasuryStockSharesAcquired'];
const SEC = 'SEC EDGAR CompanyFacts';

function number(value: any): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}
function date(value: any): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const stamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value ? value : null;
}
function days(start: string, end: string) { return (Date.parse(end) - Date.parse(start)) / DAY; }
function priorDay(start: string) { return new Date(Date.parse(start) - DAY).toISOString().slice(0, 10); }
function plainContext(row: any) {
  return !['segment', 'dimensions', 'dim', 'axis', 'member'].some(key => row?.[key] != null && Object.keys(Object(row[key])).length > 0);
}
function observations(ctx: Context, concepts: string[], unit: string, duration: boolean, namespace = 'us-gaap'): Fact[] {
  return concepts.flatMap(concept => {
    const rows = ctx.doc?.facts?.[namespace]?.[concept]?.units?.[unit];
    if (!Array.isArray(rows)) return [];
    return rows.filter((row: any) => {
      if (!row || !ANNUAL_FORMS.has(row.form) || !plainContext(row)) return false;
      const end = date(row.end), filed = date(row.filed);
      if (!end || !filed || end > ctx.today || filed > ctx.today || !/^\d{10}-\d{2}-\d{6}$/.test(String(row.accn || ''))) return false;
      if (duration) {
        const start = date(row.start);
        return !!start && row.fp === 'FY' && days(start, end) >= 350 && days(start, end) <= 380;
      }
      return row.start == null;
    }).map((row: any) => ({concept, namespace, unit, row}));
  });
}
function unavailable(ctx: Context, unit: string, reason: string, status: ValuationField['status'] = 'missing', start: string | null = null, end: string | null = null): ValuationField {
  return {value: null, unit, period_start: start, period_end: end, source: SEC, url: ctx.sourceUrl, status, reason};
}
function field(ctx: Context, fact: Fact): ValuationField {
  return {
    value: number(fact.row.val), unit: fact.unit, period_start: date(fact.row.start), period_end: fact.row.end,
    source: SEC, url: ctx.cik ? `https://www.sec.gov/Archives/edgar/data/${Number(ctx.cik)}/${fact.row.accn.replaceAll('-', '')}/${fact.row.accn}-index.html` : ctx.sourceUrl,
    status: 'ok', reason: null, concept: `${fact.namespace}:${fact.concept}`,
    accession: fact.row.accn, filed: fact.row.filed, form: fact.row.form,
  };
}
function select(ctx: Context, rows: Fact[], unit: string, reason: string, start: string | null, end: string | null): ValuationField {
  if (!rows.length) return unavailable(ctx, unit, reason, 'missing', start, end);
  const sorted = rows.slice().sort((a, b) => b.row.filed.localeCompare(a.row.filed) || b.row.accn.localeCompare(a.row.accn));
  const latest = sorted[0];
  const sameFiling = sorted.filter(x => x.row.accn === latest.row.accn);
  const values = [...new Set(sameFiling.map(x => number(x.row.val)))];
  if (values.length !== 1) return unavailable(ctx, unit, 'Conflicting values in the same filing; review the original report.', 'ambiguous', start, end);
  if (values[0] == null) return unavailable(ctx, unit, 'The reported value is null or not a finite number.', 'missing', start, end);
  return field(ctx, latest);
}
function atPeriod(ctx: Context, concepts: string[], unit: string, start: string, end: string, accession?: string): ValuationField {
  const rows = observations(ctx, concepts, unit, true).filter(x => x.row.start === start && x.row.end === end && (!accession || x.row.accn === accession));
  return select(ctx, rows, unit, 'No matching full-fiscal-year fact on a comparable reporting basis.', start, end);
}
function atInstant(ctx: Context, concepts: string[], unit: string, end: string, accession?: string, namespace = 'us-gaap'): ValuationField {
  const rows = observations(ctx, concepts, unit, false, namespace).filter(x => x.row.end === end && (!accession || x.row.accn === accession));
  return select(ctx, rows, unit, 'No point-in-time fact at the fiscal-year end in the same annual filing.', null, end);
}
function nonnegative(ctx: Context, input: ValuationField, positive = false) {
  if (input.value != null && (input.value < 0 || (positive && input.value === 0))) {
    return {...input, value: null, status: 'ambiguous' as const, reason: positive ? 'A strictly positive reported value is required.' : 'Negative values are not valid for this input.'};
  }
  return input;
}
function derived(ctx: Context, value: number, unit: string, start: string | null, end: string, reason: string, components: ValuationField[]): ValuationField {
  if (!Number.isFinite(value)) return unavailable(ctx, unit, 'Derived value is not finite.', 'ambiguous', start, end);
  return {value, unit, period_start: start, period_end: end, source: `Calculated from ${SEC}`, url: components[0]?.url || ctx.sourceUrl,
    status: 'ok', reason, accession: components[0]?.accession, filed: components[0]?.filed, components};
}
function shareBasis(ctx: Context, shares: ValuationField, end: string, accession?: string): string | null {
  if (shares.value == null) return shares.reason || 'Fiscal-year-end outstanding shares unavailable.';
  // Dimensioned multi-class cover facts are not included by CompanyFacts. Require
  // a unique entity-wide cover-page count as corroboration, not a WA EPS count.
  const balanceRows = observations(ctx, ['CommonStockSharesOutstanding'], 'shares', false).filter(x => x.row.accn === accession);
  const anchorEnd = balanceRows.map(x => x.row.end).sort().at(-1) || end;
  const anchor = select(ctx, balanceRows.filter(x => x.row.end === anchorEnd), 'shares', '', null, anchorEnd);
  const cover = observations(ctx, ['EntityCommonStockSharesOutstanding'], 'shares', false, 'dei')
    .filter(x => x.row.accn === accession && days(anchorEnd, x.row.end) >= 0 && days(anchorEnd, x.row.end) <= 120);
  if (!cover.length) return 'Single-class share basis is unverified: no entity-wide cover-page share count in the same filing.';
  const newest = cover.map(x => x.row.end).sort().at(-1)!;
  const selected = select(ctx, cover.filter(x => x.row.end === newest), 'shares', '', null, newest);
  if (selected.value == null || selected.value <= 0) return 'Conflicting or missing cover-page share counts; share classes may differ.';
  if (anchor.value == null || anchor.value <= 0) return 'The filing’s latest balance-sheet share basis is ambiguous.';
  const ratio = selected.value / anchor.value;
  if (ratio < 0.8 || ratio > 1.2) return 'Cover-page and FY-end share counts differ materially; split, class or capital change requires review.';
  const classRows = Object.keys(ctx.facts).filter(key => /(?:Class[A-Z].*SharesOutstanding|SharesOutstanding.*Class[A-Z])/.test(key));
  if (classRows.some(key => observations(ctx, [key], 'shares', false).some(x => x.row.accn === accession))) return 'Class-specific share counts require manual reconciliation.';
  return null;
}
function splitInPeriod(ctx: Context, start: string, end: string): boolean {
  const names = Object.keys(ctx.facts).filter(key => /(?:StockSplit|ReverseSplit).*(?:Ratio|Conversion)|StockholdersEquityNoteStockSplitConversionRatio/.test(key));
  return names.some(key => Object.values(ctx.facts[key]?.units || {}).some((rows: any) => Array.isArray(rows) && rows.some((r: any) => {
    const reported = date(r.filed), periodEnd = date(r.end), v = number(r.val);
    return !!reported && reported <= ctx.today && !!periodEnd && periodEnd >= start && periodEnd <= end && v != null && v !== 1 && v > 0;
  })));
}
function totalDebt(ctx: Context, end: string, accession?: string): ValuationField {
  const read = (concept: string) => nonnegative(ctx, atInstant(ctx, [concept], 'USD', end, accession));
  const direct = read('DebtAndCapitalLeaseObligations');
  if (direct.status === 'ambiguous') return direct;
  if (direct.value != null) return {...direct, reason: 'Reported total short- and long-term debt and capital/finance lease obligations; not total liabilities.'};
  // Each component must be explicitly reported, including any zero. Never infer
  // absent short-term borrowings are zero, nor add current maturities twice.
  const completeGroups = [
    ['DebtCurrent', 'LongTermDebtAndCapitalLeaseObligations'],
    ['ShortTermBorrowings', 'LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities'],
  ];
  const candidates = completeGroups.map(group => group.map(read)).filter(group => group.every(x => x.value != null));
  if (candidates.length) {
    const sums = candidates.map(group => group.reduce((sum, x) => sum + x.value!, 0));
    if (new Set(sums).size > 1) return unavailable(ctx, 'USD', 'Complete debt aggregates conflict; review debt and finance leases manually.', 'ambiguous', null, end);
    return derived(ctx, sums[0], 'USD', null, end, 'Complete non-overlapping debt aggregates from the same FY-end and filing, including capital/finance leases.', candidates[0]);
  }
  return unavailable(ctx, 'USD', 'A complete total of short- and long-term interest-bearing debt and finance leases could not be verified. Long-term debt alone, commercial paper alone, and total liabilities are not total debt.', 'missing', null, end);
}
// A later 10-K often repeats three income years but only two balance sheets.
// Permit an older report only for omitted comparative inputs, and only after
// reconciling the identical revenue concept and operating income to that report.
// Never fall back from a current-year filing/amendment or a conflicting/null fact.
function compatibleAccessions(ctx: Context, start: string, end: string, revenue: ValuationField, operatingIncome: ValuationField): string[] {
  if (!revenue.accession) return [];
  const primary = revenue.accession;
  const annualRows = observations(ctx, [...REVENUE, 'OperatingIncomeLoss', 'NetIncomeLoss'], 'USD', true);
  const primaryEnd = annualRows.filter(x => x.row.accn === primary).map(x => x.row.end).sort().at(-1);
  if (!primaryEnd || primaryEnd <= end || revenue.value == null || operatingIncome.value == null) return [primary];
  const concept = revenue.concept!.split(':')[1];
  const candidates = observations(ctx, [concept], 'USD', true)
    .filter(x => x.row.start === start && x.row.end === end && x.row.filed <= revenue.filed!)
    .sort((a, b) => b.row.filed.localeCompare(a.row.filed) || b.row.accn.localeCompare(a.row.accn));
  return [primary, ...new Set(candidates.map(x => x.row.accn as string))].filter((accn, index, all) => {
    if (all.indexOf(accn) !== index) return false;
    if (accn === primary) return true;
    return atPeriod(ctx, REVENUE, 'USD', start, end, accn).value === revenue.value
      && atPeriod(ctx, [concept], 'USD', start, end, accn).value === revenue.value
      && atPeriod(ctx, ['OperatingIncomeLoss'], 'USD', start, end, accn).value === operatingIncome.value;
  });
}
function historicalInstant(ctx: Context, concepts: string[], unit: string, end: string, accessions: string[]) {
  for (const accession of accessions) {
    if (observations(ctx, concepts, unit, false).some(x => x.row.end === end && x.row.accn === accession))
      return atInstant(ctx, concepts, unit, end, accession);
  }
  return unavailable(ctx, unit, 'No point-in-time fact at this fiscal-year end on a reconciled annual reporting basis.', 'missing', null, end);
}
function longTermDebt(ctx: Context, end: string, accession?: string) {
  const direct = nonnegative(ctx, atInstant(ctx, ['LongTermDebt'], 'USD', end, accession));
  if (direct.status === 'ambiguous') return direct;
  if (direct.value != null) return {...direct, reason: 'Reported long-term debt including current maturities; excludes separate short-term borrowings and finance leases.'};
  const current = nonnegative(ctx, atInstant(ctx, ['LongTermDebtCurrent'], 'USD', end, accession));
  const noncurrent = nonnegative(ctx, atInstant(ctx, ['LongTermDebtNoncurrent'], 'USD', end, accession));
  return current.value != null && noncurrent.value != null
    ? derived(ctx, current.value + noncurrent.value, 'USD', null, end, 'Reported current maturities plus noncurrent long-term debt in the same filing; excludes separate short-term borrowings and finance leases.', [current, noncurrent])
    : unavailable(ctx, 'USD', 'A reported long-term debt total or both current and noncurrent components are required.', 'missing', null, end);
}
function annualGrowth(ctx: Context, start: string, end: string, revenue: ValuationField, accessions: string[]) {
  const concept = revenue.concept?.split(':')[1];
  if (concept && revenue.value != null) for (const accession of accessions) {
    const priorEnd = priorDay(start);
    const rows = observations(ctx, [concept], 'USD', true).filter(x => x.row.end === priorEnd && x.row.accn === accession);
    const starts = [...new Set(rows.map(x => x.row.start))];
    if (!rows.length) continue;
    const previous = starts.length === 1 ? select(ctx, rows, 'USD', '', starts[0], priorEnd) : null;
    if (previous?.value != null && previous.value > 0) {
      const sameFilingRevenue = atPeriod(ctx, [concept], 'USD', start, end, accession);
      return derived(ctx, (revenue.value / previous.value - 1) * 100, '%', start, end,
        'Full FY revenue versus immediately preceding full FY, same revenue concept, currency and filing; not quarterly growth or a forward estimate.', [sameFilingRevenue, previous]);
    }
    break;
  }
  return unavailable(ctx, '%', 'A positive, contiguous prior-FY revenue fact with the same concept, currency and filing is required.', 'missing', start, end);
}
function yearInputs(ctx: Context, start: string, end: string) {
  const revenue = nonnegative(ctx, atPeriod(ctx, REVENUE, 'USD', start, end));
  const accession = revenue.accession;
  const operatingIncome = accession ? atPeriod(ctx, ['OperatingIncomeLoss'], 'USD', start, end, accession) : unavailable(ctx, 'USD', 'Revenue filing unavailable for period alignment.', 'missing', start, end);
  const margin = revenue.value != null && revenue.value > 0 && operatingIncome.value != null
    ? derived(ctx, operatingIncome.value / revenue.value * 100, '%', start, end, 'Reported operating income divided by revenue for the identical fiscal period and filing.', [operatingIncome, revenue])
    : unavailable(ctx, '%', 'Positive revenue and matching FY operating income are required.', 'missing', start, end);
  const accessions = compatibleAccessions(ctx, start, end, revenue, operatingIncome);
  let shares = nonnegative(ctx, historicalInstant(ctx, ['CommonStockSharesOutstanding'], 'shares', end, accessions), true);
  const basisIssue = shareBasis(ctx, shares, end, shares.accession) || (splitInPeriod(ctx, new Date(Date.parse(end) + DAY).toISOString().slice(0, 10), ctx.today) ? 'A subsequent stock split makes the historical share count incompatible with the current quote basis; manual reconciliation is required.' : null);
  if (basisIssue && shares.value != null) shares = {...shares, value: null, status: 'ambiguous', reason: basisIssue};
  let repurchaseAccession = accession;
  let repurchased = unavailable(ctx, 'shares', 'No matching full-fiscal-year repurchase fact on a reconciled annual reporting basis.', 'missing', start, end);
  for (const accn of accessions) {
    const rows = observations(ctx, REPURCHASE, 'shares', true).filter(x => x.row.start === start && x.row.end === end && x.row.accn === accn);
    if (!rows.length) continue;
    repurchaseAccession = accn;
    repurchased = nonnegative(ctx, atPeriod(ctx, REPURCHASE, 'shares', start, end, accn));
    if (new Set(rows.map(x => x.concept)).size > 1) repurchased = unavailable(ctx, 'shares', 'Multiple repurchase dispositions are reported; completeness or overlap cannot be established.', 'ambiguous', start, end);
    break;
  }
  const opening = repurchaseAccession ? nonnegative(ctx, atInstant(ctx, ['CommonStockSharesOutstanding'], 'shares', priorDay(start), repurchaseAccession), true)
    : unavailable(ctx, 'shares', 'Opening FY share count unavailable.', 'missing', null, priorDay(start));
  const repurchaseClosing = repurchaseAccession ? nonnegative(ctx, atInstant(ctx, ['CommonStockSharesOutstanding'], 'shares', end, repurchaseAccession), true) : shares;
  const repurchaseBasisIssue = shareBasis(ctx, repurchaseClosing, end, repurchaseAccession);
  const split = splitInPeriod(ctx, start, end);
  let buyback = unavailable(ctx, '%', 'Reported repurchased shares and preceding FY-end shares on a verified comparable basis are required; absent repurchase facts are not zero.', 'missing', start, end);
  if (basisIssue || repurchaseBasisIssue) buyback = unavailable(ctx, '%', basisIssue || repurchaseBasisIssue!, 'ambiguous', start, end);
  else if (split) buyback = unavailable(ctx, '%', 'A stock split is reported during this FY; repurchases and opening shares need explicit split-basis reconciliation.', 'ambiguous', start, end);
  else if (opening.value != null && repurchased.value != null && repurchased.value <= opening.value) {
    buyback = derived(ctx, repurchased.value / opening.value * 100, '%', start, end,
      'Reported repurchased shares divided by preceding FY-end outstanding shares from the same filing. Reported scope may omit employee-tax withholding and other repurchases; this is not verified total gross repurchases.', [repurchased, opening]);
  }
  const cash = nonnegative(ctx, historicalInstant(ctx, ['CashAndCashEquivalentsAtCarryingValue'], 'USD', end, accessions));
  if (cash.value != null) cash.reason = 'Cash and cash equivalents only; excludes short- and long-term investments and restricted cash.';
  // The balance-sheet group uses one filing; no debt component is carried forward.
  const debtConcepts = ['DebtAndCapitalLeaseObligations', 'LongTermDebt', 'LongTermDebtCurrent', 'LongTermDebtNoncurrent', 'DebtCurrent', 'LongTermDebtAndCapitalLeaseObligations', 'LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities'];
  const debtAccession = accessions.find(accn => observations(ctx, debtConcepts, 'USD', false).some(x => x.row.end === end && x.row.accn === accn));
  const debt = debtAccession ? totalDebt(ctx, end, debtAccession) : unavailable(ctx, 'USD', 'No comparable debt filing is available.', 'missing', null, end);
  const termDebt = debtAccession ? longTermDebt(ctx, end, debtAccession) : unavailable(ctx, 'USD', 'No comparable long-term debt filing is available.', 'missing', null, end);
  const commercialPaper = nonnegative(ctx, historicalInstant(ctx, ['CommercialPaper'], 'USD', end, accessions));
  const shortTerm = debtAccession ? nonnegative(ctx, atInstant(ctx, ['ShortTermBorrowings'], 'USD', end, debtAccession)) : unavailable(ctx, 'USD', 'Complete short-term borrowings are not reported on this basis.', 'missing', null, end);
  const borrowings = termDebt.value != null && shortTerm.value != null
    ? derived(ctx, termDebt.value + shortTerm.value, 'USD', null, end, 'Reported short-term borrowings plus long-term debt including current maturities; excludes finance leases.', [shortTerm, termDebt])
    : unavailable(ctx, 'USD', 'Complete short-term and long-term borrowings excluding leases are not both explicitly reported. Commercial paper alone does not establish all short-term borrowings.', 'missing', null, end);
  const paperTermDebt = commercialPaper.accession ? longTermDebt(ctx, end, commercialPaper.accession) : termDebt;
  const termAndPaper = termDebt.value != null && commercialPaper.value != null && paperTermDebt.value === termDebt.value
    ? derived(ctx, paperTermDebt.value! + commercialPaper.value, 'USD', null, end, 'Subtotal of reported term debt including current maturities and commercial paper only, reconciled within one filing; excludes finance leases and any other borrowings. Not total debt.', [paperTermDebt, commercialPaper])
    : unavailable(ctx, 'USD', 'Both term debt and commercial paper must be explicitly reported; a missing commercial-paper fact is not zero.', 'missing', null, end);
  const leases = nonnegative(ctx, historicalInstant(ctx, ['FinanceLeaseLiability'], 'USD', end, accessions));
  return {period_start: start, period_end: end, revenue, revenue_growth_pct: annualGrowth(ctx, start, end, revenue, accessions), operating_income: operatingIncome, operating_margin_pct: margin,
    shares_outstanding: shares, opening_shares_outstanding: opening, repurchased_shares: repurchased, buyback_pct: buyback,
    cash, total_debt: debt, reported_long_term_debt: termDebt, commercial_paper: commercialPaper, reported_borrowings: borrowings,
    reported_term_debt_and_commercial_paper: termAndPaper, finance_lease_liabilities: leases,
    gross_dilution_pct: unavailable(ctx, '%', 'Total gross share issuance/dilution is not established by CompanyFacts. Net share-count change and stock-based compensation expense are not gross dilution.', 'missing', start, end),
    historical_ev_ebit: unavailable(ctx, 'x', 'No date-aligned historical enterprise value and comparable EBIT series is available. Current quote times dated shares is not a historical multiple.', 'missing', start, end)};
}

export function buildValuationInputs(symbol: string, cachedFacts: any, chartMeta: any, now = Date.now()) {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const asOf = new Date(safeNow).toISOString(), today = asOf.slice(0, 10);
  const doc = cachedFacts?.document || cachedFacts || {};
  const rawCik = String(doc.cik || cachedFacts?.cik || '');
  const cik = /^\d{1,10}$/.test(rawCik) ? rawCik.padStart(10, '0') : '';
  const ctx: Context = {doc, facts: doc?.facts?.['us-gaap'] || {}, today, cik,
    sourceUrl: cik ? `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json` : null};
  const quoteCurrency = chartMeta?.currency === 'USD' ? 'USD' : null;
  const hasGAAP = Object.keys(ctx.facts).length > 0;
  const revenueCurrencies = [...new Set(REVENUE.flatMap(concept => Object.keys(ctx.facts[concept]?.units || {})).filter(unit => /^[A-Z]{3}$/.test(unit)))];
  const monetaryRows = revenueCurrencies.flatMap(unit => observations(ctx, REVENUE, unit, true));
  const latestMonetaryEnd = monetaryRows.map(x => x.row.end).sort().at(-1);
  const currentCurrencies = [...new Set(monetaryRows.filter(x => x.row.end === latestMonetaryEnd).map(x => x.unit))];
  const foreignBasis = currentCurrencies.some(unit => unit !== 'USD');
  const supported = hasGAAP && currentCurrencies.includes('USD') && !foreignBasis;
  const currency = supported ? 'USD' : null;
  const unsupportedReason = !hasGAAP ? 'US-GAAP CompanyFacts are unavailable; IFRS and custom taxonomy inputs are not supported automatically.'
    : foreignBasis ? 'The latest revenue facts use a foreign or mixed reporting currency. Currency translation is not supported automatically.'
    : 'A verified USD reporting basis is required. Currency conversion is not supported automatically.';
  const empty = (unit: string) => unavailable(ctx, unit, supported ? 'No comparable full fiscal year is available.' : unsupportedReason, supported ? 'missing' : 'unsupported');
  const periods = new Map<string, {start: string; end: string}>();
  if (supported) for (const item of observations(ctx, [...REVENUE, 'OperatingIncomeLoss', 'NetIncomeLoss'], 'USD', true)) {
    periods.set(`${item.row.start}|${item.row.end}`, {start: item.row.start, end: item.row.end});
  }
  const sorted = [...periods.values()].sort((a, b) => b.end.localeCompare(a.end) || b.start.localeCompare(a.start));
  const latest = sorted[0] || null;
  // Conflicting starts for one FY end are not silently treated as equivalent.
  const validPeriods = sorted.filter(p => sorted.filter(q => q.end === p.end).length === 1).slice(0, 6);
  const history = validPeriods.map(p => yearInputs(ctx, p.start, p.end));
  const current = latest ? history.find(p => p.period_start === latest.start && p.period_end === latest.end) : null;
  const fields: Record<string, ValuationField> = {
    revenue: current?.revenue || empty('USD'), revenue_growth_pct: current?.revenue_growth_pct || empty('%'),
    operating_income: current?.operating_income || empty('USD'), operating_margin_pct: current?.operating_margin_pct || empty('%'),
    shares_outstanding: current?.shares_outstanding || empty('shares'), cash: current?.cash || empty('USD'), total_debt: current?.total_debt || empty('USD'),
    reported_long_term_debt: current?.reported_long_term_debt || empty('USD'), commercial_paper: current?.commercial_paper || empty('USD'),
    reported_borrowings: current?.reported_borrowings || empty('USD'), reported_term_debt_and_commercial_paper: current?.reported_term_debt_and_commercial_paper || empty('USD'),
    finance_lease_liabilities: current?.finance_lease_liabilities || empty('USD'), buyback_pct: current?.buyback_pct || empty('%'),
    gross_dilution_pct: current?.gross_dilution_pct || empty('%'), historical_ev_ebit: current?.historical_ev_ebit || empty('x'),
    current_price: {...unavailable(ctx, 'USD/share', 'A positive USD quote and valid quote timestamp are required. Annual USD financial history does not depend on quote availability.', chartMeta?.currency && !quoteCurrency ? 'unsupported' : 'missing'),
      source: 'Yahoo Finance public chart', url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol.toUpperCase())}/`},
  };
  const price = number(chartMeta?.price), stamp = typeof chartMeta?.price_timestamp === 'string' ? Date.parse(chartMeta.price_timestamp) : NaN;
  if (quoteCurrency && price != null && price > 0 && Number.isFinite(stamp) && stamp <= safeNow + 5 * 60000) fields.current_price = {
    value: price, unit: 'USD/share', period_start: null, period_end: new Date(stamp).toISOString().slice(0, 10),
    source: 'Yahoo Finance public chart', url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol.toUpperCase())}/`,
    status: 'ok', reason: null, as_of: new Date(stamp).toISOString(),
  };
  const warnings = Object.entries(fields).filter(([, f]) => f.status !== 'ok').map(([key, f]) => ({field: key, status: f.status, reason: f.reason}));
  if (cachedFacts?.stale_fallback) warnings.push({field: 'cache', status: 'missing', reason: 'SEC refresh failed; the supplied cache is a stale fallback.'});
  if (latest && days(latest.end, today) > 550) warnings.push({field: 'fiscal_year_end', status: 'missing', reason: 'The latest usable annual period is more than 550 days old.'});
  return {
    symbol: String(symbol).trim().toUpperCase(), name: doc.entityName || cachedFacts?.company_name || String(symbol).toUpperCase(),
    currency, fiscal_year_end: latest?.end || null, fiscal_year_start: latest?.start || null, as_of: asOf,
    fetched_at: cachedFacts?.fetched_at || null, status: !supported ? 'unsupported' : fields.revenue.value == null ? 'unavailable' : warnings.length ? 'partial' : 'ok',
    fields, history, warnings, logic_version: 'valuation_inputs_v2',
    methodology: [
      'Full-year actuals use USD, entity-wide US-GAAP facts from 10-K/10-K/A, with 350–380 day duration and exact period alignment. Later restatements replace earlier reports; fiscal-year labels are not inferred from filing year.',
      'USD annual financial history is independent of quote availability. Quotes require their own verified USD currency and timestamp; no FX or ADR conversion is performed.',
      'Older balance-sheet, prior-growth and repurchase disclosures can come from an earlier annual filing only when omitted from a later comparative filing and both revenue and operating income reconcile exactly. Each field carries its own source filing. Ratio components remain within one filing.',
      'Starting shares are the reported basic shares outstanding at the model base FY-end, corroborated by an entity-wide cover-page count. They are not current or weighted-average diluted shares. Forward share assumptions create an effective diluted-share proxy.',
      'Repurchase reference is reported repurchased shares / opening FY-end shares from the same filing. Coverage can exclude withholding and other repurchases. Multiple classes, conflicting contexts or known splits require manual reconciliation. Net share changes are never used as gross issuance or buybacks.',
      'Cash means cash and equivalents. Debt is populated only from a reported total or complete non-overlapping debt-and-finance-lease aggregates in the same filing; absent components remain missing rather than zero.',
      'Reported long-term debt, commercial paper, their subtotal and finance-lease liabilities are separately labeled scopes. Their availability does not establish complete total debt; missing short-term debt is never assumed to be zero.',
      'Gross dilution and historical EV/EBIT remain unavailable. No current or historical multiple is fabricated from a current quote and old shares. No fair value or investment recommendation is supplied by this adapter.',
      'SEC CompanyFacts omits custom taxonomy and dimensional disclosures. Missing data, unverified currency or class scope requires reviewed manual input.',
    ],
    sources: [
      {title: 'SEC CompanyFacts API and scope', url: 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces'},
      {title: 'SEC outstanding-share tagging guidance', url: 'https://www.sec.gov/newsroom/whats-new/osd-announcement-2210-dqreminder-entitycommonstocksharesoutstanding'},
      {title: 'FASB 2026 US-GAAP concept definitions', url: 'https://xbrl.fasb.org/us-gaap/2026/elts/us-gaap-doc-2026.xml'},
    ],
  };
}
