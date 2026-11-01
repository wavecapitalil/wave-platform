(()=>{'use strict';
const m=location.pathname.match(/candlesticks-lesson-(\d{1,2})(?:-(\d))?\.html$/),catalog=/candlesticks-course\.html$/.test(location.pathname);
const patterns=[
[0.2,1.4,2.8,4.5,6.3,7.2,5.8,4.1,3.0,4.3,5.7,7.7,9.6,8.6,7.4,9.2,11.6,11.1,12.9,12.2,14.4,13.6],
[13,12,10,8,6,7,9,8,5,3,4,6,5,3,2,4,7,5,4,6,8,7],
[2,4,7,10,12,11,9,8,10,13,11,8,6,5,7,9,8,5,4,7,10,9],
[12,10,7,5,3,4,7,10,11,9,7,8,6,4,3,5,7,4,2,4,6,5],
[5,6,8,11,10,9,7,9,12,14,13,10,8,9,7,5,4,6,8,11,10,13],
[9,7,6,8,11,14,12,10,8,7,5,6,9,12,11,8,6,7,4,3,5,4],
[4,6,7,8,7,10,13,12,10,8,10,12,15,13,10,9,11,13,12,14,16,15],
[16,15,13,11,9,10,7,5,6,8,7,6,4,3,5,8,7,5,6,4,3,5],
[6,8,11,10,7,6,5,4,6,9,12,11,9,7,8,5,4,6,9,8,6,7],
[8,9,7,5,6,8,10,12,13,11,9,7,5,6,4,7,10,12,10,8,9,7],
[12,10,11,8,6,7,4,5,8,10,9,7,5,3,5,8,7,6,9,11,10,8],
[4,5,7,9,11,10,8,6,5,7,9,11,10,8,7,10,13,12,10,8,9,11],
[14,12,10,9,7,5,6,8,7,5,3,4,6,8,10,9,7,6,8,11,9,8],
[7,9,11,13,12,10,8,9,11,12,10,8,6,5,7,8,10,12,9,7,8,9],
[10,11,9,7,8,6,4,6,9,11,10,8,6,7,9,12,11,9,8,6,7,5],
[6,9,7,8,11,13,12,10,11,9,8,10,13,15,12,10,9,11,12,10,8,11],
[13,11,9,7,8,6,4,5,8,10,12,11,9,7,8,11,10,7,6,8,10,9],
[4,6,9,11,10,8,7,10,13,11,9,8,11,13,12,10,8,7,10,12,14,13],
[8,10,9,11,14,12,10,8,7,9,11,10,12,9,7,6,8,11,9,7,10,12]
];
const titles=['תנועה מתפתחת','תיקון ומומנטום','תגובה באזור מחיר','שינוי קצב','עלייה עם תיקונים','ירידה עם תיקונים','דחייה והמשך','התכנסות ופריצה','בדיקת תמיכה','בדיקת התנגדות','שינוי מבנה','היחלשות מומנטום','ירידה והאטה','תיקון בתוך מגמה','מאבק סביב רמה','חזרה לרמה','תגובה אחרי ירידה','בלימה אחרי עלייה','רצף משתנה'];
const seed=(u,n)=>((u*4+n*3+u*n)%patterns.length);
function svg(idx,compact){const a=patterns[idx%patterns.length],w=compact?280:860,h=compact?112:340,left=compact?12:26,right=compact?8:48,top=compact?9:20,bottom=compact?9:32,pw=w-left-right,ph=h-top-bottom;
const rows=a.map((v,i)=>{const prior=i?a[i-1]:v-1.3;const offset=[.45,-.35,.25,-.15,.55,-.2][(i+idx)%6];const o=prior+offset;const c=v;const wickUp=[.5,1.4,.8,1.1,.6,1.9,.75][(i*3+idx)%7];const wickDown=[.55,.8,1.6,.7,1.2,.65,1.3][(i*2+idx)%7];return {o,c,hi:Math.max(o,c)+wickUp,lo:Math.min(o,c)-wickDown}});const lo=Math.min(...rows.map(r=>r.lo))-1,hi=Math.max(...rows.map(r=>r.hi))+1,scale=v=>top+(hi-v)/(hi-lo)*ph;let out='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="גרף נרות לימודי עם רצף מגוון של גופים ופתילים, תנועה ותיקונים"><rect width="'+w+'" height="'+h+'" rx="12" fill="#071b30"/>';
for(let i=0;i<=5;i++){let y=top+i*ph/5;out+='<path d="M'+left+' '+y+'H'+(w-right)+'" stroke="#29425c" opacity=".36" stroke-width="1"/>'}for(let i=0;i<=11;i++){let x=left+i*pw/11;out+='<path d="M'+x+' '+top+'V'+(h-bottom)+'" stroke="#29425c" opacity=".23" stroke-width="1"/>'}
let dx=pw/rows.length,bw=dx*(compact?.65:.68);rows.forEach((r,i)=>{let x=left+dx*(i+.5),y1=scale(r.hi),y2=scale(r.lo),yo=scale(r.o),yc=scale(r.c),bull=r.c>=r.o,color=bull?'#26cca4':'#f26475';out+='<line x1="'+x.toFixed(2)+'" y1="'+y1.toFixed(2)+'" x2="'+x.toFixed(2)+'" y2="'+y2.toFixed(2)+'" stroke="'+color+'" stroke-width="'+(compact?1.5:2.2)+'"/><rect x="'+(x-bw/2).toFixed(2)+'" y="'+Math.min(yo,yc).toFixed(2)+'" width="'+bw.toFixed(2)+'" height="'+Math.max(compact?2:3,Math.abs(yo-yc)).toFixed(2)+'" rx=".6" fill="'+color+'"/>'});out+='</svg>';return out}
function box(idx){let el=document.createElement('figure');el.className='wave-real-chart';el.innerHTML='<div class="wave-real-chart__top"><span>המחשה בהקשר שוק</span><span>'+titles[idx%titles.length]+'</span></div>'+svg(idx,false)+'<figcaption>רצף נרות לימודי מקורי לצורך המחשה בלבד — אינו נתוני שוק אמיתיים.</figcaption>';return el}
let css=document.createElement('style');css.textContent='.wave-real-chart{margin:24px 0;padding:12px;border:1px solid #315577;border-radius:16px;background:#0b2540;color:#dbeaff;clear:both}.wave-real-chart svg{display:block;width:100%;height:auto;max-height:430px}.wave-real-chart__top{display:flex;justify-content:space-between;gap:12px;color:#a8c6e2;font-size:13px;padding:4px 8px 12px}.wave-real-chart figcaption{font-size:12px;color:#a8c6e2;text-align:center;padding:8px 0 2px}.lesson-art.wave-live-art svg{display:block;width:100%;height:100%}@media(max-width:650px){.wave-real-chart{padding:7px}}';document.head.appendChild(css);
if(catalog){let arts=document.querySelectorAll('.lesson-card .lesson-art');arts.forEach((art,i)=>{let current=art.querySelector('svg');if(!current)return;current.outerHTML=svg((i*7+3)%patterns.length,true);art.classList.add('wave-live-art')})}
else if(m){let u=Number(m[1]),n=Number(m[2]||m[1]),idx=seed(u,n),target=document.querySelector('.source-figure, .section, .lesson-section, #lesson-content, main .content, main');if(target){let fig=box(idx);if(target.classList.contains('source-figure'))target.before(fig);else if(target.classList.contains('section'))target.prepend(fig);else target.prepend(fig)}}
})();