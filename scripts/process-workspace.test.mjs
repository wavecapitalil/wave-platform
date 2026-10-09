import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {PROCESS_REGISTRY} from '../supabase/functions/wave-data/process-registry.ts';
import {adminCalculations} from '../supabase/functions/wave-data/calculation-service.ts';
import {prepareProcessIngestion} from '../supabase/functions/wave-data/process-ingestion-contract.ts';
const require=createRequire(import.meta.url),contract=require('../supabase/functions/wave-data/process-contract.js');
const key='wc_'+'a'.repeat(64),hash=createHash('sha256').update(key).digest('hex'),sha='a'.repeat(40),digest='b'.repeat(64);
function fixture(){return {schema_version:contract.SCHEMA,run:{id:'github-42-1',process_id:'data-engine',process_version:'v1',attempt:1,commit:sha,kind:'observed',status:'ok',started_at:'2026-01-09T06:00:00Z',completed_at:'2026-01-09T06:01:00Z',expected_cutoff:'2026-01-09T06:00:00Z',observed_cutoff:'2026-01-09T06:00:00Z'},events:[],observations:[{id:'obs',source_id:'synthetic test source',fetch_started_at:'2026-01-09T05:59:00Z',fetch_completed_at:'2026-01-09T06:00:00Z',source_timestamp:'2026-01-09T05:00:00Z',source_date_kind:'original_document',digest,coverage:'synthetic',manifest_date:'2026-01-09'}],transformations:[{id:'calc',rule_version:'test-v1',inputs:['obs'],status:'ok',output_digest:digest,units:'USD',period:'2026-01-09',null_reason:null}],outputs:[{id:'out',dataset_key:'synthetic:test',run_id:'github-42-1',transformation_ids:['calc'],observation_ids:['obs'],digest,artifact_version:'v1',publication_status:'not_attempted'}],decisions:[]};}
function db({owner=true,revoked=false,exists=true}={}){return {auth:{getUser:async()=>({error:Error('invalid')})},from(name){let value;const query={select:()=>query,eq:(k,v)=>{value=v;return query;},maybeSingle:async()=>({data:name==='wave_calculation_links'?(exists&&value===hash?{user_id:'owner',revoked_at:revoked?'today':null}:null):(owner?{user_id:'owner'}:null)})};return query;}};}
const request=token=>new Request('https://local/api/admin/calculations?view=processes',{headers:token?{Authorization:'Bearer '+token}:{}}),reply=(data,status,headers)=>new Response(JSON.stringify(data),{status,headers});
test('all terminal pages map to a sidebar process; referenced files exist',()=>{const html=fs.readFileSync('apps/terminal/public/terminal_app.html','utf8'),pages=new Set([...html.matchAll(/data-page="([^"]+)"/g)].map(x=>x[1]));assert.deepEqual(pages,new Set([...PROCESS_REGISTRY.filter(x=>x.page).map(x=>x.page),'brief']));for(const p of PROCESS_REGISTRY)for(const file of p.files)assert.ok(fs.existsSync(file),file);assert.equal(PROCESS_REGISTRY.find(x=>x.id==='presentations').coverage,'not_connected');assert.equal(PROCESS_REGISTRY.find(x=>x.id==='morning-brief').coverage,'not_connected');});
test('process endpoint preserves anonymous, revoked and non-owner denial',async()=>{for(const [token,database,status]of [[null,db(),401],[key,db({revoked:true}),401],[key,db({exists:false}),401],[key,db({owner:false}),403]])assert.equal((await adminCalculations(request(token),database,'https://local',reply)).status,status);const r=await adminCalculations(request(key),db(),'https://local',reply);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('vary'),'Authorization');const data=await r.json();assert.deepEqual(data.runs,[]);assert.equal(data.run_store.status,'not_connected');assert.equal(data.registry.length,PROCESS_REGISTRY.length);});
test('schema-valid never implies a verified source or live run',()=>{const result=contract.inspect(fixture());assert.equal(result.evidence_status,'unverified');assert.ok(result.findings.some(f=>f.code==='selection_decisions_not_recorded'));});
test('cutoff gap and inherited source map are flagged, without rewriting evidence',()=>{const m=fixture();m.run.observed_cutoff='2026-01-09T00:00:00Z';m.observations[0].manifest_date='2026-01-07';m.decisions=[{id:'decision',candidate_id:'example',disposition:'excluded',reason:'not_recorded',observation_ids:[]}];const before=JSON.stringify(m),result=contract.inspect(m);assert.equal(result.evidence_status,'mismatch');for(const code of ['cutoff_gap','inherited_manifest_review','decision_reason_not_recorded'])assert.ok(result.findings.some(f=>f.code===code),code);assert.equal(JSON.stringify(m),before);});
test('unknown fields, credentials containers, duplicate IDs and missing timezone rejected',()=>{for(const modify of [m=>m.credentials='secret',m=>m.observations[0].body='private',m=>m.outputs.push(m.outputs[0]),m=>m.run.started_at='2026-01-09T06:00:00']){const m=fixture();modify(m);assert.throws(()=>contract.inspect(m));}});
test('broken lineage, digest and exact-run mismatches cannot prepare ingestion',()=>{const identity={repository:'wavecapitalil/wave-platform',runId:'42',attempt:1,sha};for(const modify of [m=>m.outputs[0].run_id='other',m=>m.outputs[0].digest='0'.repeat(64),m=>m.transformations[0].inputs=['missing'],m=>m.outputs[0].observation_ids=[]]){const m=fixture();modify(m);assert.equal(contract.inspect(m).evidence_status,'mismatch');assert.throws(()=>prepareProcessIngestion(m,identity));}assert.equal(prepareProcessIngestion(fixture(),identity).ingestion_status,'prepared_not_written');assert.throws(()=>prepareProcessIngestion(fixture(),{...identity,attempt:2}));const m=fixture();m.run.kind='synthetic';assert.throws(()=>prepareProcessIngestion(m,identity));});
test('copied browser contract is byte-identical; no external telemetry destination',()=>{assert.equal(fs.readFileSync('apps/terminal/public/process-contract.js','utf8'),fs.readFileSync('supabase/functions/wave-data/process-contract.js','utf8'));const ui=fs.readFileSync('apps/terminal/public/process-workspace.js','utf8');assert.ok(!ui.includes('fetch('));assert.ok(!ui.includes('localStorage'));assert.ok(!ui.includes('innerHTML'));});

test('scalar arrays, nested payloads and conflicting logical events are rejected',()=>{
 for(const modify of [m=>m.transformations[0].units=[{secret:'test'}],m=>m.transformations[0].period=[],m=>m.transformations[0].null_reason=[],m=>m.run.commit=[sha],m=>m.decisions=[{id:'d',candidate_id:'candidate',disposition:'excluded',reason:[{body:'test'}],observation_ids:[]}],m=>m.events=[{id:'e1',run_id:m.run.id,step_id:'step',stage:'completed',status:'ok',at:m.run.completed_at,error_code:[]}],m=>m.events=[{id:'e1',run_id:m.run.id,step_id:'step',stage:'completed',status:'ok',at:m.run.completed_at},{id:'e2',run_id:m.run.id,step_id:'step',stage:'completed',status:'error',at:m.run.completed_at}]]){const m=fixture();modify(m);assert.throws(()=>contract.inspect(m));}
});

// Exercise the actual browser loader without a live account or browser dependency.
import vm from 'node:vm';
import {DEFINITIONS} from '../supabase/functions/wave-data/calculations.ts';
async function loaderScenario(mode,delayFormula=false){
 const nodes=new Map(),node=()=>({hidden:true,disabled:false,value:'',textContent:'',children:[],replaceChildren(){this.children=[];},append(...items){this.children.push(...items);},setAttribute(){},addEventListener(){}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
 const formula={config:{revision:1,formulas:{},updated_at:'2026-01-01T00:00:00Z'},definitions:DEFINITIONS,history:[],catalog:[],provider_fields:[]};
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));let fallback=0;
 const context={URLSearchParams,AbortSignal,Object,Date,Promise,Error,location:{hash:'#key='+key,pathname:'/test',search:''},history:{replaceState(){}},sessionStorage:{getItem(){return null;},setItem(){},removeItem(){}},document:{getElementById:get,createElement:node,createTextNode:text=>({textContent:text})},window:{WAVE_SUPABASE_CONFIG:{url:'https://test'},WaveProcessWorkspace:{clear(){},fallback(){fallback++;}}},fetch:async url=>{
  if(!url.includes('?view=')){if(delayFormula)await pause(20);return Response.json(formula);}
  if(mode==='legacy')return Response.json(formula);
  if(mode==='error')return Response.json({error:'Unavailable'},{status:503});
  if(mode==='revoked-json')return Response.json({error:'Forbidden'},{status:403});
  if(mode==='revoked-html')return new Response('<html>Forbidden</html>',{status:403});
  if(mode==='logout'){await pause(20);return Response.json(formula);}throw Error('Unknown scenario');
 }};
 vm.runInNewContext(fs.readFileSync('apps/terminal/public/calculation-admin.js','utf8'),context);
 if(mode==='logout')get('logout').onclick();await pause(60);
 const blocked=mode.startsWith('revoked')||mode==='logout';
 assert.equal(get('workspace').hidden,blocked);assert.equal(fallback,blocked?0:1);assert.equal(get('formulas').children.length,blocked?0:14);
}
for(const mode of ['legacy','error','revoked-json','revoked-html','logout'])test('actual loader preserves auth boundary: '+mode,()=>loaderScenario(mode));
test('revocation precedes delayed formula result without reopening workspace',()=>loaderScenario('revoked-html',true));
