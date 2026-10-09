/* Reporting-period metadata only. This adapter does not calculate, fill or
 * replace financial values. In particular it does not manufacture Q4 or FY
 * results from an incomplete year. */
const REVENUE = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
  'RegulatedAndUnregulatedOperatingRevenue', 'SalesRevenueNet',
  'SalesRevenueGoodsNet', 'SalesRevenueServicesNet', 'UtilityRevenue', 'Revenues',
];
const DAY = 86400000;
type Period = {fiscal_year: number; fiscal_quarter: number | null; period_start: string;
  period_end: string; filed: string; accession: string};
function stamp(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const n = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value ? n : null;
}

export function withFundamentalReporting(body: any, cachedFacts: any, now = Date.now(), filingData: any = null) {
  const data = Array.isArray(body?.data) ? body.data : [];
  const today = new Date(now).toISOString().slice(0, 10);
  const facts = cachedFacts?.document?.facts?.['us-gaap'];
  const fetched = Date.parse(cachedFacts?.fetched_at || '');
  const fresh = !!facts && !cachedFacts?.stale_fallback && Number.isFinite(fetched)
    && now - fetched >= -5 * 60000 && now - fetched <= 48 * 60 * 60000;
  const rows = REVENUE.flatMap(concept => facts?.[concept]?.units?.USD || []).filter((r: any) =>
    typeof r.accn === 'string' && r.accn && ['10-K', '10-K/A', '10-Q', '10-Q/A'].includes(r.form)
    && stamp(r.start) != null && stamp(r.end) != null && stamp(r.filed) != null
    && r.end <= today && r.filed <= today && r.start < r.end
    && Number.isInteger(r.fy) && r.fy >= 1900 && r.fy <= 2200);
  const recent = filingData?.document?.filings?.recent;
  const submissionsFetched = Date.parse(filingData?.fetched_at || '');
  const filingsFresh = Number.isFinite(submissionsFetched) && now - submissionsFetched >= -5 * 60000
    && now - submissionsFetched <= 60 * 60000;
  const annualFilings: any[] = [], quarterlyFilings: any[] = [];
  const filingEnd = new Map<string, string>();
  let filingCoverageComplete = filingsFresh && Array.isArray(recent?.accessionNumber)
    && ['form','reportDate','filingDate'].every(key => Array.isArray(recent[key]) && recent[key].length === recent.accessionNumber.length);
  if (filingsFresh && Array.isArray(recent?.accessionNumber)) recent.accessionNumber.forEach((accn: any, i: number) => {
    const form = recent.form?.[i], end = recent.reportDate?.[i], filed = recent.filingDate?.[i];
    if (typeof accn !== 'string' || !accn || typeof form !== 'string' || stamp(filed) == null || filed > today) {
      filingCoverageComplete=false;return;
    }
    if (!['10-K','10-K/A','10-Q','10-Q/A'].includes(form)) return;
    if (stamp(end) == null || end > today) {filingCoverageComplete=false;return;}
    filingEnd.set(accn, end);
    (form.startsWith('10-K') ? annualFilings : quarterlyFilings).push({period_end:end,filed,accession:accn});
  });
  annualFilings.sort((a,b)=>a.period_end.localeCompare(b.period_end));
  quarterlyFilings.sort((a,b)=>a.period_end.localeCompare(b.period_end));
  // SEC fy/fp describe the filing, including comparative rows. Recent filing
  // reportDate is authoritative. Older facts without that coverage remain
  // display-unverified rather than inferring a fiscal year from a comparative.
  const latestEnd = new Map<string, string>();
  for (const [accn,end] of filingEnd) latestEnd.set(accn,end);
  const collect = (annual: boolean): Period[] => {
    const buckets = new Map<string, Period[]>();
    for (const r of rows) {
      const days = (stamp(r.end)! - stamp(r.start)!) / DAY;
      const q = /^Q([1-4])$/.exec(r.fp || '');
      if (r.end !== latestEnd.get(r.accn)) continue;
      if (annual ? !/^10-K/.test(r.form) || r.fp !== 'FY' || days < 340 || days > 380
        : !/^10-Q/.test(r.form) || !q || days < 60 || days > 100) continue;
      const p = {fiscal_year: r.fy, fiscal_quarter: annual ? null : Number(q![1]),
        period_start: r.start, period_end: r.end, filed: r.filed, accession: r.accn};
      buckets.set(r.end, [...(buckets.get(r.end) || []), p]);
    }
    return [...buckets.values()].filter(group => new Set(group.map(p =>
      `${p.fiscal_year}|${p.fiscal_quarter}|${p.period_start}`)).size === 1)
      .map(group => group.sort((a, b) => b.filed.localeCompare(a.filed))[0])
      .sort((a, b) => a.period_end.localeCompare(b.period_end));
  };
  const annual = collect(true), quarterly = collect(false);
  const periods = body?.period === 'annual' ? annual : quarterly;
  const enriched = data.map((row: any) => {
    const d = stamp(row?.date);
    if (d == null) return {...row};
    const exact = periods.filter(p => p.period_end === row.date);
    // Yahoo labels a 52/53-week year at month-end. Reconcile only one nearby
    // SEC period in the same month; never turn that provider label into a fact.
    const matches = exact.length ? exact : periods.filter(p => p.period_end.slice(0, 7) === row.date.slice(0, 7)
      && Math.abs(stamp(p.period_end)! - d) <= 7 * DAY);
    if (matches.length !== 1) return {...row};
    const p = matches[0];
    if ((row.fiscalYear != null && Number(row.fiscalYear) !== p.fiscal_year)
      || (row.fiscalQuarter != null && Number(row.fiscalQuarter) !== p.fiscal_quarter)) return {...row};
    // Display-only fields. Existing chart keys and comparison inputs must not
    // change when only some provider rows can be reconciled (notably Q4).
    return {...row, period_start: p.period_start,
      period_end: p.period_end, reportedFiscalYear: p.fiscal_year,
      ...(p.fiscal_quarter != null ? {reportedFiscalQuarter: p.fiscal_quarter} : {}),
      period_verified: true};
  });
  return {...body, data: enriched, reporting: {
    status: !facts ? 'unavailable' : fresh ? 'verified' : 'stale',
    checked_at: new Date(now).toISOString(), fetched_at: cachedFacts?.fetched_at || null,
    latest_annual: annual.at(-1) || null, latest_quarterly: quarterly.at(-1) || null,
    annual_periods: annual, quarterly_periods: quarterly,
    filing_coverage_verified: fresh && filingCoverageComplete && annualFilings.length > 0
      && !!annual.at(-1) && annual.at(-1)!.period_end === annualFilings.at(-1)!.period_end,
    latest_annual_filing: annualFilings.at(-1) || null,
    latest_quarterly_filing: quarterlyFilings.at(-1) || null,
    filing_checked_at: filingData?.fetched_at || null,
    source_url: cachedFacts?.cik ? `https://data.sec.gov/submissions/CIK${String(cachedFacts.cik).padStart(10,'0')}.json` : null,
    fiscal_calendar_note: 'Fiscal years can end in different months for different companies.',
  }};
}
