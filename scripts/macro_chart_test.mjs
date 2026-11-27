import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../apps/terminal/public/terminal-macro-dashboard.js',import.meta.url),'utf8');
const timeSource=fs.readFileSync(new URL('../apps/terminal/public/terminal-time.js',import.meta.url),'utf8');
function ui(lang='en',width=375,zone){
 const records=[];const noop=()=>{};const el={id:'',addEventListener:noop,dataset:{}};
 const context={window:{innerWidth:width,addEventListener:noop,dispatchEvent:noop,WaveSources:{record:(...args)=>records.push(args)}},WaveSources:{record:(...args)=>records.push(args)},document:{documentElement:{lang},getElementById:()=>el,addEventListener:noop,readyState:'complete'},localStorage:{getItem:k=>k==='wc-tz'||k==='wc_tz'||k==='wc-timezone'||k==='wc_timezone'?zone||null:lang,setItem:noop,removeItem:noop},Date,Intl,Number,Math,Array,String,Set};
 vm.runInNewContext(timeSource+'\n'+source.replace('  var previousLanguageChange=', '  window.testAPI={chart,chartScale,readable,comparisonPoints,comparison,nextRelease,verifiedConsensus,registerNotes,releaseTime,consensusMarkup,differenceMarkup,releaseMeta,userZone,periodTable,trailingAverage,averageTone,direction,averageBadge,HIGHER_IS_BETTER}; var previousLanguageChange='),context);
 context.window.testAPI.records=records;return context.window.testAPI;
}
const now=Date.now(),past=new Date(now-86400000).toISOString(),future=new Date(now+86400000).toISOString();
const period='2026-08-01',base={period,unit:'% YoY',sa:'SA',source:'https://www.bea.gov/test',verified_at:past};
const consensus={value:3.2,unit:'% YoY',sa:'SA',period,access_verified:true,source:'https://example.org/verified-test-only',captured_at:new Date(now-172800000).toISOString()};
test('past actual columns and distinct consensus dots; future consensus has no fabricated column',()=>{
 const api=ui(),s={unit:'% YoY',sa:'SA',releases:[{...base,actual:3.4,released_at:past,consensus}],calendar:[{...base,id:'next',scheduled_at:future,consensus}]};
 const points=api.comparisonPoints(s);assert.equal(points[0].value,3.4);assert.equal(points[1].value,null);
 const html=api.comparison(s,true);assert.equal((html.match(/<rect /g)||[]).length,1);assert.equal((html.match(/<circle /g)||[]).length,2);
 assert.ok(html.includes('Difference: 0.2'));assert.ok(!html.includes('2026-08-01')); // Reference-period provenance lives in Sources.
 assert.ok(!html.includes('Verified source'));assert.ok(html.includes('Release date')); // Axis label remains; source captions do not.
 for(const attr of html.matchAll(/\s(?:x|y|width|height|cx|cy)="([^"]+)"/g))assert.ok(Number.isFinite(Number(attr[1])),attr[0]);
});
test('missing consensus is never zero; revised history has no consensus dots',()=>{
 const api=ui(),s={unit:'% YoY',sa:'SA',releases:[{...base,actual:0,released_at:past}],calendar:[]};
 const html=api.comparison(s,true);assert.equal((html.match(/<circle /g)||[]).length,0);assert.equal((html.match(/<rect /g)||[]).length,1);assert.ok(!html.includes('Missing verified consensus'));
 const card=api.comparison(s,false);assert.ok(!card.includes('Missing verified consensus'));assert.ok(!card.includes('macro-consensus-key'));assert.equal((card.match(/<circle /g)||[]).length,0);
 assert.ok(!api.chart([{period,value:3.419}],true,'% YoY').includes('<circle'));
 assert.equal(api.nextRelease(s),'');
});
test('invalid or future-captured consensus fails closed in frontend; RTL and narrow chart remain finite',()=>{
 const api=ui('he',320),r={...base,released_at:past,consensus};
 for(const patch of [{unit:'% MoM'},{sa:'NSA'},{period:'2026-07-01'},{value:null},{captured_at:future}])assert.equal(api.verifiedConsensus({...r,consensus:{...consensus,...patch}},{unit:'% YoY',sa:'SA'}),null);
 const html=api.chart([{period:'2026-07-01',value:-2},{period:'2026-08-01',value:0}],true,'%');assert.ok(html.includes('dir="ltr"'));assert.ok(!html.includes('NaN'));assert.ok(html.includes('negative'));
});

test('round ticks include exact zero for mixed, one-sided, constant and tiny series',()=>{
 const api=ui();
 for(const values of [[-1.37,1.341],[-5,-2],[2,8],[0],[4],[1e-7,-2e-7],[120000,450000]]){
  const scale=api.chartScale(values);
  assert.ok(scale.ticks.includes(0));assert.ok(scale.min<=Math.min(...values));assert.ok(scale.max>=Math.max(...values));
  assert.ok(scale.max>scale.min);assert.ok(scale.ticks.length<=7);
  const html=api.chart(values.map((value,i)=>({period:`2026-0${i+1}-01`,value})),true,'% MoM');
  const tick=html.match(/data-tick="0"[^>]*y1="([^"]+)"/)[1];
  assert.equal(html.match(/class="macro-zero"[^>]*y1="([^"]+)"/)[1],tick);
 }
});
test('readouts preserve observation precision and missing values; empty consensus legend is hidden',()=>{
 const api=ui('he',320);
 const html=api.chart([{period:'2026-07-01',value:-0.015123456789},{period:'2026-08-01',value:null}],true,'% MoM');
 assert.ok(html.includes('−0.015 % MoM'));assert.ok(html.includes('2026/08/01 · — % MoM'));
 assert.ok(html.includes('tabindex="0"'));assert.ok(html.includes('aria-live="polite"'));
 const comparison=api.comparison({unit:'%',sa:'SA',releases:[{...base,actual:0,released_at:past}],calendar:[]},true);
 assert.ok(!comparison.includes('macro-consensus-key'));assert.ok(!comparison.includes('צפי מאומת חסר'));
});

test('zero and tiny signed bars share the exact baseline without minimum-height distortion',()=>{
 const html=ui().chart([{period:'2026-01-01',value:-.000001},{period:'2026-02-01',value:0},{period:'2026-03-01',value:.000001},{period:'2026-04-01',value:100}],true,'Index');
 const zero=Number(html.match(/class="macro-zero"[^>]*y1="([^"]+)"/)[1]);
 for(const bar of html.matchAll(/<rect [^>]+>/g)){
  const attr=n=>Number(bar[0].match(new RegExp(' '+n+'="([^"]+)"'))[1]);
  const v=attr('data-value'),y=attr('y'),h=attr('height');
  if(v<0)assert.equal(y,zero);else assert.ok(Math.abs(y+h-zero)<1e-8);
  if(v===0)assert.equal(h,0);
 }
});

test('visible values trim tails, preserve tiny signs and do not rescale units',()=>{
 const f=ui().readable;
 assert.equal(f(3.4874647229840754,'% YoY'),'3.487');
 assert.equal(f(-.000000123456,'% MoM'),'−0.000000123');
 assert.equal(f(120000,'jobs'),'120,000');assert.equal(f(103.45678,'Index'),'103.457');
 assert.equal(f(12.3,'USD billions'),'12.3');assert.equal(f(-0,'%'),'0');assert.equal(f(null,'%'),'—');
});

test('chart explanations move to indicator-associated Sources without losing availability caveats',()=>{
 const api=ui(),s={id:'core_cpi',name:'Core CPI',he:'ליבה',unit:'% YoY',sa:'SA',releases:[{...base,id:'release-test',actual:2.6,released_at:past,components:[]}],calendar:[]};
 api.registerNotes(s,{status:'fetch_failed',points:[],error:'test retrieval error',fetched_at:past});
 const [key,title,body]=api.records[0];assert.equal(key,'macro-notes:core_cpi');assert.ok(title.includes('Core CPI'));
 for(const note of ['test retrieval error','no verified pre-release capture','decomposition unavailable','Schedule unavailable','0 revised observations','never zero',past])assert.ok(body.includes(note),note);
 assert.equal(api.nextRelease(s),'');assert.ok(!api.comparison(s,true).includes('Missing verified consensus'));
});

test('official unpublished period remains explained in Sources, not substituted as a quote',()=>{
 const api=ui();
 api.registerNotes({id:'cpi',name:'CPI',he:'CPI',releases:[]},{status:'publication_unavailable',points:[],unavailable_periods:[{period:'2026-10-01',reason:'Missing October 2025 base',source:'https://www.bls.gov/news.release/archives/cpi_11102026.htm',verified_at:'2026-11-10T14:32:00Z'}]});
 assert.ok(api.records.some(r=>r[2].includes('Official unavailable period 2026-10-01: Missing October 2025 base')));
});

test('release times follow wc-tz and never print a GMT offset',()=>{
 const ny=ui('en',1440,'America/New_York');
 assert.equal(ny.userZone(),'America/New_York');
 assert.equal(ny.releaseTime('2026-10-14T12:30:00Z'),'14 Oct 2026, 08:30');
 assert.equal(ui('en',1440,'Asia/Jerusalem').releaseTime('2026-10-14T12:30:00Z'),'14 Oct 2026, 15:30');
 assert.equal(ui('en',1440,'America/Los_Angeles').releaseTime('2026-10-14T12:30:00Z'),'14 Oct 2026, 05:30');
 const fallback=ui();
 assert.equal(fallback.userZone(),Intl.DateTimeFormat().resolvedOptions().timeZone);
 assert.doesNotMatch(fallback.releaseTime('2026-10-14T12:30:00Z'),/GMT|EDT|EST|UTC[+-]/);
 const he=ui('he',1440,'America/New_York').releaseTime('2026-10-14T12:30:00Z');
 assert.match(he,/08:30/);assert.doesNotMatch(he,/GMT/);
});

test('detail rows render verified consensus and label a genuine gap',()=>{
 const api=ui();
 const present={...base,id:'with',actual:3.4,released_at:past,consensus};
 const missing={...base,id:'without',period:'2026-07-01',actual:3.1,released_at:past,consensus:null};
 const s={id:'cpi',unit:'% YoY',sa:'SA',frequency:'monthly',releases:[present,missing],calendar:[]};
 const html=api.periodTable(s);
 assert.match(html,/3\.2/);
 assert.match(html,/0\.2/);
 assert.match(html,/Consensus unavailable/);
 assert.match(html,/macro-diff-neutral/);
 assert.match(html,/aria-label="Difference unavailable"/);
 const he=ui('he').periodTable({...s,releases:[missing]});
 assert.match(he,/תחזית לא זמינה/);
 assert.match(he,/הפרש לא זמין/);
 const meta=ui('en',1440,'America/Los_Angeles').releaseMeta(
  {period:'2026-09-01',released_at:'2026-10-14T12:30:00Z',vintage:'2026-10-14'},
  {frequency:'monthly',next_release:{scheduled_at:new Date(Date.now()+36*3600000).toISOString()}},
  null);
 assert.match(meta,/Reference period/);
 assert.match(meta,/Released at/);
 assert.match(meta,/Vintage/);
 assert.match(meta,/Next release/);
 assert.match(meta,/05:30/);
 assert.match(meta,/in /);
 assert.doesNotMatch(meta,/GMT|UTC|EDT|PST|Z</);
});

function months(start,count,value){
 return Array.from({length:count},(_,i)=>{
  const d=new Date(start+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+i);
  return {period:d.toISOString().slice(0,10),value:typeof value==='function'?value(i):value};
 });
}
test('three-year window is selected by date for monthly, quarterly and weekly history',()=>{
 const api=ui();
 const monthly=months('2022-10-01',48,i=>i===11?1000:i+1);
 const m=api.trailingAverage(monthly);
 assert.equal(m.count,36);assert.equal(m.from,'2023-10-01');assert.equal(m.to,'2026-09-01');
 assert.equal(m.windowKey,'3Y');assert.equal(m.full,true);assert.equal(m.value,30.5);assert.equal(m.latest,48);
 const quarterly=[];
 for(let i=0;i<20;i++){const d=new Date(Date.UTC(2021,9,1));d.setUTCMonth(d.getUTCMonth()+i*3);quarterly.push({period:d.toISOString().slice(0,10),value:i+1});}
 const q=api.trailingAverage(quarterly);
 assert.equal(q.count,12);assert.equal(q.from,'2023-10-01');assert.equal(q.to,'2026-07-01');assert.equal(q.windowKey,'3Y');
 const end=Date.parse('2026-09-05T00:00:00Z'),weekly=[];
 for(let i=0;i<220;i++)weekly.push({period:new Date(end-(219-i)*7*86400000).toISOString().slice(0,10),value:1});
 const w=api.trailingAverage(weekly.slice().reverse());
 assert.equal(w.count,157);assert.equal(w.from,'2023-09-09');assert.equal(w.to,'2026-09-05');assert.equal(w.windowKey,'3Y');assert.equal(w.stdev,0);
 assert.equal(api.trailingAverage([{period:'2026-09-01',value:1}]),null);
 assert.equal(api.trailingAverage([{period:'2026-08-01',value:null},{period:'nope',value:4}]),null);
});
test('short history keeps every observation and labels the covered span',()=>{
 const api=ui();
 const stat=api.trailingAverage(months('2024-10-01',24,10));
 assert.equal(stat.full,false);assert.equal(stat.windowKey,'2Y');assert.equal(stat.count,24);assert.equal(stat.value,10);assert.equal(stat.from,'2024-10-01');assert.equal(stat.to,'2026-09-01');
 const tiny=api.trailingAverage([{period:'2026-01-01',value:2},{period:'2026-02-01',value:1},{period:'2026-03-01',value:3}].reverse());
 assert.equal(tiny.windowKey,'2M');assert.equal(tiny.count,3);assert.equal(tiny.value,2);
 const oneTwoThree=api.trailingAverage([{period:'2026-01-01',value:1},{period:'2026-02-01',value:2},{period:'2026-03-01',value:3}]);
 assert.equal(oneTwoThree.stdev,1);
 const badge=api.averageBadge(stat,false,'%');
 assert.equal(badge.replace(/<[^>]*>/g,''),'0 vs 2Y avg');
 assert.match(badge,/macro-avg-neutral/);assert.match(badge,/title="[^"]*Fewer than 3 years/);
 assert.ok(!badge.replace(/ title="[^"]*"/,'').includes('Fewer than'));
 const he=ui('he').averageBadge(stat,false,'%');
 assert.match(he,/ממוצע 2 שנ׳/);assert.match(he,/מול/);assert.match(he,/זמינות פחות מ-3 שנות היסטוריה/);
});
test('solid white average line labels the axis and yields that slot to the tag',()=>{
 const api=ui();
 const points=months('2022-10-01',48,4);
 const stat=api.trailingAverage(points);assert.equal(stat.value,4);assert.equal(stat.windowKey,'3Y');
 const html=api.chart(points,true,'index',false,stat);
 assert.match(html,/class="macro-avg-line"/);assert.match(html,/stroke="#ffffff"/);assert.ok(!html.includes('stroke-dasharray'));
 assert.equal(html.match(/class="macro-avg-line"[^>]*y1="([^"]+)"/)[1],html.match(/data-tick="4"[^>]*y1="([^"]+)"/)[1]);
 assert.equal((html.match(/>4<\/text>/g)||[]).length,1);assert.ok(html.includes('class="macro-axis-tick"'));
 const box=html.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/).slice(1).map(Number);
 const rect=html.match(/class="macro-avg-tag">.*?<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/);
 const x=+rect[1],y=+rect[2],w=+rect[3],h=+rect[4];
 assert.ok(x>=0&&y>=0&&x+w<=box[0]+1e-6&&y+h<=box[1]+1e-6);
 const card=api.chart(points,false,'index',false,stat);
 assert.match(card,/class="macro-avg-line"/);assert.match(card,/>4<\/text>/);assert.ok(!card.includes('macro-axis-tick'));
 assert.equal(api.averageTone(0.3,false),'unfavorable');assert.equal(api.averageTone(-0.3,false),'favorable');
 assert.equal(api.averageTone(0.3,true),'favorable');assert.equal(api.averageTone(0.3,'neutral'),'neutral');assert.equal(api.averageTone(0,true),'neutral');
 assert.equal(api.direction({id:'unemployment'}),false);assert.equal(api.direction({id:'jolts',higherIsBetter:'neutral'}),'neutral');assert.equal(api.direction({id:'unknown'}),'neutral');
 const flags={cpi:false,pce:false,core_cpi:false,industrial:true,gdp:true,retail:true,ism_manufacturing:true,ism_services:true,nfp:true,unemployment:false,claims:false,jolts:true,wages:'neutral'};
 assert.deepEqual(Object.keys(api.HIGHER_IS_BETTER).sort(),Object.keys(flags).sort());
 for(const id of Object.keys(flags))assert.equal(api.direction({id}),flags[id]);
});
