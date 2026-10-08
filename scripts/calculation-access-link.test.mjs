import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {adminCalculations} from '../supabase/functions/wave-data/calculation-service.ts';
const key='wc_'+'a'.repeat(64);
const digest=createHash('sha256').update(key).digest('hex');
const request=(token,body)=>new Request('https://local/api/admin/calculations',{method:body?'POST':'GET',headers:token?{Authorization:'Bearer '+token}:{},body:body?JSON.stringify(body):undefined});
const reply=(data,status,headers)=>new Response(JSON.stringify(data),{status,headers});
function database({revoked=false,exists=true,owner=true}={}){let actor=null;return {auth:{getUser:async()=>({error:Error('invalid')})},rpc:async(name,args)=>{actor=args.p_actor;return {data:2};},get actor(){return actor;},from(name){let lookup;const q={select:()=>q,eq:(k,v)=>{lookup=v;return q;},single:async()=>({data:{revision:1,formulas:{}}}),order:()=>q,limit:async()=>({data:[]}),maybeSingle:async()=>name==='wave_calculation_links'?{data:exists&&lookup===digest?{user_id:'owner',revoked_at:revoked?'today':null}:null}:{data:owner&&lookup==='owner'?{user_id:'owner'}:null}};return q;}};}
test('private link opens registry without email or Auth session',async()=>{const r=await adminCalculations(request(key),database(),'https://local',reply);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).definitions.length,14);});
test('missing, malformed, unknown and revoked links cannot read or publish',async()=>{for(const body of [undefined,{action:'publish',expected_revision:1,formulas:{},reason:'change'}]){for(const [token,db]of [[null,database()],[key+'z',database()],[key,database({exists:false})],[key,database({revoked:true})]])assert.equal((await adminCalculations(request(token,body),db,'https://local',reply)).status,401);}});
test('removed owner loses link access',async()=>{assert.equal((await adminCalculations(request(key),database({owner:false}),'https://local',reply)).status,403);});
test('link publication is attributed to its owner',async()=>{const db=database();const r=await adminCalculations(request(key,{action:'publish',expected_revision:1,formulas:{quick_ratio:'cash / current_liabilities'},reason:'test'}),db,'https://local',reply);assert.equal(r.status,200);assert.equal(db.actor,'owner');});
