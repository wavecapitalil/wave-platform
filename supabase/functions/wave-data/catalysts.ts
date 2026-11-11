// Catalyst calendar for the public edge API. Same reaction rule as services/api/services/catalysts.py.
import {parsePriceChart} from './price-history.ts';

const DAY=86400000, DEADBAND=0.01, SESSIONS=3, GAP=7, LOOKBACK=3*366, FORWARD=180;
const UA={'user-agent':'WaveCapital research@wavecapital.com','accept':'application/json'};
const ITEMS:Record<string,[string,string]>={
 '2.02':['earnings','Quarterly results disclosure'],
 '5.02':['governance','Item 5.02 officer, director or compensation disclosure'],
 '1.01':['transactions','Material agreement disclosure'],
 '1.02':['transactions','Material agreement termination disclosure'],
 '2.01':['transactions','Acquisition or disposition disclosure'],
 '2.05':['restructuring','Restructuring disclosure'],
 '1.03':['regulatory','Bankruptcy or receivership disclosure'],
 '2.06':['regulatory','Material impairment disclosure'],
 '4.02':['regulatory','Financial statement non-reliance disclosure'],
};
export const CATALYST_METHODOLOGY='Catalyst Calendar uses only rows returned by the sources below. An empty source is omitted; no sample filings, headlines, FDA decisions, earnings dates, or price reactions are filled in.\n'
+'Price: Yahoo Finance daily closes, split- and dividend-adjusted when the chart provides adjusted closes. Currency is the provider currency.\n'
+'Reaction window: percent change from the close of the last trading session before the event session to the close three trading sessions after the event session. The event session is the first session on or after the anchor date. Above +1.0% is a rally (green). Below -1.0% is a drop (red). Inside ±1.0%, a future event, or an unfinished window stays gray. The figure is an observed price change, not evidence the catalyst caused the move.\n'
+'Anchor date: SEC filings and news with an exact timestamp at or after 16:00 America/New_York, and SEC filings with a date but no timestamp, use the next calendar day. Earlier exact timestamps use that calendar date. The cutoff does not model early closes. Earnings-calendar dates and FDA status dates are used as published. A Yahoo earnings range with two different dates is dropped.\n'
+'Upcoming dots are drawn at the latest close on their own date; that height is not a price forecast. Item 5.02 is not a named appointment or departure. Buyback rows matched a share-repurchase phrase. Schedule 13D rows are full-text hits and include no stake size. Headline wording is not used to color the dot.';

const skip=/\b(to report|will report|conference call|webcast details|participate[sd]? in|to present at)\b/i;
const rules:[string,RegExp][]=[
 ['earnings',/\b(results|earnings|quarterly revenue|annual revenue)\b/i],
 ['guidance',/\b(guidance|outlook|forecast)\b/i],
 ['leadership',/\b(appoints?|resigns?|steps? down|succession|to become|names? .{0,50}(ceo|chief)|new (ceo|chief executive))\b/i],
 ['transactions',/\b(acquir\w*|acquisition|merger|divest\w*|definitive agreement)\b/i],
 ['regulatory',/\b(antitrust|regulat\w*|court|lawsuit|settlement|recall|approval|bankrupt\w*)\b/i],
 ['capital_returns',/\b(dividend|repurchase|buyback|stock split)\b/i],
 ['products',/\b(introduc\w*|unveil\w*|launch\w*|new generation|next generation|new .{0,30}(chip|iphone|gpu|processor)|announces? .{0,45}(platform|chip|iphone|gpu|processor))\b/i],
 ['partnerships',/\b(partnership|strategic alliance|multi.year agreement|billion.{0,15}(invest|agreement))\b/i],
];
function category(title:string){if(!title||skip.test(title))return null;for(const [name,pattern] of rules)if(pattern.test(title)){if(name==='capital_returns'&&/\b(buyback|repurchase)\b/i.test(title))return 'buyback';if(name==='regulatory'&&/\bFDA\b/.test(title))return 'fda';return name;}return null;}
function iso(ms:number){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms));const g=(t:string)=>p.find(x=>x.type===t)?.value||'';return `${g('year')}-${g('month')}-${g('day')}`;}
function valid(s:string){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;}
function add(s:string,days:number){return new Date(Date.parse(s+'T12:00:00Z')+days*DAY).toISOString().slice(0,10);}
function gap(a:string,b:string){return Math.abs(Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/DAY;}
function clean(s:unknown,n=140){return String(s||'').replace(/[\u0000-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim().slice(0,n);}
function https(value:unknown){if(typeof value!=='string'||!value.startsWith('https://')||value.length>2000||/\s/.test(value))return null;const host=value.split('/')[2]?.split('@').pop()?.toLowerCase()||'';if(!host||host.startsWith('localhost')||host.endsWith('.local'))return null;return value;}
function ny(value:unknown):Date|null{
 if(typeof value==='number'&&Number.isFinite(value)){const ms=value>10_000_000_000?value:value*1000;const d=new Date(ms);return Number.isFinite(d.getTime())?d:null;}
 if(typeof value==='string'){const d=new Date(value);return Number.isFinite(d.getTime())?d:null;}
 return null;
}
function hour(d:Date){return Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).formatToParts(d).find(p=>p.type==='hour')?.value);}
function anchor(date:string,stamp:unknown,mode:'as_dated'|'next_session'|'timestamp'){if(mode==='as_dated')return date;if(mode==='next_session')return add(date,1);const d=ny(stamp);if(!d)return add(date,1);const day=iso(d.getTime());return hour(d)>=16?add(day,1):day;}
export function classifyReaction(anchorDate:string,sessions:{date:string,close:number}[],today:string,source=anchorDate){
 if(!valid(anchorDate)||!valid(source)||sessions.length<2)return null;
 if(source>today)return source>add(today,FORWARD)?null:{outcome:'upcoming',reaction_pct:null,session_date:null};
 if(source<add(today,-LOOKBACK))return null;
 const index=sessions.findIndex(row=>row.date>=anchorDate);
 if(index<0)return gap(sessions.at(-1)!.date,source)>GAP?null:{outcome:'pending',reaction_pct:null,session_date:null};
 if(gap(source,sessions[index].date)>GAP)return null;
 if(index<1||index+SESSIONS>=sessions.length)return {outcome:'pending',reaction_pct:null,session_date:sessions[index].date};
 const prior=sessions[index-1].close,after=sessions[index+SESSIONS].close;
 if(!(prior>0)||!(after>0))return {outcome:'pending',reaction_pct:null,session_date:sessions[index].date};
 const change=after/prior-1;
 const outcome=change>DEADBAND?'positive':change<-DEADBAND?'negative':'flat';
 return {outcome,reaction_pct:Math.round(change*10000)/100,session_date:sessions[index].date};
}
function filingIndex(cik:string,accession:string){return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g,'')}/${accession}-index.html`;}
function filingDoc(cik:string,accession:string,doc:string){return /^[A-Za-z0-9_.-]{1,180}$/.test(doc)?`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g,'')}/${doc}`:null;}
export function parseSecCatalysts(payload:any,cik:string,symbol:string){const r=payload?.filings?.recent||{};const out:any[]=[];if(!Array.isArray(r.form))return out;
 for(let i=0;i<r.form.length;i++){const form=r.form[i],filed=r.filingDate?.[i],acc=r.accessionNumber?.[i];if((form!=='8-K'&&form!=='8-K/A')||!valid(filed)||!/^\d{10}-\d{2}-\d{6}$/.test(acc||''))continue;
  const codes=String(r.items?.[i]||'').split(',').map((x:string)=>x.trim());const seen=new Set<string>();
  for(const code of codes){const mapped=ITEMS[code];if(!mapped||seen.has(mapped[0]))continue;seen.add(mapped[0]);
   const doc=typeof r.primaryDocument?.[i]==='string'?r.primaryDocument[i]:'';const url=filingDoc(cik,acc,doc)||filingIndex(cik,acc);const stamp=r.acceptanceDateTime?.[i];
   out.push({id:`sec:${acc}:${mapped[0]}`,date:filed,anchor:anchor(filed,stamp,ny(stamp)?'timestamp':'next_session'),type:mapped[0],line:mapped[1],url,source:'SEC EDGAR',origin:'sec',ticker:symbol});
  }}
 return out;
}
function filer(value:string){return clean(value,80).replace(/\s*\(CIK\s+\d+\)\s*$/i,'').replace(/\s*\([A-Z0-9.-]+\)\s*$/,'').trim();}
export function parseEfts(payload:any,kind:'buyback'|'activist',symbol:string,cik?:string|null){const hits=payload?.hits?.hits;if(!Array.isArray(hits))return [];const allowed=kind==='activist'?['SC 13D','SC 13D/A']:['8-K','8-K/A'];const out:any[]=[];
 for(const hit of hits.slice(0,40)){const s=hit?._source||{};const form=String(s.form||s.file_type||''),date=s.file_date,acc=s.adsh;if(!allowed.includes(form)||!valid(date)||!/^\d{10}-\d{2}-\d{6}$/.test(acc||''))continue;const who=String((s.ciks||[])[0]||cik||'');if(!/^\d+$/.test(who))continue;const name=Array.isArray(s.display_names)&&s.display_names[0]?filer(String(s.display_names[0])):'';
  out.push({id:`efts:${kind}:${acc}`,date,anchor:anchor(date,null,'next_session'),type:kind==='activist'?'activist':'buyback',line:kind==='activist'?(name?`Schedule 13D — ${name}`:'Schedule 13D filing'):'Filing references a share repurchase program',url:filingIndex(who,acc),source:'SEC EDGAR full text',origin:'sec',ticker:symbol});}
 return out;
}
export function parseCatalystNews(items:any,symbol:string,today:string){if(!Array.isArray(items))return [];const out:any[]=[],seen=new Set<string>();
 for(const item of items){const tagged=item?.relatedTickers||item?.content?.relatedTickers;if(!Array.isArray(tagged)||!tagged.some((ticker:any)=>String(ticker).toUpperCase()===symbol))continue;const content=item?.content&&typeof item.content==='object'?item.content:item||{};const title=clean(content.title||item?.title,180);const type=category(title);if(!type)continue;
  const url=https(content.canonicalUrl?.url)||https(content.clickThroughUrl?.url)||https(content.link)||https(item?.link);const when=ny(content.pubDate||content.displayTime||item?.providerPublishTime);
  if(!url||!when||seen.has(url))continue;const date=iso(when.getTime());if(!valid(date)||date>today)continue;seen.add(url);
  const provider=content.provider&&typeof content.provider==='object'?content.provider.displayName:'';
  out.push({id:`news:${url}`,date,anchor:anchor(date,content.pubDate||content.displayTime||item?.providerPublishTime,'timestamp'),type,line:title,url,source:clean(content.publisher||provider||'Yahoo Finance',80)||'Yahoo Finance',origin:'news',ticker:symbol});}
 return out;
}
export function parseEarningsDate(payload:any,symbol:string,today:string){const raw=payload?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate;if(!Array.isArray(raw))return [];
 const dates=[...new Set(raw.map((row:any)=>ny(row?.raw??row)).filter(Boolean).map((d:Date)=>iso(d.getTime())).filter(date=>valid(date)&&date<=add(today,FORWARD)))];
 if(dates.length!==1)return [];const date=dates[0];
 return [{id:`earnings:${symbol}:${date}`,date,anchor:date,type:'earnings',line:'Earnings date',url:null,source:'Yahoo Finance',origin:'earnings',ticker:symbol}];
}
const FDA:Record<string,string>={AP:'Approval',TA:'Tentative approval'};
export function parseFda(payload:any,symbol:string){const results=payload?.results;if(!Array.isArray(results))return [];const out:any[]=[];
 for(const record of results){const brand=clean(record?.openfda?.brand_name?.[0],60),application=clean(record?.application_number,40);
  for(const sub of record?.submissions||[]){const raw=String(sub?.submission_status_date||'');const date=/^\d{8}$/.test(raw)?`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6)}`:raw;if(!valid(date))continue;
   const code=String(sub?.submission_status||'');const label=FDA[code]||clean(sub?.submission_status_description||sub?.submission_class_code_description,60);const name=brand||application;if(!label||!name)continue;
   const appl=application.match(/(\d{5,7})/);
   out.push({id:`fda:${application||name}:${date}:${code||label}`,date,anchor:date,type:'fda',line:clean(`FDA ${label} · ${name}`),url:appl?`https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=${appl[1]}`:null,source:'openFDA',origin:'fda',ticker:symbol});}}
 return out;
}
function score(row:any){return ({sec:4,fda:3,earnings:2,news:1} as any)[row.origin]||0;}
function dedup(rows:any[]){const kept:any[]=[];for(const row of [...rows].sort((a,b)=>a.date.localeCompare(b.date)||score(b)-score(a))){let replaced=false;for(let i=0;i<kept.length;i++){const prev=kept[i];const near=(row.type==='earnings'&&prev.type==='earnings'||row.type==='buyback'&&prev.type==='buyback')&&gap(prev.date,row.date)<=5;if((prev.type===row.type&&prev.date===row.date)||(prev.url&&prev.url===row.url&&prev.type===row.type)||near){if(score(row)>score(prev))kept[i]=row;replaced=true;break;}}if(!replaced)kept.push(row);}return kept;}
export function assembleCatalysts(symbol:string,today:string,sessions:{date:string,close:number}[],currency:string|null,events:any[],sources:any[]){
 const cleaned=sessions.filter(row=>valid(row.date)&&row.close>0).sort((a,b)=>a.date.localeCompare(b.date)).filter((row,i,all)=>i===0||row.date!==all[i-1].date);
 if(cleaned.length<2)throw new Error('price history unavailable');
 let classified=dedup(events.flatMap(event=>{if(!event?.line||!valid(event.date))return [];const reaction=classifyReaction(event.anchor||event.date,cleaned,today,event.date);if(!reaction)return [];return [{...event,outcome:reaction.outcome,reaction_pct:reaction.reaction_pct,session_date:reaction.session_date,url:https(event.url)}];}));
 classified=classified.sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
 const points=cleaned.map(row=>({date:row.date,close:row.close}));const index=new Map(points.map((row,i)=>[row.date,i]));const last=cleaned.at(-1)!.close;const extras:string[]=[];
 for(const event of classified){if(event.session_date&&index.has(event.session_date)&&event.outcome!=='upcoming'){event.plot_index=index.get(event.session_date);event.plot_close=points[event.plot_index].close;}else extras.push(event.date);delete event.origin;delete event.anchor;}
 for(const date of [...new Set(extras)].sort())if(!index.has(date)){points.push({date,close:null as any});index.set(date,points.length-1);} 
 for(const event of classified)if(event.plot_index==null){event.plot_index=index.get(event.date);event.plot_close=last;}
 return {symbol,currency:/^[A-Z]{3}$/.test(currency||'')?currency:null,points,catalysts:classified,sources,fetched_at:new Date().toISOString().replace(/\.\d+Z$/,'Z'),methodology:CATALYST_METHODOLOGY};
}
function plain(text:string){return text.replace(/<[^>]+>/g,' ').replace(/&#8217;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ');}
export function confirms13dSubject(text:string,name:string,ticker:string){if(!text||!name)return false;const body=plain(text);const labeled=new RegExp('(?:name of issuer|subject company)\\W{0,24}'+name.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![A-Za-z0-9])','i');if(labeled.test(body))return true;if(ticker&&new RegExp('(?:name of issuer|subject company)\\W{0,24}\\('+ticker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\)','i').test(body))return true;return false;}
export function buybackLine(text:string){if(!text)return null;const body=plain(text);const match=body.match(/.{0,90}(?:repurchase|buyback).{0,90}/i);if(!match||match.index==null)return null;const window=body.slice(Math.max(0,match.index-90),match.index+match[0].length+90);if(!/authoriz|approv|program/i.test(window))return null;const amount=window.match(/\$\s?[\d,.]+\s?(?:billion|million)/i);return amount?clean(`Share repurchase authorization of ${amount[0].replace(/\s+/g,' ')}`):'Filing describes a share repurchase authorization';}
async function excerpt(cik:string,accession:string){const url=`https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g,'')}/${accession}.txt`;const r=await fetch(url,{headers:UA,signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error('HTTP '+r.status);const reader=r.body?.getReader();if(!reader)return (await r.text()).slice(0,400000);const chunks:Uint8Array[]=[];let size=0;while(size<400000){const {done,value}=await reader.read();if(done||!value)break;chunks.push(value);size+=value.length;}reader.cancel().catch(()=>{});return new TextDecoder().decode((await new Blob(chunks).arrayBuffer())).slice(0,400000);}
async function readJson(url:string){const r=await fetch(url,{headers:UA,signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}
async function sourceJob(name:string,run:()=>Promise<any[]>){try{const rows=await run();return [rows,{name,status:rows.length?'available':'empty',rows:rows.length}] as const;}catch{return [[],{name,status:'unavailable',rows:0}] as const;}}
export async function collectCatalysts(symbol:string,now=Date.now()){
 const today=iso(now);
 const start=Math.floor((now-(LOOKBACK+15)*DAY)/1000);
 const chart=await readJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${start}&period2=${Math.floor(now/1000)}&interval=1d&includeAdjustedClose=true&events=div%2Csplits&includePrePost=false`);
 const parsed=parsePriceChart(chart,symbol,now);
 const sessions=parsed.points.map(p=>({date:p.date,close:p.close}));
 let issuer:{cik:string,name:string}|null=null;
 try{const map=await readJson('https://www.sec.gov/files/company_tickers.json');for(const value of Object.values(map) as any[])if(String(value?.ticker||'').toUpperCase()===symbol)issuer={cik:String(value.cik_str).padStart(10,'0'),name:clean(value.title||symbol,120)};}catch{issuer=null;}
 const from=add(today,-LOOKBACK);
 const [sec,buyback,activist,fda,earnings,news]=await Promise.all([
  sourceJob('SEC EDGAR submissions',async()=>{if(!issuer)throw new Error('no cik');return parseSecCatalysts(await readJson(`https://data.sec.gov/submissions/CIK${issuer.cik}.json`),issuer.cik,symbol);}),
  sourceJob('SEC EDGAR full text · repurchase',async()=>{if(!issuer)throw new Error('no cik');const q=new URLSearchParams({q:'repurchase',forms:'8-K',dateRange:'custom',startdt:from,enddt:today,ciks:issuer.cik});const rows=parseEfts(await readJson('https://efts.sec.gov/LATEST/search-index?'+q),'buyback',symbol,issuer.cik);const confirmed=[];for(const row of rows.slice(0,8)){try{const line=buybackLine(await excerpt(issuer.cik,row.id.split(':').at(-1)||''));if(line)confirmed.push({...row,line});}catch{/* Unreadable filings are omitted. */}}return confirmed;}),
  sourceJob('SEC EDGAR full text · Schedule 13D',async()=>{if(!issuer||issuer.name.length<4)throw new Error('no name');const rows:any[]=[];for(const form of ['SC 13D','SC 13D/A']){const q=new URLSearchParams({q:`"${issuer.name.replaceAll('"','')}"`,forms:form,dateRange:'custom',startdt:from,enddt:today});rows.push(...parseEfts(await readJson('https://efts.sec.gov/LATEST/search-index?'+q),'activist',symbol));}const confirmed=[];for(const row of rows.slice(0,8)){const parts=String(row.url||'').split('/');const cik=parts[parts.indexOf('data')+1];try{if(confirms13dSubject(await excerpt(cik,row.id.split(':').at(-1)||''),issuer.name,symbol))confirmed.push(row);}catch{/* Unreadable filings are omitted. */}}return confirmed;}),
  sourceJob('openFDA drug applications',async()=>{if(!issuer?.name)throw new Error('no name');const q=new URLSearchParams({search:`sponsor_name:"${issuer.name.replaceAll('"','')}"`,limit:'20'});const r=await fetch('https://api.fda.gov/drug/drugsfda.json?'+q,{headers:UA,signal:AbortSignal.timeout(12000)});if(r.status===404)return [];if(!r.ok)throw new Error('HTTP '+r.status);return parseFda(await r.json(),symbol);}),
  sourceJob('Yahoo Finance earnings date',async()=>parseEarningsDate(await readJson(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents`),symbol,today)),
  sourceJob('Yahoo Finance headlines',async()=>{const payload=await readJson(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=50`);return parseCatalystNews(payload.news,symbol,today);}),
 ]);
 const events=[...sec[0],...buyback[0],...activist[0],...fda[0],...earnings[0],...news[0]];
 const sources=[sec[1],buyback[1],activist[1],fda[1],earnings[1],news[1]];
 return assembleCatalysts(symbol,today,sessions,parsed.currency,events,sources);
}
