// Public consensus adapters. Never evaluate provider JavaScript or mix FY with NTM.
export type Estimate = {
  source: string; provider: string; url: string; eps: number;
  period_end: string; basis: string; currency: string;
  fetched_at: string; source_updated_at: string | null;
  analysts: number | null; adjustment_note: string;
};
const MAX_AGE_DAYS = 45;
const cache = new Map<string, {at: number; value: any}>();
export function numeric(value: any): number | null {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const v = typeof value === 'object' ? value.raw : value;
  if (v == null || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function monthEnd(label: string): string | null {
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i.exec(label);
  if (!match) return null;
  const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[1].toLowerCase());
  return new Date(Date.UTC(Number(match[2]), month + 1, 0)).toISOString().slice(0, 10);
}
export function parseNasdaq(data: any, symbol: string, fetched: string): Estimate[] {
  if (String(data?.data?.symbol || '').toUpperCase() !== symbol) return [];
  const table = data?.data?.yearlyForecast;
  return (table?.rows || []).flatMap((row: any) => {
    const eps = numeric(row.consensusEPSForecast), end = monthEnd(String(row.fiscalEnd || ''));
    if (eps == null || !end) return [];
    const date = table.asOf ? Date.parse(table.asOf) : NaN;
    return [{source:'Nasdaq', provider:'Zacks', url:`https://www.nasdaq.com/market-activity/stocks/${symbol.toLowerCase()}/earnings`,
      eps, period_end:end, basis:'adjusted', currency:'USD', fetched_at:fetched,
      source_updated_at:Number.isFinite(date) ? new Date(date).toISOString() : null,
      analysts:numeric(row.noOfEstimates), adjustment_note:'Zacks normalized consensus; adjustments may differ from company non-GAAP EPS.'}];
  });
}
function publicArray(text: string, name: string): any[] {
  const match = new RegExp('(?:^|[,{])' + name + ':\\s*(\\[(?:"(?:\\\\.|[^"\\\\])*"|[^\\]"])*\\])').exec(text);
  if (!match) return [];
  try { return JSON.parse(match[1]); } catch { return []; }
}
export function parseStockAnalysis(html: string, symbol: string, fetched: string): Estimate[] {
  // Only publicly visible SSR fields. PRO values are never decoded or bypassed.
  const start = html.indexOf('table:{annual:{');
  const stop = start >= 0 ? html.indexOf('quarterly:{', start) : -1;
  if (start < 0 || stop < 0 || !/EPS and Forward PE are based on non-GAAP adjusted numbers/.test(html)) return [];
  const annual = html.slice(start, stop), dates = publicArray(annual, 'dates');
  const adjusted = publicArray(annual, 'adjustedEps'), analysts = publicArray(annual, 'analysts');
  const currency = /currency:"([A-Z]{3})"/.exec(html.slice(start))?.[1];
  if (!currency) return [];
  const updatedRaw = /lastUpdated:(\d{13})/.exec(html.slice(start))?.[1];
  const updated = updatedRaw ? new Date(Number(updatedRaw)).toISOString() : null;
  const out: Estimate[] = [];
  const add = (index: number, eps: number | null) => {
    if (eps == null || !/^\d{4}-\d{2}-\d{2}$/.test(dates[index] || '')) return;
    out.push({source:'StockAnalysis', provider:'S&P Global', url:`https://stockanalysis.com/stocks/${symbol.toLowerCase()}/forecast/`,
      eps, period_end:dates[index], basis:'adjusted', currency, fetched_at:fetched,
      source_updated_at:updated, analysts:numeric(analysts[index]), adjustment_note:'Non-GAAP adjusted EPS; provider adjustments may differ.'});
  };
  const thisYear = /epsThis:\{last:[^,}]+,this:([-\d.eE+]+)/.exec(html.slice(0,start));
  const nextYear = /epsNext:\{last:[^,}]+,this:([-\d.eE+]+)/.exec(html.slice(0,start));
  // Latest forecast has analyst coverage; the next public summary uses the next
  // fiscal date from the same table, never the current calendar year by inference.
  const forecastIndex = analysts.findIndex((n:any) => numeric(n) != null && Number(n) > 0);
  if (forecastIndex >= 0) {
    add(forecastIndex, numeric(thisYear?.[1]) ?? numeric(adjusted[forecastIndex]));
    if (nextYear) add(forecastIndex + 1, numeric(nextYear[1]));
  }
  return out;
}
export function parseYahoo(data: any, symbol: string, fetched: string): Estimate[] {
  const result = data?.quoteSummary?.result?.[0];
  if (!result || String(result.price?.symbol || '').toUpperCase() !== symbol) return [];
  return (result.earningsTrend?.trend || []).flatMap((row: any) => {
    if (!['0y','+1y'].includes(row.period)) return [];
    const eps = numeric(row.earningsEstimate?.avg), end = String(row.endDate || '');
    const currency = row.earningsEstimate?.earningsCurrency;
    if (eps == null || !currency || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return [];
    return [{source:'Yahoo Finance',provider:'Yahoo consensus',url:`https://finance.yahoo.com/quote/${symbol}/analysis/`,
      eps,period_end:end,basis:'unknown',currency,fetched_at:fetched,source_updated_at:null,
      analysts:numeric(row.earningsEstimate?.numberOfAnalysts),adjustment_note:'Accounting basis not declared by this endpoint; displayed separately, excluded from adjusted blend.'}];
  });
}
export function blendEstimates(estimates: Estimate[], price: any, currency: string, now = Date.now()): any {
  const excluded: any[] = [], groups = new Map<string, Estimate[]>();
  for (const e of estimates) {
    const end = Date.parse(e.period_end + 'T23:59:59Z');
    let reason: string | null = null;
    if (numeric(e.eps) == null || !Number.isFinite(end)) reason = 'invalid estimate';
    else if (end < now || end - now > 800 * 86400000) reason = 'outside forward fiscal-year window';
    else if (e.currency !== currency) reason = 'currency mismatch';
    else if (!['adjusted','gaap'].includes(e.basis)) reason = 'unverified accounting basis';
    else if (e.source_updated_at && (!Number.isFinite(Date.parse(e.source_updated_at)) || now-Date.parse(e.source_updated_at) > MAX_AGE_DAYS*86400000)) reason = 'stale or invalid source date';
    if (reason) { excluded.push({...e,reason}); continue; }
    const key = [e.period_end,e.currency,e.basis].join('|');
    const group = groups.get(key) || [];
    const duplicate = group.find(x => x.provider === e.provider);
    if (duplicate) { excluded.push({...e,reason:'same upstream provider already counted'}); continue; }
    group.push(e); groups.set(key,group);
  }
  const series = [...groups.values()].map(rows => {
    const values = rows.map(e => e.eps), mean = values.reduce((a,b)=>a+b,0)/values.length;
    const low = Math.min(...values), high = Math.max(...values);
    const spread = mean === 0 ? (high === low ? 0 : null) : (high-low)/Math.abs(mean)*100;
    const signConflict = low < 0 && high > 0;
    const dated = rows.every(e => e.source_updated_at != null);
    const confidence = rows.length < 2 || signConflict || spread == null || spread > 20 ? 'low' : 'medium';
    const p = numeric(price);
    return {period_end:rows[0].period_end,basis:rows[0].basis,currency,eps:mean,
      pe:p != null && p > 0 && mean > 0 ? p/mean : null,
      source_count:rows.length,upstream_count:rows.length,range_low:low,range_high:high,
      spread_pct:spread,confidence,source_dates_complete:dated,sign_conflict:signConflict,sources:rows,
      pe_unavailable_reason:mean <= 0 ? 'non-positive consensus EPS' : p == null || p <= 0 ? 'price unavailable' : null};
  }).sort((a,b)=>a.period_end.localeCompare(b.period_end) || b.source_count-a.source_count);
  // Prefer the nearest FY with an actual multi-provider blend; otherwise label a
  // single source explicitly. Never label FY+1 as "next twelve months".
  const selected = series.find(x=>x.source_count >= 2) || series[0] || null;
  return {status:selected ? (selected.source_count>=2?'blended':'single_source') : 'unavailable',
    selected,series,excluded,attempted_sources:['StockAnalysis','Nasdaq','Yahoo Finance'],
    calculated_at:new Date(now).toISOString(),method:'Equal-weight mean EPS; P/E = current quote / mean EPS',
    note:'Fiscal-year consensus, not NTM. Adjusted EPS definitions can differ by provider; inspect the source range. No independent accuracy score is implied by confidence.',
    logic_version:'forward_consensus_v1'};
}
async function readPublic(url: string, json = false): Promise<any> {
  const response = await fetch(url, {signal:AbortSignal.timeout(6500),headers:{
    'user-agent':'Mozilla/5.0 WAVE Research','accept':json?'application/json':'text/html'}});
  if (!response.ok) throw new Error('HTTP '+response.status);
  return json ? response.json() : response.text();
}
export async function collectForward(symbol: string, price: any, currency: string): Promise<any> {
  const key = symbol, now = Date.now();
  let observations = cache.get(key)?.value;
  if (!observations || now-(cache.get(key)?.at || 0)>900000) {
    const fetched = new Date().toISOString();
    const encoded = encodeURIComponent(symbol);
    const adapters = [
      {name:'StockAnalysis',run:async()=>parseStockAnalysis(await readPublic(`https://stockanalysis.com/stocks/${symbol.toLowerCase()}/forecast/`),symbol,fetched)},
      {name:'Nasdaq',run:async()=>parseNasdaq(await readPublic(`https://api.nasdaq.com/api/analyst/${encoded}/earnings-forecast`,true),symbol,fetched)},
      {name:'Yahoo Finance',run:async()=>parseYahoo(await readPublic(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encoded}?modules=earningsTrend,price`,true),symbol,fetched)}
    ];
    const results = await Promise.allSettled(adapters.map(a=>a.run()));
    observations = {estimates:[],availability:[]};
    results.forEach((r,i)=>{
      const rows = r.status==='fulfilled' ? r.value : [];
      observations.estimates.push(...rows);
      observations.availability.push({source:adapters[i].name,status:rows.length?'ok':'unavailable',
        detail:r.status==='rejected'?String(r.reason?.message||r.reason):rows.length?null:'No verified public forecast rows',fetched_at:fetched});
    });
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(key,{at:now,value:observations});
  }
  return {...blendEstimates(observations.estimates,price,currency),availability:observations.availability};
}
