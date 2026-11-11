#!/usr/bin/env node
// Run from repository root: node scripts/check-candlesticks-quality-fixes.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root='apps/terminal/public',read=p=>fs.readFileSync(path.join(root,p),'utf8');
const catalog=read('candlesticks-course.html');
assert.equal((catalog.match(/class="lesson-card"/g)||[]).length,56,'catalog must contain 56 lessons');
for(let n=5;n<=12;n++)assert(catalog.includes('candlesticks-unit4-review-v3.html?lesson='+n),'unit 4 card '+n+' must load complete reviewed lesson');
assert(read('candlesticks-unit4-review-v3.html').includes('candlesticks-unit4-practice-cards.js'),'18-card script not linked');
const figures=read('candlesticks-unit4-practice-cards.js');
const cards=JSON.parse(figures.match(/const cards=(\[.*?\]);\nconst scenes=/s)?.[1]||'null');
assert.equal(cards.length,18,'exactly 18 cards expected');
assert.equal(new Set(cards.map(x=>x.id)).size,18,'duplicate exercise card');
for(const c of cards){assert(Number.isFinite(c.o)&&Number.isFinite(c.h)&&Number.isFinite(c.l)&&Number.isFinite(c.c),'non-numeric OHLC');assert(c.l<=Math.min(c.o,c.c)&&c.h>=Math.max(c.o,c.c),'invalid OHLC card '+c.id);}
assert.equal(cards[12].h,cards[12].l,'13 is intentionally zero-range');
for(const [a,b] of [[8,9],[10,11]])assert.deepEqual([cards[a].o,cards[a].h,cards[a].l,cards[a].c],[cards[b].o,cards[b].h,cards[b].l,cards[b].c],'context pair changed OHLC');
for(const unit of [7,8,9]){
 const json=JSON.parse(read('assets/candlesticks-unit'+unit+'/unit'+unit+'-learning-content-review.json'));
 assert.equal(json.status,'public_preview_pending_final_qa','preview must not be mislabeled approved');
 assert.equal(json.lessons.length,unit===7?4:5,'lesson total wrong');
 const code=read('candlesticks-unit'+unit+'-review.js');
 assert(code.includes('SOURCE_UNIT='+(unit+1)),'progress key should retain source ID');
 assert(code.includes('completionUI()'),'progress control missing');
 if(unit>=8){
  const rx=code.slice(code.indexOf('const FINANCIAL_TOKEN_RX='),code.indexOf('function bilingual'));
  assert(!rx.includes('\\\\d'),'numerical bidi regex contains an escaped-backslash bug');
 }
}
const registry=JSON.parse(fs.readFileSync('docs/course/registry.json','utf8'));
assert.equal(registry.policy,'deny_by_default','publishing gate changed unexpectedly');
for(const [file,unit] of [['candlesticks-unit-8-review.html',8],['candlesticks-unit-9-review.html',9]]){
 const html=read(file);assert(html.includes('יחידה '+unit+' — '+(unit===8?'ניהול סיכונים':'תהליך מסחר ובדיקות')),'wrong unit heading');
}
console.log('PASS: catalog=56, Unit 4 practice=18 valid OHLC, links, public review statuses, stable progress keys and bidi literals.');
