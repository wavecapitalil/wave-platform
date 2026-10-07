import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {numeric, parseNasdaq, parseYahoo, parseStockAnalysis, blendEstimates, collectForward} from '../supabase/functions/wave-data/forward-consensus.ts';
const now = Date.parse('2026-10-07T14:00:00Z');
function row(overrides={}) {return {source:'Test A',provider:'Provider A',url:'https://example.com',eps:2,
  period_end:'2026-12-31',basis:'adjusted',currency:'USD',fetched_at:new Date(now).toISOString(),
  source_updated_at:new Date(now).toISOString(),analysts:10,adjustment_note:'Test fixture',...overrides};}
test('null, empty and booleans are never converted to zero',()=>{
  for (const x of [null,undefined,'',true,false,{raw:null}]) assert.equal(numeric(x),null);
  assert.equal(numeric(0),0); assert.equal(numeric({raw:-2}),-2);
});
test('average EPS before deriving P/E',()=>{
  const f=blendEstimates([row(),row({provider:'B',source:'B',eps:4})],120,'USD',now);
  assert.equal(f.selected.eps,3); assert.equal(f.selected.pe,40);assert.equal(f.status,'blended');
  assert.equal(f.selected.confidence,'low');
});
test('FY+1 never mixes with current FY',()=>{
  const f=blendEstimates([row(),row({provider:'B',eps:10,period_end:'2027-12-31'})],100,'USD',now);
  assert.equal(f.series.length,2); assert.equal(f.selected.eps,2);assert.equal(f.status,'single_source');
});
test('nearest FY with multiple sources preferred and labeled',()=>{
  const f=blendEstimates([row(),row({period_end:'2027-12-31'}),row({provider:'B',period_end:'2027-12-31',eps:2.1})],100,'USD',now);
  assert.equal(f.selected.period_end,'2027-12-31');assert.equal(f.selected.source_count,2);
});
test('GAAP, adjusted, unknown and currency mismatch separated',()=>{
  const f=blendEstimates([row(),row({provider:'B',basis:'gaap'}),row({provider:'C',basis:'unknown'}),row({provider:'D',currency:'CNY'})],100,'USD',now);
  assert.equal(f.selected.source_count,1);assert.equal(f.series.length,2);assert.equal(f.excluded.length,2);
});
test('duplicate upstream not counted twice',()=>{
  const f=blendEstimates([row(),row({source:'Second website',eps:20})],100,'USD',now);
  assert.equal(f.selected.eps,2);assert.equal(f.selected.source_count,1);assert.match(f.excluded[0].reason,/upstream/);
});
test('stale and past fiscal years excluded',()=>{
  const f=blendEstimates([row({source_updated_at:'2026-01-01'}),row({period_end:'2025-12-31'})],100,'USD',now);
  assert.equal(f.selected,null);assert.equal(f.status,'unavailable');
});
test('negative and zero EPS retain value but have no P/E',()=>{
  for(const eps of [-1,0]) {const s=blendEstimates([row({eps})],100,'USD',now).selected;assert.equal(s.eps,eps);assert.equal(s.pe,null);}
});
test('mixed signs and mean near zero downgrade confidence',()=>{
  const s=blendEstimates([row({eps:-1}),row({provider:'B',eps:1})],100,'USD',now).selected;
  assert.equal(s.confidence,'low');assert.equal(s.spread_pct,null);assert.equal(s.pe,null);
});
test('missing price never yields zero P/E',()=>{
  for(const price of [null,undefined,0,-1]) assert.equal(blendEstimates([row()],price,'USD',now).selected.pe,null);
});
test('small spread multiple sources reports medium confidence',()=>{
  const s=blendEstimates([row(),row({provider:'B',eps:2.1})],100,'USD',now).selected;
  assert.equal(s.confidence,'medium');assert.equal(s.range_low,2);assert.equal(s.range_high,2.1);
});
test('Nasdaq parses full fiscal year only and preserves absent date',()=>{
  const data={data:{symbol:'test',yearlyForecast:{asOf:null,rows:[{fiscalEnd:'Jun 2027',consensusEPSForecast:0,noOfEstimates:2}]},quarterlyForecast:{rows:[{fiscalEnd:'Dec 2026',consensusEPSForecast:8}]}}};
  const rows=parseNasdaq(data,'TEST',new Date(now).toISOString());
  assert.equal(rows.length,1);assert.equal(rows[0].period_end,'2027-06-30');assert.equal(rows[0].eps,0);assert.equal(rows[0].source_updated_at,null);
  assert.equal(parseNasdaq(data,'OTHER','').length,0);
});
test('StockAnalysis uses public adjusted annual EPS and same-table next fiscal date',()=>{
  const html='EPS and Forward PE are based on non-GAAP adjusted numbers. stats:{annual:{epsNext:{last:1.2,this:2.34},epsThis:{last:1,this:1.62}}},table:{annual:{dates:["2025-06-30","2026-06-30","2027-06-30"],adjustedEps:[1,1.62,"[PRO]"],analysts:[null,20,"[PRO]"]},quarterly:{}} lastUpdated:1791331200000,currency:"USD"';
  const rows=parseStockAnalysis(html,'TEST',new Date(now).toISOString());
  assert.deepEqual(rows.map(x=>[x.eps,x.period_end]),[[1.62,'2026-06-30'],[2.34,'2027-06-30']]);
  assert.equal(parseStockAnalysis('<h1>Access denied</h1>','TEST','').length,0);
});
test('Yahoo basis remains unverified and FY requires exact period end',()=>{
  const rows=parseYahoo({quoteSummary:{result:[{price:{symbol:'TEST'},earningsTrend:{trend:[{period:'+1y',endDate:'2027-12-31',earningsEstimate:{avg:{raw:2},earningsCurrency:'USD',numberOfAnalysts:{raw:15}}},{period:'+1q',endDate:'2027-03-31',earningsEstimate:{avg:4,earningsCurrency:'USD'}}]}}]}},'TEST','');
  assert.equal(rows.length,1);assert.equal(rows[0].basis,'unknown');
});
test('provider failures degrade independently and cached EPS still uses new price',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async(url)=>{
    if(url.includes('api.nasdaq.com')) return Response.json({data:{symbol:'mock',yearlyForecast:{rows:[{fiscalEnd:'Dec 2027',consensusEPSForecast:2}]}}});
    return new Response('unavailable',{status:429});
  };
  try{
    const a=await collectForward('MOCK',100,'USD'),b=await collectForward('MOCK',120,'USD');
    assert.equal(a.selected.source_count,1);assert.equal(a.selected.pe,50);assert.equal(b.selected.pe,60);
    assert.equal(a.availability.filter(x=>x.status==='unavailable').length,2);
  }finally{globalThis.fetch=original;}
});
test('UI source details escaped, fiscal year and single-source status explicit',()=>{
  const context={};vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../apps/terminal/public/forward-consensus-ui.js',import.meta.url),'utf8'),context);
  const f=blendEstimates([row({source:'<img onerror=alert(1)>',url:'javascript:alert(1)'})],100,'USD',now);
  const html=context.forwardPanel({forward_consensus:f,eps_forward:2});
  assert.match(html,/Single source; no average/);assert.match(html,/FY ending 2026-12-31/);
  assert.ok(!html.includes('<img'));assert.ok(!html.includes('href="javascript:'));assert.match(html,/&lt;img/);
});
test('cached API refreshes the price and blends instead of returning old forward ratios',async()=>{
  let handler;
  const fetchMock=async(url)=>{
    if(url.includes('/chart/'))return Response.json({chart:{result:[{meta:{regularMarketPrice:100,currency:'USD',regularMarketTime:1791385200},indicators:{quote:[{close:[99,100]}]}}]}});
    if(url.includes('api.nasdaq.com'))return Response.json({data:{symbol:'test',yearlyForecast:{rows:[{fiscalEnd:'Dec 2027',consensusEPSForecast:2,noOfEstimates:10}]}}});
    return new Response('unavailable',{status:401});
  };
  const original=globalThis.fetch;globalThis.fetch=fetchMock;
  const builder={select(){return this},eq(){return this},maybeSingle:async()=>({data:{status:'ok',data:{_response_type:'json',payload:{symbol:'TEST',price:90,pe_forward:99,eps_forward:8}},logic_version:'test'},error:null})};
  const context={Deno:{env:{get:()=>''},serve:h=>{handler=h}},createClient:()=>({from:()=>builder}),collectForward,fetch:fetchMock,Response,URL,URLSearchParams,Date,console,Set,Map};
  const source=fs.readFileSync(new URL('../supabase/functions/wave-data/index.ts',import.meta.url),'utf8').replace(/^import.*\n/gm,'');
  vm.runInNewContext(stripTypeScriptTypes(source),context);
  try{
    const r=await handler(new Request('https://test/wave-data/api/stock-info?symbol=test')),d=await r.json();
    assert.equal(r.status,200);assert.equal(d.price,100);assert.equal(d.eps_forward,2);assert.equal(d.pe_forward,50);
    assert.ok(d.price_timestamp);assert.equal(r.headers.get('cache-control'),'no-store');
    assert.equal((await handler(new Request('https://test/wave-data/api/stock-info?symbol=../../../secret'))).status,400);
  }finally{globalThis.fetch=original;}
});
