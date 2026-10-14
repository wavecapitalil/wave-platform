import {MACRO_RELEASES} from './macro-releases.ts';
// Public series only. No provider credentials, consensus substitution or scheduled work.
export const MACRO_SERIES = [
  {id:'cpi',name:'CPI',he:'CPI',group:'inflation',fred:'CPIAUCNS',transform:'yoy',unit:'% YoY',sa:'NSA',frequency:'monthly',agency:'BLS',detail:'Published Table 7 effects explain the annual All Items change in percentage points. Component inflation rates are not contributions.'},
  {id:'pce',name:'PCE',he:'PCE',group:'inflation',fred:'PCEPI',transform:'yoy',unit:'% YoY',sa:'SA',frequency:'monthly',agency:'BEA',detail:'Personal consumption expenditure price index. No verified release contribution table is connected.'},
  {id:'core_cpi',name:'Core CPI',he:'Core CPI',group:'inflation',fred:'CPILFENS',transform:'yoy',unit:'% YoY',sa:'NSA',frequency:'monthly',agency:'BLS',detail:'CPI excluding food and energy. All Items effects must not be presented as contributions to core inflation.'},
  {id:'industrial',name:'Industrial production',he:'ייצור תעשייתי',group:'growth',fred:'INDPRO',transform:'mom',unit:'% MoM',sa:'SA',frequency:'monthly',agency:'Federal Reserve',detail:'Industrial production volume, monthly change.'},
  {id:'gdp',name:'Real GDP',he:'תוצר ריאלי',group:'growth',fred:'A191RL1Q225SBEA',transform:'level',unit:'% QoQ annualized',sa:'SA',frequency:'quarterly',agency:'BEA',detail:'Real GDP growth at an annual rate. Expenditure contributions require published NIPA 1.1.2/1.5.2; industry detail arrives with the third estimate. No verified contribution vintage connected.'},
  {id:'retail',name:'Retail sales · nominal',he:'מכירות קמעונאיות · נומינלי',group:'growth',fred:'RSAFS',transform:'mom',unit:'% MoM nominal',sa:'SA',frequency:'monthly',agency:'Census Bureau',detail:'Retail and food services sales in current dollars; not inflation adjusted.'},
  {id:'ism_manufacturing',name:'ISM Manufacturing',he:'ISM תעשייה',group:'growth',fred:null,transform:'level',unit:'index',sa:'SA',frequency:'monthly',agency:'ISM',detail:'Archive and derivative chart entitlement has not been verified. No licensed data is displayed.'},
  {id:'ism_services',name:'ISM Services',he:'ISM שירותים',group:'growth',fred:null,transform:'level',unit:'index',sa:'SA',frequency:'monthly',agency:'ISM',detail:'Archive and derivative chart entitlement has not been verified. No licensed data is displayed.'},
  {id:'nfp',name:'NFP',he:'NFP',group:'labour',fred:'PAYEMS',transform:'difference',unit:'thousand jobs MoM',sa:'SA',frequency:'monthly',agency:'BLS CES',detail:'Net payroll change by mutually exclusive industry groups. Includes negative changes. Establishment survey (CES), not household unemployment (CPS).'},
  {id:'unemployment',name:'Unemployment rate',he:'שיעור אבטלה',group:'labour',fred:'UNRATE',transform:'level',unit:'%',sa:'SA',frequency:'monthly',agency:'BLS CPS',detail:'Household survey unemployment / civilian labor force. It is not an additive decomposition of payroll employment.'},
  {id:'claims',name:'Initial jobless claims',he:'תביעות אבטלה ראשוניות',group:'labour',fred:'ICSA',transform:'level',unit:'claims',sa:'SA',frequency:'weekly',agency:'US Department of Labor',detail:'Weekly initial claims, week ending date; not monthly payroll job losses.'},
  {id:'jolts',name:'JOLTS openings',he:'JOLTS משרות פנויות',group:'labour',fred:'JTSJOL',transform:'level',unit:'thousand openings',sa:'SA',frequency:'monthly',agency:'BLS',detail:'Job openings are a stock. JOLTS hires and layoffs are gross flows, distinct from CES net payroll changes; they are not forced to reconcile to NFP.'},
  {id:'wages',name:'Hourly wage growth',he:'צמיחת שכר שעתי',group:'labour',fred:'CES0500000003',transform:'yoy',unit:'% YoY',sa:'SA',frequency:'monthly',agency:'BLS CES',detail:'Average hourly earnings, all private employees. Changes can reflect both pay and workforce composition.'}
];
const finite=(n:any)=>typeof n==='number'&&Number.isFinite(n);
const iso=(s:any)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function validateRelease(r:any){
  const s=MACRO_SERIES.find(s=>s.id===r.series);
  if(!s||!iso(r.period)||!iso(r.vintage)||!finite(r.actual)||!r.id||!r.table||!/^https:\/\/www\.(bls|bea)\.gov\//.test(r.source)||!Number.isFinite(Date.parse(r.released_at))||!Number.isFinite(Date.parse(r.verified_at))||r.released_at.slice(0,10)!==r.vintage||r.period>=r.vintage||Date.parse(r.verified_at)<Date.parse(r.released_at))throw Error('Invalid release provenance');
  if(r.prior!==null&&!finite(r.prior)||r.revised_prior!==null&&!finite(r.revised_prior))throw Error('Invalid prior');
  if((r.prior!==null||r.revised_prior!==null)&&(!iso(r.prior_period)||r.prior_period>=r.period))throw Error('Prior period required');
  if(!Array.isArray(r.revisions)||r.revisions.some((x:any)=>!iso(x.period)||x.period>=r.period||!finite(x.before)||!finite(x.after)))throw Error('Invalid revisions');
  if(!Array.isArray(r.components)||r.components.some((x:any)=>!Array.isArray(x)||typeof x[0]!=='string'||!finite(x[1]))||new Set(r.components.map((x:any)=>x[0])).size!==r.components.length)throw Error('Invalid components');
  if(r.components.length){
    if(!['nfp','cpi','gdp'].includes(r.series))throw Error('Unsupported additive breakdown');
    if(r.series==='cpi'&&!/Table 7/.test(r.table))throw Error('CPI requires annual published effects');
    if(r.series==='gdp'&&!/1\.(1|5)\.2/.test(r.table))throw Error('GDP requires published contributions');
    const partitions:any={nfp:['Mining and logging','Construction','Manufacturing','Trade, transportation and utilities','Information','Financial activities','Professional and business services','Private education and health services','Leisure and hospitality','Other services','Government'],cpi:['Food','Energy','All items less food and energy']};
    if(partitions[r.series]&&(r.components.length!==partitions[r.series].length||r.components.some((x:any)=>!partitions[r.series].includes(x[0]))))throw Error('Overlapping or incomplete component partition');
    const residual=r.actual-r.components.reduce((a:number,x:any)=>a+x[1],0);
    if(Math.abs(residual)>(r.series==='nfp'?0.00001:0.055))throw Error('Contributions do not reconcile');
  }
  // A future consensus adapter must prove both access and a pre-release capture.
  if(r.consensus!=null&&(!finite(r.consensus.value)||r.consensus.access_verified!==true||!r.consensus.source||!Number.isFinite(Date.parse(r.consensus.captured_at))||Date.parse(r.consensus.captured_at)>=Date.parse(r.released_at)))throw Error('Unverified consensus');
  return {...r,unit:s.unit,sa:s.sa,frequency:s.frequency,consensus:r.consensus||null,
    residual:r.components.length?Number((r.actual-r.components.reduce((a:number,x:any)=>a+x[1],0)).toFixed(6)):null};
}
export function releaseSet(rows:any[]){
  const ids=new Set();const keys=new Set();
  const result=rows.map(r=>{const x=validateRelease(r),key=x.series+':'+x.period+':'+x.vintage;if(ids.has(x.id)||keys.has(key))throw Error('Duplicate snapshot');ids.add(x.id);keys.add(key);return x;}).sort((a,b)=>a.released_at.localeCompare(b.released_at));
  for(const r of result){
    const prior=result.filter(p=>p.series===r.series&&p.period===r.prior_period&&p.released_at<r.released_at).at(-1);
    if(prior&&r.prior!==null&&prior.actual!==r.prior)throw Error('Prior does not match recorded vintage');
  }
  return result;
}
export function catalogue(now=Date.now()){
  const releases=releaseSet(MACRO_RELEASES).filter(r=>Date.parse(r.released_at)<=now&&Date.parse(r.verified_at)<=now);
  return {country:'US',scope:'provisional',automation:'not_connected',generated_at:new Date(now).toISOString(),series:MACRO_SERIES.map(s=>({...s,releases:releases.filter(r=>r.series===s.id),status:s.fred?'available':'license_unverified'}))};
}
export function parseHistory(csv:string,s:any,now=Date.now()){
  const lines=csv.trim().split(/\r?\n/),header=lines.shift()?.replace(/^\uFEFF/,'').split(',');
  if(!header||!['observation_date','DATE'].includes(header[0])||header[1]!==s.fred)throw Error('Unexpected provider schema');
  const values=new Map<string,number>();
  for(const line of lines){const [period,raw]=line.split(',');if(!iso(period)||Date.parse(period)>now)throw Error('Invalid observation date');if(values.has(period))throw Error('Duplicate period');if(raw==='.'||raw==='')continue;if(!/^-?\d+(\.\d+)?$/.test(raw))throw Error('Invalid observation');values.set(period,Number(raw));}
  const points=[];
  for(const [period,value] of [...values].sort(([a],[b])=>a.localeCompare(b))){
    let actual=value;
    if(s.transform!=='level'){
      const d=new Date(period+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-(s.transform==='yoy'?12:1));
      const prior=values.get(d.toISOString().slice(0,10));
      if(prior===undefined||(s.transform!=='difference'&&prior===0))continue;
      actual=s.transform==='difference'?value-prior:(value/prior-1)*100;
    }
    if(!finite(actual))throw Error('Non-finite result');
    points.push({period,value:Number(actual.toFixed(4))});
  }
  return points.slice(-60);
}
const cache=new Map<string,any>();
export async function history(id:string,fetcher=fetch,now=Date.now()){
  const s=MACRO_SERIES.find(s=>s.id===id);if(!s)throw Error('Unknown indicator');
  if(!s.fred)return {id,status:'license_unverified',points:[]};
  const prior=cache.get(id);
  if(prior&&now-Date.parse(prior.fetched_at)<3600000)return {...prior,cached:true};
  try{
    const response=await fetcher('https://fred.stlouisfed.org/graph/fredgraph.csv?id='+s.fred,{signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('Provider unavailable');
    const points=parseHistory(await response.text(),s,now);if(!points.length)throw Error('No observations');
    const days=(now-Date.parse(points.at(-1)!.period))/86400000;
    const data={id,points,status:days>(s.frequency==='weekly'?21:s.frequency==='quarterly'?180:80)?'stale':'current_vintage',fetched_at:new Date(now).toISOString(),source:'https://fred.stlouisfed.org/series/'+s.fred,release_dates_available:false,history_basis:'latest_revised',unit:s.unit,sa:s.sa,frequency:s.frequency};
    cache.set(id,data);return data;
  }catch{
    return prior?{...prior,status:'stale',error:'Refresh failed; retained observation history'}:{id,status:'unavailable',points:[],error:'Official-series history unavailable through FRED'};
  }
}
