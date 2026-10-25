(()=>{'use strict';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search),u=Number(params.get('u')),n=Number(params.get('n'));
const pad=n=>String(n).padStart(2,'0'),id=u+'.'+n;
const root='https://raw.githubusercontent.com/wavecapitalil/wave-platform/main/';
const registryUrl=root+'docs/course/registry.json';
function add(tag,text,container){const el=document.createElement(tag);el.textContent=text;container.appendChild(el);return el;}
function unavailable(message){
  $('title').textContent='שיעור '+id+' — בתהליך עריכה';
  $('intro').textContent='התוכן המקצועי לשיעור זה נמצא כעת בבקרת איכות וטרם אושר לפרסום.';
  const host=$('lesson-content');host.replaceChildren();
  const box=add('section','',host);box.className='section';box.setAttribute('aria-label','סטטוס השיעור');
  add('h2','השיעור עדיין אינו זמין ללמידה',box);
  add('p',message||'אנחנו מכינים גרסה ערוכה הכוללת הסברים, המחשות ותרגול. חומרי העבודה המקוריים נשמרים בנפרד ואינם מוצגים כאן.',box);
  $('complete').hidden=true;
}
async function getJson(url){const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('Fetch '+response.status);return response.json();}
async function init(){
  if(!Number.isInteger(u)||u<3||u>10||!Number.isInteger(n)||n<1||n>10){unavailable('קישור השיעור אינו תקין.');return;}
  // Fail closed: missing/invalid registry never falls back to raw source Markdown.
  let entry;
  try{const registry=await getJson(registryUrl);if(registry.schema_version!==1||registry.policy!=='deny_by_default')throw Error('Invalid registry');
    entry=registry.lessons?.[id];}catch(error){console.warn('Course approval manifest unavailable',error);unavailable('לא ניתן לאמת כרגע את אישור הפרסום של השיעור.');return;}
  if(!entry||entry.status!=='approved'||typeof entry.path!=='string'||!/^docs\/course\/approved\/[a-zA-Z0-9_-]+\.json$/.test(entry.path)){unavailable();return;}
  try{
    const lesson=await getJson(root+entry.path);
    if(lesson.lesson_id!==id||typeof lesson.title!=='string'||!Array.isArray(lesson.sections)||!lesson.sections.length)throw Error('Invalid approved lesson');
    $('title').textContent=id+' — '+lesson.title;
    $('intro').textContent=lesson.intro||'';
    const host=$('lesson-content'),nav=$('lesson-nav');host.replaceChildren();nav.replaceChildren();
    lesson.sections.forEach((part,index)=>{
      const section=add('section','',host);section.className='section';section.id='part-'+index;
      add('h2',part.heading||'חלק '+(index+1),section);
      for(const paragraph of part.paragraphs||[])if(typeof paragraph==='string')add('p',paragraph,section);
      const link=add('a',part.heading||'חלק '+(index+1),nav);link.href='#part-'+index;
    });
    const key='wave.candles.v1.lesson.'+pad(u)+'-'+pad(n),button=$('complete');
    function paint(){const done=localStorage.getItem(key)==='done';button.textContent=done?'ביטול סימון השלמה':'סמן שיעור כהושלם';$('done-label').textContent=done?' ✓ הושלם':'';}
    button.addEventListener('click',()=>{localStorage.setItem(key,localStorage.getItem(key)==='done'?'':'done');paint();});paint();
    const tools=document.createElement('script');tools.src='candlesticks-course-tools.js?v=2';document.body.appendChild(tools);
  }catch(error){console.error('Approved lesson failed to load',error);unavailable('אירעה בעיה בטעינת השיעור המאושר.');}
}init();
})();