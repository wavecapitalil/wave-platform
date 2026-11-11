(()=>{'use strict';
const $=s=>document.querySelector(s),nav=$('#lesson-nav'),body=$('#lesson-body');
const titles=['סיכון לעסקה וגודל פוזיציה','סטופ, יעד ויחס סיכוי–סיכון','אחוז הצלחה ותוחלת','רצפי הפסד, Drawdown והטיית הישרדות','מינוף, החלקה, עמלות וסיכון לילה'];
let data=null,active=0;
const el=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e};
// Keep financial notation intact as a single LTR token inside Hebrew paragraphs.
// Numeric groups include thousands separators, decimal points, signs, currency,
// percentages, R-multiples and leverage multipliers. Preserve original source text.
const FINANCIAL_TOKEN_RX=/(?:[+−-]?[$€₪]?\d{1,3}(?:,\d{3})+(?:\.\d+)?|[+−-]?[$€₪]?\d+(?:\.\d+)?)(?:%|R|×|x)?|[A-Za-z][A-Za-z0-9]*(?:[ /-][A-Za-z][A-Za-z0-9]*)*/g;
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
function diagram(type){
 const models={
 sizing:{title:'Position sizing',items:[['Capital','$10,000'],['Risk budget','$50'],['Price risk / unit','$2'],['Quantity','25 units']],note:'לפני עלויות · 50 ÷ 2 = 25'},
 'risk-limit':{title:'Planned vs actual risk',items:[['Planned stop','98'],['Possible fill','96.5'],['Risk unit','2 → 3.5'],['Limit','Not guaranteed']],note:'פער והחלקה עלולים להגדיל את ההפסד'},
 levels:{title:'Trade levels',items:[['Target','104'],['Entry','100'],['Stop','98'],['Risk / Reward','2 / 4']],note:'דוגמת לונג סינתטית'},
 rr:{title:'Reward to risk',items:[['Entry','100'],['Stop','98'],['Target','104'],['Ratio','2 : 1']],note:'2R פוטנציאלי לפני עלויות'},
 'late-entry':{title:'Same setup — later entry',items:[['Early entry','100 → 2R'],['Late entry','103 → 0.2R']],note:'אותם סטופ ויעד · מחיר כניסה אחר'},
 expectancy:{title:'Expectancy comparison',items:[['Model A','40% win'],['Avg win','2R'],['Net E','+0.15R'],['Model B E','−0.09R']],note:'דוגמאות מתמטיות בלבד, לא תוצאות Backtest'},
 sample:{title:'Sample and testing',items:[['Define','Rules'],['Record','All trades'],['Review','Costs'],['Validate','Out of sample']],note:'אין לבחור רק מקרים שנראים מוצלחים'},
 drawdown:{title:'Peak → trough → recovery',items:[['Peak','$10,000'],['Trough','$8,000'],['Drawdown','−20%'],['Recovery','+25%']],note:'אחוז ההתאוששות נמדד מההון שנותר'},
 'fixed-relative':{title:'Ten losses — two models',items:[['Starting','$10,000'],['Fixed −$100','$9,000'],['Relative −1%','$9,043.82']],note:'ללא עלויות וללא החלקה · חישוב היפותטי'},
 survival:{title:'Survivorship bias',items:[['Started','100 cases'],['Visible','10 winners'],['Missing','90 outcomes']],note:'מספרים סינתטיים להדגמת בחירת מדגם — לא נתון אמיתי'},
 leverage:{title:'Exposure and equity',items:[['Exposure','$10,000'],['Equity','$1,000'],['Leverage','10×'],['−2% price','−$200']],note:'הדגמה פשוטה, לפני עלויות'},
 'stop-orders':{title:'Stop orders',items:[['Stop Market','Fill sought'],['Price','Not fixed'],['Stop Limit','Price bounded'],['Risk','No fill']],note:'מנגנון ההפעלה תלוי בזירה ובסוג ההוראה'},
 slippage:{title:'Gap through stop',items:[['Entry','100'],['Planned stop','98'],['Actual fill','96.5'],['Loss','−1.75R']],note:'25 יחידות · לפני עמלות'},
 overnight:{title:'Overnight risk',items:[['Prior close','100'],['Market gap','96.5'],['Stop planned','98'],['Next fill','Uncertain']],note:'קו סטופ על הגרף אינו הבטחה למחיר עסקה'}
 };
 const m=models[type]||models.sizing, colors=['#91d4fc','#55deb3','#d5b4ff','#f29d9d'];const fig=el('figure','diagram');
 const esc=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
 let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 340" role="img" aria-label="'+esc(m.title)+'"><rect width="900" height="340" rx="14" fill="#071b30"/><text x="450" y="48" fill="#edf8ff" font-family="Arial" font-size="27" font-weight="700" text-anchor="middle">'+esc(m.title)+'</text>';
 const items=m.items;const gap=16,width=(820-(items.length-1)*gap)/items.length;
 items.forEach((v,i)=>{const x=40+i*(width+gap),y=92;svg+='<rect x="'+x+'" y="'+y+'" width="'+width+'" height="155" rx="14" fill="#10324e" stroke="'+colors[i%4]+'" stroke-width="2"/><text x="'+(x+width/2)+'" y="138" font-family="Arial" font-size="'+(items.length===4?19:22)+'" text-anchor="middle" fill="#c3dcee">'+esc(v[0])+'</text><text x="'+(x+width/2)+'" y="199" font-family="Arial" font-size="'+(items.length===4?24:27)+'" font-weight="700" text-anchor="middle" fill="'+colors[i%4]+'">'+esc(v[1])+'</text>'});
 svg+='<path d="M40 277H860" stroke="#345d79" stroke-width="1.5"/><text x="450" y="310" fill="#c0d8e9" font-family="Arial" font-size="16" text-anchor="middle">'+esc(m.title)+'</text></svg>';
 fig.innerHTML=svg;fig.append(el('figcaption',null,m.note+' · תרשים וקטורי מקורי להמחשה, לא נתוני מסחר אמיתיים'));return fig;
}
function renderSection(s){
 const block=el('section','section'),h=el('h2');bilingual(h,s.h);block.append(h);
 if(s.kind==='steps'){const list=el('div','learning-steps');s.items.forEach(([heading,copy])=>{let item=el('div','learning-step'),strong=el('strong'),p=el('p');bilingual(strong,heading);bilingual(p,copy);item.append(strong,p);list.append(item)});block.append(list)}
 else if(s.kind==='quiz'){const list=el('div','quiz');s.q.forEach(([q,a],i)=>{const div=el('div','question'),p=el('p'),details=el('details'),summary=el('summary',null,'הצגת פתרון והסבר'),answer=el('div','answer');bilingual(p,(i+1)+'. '+q);bilingual(answer,a);details.append(summary,answer);div.append(p,details);list.append(div)});block.append(list)}
 else (s.p||[]).forEach(par=>{let p=el('p');bilingual(p,par);block.append(p)});
 if(s.formula){const f=el('div','wave-formula');f.dir='ltr';f.textContent=s.formula;block.append(f)}if(s.figure)block.append(diagram(s.figure));return block;
}
const SOURCE_UNIT=9,DISPLAY_UNIT=8;
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
function render(i){if(!data)return;active=Math.max(0,Math.min(data.lessons.length-1,i));const lesson=data.lessons[active];
 $('#lesson-title').textContent='8.'+(active+1)+' — '+lesson.title;$('#lesson-intro').textContent=lesson.intro;
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
fetch('assets/candlesticks-unit8/unit8-learning-content-review.json?v=2').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(json=>{if(json.status!=='review_only_not_approved_for_students'||json.lessons.length!==5)throw Error('invalid lesson package');data=json;
 json.lessons.forEach((lesson,i)=>{let button=el('button'),number=el('span','num','8.'+(i+1)),name=el('span',null,lesson.title);button.type='button';button.append(number,name);button.addEventListener('click',()=>render(i));nav.append(button)});
 const param=Number(new URLSearchParams(location.search).get('lesson'));render(param>=1&&param<=5?param-1:0);
}).catch(err=>{$('#lesson-title').textContent='לא ניתן לטעון את יחידה 8';$('#lesson-intro').textContent='הקובץ אינו זמין כעת: '+err.message});
})();