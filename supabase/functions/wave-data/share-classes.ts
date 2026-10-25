import {calculateReviewedShareTotal} from './calculations.ts';
/** Reviewed filing disclosures omitted by SEC CompanyFacts. Not a live registry.
 * Never infer economic equivalence from the labels A/B or add an aggregate to its parts.
 * A new filing requires a new verified record; unknown classes fail closed.
 */
export type ShareClassRecord = {
  cik:number; accession:string; form:string; filed:string; as_of:string; source:string;
  verified_at:string; basis_source:string; complete:boolean;
  classes:{id:string; value:number; unit:string; common_equivalent_ratio:number; kind:string}[];
};
const annual='https://www.sec.gov/Archives/edgar/data/1326801/000162828026003942/meta-20251231.htm';
export const REVIEWED_SHARE_CLASSES:ShareClassRecord[]=[{
  cik:1326801,accession:'0001628280-26-050705',form:'10-Q',filed:'2026-07-30',as_of:'2026-07-24',
  source:'https://www.sec.gov/Archives/edgar/data/1326801/000162828026050705/meta-20260630.htm',
  verified_at:'2026-10-25T10:02:00Z',basis_source:annual,complete:true,
  classes:[{id:'Class A',value:2205128509,unit:'shares',common_equivalent_ratio:1,kind:'common'},
    {id:'Class B',value:342377716,unit:'shares',common_equivalent_ratio:1,kind:'common'}]
},{
  cik:1326801,accession:'0001628280-26-066773',form:'10-Q',filed:'2026-10-22',as_of:'2026-10-16',
  source:'https://www.sec.gov/Archives/edgar/data/1326801/000162828026066773/meta-20260930.htm',
  verified_at:'2026-10-25T10:14:00Z',basis_source:annual,complete:true,
  classes:[{id:'Class A',value:2214472367,unit:'shares',common_equivalent_ratio:1,kind:'common'},
    {id:'Class B',value:341768886,unit:'shares',common_equivalent_ratio:1,kind:'common'}]
}];
// Exact reviewed complete class set and identical dividend/liquidation rights,
// SEC 2025 10-K Note 4 (EPS); voting rights differ, economics do not.
const POLICIES:Record<number,{classes:string[];basis_source:string}>={1326801:{classes:['Class A','Class B'],basis_source:annual}};
export function aggregateShareClasses(record:ShareClassRecord,now=Date.now()){
  const policy=POLICIES[record.cik];
  if(!policy||!record.complete||record.basis_source!==policy.basis_source)throw Error('Unverified complete common-equivalent class basis');
  const iso=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  if(!iso(record.as_of)||!iso(record.filed)||record.as_of>record.filed||Date.parse(record.filed)>now||!Number.isFinite(Date.parse(record.verified_at))||Date.parse(record.verified_at)>now||Date.parse(record.verified_at)<Date.parse(record.filed)||!['10-Q','10-K','10-Q/A','10-K/A'].includes(record.form)||!/^\d{10}-\d{2}-\d{6}$/.test(record.accession))throw Error('Invalid dated share-class provenance');
  const prefix='https://www.sec.gov/Archives/edgar/data/'+record.cik+'/'+record.accession.replaceAll('-','')+'/';
  if(!record.source.startsWith(prefix)||!record.source.endsWith('.htm'))throw Error('Filing does not match issuer/accession');
  const ids=record.classes.map(c=>c.id);
  if(ids.length!==policy.classes.length||new Set(ids).size!==ids.length||policy.classes.some(id=>!ids.includes(id)))throw Error('Missing, duplicate or unreviewed share class');
  if(record.classes.some(c=>c.kind!=='common'||c.unit!=='shares'||c.common_equivalent_ratio!==1||!Number.isSafeInteger(c.value)||c.value<=0))throw Error('Unsupported share economics, units or count');
  const total=calculateReviewedShareTotal(record.classes.find(c=>c.id==='Class A')!.value,record.classes.find(c=>c.id==='Class B')!.value);
  if(total===null||!Number.isSafeInteger(total))throw Error('Unsafe share total');
  return {value:total,record};
}
