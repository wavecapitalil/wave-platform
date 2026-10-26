// Isolated frontend fixtures only: no backend calls or production data changes.
// npm install --prefix /tmp/wave-chart-qa playwright
// WAVE_PLAYWRIGHT_MODULE=/tmp/wave-chart-qa/node_modules/playwright/index.mjs node scripts/macro_chart_browser_test.mjs
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.WAVE_PLAYWRIGHT_MODULE||'playwright');
const source=await fs.readFile(new URL('../apps/terminal/public/terminal-macro-dashboard.js',import.meta.url),'utf8');
const css=await fs.readFile(new URL('../apps/terminal/public/terminal-macro-dashboard.css',import.meta.url),'utf8');
const out=process.env.WAVE_CHART_QA_OUT||'/tmp/wave-chart-qa/screenshots';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const [width,lang] of [[1440,'en'],[375,'he'],[320,'en']]){
  const context=await browser.newContext({viewport:{width,height:850},hasTouch:width<600});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.route('https://chart-test.invalid/',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html lang="${lang}"><meta charset="utf-8"><style>${css}body{margin:0;background:#020617;color:white;font:14px sans-serif}</style><dialog id="macroDialog"><header><h2 id="macroDialogTitle">Industrial production · TEST FIXTURE</h2><button id="macroDialogClose">Close</button></header><div id="macroDetail"></div></dialog></html>`}));
  await page.goto('https://chart-test.invalid/');
  await page.addScriptTag({content:source.replace('  var previousLanguageChange=', '  window.testAPI={chart,bindCharts,fixture:function(s,h){state.series=[s];state.histories={[s.id]:h};selected=s.id;details();}}; var previousLanguageChange=')});
  await page.evaluate(()=>{
   const points=[{period:'2026-01-01',value:-1.37},{period:'2026-02-01',value:-0.015123456789},{period:'2026-03-01',value:0},{period:'2026-04-01',value:1.341}];
   const host=document.getElementById('macroDetail');host.innerHTML=testAPI.chart(points,true,'% MoM');testAPI.bindCharts(host);document.getElementById('macroDialog').showModal();
  });
  const svg=page.locator('.macro-chart svg'),readout=page.locator('.macro-chart-readout');
  await svg.focus();assert.match(await readout.innerText(),/2026\/01\/01 · −1.37 % MoM/);
  await page.keyboard.press('ArrowRight');assert.match(await readout.innerText(),/−0.015 % MoM/);
  await page.keyboard.press('End');assert.match(await readout.innerText(),/1.341 % MoM/);
  await page.keyboard.press('Home');assert.match(await readout.innerText(),/−1.37 % MoM/);
  const box=await svg.boundingBox();
  const x=await svg.evaluate(e=>JSON.parse(e.dataset.readings)[2].x/e.viewBox.baseVal.width);
  await page.mouse.move(box.x+box.width*x,box.y+box.height*.2);
  assert.match(await readout.innerText(),/2026\/03\/01 · 0 % MoM/);
  if(width<600){await page.touchscreen.tap(box.x+box.width*x,box.y+box.height*.4);assert.match(await readout.innerText(),/2026\/03\/01 · 0 % MoM/);}
  assert.equal(await page.locator('[data-tick="0"]').getAttribute('y1'),await page.locator('.macro-zero').getAttribute('y1'));
  assert.ok(await page.locator('#macroDialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  assert.ok(await svg.evaluate(e=>[...e.querySelectorAll('text')].every(t=>{const b=t.getBBox();return b.x>=0&&b.x+b.width<=e.viewBox.baseVal.width;})));
  assert.ok(await svg.evaluate(e=>{const boxes=[...e.querySelectorAll('.macro-axis-period')].map(t=>t.getBBox()).sort((a,b)=>a.x-b.x);return boxes.every((b,i)=>!i||boxes[i-1].x+boxes[i-1].width+3<=b.x);}));
  await page.screenshot({path:`${out}/${width}-${lang}.png`});
  await page.keyboard.press('Escape');assert.ok(await page.locator('#macroDialog').evaluate(e=>e.open));
  await page.keyboard.press('Escape');assert.ok(await page.locator('#macroDialog').evaluate(e=>!e.open));
  await page.evaluate(()=>document.getElementById('macroDialog').showModal());
  await page.evaluate(()=>testAPI.fixture({id:'core_cpi',name:'Core CPI · TEST FIXTURE',he:'מדד ליבה · נתוני בדיקה',unit:'% YoY',sa:'SA',frequency:'monthly',calendar:[],releases:[{id:'test',period:'2026-09-01',vintage:'2026-10-01',released_at:'2026-10-01T12:30:00Z',actual:2.6,prior:null,revised_prior:null,consensus:null,revisions:[],components:[]}]},{status:'current_vintage',points:Array.from({length:60},(_,i)=>({period:new Date(Date.UTC(2021,10+i,1)).toISOString().slice(0,10),value:2.6+Math.sin(i/8)}))}));
  assert.equal(await page.locator('#macroDetail svg').count(),1);
  assert.equal(await page.locator('#macroDetail .macro-column').count(),60);
  assert.ok(await page.locator('#macroDetail').evaluate(e=>e.innerHTML.indexOf('macro-chart')<e.innerHTML.indexOf('macroReleaseSelect')));
  await page.locator('#macroDetail svg').focus();await page.keyboard.press('End');assert.ok((await readout.innerText()).includes('% YoY'));
  await page.screenshot({path:`${out}/${width}-${lang}-cpi.png`});
  await page.locator('#macroDialogClose').click();assert.ok(await page.locator('#macroDialog').evaluate(e=>!e.open));
  await page.evaluate(()=>document.getElementById('macroDialog').showModal());
  await page.locator('#macroDetail svg').focus();await page.keyboard.press('Home');assert.ok((await readout.innerText()).includes('2021/11/01'));
  assert.deepEqual(errors,[]);console.log(`PASS ${width}px ${lang}: hover, keyboard, zero, precision, bounds${width<600?', touch':''}`);
  await context.close();
 }
}finally{await browser.close();}
