(()=>{'use strict';
const titles=['Doji ומשפחת הדוג׳י','Spinning Top ו־Marubozu','Hammer ו־Hanging Man','Inverted Hammer ו־Shooting Star','תרגול זיהוי ללא שמות','Bullish/Bearish Engulfing','Bullish/Bearish Harami','Piercing Line','Dark Cloud Cover','Tweezer Top/Bottom','Inside Bar ו־Outside Bar','השוואות ומקרי גבול'];
const sources=['04-01','04-02','04-03','04-04','04-05','05-01','05-02','05-03','05-04','05-05','05-06','05-07'];
const root='https://raw.githubusercontent.com/wavecapitalil/wave-platform/main/';
const nav=document.getElementById('lesson-nav'),host=document.getElementById('lesson-view');const cache=new Map();let selected=-1;
function node(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e}
function clean(t){
  // PDF source exports some brackets and numbering in visual (rather than logical) order.
  // Fix those patterns before wrapping LTR tokens. Leave the Markdown source unchanged.
  return t.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'')
   .replace(/\ufb01/g,'fi').replace(/\ufb02/g,'fl')
   .replace(/\(\s*[,;:]?\s*\)\s*([A-Za-z]+(?:[–/-][A-Za-z]+|[ -][A-Za-z]+){0,3})/g,(_,name)=>'('+name.trim()+')')
   .replace(/\(\s*:\s*\)\s*([A-Za-z]+(?:[–/-][A-Za-z]+|[ -][A-Za-z]+){0,3})/g,(_,name)=>'('+name.trim()+'):')
   .replace(/\(\s*\)/g,'')
   .replace(/\?([A-Za-z][A-Za-z-]*)/g,'$1?')
   .replace(/(^|\s)\.(\d{1,2})(?=[\u0590-\u05ff])/g,'$1$2. ')
   .replace(/([0-9])(?=[\u0590-\u05ff])/g,'$1 ')
   .replace(/([A-Za-z])(?=[\u0590-\u05ff])/g,'$1 ')
   .replace(/([\u0590-\u05ff])(?=[A-Za-z])/g,'$1 ')
   .replace(/\)(?=[\u0590-\u05ff])/g,') ')
   .replace(/([,;:!?])(?=[\u0590-\u05ffA-Za-z])/g,'$1 ')
   .replace(/\s+([,;:!?])/g,'$1')
   .replace(/\s+\.([^\d\s])/g,(_,next)=>'. '+next)
   .replace(/\s+\.(?=[\u0590-\u05ff])/g,'. ')
   .replace(/(\d)\.(?=\s+[^\d])/g,'$1.')
   .replace(/ {2,}/g,' ').trim();
}
function headingNumber(text){
  const match=text.match(/^(\d{1,2})\.\s+(.+)$/);
  return match?{number:match[1],label:match[2]}:null;
}
function suppressed(t){return /^# שיעור 0[45]\./.test(t)||/^> טיוטה;/.test(t)||/^תורת הנרות היפניים\s*\|/.test(t)||/^יחידה\s*\|/.test(t)||/^שיעור\s*[—-]\s*[45]\./.test(t)||/^טיוטת תוכן והמחשה/.test(t)||/^ח ו מ ר ל י מ ו ד י/.test(t)||/^\d{2,3}$/.test(t)||/^מקורות(?:\s|:| לקריאה)/.test(t)||/^נקודות למוצר האתר ולבקרת איכות/.test(t)}
function extract(raw){let blocks=raw.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'').replace(/\r/g,'')
 // Keep the numbered heading on its own line instead of merging it into the opening paragraph.
 .replace(/(^|\n)(\s*\.\d{1,2}[^\n]+)\n/g,'$1$2\n\n')
.split(/\n\s*\n+/).flatMap(b=>b.split(/\n(?=\s*(?:דוג׳י רגיל|דוג׳י ארוך־רגליים|דוג׳י שפירית|דוג׳י אבן קבורה)\s*\()/))
.map(b=>clean(b.replace(/\s*\n\s*/g,' '))).filter(Boolean);let result=[];let afterProduction=false;for(let b of blocks){if(/^נקודות למוצר האתר ולבקרת איכות/.test(b))afterProduction=true;if(afterProduction||suppressed(b)||b.includes('גרסת עבודה לביקורת |'))continue;if(/^איור\s*[—\d]|^כרטיסים\s*\d|המחשה לימודית סינתטית/.test(b)){result.push({kind:'figure',text:b});continue;}let isHead=b.length<=105&&!/[.!?][\u0590-\u05ff]/.test(b)&&!/(?:\d{3,}|O=|H=|L=|C=|https?:\/\/)/.test(b)&&(!b.includes(' — ')||b.length<66)&&b.split(' ').length<=15;
if(/^מטרת השיעור$|^מטרה\s*:|^תרגול|^פתרון|^מפתח|^הערכה עצמית|^שאלות המשך|^בדיקת יחידה|^כללי התרגול/.test(b))isHead=true;
result.push({kind:isHead?'heading':'paragraph',text:b});}
return result}
function labelClass(t){if(/^(תרגול|שאלות המשך|בדיקת יחידה|הערכה עצמית|כללי התרגול)/.test(t))return 'exercise';if(/^(פתרון|מפתח)/.test(t))return 'solution';if(/^(מטרת השיעור|מטרה)/.test(t))return 'intro';return ''}
function addBilingualText(element,text){
  const pattern=/\([A-Za-z][A-Za-z0-9\s/–-]*\)|\b(?:[A-Za-z]+(?:[ –/-][A-Za-z]+)*|[A-Z]\d?=\d+(?:\.\d+)?|\d+(?:\.\d+)?%?)\b/g;
  let last=0,match;
  while((match=pattern.exec(text))!==null){
    if(match.index>last)element.append(document.createTextNode(text.slice(last,match.index)));
    const span=node('bdi','term-ltr',match[0]);span.dir='ltr';element.append(span);
    last=pattern.lastIndex;
  }
  if(last<text.length)element.append(document.createTextNode(text.slice(last)));
}
function addContent(section,paragraph){
  // Do not collapse a multi-sentence explanation into one continuous, visually crowded line.
  const split=paragraph.replace(/([.!?])\s+(?=[\u0590-\u05ff])/g,'$1\n')
   .split(/\n/).map(x=>x.trim()).filter(Boolean);
  const chunks=[];for(let i=0;i<split.length;i+=2)chunks.push(split.slice(i,i+2).join(' '));
  for(const segment of chunks){const p=node('p','readable-paragraph');p.dir='rtl';addBilingualText(p,segment);section.append(p)}
}
function addFigure(section,label,idx){
  if(selected===0&&idx===1){
    const figure=node('figure','source-illustration');
    const image=node('img','');image.src='assets/candlesticks-unit4/fig-4-1-01.svg';
    image.alt='שלושה נרות בעלי אותו High 110 ו-Low 90, עם גופים שונים: דוג׳י, שורי ודובי';
    image.width=1200;image.height=520;image.loading='lazy';image.decoding='async';
    figure.append(image,node('figcaption','','אותו High ואותו Low — גודל הגוף תלוי בהפרש בין Open ל־Close. מחירים סינתטיים להמחשה בלבד.'));
    section.append(figure);return;
  }
  const x=node('div','fig-placeholder');
  x.append(node('strong','','איור לימודי מתוך חומר המקור — '+idx));
  x.append(node('div','',label));
  x.append(node('small','','קובץ האיור עצמו עדיין חסר בריפו. לא נוסף תרשים משוער.'));
  section.append(x);
}
// Single consistent opening panel across all twelve unit-4 lessons.
const learningOpeners=[
 {intro:'נכיר את משפחת הדוג׳י ונלמד מה אפשר להבין מגוף נר קטן מאוד.',points:['איך מזהים דוג׳י ואת ארבע הצורות המרכזיות שלו.','מדוע מיקום הנר בגרף חשוב יותר מהשם שלו.']},
 {intro:'נלמד להבחין בין נר בעל גוף קטן לנר בעל גוף כמעט מלא.',points:['איך מזהים Spinning Top לפי הגוף והפתילים.','איך מזהים Marubozu ומה ההבדל בין שתי הצורות.']},
 {intro:'נכיר את תבניות הפטיש והאיש התלוי ונבין מדוע ההקשר משנה.',points:['איך מזהים גוף קטן ופתיל תחתון ארוך.','איך מבחינים בין Hammer ל־Hanging Man לפי המגמה שקדמה לנר.']},
 {intro:'נכיר שתי תבניות עם גוף קטן ופתיל עליון ארוך.',points:['איך מזהים את המבנה של Inverted Hammer ו־Shooting Star.','למה חשוב לבדוק אם הנר הופיע אחרי ירידה או עלייה.']},
 {intro:'נתרגל לזהות נרות לפי המבנה שלהם, בלי להסתמך מיד על שם התבנית.',points:['איך מתארים גוף ופתילים לפני שנותנים שם לנר.','איך מזהים מקרים גבוליים ומתי חסר מידע לסיווג.']},
 {intro:'בשיעור הזה נכיר את תבנית הבולען (Engulfing) ונלמד לזהות אותה בגרף.',points:['איך מזהים בליעה של גוף נר אחד על ידי גוף הנר הבא.','מה ההבדל בין בולען שורי לבולען דובי, ומדוע פתילים אינם חייבים להיבלע.']},
 {intro:'נכיר את תבנית ההרמי (Harami), שבה גוף הנר השני נמצא בתוך גוף הנר הראשון.',points:['איך מזהים הרמי שורי והרמי דובי.','מה ההבדל בין הכלת גוף נר לבין Inside Bar.']},
 {intro:'נלמד לזהות תבנית Piercing Line אחרי ירידה.',points:['איך מחשבים את אמצע הגוף של הנר הראשון.','מתי סגירת הנר השני מעל האמצע מתאימה להגדרת התבנית.']},
 {intro:'נכיר את תבנית Dark Cloud Cover אחרי עלייה.',points:['איך מזהים חזרה של המחיר אל מתחת לאמצע גוף הנר הראשון.','איך מבדילים בין התבנית הזאת לבין בולען דובי.']},
 {intro:'נכיר תבניות Tweezer שבהן שני נרות יוצרים קצוות מחיר דומים.',points:['איך מזהים שיאים דומים ב־Tweezer Top ושפלים דומים ב־Tweezer Bottom.','למה צריך להגדיר מראש מה נחשב מחיר שווה או קרוב.']},
 {intro:'נלמד להשוות את טווחי המחיר של שני נרות.',points:['איך מזהים Inside Bar ו־Outside Bar בעזרת High ו־Low.','במה נבדלת השוואת טווחים מהשוואת גופי נרות.']},
 {intro:'נסכם את תבניות יחידה 4 ונלמד להתמודד עם מקרים שאינם חד־משמעיים.',points:['איך מבדילים בין תבניות דומות באמצעות גוף, טווח ומחירי סגירה.','איך מגדירים כללי סיווג שאפשר לבדוק בלי להתבלבל בין זיהוי לתחזית.']}
];
function buildLearningOpener(index){
 const d=learningOpeners[index],panel=node('section','learning-opener');
 panel.setAttribute('aria-label','מה נלמד בשיעור?');
 const heading=node('h3','learning-opener-title','מה נלמד בשיעור?');
 panel.append(heading);
 const intro=node('p','learning-opener-lead');intro.dir='rtl';addBilingualText(intro,d.intro);panel.append(intro);
 const ul=node('ul','learning-opener-points');
 d.points.forEach(point=>{const li=node('li');li.dir='rtl';const tick=node('span','learning-opener-tick','✓');tick.setAttribute('aria-hidden','true');const span=node('span','learning-opener-copy');addBilingualText(span,point);li.append(tick,span);ul.append(li)});
 panel.append(ul);return panel;
}
const imagePlacement={6:'מה נבלע?',7:'הצורה וההקשר',8:'צעד אחר צעד',9:'חישוב ודוגמה',10:'הרמה המשותפת',11:'שתי תצורות Price Action',12:'ארבעת הזוגות באיור'};
let editorialCache=null;
async function getEditorial(){if(editorialCache)return editorialCache;const res=await fetch('assets/candlesticks-unit4/unit4-editorial-review.json?v=2');if(!res.ok)throw Error('גרסת התוכן הערוכה אינה זמינה');const json=await res.json();if(json.policy!=='review_only_not_for_approved_registry'||!Array.isArray(json.lessons))throw Error('נתוני ביקורת לא תקינים');editorialCache=json;return json;}
function illustration(section,lessonIndex){
 const number=lessonIndex+1,figure=node('figure','source-illustration');
 const img=node('img');img.src='assets/candlesticks-unit4/fig-4-'+String(number).padStart(2,'0')+'-main.svg';img.alt='איור לימודי מקצועי: '+titles[lessonIndex];img.loading='lazy';img.decoding='async';img.width=1200;img.height=520;
 figure.append(img,node('figcaption','','איור וקטורי לימודי — גרסת ביקורת; נתוני המחירים סינתטיים. ציור מחדש בסגנון מאושר, לא קובץ ה־PNG המקורי.'));
 section.append(figure);
}
function renderEditorialLesson(lesson,index){
 const frag=document.createDocumentFragment();let placed=false;
 for(const block of lesson.sections){
   if(block.type==='intro')continue; // The reusable short opener now replaces the PDF objective block.
   let section=node('section','section '+(block.type==='intro'?'intro':block.type==='exercise'?'exercise':block.type==='solution'?'solution':''));
   const h=node('h3');h.dir='rtl';addBilingualText(h,block.heading);section.append(h);
   for(const item of block.items){
     if(item.type==='figure-note'){const note=node('p','figure-caption-source');addBilingualText(note,item.text);section.append(note);continue;}
     addContent(section,item.text);
   }
   if(!placed && block.heading===imagePlacement[index+1]){illustration(section,index);placed=true;}
   frag.append(section);
 }
 if(!placed){const section=node('section','section');section.append(node('h3','','המחשה לימודית'));illustration(section,index);frag.append(section);}
 return frag;
}
function compose(parts){const frag=document.createDocumentFragment();let current=null,sectionNumber=0,figureNumber=0;for(let part of parts){if(part.kind==='heading'){sectionNumber++;let section=node('section','section '+labelClass(part.text));let h=node('h3','');h.dir='rtl';const num=headingNumber(part.text);if(num){h.classList.add('numbered-heading');h.append(node('span','heading-number',num.number+'.'));addBilingualText(h,num.label)}else addBilingualText(h,part.text);section.append(h);frag.append(section);current=section;continue;}if(!current){sectionNumber++;current=node('section','section intro');current.append(node('h3','','מה נלמד בשיעור הזה?'));frag.append(current)}
if(part.kind==='figure')addFigure(current,part.text,++figureNumber);else addContent(current,part.text)}return {fragment:frag,figureNumber,sectionNumber}}
async function openLesson(index){if(index<0||index>=12)return;selected=index;let buttons=nav.querySelectorAll('button');buttons.forEach((button,i)=>button.classList.toggle('selected',i===index));host.replaceChildren(node('p','status','טוען את שיעור 4.'+(index+1)+'...'));let source=sources[index],raw;
try{raw=cache.get(source);if(!raw){const resp=await fetch(root+'docs/course-workspace/lessons/'+source+'.md');if(!resp.ok)throw Error('קובץ מקור לא זמין: '+resp.status);raw=await resp.text();cache.set(source,raw)}if(selected!==index)return;host.replaceChildren();let hero=node('div','hero'),img=node('img');img.src='assets/candlesticks-unit4/lesson-4-'+String(index+1).padStart(2,'0')+'.webp';img.alt='תמונת שער שיעור 4.'+(index+1);img.loading='lazy';hero.append(img);let block=node('div','hero-text');block.append(node('div','kicker','יחידה 4 · '+(index<5?'חלק א׳ — תבניות נר בודד':'חלק ב׳ — תבניות שני נרות')));block.append(node('h2','','4.'+(index+1)+' — '+titles[index]));block.append(node('div','meta','גרסת תוכן לעריכה · מקור '+source+' · טרם אושר לפרסום'));hero.append(block);host.append(hero);host.append(buildLearningOpener(index));
if(index>=5){const editorial=await getEditorial();if(selected!==index)return;const lesson=editorial.lessons.find(x=>x.id==='4.'+(index+1));if(!lesson)throw Error('שיעור לא נמצא בקובץ הביקורת');host.append(renderEditorialLesson(lesson,index))}else{let elements=extract(raw);let {fragment,figureNumber,sectionNumber}=compose(elements.filter((part,i,arr)=>!/^מטרת השיעור\b|^מטרה\s*:/.test(part.text) && !(i>0 && /^מטרת השיעור\b/.test(arr[i-1].text))));host.append(fragment);if(!figureNumber){host.append(node('div','fig-placeholder','איורי ההוראה הפנימיים לא זוהו כקבצים נפרדים. יש לבצע התאמה מול ה־PDF המקורי.'))}}
let footer=node('div','actions'),prev=node('button','','השיעור הקודם'),next=node('button','','השיעור הבא');prev.disabled=index===0;next.disabled=index===11;prev.onclick=()=>openLesson(index-1);next.onclick=()=>openLesson(index+1);footer.append(prev,next);host.append(footer);
let details=node('details','source-preview'),summary=node('summary','','לבדיקת התאמה: תמלול המקור ללא עריכה');details.append(summary,node('pre','',raw));host.append(details);
const solutions=host.querySelectorAll('.section.solution');for(const section of solutions){let h=section.querySelector('h3'),remaining=[...section.children].filter(e=>e!==h),d=node('details');d.append(node('summary','','הצגת פתרון והסבר'));let body=node('div','solution-body');remaining.forEach(e=>body.append(e));d.append(body);section.append(d)}
window.scrollTo(0,0);
}catch(e){host.replaceChildren(node('div','status','שגיאה בטעינת השיעור: '+e.message))}}
titles.forEach((title,i)=>{if(i===0||i===5)nav.append(node('div','part-label',i===0?'חלק א׳ — תבניות נר בודד':'חלק ב׳ — תבניות שני נרות'));let b=node('button','','4.'+(i+1)+' — '+title);b.onclick=()=>openLesson(i);nav.append(b)});
const n=Number(new URLSearchParams(location.search).get('lesson'));openLesson(n>=1&&n<=12?n-1:0);
})();