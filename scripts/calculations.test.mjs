import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DEFINITIONS,evaluate,runMetric,buildInputs,validateConfig} from '../supabase/functions/wave-data/calculations.ts';
import {calculateCompany,adminCalculations} from '../supabase/functions/wave-data/calculation-service.ts';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/csco-fixture.json',import.meta.url)));
const before=JSON.parse(fs.readFileSync(new URL('./fixtures/csco-before.json',import.meta.url)));
const def=key=>DEFINITIONS.find(d=>d.key===key);
test('SEC Cisco same-date liquidity agrees with published balance sheet',()=>{
 const {inputs,balance_date}=buildInputs(fixture,before);
 assert.equal(balance_date,'2026-07-25');
 assert.deepEqual(['cash','short_investments','receivables','current_liabilities'].map(k=>inputs[k]),[7218e6,8700e6,7470e6,41525e6]);
 assert.equal(runMetric(def('quick_ratio'),def('quick_ratio').expression,inputs),23388/41525);
 assert.equal(runMetric(def('current_ratio'),def('current_ratio').expression,inputs),38665/41525);
 assert.equal(inputs.eps_ttm,3.33);assert.equal(inputs.eps_previous,2.55);
});
test('missing current-period receivable never pulls an older balance or assumes zero',()=>{
 const doc=structuredClone(fixture);doc.facts['us-gaap'].AccountsReceivableNetCurrent.units.USD=doc.facts['us-gaap'].AccountsReceivableNetCurrent.units.USD.filter(x=>x.end!=='2026-07-25');
 const {inputs}=buildInputs(doc,before);assert.equal(inputs.receivables,null);assert.equal(runMetric(def('quick_ratio'),def('quick_ratio').expression,inputs),null);
});
test('interim balance does not use older annual EPS as TTM',()=>{
 const doc=structuredClone(fixture);doc.facts['us-gaap'].LiabilitiesCurrent.units.USD.push({end:'2026-10-25',filed:'2026-11-20',form:'10-Q',val:42e9});
 assert.equal(buildInputs(doc,before).inputs.eps_ttm,null);
});
test('foreign currency market cap and historical EPS are not mixed with USD SEC data',()=>{
 const {inputs}=buildInputs(fixture,{...before,currency:'EUR'});assert.equal(inputs.market_cap,null);assert.equal(inputs.eps_previous,null);assert.equal(inputs.eps_ttm,null);
});
test('arithmetic precedence, unary and abs are deterministic',()=>{
 assert.equal(evaluate('-(2 + 3) * 4 / abs(-2)',{},[]),-10);
 assert.equal(evaluate('cash * .5 + 2',{cash:8},['cash']),6);
});
test('division by zero and missing values never invent a metric',()=>{
 assert.equal(evaluate('1 / 0',{},[]),null);assert.equal(evaluate('cash + 1',{},['cash']),null);
});
test('arbitrary code, properties, extra syntax and excessive nesting are rejected',()=>{
 for(const code of ['globalThis.fetch(1)','cash.constructor','process.exit()','1;2','1 2','2**3','abs(1,2)','('.repeat(40)+'1'+')'.repeat(40)])assert.throws(()=>evaluate(code,{cash:1},['cash']));
 assert.throws(()=>validateConfig({not_a_metric:'1'}));assert.throws(()=>validateConfig({quick_ratio:'price'}));
});
test('historical PEG rejects losses and nonpositive growth',()=>{
 const d=def('peg_historical');for(const pair of [[-1,2],[2,-1],[2,2],[1,2]])assert.equal(runMetric(d,d.expression,{price:100,eps_ttm:4,eps_annual:pair[0],eps_previous:pair[1]}),null);
 assert.equal(runMetric(d,d.expression,{price:100,eps_ttm:4,eps_annual:3,eps_previous:2}),.5);
});
const factsDB={rpc:async()=>({data:{document:fixture}})};
test('runtime override changes actual public field, default restore returns provider baseline',async()=>{
 const live=await calculateCompany(factsDB,{...before},{revision:1,formulas:{}});
 assert.equal(live.quick_ratio,23388/41525);assert.equal(live.eps_trailing,3.33);assert.equal(live.pe_forward,before.price/before.eps_forward);
 const custom=await calculateCompany(factsDB,structuredClone(live),{revision:2,formulas:{quick_ratio:'cash / current_liabilities',gross_margin:'gross_profit / revenue * 100 - 1'}});
 assert.equal(custom.quick_ratio,7218/41525);assert.notEqual(custom.gross_margin,live.gross_margin);
 const restored=await calculateCompany(factsDB,structuredClone(custom),{revision:3,formulas:{}});
 assert.equal(restored.quick_ratio,live.quick_ratio);assert.equal(restored.gross_margin,before.gross_margin);
});
const reply=(data,status,headers)=>new Response(JSON.stringify(data),{status,headers});
const request=(token,body)=>new Request('https://local/api/admin/calculations',{headers:token?{Authorization:'Bearer '+token}:{},method:body?'POST':'GET',body:body?JSON.stringify(body):undefined});
function authDB({valid=true,owner=true,confirmed=true}={}){return {auth:{getUser:async()=>({data:{user:valid?{id:'owner-id',email_confirmed_at:confirmed?'2026-01-01':null}:null},error:valid?null:Error('invalid')})},from:(name)=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:owner?{user_id:'owner-id'}:null}),single:async()=>({data:{revision:1,formulas:{}}}),order:()=>q,limit:async()=>({data:[]})};return q;}};}
test('anonymous and forged sessions cannot read or mutate settings',async()=>{
 for(const payload of [undefined,{action:'publish',formulas:{},expected_revision:1,reason:'test'}]){
  assert.equal((await adminCalculations(request(null,payload),authDB(),'https://local',reply)).status,401);
  assert.equal((await adminCalculations(request('forged',payload),authDB({valid:false}),'https://local',reply)).status,401);
 }
});
test('a valid ordinary customer or unconfirmed user cannot access administration',async()=>{
 for(const payload of [undefined,{action:'publish',formulas:{},expected_revision:1,reason:'test'}]){
  assert.equal((await adminCalculations(request('customer',payload),authDB({owner:false}),'https://local',reply)).status,403);
  assert.equal((await adminCalculations(request('unconfirmed',payload),authDB({confirmed:false}),'https://local',reply)).status,401);
 }
});
test('owner can inspect registry, outdated revision and unsafe formulas cannot publish',async()=>{
 const response=await adminCalculations(request('owner'),authDB(),'https://local',reply);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).definitions.length,14);
 assert.equal((await adminCalculations(request('owner',{action:'publish',formulas:{},expected_revision:0,reason:'test'}),authDB(),'https://local',reply)).status,409);
 assert.equal((await adminCalculations(request('owner',{action:'publish',formulas:{quick_ratio:'fetch(1)'},expected_revision:1,reason:'test'}),authDB(),'https://local',reply)).status,400);
});
test('owner publish passes validated formulas and authenticated actor to atomic transaction',async()=>{
 const db=authDB();let called=false;db.rpc=async(name,args)=>{called=true;assert.equal(name,'wave_publish_calculations');assert.equal(args.p_actor,'owner-id');assert.equal(args.p_expected,1);assert.deepEqual(args.p_formulas,{quick_ratio:'cash / current_liabilities'});return {data:2};};
 const response=await adminCalculations(request('owner',{action:'publish',formulas:{quick_ratio:'cash / current_liabilities'},expected_revision:1,reason:'Liquidity definition'}),db,'https://local',reply);assert.equal(response.status,200);assert.equal(called,true);assert.equal((await response.json()).revision,2);
});
