// Preparation only: no HTTP endpoint, database writes, credential or grant changes.
// Caller must use a verified producer identity, never values copied from the body.
import './process-contract.js';
export function prepareProcessIngestion(manifest:any, identity:{repository:string; runId:string; attempt:number; sha:string}) {
 const result=(globalThis as any).WaveProcessContract.inspect(manifest);
 if(identity.repository!=='wavecapitalil/wave-platform'||!/^\d+$/.test(identity.runId)||!Number.isInteger(identity.attempt)||identity.attempt<1||!/^[a-f0-9]{40}$/.test(identity.sha))throw Error('Unverified producer identity');
 if(manifest.run.kind!=='observed'||manifest.run.process_id!=='data-engine'||manifest.run.id!==`github-${identity.runId}-${identity.attempt}`||manifest.run.attempt!==identity.attempt||manifest.run.commit!==identity.sha)throw Error('Producer/run identity mismatch');
 // Evidence discrepancies are stored as findings, never silently converted to PASS.
 // Structural broken links are rejected; provenance gaps remain reviewable evidence.
 if(result.findings.some((f:any)=>f.code.startsWith('broken_')||['event_run_mismatch','output_run_mismatch','output_digest_mismatch','output_input_mismatch'].includes(f.code)))throw Error('Invalid lineage');
 return {run:manifest.run,events:manifest.events,observations:manifest.observations,transformations:manifest.transformations,outputs:manifest.outputs,decisions:manifest.decisions,findings:result.findings,ingestion_status:'prepared_not_written'};
}
