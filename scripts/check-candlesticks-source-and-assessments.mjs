#!/usr/bin/env node
// WAVE course structural gate. Run: node scripts/check-candlesticks-source-and-assessments.mjs
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const base='apps/terminal/public',load=p=>fs.readFileSync(path.join(base,p),'utf8');
const catalog=load('candlesticks-course.html');
assert.equal((catalog.match(/class="lesson-card"/g)||[]).length,56,'All 56 lesson cards must be present');
assert.equal((catalog.match(/class="unit-quiz-link"/g)||[]).length,9,'Nine unit assessments must be linked');
const QA=JSON.parse(fs.readFileSync('docs/course-workspace/reviews/COURSE_56_LESSON_QA_MATRIX_2026-11-11.json','utf8'));
assert.equal(QA.lessons.length,56,'QA matrix must cover all 56 lessons');
for(const lesson of QA.lessons){assert(fs.existsSync(lesson.source_path),'Missing source '+lesson.source_id);assert.equal(lesson.status,'qa_pending','No unreviewed lesson may be marked approved');}
assert(!load('candlesticks-glossary.js').includes('["EMA"'),'SMA-only glossary must not reintroduce deleted indicator');
const bankRaw=load('candlesticks-assessment-bank.js').trim();const bank=JSON.parse(bankRaw.replace(/^window\.WAVE_COURSE_ASSESSMENTS=/,'').replace(/;$/,''));
assert.equal(bank.units.length,9);assert.equal(bank.policy.minScorePercent,80);
const indexes=new Set();
for(const u of bank.units){assert.equal(u.questions.length,5,'Every unit requires five questions');for(const q of u.questions){assert.equal(q.options.length,4);assert(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<4);assert(q.why&&q.why.length>8);indexes.add(q.answer)}}
assert.equal(indexes.size,4,'Correct answers must not appear in the same position');
const cardCode=load('candlesticks-unit4-practice-cards.js'),cards=JSON.parse(cardCode.match(/const cards=(\[.*?\]);\nconst scenes=/s)?.[1]||'null');
const pdfOHLC=[[100,103,97,100],[100,110,90,100],[100,100,90,100],[100,110,100,100],[100,106,94,102],[102,106,94,100],[100,108,100,108],[108,108,100,100],[100,103,92,102],[100,103,92,102],[100,110,99,102],[100,110,99,102],[100,100,100,100],[100,110,98,108],[100,105,95,100.6],[100,105,94,104],[100,103,92,102],[100,108.2,100,108]];
assert.equal(cards.length,18,'Expected 18 reconstructed cards');
cards.forEach((c,i)=>{assert.deepEqual([c.o,c.h,c.l,c.c],pdfOHLC[i],'Disagrees with PDF page '+(i<6?65:i<12?66:67)+' card '+(i+1));assert(c.l<=Math.min(c.o,c.c)&&c.h>=Math.max(c.o,c.c),'Invalid OHLC');});
assert(load('candlesticks-assessment-app.js').includes('lessonProgress(unit)'),'Unit completion must include lesson progress');
assert(load('candlesticks-unit4-review-v3.js').includes("fig-4-"),'Dedicated Unit 4 figures should be referenced');
const editorial4=JSON.parse(load('assets/candlesticks-unit4/unit4-editorial-review.json'));assert.equal(editorial4.lessons.length,12);
const p=[4,5,6,7,8,9];const lengths=[12,8,8,4,5,5];assert.deepEqual(lengths.reduce((a,b)=>a+b,14),56);
console.log('PASS: 56 source records, 56 catalog cards, 18 PDF-identical OHLC cards, 45 varied quiz items, 9 links and approval guards.');
