// Explicit read-only verification, never a scheduled ingestion or release archive.
// Usage: node scripts/macro_live_check.mjs /tmp/wave-macro-live
import {catalogue,history,componentHistory} from '../supabase/functions/wave-data/macro.ts';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const out=resolve(process.argv[2]||'/tmp/wave-macro-live');mkdirSync(out,{recursive:true});
const raw=[];
async function fetcher(url,options){
 const response=await fetch(url,options),body=await response.text();
 const ids=new URL(url).searchParams.get('id'),file=ids.replaceAll(',','_')+'.csv';
 if(response.ok)writeFileSync(join(out,file),body);
 raw.push({source:url,status:response.status,retrieved_at:new Date().toISOString(),sha256:createHash('sha256').update(body).digest('hex'),file:response.ok?file:null});
 return new Response(body,{status:response.status,headers:response.headers});
}
const result={checked_at:new Date().toISOString(),catalogue:catalogue(),histories:{},components:{}};
const queue=result.catalogue.series.filter(s=>s.fred);
async function worker(){while(queue.length){const s=queue.shift();result.histories[s.id]=await history(s.id,fetcher);}}
await Promise.all([worker(),worker(),worker()]);
for(const id of ['gdp','pce'])result.components[id]=await componentHistory(id,fetcher);
writeFileSync(join(out,'responses.json'),JSON.stringify(result,null,2));
const summary={checked_at:result.checked_at,scope:'Local adapter against public official-series FRED CSV; not deployed edge validation',headlines:result.catalogue.series.map(s=>({id:s.id,agency:s.agency,fred:s.fred,transform:s.transform,unit:s.unit,sa:s.sa,frequency:s.frequency,status:result.histories[s.id]?.status||'license_unverified',latest:result.histories[s.id]?.points.at(-1)||null})),components:Object.values(result.components).map(c=>({id:c.id,status:c.status,table:c.table,history_basis:c.history_basis,periods:c.rows.length,latest:c.rows.at(-1),incomplete_periods:c.rows.filter(r=>!r.complete).length,unreconciled_periods:c.rows.filter(r=>r.reconciled===false).length})),raw};
writeFileSync(join(out,'verification.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
if(Object.values(result.histories).some(h=>h.status==='unavailable')||Object.values(result.components).some(c=>c.status==='unavailable'))process.exitCode=1;
