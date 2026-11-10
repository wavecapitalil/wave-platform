const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('apps/terminal/public/terminal-price-history.js','utf8');
const ctx={window:{},Intl,Number,URL};vm.runInNewContext(source,ctx);
const format=ctx.window.WavePriceHistory.formatPrice;
test('major quote currency is formatted without changing value',()=>{assert.equal(format(2000,'GBP'),'£2,000.00');assert.equal(format(2000,'USD'),'$2,000.00');});
test('pence and other quote subunits never become 100-times-larger major currency values',()=>{assert.equal(format(2000,'GBp'),'2,000 GBp (pence)');assert.equal(format(2000,'GBX'),'2,000 GBX (pence)');assert.equal(format(2000,'ZAc'),'2,000 ZAc (cents)');assert.equal(format(2000,'ILA'),'2,000 ILA (agorot)');});
test('unknown currency is explicit and missing currency never defaults to USD',()=>{assert.equal(format(2000,'xyz'),'2,000 xyz');assert.equal(format(2000,null),'2,000');});
test('missing and invalid price are unavailable, never zero',()=>{for(const v of [null,undefined,NaN,Infinity,'20',false])assert.equal(format(v,'USD'),'—');});
test('price section is outside fundamentals success gates and its scripts are allowlisted',()=>{const html=fs.readFileSync('apps/terminal/public/terminal_app.html','utf8');const section=html.indexOf('<section id="resPriceHistory"');assert.ok(section>html.indexOf('id="researchResult"')&&section<html.indexOf('id="researchDetails"'));assert.ok(html.slice(html.indexOf('id="researchResult"'),section).trimEnd().endsWith('</div>'));const allow=fs.readFileSync('services/api/modules/frontend.py','utf8');for(const f of ['terminal-price-history.js','terminal-price-history.css'])assert.ok(allow.includes(f));});

test('fixed three-year daily chart removes selectors and initializes handlers only once',async()=>{
 const nodes={},requests=[],charts=[];
 function node(id){return nodes[id]||=( {id,hidden:false,attributes:{},listeners:{},textContent:'',
  setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,f){(this.listeners[k]||=[]).push(f);},
  querySelector(selector){return nodes[selector.slice(1)]||null;},
  set innerHTML(value){this.html=value;for(const m of value.matchAll(/id="([^"]+)"/g))node(m[1]);},
  get innerHTML(){return this.html||'';}
 });}
 const host=node('resPriceHistory');
 const fixture=symbol=>({symbol,range:'3y',currency:'USD',points:[1,2,3,4].map((n)=>({date:'2026-10-0'+n,open:n+99,high:n+102,low:n+98,close:n+100})),weekly_candles:[{date:'2026-10-01',close:999}],events:[],summary:{change_pct:3},meta:{}});
 const sandbox={window:{},document:{getElementById:id=>nodes[id]||null},Intl,Number,URL,AbortController,setTimeout,clearTimeout,API:'https://test.invalid',
  fetch:async url=>{requests.push(url);return {ok:true,json:async()=>fixture(new URL(url).searchParams.get('symbol'))};},
  Chart:function(canvas,config){this.config=config;this.destroy=()=>{};charts.push(this);}
 };
 vm.runInNewContext(source,sandbox);
 const api=sandbox.window.WavePriceHistory;
 api.reset('AAPL');api.reset('MSFT');await api.load('AAPL');await api.load('MSFT');
 assert.equal(host.listeners.click.length,1);assert.equal(host.listeners.change.length,1);
 assert.doesNotMatch(host.innerHTML,/ph-ranges|ph-interval|data-ph-range|data-ph-interval/);
 assert.ok(host.innerHTML.includes('ph-category'));
 assert.equal(requests.length,2);assert.ok(requests.every(u=>new URL(u).searchParams.get('range')==='3y'));
 assert.equal(charts.at(-1).config.data.datasets[0].data.length,4);
 assert.equal(nodes['ph-chart'].attributes['aria-label'],'MSFT daily price · 3 years');
 assert.equal(api.snapshot('MSFT').range,'3y');assert.equal(api.snapshot('AAPL'),null);
});
