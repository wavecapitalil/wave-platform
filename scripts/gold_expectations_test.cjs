/* Dependency-free DOM/contract test. Browser evidence is a separate check. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../apps/terminal/public');
class Element{
 constructor(t){this.tagName=t;this.children=[];this.attributes={};this.style={};this.className='';this.events={};this.dataset={};this._text='';}
 set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(x=>x.textContent).join(' ');}
 appendChild(e){this.children.push(e);return e;}replaceChildren(...c){this.children=c;this._text='';}setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k];}addEventListener(k,fn){this.events[k]=fn;}
 querySelectorAll(s){const hit=e=>s.startsWith('.')?e.className.split(/\s+/).includes(s.slice(1))||e.attributes.class===s.slice(1):e.tagName===s;return this.children.flatMap(e=>[...(hit(e)?[e]:[]),...e.querySelectorAll(s)]);}
}
const fixture={schemaVersion:1,rows:[{year:2020,publishedAt:'2020-05-18',questionRespondents:null,totalRespondents:null,sourceUrl:'https://example.com/2020',shares:{increase:20,unchanged:57,decrease:4,dontKnow:20},notOffered:[]},{year:2023,publishedAt:'2023-05-30',questionRespondents:null,totalRespondents:null,sourceUrl:'https://example.com/2023',shares:{increase:24,unchanged:72,decrease:3,dontKnow:null},notOffered:['dontKnow']},{year:2026,publishedAt:'2026-06-16',questionRespondents:null,totalRespondents:null,sourceUrl:'https://example.com/2026',shares:{increase:45,unchanged:null,decrease:1,dontKnow:null},notOffered:['dontKnow'],missingReason:'Primary share unverified.'}]};
const host=new Element('section');let fail=false,calls=0,records=[],lang='en',previousLanguageHookCalls=0;
const context={console,URL,getLang:()=>lang,onLangChange(){previousLanguageHookCalls++;},document:{getElementById:id=>id==='goldExpectationsPanel'?host:null,createElement:t=>new Element(t),createElementNS:(ns,t)=>new Element(t)},WaveSources:{record(...args){records.push(args);}},fetch:async()=>{calls++;return {ok:!fail,json:async()=>fixture};}};context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'terminal-gold-expectations.js'),'utf8'),context);
(async()=>{
 fail=true;await context.WaveGoldExpectations.load();assert.match(host.textContent,/could not be loaded/);assert.equal(host.querySelectorAll('button')[0].textContent,'Retry');
 fail=false;await Promise.all([context.WaveGoldExpectations.load(),context.WaveGoldExpectations.load()]);assert.equal(calls,2,'single in-flight request');
 assert.equal(host.querySelectorAll('svg').length,1);assert.match(host.textContent,/own institution/);assert.match(host.textContent,/2023 · “Don’t know” removed/);assert.match(host.textContent,/not scaled/);assert.match(host.textContent,/Not offered/);assert.match(host.textContent,/Not verified/);assert.ok(!host.textContent.includes('54%'));
 const groups=host.querySelectorAll('g');assert.equal(groups.length,3);
 for(const g of groups.slice(0,2)){assert.ok(Math.abs(g.querySelectorAll('rect').reduce((s,r)=>s+Number(r.getAttribute('height')),0)-200)<1e-6,'complete distributions exactly 100% visually');}
 assert.equal(groups[2].querySelectorAll('rect').reduce((s,r)=>s+Number(r.getAttribute('height')),0),92,'partial stack remains unscaled');
 assert.match(groups[0].textContent,/20%/);groups[0].events.click();assert.match(host.querySelectorAll('.gold-expectations-detail')[0].textContent,/Published total: 101%/);
 groups[1].events.keydown({key:'Enter',preventDefault(){}});assert.match(host.querySelectorAll('.gold-expectations-detail')[0].textContent,/2023/);
 await context.WaveGoldExpectations.load();assert.equal(host.querySelectorAll('svg').length,1,'no duplicate on navigation');assert.equal(calls,2);assert.match(host.querySelectorAll('.gold-expectations-detail')[0].textContent,/2023/);
 for(const r of host.querySelectorAll('rect'))assert.ok(Number.isFinite(Number(r.getAttribute('height')))&&Number(r.getAttribute('height'))>=0);
 assert.ok(records[0][3].length===3);assert.match(records[0][2],/OWN institution/);
 for(const modify of [x=>x.rows[0].shares.increase=NaN,x=>x.rows[0].sourceUrl='javascript:alert(1)',x=>x.rows.push(x.rows[0]),x=>x.rows[0].shares.increase=150,x=>x.rows[2].missingReason=null,x=>x.rows[0].notOffered=['increase'],x=>x.rows[0].notOffered=['bad']]){const bad=JSON.parse(JSON.stringify(fixture));modify(bad);assert.throws(()=>context.WaveGoldExpectations.validate(bad));}
 lang='he';context.onLangChange('he');assert.equal(host.dir,'rtl');assert.match(host.textContent,/ציפיות הבנקים המרכזיים לזהב/);assert.match(host.textContent,/הגדלה/);assert.match(host.textContent,/לא הוצע/);assert.equal(previousLanguageHookCalls,1);assert.match(records.at(-1)[1],/ציפיות/);lang='en';context.onLangChange('en');assert.equal(host.dir,'ltr');assert.match(host.textContent,/Central-bank gold expectations/);
 context.WaveGoldExpectations.render({schemaVersion:1,rows:[],statusText:'Awaiting verified data.'});assert.match(host.textContent,/Awaiting verified/);assert.equal(host.querySelectorAll('svg').length,0);
 if(process.env.GOLD_DATA_FILE){const real=JSON.parse(fs.readFileSync(process.env.GOLD_DATA_FILE));context.WaveGoldExpectations.render(real);assert.equal(host.querySelectorAll('g').length,real.rows.length);}
 console.log('PASS: own-question schema, source safety, raw percentages, display-only 100% scaling, option absence, partial values, keyboard/click selection, deduplicated loading, retry, repeat navigation, empty state.');
})().catch(e=>{console.error(e);process.exitCode=1;});
