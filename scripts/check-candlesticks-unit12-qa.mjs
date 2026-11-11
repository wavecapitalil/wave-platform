#!/usr/bin/env node
// Run from repository root: node scripts/check-candlesticks-unit12-qa.mjs
import fs from 'node:fs';import assert from 'node:assert/strict';import path from 'node:path';
const publicDir='apps/terminal/public',get=n=>fs.readFileSync(path.join(publicDir,n),'utf8');
const lessons=[...Array.from({length:4},(_,i)=>'candlesticks-lesson-0'+(i+1)+'.html'),...Array.from({length:5},(_,i)=>'candlesticks-lesson-2-'+(i+1)+'.html')];
for(const [i,p] of lessons.entries()){
 const h=get(p);assert(h.includes('dir="rtl"'),p+' RTL');assert(h.includes('id="complete"'),p+' completion');assert(h.includes('class="wave-reveal-solutions"'),p+' independent solution reveal');assert.equal((h.match(/<section\b/g)||[]).length,(h.match(/<\/section>/g)||[]).length,p+' section tags');assert.equal((h.match(/<details\b/g)||[]).length,(h.match(/<\/details>/g)||[]).length,p+' details tags');
 if(i>=4){const n=i-3;for(let f=1;f<=3;f++){const asset='docs/course-workspace/fig-2-'+n+'-0'+f+'.png';assert(fs.existsSync(asset),'missing approved source illustration '+asset)}}
}
const graph=get('candlesticks-lesson-02.html');
const svg=graph.match(/<svg viewBox="0 0 640 300"[\s\S]*?<\/svg>/)?.[0];assert(svg,'missing interactive price chart');
assert.deepEqual([...svg.matchAll(/data-value="(\d+)"/g)].map(m=>Number(m[1])),[100,102,99,103,101],'line chart values inconsistent with source');
const anatomy=get('candlesticks-lesson-2-2.html');assert(anatomy.includes('fig-2-2-02-verified.svg?v=1'),'broken anatomy replacement link');
const ill=get('assets/candlesticks-unit2/fig-2-2-02-verified.svg');for(const v of ['O=100','H=112','L=96','C=108','Body: 108 − 100 = 8','Full range: 112 − 96 = 16'])assert(ill.includes(v),'missing anatomy value '+v);
const two=get('candlesticks-lesson-2-5.html');assert(two.includes('תבנית בולען (Engulfing)'),'original 2.5 source question lost');
for(let n=3;n<=5;n++){const h=get('candlesticks-lesson-2-'+n+'.html');assert(h.includes('<details class="wave-reveal-solutions">'),'inline answers still shown in 2.'+n)}
const audit=JSON.parse(fs.readFileSync('docs/course-workspace/reviews/COURSE_56_LESSON_QA_MATRIX_2026-11-11.json','utf8'));for(const id of ['1.1','1.2','1.3','1.4','2.1','2.2','2.3','2.4','2.5']){const item=audit.lessons.find(x=>x.display_id===id);assert(item&&item.status==='qa_in_progress','missing per-lesson QA '+id)}
assert.equal(audit.lessons.length,56);console.log('PASS: Unit 1 + Unit 2 exercise gates, 15 asset paths, source graph values, dark anatomy math and QA statuses.');
