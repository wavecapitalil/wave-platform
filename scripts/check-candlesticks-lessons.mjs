#!/usr/bin/env node
// Lightweight static checks for WAVE candlestick course; run from repository root: node scripts/check-candlesticks-lessons.mjs
import fs from 'node:fs';
import path from 'node:path';
const root='apps/terminal/public', source='docs/course-workspace';
const lessons=[...Array(4)].map((_,i)=>'candlesticks-lesson-0'+(i+1)+'.html').concat([...Array(5)].map((_,i)=>'candlesticks-lesson-2-'+(i+1)+'.html'));
let failures=[];
function check(ok,message){if(!ok)failures.push(message)}
for(const filename of lessons){const file=path.join(root,filename);check(fs.existsSync(file),'Missing lesson: '+filename);if(!fs.existsSync(file))continue;const s=fs.readFileSync(file,'utf8');check(s.includes('dir="rtl"'),filename+': no RTL');check(s.includes('candlesticks-course-tools.js'),filename+': shared engine unavailable');check(s.includes('candlesticks-course-tools.css'),filename+': toolkit stylesheet unavailable');check(s.includes('lesson-preview'),filename+': missing learning introduction');check(s.includes('id="complete"'),filename+': missing completion control');check((s.match(/class="section"/g)||[]).length>=2,filename+': too few structured sections');}
for(let i=1;i<=5;i++){const filename='candlesticks-lesson-2-'+i+'.html',s=fs.readFileSync(path.join(root,filename),'utf8');let matches=[...s.matchAll(/src="https:\/\/raw\.githubusercontent\.com\/wavecapitalil\/wave-platform\/main\/docs\/course-workspace\/([^"]+\.png)"/g)];check(matches.length>=3,filename+': expected original lesson figures');for(const m of matches){const rel=m[1];check(!rel.includes('..')&&fs.existsSync(path.join(source,rel)),filename+': missing local source asset '+rel);}}
check(fs.readFileSync(path.join(root,'candlesticks-course-tools.js'),'utf8').includes('data-reveal-step'),'Missing shared reveal widget');
if(failures.length){for(const f of failures)console.error('FAIL '+f);process.exitCode=1}else console.log('PASS: 9 lessons, navigation hooks, intro panels, accessible tools and original figure paths validated.');
