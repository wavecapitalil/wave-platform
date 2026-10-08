import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {buildValuationInputs} from '../supabase/functions/wave-data/valuation-inputs.ts';
import {settings,calculateCompany,adminCalculations} from '../supabase/functions/wave-data/calculation-service.ts';

const emptyFacts = {data:{document:{entityName:'Fixture',facts:{}}},error:null};
const companyFacts = JSON.parse(fs.readFileSync(new URL('./fixtures/csco-fixture.json',import.meta.url)));
const companyBefore = JSON.parse(fs.readFileSync(new URL('./fixtures/csco-before.json',import.meta.url)));
function handler({cached=emptyFacts,stock=null,quote=null,quoteFailure=false}={}){
  let route;
  const calls={rpc:[],fetch:[],tables:[],company:0,settings:0,admin:0,forward:0};
  const client={
    auth:{getUser:async()=>({data:{user:null},error:Error('invalid')})},
    rpc:async(name,args)=>{calls.rpc.push({name,args});return cached;},
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
    Deno:{env:{get:()=>''},serve:h=>{route=h}},createClient:()=>client,buildValuationInputs,
    settings:async(...args)=>{calls.settings++;return settings(...args);},
    calculateCompany:async(...args)=>{calls.company++;return calculateCompany(...args);},
    adminCalculations:async(...args)=>{calls.admin++;return adminCalculations(...args);},
    collectForward:async()=>{calls.forward++;return {logic_version:'fixture',selected:null};},
    fetch:async(url)=>{
      calls.fetch.push(url);if(quoteFailure)throw Error('quote unavailable');
      return Response.json({chart:{result:quote?[{meta:quote}]:[]}});
    },
    Response,URL,URLSearchParams,Date,console,Set,Map
  };
  const source=fs.readFileSync(new URL('../supabase/functions/wave-data/index.ts',import.meta.url),'utf8').replace(/^import.*\n/gm,'');
  vm.runInNewContext(stripTypeScriptTypes(source),context);
  return {route,calls};
}
const request=(suffix,options)=>new Request('https://test/wave-data/api/'+suffix,options);

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
