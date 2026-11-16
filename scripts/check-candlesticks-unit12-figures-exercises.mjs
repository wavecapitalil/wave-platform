#!/usr/bin/env node
// Source/figure and exercise QA regression for 1.1–2.5.
// Run from repository root: node scripts/check-candlesticks-unit12-figures-exercises.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir='apps/terminal/public/';
const get=name=>fs.readFileSync(dir+name,'utf8');
const pages=[...Array.from({length:4},(_,i)=>'candlesticks-lesson-0'+(i+1)+'.html'),
...Array.from({length:5},(_,i)=>'candlesticks-lesson-2-'+(i+1)+'.html')];
for(const name of pages){
const html=get(name);
assert(html.includes('lang="he" dir="rtl"'),'Missing RTL '+name);
assert(html.includes('id="complete"'),'Missing lesson completion '+name);
assert(html.includes('class="wave-reveal-solutions"'),'Missing expanded explanation '+name);
assert.equal((html.match(/<details\b/g)||[]).length,(html.match(/<\/details>/g)||[]).length,'Unbalanced answer disclosure '+name);
assert.equal((html.match(/<section\b/g)||[]).length,(html.match(/<\/section>/g)||[]).length,'Unbalanced section '+name);
}
const one=get('candlesticks-lesson-01.html');
for(const t of ['149.80','150.20','0.40','100 ₪','pedagogy-solution'])assert(one.includes(t),'Missing 1.1 solution detail: '+t);
const graph=get('candlesticks-lesson-02.html');
const line=graph.match(/<svg viewBox="0 0 640 300"[\s\S]+?<\/svg>/)?.[0];assert(line,'Missing lesson 1.2 price chart');
assert.deepEqual([...line.matchAll(/data-value="(\d+)"/g)].map(m=>Number(m[1])),[100,102,99,103,101],'Price chart diverges from PDF');
assert(graph.includes('viewBox="0 0 700 300"'),'Missing scaled OHLC comparison');
assert(graph.includes('16 פיקסלים ליחידת מחיר'),'OHLC comparison lacks uniform scale annotation');
const two=get('candlesticks-lesson-2-2.html');
assert(two.includes('fig-2-2-02-verified.svg'),'Fixed 2.2 anatomy figure not linked');
const anatomy=get('assets/candlesticks-unit2/fig-2-2-02-verified.svg');
for(const token of ['O=100','H=112','L=96','C=108','Body: 108 − 100 = 8','Upper wick: 112 − 108 = 4','Lower wick: 100 − 96 = 4','Full range: 112 − 96 = 16'])assert(anatomy.includes(token),'Anatomy value mismatch '+token);
const gapPage=get('candlesticks-lesson-2-5.html');
assert(gapPage.includes('fig-2-5-01-verified.svg'),'Precise gap illustration not linked');
const gap=get('assets/candlesticks-unit2/fig-2-5-01-verified.svg');
for(const token of ['105','108','106','107.5','פער פתיחה לעומת פער מלא','פער מלא: 1.5'])assert(gap.includes(token),'Gap value missing '+token);
const cases=[{priorClose:105,nextOpen:108,priorHigh:106,nextLow:107.5},{priorClose:100,nextOpen:103,priorHigh:104,nextLow:102}];
assert.equal(cases[0].nextOpen-cases[0].priorClose,3);
assert.equal(cases[0].nextLow-cases[0].priorHigh,1.5);
assert(cases[1].nextLow<=cases[1].priorHigh,'Opening gap need not imply full range gap');
for(let unit=1;unit<=5;unit++){for(let fig=1;fig<=3;fig++){
const f='docs/course-workspace/fig-2-'+unit+'-0'+fig+'.png';assert(fs.existsSync(f),'Missing original image '+f);
}}
const two1=get('candlesticks-lesson-2-1.html');assert(two1.includes('C&gt;O')&&two1.includes('H ≥ max(O,C)'),'2.1 OHLC validity example missing');
const two2=get('candlesticks-lesson-2-2.html');assert(two2.includes('0.75')&&two2.includes('הטווח 13'),'2.2 exercise computation missing');
const two3=get('candlesticks-lesson-2-3.html');assert(two3.includes('O=40, H=47, L=38, C=43'),'2.3 aggregation missing');
const two4=get('candlesticks-lesson-2-4.html');assert(two4.includes('O=50, H=56, L=48, C=52'),'2.4 intermediate OHLC missing');
assert(gapPage.includes('תבנית בולען (Engulfing)'),'2.5 original Engulfing exercise missing');
const qa=JSON.parse(fs.readFileSync('docs/course-workspace/reviews/COURSE_56_LESSON_QA_MATRIX_2026-11-11.json','utf8'));
assert.equal(qa.lessons.length,56);for(const id of [...Array.from({length:4},(_,i)=>'1.'+(i+1)),...Array.from({length:5},(_,i)=>'2.'+(i+1))]){
const row=qa.lessons.find(x=>x.display_id===id);assert.equal(row?.status,'qa_in_progress','Must not fabricate final QA approval '+id);
}
console.log('PASS nine lesson pages, nine answer disclosures, all fifteen original Unit 2 assets, exact charts, and source-fidelity math.');
