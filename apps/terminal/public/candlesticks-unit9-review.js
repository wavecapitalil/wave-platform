(()=>{'use strict';
const $=s=>document.querySelector(s),nav=$('#lesson-nav'),body=$('#lesson-body');
const titles=['תהליך ניתוח נקי','עבודה ללא מידע עתידי','יומן תצפיות ועסקאות','מדדי הצלחה ובדיקת אסטרטגיה','מבחן מסכם ותיק עבודות'];
let data=null,active=0;
const el=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e};
// Keep financial notation intact as a single LTR token inside Hebrew paragraphs.
// Numeric groups include thousands separators, decimal points, signs, currency,
// percentages, R-multiples and leverage multipliers. Preserve original source text.
const FINANCIAL_TOKEN_RX=/(?:[+−-]?[$€₪]?\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|[+−-]?[$€₪]?\\d+(?:\\.\\d+)?)(?:%|R|×|x)?|[A-Za-z][A-Za-z0-9]*(?:[ /-][A-Za-z][A-Za-z0-9]*)*/g;
function bilingual(node,value){
 const str=String(value);let last=0,match;
 FINANCIAL_TOKEN_RX.lastIndex=0;
 while((match=FINANCIAL_TOKEN_RX.exec(str))!==null){
  if(match.index>last)node.append(document.createTextNode(str.slice(last,match.index)));
  const token=el('bdi','wave-ltr-token',match[0]);token.dir='ltr';
  node.append(token);last=FINANCIAL_TOKEN_RX.lastIndex;
 }
 if(last<str.length)node.append(document.createTextNode(str.slice(last)));
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
const svgEsc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const scaleY=v=>285-(v-94)*13;
function graphic(title,marks=[],options={}){
 let out='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 360" role="img" aria-label="'+svgEsc(title)+'"><rect x="0" y="0" width="900" height="360" rx="13" fill="#071b30"/>';
 for(const n of [96,100,104,108]){const y=scaleY(n);out+='<line x1="54" y1="'+y+'" x2="803" y2="'+y+'" stroke="#35556e" stroke-dasharray="5 7"/><text x="826" y="'+(y+4)+'" fill="#bdd5e6" font-size="14" font-family="Arial">'+n+'</text>';}
 out+='<line x1="805" y1="50" x2="805" y2="302" stroke="#6087a4"/>';
 const candle=(x,o,h,l,c)=>{const col=c>=o?'#49dbab':'#eb7188',yt=scaleY(Math.max(o,c)),yb=scaleY(Math.min(o,c));return '<line x1="'+x+'" x2="'+x+'" y1="'+scaleY(h)+'" y2="'+scaleY(l)+'" stroke="'+col+'" stroke-width="4"/><rect x="'+(x-18)+'" y="'+yt+'" width="36" height="'+Math.max(3,yb-yt)+'" fill="'+(c>=o?'#178c75':'#ac4557')+'" stroke="'+col+'" stroke-width="1.5"/>'};
 marks.forEach((p,i)=>out+=candle(118+i*(marks.length>6?74:103),...p));
 if(options.levels)options.levels.forEach(l=>{out+='<line x1="55" x2="800" y1="'+scaleY(l.value)+'" y2="'+scaleY(l.value)+'" stroke="'+(l.color||'#78c8f5')+'" stroke-dasharray="8 5" stroke-width="2"/><text x="700" y="'+(scaleY(l.value)-9)+'" fill="'+(l.color||'#9edcff')+'" font-size="14" font-family="Arial" text-anchor="middle">'+svgEsc(l.name)+'</text>'});
 out+='<text x="440" y="30" font-size="20" fill="#e8f6ff" text-anchor="middle" font-family="Arial">'+svgEsc(title)+'</text>';
 if(options.tag)out+='<text x="440" y="335" font-size="15" fill="#b9cee0" text-anchor="middle" font-family="Arial">'+svgEsc(options.tag)+'</text>';
 return out+'</svg>';
}
function cardGraphic(title,rows){
 let s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 320" role="img" aria-label="'+svgEsc(title)+'"><rect width="900" height="320" fill="#071b30" rx="13"/><text x="450" y="45" fill="#e9f5fd" font-size="24" text-anchor="middle" font-family="Arial">'+svgEsc(title)+'</text>';
 const w=(820-(rows.length-1)*14)/rows.length;
 rows.forEach((row,i)=>{const x=40+i*(w+14);s+='<rect x="'+x+'" y="88" width="'+w+'" height="154" rx="14" fill="#12314f" stroke="'+(['#7acff7','#5cdbba','#c9a6ff','#eea59d'][i%4])+'" stroke-width="2"/><text x="'+(x+w/2)+'" y="136" fill="#bbd9eb" text-anchor="middle" font-size="19" font-family="Arial">'+svgEsc(row[0])+'</text><text x="'+(x+w/2)+'" y="199" fill="#fff" text-anchor="middle" font-size="24" font-family="Arial" font-weight="700">'+svgEsc(row[1])+'</text>'});
 return s+'</svg>';
}
function diagram(type){
 const models={
 analysis:()=>graphic('Clean analysis — candle 9',[[107,109,104,105],[105,106,101,102],[102,103,98,99],[99,101,97,100],[100,104,98,102]],{levels:[{value:104,name:'Confirmation 104'},{value:98,name:'Invalidation 98',color:'#f19c9f'}],tag:'OHLC (candle 9): O 100  H 104  L 98  C 102'}),
 replay:()=>graphic('Replay — stop before the next candle',[[108,109,104,105],[105,106,101,102],[102,103,98,99],[99,102,97,100],[100,104,98,102]],{levels:[{value:104,name:'Rule 104'}],tag:'Only past data is visible · next candle hidden'}),
 ambiguous:()=>graphic('Same OHLC cannot reveal intrabar order',[[100,109,96,101]],{levels:[{value:108,name:'Target 108'},{value:97,name:'Stop 97',color:'#f19c9f'}],tag:'High 109 · Low 96 · order of touches unknown'}),
 journal:()=>cardGraphic('Plan versus execution',[['Planned entry','100'],['Actual fill','100.10'],['Net P/L','+$72'],['Realized result','+1.8R']]),
 split:()=>cardGraphic('Separate development from testing',[['Development','Choose rules'],['Lock rules','Version 1'],['Out of sample','New period']]),
 metrics:()=>cardGraphic('Five synthetic net outcomes',[['Trade 1','+2R'],['Trade 2','−1R'],['Trade 3','−1R'],['Trade 4','+2R'],['Trade 5','−1R']])
 };
 let svg=(models[type]||models.analysis)();const fig=el('figure','diagram');fig.innerHTML=svg;fig.append(el('figcaption',null,'איור SVG מקורי עם נתונים סינתטיים לצורכי לימוד בלבד.'));return fig;
}
function examChart(letter){
 const m={
 A:graphic('A — Downtrend, lower wick',[[109,110,105,106],[106,108,102,103],[103,105,99,100],[100,102,97,98],[98,101,94,100]],{tag:'Past candles only · describe the last candle'}),
 B:graphic('B — Rising context and engulfing pair',[[97,100,96,99],[99,103,98,102],[102,105,101,104],[102,105,100,104],[105,107,98,99]],{tag:'Compare both bodies and both ranges'}),
 C:graphic('C — Touch versus close',[[100,103,98,102],[102,105,100,104],[104,106,102,103],[103,107,102,106]],{levels:[{value:105,name:'Close > 105'}],tag:'Compare candle 3 and candle 4'}),
 D:cardGraphic('D — Two timeframes (synthetic)',[['Daily trend','Higher highs'],['4H move','Local pullback'],['Interpretation','Context matters']]),
 E:graphic('E — Planned entry, stop, target',[[98,102,97,100],[100,103,99,102]],{levels:[{value:106,name:'Target 106'},{value:100,name:'Entry 100'},{value:97,name:'Stop 97',color:'#f19c9f'}],tag:'Capital 20,000 · risk 0.5% · cost 0.25 per unit'})
 };
 const f=el('figure','diagram');f.innerHTML=m[letter]||m.A;f.append(el('figcaption',null,'דוגמת מבחן סינתטית שנבנתה מחדש לצורך ההמחשה; אינה איור המקור מתוך PDF.'));return f;
}
function renderSection(s){
 const block=el('section','section'),h=el('h2');bilingual(h,s.h);block.append(h);
 if(s.kind==='chart-task'){const task=el('div','chart-task');task.append(el('div','wave-task-label','משימת גרף '+s.chart));task.append(examChart(s.chart));const p=el('p','task-prompt');bilingual(p,s.prompt);task.append(p);const note=el('textarea','task-form');note.placeholder='כתבו כאן את הניתוח לפני הצגת הפתרון...';note.setAttribute('aria-label','תשובה למשימה '+s.chart);task.append(note);const details=el('details','task-solution'),summary=el('summary',null,'הצגת פתרון והסבר'),answer=el('div','task-answer');bilingual(answer,s.answer);details.append(summary,answer);task.append(details);block.append(task)}
 else if(s.kind==='exercise'){const p=el('p');bilingual(p,s.prompt);block.append(p);const field=el('textarea','task-form');field.setAttribute('aria-label','תשובה לתרגול');field.placeholder='כתבו כאן את הניתוח שלכם לפני הצגת מחוון הבדיקה...';block.append(field);const d=el('details','task-solution'),sm=el('summary',null,'הצגת מחוון הבדיקה'),ans=el('div','task-answer');bilingual(ans,s.answer);d.append(sm,ans);block.append(d)}
 else if(s.kind==='steps'){const list=el('div','learning-steps');s.items.forEach(([heading,copy])=>{let item=el('div','learning-step'),strong=el('strong'),p=el('p');bilingual(strong,heading);bilingual(p,copy);item.append(strong,p);list.append(item)});block.append(list)}
 else if(s.kind==='quiz'){const list=el('div','quiz');s.q.forEach(([q,a],i)=>{const div=el('div','question'),p=el('p'),details=el('details'),summary=el('summary',null,'הצגת פתרון והסבר'),answer=el('div','answer');bilingual(p,(i+1)+'. '+q);bilingual(answer,a);details.append(summary,answer);div.append(p,details);list.append(div)});block.append(list)}
 else (s.p||[]).forEach(par=>{let p=el('p');bilingual(p,par);block.append(p)});
 if(s.formula){const f=el('div','wave-formula');f.dir='ltr';f.textContent=s.formula;block.append(f)}if(s.figure)block.append(diagram(s.figure));return block;
}
function render(i){if(!data)return;active=Math.max(0,Math.min(data.lessons.length-1,i));const lesson=data.lessons[active];
 $('#lesson-title').textContent='9.'+(active+1)+' — '+lesson.title;$('#lesson-intro').textContent=lesson.intro;
 body.replaceChildren();
 const goals=el('section','goals'),heading=el('h2',null,'מה נלמד בשיעור?'),ul=el('ul');
 lesson.goals.forEach(str=>{const li=el('li');bilingual(li,str);ul.append(li)});goals.append(heading,ul);body.append(goals);
 lesson.sections.forEach(section=>body.append(renderSection(section)));
 [...nav.querySelectorAll('button')].forEach((b,k)=>{b.classList.toggle('active',k===active);if(k===active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
 $('#prev').disabled=active===0;$('#next').disabled=active===data.lessons.length-1;
 $('#progress-text').textContent='שיעור 8.'+(active+1)+' מתוך 5 · סביבת ביקורת — ללא סימון השלמה';
 history.replaceState(null,'','?lesson='+(active+1));window.scrollTo(0,0);
}
$('#prev').addEventListener('click',()=>render(active-1));$('#next').addEventListener('click',()=>render(active+1));
fetch('assets/candlesticks-unit9/unit9-learning-content-review.json?v=1').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(json=>{if(json.status!=='review_only_not_approved_for_students'||json.lessons.length!==5)throw Error('invalid lesson package');data=json;
 json.lessons.forEach((lesson,i)=>{let button=el('button'),number=el('span','num','9.'+(i+1)),name=el('span',null,lesson.title);button.type='button';button.append(number,name);button.addEventListener('click',()=>render(i));nav.append(button)});
 const param=Number(new URLSearchParams(location.search).get('lesson'));render(param>=1&&param<=5?param-1:0);
}).catch(err=>{$('#lesson-title').textContent='לא ניתן לטעון את יחידה 9';$('#lesson-intro').textContent='הקובץ אינו זמין כעת: '+err.message});
})();