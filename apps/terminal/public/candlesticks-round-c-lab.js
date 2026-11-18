(()=>{'use strict';
const KEY='wave.candles.roundC.v1.';
const scenarios=[
{id:'a',title:'נסיגה לתמיכה בתוך מגמה עולה',intro:'האם הירידה האחרונה היא תיקון במבנה עולה, או סימן לשינוי? עצרו את הניתוח לאחר הנר התשיעי.',closes:[99,101,103,102,105,108,106,103,101,104,107,109,106,110],hints:'סמנו את השיאים והשפלים הקודמים, ורק אחר כך תנו משמעות לנר האחרון.',review:'בדוגמה זו המחיר חוזר ומתחזק לאחר הנסיגה. תוצאה חיובית אינה מוכיחה שהניתוח היה מוצדק; דרושות הגדרות ניתנות לשחזור.'},
{id:'b',title:'פריצה מעל התנגדות וחזרה לטווח',intro:'פריצה נקודתית מעל אזור 106–108. האם יש כבר ראיה לקבלת מחיר מעל האזור?',closes:[101,104,102,105,103,106,104,107,109,106,103,101,104,100],hints:'כתבו אם הכלל שלכם דורש סגירת נר מעל האזור, כמה זמן, ומה יבטל את התרחיש.',review:'המחיר חוזר אל מתחת לאזור. זהו מקרה נגדי לפרשנות שפריצה אחת מבטיחה המשכיות; אין לשנות את הכללים לאחר החשיפה.'},
{id:'c',title:'דשדוש ואי־פעולה כתוצאה תקינה',intro:'המחיר נע ללא כיוון ברור בין גבולות קודמים. האם יש כאן הצדקה לפעולה בכלל?',closes:[100,103,101,105,102,104,101,103,102,100,104,102,101,103],hints:'תנו מקום גם להחלטת אי־פעולה; זוהי החלטה אנליטית לגיטימית.',review:'התנועה נותרת מעורבת. איכות הניתוח נמדדת בסיבה המנומקת לפעולה או להימנעות ממנה, לא במספר העסקאות.'}
];
const BASE=9;
function candleValues(s){return s.closes.map((c,i)=>{const o=i?s.closes[i-1]:c-1;const h=Math.max(o,c)+[1.2,1.7,1.1,1.4][i%4];const l=Math.min(o,c)-[1.4,1.1,1.8][i%3];return {o,h,l,c}})}
function get(id){try{const v=JSON.parse(localStorage.getItem(KEY+id)||'null');return v&&v.version===1?v:null}catch(_){return null}}
function save(id,v){try{localStorage.setItem(KEY+id,JSON.stringify({...v,version:1}));return true}catch(_){return false}}
function element(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e}
function priceChart(candles,visible){const rows=candles.slice(0,visible),width=860,height=340,lo=Math.min(...rows.map(d=>d.l))-1,hi=Math.max(...rows.map(d=>d.h))+1,spread=Math.max(1,hi-lo),y=p=>25+(hi-p)/spread*265,step=685/candles.length;
let s='<svg viewBox="0 0 860 340" role="img" aria-label="גרף נרות לימודי סינתטי; מוצגים רק '+visible+' מתוך '+candles.length+' נרות, ציר מחיר מימין"><rect width="860" height="340" fill="#071b30" rx="13"/>';
for(let k=0;k<5;k++){const p=lo+spread*k/4,yy=y(p);s+='<line x1="26" y1="'+yy+'" x2="762" y2="'+yy+'" stroke="#2b506e" stroke-dasharray="4 6"/><text x="772" y="'+(yy+5)+'" fill="#c0d7e8" font-size="15">'+p.toFixed(1)+'</text>'}
rows.forEach((v,i)=>{const x=40+(i+.5)*step,col=v.c>=v.o?'#47d9ad':'#eb7586',top=y(Math.max(v.o,v.c)),bottom=y(Math.min(v.o,v.c));s+='<line x1="'+x+'" y1="'+y(v.h)+'" x2="'+x+'" y2="'+y(v.l)+'" stroke="'+col+'" stroke-width="3"/><rect x="'+(x-9)+'" y="'+top+'" width="18" height="'+Math.max(3,bottom-top)+'" fill="'+col+'" rx="2"/><text x="'+x+'" y="326" text-anchor="middle" fill="#91adc4" font-size="13">'+(i+1)+'</text>'});
s+='<line x1="762" y1="20" x2="762" y2="302" stroke="#8db4cf"/><text x="32" y="19" fill="#a9c9df" font-size="13">OHLC — SYNTHETIC</text></svg>';return s}
const fields=[
{id:'context',label:'1. תיאור עובדתי של מבנה השוק',hint:'לדוגמה: שיאים ושפלים, מיקום ביחס לטווח, בלי לחזות מה יקרה'},
{id:'evidence',label:'2. ראיה התומכת בתרחיש',hint:'איזה נתון נצפה בפועל?'},
{id:'against',label:'3. ראיה נגדית / אי־ודאות',hint:'מה יכול לסתור את ההשערה?'},
{id:'confirmation',label:'4. תנאי אישור שניתן למדוד',hint:'רמת מחיר, סגירה או מבנה — לפי כלל שנקבע מראש'},
{id:'invalidation',label:'5. תנאי ביטול שניתן למדוד',hint:'באיזה מצב הרעיון כבר אינו תקף?'},
{id:'risk',label:'6. תוכנית סיכון או נימוק לאי־פעולה',hint:'אין צורך לפתוח עסקה; ציינו כיצד תימנעו מחשיפה לא מתוכננת'}
];
function grade(d){const present=fields.filter(f=>String(d[f.id]||'').trim().length>=12).length;const action=Boolean(d.action);return {count:present+(action?1:0),max:7,missing:fields.filter(f=>String(d[f.id]||'').trim().length<12).map(f=>f.label)}}
function mountLab(host){
const wrap=element('section','wave-round-c');
wrap.append(element('h2','round-c-title','מעבדת מסחר מסכמת — ניתוח ללא מידע עתידי'));
wrap.append(element('p','round-c-intro','זהו סימולטור לימודי עם נרות סינתטיים, לא נתוני שוק מאומתים ולא אסטרטגיה רווחית. מתעדים תרחיש על סמך 9 נרות, נועלים את ההחלטה ורק לאחר מכן מגלים את ההמשך. לא ניתן לחזור אחורה ולשנות רשומה נעולה.'));
const controls=element('div','round-c-case-nav');wrap.append(controls);
const surface=element('div','round-c-surface');wrap.append(surface);host.append(wrap);
let current=scenarios[0].id;
scenarios.forEach(s=>{const b=element('button','round-c-case',s.title);b.type='button';b.onclick=()=>{current=s.id;render()};b.dataset.id=s.id;controls.append(b)});
function render(){
controls.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===current)));
const s=scenarios.find(v=>v.id===current),candles=candleValues(s),state=get(s.id);
surface.replaceChildren();
const header=element('div','round-c-heading');header.append(element('h3','',s.title));header.append(element('p','',s.intro));surface.append(header);
const visible=state?.locked?state.revealed:BASE;
const chart=element('div','round-c-figure');chart.innerHTML=priceChart(candles,visible);surface.append(chart);
surface.append(element('p','round-c-label',state?.locked?'רשומה נעולה · '+visible+' מתוך '+candles.length+' נרות גלויים':'לפני חשיפת ההמשך · מוצגים רק '+BASE+' נרות'));
if(!state?.locked){
 const form=element('form','round-c-form');const local={};
 fields.forEach(f=>{const label=element('label','round-c-field');label.append(element('strong','',f.label));const area=element('textarea','round-c-input');area.rows=2;area.placeholder=f.hint;area.required=true;area.minLength=12;area.name=f.id;area.oninput=()=>local[f.id]=area.value;label.append(area);form.append(label)});
 const actLabel=element('label','round-c-field');actLabel.append(element('strong','','7. החלטה לפני החשיפה'));const select=element('select','round-c-input');select.required=true;[['','בחרו החלטה'],['long','תכנון לונג מותנה'],['short','תכנון שורט מותנה'],['wait','אי־פעולה / המתנה']].forEach(([v,t])=>{const o=element('option','',t);o.value=v;select.append(o)});actLabel.append(select);form.append(actLabel);
 const status=element('p','round-c-status');status.setAttribute('role','status');
 const lock=element('button','round-c-primary','שמור ונעל ניתוח לפני החשיפה');lock.type='submit';form.append(lock,status);
 form.onsubmit=e=>{e.preventDefault();if(!form.reportValidity())return;const record={version:1,locked:true,revealed:BASE,action:select.value,reflection:'',...Object.fromEntries(fields.map(f=>[f.id,form.elements.namedItem(f.id).value.trim()])),savedAt:new Date().toISOString()};if(!save(s.id,record)){status.textContent='לא ניתן לשמור בדפדפן זה. הניתוח לא ננעל; נסו בדפדפן שמאפשר אחסון מקומי.';return}render()};
 surface.append(form);
 surface.append(element('p','round-c-hint','רמז לניתוח: '+s.hints));
}else{
 const report=element('div','round-c-review');report.append(element('h4','','ההחלטה שתועדה לפני החשיפה'));const rows=[...fields.map(f=>[f.label,state[f.id]]),['החלטה',state.action==='wait'?'אי־פעולה':state.action==='long'?'לונג מותנה':'שורט מותנה']];
 rows.forEach(([label,value])=>{const item=element('p','');item.append(element('strong','',label+': '));item.append(document.createTextNode(value||'—'));report.append(item)});
 surface.append(report);
 if(state.revealed<candles.length){const next=element('button','round-c-primary','חשיפת הנר הבא בלבד');next.type='button';next.onclick=()=>{const nextState={...state,revealed:Math.min(candles.length,state.revealed+1)};if(save(s.id,nextState))render()};surface.append(next)}
 else{
 const feedback=element('div','round-c-feedback');feedback.append(element('h4','','בדיקת התרחיש — משוב תהליכי'));feedback.append(element('p','',s.review));const g=grade(state);
 feedback.append(element('p','','שלמות התיעוד: '+g.count+' מתוך '+g.max+' סעיפים. זהו מדד למילוי התהליך, לא ציון יכולת מסחר או הצלחת תחזית.'));
 if(g.missing.length)feedback.append(element('p','','חסר פירוט מספק: '+g.missing.join(' · ')));
 feedback.append(element('p','','בדקו האם נשמרו רמות אישור וביטול קבועות, האם ההחלטה הייתה אפשרית ללא המידע העתידי והאם הסיכון היה מוגדר. תוצאה מקרית אינה מוכיחה יתרון.'));
 const label=element('label','round-c-field');label.append(element('strong','','רפלקציה: מה התברר ומה הייתם משפרים בתהליך?'));const note=element('textarea','round-c-input');note.rows=3;note.value=state.reflection||'';note.placeholder='השוו את התרחיש המקורי למה שקרה מבלי לשכתב את ההחלטה';label.append(note);feedback.append(label);
 const saveButton=element('button','round-c-secondary','שמור רפלקציה ביומן');saveButton.type='button';const status=element('p','round-c-status');saveButton.onclick=()=>{const v={...state,reflection:note.value.trim()};status.textContent=save(s.id,v)?'הרפלקציה נשמרה ביומן המקומי.':'שמירת הרפלקציה נכשלה.'};feedback.append(saveButton,status);surface.append(feedback);
 }
}
}
render();return wrap;
}
function mountJournal(host){
const box=element('section','wave-round-c round-c-journal');box.append(element('h2','','יומן החלטות וניתוח ביצוע'));
box.append(element('p','','הרשומות נשמרות בדפדפן בלבד. ניתן לייצא אותן כקובץ JSON; הן אינן נשלחות לשרת ואינן מהוות מאגר סטטיסטי למחקר שוק.'));
const list=element('div','round-c-journal-items');box.append(list);
const controls=element('div','round-c-journal-actions');box.append(controls);
function draw(){
list.replaceChildren();
const rows=scenarios.map(s=>({s,r:get(s.id)}));
rows.forEach(({s,r})=>{const section=element('div','round-c-entry');section.append(element('strong','',s.title));section.append(element('p','',r?'ננעל: '+r.savedAt.slice(0,16).replace('T',' ')+' UTC · נרות שנחשפו: '+r.revealed+'/14 · '+(r.reflection?'רפלקציה נשמרה':'רפלקציה טרם נשמרה'):'טרם בוצע ניתוח'));list.append(section)});
const completed=rows.filter(x=>x.r?.revealed===14).length,reflections=rows.filter(x=>x.r?.reflection?.trim()).length;
box.querySelector('.round-c-summary')?.remove();const summary=element('p','round-c-summary','תרחישים שנחשפו במלואם: '+completed+'/3 · רפלקציות: '+reflections+'/3 · אין די נתונים לחישוב יתרון מסחרי.');list.after(summary);
}const exportBtn=element('button','round-c-primary','ייצוא יומן ל־JSON');exportBtn.type='button';exportBtn.onclick=()=>{const payload={schema:1,createdAt:new Date().toISOString(),source:'WAVE educational synthetic scenario lab',records:scenarios.map(s=>({scenarioId:s.id,title:s.title,record:get(s.id)}))};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='wave-capital-round-c-journal.json';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url)};controls.append(exportBtn);draw();host.append(box);
}
window.WAVE_ROUND_C={mount(host,lessonIndex){if(lessonIndex===0||lessonIndex===1||lessonIndex===4)mountLab(host);if(lessonIndex===2||lessonIndex===3||lessonIndex===4)mountJournal(host)}};
})();
