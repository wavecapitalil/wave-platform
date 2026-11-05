(()=>{"use strict";
const lessons=window.WAVE_UNIT5_LESSONS;if(!Array.isArray(lessons)||lessons.length!==8){document.body.textContent="שגיאה בטעינת תוכן היחידה";return}
const $=s=>document.querySelector(s),list=$("#lesson-menu"),host=$("#lesson"),nav=$("#nextprev"),progress=$("#progress-text");
const params=new URLSearchParams(location.search);let current=Math.max(0,Math.min(7,(Number(params.get("lesson"))||1)-1));
const scenes={
upbreak:[97,100,104,108,105,110,114,111,117,120,116,119,123,119,115,112,109,111,107,105,108,104,101,99],
range:[100,103,106,109,106,103,99,101,106,110,108,104,101,99,103,107,109,105,101,98,100,104,107,102],
support:[115,111,107,104,101,98,101,104,109,105,101,99,103,107,110,106,103,98,102,107,111,108,112,114],
channel:[96,99,105,108,104,101,107,112,115,110,107,112,117,119,115,112,118,122,126,121,117,121,127,130],
down:[130,127,125,121,124,119,116,112,116,111,108,104,107,103,99,95,98,93,90,94,89,86,88,84],
falsebreak:[99,102,105,108,105,101,98,103,107,110,112,109,105,100,104,109,113,106,102,99,104,107,103,99],
breakout:[98,100,103,101,105,99,104,100,106,103,108,105,112,118,121,117,113,111,115,120,125,128,124,131],
story:[99,102,105,109,106,111,109,110,108,109,111,110,105,101,98,100,104,107,105,102,106,109,105,103],
trend:[100,103,107,105,110,113,109,115,118,116,120,123,119,125,129,126,123,127,132,129,134,137,133,139]
};
const titles={upbreak:"שינוי מבנה לאחר עלייה",range:"טווח בין אזורי מחיר",support:"בדיקה חוזרת של אזור תמיכה",channel:"תנועה בתוך ערוץ",down:"נסיגה ורצף יורד",falsebreak:"פריצת שווא וחזרה לטווח",breakout:"פריצה, תיקון והמשך",story:"קריאת רצף משתנה",trend:"מגמה והתקדמות"};
function chart(key,id){const vals=scenes[key]||scenes.range,w=860,h=340,top=26,bottom=31,left=24,right=56,dx=(w-left-right)/vals.length;
let rows=vals.map((close,i)=>{let open=(i?vals[i-1]:close-3)+[-.8,.45,-.25,.9,-.5,.3][(i+id)%6],v1=[1.4,2.7,1.1,2.2,3.5,1.8][(i*3+id)%6],v2=[1.3,2.6,1.6,3.1,1.8,2.1][(i*2+id)%6];return {o:open,c:close,h:Math.max(open,close)+v1,l:Math.min(open,close)-v2}});
let lo=Math.min(...rows.map(r=>r.l))-3,hi=Math.max(...rows.map(r=>r.h))+3;
let y=p=>top+(hi-p)/(hi-lo)*(h-top-bottom),f=p=>Number(p).toFixed(1);
let out='<svg viewBox="0 0 860 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="תרשים נרות יפניים להמחשה לימודית: '+titles[key]+'"><rect x="0" y="0" rx="10" width="860" height="340" fill="#071b30"/>';
for(let i=0;i<=5;i++)out+='<path d="M'+left+' '+f(top+i*(h-top-bottom)/5)+' H'+(w-right)+'" stroke="#2d506c" opacity=".37"/>';
for(let i=0;i<=12;i++)out+='<path d="M'+f(left+i*(w-left-right)/12)+' '+top+'V'+(h-bottom)+'" stroke="#2d506c" opacity=".20"/>';
let line=(p,color)=>'<path d="M'+left+' '+f(y(p))+'H'+(w-right)+'" stroke="'+color+'" stroke-width="2" stroke-dasharray="6 5" opacity=".8"/>';
if(["range","falsebreak","story"].includes(key)){out+=line(111,"#49bce9")+line(98,"#49bce9")}
if(["support","upbreak","breakout"].includes(key))out+=line(key==="support"?100:108,"#49bce9");
if(key==="channel"){out+='<path d="M'+left+' '+f(y(94))+'L'+(w-right)+' '+f(y(119))+' M'+left+' '+f(y(105))+'L'+(w-right)+' '+f(y(130))+'" fill="none" stroke="#5cd7fa" stroke-width="2.3" opacity=".85"/>'}
rows.forEach((r,i)=>{let x=left+(i+.5)*dx,col=r.c>=r.o?"#2ac99b":"#f16a79",yl=y(r.h),yh=y(r.l),yt=Math.min(y(r.o),y(r.c)),ht=Math.max(2.8,Math.abs(y(r.o)-y(r.c))),bw=dx*.64;out+='<line x1="'+f(x)+'" y1="'+f(yl)+'" x2="'+f(x)+'" y2="'+f(yh)+'" stroke="'+col+'" stroke-width="2"/><rect x="'+f(x-bw/2)+'" y="'+f(yt)+'" width="'+f(bw)+'" height="'+f(ht)+'" rx="1" fill="'+col+'"/>'});
for(let i=0;i<=4;i++){const p=hi-(hi-lo)*i/4;out+='<text x="848" y="'+f(y(p)+4)+'" font-size="11" fill="#8ea9c6" text-anchor="end">'+f(p)+'</text>'}
out+='</svg>';return '<figure class="market-chart"><div class="chart-label"><span>'+titles[key]+'</span><span class="chart-tag">המחשה לימודית</span></div>'+out+'<figcaption>נתונים סינתטיים לצורך לימוד — אינם גרף של נכס מסוים.</figcaption></figure>'}
const escape=s=>String(s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
function setLesson(n){current=Math.max(0,Math.min(7,n));const L=lessons[current],num=current+1;history.replaceState(null,"","?lesson="+num);
document.title="5."+num+" — "+L.title+" | WAVE Academy";
list.innerHTML=lessons.map((l,i)=>'<button type="button" class="menu-link '+(i===current?'active':'')+'" data-lesson="'+i+'"><span class="small-index">5.'+(i+1)+'</span><span>'+escape(l.title)+'</span></button>').join("");
$("#active-unit").textContent="שיעור 5."+num+" מתוך 8";
progress.textContent="שיעור "+num+" מתוך 8";
let html='<div class="lesson-hero"><p class="eyebrow">WAVE ACADEMY · מבנה שוק ו־MTF</p><h1>5.'+num+' — '+escape(L.title)+'</h1><p class="lesson-sub">'+escape(L.intro)+'</p><p class="english-label" dir="ltr">'+escape(L.english)+'</p></div>';
html+='<section class="goals"><div class="goals-heading"><span class="goal-dot">✦</span><h2>מה נלמד בשיעור?</h2></div><ul>'+L.goals.map(g=>'<li>'+escape(g)+'</li>').join("")+'</ul></section>';
L.sections.forEach((s,i)=>{html+='<section class="learning-section"><h2>'+escape(s[0])+'</h2><p>'+escape(s[1])+'</p>';if(i===0){html+=chart(L.charts[0],current+4)}if(i===2){html+=chart(L.charts[1],current+12)}if(s[2])html+='<p>'+escape(s[2])+'</p>';html+='</section>'});
html+='<section class="practice"><h2>בדיקת הבנה</h2><p>'+escape(L.question)+'</p><button id="solution-toggle" aria-expanded="false">הצגת הפתרון וההסבר</button><div class="solution" id="solution" hidden><h3>פתרון מוסבר</h3><p>'+escape(L.answer)+'</p></div></section>';
host.innerHTML=html;
$("#solution-toggle").onclick=()=>{const el=$("#solution"),btn=$("#solution-toggle");el.hidden=!el.hidden;btn.setAttribute("aria-expanded",String(!el.hidden));btn.textContent=el.hidden?"הצגת הפתרון וההסבר":"הסתרת הפתרון"};
const key="wave.academy.unit5."+num;const complete=$("#mark-complete");function paint(){complete.textContent=localStorage.getItem(key)==="done"?"✓ השיעור הושלם — ביטול סימון":"סמן את השיעור כהושלם"}paint();complete.onclick=()=>{localStorage.setItem(key,localStorage.getItem(key)==="done"?"":"done");paint()};
nav.innerHTML='<button '+(current===0?"disabled":"")+' id="lesson-prev">השיעור הקודם</button><a href="candlesticks-course.html">חזרה לתוכן הקורס</a><button '+(current===7?"disabled":"")+' id="lesson-next">השיעור הבא</button>';
$("#lesson-prev").onclick=()=>setLesson(current-1);$("#lesson-next").onclick=()=>setLesson(current+1);list.querySelectorAll("button").forEach(b=>b.onclick=()=>setLesson(Number(b.dataset.lesson)));window.scrollTo({top:0,behavior:"instant"})}
setLesson(current);
})();