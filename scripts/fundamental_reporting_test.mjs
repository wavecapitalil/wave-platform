import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import model from '../apps/terminal/public/fundamental-chart-model.js';
import {withFundamentalReporting} from '../supabase/functions/wave-data/fundamental-reporting.ts';

const now = Date.parse('2026-10-08T20:00:00Z');
const annual = (fy, start, end, val, extra = {}) => ({fy, fp:'FY', start, end, val, form:'10-K',
  accn:`annual-${fy}`, filed:`${fy}-10-31`, ...extra});
const a24 = annual(2024,'2023-10-01','2024-09-28',391035000000);
const a25 = annual(2025,'2024-09-29','2025-09-27',416161000000);
const q26 = {fy:2026,fp:'Q3',start:'2026-03-29',end:'2026-06-27',val:109417000000,
  form:'10-Q',accn:'quarter-2026',filed:'2026-07-31'};
const filings = (rows = [a24,a25,q26]) => ({fetched_at:'2026-10-08T19:30:00Z',document:{filings:{recent:{accessionNumber:rows.map(r=>r.accn),form:rows.map(r=>r.form),reportDate:rows.map(r=>r.end),filingDate:rows.map(r=>r.filed)}}}});
const cache = (rows = [a24,a25,q26]) => ({fetched_at:'2026-10-08T09:21:15Z',document:{facts:{'us-gaap':{
  RevenueFromContractWithCustomerExcludingAssessedTax:{units:{USD:rows}}
}}}});
const body = (period = 'annual', data = [{date:'2024-09-30',value:a24.val},{date:'2025-09-30',value:a25.val}]) => ({symbol:'AAPL',period,metric:'revenue',data});

test('AAPL fiscal 2026 has quarterly results; actual dates are display-only metadata', () => {
  const input=body(), before=JSON.stringify(input), facts=cache();
  const r=withFundamentalReporting(input,facts,now,filings());
  assert.equal(JSON.stringify(input),before);
  assert.equal(r.reporting.status,'verified');
  assert.equal(r.reporting.latest_annual.fiscal_year,2025);
  assert.equal(r.reporting.latest_annual.period_end,'2025-09-27');
  assert.equal(r.reporting.latest_quarterly.fiscal_year,2026);
  assert.equal(r.data[1].date,'2025-09-30');
  assert.equal(r.data[1].period_end,'2025-09-27');
  assert.equal(r.data[1].reportedFiscalYear,2025);
  assert.deepEqual(r.data.map(x=>x.value),input.data.map(x=>x.value));
  const missing=model.missingPoint(r,'2026','annual');
  assert.equal(missing.value,null);assert.equal(missing.status,'annual-not-yet-available');
  assert.match(missing.reason,/Quarterly results exist through FY2026 Q3/);
  assert.match(missing.reason,/2026-06-27/);assert.doesNotMatch(missing.reason,/year has not ended/i);
  assert.match(model.reportingSummary(r,'annual'),/full-year report is not yet available/);
  const series=model.buildSeries(r.data,{metric:'revenue',period:'annual',mode:'growth'});
  assert.ok(Math.abs(series[1].value-(a25.val/a24.val-1)*100)<1e-9);
  assert.equal(series[1].fiscalYear,null);assert.equal(series[1].reportedFiscalYear,2025);
});
test('NVIDIA FY2026 annual report is available and ends in January; no hard-coded ticker logic', () => {
  const rows=[annual(2025,'2024-01-29','2025-01-26',130497000000,{filed:'2025-02-26'}),
    annual(2026,'2025-01-27','2026-01-25',215938000000,{filed:'2026-02-25'})];
  const r=withFundamentalReporting({...body(),symbol:'ANY',data:rows.map(x=>({date:`${x.fy}-01-31`,value:x.val}))},cache(rows),now,filings(rows));
  assert.equal(r.data[1].date,'2026-01-31');assert.equal(r.data[1].period_end,'2026-01-25');assert.equal(r.data[1].reportedFiscalYear,2026);
  assert.match(model.reportingSummary(r,'annual'),/FY2026 · ended 2026-01-25/);
  assert.doesNotMatch(model.reportingSummary(r,'annual'),/not yet/);
});
test('comparatives carry filing fy, not the period fiscal year; never relabel them', () => {
  const comparative={...a24,fy:2025,accn:a25.accn,filed:a25.filed};
  const r=withFundamentalReporting(body(),cache([comparative,a25,q26]),now,filings());
  assert.equal(r.data[0].fiscalYear,undefined);
  assert.equal(r.data[0].date,'2024-09-30');
  assert.equal(r.data[1].reportedFiscalYear,2025);
});
test('missing, old, future or failed source coverage cannot claim a report is pending', () => {
  for(const facts of [null,{...cache(),fetched_at:'2026-10-01T01:00:00Z'},
    {...cache(),stale_fallback:true},{...cache(),fetched_at:'2026-10-10T01:00:00Z'}]) {
    const r=withFundamentalReporting(body(),facts,now,filings()), p=model.missingPoint(r,'2026','annual');
    assert.equal(p.status,'source-unavailable');assert.match(p.reason,/unconfirmed/);
  }
  const r=withFundamentalReporting(body(),cache([a25,{...q26,filed:'2026-10-20'}]),now,filings());
  assert.equal(r.reporting.latest_quarterly,null);
  assert.equal(model.missingPoint(r,'2026','annual').status,'source-unavailable');
});
test('a filed annual report with a missing metric is distinct from an unpublished full year', () => {
  const r=withFundamentalReporting(body('annual',[]),cache(),now,filings());
  const p=model.missingPoint(r,'2025','annual');
  assert.equal(p.status,'metric-unavailable');assert.match(p.reason,/report is available, but this metric is missing/);
});
test('ambiguous dates, fiscal periods, foreign currencies and absent accession remain unverified', () => {
  const conflict={...a25,fy:2024,accn:'conflict'};
  const r=withFundamentalReporting(body(),cache([a25,conflict]),now,filings([a25,conflict]));
  assert.equal(r.data[1].fiscalYear,undefined);
  const noAccn=withFundamentalReporting(body(),cache([{...a25,accn:null}]),now);
  assert.equal(noAccn.reporting.latest_annual,null);
  const f=cache(); f.document.facts['us-gaap'].RevenueFromContractWithCustomerExcludingAssessedTax.units={EUR:[a25]};
  assert.equal(withFundamentalReporting(body(),f,now).reporting.latest_annual,null);
});
test('quarterly fiscal labels are explicit, but no Q4 or financial value is synthesized', () => {
  const input=body('quarterly',[{date:'2026-06-27',value:q26.val}]);
  const r=withFundamentalReporting(input,cache(),now,filings());
  assert.equal(r.data.length,1);assert.equal(r.data[0].reportedFiscalQuarter,3);
  assert.equal(r.data[0].value,input.data[0].value);
  assert.equal(model.periodKey(r.data[0],'quarterly'),'2026 Q2');
  assert.equal(model.missingPoint(r,'2026 Q4','quarterly').status,'source-unavailable');
});
test('missing prior year, zero base and negative base retain their mathematical explanations', () => {
  const r=withFundamentalReporting(body(),cache(),now,filings());
  const p=model.buildSeries(r.data,{metric:'revenue',period:'annual',mode:'growth'})[0];
  assert.equal(p.status,'missing-prior');assert.match(p.reason,/prior-year/);
  assert.equal(model.relativeGrowth(10,0,'net_income').status,'zero-base');
  assert.equal(model.relativeGrowth(10,-5,'net_income').status,'negative-base');
});
test('both production fundamental source paths pass through metadata enrichment', () => {
  const code=fs.readFileSync(new URL('../supabase/functions/wave-data/index.ts',import.meta.url),'utf8');
  const route=code.slice(code.indexOf('if(p.endsWith("/api/fundamentals"))'),code.indexOf('if(p.endsWith("/api/stock-info"))'));
  assert.match(route,/cached\|\|await dynamicFundamentals/);
  assert.match(route,/withFundamentalReporting\(body,companyFacts,Date.now\(\),filings\)/);
});
test('partial enrichment preserves annual YoY and quarterly Q3/Q4 keys and values exactly', () => {
  const cases=[
    [body(),[a25]],
    [body('quarterly',[{date:'2026-06-30',value:100},{date:'2026-09-30',value:110}]),[q26]],
  ];
  for(const [input,rows] of cases){
    const enriched=withFundamentalReporting(input,cache(rows),now,filings(rows));
    for(const mode of ['values','growth']){
      const options={period:input.period,metric:'revenue',mode};
      const essential=arr=>model.buildSeries(arr,options).map(p=>({key:p.key,date:p.date,value:p.value,priorDate:p.priorDate,status:p.status}));
      assert.deepEqual(essential(enriched.data),essential(input.data));
    }
  }
});
test('a fresh revenue cache without authoritative filing coverage cannot prove an annual filing is missing', () => {
  for(const filingData of [null,{...filings(),fetched_at:'2026-10-08T12:00:00Z'}]){
    const r=withFundamentalReporting(body(),cache(),now,filingData);
    assert.equal(r.reporting.filing_coverage_verified,false);
    assert.equal(model.missingPoint(r,'2026','annual').status,'source-unavailable');
  }
  const newFiling=annual(2026,'2025-09-28','2026-09-26',999,{filed:'2026-10-01'});
  const r=withFundamentalReporting(body(),cache(),now,filings([a24,a25,q26,newFiling]));
  assert.equal(r.reporting.latest_annual_filing.period_end,'2026-09-26');
  assert.equal(r.reporting.filing_coverage_verified,false);
  assert.equal(model.missingPoint(r,'2026','annual').status,'metric-unavailable');
  assert.match(model.reportingSummary(r,'annual'),/newer SEC filing exists/);
  assert.doesNotMatch(model.reportingSummary(r,'annual'),/not yet/);
});
test('a comparative row alone cannot establish a fiscal label when the actual filing reports a later year', () => {
  const comparison={...a24,fy:2025,accn:a25.accn,filed:a25.filed};
  const r=withFundamentalReporting(body(),cache([comparison]),now,filings([a25]));
  assert.equal(r.reporting.latest_annual,null);
  assert.ok(r.data.every(row=>row.reportedFiscalYear==null));
});
test('display-only quarterly missing explanations use the existing calendar key', () => {
  const r=withFundamentalReporting(body('quarterly',[]),cache(),now,filings());
  assert.equal(model.missingPoint(r,'2026 Q2','quarterly').status,'metric-unavailable');
  assert.match(model.missingPoint(r,'2026 Q2','quarterly').reason,/FY2026 Q3.*2026-06-27/);
  assert.equal(model.missingPoint(r,'2026 Q3','quarterly').status,'source-unavailable');
});
test('incomplete recent filings never turn malformed current annual metadata into a pending claim', () => {
  const newer={...a25,accn:'new-annual',filed:'2026-10-01',end:null};
  const malformed=filings([newer,a25,q26]);
  for(const info of [malformed,{...filings(),document:{filings:{recent:{...filings().document.filings.recent,form:['10-K']}}}}]){
    const r=withFundamentalReporting(body(),cache(),now,info);
    assert.equal(r.reporting.filing_coverage_verified,false);
    assert.equal(model.missingPoint(r,'2026','annual').status,'source-unavailable');
    assert.doesNotMatch(model.reportingSummary(r,'annual'),/not yet/);
  }
});
