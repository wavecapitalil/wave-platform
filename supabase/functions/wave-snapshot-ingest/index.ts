import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EXPECTED_REPO = "wavecapitalil/wave-platform";
const EXPECTED_AUD = "wave-snapshot-ingest";
const ISSUER = "https://token.actions.githubusercontent.com";
const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "content-type": "application/json"
};

function json(body: unknown, status=200){
  return new Response(JSON.stringify(body), {status, headers:cors});
}

async function verifyGithub(token:string){
  const {payload}=await jwtVerify(token,JWKS,{issuer:ISSUER,audience:EXPECTED_AUD});
  if(payload.repository!==EXPECTED_REPO) throw new Error("repository_not_allowed");
  const ref=String(payload.ref||"");
  if(ref!=="refs/heads/main" && ref!=="refs/heads/feature/data-engine-v1") throw new Error("ref_not_allowed");
  const event=String(payload.event_name||"");
  if(!["schedule","workflow_dispatch","push"].includes(event)) throw new Error("event_not_allowed");
  return payload;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("",{headers:cors});
  if(req.method!=="POST") return json({error:"method_not_allowed"},405);
  const auth=req.headers.get("authorization")||"";
  const token=auth.replace(/^Bearer\s+/i,"").trim();
  if(!token) return json({error:"github_oidc_required"},401);

  let claims:any;
  try{claims=await verifyGithub(token);}
  catch(e){return json({error:"invalid_github_identity",message:String(e?.message||e)},403);}

  let body:any;
  try{body=await req.json();}catch{return json({error:"invalid_json"},400);}
  const snapshots=Array.isArray(body?.snapshots)?body.snapshots:[];
  if(snapshots.length>50) return json({error:"too_many_snapshots"},400);
  if(!snapshots.length) return json({ok:true,upserted:0,history:0});

  const allowed=new Set(["dataset_key","dataset_group","data","source","source_timestamp","fetched_at","calculated_at","expires_at","logic_version","freshness","stale","fallback","status","error"]);
  const cleaned=snapshots.map((x:any)=>{
    const out:any={};
    for(const k of allowed) if(k in x) out[k]=x[k];
    if(!out.dataset_key||!out.dataset_group||!out.logic_version) throw new Error("invalid_snapshot");
    out.updated_at=new Date().toISOString();
    return out;
  });

  const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false}});
  const up=await db.from("data_snapshots").upsert(cleaned,{onConflict:"dataset_key"});
  if(up.error) return json({error:"snapshot_upsert_failed",message:up.error.message},500);

  const history=cleaned.filter((x:any)=>x.status==="ok").map((x:any)=>({
    dataset_key:x.dataset_key,data:x.data,source:x.source,source_timestamp:x.source_timestamp,
    fetched_at:x.fetched_at,calculated_at:x.calculated_at,logic_version:x.logic_version,status:x.status
  }));
  let hcount=0;
  if(history.length){
    const hi=await db.from("data_snapshot_history").insert(history);
    if(hi.error) return json({error:"history_insert_failed",message:hi.error.message},500);
    hcount=history.length;
  }

  return json({
    ok:true,
    repository:claims.repository,
    ref:claims.ref,
    sha:claims.sha,
    upserted:cleaned.length,
    history:hcount
  });
});