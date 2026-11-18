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
const SOURCE_UNIT=8,DISPLAY_UNIT=7;
function progressKey(i){return 'wave.candles.v1.lesson.'+String(SOURCE_UNIT).padStart(2,'0')+'-'+String(i+1).padStart(2,'0')}
function completed(i){try{return localStorage.getItem(progressKey(i))==='done'}catch(_){return false}}
function progressText(){const count=data.lessons.filter((_,i)=>completed(i)).length;return 'הושלמו '+count+' מתוך '+data.lessons.length+' שיעורים · שיעור '+DISPLAY_UNIT+'.'+(active+1)}
function completionUI(){
 const previous=document.getElementById('review-completion');if(previous)previous.remove();
 const panel=el('section','review-completion');panel.id='review-completion';panel.setAttribute('aria-label','התקדמות לימודית אישית');
 const hint=el('p',null,'תנאי סימון: קראתי את ההסבר, בחנתי את ההמחשה ופתרתי את התרגול הזמין. סימון אישי אינו אישור גמר פדגוגי.');
 const button=el('button','review-complete-button');button.type='button';
 function paint(){const done=completed(active);button.textContent=done?'✓ בוצע — ביטול סימון השלמה':'סמן שיעור כהושלם';button.setAttribute('aria-pressed',String(done));$('#progress-text').textContent=progressText()}
 button.addEventListener('click',()=>{try{localStorage.setItem(progressKey(active),completed(active)?'':'done')}catch(_){}paint()});
 panel.append(hint,button);document.querySelector('#main').insertBefore(panel,document.querySelector('#main .actions'));paint();
}

/* Approved Unit 7 lesson marks: white circular heading style;
   lesson 7.3 retains green bullish and red bearish scenario candles. */
const unit7TopicPaths=["<g stroke=\"currentColor\" stroke-width=\"2.2\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 34V25M19 31V17M26 28V22M33 25V12\"/><rect x=\"10\" y=\"27\" width=\"4\" height=\"5\" rx=\".6\"/><rect x=\"17\" y=\"20\" width=\"4\" height=\"8\" rx=\".6\"/><rect x=\"24\" y=\"24\" width=\"4\" height=\"3\" rx=\".6\"/><rect x=\"31\" y=\"16\" width=\"4\" height=\"6\" rx=\".6\"/><circle cx=\"35\" cy=\"33\" r=\"5\"/><path d=\"M39 37L42 40\"/></g>","<g stroke=\"currentColor\" stroke-width=\"2.1\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M14 12V31M23 8V30M32 5V25\"/><rect x=\"11\" y=\"18\" width=\"6\" height=\"10\" rx=\".5\" fill=\"currentColor\" stroke=\"none\"/><rect x=\"20\" y=\"14\" width=\"6\" height=\"11\" rx=\".5\" fill=\"currentColor\" stroke=\"none\"/><rect x=\"29\" y=\"10\" width=\"6\" height=\"11\" rx=\".5\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M10 37H30\" stroke-dasharray=\"3 3\"/><circle cx=\"35\" cy=\"34\" r=\"8\" fill=\"#0d2947\"/><path d=\"M31 34L34 37L39 31\"/></g>","<g stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><g stroke=\"white\" fill=\"white\"><path d=\"M9 36V28M16 31V22M23 26V17\"/><rect x=\"7\" y=\"30\" width=\"4\" height=\"5\" rx=\".6\"/><rect x=\"14\" y=\"24\" width=\"4\" height=\"6\" rx=\".6\"/><rect x=\"21\" y=\"19\" width=\"4\" height=\"6\" rx=\".6\"/></g><circle cx=\"29\" cy=\"23\" r=\"2.6\" fill=\"#0d2947\" stroke=\"white\" stroke-width=\"2\"/><g stroke=\"#63d9a0\" fill=\"none\"><path d=\"M31 21L34 15L37 13\"/></g><g stroke=\"#63d9a0\" fill=\"#63d9a0\"><path d=\"M36 15V8M41 11V4\"/><rect x=\"34\" y=\"10\" width=\"4\" height=\"5\" rx=\".5\"/><rect x=\"39\" y=\"6\" width=\"4\" height=\"5\" rx=\".5\"/></g><g stroke=\"#f36a76\" fill=\"none\"><path d=\"M31 25L34 30L38 34\"/></g><g stroke=\"#f36a76\" fill=\"#f36a76\"><path d=\"M35 30V38M41 34V43\"/><rect x=\"33\" y=\"32\" width=\"4\" height=\"5\" rx=\".5\"/><rect x=\"39\" y=\"36\" width=\"4\" height=\"5\" rx=\".5\"/></g><path d=\"M32 23H43\" fill=\"none\" stroke=\"#d7e5f2\" stroke-width=\"1.6\" stroke-dasharray=\"2 3\"/></g>","<g stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\"><rect x=\"9\" y=\"11\" width=\"22\" height=\"17\" rx=\"2\"/><path d=\"M12 24L16 20L20 22L27 15\"/><rect x=\"18\" y=\"22\" width=\"22\" height=\"16\" rx=\"2\" fill=\"#0d2947\"/><path d=\"M21 34L25 29L30 31L36 26\"/></g>"];
function unit7TopicIcon(i){
 const icon=el('span','unit7-topic-icon');icon.setAttribute('aria-hidden','true');
 icon.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" focusable="false"><circle cx="24" cy="24" r="21" fill="none" stroke="white" stroke-width="2.5"/>'+unit7TopicPaths[i]+'</svg>';
 return icon;
}
function render(i){if(!data)return;active=Math.max(0,Math.min(data.lessons.length-1,i));const lesson=data.lessons[active];
 const title=$('#lesson-title');title.replaceChildren(unit7TopicIcon(active),el('span','', '7.'+(active+1)+' — '+lesson.title));$('#lesson-intro').textContent=lesson.intro;
 body.replaceChildren();
 const goals=el('section','goals'),heading=el('h2',null,'מה נלמד בשיעור?'),ul=el('ul');
 lesson.goals.forEach(str=>{const li=el('li');bilingual(li,str);ul.append(li)});goals.append(heading,ul);body.append(goals);
 lesson.sections.forEach(section=>body.append(renderSection(section)));
 [...nav.querySelectorAll('button')].forEach((b,k)=>{b.classList.toggle('active',k===active);if(k===active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
 $('#prev').disabled=active===0;$('#next').disabled=active===data.lessons.length-1;
 completionUI();
 history.replaceState(null,'','?lesson='+(active+1));window.scrollTo(0,0);
}
$('#prev').addEventListener('click',()=>render(active-1));$('#next').addEventListener('click',()=>render(active+1));
fetch('assets/candlesticks-unit7/unit7-learning-content-review.json?v=1').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(json=>{if(json.status!=='public_preview_pending_final_qa'||json.lessons.length!==4)throw Error('invalid lesson package');data=json;
 json.lessons.forEach((lesson,i)=>{let button=el('button'),number=el('span','num','7.'+(i+1)),name=el('span',null,lesson.title);button.type='button';button.append(number,name);button.addEventListener('click',()=>render(i));nav.append(button)});
 const param=Number(new URLSearchParams(location.search).get('lesson'));render(param>=1&&param<=4?param-1:0);
}).catch(err=>{$('#lesson-title').textContent='לא ניתן לטעון את יחידה 7';$('#lesson-intro').textContent='הקובץ אינו זמין כעת: '+err.message});
})();