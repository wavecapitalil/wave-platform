(()=>{'use strict';
const root='assets/candlesticks-unit4/';
const host=document.getElementById('lesson-view'),nav=document.getElementById('lesson-nav'),count=document.getElementById('figure-count');
const q=new URLSearchParams(location.search),start=Number(q.get('lesson'));
let rows=[],current=-1,roundBLab=null;
function elem(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n}
function bilingual(parent,value){
 const pattern=/\([A-Za-z][A-Za-z0-9\s/–-]*\)|\b(?:[A-Za-z]+(?:[ /–-][A-Za-z]+)*|[A-Za-z][0-9]?[=<>][0-9.]+|[0-9]+(?:\.[0-9]+)?%?)\b/g;
 let p=0,m;while((m=pattern.exec(value))){if(m.index>p)parent.append(document.createTextNode(value.slice(p,m.index)));const b=elem('bdi','english',m[0]);b.dir='ltr';parent.append(b);p=pattern.lastIndex;}if(p<value.length)parent.append(document.createTextNode(value.slice(p)));
}
function textBlock(host,value){
 const normalized=value.replace(/([.!?])\s+(?=[א-ת])/g,'$1\n');
 const paragraphs=normalized.split(/\n/).map(v=>v.trim()).filter(Boolean);
 // A maximum of two sentences per paragraph improves scanning without dropping content.
 for(let i=0;i<paragraphs.length;i+=2){const p=elem('p','lesson-paragraph');p.dir='rtl';bilingual(p,paragraphs.slice(i,i+2).join(' '));host.append(p)}
}
function drawCaption(host,label,lesson,index){
 const figure=elem('figure','internal-figure');
 const wrap=elem('div','reconstructed-figure');
 const reconstructed=window.WAVE_UNIT4_RECONSTRUCTION;
 if(lesson===1&&index===1){
  const img=elem('img');img.loading='lazy';img.decoding='async';img.src=root+'fig-4-1-01.svg';img.alt='איור מבנה דוג׳י';wrap.append(img);
 }else if(lesson>=6&&index===1){const img=elem('img');img.src=root+'fig-4-'+String(lesson).padStart(2,'0')+'-main.svg';img.loading='lazy';img.decoding='async';img.alt='איור ייעודי לשיעור '+(lesson+0);wrap.append(img)
 }else if(reconstructed){wrap.innerHTML=reconstructed.makeDiagram(lesson,true)}
 figure.append(wrap);
 const cap=elem('figcaption','');bilingual(cap,label);figure.append(cap);
 const note=elem('p','figure-origin','המחשה לימודית בקובץ SVG מתוך נכסי היחידה, או שחזור סכמטי של נרות. אין להניח שזהו צילום איור המקור.');
 figure.append(note);host.append(figure);
}
function panel(lesson,section,index,figureCounter){
 const isPractice=section.type==='exercise',isSolution=section.type==='solution';
 const el=elem('section','lesson-panel '+(section.type||'content'));
 let title=elem('h2','panel-title');const match=section.heading.match(/^(\d{1,2})\.\s+(.+)$/);
 if(match){title.append(elem('span','section-index',match[1]+'. '));bilingual(title,match[2])}else bilingual(title,section.heading);
 el.append(title);
 const body=elem('div','panel-body');
 for(const item of section.items||[]){
  if(item.type==='figure-note')drawCaption(body,item.text,lesson,++figureCounter.value);
  else textBlock(body,item.text);
 }
 if(isSolution){const details=elem('details','answer-details');const summary=elem('summary','','הצגת הפתרון וההסבר');details.append(summary,body);el.append(details)}else el.append(body);
 return el;
}

function roundBQuiz(i){
 const data=roundBLab?.lessons?.find(v=>v.lesson===i+1);
 if(!data||!Array.isArray(data.questions))return null;
 const section=elem('section','lesson-panel round-b-lab');
 section.append(elem('h2','panel-title','מעבדת תבניות — תרגול, מקרים נגדיים ומשוב מפורט'));
 section.append(elem('p','lesson-paragraph','שאלות חדשות על התוכן שלמדתם. בחרו תשובה לפני הצגת ההסבר; המטרה היא לנמק תצפית ולא לנחש את כיוון השוק. הדוגמאות המספריות הן סינתטיות.'));
 for(const item of data.questions){
  const article=elem('div','round-b-question');
  article.append(elem('h3','',item.question));
  const field=elem('fieldset','round-b-options');
  const legend=elem('legend','',item.tag||'בדיקת הבנה');field.append(legend);
  const feedback=elem('div','round-b-feedback');feedback.setAttribute('aria-live','polite');feedback.hidden=true;
  item.options.forEach((option,k)=>{
   const button=elem('button','round-b-option',option);button.type='button';
   button.onclick=()=>{
    field.querySelectorAll('button').forEach((b,j)=>{b.disabled=true;b.classList.toggle('correct-answer',j===item.correctIndex);b.classList.toggle('incorrect-choice',j===k&&k!==item.correctIndex)});
    feedback.replaceChildren();
    feedback.append(elem('strong','',k===item.correctIndex?'נכון — הנה ההסבר':'הבחירה אינה מדויקת — הנה ההסבר'));
    feedback.append(elem('p','',item.explanation));
    feedback.append(elem('p','', 'מקרה נגדי / גבול: '+item.counterexample));
    feedback.hidden=false;
   };
   field.append(button);
  });
  const again=elem('button','round-b-retry','נסו מחדש');again.type='button';again.onclick=()=>{field.querySelectorAll('button').forEach(b=>{b.disabled=false;b.classList.remove('correct-answer','incorrect-choice')});feedback.hidden=true;feedback.replaceChildren()};
  article.append(field,feedback,again);section.append(article);
 }
 return section;
}
function marketFigure(i){
 const section=elem('section','lesson-panel market-data-panel');
 section.append(elem('h2','panel-title','מעבדת נתוני שוק — נרות היסטוריים מאומתים במקור'));
 section.append(elem('p','lesson-paragraph','במרכיב הזה מוצגים נתוני OHLCV מקוריים רק אם הם נטענו בהצלחה מ־Coinbase Exchange. הנכס: BTC-USD; גרף יומי (UTC) בחלון 1–29 במרץ 2024. הגרף משמש לתרגול קריאת הקשר בלבד, ולא נטען שכל שיעור מציג בו תבנית מסוימת.'));
 const link=elem('a','market-source','מקור הנתונים — Coinbase Exchange /products/BTC-USD/candles');link.href='https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles';link.target='_blank';link.rel='noopener noreferrer';section.append(link);
 const button=elem('button','round-b-fetch','טעינת גרף היסטורי מ־Coinbase');button.type='button';section.append(button);
 const message=elem('p','market-status','נתונים טרם נטענו. אין כאן גרף שמדומה לנתונים אמיתיים.');message.setAttribute('role','status');section.append(message);
 const figure=elem('figure','internal-figure');figure.hidden=true;section.append(figure);
 button.onclick=async()=>{
  button.disabled=true;message.textContent='טוען נתונים היסטוריים ממקור הבורסה…';figure.hidden=true;figure.replaceChildren();
  const start='2024-03-01T00:00:00Z',end='2024-03-29T00:00:00Z';
  const endpoint='https://api.exchange.coinbase.com/products/BTC-USD/candles?'+new URLSearchParams({start,end,granularity:'86400'});
  try{
   const response=await fetch(endpoint,{headers:{Accept:'application/json'},cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const raw=await response.json();if(!Array.isArray(raw))throw Error('תגובה שאינה מערך');
   const min=Date.parse(start)/1000,max=Date.parse(end)/1000;
   const seen=new Set(),bars=raw.filter(v=>Array.isArray(v)&&v.length>=6).map(v=>({t:Number(v[0]),l:Number(v[1]),h:Number(v[2]),o:Number(v[3]),c:Number(v[4]),volume:Number(v[5])})).filter(v=>[v.t,v.l,v.h,v.o,v.c,v.volume].every(Number.isFinite)&&v.t>=min&&v.t<max&&v.l>0&&v.h>=Math.max(v.o,v.c,v.l)&&v.l<=Math.min(v.o,v.c)&&v.volume>=0&&(!seen.has(v.t)&&Boolean(seen.add(v.t)))).sort((a,b)=>a.t-b.t);
   if(bars.length<12)throw Error('אין די נרות תקינים לתצוגה');
   const width=860,height=350,left=24,right=90,top=24,bottom=44;
   const lo=Math.min(...bars.map(v=>v.l)),hi=Math.max(...bars.map(v=>v.h)),range=Math.max(1,hi-lo);
   const y=v=>top+(hi-v)/range*(height-top-bottom),x=j=>left+(j+.5)*(width-left-right)/bars.length;
   let svg='<svg viewBox="0 0 860 350" role="img" aria-label="נרות יומיים היסטוריים BTC USD מתוך Coinbase Exchange. ציר המחיר מימין."><rect width="860" height="350" rx="12" fill="#071b30"/>';
   for(let k=0;k<=4;k++){const val=lo+range*k/4,yy=y(val);svg+='<line x1="'+left+'" y1="'+yy+'" x2="770" y2="'+yy+'" stroke="#254762" stroke-dasharray="4 6"/><text x="778" y="'+(yy+4)+'" fill="#b4cee4" font-size="14">'+Math.round(val).toLocaleString('en-US')+'</text>';}
   bars.forEach((v,j)=>{const xx=x(j),col=v.c>=v.o?'#40d5a8':'#eb7887',a=y(Math.max(v.o,v.c)),b=y(Math.min(v.o,v.c));svg+='<line x1="'+xx+'" y1="'+y(v.h)+'" x2="'+xx+'" y2="'+y(v.l)+'" stroke="'+col+'" stroke-width="2"/><rect x="'+(xx-6)+'" y="'+a+'" width="12" height="'+Math.max(2,b-a)+'" fill="'+col+'"/>';});
   [0,Math.floor(bars.length/2),bars.length-1].forEach(j=>{const iso=new Date(bars[j].t*1000).toISOString().slice(5,10);svg+='<text x="'+x(j)+'" y="335" text-anchor="middle" fill="#b4cee4" font-size="15">'+iso+'</text>'});
   svg+='</svg>';
   const wrap=elem('div','market-candles');wrap.innerHTML=svg;figure.append(wrap);
   figure.append(elem('figcaption','', 'מקור: Coinbase Exchange BTC-USD, נרות יומיים (UTC), '+new Date(bars[0].t*1000).toISOString().slice(0,10)+' עד '+new Date(bars[bars.length-1].t*1000).toISOString().slice(0,10)+'. '+bars.length+' נרות OHLCV תקינים שהוחזרו מה־API. הנתונים אינם נבחרים לפי הצלחה של תבנית ואינם הצעה למסחר.'));
   figure.hidden=false;message.textContent='נטענו '+bars.length+' נרות היסטוריים ממקור הבורסה. הנתונים נבדקו לתקינות OHLC בסיסית.';
  }catch(err){message.textContent='לא ניתן לאמת ולהציג נתוני Coinbase בדפדפן זה ('+err.message+'). אין להחליף אותם בדוגמה סינתטית המתחזה לנתוני שוק.';}
  finally{button.disabled=false}
 };
 return section;
}

async function load(){
 try{
  const r=await fetch(root+'unit4-editorial-review.json?v=20261105-edited');if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json();if(!Array.isArray(data.lessons)||data.lessons.length!==12)throw Error('Incomplete 12-lesson set');
  rows=data.lessons;
  try{const labResponse=await fetch(root+'round-b-pattern-lab.json?v=20261118-b');if(!labResponse.ok)throw Error('lab HTTP '+labResponse.status);const parsed=await labResponse.json();if(parsed.schema_version!==1||parsed.lessons?.length!==12||parsed.lessons.some(x=>!Array.isArray(x.questions)||x.questions.length!==2))throw Error('invalid lab schema');roundBLab=parsed}catch(error){console.warn('Unit 4 round-B exercises unavailable',error)}
  rows.forEach((lesson,i)=>{if(i===0||i===5)nav.append(elem('div','nav-heading',i===0?'חלק א׳ — נר בודד':'חלק ב׳ — שני נרות'));const b=elem('button','',lesson.id+' — '+lesson.title);b.onclick=()=>select(i);nav.append(b)});
  select(start>=1&&start<=12?start-1:0);
 }catch(e){host.replaceChildren(elem('p','error-message','לא ניתן לטעון את חומרי הלימוד: '+e.message))}
}
function select(i){
 if(i<0||i>=rows.length)return;current=i;const lesson=rows[i];nav.querySelectorAll('button').forEach((b,j)=>b.classList.toggle('active',j===i));
 const countText=lesson.sections.reduce((sum,sec)=>sum+sec.items.filter(x=>x.type==='figure-note').length,0);
 count.textContent='12 שיעורים · '+countText+' מיקומי המחשה בשיעור זה';
 host.replaceChildren();
 const hero=elem('section','lesson-hero');const cover=elem('img','cover');cover.src=root+'lesson-4-'+String(i+1).padStart(2,'0')+'.webp';cover.alt='איור שער לשיעור '+lesson.id;cover.loading='lazy';hero.append(cover);
 const heading=elem('div','hero-body');heading.append(elem('span','eyebrow','יחידה 4 · '+(i<5?'חלק א׳ — תבניות נר בודד':'חלק ב׳ — תבניות שני נרות')));const h=elem('h1','',lesson.id+' — '+lesson.title);heading.append(h);heading.append(elem('p','hero-meta','גרסת תוכן לעריכה · לא אושרה לפרסום'));hero.append(heading);host.append(hero);
 const figureCounter={value:0};lesson.sections.forEach((section,j)=>host.append(panel(i+1,section,j,figureCounter)));
 if(i===4&&window.WAVE_UNIT4_RECONSTRUCTION)host.append(window.WAVE_UNIT4_RECONSTRUCTION.makeCards());
 const roundB=roundBQuiz(i);if(roundB)host.append(roundB);
 host.append(marketFigure(i));
 const sourceUnit=i<5?4:5,sourceLesson=i<5?i+1:i-4;
 const storageKey='wave.candles.v1.lesson.'+String(sourceUnit).padStart(2,'0')+'-'+String(sourceLesson).padStart(2,'0');
 const status=elem('div','lesson-review-completion');
 const check=elem('button','','');
 function paint(){const done=localStorage.getItem(storageKey)==='done';check.textContent=done?'✓ הושלמה צפייה ותרגול — בטל':'סמן צפייה ותרגול כהושלמו';check.setAttribute('aria-pressed',String(done))}
 check.onclick=()=>{localStorage.setItem(storageKey,localStorage.getItem(storageKey)==='done'?'':'done');paint()};paint();
 status.append(check,elem('p','','סימון התקדמות אישי בדפדפן. אינו מעיד על אישור פדגוגי של חומר הלימוד.'));host.append(status);
 const controls=elem('div','lesson-controls');const prev=elem('button','','השיעור הקודם'),next=elem('button','','השיעור הבא');prev.disabled=i===0;next.disabled=i===11;prev.onclick=()=>select(i-1);next.onclick=()=>select(i+1);controls.append(prev,next);host.append(controls);
 const audit=elem('details','audit-details');audit.append(elem('summary','','פרטי מקור ובקרת איכות'));audit.append(elem('p','', 'קובץ מקור: '+lesson.source_path+' · מזהה מקור: '+lesson.source_id));audit.append(elem('p','', 'גרסת הביקורת שומרת על כל ההסברים והדוגמאות; נוסחאות וערכים שיובאו מ־PDF מחייבים בדיקה לפני פרסום.'));host.append(audit);
 if(history.replaceState){const u=new URL(location.href);u.searchParams.set('lesson',String(i+1));history.replaceState({},'',u.pathname+u.search)}
 window.scrollTo({top:0,behavior:'instant'});
}
load();
})();