/* Annual history + linked forecast workbook. Monetary values and shares in millions. */
(function(){
'use strict';
var he=typeof getLang==='function'&&getLang()==='he', ready=false, company=null, active='base', scenarios={}, horizon=5, requestId=0, controller=null, selectedCell=null, advanced=false, reference={price:null,date:"",source:"missing",sourceLabel:"",timestamp:null,url:null};
var ids=['bull','base','bear'];
function L(en,il){return he?il:en;}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function n(v){return WaveEquityWorkbook.numeric(v);}
function f(v,places){return n(v)===null?'—':Number(v).toLocaleString(he?'he-IL':'en-US',{maximumFractionDigits:places===undefined?1:places});}
function val(field){return field&&field.status==='ok'?n(field.value):null;}
function mil(field){var v=val(field);return v===null?null:v/1e6;}
function endYear(end){return end?Number(end.slice(0,4)):null;}
function money(v){return n(v)===null?'—':'$'+f(v,2);}
var names={bull:L('Bull','אופטימי'),base:L('Base · Neutral','בסיס · ניטרלי'),bear:L('Bear','פסימי')};
var fieldMap={revenue:'revenue',growth:'revenue_growth_pct',ebit:'operating_income',margin:'operating_margin_pct',shares:'shares_outstanding',buyback:'buyback_pct',dilution:'gross_dilution_pct',cash:'cash',termDebt:'reported_long_term_debt',shortDebt:'commercial_paper',leases:'finance_lease_liabilities',debt:'total_debt',multiple:'historical_ev_ebit'};
var rows=[
 {section:L('01  OPERATING PERFORMANCE','01  פעילות ורווחיות')},
 {key:'revenue',label:L('Revenue','הכנסות · Revenue'),unit:'USD M',kind:'result',bold:true},
 {key:'growth',label:L('Revenue growth · YoY','צמיחת הכנסות משנה לשנה'),unit:'%',input:true,min:-100,max:300,step:.1},
 {key:'margin',label:L('Operating margin','שיעור רווח תפעולי'),unit:'%',input:true,min:-100,max:100,step:.1},
 {key:'ebit',label:L('Operating profit · EBIT','רווח תפעולי · EBIT'),unit:'USD M',kind:'result',bold:true},
 {section:L('02  SHARE COUNT & CAPITAL ALLOCATION','02  מניות והקצאת הון')},
 {key:'shares',label:L('Year-end shares outstanding','מספר מניות בסוף השנה'),unit:L('M shares','מיליון'),kind:'result',bold:true},
 {key:'buyback',label:L('Reported share buyback rate','רכישה עצמית · אחוז מניות'),unit:'%',input:true,min:0,max:99.99,step:.1},
 {key:'buybackShares',label:L('Shares repurchased','מניות שנרכשו בחזרה'),unit:L('M shares','מיליון'),sub:true},
 {key:'dilution',label:L('Gross share dilution','דילול מניות גולמי'),unit:'%',input:true,min:0,max:100,step:.1},
 {key:'dilutionShares',label:L('Additional diluted shares','תוספת מניות מדילול'),unit:L('M shares','מיליון'),sub:true},
 {key:'shareChangePct',label:L('Net change in shares','שינוי נטו במספר המניות'),unit:'%',sub:true},
 {section:L('03  YEAR-END BALANCE SHEET','03  מאזן בסוף השנה')},
 {key:'cash',label:L('Cash & equivalents','מזומנים ושווי מזומנים'),unit:'USD M',input:true,min:0,max:1e12,step:1},
 {key:'termDebt',label:L('Term debt · all maturities¹','חוב לזמן ארוך · כולל חלויות שוטפות¹'),unit:'USD M',input:true,min:0,max:1e12,step:1},
 {key:'shortDebt',label:L('Commercial paper¹','ניירות מסחר · Commercial paper¹'),unit:'USD M',input:true,min:0,max:1e12,step:1},
 {key:'leases',label:L('Finance lease liabilities¹','התחייבויות חכירה מימונית¹'),unit:'USD M',input:true,min:0,max:1e12,step:1},
 {key:'debt',label:L('Sum of modeled debt components¹','סכום רכיבי החוב במודל¹'),unit:'USD M',kind:'result'},
 {key:'claims',label:L('Other non-common claims¹','זכויות אחרות שאינן מניות רגילות¹'),unit:'USD M',input:true,min:0,max:1e12,step:1},
 {section:L('04  VALUATION AT EACH YEAR END','04  שווי בכל סוף שנה')},
 {key:'multiple',label:L('Valuation multiple · EV / EBIT','מכפיל שווי · EV / EBIT'),unit:'×',input:true,min:0,max:100,step:.5},
 {key:'ev',label:L('Enterprise value','שווי פעילות · EV'),unit:'USD M',kind:'result'},
 {key:'equity',label:L('Common equity value','שווי הון למניות רגילות'),unit:'USD M',kind:'result'},
 {key:'price',label:L('Implied price per share','מחיר מניה משתמע'),unit:'USD',kind:'price',bold:true}
];
rows.forEach(function(row){row.basic=['revenue','growth','margin','ebit','shares','multiple','price'].includes(row.key);});
function safeLink(url){try{var u=new URL(url);return u.protocol==='https:'?u.href:null;}catch(e){return null;}}
function history(){return (company&&company.history||[]).slice().sort(function(a,b){return a.period_end.localeCompare(b.period_end);}).slice(-5);}
function last(){var h=history();return h[h.length-1];}
function histField(y,key){if(key==='buybackShares')return y.repurchased_shares;
 if(key==='debt')return y.total_debt;
 return y[fieldMap[key]];
}
function histValue(y,key,index){
 var h=history();
 if(key==='shareChangePct'){var current=mil(y.shares_outstanding),prev=index>0?mil(h[index-1].shares_outstanding):null;return current!==null&&prev>0?(current/prev-1)*100:null;}
 if(key==='debt'){var components=['reported_long_term_debt','commercial_paper','finance_lease_liabilities'].map(function(k){return mil(y[k]);});return components.every(function(v){return v!==null;})?components.reduce(function(a,b){return a+b;},0):null;}
 var field=histField(y,key),v=val(field);return v!==null&&['USD','shares'].includes(field.unit)?v/1e6:v;
}
function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;var stamp=Date.parse(value+'T12:00:00Z');return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value;}
function referencePrice(){var price=n(reference.price);if(price===null||price<=0||price>1e9||!validDate(reference.date))return null;if(reference.source!=='provider'&&reference.date>today())return null;return price;}
function resetReference(field){
 reference={price:null,date:'',source:'missing',sourceLabel:'',timestamp:null,url:null};
 var price=val(field),stamp=field&&typeof field.as_of==='string'?Date.parse(field.as_of):NaN;
 if(price!==null&&price>0&&price<=1e9&&field.unit==='USD/share'&&Number.isFinite(stamp)&&stamp<=Date.now()+300000){reference={price:price,date:new Date(stamp).toISOString().slice(0,10),source:'provider',sourceLabel:field.source||L('Market-data provider','ספק נתוני שוק'),timestamp:new Date(stamp).toISOString(),url:safeLink(field.url)};}
 document.getElementById('vw-reference-price').value=reference.price===null?'':reference.price;
 document.getElementById('vw-reference-date').value=reference.date;
 renderReference();
}
function renderReference(){
 var valid=referencePrice(),hasAmount=n(reference.price)!==null,date=reference.date;
 document.getElementById('vw-reference-summary').textContent=valid===null?L('Reference market price · enter a price and date','מחיר שוק להשוואה · הזינו מחיר ותאריך'):L('Reference: ','מחיר להשוואה: ')+money(valid)+' · '+date+' · '+(reference.source==='manual'?L('User-entered','הזנה ידנית'):reference.sourceLabel);
 document.getElementById('vw-reference-source').textContent=reference.source==='provider'?reference.sourceLabel+' · '+reference.timestamp:reference.source==='manual'?L('User-entered · not independently verified','הזנה ידנית · לא אומת באופן עצמאי'):L('No verified market quote loaded','לא נטען מחיר שוק מאומת');
 var status='';
 if(hasAmount&&(n(reference.price)<=0||n(reference.price)>1e9))status=L('Enter a positive USD/share price.','יש להזין מחיר חיובי בדולר למניה.');
 else if(hasAmount&&(!validDate(date)||date>today())&&reference.source!=='provider')status=L('Add the actual price date, no later than today, to show the comparison.','הוסיפו את תאריך המחיר, שאינו מאוחר מהיום, כדי להציג את ההשוואה.');
 else if(valid!==null)status=L('Difference versus this dated reference; not an annualized return.','הפער הוא מול המחיר מתאריך זה; אינו תשואה שנתית.');
 document.getElementById('vw-reference-status').textContent=status;
 document.getElementById('vw-reference-price').setAttribute('aria-invalid',String(hasAmount&&(n(reference.price)<=0||n(reference.price)>1e9)));
 document.getElementById('vw-reference-date').setAttribute('aria-invalid',String(hasAmount&&valid===null));
 if(window.WaveSources&&company)WaveSources.record('valuation-reference:'+company.symbol,company.symbol+' · '+L('Reference-price comparison','השוואה למחיר ייחוס'),L('Reference price: ','מחיר להשוואה: ')+(valid===null?L('unavailable or not eligible for comparison','חסר או אינו תקין להשוואה'):valid+' USD/share')+'\n'+L('Price date: ','תאריך המחיר: ')+(reference.date||L('unknown','לא ידוע'))+'\n'+L('Source: ','מקור: ')+(reference.source==='manual'?L('User-entered; not independently verified','הזנה ידנית; לא אומת באופן עצמאי'):reference.sourceLabel||L('No quote loaded','לא נטען מחיר'))+(reference.timestamp?'\n'+reference.timestamp:'')+'\n'+L('Difference = (scenario terminal price / reference price − 1) × 100. The reference does not change model prices; not an annualized return.','הפער = (מחיר התרחיש בסוף התחזית / המחיר להשוואה − 1) × 100. מחיר ההשוואה אינו משנה את מחירי המודל; אין זו תשואה שנתית.'),reference.url?[{title:reference.sourceLabel,url:reference.url}]:[]);
}
function editReference(e){
 if(reference.source==='provider'&&e.target.id==='vw-reference-price')document.getElementById('vw-reference-date').value='';
 reference={price:n(document.getElementById('vw-reference-price').value),date:document.getElementById('vw-reference-date').value,source:'manual',sourceLabel:L('User-entered','הזנה ידנית'),timestamp:null,url:null};
 renderReference();if(company){updateResults();var r=calculate(active).forecast.at(-1);document.getElementById('vw-change-sentence').textContent=L('The reference-price edit changes the comparison only; the assumption-based model price remains ','מחיר ההשוואה משנה רק את הפער מולו; מחיר המודל לפי ההנחות נשאר ')+money(r&&r.price)+'.';}
}
function defaultSentence(){
 if(!company)return;var terminal=calculate(active).forecast.at(-1),year=endYear(company.fiscal_year_end)+horizon;
 document.getElementById('vw-change-sentence').textContent=names[active]+' · '+L('Under the current assumptions, FY','לפי ההנחות הנוכחיות, מחיר FY')+year+(he?' הוא ':' modeled price is ')+money(terminal&&terminal.price)+'.';
}
function editSentence(key,index,previous,value,before,after,filled){
 var a=before.forecast.at(-1),b=after.forecast.at(-1),oldPrice=a?a.price:null,newPrice=b?b.price:null,year=endYear(company.fiscal_year_end)+horizon,editedYear=endYear(company.fiscal_year_end)+index+1;
 var label=(rows.find(function(r){return r.key===key;})||{}).label||key;
 var prefix=names[active]+' · '+L('Under these assumptions, ','לפי ההנחות, ')+(filled?L('filling later years','מילוי השנים הבאות'):label+' FY'+editedYear)+' — ';
 var message;
 if(newPrice===null)message=L('the FY','מחיר FY')+year+L(' modeled price is unavailable with these inputs.',' אינו זמין לפי הנתונים האלה.');
 else if(oldPrice===null)message=L('FY','מחיר FY')+year+L(' modeled price is now ',' זמין כעת: ')+money(newPrice)+'.';
 else if(oldPrice===newPrice)message=L('FY','מחיר FY')+year+L(' modeled price remains ',' נשאר ')+money(newPrice)+'.';
 else if(money(oldPrice)===money(newPrice))message=L('FY','מחיר FY')+year+L(' modeled price changed by less than $0.01.',' השתנה בפחות מ־$0.01.');
 else message=L('FY','מחיר FY')+year+L(' modeled price changed from ',' השתנה מ־')+money(oldPrice)+L(' to ',' ל־')+money(newPrice)+'.';
 document.getElementById('vw-change-sentence').textContent=prefix+message;
}

function buildScenarios(){
 var h=history(), latest=last();if(!latest)return;
 var g=histValue(latest,'growth',h.length-1),m=histValue(latest,'margin',h.length-1),b=histValue(latest,'buyback',h.length-1);
 var c=histValue(latest,'cash',h.length-1),term=histValue(latest,'termDebt',h.length-1),short=histValue(latest,'shortDebt',h.length-1),leases=histValue(latest,'leases',h.length-1);
 g=g===null?5:Math.max(-20,Math.min(40,g));m=m===null?20:m;b=b===null?0:Math.min(10,b);
 ids.forEach(function(id){scenarios[id]=Array.from({length:10},function(){return {growth:round(g+(id==='bull'?4:id==='bear'?-6:0)),margin:round(Math.max(-100,Math.min(100,m+(id==='bull'?3:id==='bear'?-5:0)))),buyback:round(id==='bear'?0:b+(id==='bull'?.5:0)),dilution:id==='bear'?1:.5,multiple:id==='bull'?22:id==='bear'?14:18,cash:c===null?null:round(c),termDebt:term===null?null:round(term),shortDebt:short===null?0:round(short),leases:leases===null?null:round(leases),claims:0,capitalConfirmed:true};});});
}
function round(v){return Math.round(v*100)/100;}
function base(){var y=last();return {revenue:y?mil(y.revenue):null,shares:y?mil(y.shares_outstanding):null,price:referencePrice()};}
function calculate(id){return WaveEquityWorkbook.calculate(base(),(scenarios[id]||[]).slice(0,horizon).map(function(a){var pieces=[a.termDebt,a.shortDebt,a.leases].map(n),ok=pieces.every(function(v){return v!==null&&v>=0&&v<=1e12;});return Object.assign({},a,{debt:ok?pieces.reduce(function(x,y){return x+y;},0):null});}));}
function init(){
 var host=document.getElementById('valuationRoot');if(!host)return;
 host.innerHTML='<div class="vw-hero"><div><div class="vw-eyebrow">EQUITIES / VALUATION WORKBOOK</div><h1>'+L('From financial history to your forecast','מהנתונים ההיסטוריים לתחזית שלכם')+'</h1></div><span class="vw-mode-badge" id="vw-mode-badge">'+L('Basic · all 3 scenarios','בסיסי · כל 3 התרחישים')+'</span><a class="vw-jump-table" data-jump="table" href="#vw-table-panel">'+L('Go to table ↓','מעבר לטבלה ↓')+'</a></div>'+
 '<div class="vw-toolbar"><form id="vw-company-form"><label for="vw-symbol">'+L('Company','חברה')+'</label><input id="vw-symbol" type="text" value="AAPL" placeholder="AAPL" dir="ltr" maxlength="15" autocomplete="off"><button class="vw-button" type="submit" id="vw-load">'+L('Load history','טעינת היסטוריה')+'</button></form><div class="vw-company-shortcuts"><button class="vw-quick" data-company="AAPL">Apple · AAPL</button><button class="vw-quick" data-company="MSFT">Microsoft · MSFT</button></div><label class="vw-horizon-label" for="vw-horizon">'+L('Forecast years','שנות תחזית')+' <select id="vw-horizon">'+[1,2,3,4,5,6,7,8,9,10].map(function(v){return '<option value="'+v+'"'+(v===5?' selected':'')+'>'+v+'</option>';}).join('')+'</select></label></div><div id="vw-data-status" class="vw-status" role="status"></div>'+
 '<div id="vw-loaded" hidden><div class="vw-company-header"><div><span id="vw-company-symbol" class="vw-symbol"></span><h2 id="vw-company-name"></h2><span id="vw-periods" class="vw-periods"></span></div><span class="vw-unit-pill">'+L('USD millions · shares in millions','מיליוני דולר · מניות במיליונים')+'</span></div><div class="vw-scenarios" role="tablist" aria-label="'+L('Scenario','תרחיש')+'">'+ids.map(function(id){return '<button type="button" role="tab" aria-controls="vw-table-panel" aria-selected="'+(active===id)+'" id="vw-tab-'+id+'" class="vw-scenario vw-'+id+'" data-scenario="'+id+'"><span class="vw-case">'+id.toUpperCase()+'</span><span class="vw-case-title">'+names[id]+'</span><strong id="vw-summary-'+id+'">—</strong><span class="vw-case-sub" id="vw-summary-sub-'+id+'"></span><span class="vw-upside" id="vw-upside-'+id+'"></span></button>';}).join('')+'</div>'+
 '<div class="vw-change-sentence" id="vw-change-sentence" role="status" aria-live="polite"></div>'+
 '<details class="vw-reference" id="vw-reference"><summary id="vw-reference-summary">'+L('Market-price comparison · enter a dated price','השוואה למחיר שוק · הזינו מחיר ותאריך')+'</summary><div class="vw-reference-fields"><label for="vw-reference-price">'+L('Reference price · USD','מחיר להשוואה · דולר')+'<input id="vw-reference-price" type="number" min="0.000001" max="1000000000" step="any" inputmode="decimal" placeholder="—" dir="ltr"></label><label for="vw-reference-date">'+L('Price date','תאריך המחיר')+'<input id="vw-reference-date" type="date" max="'+today()+'"></label><span id="vw-reference-source" class="vw-reference-source"></span><button type="button" class="vw-text-button" id="vw-reference-clear">'+L('Clear','ניקוי')+'</button></div><div id="vw-reference-status" class="vw-reference-status" role="status"></div></details>'+
 '<div class="vw-mode-control"><span id="vw-basic-guide">'+L('Edit the gold cells, year by year.','ערכו את התאים המוזהבים בכל שנה.')+'</span><button type="button" class="vw-advanced-toggle" id="vw-advanced-toggle" aria-expanded="false" aria-controls="vw-tbody vw-advanced-notes">'+L('Advanced · more assumptions','מתקדם · הנחות נוספות')+' ⌄</button></div>'+
 '<div class="vw-sheet-toolbar"><div class="vw-legend"><span><i class="vw-actual-dot"></i>'+L('Reported actuals','נתוני עבר מדווחים')+'</span><span><i class="vw-input-dot"></i>'+L('Editable assumptions','הנחות ניתנות לעריכה')+'</span><span><i class="vw-calc-dot"></i>'+L('Calculated results','תוצאות מחושבות')+'</span></div><div class="vw-sheet-actions"><button id="vw-view-history" class="vw-text-button">'+L('History','היסטוריה')+'</button><button id="vw-view-forecast" class="vw-text-button">'+L('Forecast →','לתחזית ←')+'</button><button id="vw-fill-selected" class="vw-text-button" disabled>'+L('Fill next years','מילוי לשנים הבאות')+'</button><button id="vw-reset" class="vw-text-button">'+L('Reset this scenario','איפוס התרחיש')+'</button></div></div>'+
 '<div class="vw-sheet-scroll" id="vw-table-panel" role="tabpanel" tabindex="0" aria-label="'+L('Historical and forecast annual valuation worksheet. Scroll sideways for more years.','גיליון הערכת שווי לפי שנים. גללו הצדה לצפייה בשנים נוספות.')+'"><table class="vw-sheet" id="vw-sheet"><caption class="vw-sr">'+L('Annual historical results followed by editable annual forecast assumptions','תוצאות היסטוריות שנתיות ולאחריהן הנחות תחזית שנתיות ניתנות לעריכה')+'</caption><thead id="vw-thead"></thead><tbody id="vw-tbody"></tbody></table></div>'+
 '<div id="vw-advanced-notes" hidden><button class="vw-button vw-ghost" id="vw-method">'+L('Sources & formulas','מקורות ונוסחאות')+' ↗</button><div class="vw-formula-bar" id="vw-formula" role="status"><b>ƒx</b><span>'+L('Choose any forecast cell to see how it flows through the model.','בחרו תא תחזית כדי לראות כיצד הוא משפיע על המודל.')+'</span></div><div class="vw-assumption-note"><b>'+L('Forecast balance-sheet assumptions','הנחות המאזן בתחזית')+'</b><span>'+L('Each year’s cash and debt are AFTER buybacks, issuance, cash flows and financing. Initial values are held flat from the last reported balance; change them for your plan. The model does not fund buybacks automatically.','המזומנים והחוב בכל שנה הם לאחר רכישות עצמיות, הנפקות, תזרים ומימון. ערכי הפתיחה נשמרים קבועים מהמאזן המדווח האחרון; שנו אותם בהתאם לתחזית שלכם. המודל אינו מממן רכישות עצמיות אוטומטית.')+'</span></div><div class="vw-footnote" id="vw-debt-note"></div><div class="vw-footnote">'+L('A dash means unavailable, not zero. Forecast defaults are illustrative assumptions, not analyst estimates. Future scenario prices are not discounted to today.','קו מפריד מציין מידע חסר, ולא אפס. ברירות המחדל בתחזית הן הנחות להמחשה, ולא תחזיות אנליסטים. מחירי התרחיש העתידיים אינם מהוונים להיום.')+'</div></div><div class="vw-basic-assumptions" id="vw-basic-assumptions">'+L('Scenario estimates use all assumptions, including those in Advanced.','מחירי התרחיש מחושבים מכל ההנחות, כולל אלה שבמתקדם.')+'</div><div id="vw-errors" class="vw-errors" role="status"></div></div>'+
 '<div id="vw-empty" class="vw-empty">'+L('Load a company to compare its annual financial history with your forecast.','טענו חברה כדי להשוות את ההיסטוריה הפיננסית השנתית שלה לתחזית שלכם.')+'</div>';
 host.addEventListener('click',function(e){var jump=e.target.closest('[data-jump]');if(jump){e.preventDefault();document.getElementById('vw-table-panel').scrollIntoView({behavior:'smooth',block:'start'});return;}var s=e.target.closest('[data-scenario]');if(s){active=s.dataset.scenario;renderSheet();return;}var c=e.target.closest('[data-company]');if(c){document.getElementById('vw-symbol').value=c.dataset.company;loadCompany(c.dataset.company);return;}var fill=e.target.closest('[data-fill]');if(fill){fillRight(fill.dataset.fill);return;}});
 host.addEventListener('input',editCell);
 host.addEventListener('focusin',function(e){if(e.target.dataset.input)showFormula(e.target.dataset.input,Number(e.target.dataset.year));});
 host.addEventListener('keydown',keyboardCell);
 document.getElementById('vw-advanced-toggle').addEventListener('click',function(){advanced=!advanced;if(company)renderSheet();});
 ['vw-reference-price','vw-reference-date'].forEach(function(id){document.getElementById(id).addEventListener('input',editReference);document.getElementById(id).addEventListener('change',editReference);});
 document.getElementById('vw-reference-clear').addEventListener('click',function(){resetReference(null);updateResults();defaultSentence();});
 document.getElementById('vw-company-form').addEventListener('submit',function(e){e.preventDefault();loadCompany(document.getElementById('vw-symbol').value);});
 document.getElementById('vw-horizon').addEventListener('change',function(e){horizon=Number(e.target.value);if(company)renderSheet();});
 document.getElementById('vw-fill-selected').addEventListener('click',function(){if(selectedCell)fillRight(selectedCell.key+':'+selectedCell.index);});
 document.getElementById('vw-reset').addEventListener('click',function(){var old=Object.assign({},scenarios), which=active;buildScenarios();ids.forEach(function(id){if(id!==which)scenarios[id]=old[id];});renderSheet();});
 document.getElementById('vw-method').addEventListener('click',function(){navigate('sources');});
 document.getElementById('vw-view-forecast').addEventListener('click',function(){var el=document.querySelector('[data-column="forecast-0"]');if(el)el.scrollIntoView({behavior:'smooth',block:'nearest',inline:'end'});});
 document.getElementById('vw-view-history').addEventListener('click',function(){var el=document.querySelector('[data-column="history-0"]');if(el)el.scrollIntoView({behavior:'smooth',block:'nearest',inline:'end'});});
 registerMethod();loadCompany('AAPL');
}
function renderSheet(){
 selectedCell=null;document.getElementById('vw-fill-selected').disabled=true;
 document.getElementById('vw-formula').innerHTML='<b>ƒx</b><span>'+L('Choose any forecast cell to see how it flows through the model.','בחרו תא תחזית כדי לראות כיצד הוא משפיע על המודל.')+'</span>';
 document.getElementById('vw-advanced-toggle').setAttribute('aria-expanded',String(advanced));
 document.getElementById('vw-advanced-toggle').textContent=advanced?L('Hide Advanced','הסתרת מתקדם')+' ⌃':L('Advanced · more assumptions','מתקדם · הנחות נוספות')+' ⌄';
 document.getElementById('vw-mode-badge').textContent=advanced?L('Advanced · all 3 scenarios','מתקדם · כל 3 התרחישים'):L('Basic · all 3 scenarios','בסיסי · כל 3 התרחישים');
 document.getElementById('vw-advanced-notes').hidden=!advanced;
 document.getElementById('vw-basic-assumptions').hidden=advanced;
 var hs=history(),y0=endYear(company.fiscal_year_end||last().period_end),forecast=calculate(active).forecast;
 document.getElementById('vw-loaded').hidden=false;document.getElementById('vw-empty').hidden=true;
 document.getElementById('vw-company-symbol').textContent=company.symbol;
 document.getElementById('vw-company-name').textContent=company.name;
 document.getElementById('vw-periods').textContent=L('Reported FY ','נתוני עבר FY ')+endYear(hs[0].period_end)+'–'+y0+' · '+L('Forecast FY ','תחזית FY ')+(y0+1)+'–'+(y0+horizon);
 ids.forEach(function(id){document.getElementById('vw-tab-'+id).setAttribute('aria-selected',String(id===active));});
 document.getElementById('vw-table-panel').setAttribute('aria-labelledby','vw-tab-'+active);
 document.getElementById('vw-thead').innerHTML='<tr class="vw-period-band"><th class="vw-metric-cell">'+L('Financial model','מודל פיננסי')+'</th><th colspan="'+hs.length+'" class="vw-hist-band">'+L('HISTORICAL ACTUALS','נתוני עבר בפועל')+'</th><th colspan="'+horizon+'" class="vw-forecast-band">'+names[active]+' · '+L('YOUR FORECAST','התחזית שלכם')+'</th></tr><tr><th class="vw-metric-cell vw-row-label">'+L('Metric / fiscal year','נתון / שנת כספים')+'</th>'+hs.map(function(y,i){return '<th class="vw-hist-head" data-column="history-'+i+'"><b dir="ltr">FY'+endYear(y.period_end)+'A</b><small dir="ltr">'+esc(y.period_end)+'</small></th>';}).join('')+forecast.map(function(y,i){return '<th class="vw-future-head" data-column="forecast-'+i+'"><b dir="ltr">FY'+(y0+i+1)+'E</b><small>'+L('Year ','שנה ')+(i+1)+'</small></th>';}).join('')+'</tr>';
 document.getElementById('vw-tbody').innerHTML=rows.map(function(row){if(row.section)return '<tr class="vw-section" data-detail="advanced"'+(advanced?'':' hidden')+'><th class="vw-metric-cell">'+row.section+'</th><td colspan="'+(hs.length+horizon)+'"></td></tr>';
 return '<tr data-row="'+row.key+'" data-detail="'+(row.basic?'basic':'advanced')+'"'+(!row.basic&&!advanced?' hidden':'')+' class="'+(row.bold?'vw-bold ':'')+(row.kind==='price'?'vw-price-row ':'')+(row.sub?'vw-sub-row':'')+'"><th class="vw-metric-cell"><span>'+row.label+'</span><small>'+row.unit+'</small></th>'+hs.map(function(y,i){var field=histField(y,row.key),v=histValue(y,row.key,i),title=field?[(field.source||''),field.period_start||'',field.period_end||'',field.reason||''].filter(Boolean).join(' · '):L('Not available on a comparable historical basis','לא זמין על בסיס היסטורי תואם');return '<td class="vw-actual" title="'+esc(title)+'" data-actual="'+row.key+'-'+i+'"><span dir="ltr">'+f(v,row.key==='price'?2:1)+'</span></td>';}).join('')+forecast.map(function(y,i){if(row.input){var v=scenarios[active][i][row.key];return '<td class="vw-editable" data-forecast="'+row.key+'-'+i+'"><label class="vw-sr" for="vw-cell-'+row.key+'-'+i+'">'+row.label+' · FY'+(y0+i+1)+' · '+names[active]+'</label><input id="vw-cell-'+row.key+'-'+i+'" type="number" inputmode="decimal" data-input="'+row.key+'" data-year="'+i+'" value="'+(v===null?'':esc(v))+'" min="'+row.min+'" max="'+row.max+'" step="'+row.step+'" dir="ltr" placeholder="—" autocomplete="off" aria-describedby="vw-formula"><button type="button" class="vw-fill" data-fill="'+row.key+':'+i+'" aria-label="'+esc(L('Copy this assumption to following years: ','העתקת ההנחה לשנים הבאות: ')+row.label)+'" title="'+L('Fill following years','מילוי בשנים הבאות')+'">›</button></td>';}
 return '<td class="vw-computed" data-output="'+row.key+'-'+i+'"><span dir="ltr">'+f(y[row.key],row.key==='price'?2:1)+'</span></td>';}).join('')+'</tr>';}).join('');
 var debt=histField(last(),'debt');
 document.getElementById('vw-debt-note').textContent='¹ '+(last().total_debt&&val(last().total_debt)!==null?L('Debt includes identified finance-lease obligations.','החוב כולל התחייבויות חכירה מימונית מזוהות.'):L('Debt is shown as explicit components, not a verified comprehensive total. Historical blanks stay blank. If no recent commercial-paper figure is reported, its forecast begins at an editable 0 assumption. Add any other debt, preferred equity and minority interests in other claims. Zero other claims is also an assumption.','החוב מוצג כרכיבים מפורשים, ולא כסך חוב מקיף מאומת. נתון היסטורי חסר נשאר ריק. כשלא מדווח נתון עדכני של ניירות מסחר, התחזית שלו מתחילה בהנחת 0 הניתנת לעריכה. יש להוסיף חוב אחר, הון בכורה וזכויות מיעוט בזכויות האחרות. גם אפס בזכויות אחרות הוא הנחה.'));
 updateResults();defaultSentence();
}
function editCell(e){var key=e.target.dataset.input;if(!key)return;var i=Number(e.target.dataset.year),before=calculate(active),previous=scenarios[active][i][key];scenarios[active][i][key]=n(e.target.value);updateResults();showFormula(key,i);editSentence(key,i,previous,scenarios[active][i][key],before,calculate(active));}
function fillRight(code){var p=code.split(':'),i=Number(p[1]),value=scenarios[active][i][p[0]],before=calculate(active);for(var j=i+1;j<horizon;j++)scenarios[active][j][p[0]]=value;renderSheet();showFormula(p[0],i);editSentence(p[0],horizon-1,null,value,before,calculate(active),true);}
function keyboardCell(e){if(!e.target.dataset.input)return;var key=e.target.dataset.input,index=Number(e.target.dataset.year),inputs=rows.filter(function(r){return r.input&&(advanced||r.basic);}).map(function(r){return r.key;}),row=inputs.indexOf(key),next=null;
 if(e.key==='Enter')next=document.getElementById('vw-cell-'+inputs[Math.min(inputs.length-1,row+1)]+'-'+index);
 if(e.altKey&&e.key==='ArrowRight')next=document.getElementById('vw-cell-'+key+'-'+(index+1));
 if(e.altKey&&e.key==='ArrowLeft')next=document.getElementById('vw-cell-'+key+'-'+(index-1));
 if(next){e.preventDefault();next.focus();next.select();}}
function updateResults(){
 var result=calculate(active),fs=result.forecast,y0=endYear(company.fiscal_year_end);
 fs.forEach(function(y,i){rows.filter(function(r){return !r.section&&!r.input;}).forEach(function(r){var cell=document.querySelector('[data-output="'+r.key+'-'+i+'"]');if(cell)cell.innerHTML='<span dir="ltr">'+f(y[r.key],r.key==='price'?2:1)+'</span>';});rows.filter(function(r){return r.input;}).forEach(function(r){var inp=document.getElementById('vw-cell-'+r.key+'-'+i);if(inp)inp.setAttribute('aria-invalid',String(['termDebt','shortDebt','leases'].includes(r.key)?(n(scenarios[active][i][r.key])===null||n(scenarios[active][i][r.key])<0||n(scenarios[active][i][r.key])>1e12):y.errors.some(function(e){return e.field===r.key;})));});});
 ids.forEach(function(id){var out=calculate(id).forecast,terminal=out[out.length-1];document.getElementById('vw-summary-'+id).textContent=terminal?money(terminal.price):'—';document.getElementById('vw-summary-sub-'+id).textContent='FY'+(y0+horizon)+' · '+L('price per share','מחיר למניה');var up=document.getElementById('vw-upside-'+id),ref=referencePrice();up.textContent=terminal&&terminal.upside!==null&&ref!==null?(terminal.upside>0?'+':'')+f(terminal.upside,1)+'% '+L('vs reference','מול מחיר ההשוואה'):L('No price comparison','ללא מחיר להשוואה');});
 var messages=[];
 var errFields=[...new Set(fs.flatMap(function(y){return y.errors.map(function(e){return e.field;});}))];
 if(errFields.length)messages.push(L('Some linked results need valid inputs: ','להשלמת חלק מהתוצאות יש להזין נתונים תקינים: ')+errFields.map(function(key){return (rows.find(function(r){return r.key===key;})||{}).label||key;}).join(', '));
 if(fs.some(function(y){return y.warnings.includes('nonpositive_ebit');}))messages.push(L('A year with nonpositive EBIT has no meaningful EV/EBIT price.','בשנה שבה הרווח התפעולי אינו חיובי לא מוצג מחיר לפי EV/EBIT.'));
 if(fs.some(function(y){return y.warnings.includes('equity_deficit');}))messages.push(L('Negative equity stays visible; implied common-share price is floored at zero.','שווי הון שלילי נשאר מוצג; מחיר המניה המשתמע מוגבל לרצפת אפס.'));
 if(fs.some(function(y){return y.warnings.includes('extreme_assumptions');}))messages.push(L('Some assumptions are unusually large.','חלק מההנחות חריגות בגודלן.'));
 document.getElementById('vw-errors').textContent=messages.join(' ');
}
function showFormula(key,index){selectedCell={key:key,index:index};document.getElementById('vw-fill-selected').disabled=false;if(['termDebt','shortDebt','leases'].includes(key))key='debt';var y=calculate(active).forecast[index],prev=index?calculate(active).forecast[index-1]:base(),labels={growth:L('Revenue = prior revenue × (1 + growth). This changes operating profit and value in every later year.','הכנסות = הכנסות השנה הקודמת × (1 + צמיחה). השינוי עובר לרווח התפעולי ולשווי בכל השנים הבאות.'),margin:L('Operating profit = this year’s revenue × operating margin.','רווח תפעולי = הכנסות השנה × שיעור הרווח התפעולי.'),buyback:L('Year-end shares = opening shares × (1 − buyback + dilution). Both rates use the same opening count.','מניות בסוף השנה = מניות בתחילת השנה × (1 − רכישה עצמית + דילול). שני השיעורים משתמשים באותו בסיס.'),dilution:L('Year-end shares = opening shares × (1 − buyback + dilution). Net change carries into later years.','מניות בסוף השנה = מניות בתחילת השנה × (1 − רכישה עצמית + דילול). השינוי נטו מועבר לשנים הבאות.'),cash:L('Equity value = EV + year-end cash − debt − other claims. Cash must already reflect funding of buybacks.','שווי הון = שווי פעילות + מזומנים בסוף השנה − חוב − זכויות אחרות. המזומנים חייבים לשקף כבר את מימון הרכישות העצמיות.'),debt:L('Debt reduces common equity value one for one. Use the year-end balance after financing and buybacks.','כל דולר חוב מפחית דולר משווי ההון. יש להשתמש ביתרה בסוף השנה לאחר מימון ורכישות עצמיות.'),claims:L('Deduct preferred equity, minority interests and any non-common claims not already included in debt.','מפחיתים הון בכורה, זכויות מיעוט וזכויות אחרות שטרם נכללו בחוב.'),multiple:L('Enterprise value = operating profit × EV/EBIT. Price = (EV + cash − debt − other claims) / shares.','שווי פעילות = רווח תפעולי × EV/EBIT. מחיר = (שווי פעילות + מזומנים − חוב − זכויות אחרות) / מניות.')};
 document.getElementById('vw-formula').innerHTML='<b>ƒx</b><span><strong dir="ltr">FY'+(endYear(company.fiscal_year_end)+index+1)+'</strong> · '+labels[key]+'</span><span class="vw-formula-value" dir="ltr">'+money(y.price)+'</span>';
}
async function loadCompany(symbol){
 symbol=String(symbol||'').trim().toUpperCase().replace(/\./g,'-');var status=document.getElementById('vw-data-status');
 if(!/^[A-Z][A-Z0-9-]{0,14}$/.test(symbol)){status.textContent=L('Enter a valid company ticker.','הזינו סימול חברה תקין.');return;}
 var id=++requestId;if(controller)controller.abort();controller=new AbortController();var mine=controller;
 status.textContent=L('Loading annual reports for ','טוען נתונים שנתיים עבור ')+symbol+'…';document.getElementById('vw-load').setAttribute('aria-busy','true');
 var timeout=setTimeout(function(){mine.abort();},25000);
 try{
 var data;
 if(window.WAVE_VALUATION_SNAPSHOTS){data=window.WAVE_VALUATION_SNAPSHOTS.snapshots[symbol];if(!data)throw new Error('snapshot unavailable');}
 else{var response=await fetch(API+'/api/valuation-inputs?symbol='+encodeURIComponent(symbol),{signal:mine.signal});if(!response.ok)throw new Error('data unavailable');data=await response.json();}
 if(id!==requestId)return;
 if(!Array.isArray(data.history)||!data.history.length||data.symbol!==symbol)throw new Error('No annual history');
 if(!['ok','partial'].includes(data.status)||!validDate(data.fiscal_year_end))throw new Error('Unsupported valuation base');
 var latestHistory=data.history.map(function(y){return y.period_end;}).filter(validDate).sort().at(-1);
 if(latestHistory!==data.fiscal_year_end)throw new Error('History and model base fiscal years do not match');
 company=data;resetReference(data.fields&&data.fields.current_price);buildScenarios();renderSheet();document.getElementById('vw-symbol').value=symbol;
 status.textContent=window.WAVE_VALUATION_SNAPSHOTS?L('SEC actuals · snapshot ','נתוני עבר SEC · צילום ')+(window.WAVE_VALUATION_SNAPSHOTS.snapshot_date||data.as_of.slice(0,10))+L(' · not live market data',' · אינם נתוני שוק בזמן אמת'):L('SEC annual actuals · dates shown by year','נתוני עבר שנתיים SEC · תאריכים בכל עמודה');
 registerCompany();
 }catch(e){if(id!==requestId)return;status.textContent=window.WAVE_VALUATION_SNAPSHOTS?L('This review demo contains sourced Apple and Microsoft history. Select AAPL or MSFT.','הדמו כולל היסטוריה מאומתת של Apple ו־Microsoft. בחרו AAPL או MSFT.'):L('Annual data could not be loaded. Try another supported company.','לא ניתן לטעון נתונים שנתיים. נסו חברה נתמכת אחרת.');if(company)status.textContent+=' '+L('Still showing ','עדיין מוצגים נתוני ')+company.symbol+'.';if(!company){document.getElementById('vw-loaded').hidden=true;document.getElementById('vw-empty').hidden=false;}}
 finally{clearTimeout(timeout);if(id===requestId)document.getElementById('vw-load').removeAttribute('aria-busy');}
}
function registerMethod(){if(!window.WaveSources)return;WaveSources.record('guide:equity-valuation',L('Annual valuation workbook · methodology','גיליון הערכת שווי שנתי · מתודולוגיה'),
 L('Historical columns are sourced actuals. A means actual fiscal year, E means user forecast. USD amounts and shares are both shown in millions. Missing is never zero. Each forecast year has independent editable assumptions. Revenue and share counts flow forward from the previous year; margins, multiples and year-end balance-sheet assumptions apply to their own year.','עמודות העבר הן נתונים בפועל ממקורות מדווחים. A מציין שנת כספים בפועל, E תחזית משתמש. סכומי דולר ומניות מוצגים במיליונים. מידע חסר אינו אפס. לכל שנה בתחזית הנחות עצמאיות הניתנות לעריכה. ההכנסות ומספר המניות מועברים מהשנה הקודמת; מרווחים, מכפילים ויתרות סוף שנה חלים על השנה שלהם.')+'\nRevenue[t] = Revenue[t−1] × (1 + growth[t]/100). EBIT[t] = Revenue[t] × margin[t]/100. Shares[t] = Shares[t−1] × (1 − buyback[t]/100 + dilution[t]/100).\nEV[t] = EBIT[t] × EV/EBIT[t]. Equity[t] = EV[t] + cash[t] − debt[t] − other claims[t]. Price[t] = max(0, Equity[t]) / Shares[t].\n'+
 L('Both share rates apply to opening-year shares. Starting shares are point-in-time common shares, not public float or weighted-average diluted EPS shares. Historical gross dilution is not inferred from net movement. Reported buybacks may have narrower scope than all repurchases.','שיעורי הרכישה העצמית והדילול חלים על המניות בתחילת השנה. מניות הפתיחה הן מניות קיימות בנקודת זמן, לא מניות ציבור ולא ממוצע משוקלל מדולל לחישוב EPS. דילול היסטורי גולמי אינו נגזר מתנועה נטו. לרכישות מדווחות עשוי להיות היקף צר מכלל הרכישות.')+'\n'+
 L('Forecast cash/debt are post-buyback and post-financing balances. Buyback cash is not subtracted twice. Initial constant balances are editable assumptions, not a funded cash-flow forecast. Debt is modeled from separate term-debt, commercial-paper and finance-lease components, not certified as complete debt. Missing historical commercial paper stays blank; its forecast starts at an explicit editable zero assumption. Add omitted claims yourself. Zero other claims is an assumption.','מזומנים וחוב בתחזית הם יתרות לאחר רכישות עצמיות ומימון. עלות הרכישה העצמית אינה מופחתת פעמיים. יתרות קבועות בתחילת המודל הן הנחות הניתנות לעריכה, לא תחזית תזרים ממומנת. החוב במודל הוא סכום נפרד של חוב לזמן ארוך, ניירות מסחר וחכירות מימוניות, ואינו אישור לסך חוב מקיף. נתון היסטורי חסר של ניירות מסחר נשאר ריק; התחזית שלו מתחילה בהנחת אפס מפורשת הניתנת לעריכה. יש להוסיף זכויות שלא נכללו. גם אפס בזכויות אחרות הוא הנחה.')+'\n'+
 L('Presets are illustrative: Base begins with last reported growth/margin/buyback, adjusted only for supported bounds; Bull/Bear change those assumptions. The initial EV/EBIT multiples 22/18/14 and dilution 0.5%/0.5%/1% are assumptions, never historical observations. Zero/negative EBIT has no EV/EBIT price. Negative equity is retained with a zero share-price floor. Future prices are not discounted to today and no probability or return is promised. Not suitable for banks/insurers.','ברירות המחדל להמחשה: הבסיס מתחיל בצמיחה, במרווח וברכישה העצמית המדווחים האחרונים, בהתאמה לטווחי המודל; התרחיש האופטימי והפסימי משנים אותם. מכפילי EV/EBIT הראשוניים 22/18/14 ודילול 0.5%/0.5%/1% הם הנחות ולא נתוני עבר. רווח תפעולי אפסי או שלילי אינו מקבל מחיר לפי המכפיל. שווי הון שלילי נשמר עם רצפת מחיר מניה אפס. מחירים עתידיים אינם מהוונים להיום ואינם הבטחה. אינו מתאים לבנקים ומבטחים.'),
 [{title:'SEC CompanyFacts',url:'https://www.sec.gov/search-filings/edgar-application-programming-interfaces'},{title:'Buybacks and cash — Damodaran',url:'https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/beydiv.pdf'}]);}
function registerCompany(){if(!window.WaveSources)return;var links=[],parts=['Data status: '+(company.status||'unknown'),'Retrieved: '+(company.as_of||'unknown'),'Cache fetched: '+(company.fetched_at||'unknown')];(company.warnings||[]).forEach(function(w){parts.push(typeof w==='string'?w:[w.field,w.status,w.reason].filter(Boolean).join(' · '));});history().forEach(function(y){parts.push('FY '+y.period_end);Object.entries(y).forEach(function(pair){var v=pair[1];if(!v||typeof v!=='object'||!('value'in v))return;parts.push(pair[0]+': '+(v.value===null?'missing':v.value)+' '+v.unit+' | '+v.status+' | '+(v.period_start||'')+' → '+(v.period_end||'')+' | '+(v.reason||'')+' | '+(v.concept||'')+' | '+(v.accession||''));var url=safeLink(v.url);if(url&&!links.some(function(l){return l.url===url;}))links.push({title:'SEC · '+y.period_end,url:url});});});WaveSources.record('valuation:'+company.symbol,company.symbol+' · '+L('Annual financial history','היסטוריה פיננסית שנתית'),parts.join('\n'),links);}
window.WaveValuation={open:function(){if(!ready){ready=true;init();}},loadCompany:loadCompany};
function initial(){if(location.hash==='#valuation'){navigate('valuation');WaveValuation.open();}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initial,{once:true});else initial();
})();
