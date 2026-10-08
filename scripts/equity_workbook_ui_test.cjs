// Lightweight DOM contract harness for exact UI/engine/data integration.
// This validates generated HTML and event logic; it is NOT a browser/layout test.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'../apps/terminal/public');
const dataPath=process.env.WAVE_VALUATION_SNAPSHOT||path.resolve(__dirname,'../fixtures/equity-valuation-history.json');
const snapshots=JSON.parse(fs.readFileSync(dataPath,'utf8'));
function app(options={}){
 const byId=new Map(),byAttr=new Map(),sourceRecords=new Map();
 class Element{
  constructor(attrs={}){this.attrs=attrs;this.id=attrs.id||'';this.dataset={};this.value=attrs.value||'';this.hidden=false;this.handlers={};this.textContent='';this.html='';for(const[k,v]of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;}
  set innerHTML(html){this.html=html;parse(html);}get innerHTML(){return this.html;}
  addEventListener(event,fn){this.handlers[event]=fn;}
  setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}
  closest(selector){const m=/^\[([^\]]+)\]$/.exec(selector);return m&&this.attrs[m[1]]!==undefined?this:null;}
  focus(){}select(){}scrollIntoView(){}
 }
 function parse(html){for(const tag of html.matchAll(/<[A-Za-z][^>]*>/g)){const a={};for(const x of tag[0].matchAll(/([\w-]+)="([^"]*)"/g))a[x[1]]=x[2];const e=new Element(a);if(a.id)byId.set(a.id,e);for(const[k,v]of Object.entries(a))if(k.startsWith('data-'))byAttr.set(k+'='+v,e);}}
 byId.set('valuationRoot',new Element({id:'valuationRoot'}));
 const document={readyState:'complete',getElementById:id=>byId.get(id)||null,querySelector:s=>{const m=/^\[([^=]+)="([^"]*)"\]$/.exec(s);return m?byAttr.get(m[1]+'='+m[2])||null:null;}};
 const c={document,location:{hash:''},getLang:()=> 'he',console,URL,AbortController,Date,Number,Map,Set,JSON,Promise,setTimeout:()=>1,clearTimeout:()=>{},WaveSources:{record:(...args)=>sourceRecords.set(args[0],args)},navigate:()=>{},WAVE_VALUATION_SNAPSHOTS:options.snapshots||snapshots};c.window=c;
 vm.createContext(c);for(const f of ['equity-workbook-model.js','terminal-valuation.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),c,{filename:f});c.WaveValuation.open();
 function input(key,year,value){const el=byId.get('vw-cell-'+key+'-'+year);el.value=String(value);byId.get('valuationRoot').handlers.input({target:el});}
 function click(attrs){byId.get('valuationRoot').handlers.click({target:new Element(attrs)});}
 function output(key,year){return byAttr.get('data-output='+key+'-'+year).html;}
 function reference(value,date){byId.get('vw-reference-price').value=String(value);byId.get('vw-reference-price').handlers.input({target:byId.get('vw-reference-price')});if(date!==undefined){byId.get('vw-reference-date').value=date;byId.get('vw-reference-date').handlers.input({target:byId.get('vw-reference-date')});}}
 return {c,byId,byAttr,input,click,output,reference,sourceRecords};
}
test('real worksheet opens Apple FY2021–25 with five forecast columns and sourced actuals',()=>{
 const a=app();assert.match(a.byId.get('vw-thead').html,/FY2021A/);assert.match(a.byId.get('vw-thead').html,/FY2025A/);assert.match(a.byId.get('vw-thead').html,/FY2030E/);
 assert.match(a.byId.get('vw-tbody').html,/365,817/);assert.match(a.byId.get('vw-tbody').html,/416,161/);assert.match(a.byId.get('vw-tbody').html,/133,050/);
 assert.equal(a.byId.get('vw-loaded').hidden,false);assert.match(a.byId.get('vw-summary-base').textContent,/\$/);assert.match(a.byId.get('vw-data-status').textContent,/SEC/);
});
test('year-one growth edits cascade to later revenue/price immediately',()=>{
 const a=app(),before=a.output('revenue',4),price=a.output('price',4);a.input('growth',0,30);assert.notEqual(a.output('revenue',4),before);assert.notEqual(a.output('price',4),price);assert.match(a.byId.get('vw-formula').html,/FY2026/);
});
test('year-two assumptions are independent and scenario edits do not bleed',()=>{
 const a=app(),first=a.output('revenue',0),bull=a.byId.get('vw-summary-bull').textContent;a.input('growth',1,1);assert.equal(a.output('revenue',0),first);assert.equal(a.byId.get('vw-summary-bull').textContent,bull);a.click({'data-scenario':'bull'});assert.notEqual(a.byId.get('vw-cell-growth-1').value,'1');
});
test('fill-forward copies chosen assumption only to later years in active scenario',()=>{
 const a=app();a.input('growth',2,3);a.click({'data-fill':'growth:2'});assert.equal(a.byId.get('vw-cell-growth-3').value,'3');assert.equal(a.byId.get('vw-cell-growth-4').value,'3');assert.notEqual(a.byId.get('vw-cell-growth-1').value,'3');
});
test('missing input blanks only dependent calculations, not unrelated operating rows',()=>{
 const a=app(),revenue=a.output('revenue',0);a.input('cash',0,'');assert.match(a.output('price',0),/—/);assert.equal(a.output('revenue',0),revenue);assert.doesNotMatch(a.output('price',1),/—/);
});
test('buyback and dilution edit forecast shares without acknowledgement blocks',()=>{
 const a=app(),old=a.output('shares',4);a.input('buyback',0,10);a.input('dilution',0,1);assert.notEqual(a.output('shares',4),old);assert.doesNotMatch(a.output('price',0),/—/);
});
test('Microsoft actual CP missing stays blank, explicit forecast zero and lease debt populate',()=>{
 const a=app();a.click({'data-company':'MSFT'});assert.match(a.byId.get('vw-thead').html,/FY2022A/);assert.match(a.byId.get('vw-thead').html,/FY2026A/);assert.match(a.byId.get('vw-tbody').html,/331,839/);assert.equal(a.byId.get('vw-cell-shortDebt-0').value,'0');assert.equal(a.byId.get('vw-cell-leases-0').value,'66594');assert.match(a.byId.get('vw-summary-base').textContent,/\$/);assert.match(a.byId.get('vw-debt-note').textContent,/הנחת 0/);
});
test('zero/negative operating margin removes price but not revenue or share forecasts',()=>{
 const a=app();a.input('margin',0,-5);assert.match(a.output('price',0),/—/);assert.doesNotMatch(a.output('revenue',0),/—/);assert.doesNotMatch(a.output('shares',0),/—/);assert.doesNotMatch(a.output('price',1),/—/);
});
test('repeated scenario switches retain edits and reset targets only active scenario',()=>{
 const a=app();a.input('multiple',0,33);a.click({'data-scenario':'bull'});a.input('multiple',0,44);a.click({'data-scenario':'base'});assert.equal(a.byId.get('vw-cell-multiple-0').value,'33');a.byId.get('vw-reset').handlers.click();assert.equal(a.byId.get('vw-cell-multiple-0').value,'18');a.click({'data-scenario':'bull'});assert.equal(a.byId.get('vw-cell-multiple-0').value,'44');
});
test('horizon change preserves existing assumptions while adding annual columns',()=>{
 const a=app();a.input('growth',0,13);a.byId.get('vw-horizon').handlers.change({target:{value:'10'}});assert.match(a.byId.get('vw-thead').html,/FY2035E/);assert.equal(a.byId.get('vw-cell-growth-0').value,'13');
});
test('touch toolbar fills selected assumption without tiny cell arrows',()=>{
 const a=app();a.input('margin',1,24);assert.equal(a.byId.get('vw-fill-selected').disabled,false);a.byId.get('vw-fill-selected').handlers.click();assert.equal(a.byId.get('vw-cell-margin-4').value,'24');assert.notEqual(a.byId.get('vw-cell-margin-0').value,'24');
});
test('switching scenario clears the touch fill selection',()=>{
 const a=app();a.input('growth',0,7);a.click({'data-scenario':'bear'});assert.equal(a.byId.get('vw-fill-selected').disabled,true);
});
test('Basic defaults to all three scenarios and the seven essential annual rows',()=>{
 const a=app(),html=a.byId.get('vw-tbody').html;assert.equal(a.byId.get('vw-advanced-toggle').attrs['aria-expanded'],'false');assert.equal(a.byId.get('vw-advanced-notes').hidden,true);
 for(const id of ['bull','base','bear'])assert.match(a.byId.get('vw-summary-'+id).textContent,/\$/);
 for(const key of ['revenue','growth','margin','ebit','shares','multiple','price'])assert.match(html,new RegExp('<tr data-row="'+key+'" data-detail="basic" class='));
 for(const key of ['buyback','dilution','cash','termDebt','claims','ev','equity'])assert.match(html,new RegExp('<tr data-row="'+key+'" data-detail="advanced" hidden'));
});
test('Advanced toggle reveals details without changing any scenario assumptions/results',()=>{
 const a=app(),prices=['bull','base','bear'].map(id=>a.byId.get('vw-summary-'+id).textContent);a.input('growth',0,9);const edited=a.byId.get('vw-summary-base').textContent;
 a.byId.get('vw-advanced-toggle').handlers.click();assert.equal(a.byId.get('vw-advanced-notes').hidden,false);assert.match(a.byId.get('vw-tbody').html,/<tr data-row="cash" data-detail="advanced" class=/);assert.equal(a.byId.get('vw-summary-base').textContent,edited);
 a.byId.get('vw-advanced-toggle').handlers.click();assert.equal(a.byId.get('vw-cell-growth-0').value,'9');assert.equal(a.byId.get('vw-summary-bull').textContent,prices[0]);assert.equal(a.byId.get('vw-summary-bear').textContent,prices[2]);
});
test('edit explanation uses exact before/after terminal prices and assumptions framing',()=>{
 const a=app(),before=a.byId.get('vw-summary-base').textContent;a.input('growth',0,20);const after=a.byId.get('vw-summary-base').textContent,text=a.byId.get('vw-change-sentence').textContent;
 assert.notEqual(before,after);assert.ok(text.includes(before)&&text.includes(after));assert.match(text,/לפי ההנחות/);assert.match(text,/FY2030/);assert.match(text,/צמיחת הכנסות/);
});
test('earlier margin edit does not falsely attribute a changed terminal price',()=>{
 const a=app(),before=a.byId.get('vw-summary-base').textContent,first=a.output('price',0);a.input('margin',0,60);assert.notEqual(a.output('price',0),first);assert.equal(a.byId.get('vw-summary-base').textContent,before);assert.match(a.byId.get('vw-change-sentence').textContent,/נשאר/);
});
test('multiple and share edits have accurate terminal explanations',()=>{
 const a=app();for(const[key,i,value] of [['multiple',4,25],['buyback',0,6]]){const before=a.byId.get('vw-summary-base').textContent;a.input(key,i,value);const after=a.byId.get('vw-summary-base').textContent;assert.notEqual(before,after);assert.ok(a.byId.get('vw-change-sentence').textContent.includes(before)&&a.byId.get('vw-change-sentence').textContent.includes(after));}
});
test('unavailable then restored and sub-cent price changes are described honestly',()=>{
 const a=app();a.input('growth',0,'');assert.match(a.byId.get('vw-change-sentence').textContent,/אינו זמין/);a.input('growth',0,6.43);assert.match(a.byId.get('vw-change-sentence').textContent,/זמין כעת/);a.input('multiple',4,18.000000001);assert.match(a.byId.get('vw-change-sentence').textContent,/בפחות מ־\$0\.01/);
});
test('scenario and horizon changes clear any stale edit attribution',()=>{
 const a=app();a.input('growth',0,20);a.click({'data-scenario':'bull'});assert.match(a.byId.get('vw-change-sentence').textContent,/הנחות הנוכחיות/);assert.doesNotMatch(a.byId.get('vw-change-sentence').textContent,/השתנה מ־/);a.byId.get('vw-horizon').handlers.change({target:{value:'3'}});assert.match(a.byId.get('vw-change-sentence').textContent,/FY2028/);
});
test('missing reference price/date never fabricates an upside',()=>{
 const a=app();for(const id of ['bull','base','bear'])assert.match(a.byId.get('vw-upside-'+id).textContent,/ללא מחיר/);a.reference(200);assert.match(a.byId.get('vw-upside-base').textContent,/ללא מחיר/);assert.match(a.byId.get('vw-reference-status').textContent,/תאריך/);
});
test('dated manual reference updates all comparisons, never modeled prices',()=>{
 const a=app(),before=['bull','base','bear'].map(id=>a.byId.get('vw-summary-'+id).textContent);a.reference(200,'2020-01-01');
 for(const [i,id] of ['bull','base','bear'].entries()){assert.equal(a.byId.get('vw-summary-'+id).textContent,before[i]);assert.match(a.byId.get('vw-upside-'+id).textContent,/%/);}
 assert.match(a.byId.get('vw-upside-base').textContent,/\+21%/);assert.match(a.byId.get('vw-reference-summary').textContent,/2020-01-01/);assert.match(a.byId.get('vw-reference-summary').textContent,/הזנה ידנית/);assert.match(a.byId.get('vw-change-sentence').textContent,/משנה רק את הפער/);
});
test('invalid amounts, impossible dates and future dates suppress comparisons',()=>{
 for(const [amount,date] of [[0,'2020-01-01'],[-1,'2020-01-01'],['Infinity','2020-01-01'],[200,'2020-02-30'],[200,'2999-01-01']]){const a=app();a.reference(amount,date);assert.match(a.byId.get('vw-upside-base').textContent,/ללא מחיר/);}
});
test('zero modeled price compares to -100% with valid reference',()=>{
 const a=app();a.reference(200,'2020-01-01');a.input('claims',4,1e9);assert.equal(a.byId.get('vw-summary-base').textContent,'$0');assert.match(a.byId.get('vw-upside-base').textContent,/-100%/);
});
test('company switch clears manual reference and date instead of leaking prior stock price',()=>{
 const a=app();a.reference(200,'2020-01-01');a.click({'data-company':'MSFT'});assert.equal(a.byId.get('vw-reference-price').value,'');assert.equal(a.byId.get('vw-reference-date').value,'');assert.match(a.byId.get('vw-upside-base').textContent,/ללא מחיר/);
});
test('provider price uses its own timestamp, and clearing it never restores it silently',()=>{
 const data=JSON.parse(JSON.stringify(snapshots)),asof=new Date(Date.now()-60000).toISOString();data.snapshots.AAPL.fields.current_price={status:'ok',value:250,unit:'USD/share',as_of:asof,source:'Verified test provider',url:'https://example.com/quote'};
 const a=app({snapshots:data});assert.equal(a.byId.get('vw-reference-price').value,250);assert.ok(a.byId.get('vw-reference-source').textContent.includes(asof));assert.match(a.byId.get('vw-upside-base').textContent,/%/);a.byId.get('vw-reference-clear').handlers.click();assert.equal(a.byId.get('vw-reference-price').value,'');assert.match(a.byId.get('vw-upside-base').textContent,/ללא מחיר/);
});
test('provider override requires manual date and cannot reuse snapshot retrieval date',()=>{
 const data=JSON.parse(JSON.stringify(snapshots));data.snapshots.AAPL.fields.current_price={status:'ok',value:250,unit:'USD/share',as_of:new Date(Date.now()-60000).toISOString(),source:'Test'};
 const a=app({snapshots:data});a.reference(200);assert.equal(a.byId.get('vw-reference-date').value,'');assert.match(a.byId.get('vw-upside-base').textContent,/ללא מחיר/);assert.match(a.byId.get('vw-reference-source').textContent,/הזנה ידנית/);
 data.snapshots.AAPL.fields.current_price.as_of=null;const b=app({snapshots:data});assert.equal(b.byId.get('vw-reference-price').value,'');
});
test('nonpositive terminal EBIT explanation does not invent missing inputs',()=>{
 const a=app();a.input('margin',4,-5);const sentence=a.byId.get('vw-change-sentence').textContent;assert.match(sentence,/אינו זמין לפי הנתונים האלה/);assert.doesNotMatch(sentence,/הנתונים החסרים/);
});
test('scenario/company/horizon/reset clear the stale advanced formula result',()=>{
 const a=app();function edit(){a.input('multiple',4,30);assert.match(a.byId.get('vw-formula').html,/\$/);}function prompt(){assert.match(a.byId.get('vw-formula').html,/בחרו תא תחזית/);assert.doesNotMatch(a.byId.get('vw-formula').html,/vw-formula-value/);}
 edit();a.click({'data-scenario':'bull'});prompt();edit();a.click({'data-company':'MSFT'});prompt();edit();a.byId.get('vw-reset').handlers.click();prompt();edit();a.byId.get('vw-horizon').handlers.change({target:{value:'3'}});prompt();
});
test('reference source/date and comparison formula are retained in methodology',()=>{
 const a=app();a.reference(200,'2020-01-01');const record=a.sourceRecords.get('valuation-reference:AAPL');assert.ok(record);assert.match(record[2],/200 USD\/share/);assert.match(record[2],/2020-01-01/);assert.match(record[2],/הזנה ידנית/);assert.match(record[2],/× 100/);a.byId.get('vw-reference-clear').handlers.click();assert.match(a.sourceRecords.get('valuation-reference:AAPL')[2],/חסר או אינו תקין/);
});
test('unavailable or unsupported data cannot silently seed a model from older history',()=>{
 for(const status of ['unavailable','unsupported']){const data=JSON.parse(JSON.stringify(snapshots));data.snapshots.AAPL.status=status;const a=app({snapshots:data});assert.equal(a.byId.get('vw-loaded').hidden,true);assert.equal(a.byId.get('vw-empty').hidden,false);}
});
test('latest history must match fiscal model base before forecast years are labeled',()=>{
 const data=JSON.parse(JSON.stringify(snapshots));data.snapshots.AAPL.fiscal_year_end='2026-09-26';const a=app({snapshots:data});assert.equal(a.byId.get('vw-loaded').hidden,true);assert.equal(a.byId.get('vw-empty').hidden,false);
});
test('stale cache warnings are recorded in the centralized source registry',()=>{
 const data=JSON.parse(JSON.stringify(snapshots));data.snapshots.AAPL.warnings.push({field:'cache',status:'missing',reason:'STALE_FIXTURE_WARNING'});const a=app({snapshots:data});assert.match(a.sourceRecords.get('valuation:AAPL')[2],/STALE_FIXTURE_WARNING/);
});
