import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../apps/terminal/public/terminal-macro-dashboard.js',import.meta.url),'utf8');
function ui(lang='en',width=375){
 const noop=()=>{};const el={addEventListener:noop};
 const context={window:{innerWidth:width},document:{documentElement:{lang},getElementById:()=>el},localStorage:{getItem:()=>lang},Date,Intl,Number,Math,Array,String,Set};
 vm.runInNewContext(source.replace('  var previousLanguageChange=', '  window.testAPI={chart,chartScale,readable,comparisonPoints,comparison,nextRelease,verifiedConsensus}; var previousLanguageChange='),context);
 return context.window.testAPI;
}
const now=Date.now(),past=new Date(now-86400000).toISOString(),future=new Date(now+86400000).toISOString();
const period='2026-08-01',base={period,unit:'% YoY',sa:'SA',source:'https://www.bea.gov/test',verified_at:past};
const consensus={value:3.2,unit:'% YoY',sa:'SA',period,access_verified:true,source:'https://example.org/verified-test-only',captured_at:new Date(now-172800000).toISOString()};
test('past actual columns and distinct consensus dots; future consensus has no fabricated column',()=>{
 const api=ui(),s={unit:'% YoY',sa:'SA',releases:[{...base,actual:3.4,released_at:past,consensus}],calendar:[{...base,id:'next',scheduled_at:future,consensus}]};
 const points=api.comparisonPoints(s);assert.equal(points[0].value,3.4);assert.equal(points[1].value,null);
 const html=api.comparison(s,true);assert.equal((html.match(/<rect /g)||[]).length,1);assert.equal((html.match(/<circle /g)||[]).length,2);
 assert.ok(html.includes('Difference: 0.2'));assert.ok(html.includes('2026-08-01'));assert.ok(html.includes('Verified source'));assert.ok(html.includes('Release date'));
 for(const attr of html.matchAll(/\s(?:x|y|width|height|cx|cy)="([^"]+)"/g))assert.ok(Number.isFinite(Number(attr[1])),attr[0]);
});
test('missing consensus is never zero; revised history has no consensus dots',()=>{
 const api=ui(),s={unit:'% YoY',sa:'SA',releases:[{...base,actual:0,released_at:past}],calendar:[]};
 const html=api.comparison(s,true);assert.equal((html.match(/<circle /g)||[]).length,0);assert.equal((html.match(/<rect /g)||[]).length,1);assert.ok(html.includes('Missing verified consensus'));
 assert.ok(!api.chart([{period,value:3.419}],true,'% YoY').includes('<circle'));
 assert.ok(api.nextRelease(s).includes('Schedule unavailable'));
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
 assert.ok(!comparison.includes('macro-consensus-key'));assert.ok(comparison.includes('צפי מאומת חסר'));
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
