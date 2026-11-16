const {test} = require('node:test');
const assert = require('node:assert/strict');
const m = require('../apps/terminal/public/terminal-research-metrics.js');
const data = require('../apps/terminal/public/assets/research/btc-bb/daily.json');
const DAY = 86400000;
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-12, `${a} != ${b}`);
const bar = (t,o,h,l,c) => [t,o,h,l,c,'0',t+DAY-1];
const lastTime = Date.parse('2026-11-03T00:00:00Z');
const lastBar = bar(lastTime,...['o','h','l','c'].map(k=>data[k].at(-1)));
test('exact frozen report counts and arithmetic reproduced from original tape',()=>{
 const r=m.compute(data); assert.equal(r.asOf,'2026-11-03');
 assert.equal(r.historical.completedTouches,415); assert.equal(r.historical.completedEpisodes,88);
 assert.equal(r.historical.baselineCount,3340); near(r.historical.touchMean,.0007585200210918525);
 near(r.historical.episodeMean,-.005652264892871859);
 assert.equal(r.forward.episodeGap,null); assert.equal(r.sharpe,null); assert.deepEqual(r.series,[]);
});
test('invalid input and missing prices cannot silently become zero',()=>{
 assert.throws(()=>m.compute({...data,c:[null,...data.c.slice(1)]}));
 assert.throws(()=>m.compute({...data,l:[999999,...data.l.slice(1)]}));
 assert.throws(()=>m.compute(data,{windowDays:0}));
});
test('as-of truncation prevents future outcomes leaking into rolling series',()=>{
 const x={start:'2026-10-01',o:[],h:[],l:[],c:[]};
 for(let i=0;i<60;i++){const c=100+i; x.o.push(c);x.h.push(c+1);x.l.push(i===35?1:c-1);x.c.push(c);}
 const a=m.compute(x,{asOf:'2026-11-06'});const b=m.compute(x);
 assert.equal(a.forward.completedTouches,0);assert.equal(a.forward.pendingTouches,1);
 assert.equal(a.series.at(-1).value,null);
 const e=b.events.find(e=>e.date==='2026-11-05'); assert.equal(e.episode,true);near(e.return7d,142/135-1);
 const before=b.series.find(e=>e.date==='2026-11-11');assert.equal(before.value,null);
 assert.equal(b.series.find(e=>e.date==='2026-11-12').count,1);
 // Independently truncated daily computation equals the corresponding full-tape point.
 assert.deepEqual(a.series,b.series.filter(p=>p.date<='2026-11-06'));
});
test('refresh verifies source overlap and contiguous fully closed days',async()=>{
 const now=Date.parse('2026-11-05T12:00:00Z'); let url;
 const next=bar(lastTime+DAY,80000,82000,75000,80504.01);
 const r=await m.refresh(data,{now,fetch:async u=>{url=u;return {ok:true,json:async()=>[lastBar,next]};}});
 assert.ok(url.startsWith(m.ENDPOINT+'?symbol=BTCUSDT&interval=1d'));
 assert.equal(r.refreshed,true);assert.equal(r.result.asOf,'2026-11-04');
 assert.equal(data.c.length,3366);assert.equal(r.data.c.length,3367);
 assert.deepEqual(r.result.historical,m.compute(data).historical);
});
test('network, gaps, changed overlap, and partial candles fall back with original as-of',async()=>{
 for(const page of [[],[bar(lastTime,1,2,1,2)], [lastBar,bar(lastTime+2*DAY,1,2,1,2)], [lastBar,[lastTime+DAY,1,2,1,2,'0',lastTime+DAY+123]]]) {
  const r=await m.refresh(data,{now:Date.parse('2026-11-05T12:00:00Z'),fetch:async()=>({ok:true,json:async()=>page})});
  assert.equal(r.refreshed,false);assert.equal(r.result.asOf,'2026-11-03');assert.ok(r.error);assert.equal(r.data,data);
 }
 const r=await m.refresh(data,{now:Date.parse('2026-11-16T12:00:00Z'),fetch:async()=>{throw Error('offline');}});
 assert.equal(r.error,'offline');assert.equal(r.snapshot.asOf,'2026-11-15');assert.equal(r.result.asOf,'2026-11-03');
});
test('snapshot is report evidence, never relabeled as a fresh daily time series',()=>{
 assert.equal(m.snapshot.kind,'published_snapshot');assert.equal(m.snapshot.completedEpisodes,0);
 assert.equal(m.snapshot.episodeGap,null);assert.equal(m.snapshot.eventReturns.length,4);
 assert.equal(m.snapshot.publishedAt,'2026-11-16T05:45:03.128228Z');
});
test('episode rule includes t-7 and rolling windows do not keep expired outcomes',()=>{
 const x={start:'2026-10-01',o:[],h:[],l:[],c:[]};
 for(let i=0;i<75;i++){const c=100+i;x.o.push(c);x.h.push(c+1);x.l.push([28,35,43].includes(i)?1:c-1);x.c.push(c);}
 const r=m.compute(x,{windowDays:7});
 assert.equal(r.events.find(e=>e.date==='2026-11-05').episode,false); // Oct29 is t-7.
 assert.equal(r.events.find(e=>e.date==='2026-11-13').episode,true); // Prior touch was t-8.
 assert.equal(r.series.find(p=>p.date==='2026-11-20').count,1);
 assert.equal(r.series.find(p=>p.date==='2026-11-27').count,0);
 assert.equal(r.series.find(p=>p.date==='2026-11-27').value,null);
});
