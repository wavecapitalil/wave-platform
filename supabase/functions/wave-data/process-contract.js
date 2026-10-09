/* Versioned, dependency-free manifest reader. No network calls or persistence. */
(function(root){
'use strict';
const SCHEMA='wave.process-run/1';
const schemas={
 run:['id','process_id','process_version','attempt','commit','kind','status','started_at','completed_at','expected_cutoff','observed_cutoff','telemetry_status'],
 events:['id','run_id','step_id','stage','status','at','cache','error_code','observation_id','transformation_id','output_id'],
 observations:['id','source_id','fetch_started_at','fetch_completed_at','source_timestamp','source_date_kind','digest','coverage','manifest_date'],
 transformations:['id','rule_version','inputs','status','output_digest','units','period','null_reason'],
 outputs:['id','dataset_key','run_id','transformation_ids','observation_ids','digest','artifact_version','publication_status'],
 decisions:['id','candidate_id','disposition','reason','observation_ids']
};
const statuses=['running','ok','partial','error','failed','skipped'];
function object(value,keys,name){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error(name+': object required');
 for(const k of Object.keys(value))if(!keys.includes(k))throw Error(name+': unsupported field '+k);
}
function str(v,name,required=true){if(v==null&&!required)return;if(typeof v!=='string'||!v.length||v.length>5000)throw Error(name+': bounded text required');}
function date(v,name,required=false){if(v==null&&!required)return;if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v)))throw Error(name+': timestamp with timezone required');}
function hash(v,name){if(typeof v!=='string'||!(/^[a-f0-9]{64}$/).test(v))throw Error(name+': SHA256 required');}
function ids(v,name){if(!Array.isArray(v)||v.length>1000||v.some(x=>typeof x!=='string'||!x.length||x.length>200))throw Error(name+': IDs required');if(new Set(v).size!==v.length)throw Error(name+': duplicate IDs');}
function inspect(manifest){
 if(JSON.stringify(manifest).length>2000000)throw Error('Manifest exceeds 2 MB');
 object(manifest,['schema_version','run','events','observations','transformations','outputs','decisions'],'manifest');
 if(manifest.schema_version!==SCHEMA)throw Error('Unsupported manifest version');
 object(manifest.run,schemas.run,'run');const run=manifest.run;
 for(const key of ['id','process_id','process_version'])str(run[key],key);
 if(!Number.isSafeInteger(run.attempt)||run.attempt<1)throw Error('Positive attempt required');
 if(!['observed','synthetic'].includes(run.kind)||!statuses.includes(run.status))throw Error('Unknown run kind/status');
 if(run.commit!==null&&(typeof run.commit!=='string'||!(/^[a-f0-9]{40}$/).test(run.commit)))throw Error('Invalid commit');
 date(run.started_at,'started_at',true);date(run.completed_at,'completed_at');date(run.expected_cutoff,'expected_cutoff');date(run.observed_cutoff,'observed_cutoff');
 const findings=[];const add=(code,subject,severity='review')=>findings.push({code,subject,severity});
 if(run.telemetry_status!=null&&!['complete','incomplete'].includes(run.telemetry_status))throw Error('Invalid telemetry status');
 if(run.telemetry_status!=='complete')add('telemetry_incomplete_or_not_recorded',run.id,run.telemetry_status==='incomplete'?'error':'review');
 const maps={};
 for(const collection of ['events','observations','transformations','outputs','decisions']){
  if(!Array.isArray(manifest[collection])||manifest[collection].length>3000)throw Error(collection+': bounded array required');
  maps[collection]=new Map();
  for(const row of manifest[collection]){
   object(row,schemas[collection],collection);str(row.id,collection+'.id');
   if(maps[collection].has(row.id))throw Error('Duplicate '+collection+' ID');maps[collection].set(row.id,row);
   for(const [key,value] of Object.entries(row)){
    if(Array.isArray(value)){if(!['inputs','observation_ids','transformation_ids'].includes(key))throw Error(key+': scalar required');}
    else if(value!==null)str(value,key);
   }
  }
 }
 if(run.completed_at&&Date.parse(run.completed_at)<Date.parse(run.started_at))add('invalid_run_timing',run.id,'error');
 if(!run.expected_cutoff||!run.observed_cutoff)add('cutoff_not_recorded',run.id);
 else if(Date.parse(run.observed_cutoff)<Date.parse(run.expected_cutoff))add('cutoff_gap',run.id,'error');
 const stages=new Set();
 for(const event of manifest.events){const stageKey=JSON.stringify([event.run_id,event.step_id,event.stage]);if(stages.has(stageKey))throw Error('Duplicate run/step/stage');stages.add(stageKey);if(event.run_id!==run.id)add('event_run_mismatch',event.id,'error');str(event.step_id,'step_id');str(event.stage,'stage');date(event.at,'event.at',true);if(!statuses.includes(event.status))throw Error('Unknown event status');for(const [field,collection]of [['observation_id','observations'],['transformation_id','transformations'],['output_id','outputs']])if(event[field]&&!maps[collection].has(event[field]))add('broken_event_link',event.id,'error');}
 for(const obs of manifest.observations){
  for(const field of ['source_id','source_date_kind','coverage'])str(obs[field],field);
  date(obs.fetch_started_at,'fetch_started_at',true);date(obs.fetch_completed_at,'fetch_completed_at',true);date(obs.source_timestamp,'source_timestamp');hash(obs.digest,'observation.digest');
  if(Date.parse(obs.fetch_completed_at)<Date.parse(obs.fetch_started_at))add('invalid_fetch_timing',obs.id,'error');
  if(obs.coverage==='collector_boundary')add('upstream_fetch_and_cache_not_instrumented',obs.id);
  if(obs.source_date_kind!=='original_document')add('document_date_not_attested',obs.id);
  if(!obs.source_timestamp)add('source_date_missing',obs.id);
  else {
   if(run.expected_cutoff&&Date.parse(obs.source_timestamp)>Date.parse(run.expected_cutoff))add('source_after_cutoff',obs.id,'error');
   if(Date.parse(run.started_at)-Date.parse(obs.source_timestamp)>48*3600000)add('dated_source_review',obs.id);
  }
  if(obs.manifest_date!=null){if(!/^\d{4}-\d\d-\d\d$/.test(obs.manifest_date))throw Error('Invalid manifest_date');if(obs.manifest_date!==run.started_at.slice(0,10))add('inherited_manifest_review',obs.id,'error');}
 }
 for(const calc of manifest.transformations){
  str(calc.rule_version,'rule_version');ids(calc.inputs,'inputs');hash(calc.output_digest,'output_digest');
  if(!statuses.includes(calc.status))throw Error('Unknown calculation status');
  if(!calc.inputs.length)add('missing_calculation_inputs',calc.id,'error');
  for(const id of calc.inputs)if(!maps.observations.has(id))add('broken_calculation_input',calc.id,'error');
  if(calc.units==null||calc.period==null)add('units_or_period_not_recorded',calc.id);
 }
 for(const out of manifest.outputs){
  str(out.dataset_key,'dataset_key');str(out.run_id,'run_id');str(out.artifact_version,'artifact_version');str(out.publication_status,'publication_status');ids(out.observation_ids,'observation_ids');ids(out.transformation_ids,'transformation_ids');hash(out.digest,'output.digest');
  if(out.run_id!==run.id)add('output_run_mismatch',out.id,'error');
  if(!out.observation_ids.length||!out.transformation_ids.length)add('output_evidence_missing',out.id,'error');
  for(const id of out.observation_ids)if(!maps.observations.has(id))add('broken_output_observation',out.id,'error');
  for(const id of out.transformation_ids){const calc=maps.transformations.get(id);if(!calc)add('broken_output_calculation',out.id,'error');else {if(calc.output_digest!==out.digest)add('output_digest_mismatch',out.id,'error');for(const input of calc.inputs)if(!out.observation_ids.includes(input))add('output_input_mismatch',out.id,'error');}}
 }
 for(const decision of manifest.decisions){str(decision.candidate_id,'candidate_id');str(decision.disposition,'disposition');ids(decision.observation_ids,'decision.observation_ids');if(!decision.reason||decision.reason==='not_recorded')add('decision_reason_not_recorded',decision.id);for(const id of decision.observation_ids)if(!maps.observations.has(id))add('broken_decision_input',decision.id,'error');}
 if(!manifest.decisions.length)add('selection_decisions_not_recorded',run.id);
 if(run.kind==='synthetic')add('synthetic_demo_not_live_history',run.id);
 return {schema_valid:true,evidence_status:findings.some(f=>f.severity==='error')?'mismatch':'unverified',findings};
}
const api={SCHEMA,inspect};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.WaveProcessContract=api;
})(typeof globalThis!=='undefined'?globalThis:this);
