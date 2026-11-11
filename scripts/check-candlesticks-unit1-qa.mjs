#!/usr/bin/env node
// Static smoke tests for reviewed Unit 1 lesson content. Run from repo root.
import fs from 'node:fs';import assert from 'node:assert/strict';
const root='apps/terminal/public/',read=n=>fs.readFileSync(root+n,'utf8');
const files=[1,2,3,4].map(n=>'candlesticks-lesson-0'+n+'.html');
for(const file of files){const src=read(file);assert(src.includes('lang="he" dir="rtl"'),file+' needs RTL');assert(src.includes('class="combined-intro"'),file+' needs learning intro');assert(src.includes('id="complete"'),file+' needs completion action');assert(src.includes('href="candlesticks-course.html"'),file+' must link to course');}
const a=read(files[0]);assert(a.includes('5. בורסה לעומת OTC — היכרות ראשונה'),'Unit 1.1 malformed navigation');
const b=read(files[1]);assert(b.includes('4. חיבור הנקודות בגרף קו'),'Unit 1.2 malformed navigation');assert(!b.includes('3חיבור'),'Unit 1.2 broken source token remains');assert(b.includes('והסגירה 101. איזה נתון'),'Unit 1.2 broken question punctuation');assert(b.includes('<table class="wave-price-table">'),'Unit 1.2 missing accessible table');
for(const [day,price] of [['ראשון','100'],['שני','102'],['שלישי','99'],['רביעי','103'],['חמישי','101']]){assert(b.includes('<th scope="row">'+day+'</th><td><bdi>'+price+'</bdi></td>'),'Unit 1.2 wrong sample data '+day)}
const c=read(files[2]);assert(c.includes('ספרו המרכזי של ניסון בשנת 1991.'),'Unit 1.3 date punctuation');assert(!c.includes('בשנת .1991'),'Unit 1.3 reversed date');
const d=read(files[3]);assert(d.includes('למקרה ה־101. גם'),'Unit 1.4 probability example broken');assert(!d.includes('ה־ .101'),'Unit 1.4 reversed numeric punctuation');
const qa=JSON.parse(fs.readFileSync('docs/course-workspace/reviews/COURSE_56_LESSON_QA_MATRIX_2026-11-11.json','utf8'));assert.equal(qa.lessons.length,56);for(let n=1;n<=4;n++){const row=qa.lessons.find(x=>x.display_id==='1.'+n);assert(row&&row.status==='qa_in_progress','QA progress status missing '+n)}console.log('PASS: 4 lesson pages, correct source sample and exercise, navigation and QA status.');
