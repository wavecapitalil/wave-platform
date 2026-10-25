import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../apps/terminal/public/terminal-macro-dashboard.js',import.meta.url),'utf8');
function ui(lang='en',width=375){
 const noop=()=>{};const el={addEventListener:noop};
 const context={window:{innerWidth:width},document:{documentElement:{lang},getElementById:()=>el},localStorage:{getItem:()=>lang},Date,Intl,Number,Math,Array,String,Set};
 vm.runInNewContext(source.replace('  var previousLanguageChange=', '  window.testAPI={chart,comparisonPoints,comparison,nextRelease,verifiedConsensus}; var previousLanguageChange='),context);
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
