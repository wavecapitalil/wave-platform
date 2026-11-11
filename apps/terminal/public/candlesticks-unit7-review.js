(()=>{'use strict';
const $=s=>document.querySelector(s),nav=$('#lesson-nav'),body=$('#lesson-body');
const titles=['מתי תבנית היא רק תצפית','אישור וביטול של רעיון','תרחישי עלייה, ירידה ואי־פעולה','דוגמאות לפי שווקים וטווחי זמן'];
let data=null,active=0;
const el=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e};
function bilingual(node,value){
 const str=String(value),rx=/\b(?:[A-Za-z][A-Za-z0-9]*)(?:[\s/-][A-Za-z][A-Za-z0-9]*)*\b|\b\d+(?:\.\d+)?\b/g;let i=0,m;
 while((m=rx.exec(str))){if(m.index>i)node.append(document.createTextNode(str.slice(i,m.index)));let b=el('bdi',null,m[0]);b.dir='ltr';node.append(b);i=rx.lastIndex}
 if(i<str.length)node.append(document.createTextNode(str.slice(i)));
}
function boxLine(x,y,x2,y2,color='#456a85',dash=''){return '<line x1="'+x+'" y1="'+y+'" x2="'+x2+'" y2="'+y2+'" stroke="'+color+'" stroke-width="1.3"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>'}
const priceY=n=>304-(n-94)/16*223;
function frame(name){
 let s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 370" role="img" aria-label="'+name+'"><rect x="0" y="0" width="900" height="370" rx="12" fill="#071b30"/>';
 [96,98,100,102,104,106,108,110].forEach(v=>{let y=priceY(v);s+=boxLine(32,y,810,y,'#2b4e6b','5 8')+'<text x="828" y="'+(y+5)+'" fill="#abc8e0" font-family="Arial" font-size="16">'+v+'</text>'});
 return s+boxLine(810,65,810,321,'#8eb5cf');
}
function candle(x,o,h,l,c){const up=c>=o,col=up?'#33d4a6':'#e96c7b',a=priceY(Math.max(o,c)),b=priceY(Math.min(o,c));return '<line x1="'+x+'" y1="'+priceY(h)+'" x2="'+x+'" y2="'+priceY(l)+'" stroke="'+col+'" stroke-width="5" stroke-linecap="round"/><rect x="'+(x-24)+'" y="'+a+'" width="48" height="'+Math.max(4,b-a)+'" rx="3" fill="'+(up?'#159c7f':'#bb4057')+'" stroke="'+col+'" stroke-width="2"/>'}
function txt(x,y,s,color='#d8eafa',size=17){return '<text x="'+x+'" y="'+y+'" font-family="Arial" font-size="'+size+'" fill="'+color+'" text-anchor="middle">'+s+'</text>'}
function diagram(type){
 let svg='';
 if(type==='observation'){
 svg=frame('זוג בולען שורי לאחר רצף יורד לצד אזור המחיר 98 עד 100');
 [[110,108,110,104,105],[190,105,107,100,101],[270,102,104,98,99],[350,101,103,97,98],[430,98,100,96,99],[510,99,105,97,104]].forEach(p=>svg+=candle(...p));
 svg+='<rect x="60" y="'+priceY(100)+'" width="680" height="'+(priceY(98)-priceY(100))+'" fill="#2fa9d0" opacity=".13"/>'+boxLine(40,priceY(104),780,priceY(104),'#efc47c','7 7')+txt(650,priceY(104)-10,'Level 104','#f2ce90',15)+txt(460,340,'תצפית · פרשנות · תנאי להמשך','#c6ddeb',19);
 }else if(type==='confirmation'){
 svg=frame('רמות אישור מעל 104 וביטול מתחת 98, שלושה נרות לבדיקת התנאי');
 svg+=candle(155,102,104,98,100)+candle(305,100,104.5,99,103.8)+candle(455,103.8,106,102,105);
 svg+=boxLine(50,priceY(104),790,priceY(104),'#47d6b1','8 6')+boxLine(50,priceY(98),790,priceY(98),'#eb8991','8 6');
 svg+=txt(610,priceY(104)-11,'סגירה מעל 104','#71e4c4',17)+txt(630,priceY(98)+25,'ביטול מתחת 98','#f7abb0',17);
 svg+=txt(305,338,'104.5 High · 103.8 Close','#bdd7e9',17)+txt(455,360,'105 Close','#a0efd6',16);
 }else if(type==='branches'){
 svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 370" role="img" aria-label="מפת החלטה לשלוש תוצאות אפשריות מאותה נקודת מוצא"><rect width="900" height="370" rx="12" fill="#071b30"/>';
 const cases=[{x:160,c:'#2cd7a5',y:105,name:'105',desc:'בחינת התאוששות'},{x:450,c:'#89b9ed',y:101,name:'101',desc:'המתנה'},{x:740,c:'#f08491',y:97,name:'97',desc:'ביטול הרעיון'}];
 svg+='<rect x="353" y="26" width="194" height="53" rx="11" fill="#16486c" stroke="#6bb6e8" stroke-width="2"/>'+txt(450,60,'נקודת החלטה: 100','#f1f7ff',20);
 cases.forEach(v=>{svg+='<path d="M450 80 Q450 118 '+v.x+' 153" fill="none" stroke="'+v.c+'" stroke-width="3" stroke-dasharray="6 7"/><rect x="'+(v.x-118)+'" y="155" width="236" height="138" rx="15" fill="#102f4a" stroke="'+v.c+'" stroke-width="2"/>'+txt(v.x,204,'Close = '+v.name,'#f2f9ff',24)+txt(v.x,247,v.desc,v.c,19)});
 svg+=txt(450,338,'התרחישים חלופיים — לא שלושה נרות שבאו זה אחר זה','#a6c2d9',17);
 }else{
 svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 370" role="img" aria-label="ארבעה סוגי מכשירים, אותן אותיות OHLC אך תנאי מסחר שונים"><rect width="900" height="370" rx="12" fill="#071b30"/>';
 const cases=[['מניות','שעות מסחר','בפערי פתיחה'],['Forex','Bid / Ask','שוק מבוזר'],['חוזה מדד','מכפיל חוזה','ערך נקודה'],['קריפטו','Spot / Perp','זירה ומימון']];
 cases.forEach((v,i)=>{let x=18+i*221;svg+='<rect x="'+x+'" y="50" width="204" height="260" rx="15" fill="#0d2b46" stroke="#436e90" stroke-width="2"/>'+txt(x+102,95,v[0],'#a7dbff',20)+candle(x+102,102,107,98,105)+txt(x+102,250,v[1],'#e7f4ff',17)+txt(x+102,281,v[2],'#b6cfe1',16)});
 svg+=txt(450,343,'צורת המחיר דומה, אך מקור הנתונים ומנגנון הביצוע שונים','#bdd4e8',16);
 }
 svg+='</svg>';
 const fig=el('figure','diagram');fig.innerHTML=svg;const cap=el('figcaption',null,'תרשים וקטורי מקורי · מחירים ומכשירים לצורכי המחשה בלבד; לא נתוני שוק אמיתיים');fig.append(cap);return fig;
}
function renderSection(s){
 const block=el('section','section'),h=el('h2');bilingual(h,s.h);block.append(h);
 if(s.kind==='steps'){const list=el('div','learning-steps');s.items.forEach(([heading,copy])=>{let item=el('div','learning-step'),strong=el('strong'),p=el('p');bilingual(strong,heading);bilingual(p,copy);item.append(strong,p);list.append(item)});block.append(list)}
 else if(s.kind==='quiz'){const list=el('div','quiz');s.q.forEach(([q,a],i)=>{const div=el('div','question'),p=el('p'),details=el('details'),summary=el('summary',null,'הצגת פתרון והסבר'),answer=el('div','answer');bilingual(p,(i+1)+'. '+q);bilingual(answer,a);details.append(summary,answer);div.append(p,details);list.append(div)});block.append(list)}
 else (s.p||[]).forEach(par=>{let p=el('p');bilingual(p,par);block.append(p)});
 if(s.figure)block.append(diagram(s.figure));return block;
}
function render(i){if(!data)return;active=Math.max(0,Math.min(data.lessons.length-1,i));const lesson=data.lessons[active];
 $('#lesson-title').textContent='7.'+(active+1)+' — '+lesson.title;$('#lesson-intro').textContent=lesson.intro;
 body.replaceChildren();
 const goals=el('section','goals'),heading=el('h2',null,'מה נלמד בשיעור?'),ul=el('ul');
 lesson.goals.forEach(str=>{const li=el('li');bilingual(li,str);ul.append(li)});goals.append(heading,ul);body.append(goals);
 lesson.sections.forEach(section=>body.append(renderSection(section)));
 [...nav.querySelectorAll('button')].forEach((b,k)=>{b.classList.toggle('active',k===active);if(k===active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
 $('#prev').disabled=active===0;$('#next').disabled=active===data.lessons.length-1;
 $('#progress-text').textContent='שיעור 7.'+(active+1)+' מתוך 4 · סביבת ביקורת — ללא סימון השלמה';
 history.replaceState(null,'','?lesson='+(active+1));window.scrollTo(0,0);
}
$('#prev').addEventListener('click',()=>render(active-1));$('#next').addEventListener('click',()=>render(active+1));
fetch('assets/candlesticks-unit7/unit7-learning-content-review.json?v=1').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(json=>{if(json.status!=='review_only_not_approved_for_students'||json.lessons.length!==4)throw Error('invalid lesson package');data=json;
 json.lessons.forEach((lesson,i)=>{let button=el('button'),number=el('span','num','7.'+(i+1)),name=el('span',null,lesson.title);button.type='button';button.append(number,name);button.addEventListener('click',()=>render(i));nav.append(button)});
 const param=Number(new URLSearchParams(location.search).get('lesson'));render(param>=1&&param<=4?param-1:0);
}).catch(err=>{$('#lesson-title').textContent='לא ניתן לטעון את יחידה 7';$('#lesson-intro').textContent='הקובץ אינו זמין כעת: '+err.message});
})();