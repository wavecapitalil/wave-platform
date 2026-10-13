import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {buildValuationInputs} from '../supabase/functions/wave-data/valuation-inputs.ts';
import {settings,calculateCompany,adminCalculations} from '../supabase/functions/wave-data/calculation-service.ts';
import {withFundamentalReporting} from '../supabase/functions/wave-data/fundamental-reporting.ts';
import {createCompanyFactsLoader} from '../supabase/functions/wave-data/company-facts.ts';

const emptyFacts = {data:{document:{entityName:'Fixture',facts:{}}},error:null};
const companyFacts = JSON.parse(fs.readFileSync(new URL('./fixtures/csco-fixture.json',import.meta.url)));
const companyBefore = JSON.parse(fs.readFileSync(new URL('./fixtures/csco-before.json',import.meta.url)));
function handler({cached=emptyFacts,stock=null,quote=null,quoteFailure=false}={}){
  let route;
  const calls={rpc:[],fetch:[],tables:[],company:0,settings:0,admin:0,forward:0};
  const client={
    auth:{getUser:async()=>({data:{user:null},error:Error('invalid')})},
    rpc:async(name,args)=>{calls.rpc.push({name,args});return typeof cached==='function'?cached(name,args):cached;},
    from(name){
      calls.tables.push(name);
      const query={
        select:()=>query,eq:()=>query,
        maybeSingle:async()=>({data:name==='data_snapshots'&&stock?{status:'ok',data:stock}:null,error:null}),
        single:async()=>({data:{revision:7,formulas:{}},error:null}),
        order:()=>query,limit:async()=>({data:[],error:null})
      };return query;
    }
  };
  const context={
    Deno:{env:{get:()=>''},serve:h=>{route=h}},createClient:()=>client,buildValuationInputs,withFundamentalReporting,createCompanyFactsLoader,
    settings:async(...args)=>{calls.settings++;return settings(...args);},
    calculateCompany:async(...args)=>{calls.company++;return calculateCompany(...args);},
    adminCalculations:async(...args)=>{calls.admin++;return adminCalculations(...args);},
    collectForward:async()=>{calls.forward++;return {logic_version:'fixture',selected:null};},
    fetch:async(url)=>{
      calls.fetch.push(url);if(quoteFailure)throw Error('quote unavailable');
      return Response.json({chart:{result:quote?[{meta:quote}]:[]}});
    },
    Response,Headers,URL,URLSearchParams,Date,console,Set,Map
  };
  const source=fs.readFileSync(new URL('../supabase/functions/wave-data/index.ts',import.meta.url),'utf8').replace(/^import.*\n/gm,'');
  vm.runInNewContext(stripTypeScriptTypes(source),context);
  return {route,calls};
}
const request=(suffix,options)=>new Request('https://test/wave-data/api/'+suffix,options);

test('facts loader deduplicates concurrent reads, expires locally and never extends provider freshness',async()=>{
  let now=Date.parse('2026-10-13T10:00:00Z'),calls=0,resolve;
  const result={data:{document:{facts:{}},fetched_at:new Date(now-86400000+20).toISOString()},error:null};
  const load=createCompanyFactsLoader(async()=>{calls++;return new Promise(r=>{resolve=r;});},{now:()=>now});
  const a=load(' msft '),b=load('MSFT');await Promise.resolve();assert.equal(calls,1);resolve(result);
  assert.strictEqual(await a,await b);assert.strictEqual(await load('MSFT'),result);assert.equal(calls,1);
  now+=21;const c=load('MSFT');await Promise.resolve();assert.equal(calls,2);resolve(result);await c;
});
test('facts loader evicts by entries and serialized bytes, and does not retain stale or failed results',async()=>{
  let now=Date.parse('2026-10-13T10:00:00Z'),calls=0;
  const result={data:{document:{text:'א'.repeat(64)},fetched_at:new Date(now).toISOString()},error:null};
  const bytes=new TextEncoder().encode(JSON.stringify(result)).byteLength;
  const load=createCompanyFactsLoader(async()=>{calls++;return result;},{now:()=>now,maxEntries:4,maxBytes:bytes+1});
  await load('A');await load('A');assert.equal(calls,1);await load('B');await load('A');assert.equal(calls,3);
  now+=30001;await load('A');assert.equal(calls,4);
  for(const response of [{...result,error:{message:'failed'}},{data:{...result.data,stale_fallback:true},error:null},{data:{document:{}},error:null}]){
    let n=0;const uncached=createCompanyFactsLoader(async()=>{n++;return response;});
    await uncached('A');await uncached('A');assert.equal(n,2);
  }
  let n=0;const reject=createCompanyFactsLoader(async()=>{n++;throw Error('down');});
  await assert.rejects(reject('A'));await assert.rejects(reject('A'));assert.equal(n,2);
  n=0;const tiny=createCompanyFactsLoader(async()=>{n++;return result;},{now:()=>now-30001,maxBytes:bytes-1});
  await tiny('A');await tiny('A');assert.equal(n,2);
  n=0;const one=createCompanyFactsLoader(async()=>{n++;return result;},{now:()=>now-30001,maxEntries:1});
  await one('A');await one('B');await one('A');assert.equal(n,3);
});

test('dynamic fundamentals reuse one SEC document for values and fiscal metadata',async()=>{
  for(const period of ['annual','quarterly']){
    const cached={data:{document:companyFacts,cached:true,fetched_at:'2026-10-13T10:00:00Z'},error:null};
    const {route,calls}=handler({cached});
    const response=await route(request('fundamentals?symbol=CSCO&metric=revenue&period='+period));
    const body=await response.json();
    assert.equal(response.status,200);assert.ok(body.data.length>=3);
    assert.equal(calls.rpc.length,1);
    assert.equal(calls.rpc[0].name,'wave_get_companyfacts');
    assert.equal(body.meta.provider_fetched_at,cached.data.fetched_at);
    assert.ok(body.reporting);assert.equal(response.headers.get('x-wave-reporting-version'),'fiscal-reporting-v1');
    const withoutReporting={...body,data:body.data.map(({date,value})=>({date,value}))};
    const expected=withFundamentalReporting(withoutReporting,cached.data,Date.parse(body.reporting.checked_at),null);
    assert.deepEqual(body.data,expected.data);
    assert.deepEqual(body.reporting,expected.reporting);
  }
});
test('snapshot fundamentals still fetch fiscal metadata once and preserve stored values',async()=>{
  const stock={symbol:'CSCO',metric:'revenue',period:'annual',data:[{date:'2025-07-31',value:123}]};
  const {route,calls}=handler({stock,cached:{data:{document:companyFacts},error:null}});
  const response=await route(request('fundamentals?symbol=CSCO&metric=revenue&period=annual'));
  const body=await response.json();
  assert.equal(response.status,200);assert.equal(calls.rpc.length,1);
  assert.equal(body.data[0].value,123);assert.ok(body.reporting);
});
test('failed dynamic SEC reads are not retried as reporting metadata requests',async()=>{
  const {route,calls}=handler({cached:{data:null,error:{message:'statement timeout'}}});
  const response=await route(request('fundamentals?symbol=CSCO&metric=revenue&period=annual'));
  assert.equal(response.status,502);assert.equal(calls.rpc.length,1);
});
test('request-local SEC reuse does not leak one ticker into another',async()=>{
  const {route,calls}=handler({cached:(_name,args)=>({data:{document:{...companyFacts,entityName:args.p_ticker},cached:true},error:null})});
  const responses=await Promise.all(['CSCO','OTHER'].map(symbol=>route(request('fundamentals?symbol='+symbol+'&metric=revenue&period=annual'))));
  const bodies=await Promise.all(responses.map(r=>r.json()));
  assert.deepEqual(bodies.map(x=>x.name),['CSCO','OTHER']);assert.equal(calls.rpc.length,2);
});

test('valuation route rejects invalid ticker before fetching either provider',async()=>{
  const {route,calls}=handler();
  for(const symbol of ['','../../../secret','<script>','^GSPC','A'.repeat(16)])assert.equal((await route(request('valuation-inputs?symbol='+encodeURIComponent(symbol)))).status,400);
  assert.equal(calls.rpc.length,0);assert.equal(calls.fetch.length,0);
});
test('valuation route responds with explicit missing-value contract',async()=>{
  const {route,calls}=handler();
  const response=await route(request('valuation-inputs?symbol=TEST'));
  const data=await response.json();
  assert.equal(response.status,200);assert.equal(data.symbol,'TEST');
  assert.equal(data.fields.revenue.value,null);assert.equal(data.fields.shares_outstanding.value,null);
  assert.equal(response.headers.get('cache-control'),'public, max-age=900');
  assert.equal(calls.rpc.length,1);assert.equal(calls.rpc[0].name,'wave_get_companyfacts');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.rpc[0].args)),{p_ticker:'TEST',p_force:false});
  assert.equal(calls.company,0);assert.equal(calls.settings,0);assert.equal(calls.admin,0);assert.equal(calls.tables.length,0);
});
test('valuation route normalizes ticker without widening accepted input',async()=>{
  const {route,calls}=handler();
  const response=await route(request('valuation-inputs?symbol='+encodeURIComponent(' brk.b ')));
  assert.equal(response.status,200);assert.equal((await response.json()).symbol,'BRK-B');
  assert.equal(calls.rpc[0].args.p_ticker,'BRK-B');
});
test('valuation route cleanly degrades when cached SEC data unavailable',async()=>{
  for(const cached of [{data:null,error:{message:'private provider detail'}},{data:{},error:null}]){
    const {route}=handler({cached});const response=await route(request('valuation-inputs?symbol=TEST'));
    assert.equal(response.status,502);assert.equal((await response.json()).error,'reported valuation data unavailable');
  }
});
test('quote failure leaves real historical SEC fields available',async()=>{
  const {route}=handler({cached:{data:{document:companyFacts},error:null},quoteFailure:true});
  const response=await route(request('valuation-inputs?symbol=CSCO'));const data=await response.json();
  assert.equal(response.status,200);assert.equal(data.fields.current_price.value,null);
  assert.ok(data.fields.revenue.value>0);assert.ok(data.history.length>0);
});
test('valuation route cannot mutate data and OPTIONS preserves existing CORS',async()=>{
  const {route,calls}=handler();
  for(const method of ['POST','PUT','DELETE','PATCH'])assert.equal((await route(request('valuation-inputs?symbol=TEST',{method}))).status,405);
  const response=await route(request('valuation-inputs?symbol=TEST',{method:'OPTIONS'}));
  assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-methods'),'GET,POST,OPTIONS');
  assert.equal(calls.rpc.length,0);assert.equal(calls.fetch.length,0);
});
test('private calculation admin remains routed through owner authorization for reads and writes',async()=>{
  const {route,calls}=handler();
  for(const method of ['GET','POST'])for(const token of [null,'forged','wc_invalid']){
    const response=await route(request('admin/calculations',{method,headers:token?{Authorization:'Bearer '+token}:{},body:method==='POST'?JSON.stringify({action:'publish'}):undefined}));
    assert.equal(response.status,401);assert.equal(response.headers.get('cache-control'),'no-store');
    const body=await response.json();assert.equal(body.catalog,undefined);assert.equal(body.config,undefined);
  }
  assert.equal(calls.admin,6);assert.equal(calls.rpc.length,0);assert.equal(calls.fetch.length,0);
});
test('existing stock-info route still applies real Company Research calculation service and forward consensus',async()=>{
  const {route,calls}=handler({cached:{data:{document:companyFacts},error:null},stock:companyBefore,quote:{regularMarketPrice:companyBefore.price,currency:'USD',regularMarketTime:1791457200}});
  const response=await route(request('stock-info?symbol=CSCO'));const data=await response.json();
  assert.equal(response.status,200);assert.equal(calls.company,1);assert.equal(calls.settings,1);assert.equal(calls.forward,1);
  assert.equal(data.calculation_meta.revision,7);assert.equal(data.quick_ratio,23388/41525);
  assert.equal(response.headers.get('x-wave-source'),'company-research-consensus');
  assert.equal(response.headers.get('cache-control'),'no-store');
});
