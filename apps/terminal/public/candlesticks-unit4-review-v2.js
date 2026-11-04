(()=>{'use strict';
const titles=['Doji ומשפחת הדוג׳י','Spinning Top ו־Marubozu','Hammer ו־Hanging Man','Inverted Hammer ו־Shooting Star','תרגול זיהוי ללא שמות','Bullish/Bearish Engulfing','Bullish/Bearish Harami','Piercing Line','Dark Cloud Cover','Tweezer Top/Bottom','Inside Bar ו־Outside Bar','השוואות ומקרי גבול'];
const sources=['04-01','04-02','04-03','04-04','04-05','05-01','05-02','05-03','05-04','05-05','05-06','05-07'];
const root='https://raw.githubusercontent.com/wavecapitalil/wave-platform/main/';
const nav=document.getElementById('lesson-nav'),host=document.getElementById('lesson-view');const cache=new Map();let selected=-1;
function node(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e}
function clean(t){
return t.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'').replace(/\ufb01/g,'fi').replace(/\ufb02/g,'fl')
.replace(/\(\s*:\s*\)\s*([A-Za-z][A-Za-z -]+)/g,(_,en)=>'('+en.trim()+'): ')
.replace(/([A-Za-z])(?=[\u0590-\u05ff])/g,'$1 ')
.replace(/([\u0590-\u05ff])(?=[A-Za-z])/g,'$1 ')
.replace(/([,;:!?])(?=[\u0590-\u05ffA-Za-z])/g,'$1 ')
.replace(/\s+([,;:!?])/g,'$1')
.replace(/ {2,}/g,' ').trim()
}
function suppressed(t){return /^# שיעור 0[45]\./.test(t)||/^> טיוטה;/.test(t)||/^תורת הנרות היפניים\s*\|/.test(t)||/^יחידה\s*\|/.test(t)||/^שיעור\s*[—-]\s*[45]\./.test(t)||/^טיוטת תוכן והמחשה/.test(t)||/^ח ו מ ר ל י מ ו ד י/.test(t)||/^\d{2,3}$/.test(t)||/^מקורות(?:\s|:| לקריאה)/.test(t)||/^נקודות למוצר האתר ולבקרת איכות/.test(t)}
function extract(raw){let blocks=raw.replace(/\r/g,'')
.split(/\n\s*\n+/).flatMap(b=>b.split(/\n(?=\s*(?:דוג׳י רגיל|דוג׳י ארוך־רגליים|דוג׳י שפירית|דוג׳י אבן קבורה)\s*\()/))
.map(b=>clean(b.replace(/\s*\n\s*/g,' '))).filter(Boolean);let result=[];let afterProduction=false;for(let b of blocks){if(/^נקודות למוצר האתר ולבקרת איכות/.test(b))afterProduction=true;if(afterProduction||suppressed(b)||b.includes('גרסת עבודה לביקורת |'))continue;if(/^איור\s*[—\d]|^כרטיסים\s*\d|המחשה לימודית סינתטית/.test(b)){result.push({kind:'figure',text:b});continue;}let isHead=b.length<=105&&!/[.!?][\u0590-\u05ff]/.test(b)&&!/(?:\d{3,}|O=|H=|L=|C=|https?:\/\/)/.test(b)&&(!b.includes(' — ')||b.length<66)&&b.split(' ').length<=15;
if(/^מטרת השיעור$|^מטרה\s*:|^תרגול|^פתרון|^מפתח|^הערכה עצמית|^שאלות המשך|^בדיקת יחידה|^כללי התרגול/.test(b))isHead=true;
result.push({kind:isHead?'heading':'paragraph',text:b});}
return result}
function labelClass(t){if(/^(תרגול|שאלות המשך|בדיקת יחידה|הערכה עצמית|כללי התרגול)/.test(t))return 'exercise';if(/^(פתרון|מפתח)/.test(t))return 'solution';if(/^(מטרת השיעור|מטרה)/.test(t))return 'intro';return ''}
function addBilingualText(element,text){
  // Keep original words, isolate technical Latin terms, numerals, prices and formulas from Hebrew direction.
  const pattern=/\b(?:[A-Za-z]+(?:[ -][A-Za-z]+)*|[A-Z]\d?=\d+(?:\.\d+)?|\d+(?:\.\d+)?%?)\b/g;
  let last=0,match;
  while((match=pattern.exec(text))!==null){
    if(match.index>last)element.append(document.createTextNode(text.slice(last,match.index)));
    let token=node('bdi','term-ltr',match[0]);token.dir='ltr';element.append(token);last=pattern.lastIndex;
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
function addFigure(section,label,idx){const x=node('div','fig-placeholder');x.append(node('strong','','איור לימודי מתוך חומר המקור — '+idx));x.append(node('div','',label));x.append(node('small','','קובץ האיור עצמו עדיין חסר בריפו. לא נוסף תרשים משוער.'));section.append(x)}
function compose(parts){const frag=document.createDocumentFragment();let current=null,sectionNumber=0,figureNumber=0;for(let part of parts){if(part.kind==='heading'){sectionNumber++;let section=node('section','section '+labelClass(part.text));let h=node('h3','');h.dir='rtl';addBilingualText(h,part.text);section.append(h);frag.append(section);current=section;continue;}if(!current){sectionNumber++;current=node('section','section intro');current.append(node('h3','','מה נלמד בשיעור הזה?'));frag.append(current)}
if(part.kind==='figure')addFigure(current,part.text,++figureNumber);else addContent(current,part.text)}return {fragment:frag,figureNumber,sectionNumber}}
async function openLesson(index){if(index<0||index>=12)return;selected=index;let buttons=nav.querySelectorAll('button');buttons.forEach((button,i)=>button.classList.toggle('selected',i===index));host.replaceChildren(node('p','status','טוען את שיעור 4.'+(index+1)+'...'));let source=sources[index],raw;
try{raw=cache.get(source);if(!raw){const resp=await fetch(root+'docs/course-workspace/lessons/'+source+'.md');if(!resp.ok)throw Error('קובץ מקור לא זמין: '+resp.status);raw=await resp.text();cache.set(source,raw)}if(selected!==index)return;host.replaceChildren();let hero=node('div','hero'),img=node('img');img.src='assets/candlesticks-unit4/lesson-4-'+String(index+1).padStart(2,'0')+'.webp';img.alt='תמונת שער שיעור 4.'+(index+1);img.loading='lazy';hero.append(img);let block=node('div','hero-text');block.append(node('div','kicker','יחידה 4 · '+(index<5?'חלק א׳ — תבניות נר בודד':'חלק ב׳ — תבניות שני נרות')));block.append(node('h2','','4.'+(index+1)+' — '+titles[index]));block.append(node('div','meta','גרסת תוכן לעריכה · מקור '+source+' · טרם אושר לפרסום'));hero.append(block);host.append(hero);
let elements=extract(raw);let {fragment,figureNumber,sectionNumber}=compose(elements);host.append(fragment);if(!figureNumber){host.append(node('div','fig-placeholder','איורי ההוראה הפנימיים לא זוהו כקבצים נפרדים. יש לבצע התאמה מול ה־PDF המקורי.'))}
let footer=node('div','actions'),prev=node('button','','השיעור הקודם'),next=node('button','','השיעור הבא');prev.disabled=index===0;next.disabled=index===11;prev.onclick=()=>openLesson(index-1);next.onclick=()=>openLesson(index+1);footer.append(prev,next);host.append(footer);
let details=node('details','source-preview'),summary=node('summary','','לבדיקת התאמה: תמלול המקור ללא עריכה');details.append(summary,node('pre','',raw));host.append(details);
const solutions=host.querySelectorAll('.section.solution');for(const section of solutions){let h=section.querySelector('h3'),remaining=[...section.children].filter(e=>e!==h),d=node('details');d.append(node('summary','','הצגת פתרון והסבר'));let body=node('div','solution-body');remaining.forEach(e=>body.append(e));d.append(body);section.append(d)}
window.scrollTo(0,0);
}catch(e){host.replaceChildren(node('div','status','שגיאה בטעינת השיעור: '+e.message))}}
titles.forEach((title,i)=>{if(i===0||i===5)nav.append(node('div','part-label',i===0?'חלק א׳ — תבניות נר בודד':'חלק ב׳ — תבניות שני נרות'));let b=node('button','','4.'+(i+1)+' — '+title);b.onclick=()=>openLesson(i);nav.append(b)});
const n=Number(new URLSearchParams(location.search).get('lesson'));openLesson(n>=1&&n<=12?n-1:0);
})();