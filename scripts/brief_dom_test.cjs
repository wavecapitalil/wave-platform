/* Dependency-free renderer logic test. This is not a visual/browser substitute. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../apps/terminal/public');
// The archived edition is the fixed regression fixture; publishing tomorrow's
// content must not mutate this fixture or its known numeric expectations.
const fixturePath='briefs/2026-10-08/edition.json';
const fixtureBytes=fs.readFileSync(path.join(root,fixturePath));
const fixtureManifest={schemaVersion:1,date:'2026-10-08',path:fixturePath,revision:require('node:crypto').createHash('sha256').update(fixtureBytes).digest('hex')};
class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.style={};this.className='';this.events={};this._text='';this.clientWidth=800;this.isConnected=true;}
  set textContent(t){this._text=String(t);this.children=[];}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  appendChild(c){this.children.push(c);return c;}
  prepend(c){this.children.unshift(c);}
  replaceChildren(...c){this._text='';this.children=c;}
  setAttribute(k,v){this.attributes[k]=String(v);}
  getAttribute(k){return this.attributes[k];}
  addEventListener(k,fn){this.events[k]=fn;}
  getBoundingClientRect(){return {left:0,width:this.clientWidth};}
  get classList(){const self=this;return {add(c){self.className+=' '+c;},remove(c){self.className=self.className.split(/\s+/).filter(x=>x!==c).join(' ');}};}
  querySelectorAll(selector){const hit=e=>selector.startsWith('.')?e.className.split(/\s+/).includes(selector.slice(1)):e.tagName===selector;return this.children.flatMap(c=>[...(hit(c)?[c]:[]),...c.querySelectorAll(selector)]);}
}
const ids={};['briefArticle','briefDate','briefPageTitle','briefNavIcon','briefNavBadge','briefStatus'].forEach(x=>ids[x]=new Element('div'));
let records=[],frames=[],fail=false,revisionOverride=null,dataOverride=null;
const context={console,AbortController,setTimeout,clearTimeout,setInterval(){return 1;},clearInterval(){},requestAnimationFrame(fn){frames.push(fn);},ResizeObserver:class{observe(){}disconnect(){}},
 document:{hidden:false,createElement:t=>new Element(t),createElementNS:(ns,t)=>new Element(t),getElementById:id=>ids[id]},
 fetch:async url=>{if(fail)return {ok:false};let data=url.endsWith('latest.json')?{...fixtureManifest}:JSON.parse(fixtureBytes);if(url.endsWith('latest.json')&&revisionOverride)data.revision=revisionOverride;if(url.endsWith('edition.json')&&dataOverride)data=dataOverride;return {ok:true,json:async()=>data};},
 WaveSources:{record(...args){records.push(args);}},navigate(){}};
context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'terminal-brief.js'),'utf8'),context);
async function load(){await context.WaveBrief.reload();while(frames.length)frames.shift()();}
(async()=>{
  await load();const host=ids.briefArticle;
  assert.equal(host.querySelectorAll('.brief-story').length,9);
  assert.equal(host.querySelectorAll('.brief-interactive').length,12);
  assert.equal(host.querySelectorAll('svg').length,5);
  assert.equal(host.querySelectorAll('img').length,0);
  assert.equal(records[0][3].length,19);
  const svgs=host.querySelectorAll('svg');
  assert.equal(svgs[0].querySelectorAll('path').length,8);
  assert.ok((svgs[0].querySelectorAll('path')[0].getAttribute('d').match(/M/g)||[]).length>1,'FX weekend breaks remain gaps');
  for(const svg of svgs)for(const p of svg.querySelectorAll('path'))assert.ok(!/NaN|undefined|Infinity/.test(p.getAttribute('d')));
  assert.equal(svgs[2].querySelectorAll('rect').length,39,'13 PCE months, 3 components');
  for(const svg of svgs)for(const r of svg.querySelectorAll('rect'))assert.ok(Number(r.getAttribute('height'))>=0);
  const first=host.querySelectorAll('.brief-interactive')[0],rows=first.querySelectorAll('.brief-bar-row');rows[1].events.click();
  assert.ok(first.querySelectorAll('.brief-chart-detail')[0].textContent.includes('$89.84'));
  const fx=host.querySelectorAll('.brief-time-series')[0],slider=fx.querySelectorAll('input')[0];
  assert.equal(Number(slider.max),118);slider.value='0';slider.events.input();
  assert.ok(fx.querySelectorAll('.brief-chart-detail')[0].textContent.includes('01.10.2026 05:00 UTC'));
  slider.value='118';slider.events.input();assert.ok(fx.querySelectorAll('.brief-chart-detail')[0].textContent.includes('CHF: 0.66 %'));
  const copper=host.querySelectorAll('.brief-bar-row').find(x=>x.textContent.startsWith('Copper'));assert.equal(copper.querySelectorAll('.brief-bar').length,0);
  fail=true;await load();assert.equal(host.querySelectorAll('.brief-story').length,9);assert.ok(ids.briefStatus.textContent.includes('לא ניתן לבדוק'));fail=false;
  await load();assert.equal(ids.briefStatus.textContent,'');
  dataOverride=JSON.parse(fs.readFileSync(path.join(root,'briefs/2026-10-08/edition.json'),'utf8'));dataOverride.sections[0].title+=' · עדכון';revisionOverride='a'.repeat(64);
  await load();assert.ok(host.querySelectorAll('h1')[0].textContent.endsWith('עדכון'),'same-day edition revision reloads');
  assert.equal(host.querySelectorAll('.brief-story').length,9,'repeat loads do not duplicate article');
  assert.ok(!host.textContent.includes('PARTIAL EDITION'));context.WaveBrief.close();
  console.log('PASS: native rendering logic, 12 charts, exact date/value selection, FX gaps, PCE stacks, missing values, failed refresh preservation, same-day revision and no duplicate article.');
})().catch(e=>{console.error(e);process.exitCode=1;});
