import {DEFINITIONS,buildInputs,runMetric,validateConfig} from './calculations.ts';
import {SOURCE_CATALOG} from './calculation-catalog.ts';

export async function settings(db:any){const {data,error}=await db.from('wave_calculation_settings').select('revision,formulas,updated_at').eq('id',1).single();if(error||!data)throw Error('Calculation settings unavailable');validateConfig(data.formulas);return data;}
export async function factsFor(db:any,symbol:string){const {data,error}=await db.rpc('wave_get_companyfacts',{p_ticker:symbol,p_force:false});if(error)throw Error('SEC data unavailable');return data;}
export async function calculateCompany(db:any,body:any,config:any,withTrace=false){
 const baseline=body.calculation_meta?.baseline||Object.fromEntries(DEFINITIONS.map(d=>[d.key,body[d.key]??null]));
 for(const def of DEFINITIONS)body[def.key]=baseline[def.key]??null;
 const facts=await factsFor(db,body.symbol).catch(()=>null);
 const context=buildInputs(facts?.document,body),results:any={};
 if(body.eps_trailing==null&&context.inputs.eps_ttm!=null)body.eps_trailing=context.inputs.eps_ttm;
 for(const def of DEFINITIONS){
  const expression=config.formulas[def.key]??def.expression;
  const value=runMetric(def,expression,context.inputs);
  const active=def.always||Object.hasOwn(config.formulas,def.key);
  results[def.key]={value,active,expression,basis:def.basis,inputs:Object.fromEntries(def.variables.map((k:string)=>[k,context.trace[k]??null]))};
  if(active){body[def.key]=value;}
  // Keep an available vendor P/E if its underlying EPS is unavailable to us.
  // An explicit owner formula never silently falls back to another method.
  if(def.key==='pe_trailing'&&value==null&&!Object.hasOwn(config.formulas,def.key))body[def.key]=baseline[def.key]??null;
 }
 body.calculation_meta={revision:config.revision,balance_date:context.balance_date,fiscal_year:context.fiscal_year,custom_metrics:Object.keys(config.formulas),sec_stale:Boolean(facts?.stale_fallback),baseline};
 return withTrace?{body,results,...context}:body;
}

export async function adminCalculations(req:Request,db:any,baseURL:string,reply:any){
 const headers={'cache-control':'no-store','vary':'Authorization'};
 const token=req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
 if(!token)return reply({error:'Sign in required'},401,headers);
 const {data:auth,error:authError}=await db.auth.getUser(token);
 if(authError||!auth?.user||!auth.user.email_confirmed_at)return reply({error:'Invalid session'},401,headers);
 const {data:owner,error:ownerError}=await db.from('wave_calculation_owners').select('user_id').eq('user_id',auth.user.id).maybeSingle();
 if(ownerError||!owner)return reply({error:'Owner access only'},403,headers);
 if(req.method==='GET'){
  const config=await settings(db);
  const {data:history,error}=await db.from('wave_calculation_history').select('revision,formulas,changed_at,reason').order('revision',{ascending:false}).limit(50);
  if(error)throw Error('History unavailable');
  return reply({config,definitions:DEFINITIONS,history,catalog:SOURCE_CATALOG,provider_fields:['peg_ratio','ev_ebitda','dividend_yield','payout_ratio','beta','eps_trailing','market_cap','debt_to_equity'],coverage:'Editable live formulas apply to Company Research. Other engines are documented as source code and require a code release; they are not runtime-editable.'},200,headers);
 }
 if(req.method!=='POST')return reply({error:'Method not allowed'},405,headers);
 const raw=await req.text();if(raw.length>20000)return reply({error:'Request too large'},413,headers);
 let input:any;try{input=JSON.parse(raw);validateConfig(input.formulas);}catch(e){return reply({error:String((e as Error).message)},400,headers);}
 const config=await settings(db);
 if(input.expected_revision!==config.revision)return reply({error:'Revision changed. Reload before publishing.'},409,headers);
 if(input.action==='preview'){
  const symbol=String(input.symbol||'').trim().toUpperCase();if(!/^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(symbol))return reply({error:'Valid symbol required'},400,headers);
  const response=await fetch(baseURL+'/functions/v1/wave-data/api/stock-info?symbol='+encodeURIComponent(symbol));
  if(!response.ok)return reply({error:'Company data unavailable for preview'},502,headers);
  const body=await response.json();
  const candidate=await calculateCompany(db,{...body},{...config,formulas:input.formulas},true);
  return reply({symbol,revision:config.revision,current:body,candidate},200,headers);
 }
 if(input.action==='publish'){
  if(typeof input.reason!=='string'||input.reason.trim().length<3)return reply({error:'Change reason required'},400,headers);
  const {data,error}=await db.rpc('wave_publish_calculations',{p_actor:auth.user.id,p_expected:config.revision,p_formulas:input.formulas,p_reason:input.reason});
  if(error)return reply({error:error.message.includes('revision conflict')?'Revision changed. Reload.':'Could not publish'},409,headers);
  return reply({revision:data,published:true},200,headers);
 }
 return reply({error:'Unknown action'},400,headers);
}
