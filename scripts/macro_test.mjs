import test from 'node:test';
import assert from 'node:assert/strict';
import {MACRO_SERIES,catalogue,parseHistory,validateRelease,releaseSet,history} from '../supabase/functions/wave-data/macro.ts';
import {MACRO_RELEASES} from '../supabase/functions/wave-data/macro-releases.ts';
const now=Date.parse('2026-10-14T20:00:00Z');
const clone=x=>structuredClone(x);
test('13 requested slots, separate licensed ISM, no automation or consensus claim',()=>{
 const c=catalogue(now);assert.equal(c.series.length,13);assert.equal(c.country,'US');assert.equal(c.automation,'not_connected');assert.equal(c.series.filter(s=>s.status==='license_unverified').length,2);assert.equal(c.series.filter(s=>s.group==='inflation').length,3);
 assert.ok(c.series.flatMap(s=>s.releases).every(r=>r.consensus===null));
});
test('verified NFP gains AND losses reconcile exactly; revisions retain previous release',()=>{
 const rows=releaseSet(MACRO_RELEASES),n=rows.find(r=>r.id==='nfp:2026-10-02');assert.equal(n.components.reduce((sum,x)=>sum+x[1],0),29);assert.ok(n.components.some(x=>x[1]<0));assert.equal(n.residual,0);
 assert.equal(rows.find(r=>r.id==='nfp:2026-09-04').actual,162);assert.equal(n.prior,162);assert.equal(n.revised_prior,133);assert.equal(n.revisions.reduce((a,r)=>a+r.after-r.before,0),-60);
 assert.equal(MACRO_RELEASES[0].actual,162);
});
test('CPI uses Table 7 effects, honest rounding residual, no unweighted rates',()=>{
 const r=validateRelease(MACRO_RELEASES.find(r=>r.series==='cpi'));assert.equal(r.actual,3.7);assert.equal(r.residual,-.037);assert.deepEqual(r.components.map(x=>x[1]),[.338,1.353,2.046]);
 const broken=clone(r);broken.components[0][1]=2.5;assert.throws(()=>validateRelease(broken),/reconcile/);
 broken.components=r.components;broken.table='Component percent changes';assert.throws(()=>validateRelease(broken),/effects/);
});
test('invalid release snapshots fail closed: dates, nulls, overlapping duplicate rows, consensus timing',()=>{
 const r=clone(MACRO_RELEASES[1]);
 for(const patch of [{actual:null},{actual:NaN},{period:'unknown'},{released_at:'bad'},{source:'https://example.com'},{prior_period:null},{components:[['a',29],['a',0]]},{components:[['a',28]]}])assert.throws(()=>validateRelease({...r,...patch}));
 assert.throws(()=>releaseSet([r,r]),/Duplicate/);
 for(const consensus of [{value:50},{value:50,source:'provider',access_verified:true,captured_at:r.released_at},{value:50,source:'provider',access_verified:false,captured_at:'2026-10-01T12:00:00Z'}])assert.throws(()=>validateRelease({...r,consensus}),/consensus/);
 assert.equal(catalogue(Date.parse('2026-09-01')).series.flatMap(s=>s.releases).length,0);
});
test('native period arithmetic never bridges missing months or coerces missing values',()=>{
 const s=MACRO_SERIES.find(s=>s.id==='retail');
 const p=parseHistory('observation_date,RSAFS\n2026-05-01,100\n2026-06-01,110\n2026-07-01,.\n2026-08-01,121\n2026-09-01,121',s,now);
 assert.deepEqual(p,[{period:'2026-06-01',value:10},{period:'2026-09-01',value:0}]);
 assert.throws(()=>parseHistory('DATE,WRONG\n2026-09-01,100',s,now));
 assert.throws(()=>parseHistory('DATE,RSAFS\n2026-09-01,100\n2026-09-01,120',s,now));
 assert.throws(()=>parseHistory('DATE,RSAFS\n2026-09-01,NaN',s,now));
 const claims=MACRO_SERIES.find(s=>s.id==='claims');assert.equal(parseHistory('DATE,ICSA\n2026-09-05,200000\n2026-09-12,210000',claims,now).length,2);
});
test('year-over-year uses matching month and monthly NFP uses level differences',()=>{
 assert.equal(parseHistory('DATE,CPIAUCNS\n2025-09-01,100\n2026-08-01,102\n2026-09-01,103',MACRO_SERIES[0],now)[0].value,3);
 assert.equal(parseHistory('DATE,PAYEMS\n2026-08-01,1000\n2026-09-01,990',MACRO_SERIES.find(s=>s.id==='nfp'),now)[0].value,-10);
});
test('history failure stays missing; stale cache preserves retrieval time; no ISM request',async()=>{
 let calls=0;const fail=async()=>{calls++;return new Response('',{status:503});};
 assert.equal((await history('claims',fail,now)).status,'unavailable');
 const ok=await history('claims',async()=>new Response('DATE,ICSA\n2026-10-03,200000\n2026-10-10,210000'),now);
 assert.equal(ok.status,'current_vintage');
 const stale=await history('claims',fail,now+3600001);assert.equal(stale.status,'stale');assert.equal(stale.fetched_at,ok.fetched_at);
 const before=calls;assert.equal((await history('ism_services',fail,now)).status,'license_unverified');assert.equal(calls,before);
 await assert.rejects(()=>history('../../secret',fail,now));
});

test('GDP official signed contribution partition reconciles and rejects malformed/missing data',async()=>{
 const {parseComponents}=await import('../supabase/functions/wave-data/macro.ts');
 const header='DATE,A191RL1Q225SBEA,DPCERY2Q224SBEA,A006RY2Q224SBEA,A020RY2Q224SBEA,A021RY2Q224SBEA,A822RY2Q224SBEA';
 const csv=header+'\n2026-04-01,2.2,2.51,.82,.56,-1.66,-.01';
 // FRED uses leading zeros; malformed numeric text must not be silently coerced.
 assert.throws(()=>parseComponents(csv,'gdp',now));
 const valid=header+'\n2026-04-01,2.2,2.51,0.82,0.56,-1.66,-0.01';
 const r=parseComponents(valid,'gdp',now)[0];assert.equal(r.sum,2.22);assert.equal(r.residual,-.02);assert.equal(r.reconciled,true);assert.equal(r.components[3].value,-1.66);
 assert.equal(parseComponents(valid.replace('-1.66','1.66'),'gdp',now)[0].reconciled,false);
 const missing=parseComponents(valid.replace('-1.66','.'),'gdp',now)[0];assert.equal(missing.sum,null);assert.equal(missing.complete,false);assert.equal(missing.components[3].value,null);
 for(const bad of [valid+'\n2026-04-01,2.2,2.51,0.82,0.56,-1.66,-0.01',valid.replace('2026-04-01','2026-05-01'),valid.replace('A006RY2Q224SBEA','WRONG'),valid+',10'])assert.throws(()=>parseComponents(bad,'gdp',now));
});
test('PCE price changes use matching-month price indices and never sum overlapping categories',async()=>{
 const {parseComponents}=await import('../supabase/functions/wave-data/macro.ts');
 const csv='DATE,PCEPI,DDURRG3M086SBEA,DNDGRG3M086SBEA,DSERRG3M086SBEA,DFXARG3M086SBEA,DNRGRG3M086SBEA\n2025-08-01,100,100,100,100,100,100\n2026-06-01,100,100,100,100,100,100\n2026-07-01,110,110,110,.,110,110\n2026-08-01,121,121,121,121,121,121';
 const r=parseComponents(csv,'pce',now).at(-1);assert.equal(r.mom,10);assert.equal(r.yoy,21);assert.equal(r.components[0].mom,10);assert.equal(r.components[0].yoy,21);assert.equal(r.components[2].mom,null);assert.equal(r.sum,null);assert.equal(r.residual,null);assert.equal(r.reconciled,null);
});
test('component fetch is allowlisted, cached and retains one whole batch on failure',async()=>{
 const {componentHistory}=await import('../supabase/functions/wave-data/macro.ts');
 let calls=0;const csv='DATE,A191RL1Q225SBEA,DPCERY2Q224SBEA,A006RY2Q224SBEA,A020RY2Q224SBEA,A021RY2Q224SBEA,A822RY2Q224SBEA\n2026-04-01,2.2,2.51,0.82,0.56,-1.66,-0.01';
 const fetcher=async url=>{calls++;assert.ok(url.startsWith('https://fred.stlouisfed.org/graph/fredgraph.csv?id='));return new Response(csv);};
 await assert.rejects(()=>componentHistory('claims',fetcher,now));assert.equal(calls,0);
 const first=await componentHistory('gdp',fetcher,now);assert.equal(first.status,'current_vintage');
 const cached=await componentHistory('gdp',fetcher,now+10);assert.equal(cached.cached,true);assert.equal(calls,1);
 const stale=await componentHistory('gdp',async()=>new Response('',{status:503}),now+3600001);assert.equal(stale.status,'stale');assert.equal(stale.fetched_at,first.fetched_at);assert.deepEqual(stale.rows,first.rows);
 const unavailable=await componentHistory('pce',async()=>new Response('bad'),now);assert.equal(unavailable.status,'unavailable');assert.deepEqual(unavailable.rows,[]);
});
test('duplicate missing observations and nonnative monthly dates fail closed',()=>{
 assert.throws(()=>parseHistory('DATE,RSAFS\n2026-09-01,.\n2026-09-01,12',MACRO_SERIES.find(s=>s.id==='retail'),now));
 assert.throws(()=>parseHistory('DATE,PCEPI\n2026-08-02,100',MACRO_SERIES.find(s=>s.id==='pce'),now));
});
test('quarterly freshness uses period end, not the quarter-start timestamp',async()=>{
 const {observationStale}=await import('../supabase/functions/wave-data/macro.ts');
 assert.equal(observationStale('2026-04-01','quarterly',now),false);
 assert.equal(observationStale('2026-01-01','quarterly',now),true);
 assert.equal(observationStale('2026-09-01','monthly',now),false);
 assert.equal(observationStale('2026-08-01','weekly',now),true);
});
test('bounded CPI archive preserves separate annual headline/core vintages and excludes unverified past captures',()=>{
 const c=catalogue(Date.parse('2026-10-21T14:00:00Z'));
 for(const [id,expected] of [['cpi',[3.5,3.4,3.4,3.7]],['core_cpi',[2.6,2.5,2.4,2.6]]]){
  const s=c.series.find(x=>x.id===id);assert.deepEqual(s.releases.map(r=>r.actual),expected);
  assert.ok(s.releases.every(r=>r.unit==='% YoY'&&r.sa==='NSA'&&r.consensus===null));
  assert.ok(s.releases.slice(0,3).every(r=>r.components.length===0&&r.source.includes('/archives/')));
  assert.equal(s.releases[0].prior,null);assert.equal(s.releases[1].prior,s.releases[0].actual);
 }
 assert.equal(catalogue(Date.parse('2026-10-20')).series.find(s=>s.id==='cpi').releases.length,0);
});
