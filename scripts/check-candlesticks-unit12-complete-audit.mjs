#!/usr/bin/env node
// Unit 1–2 source/figure/exercise regression. Run: node scripts/check-candlesticks-unit12-complete-audit.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir='apps/terminal/public';
const read=p=>fs.readFileSync(path.join(dir,p),'utf8');
const first=Array.from({length:4},(_,i)=>'candlesticks-lesson-0'+(i+1)+'.html');
const second=Array.from({length:5},(_,i)=>'candlesticks-lesson-2-'+(i+1)+'.html');
const expected={
 'candlesticks-lesson-2-1.html':['fig-2-1-03.png','fig-2-1-02.png'],
 'candlesticks-lesson-2-2.html':['fig-2-2-03.png','fig-2-2-02-verified.svg','fig-2-2-01.png'],
 'candlesticks-lesson-2-3.html':['fig-2-3-01.png','fig-2-3-02.png','fig-2-3-03.png'],
 'candlesticks-lesson-2-4.html':['fig-2-4-01.png','fig-2-4-03.png','fig-2-4-02.png'],
 'candlesticks-lesson-2-5.html':['fig-2-5-01.png','fig-2-5-02.png','fig-2-5-03.png']
};
for(const page of [...first,...second]){
 const s=read(page);const label=page;
 assert.equal((s.match(/<template\b/g)||[]).length,0,label+' hidden malformed source templates remain');
 assert.equal((s.match(/<section\b/g)||[]).length,(s.match(/<\/section>/g)||[]).length,label+' sections unbalanced');
 assert.equal((s.match(/<details\b/g)||[]).length,(s.match(/<\/details>/g)||[]).length,label+' details unbalanced');
 assert(s.includes('id="complete"'),label+' completion button missing');
 assert(s.includes('class="wave-reveal-solutions"')||s.includes('class="pedagogy-solution"'),label+' solutions not revealed separately');
 const ids=[...s.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length,label+' duplicate DOM ids');
 if(expected[page]){
  const refs=[...s.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map(x=>x[1].split('/').at(-1).split('?')[0]);
  assert.deepEqual(refs,expected[page],label+' figure/caption mapping incorrect');
  assert.equal((s.match(/<figcaption class="visnote">/g)||[]).length,3,label+' must explain all 3 figures');
  assert(!s.includes('יש להציג את האיור לצד ההסבר'),label+' editorial instructions visible to students');
 }
}
const one=read(first[0]);for(let n=1;n<=4;n++)assert(one.includes('<strong>שאלה '+n+':</strong>'),'missing explanatory answer to Unit 1.1 question '+n);
const line=read(first[1]).match(/<svg viewBox="0 0 640 300"[\s\S]*?<\/svg>/)?.[0];assert(line,'Unit 1.2 line chart missing');
assert.deepEqual([...line.matchAll(/data-value="(\d+)"/g)].map(m=>Number(m[1])),[100,102,99,103,101],'Unit 1.2 line chart values incorrect');
const two=read(second[1]);assert(two.includes('fig-2-2-02-verified.svg?v=1'),'reviewed 2.2 SVG missing');
const svg=read('assets/candlesticks-unit2/fig-2-2-02-verified.svg');for(const token of ['O=100','H=112','L=96','C=108','Body: 108 − 100 = 8','Full range: 112 − 96 = 16'])assert(svg.includes(token),'incorrect 2.2 SVG figure: '+token);
assert(read(second[4]).includes('תבנית בולען (Engulfing)'),'Unit 2.5 original source question missing');
const matrix=JSON.parse(fs.readFileSync('docs/course-workspace/reviews/COURSE_56_LESSON_QA_MATRIX_2026-11-11.json','utf8'));
for(const id of [...Array.from({length:4},(_,i)=>'1.'+(i+1)),...Array.from({length:5},(_,i)=>'2.'+(i+1))]){
 const e=matrix.lessons.find(v=>v.display_id===id);assert(e&&e.status==='qa_in_progress',id+' should remain in QA, not falsely approved');
}
console.log('PASS: 9 lesson HTML documents, 15 figure slots, 4 explained review answers, source math, no archival templates, unique IDs and approval gate.');
