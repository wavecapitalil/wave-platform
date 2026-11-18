(()=>{"use strict";
const lessons=window.WAVE_UNIT5_LESSONS;if(!Array.isArray(lessons)||lessons.length!==8){document.body.textContent="שגיאה בטעינת תוכן היחידה";return}
const $=s=>document.querySelector(s),list=$("#lesson-menu"),host=$("#lesson"),nav=$("#nextprev"),progress=$("#progress-text");

/* Approved circular white icon set, matching the Unit 5 lesson headings. */
const waveUnit5IconPaths=["<path d=\"M9 31L15 19L21 25L27 15L33 21L39 11\"/><circle cx=\"15\" cy=\"19\" r=\"1.5\"/><circle cx=\"27\" cy=\"15\" r=\"1.5\"/><path d=\"M10 38H38\"/>","<path d=\"M9 13H39M9 35H39\"/><path d=\"M15 19V30M23 17V33M31 20V29\"/><rect x=\"12\" y=\"22\" width=\"6\" height=\"5\" rx=\".6\"/><rect x=\"20\" y=\"20\" width=\"6\" height=\"9\" rx=\".6\"/><rect x=\"28\" y=\"22\" width=\"6\" height=\"5\" rx=\".6\"/>","<path d=\"M8 29L39 10M10 39L40 21\"/><path d=\"M14 30V37M23 24V32M32 17V25\"/><rect x=\"11\" y=\"32\" width=\"6\" height=\"3\" rx=\".5\"/><rect x=\"20\" y=\"26\" width=\"6\" height=\"4\" rx=\".5\"/><rect x=\"29\" y=\"19\" width=\"6\" height=\"4\" rx=\".5\"/>","<path d=\"M9 23H39\" stroke-dasharray=\"3 3\"/><path d=\"M13 37V29M20 33V25M27 20V11M35 28V19\"/><rect x=\"11\" y=\"32\" width=\"4\" height=\"3\" rx=\".4\"/><rect x=\"18\" y=\"28\" width=\"4\" height=\"3\" rx=\".4\"/><rect x=\"25\" y=\"13\" width=\"4\" height=\"5\" rx=\".4\"/><path d=\"M30 12L34 8L38 12\"/>","<path d=\"M10 30V22M16 29V18M22 27V15M28 24V12\"/><rect x=\"8\" y=\"24\" width=\"4\" height=\"4\" rx=\".5\"/><rect x=\"14\" y=\"20\" width=\"4\" height=\"6\" rx=\".5\"/><rect x=\"20\" y=\"17\" width=\"4\" height=\"6\" rx=\".5\"/><circle cx=\"31\" cy=\"31\" r=\"8\"/><path d=\"M36.8 36.8L42 42\"/>","<rect x=\"9\" y=\"10\" width=\"27\" height=\"22\" rx=\"2\"/><rect x=\"16\" y=\"16\" width=\"25\" height=\"21\" rx=\"2\"/><path d=\"M12 17L16 15L20 20L24 17M19 29L23 25L27 29L32 22\"/><path d=\"M21 34L25 31L29 34L34 27\"/>","<rect x=\"17\" y=\"8\" width=\"17\" height=\"10\" rx=\"1.5\"/><rect x=\"10\" y=\"28\" width=\"13\" height=\"10\" rx=\"1.5\"/><rect x=\"27\" y=\"28\" width=\"13\" height=\"10\" rx=\"1.5\"/><path d=\"M25 18V23M25 23H16V28M25 23H33V28\"/><path d=\"M20 13L23 11L26 14L30 10M13 34L16 31L20 33M30 34L33 31L37 33\"/>","<path d=\"M9 34H35M12 26V35M20 19V33M28 14V29\"/><rect x=\"10\" y=\"28\" width=\"4\" height=\"5\" rx=\".4\"/><rect x=\"18\" y=\"22\" width=\"4\" height=\"8\" rx=\".4\"/><rect x=\"26\" y=\"17\" width=\"4\" height=\"9\" rx=\".4\"/><circle cx=\"35\" cy=\"35\" r=\"8\"/><path d=\"M31 35L34 38L39 32\"/>"];
function waveUnit5Icon(i){return '<span class="wave-unit5-topic-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" focusable="false"><circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="2.4"/><g fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">'+waveUnit5IconPaths[i]+'</g></svg></span>'}
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
let html='<div class="lesson-hero"><p class="eyebrow">WAVE ACADEMY · מבנה שוק ו־MTF</p><h1 class="wave-unit5-heading">'+waveUnit5Icon(current)+'<span>5.'+num+' — '+escape(L.title)+'</span></h1><p class="lesson-sub">'+escape(L.intro)+'</p><p class="english-label" dir="ltr">'+escape(L.english)+'</p></div>';
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