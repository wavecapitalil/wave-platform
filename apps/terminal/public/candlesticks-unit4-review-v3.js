(()=>{'use strict';
const root='assets/candlesticks-unit4/';
const host=document.getElementById('lesson-view'),nav=document.getElementById('lesson-nav'),count=document.getElementById('figure-count');
const q=new URLSearchParams(location.search),start=Number(q.get('lesson'));
let rows=[],current=-1;
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
 const isFirst=index===1 || (lesson===1&&index===2);
 const img=elem('img');img.loading='lazy';img.decoding='async';
 img.src=isFirst?root+'internal/fig-4-'+String(lesson).padStart(2,'0')+'-approved.webp':'';
 if(lesson===1&&index===1)img.src=root+'fig-4-1-01.svg';
 img.alt='איור לימודי לשיעור 4.'+lesson;
 const fallback=elem('div','figure-pending',isFirst&&(lesson!==1||index===2)?'האיור אושר ונמצא בחבילת הנכסים; ממתין להעלאת הקובץ ל־GitHub.':'נדרשת השלמת איור פנימי נוסף מתוך חומר המקור.');
 if(!img.src)img.style.display='none';
 else {img.onerror=()=>{img.style.display='none';fallback.hidden=false};img.onload=()=>{fallback.hidden=true};}
 figure.append(img,fallback);
 const cap=elem('figcaption','');bilingual(cap,label);figure.append(cap);host.append(figure);
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
async function load(){
 try{
  const r=await fetch(root+'unit4-editorial-review.json?v=20261105');if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.json();if(!Array.isArray(data.lessons)||data.lessons.length!==12)throw Error('Incomplete 12-lesson set');
  rows=data.lessons;
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
 const controls=elem('div','lesson-controls');const prev=elem('button','','השיעור הקודם'),next=elem('button','','השיעור הבא');prev.disabled=i===0;next.disabled=i===11;prev.onclick=()=>select(i-1);next.onclick=()=>select(i+1);controls.append(prev,next);host.append(controls);
 const audit=elem('details','audit-details');audit.append(elem('summary','','פרטי מקור ובקרת איכות'));audit.append(elem('p','', 'קובץ מקור: '+lesson.source_path+' · מזהה מקור: '+lesson.source_id));audit.append(elem('p','', 'גרסת הביקורת שומרת על כל ההסברים והדוגמאות; נוסחאות וערכים שיובאו מ־PDF מחייבים בדיקה לפני פרסום.'));host.append(audit);
 if(history.replaceState){const u=new URL(location.href);u.searchParams.set('lesson',String(i+1));history.replaceState({},'',u.pathname+u.search)}
 window.scrollTo({top:0,behavior:'instant'});
}
load();
})();