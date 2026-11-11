(()=>{'use strict';
const UNITS=[{"title":"יסודות","items":[{"href":"candlesticks-lesson-01.html","id":"1.1","title":"מהו שוק פיננסי ומהו מחיר?"},{"href":"candlesticks-lesson-02.html","id":"1.2","title":"מהו גרף ולמה בכלל צריך אותו?"},{"href":"candlesticks-lesson-03.html","id":"1.3","title":"מאורז ביפן לגרף המודרני"},{"href":"candlesticks-lesson-04.html","id":"1.4","title":"שפת הקורס וכללי הלמידה"}]},{"title":"מבנה הנר","items":[{"href":"candlesticks-lesson-2-1.html","id":"2.1","title":"ארבעה מחירים בנר אחד"},{"href":"candlesticks-lesson-2-2.html","id":"2.2","title":"גוף, פתילים וטווח"},{"href":"candlesticks-lesson-2-3.html","id":"2.3","title":"מהו טיים־פריים?"},{"href":"candlesticks-lesson-2-4.html","id":"2.4","title":"איך נר נבנה בזמן אמת"},{"href":"candlesticks-lesson-2-5.html","id":"2.5","title":"פערים, שעות מסחר וסוגי שווקים"}]},{"title":"קריאת משמעות הנר","items":[{"href":"candlesticks-lesson-3-1.html","id":"3.1","title":"מיקום הסגירה ביחס לטווח"},{"href":"candlesticks-lesson-3-2.html","id":"3.2","title":"נר חזק, נר חלש ונר מאוזן"},{"href":"candlesticks-lesson-3-3.html","id":"3.3","title":"דחיית מחיר ובדיקת רמות"},{"href":"candlesticks-lesson-3-4.html","id":"3.4","title":"תנודתיות ומומנטום"},{"href":"candlesticks-lesson-3-5.html","id":"3.5","title":"הטיית הסתכלות וסיפור בדיעבד"}]},{"title":"תבניות נרות יפניים","items":[{"href":"candlesticks-unit-4.html?lesson=1","id":"4.1","title":"Doji ומשפחת הדוג׳י"},{"href":"candlesticks-unit-4.html?lesson=2","id":"4.2","title":"Spinning Top ו־Marubozu"},{"href":"candlesticks-unit-4.html?lesson=3","id":"4.3","title":"Hammer ו־Hanging Man"},{"href":"candlesticks-unit-4.html?lesson=4","id":"4.4","title":"Inverted Hammer ו־Shooting Star"},{"href":"candlesticks-unit-4.html?lesson=5","id":"4.5","title":"תרגול זיהוי ללא שמות"},{"id":"4.6","title":"Bullish/Bearish Engulfing","href":"candlesticks-unit4-review-v2.html?lesson=6"},{"id":"4.7","title":"Bullish/Bearish Harami","href":"candlesticks-unit4-review-v2.html?lesson=7"},{"id":"4.8","title":"Piercing Line","href":"candlesticks-unit4-review-v2.html?lesson=8"},{"id":"4.9","title":"Dark Cloud Cover","href":"candlesticks-unit4-review-v2.html?lesson=9"},{"id":"4.10","title":"Tweezer Top/Bottom","href":"candlesticks-unit4-review-v2.html?lesson=10"},{"id":"4.11","title":"Inside Bar ו־Outside Bar","href":"candlesticks-unit4-review-v2.html?lesson=11"},{"id":"4.12","title":"השוואות ומקרי גבול","href":"candlesticks-unit4-review-v2.html?lesson=12"}]},{"title":"מבנה שוק ו־MTF","items":[{"href":"candlesticks-unit-5.html?lesson=1","id":"5.1","title":"מגמה, טווח ושינוי מבנה"},{"href":"candlesticks-unit-5.html?lesson=2","id":"5.2","title":"תמיכה והתנגדות"},{"href":"candlesticks-unit-5.html?lesson=3","id":"5.3","title":"קווי מגמה וערוצים"},{"href":"candlesticks-unit-5.html?lesson=4","id":"5.4","title":"פריצה, פריצת שווא ו־Retest"},{"href":"candlesticks-unit-5.html?lesson=5","id":"5.5","title":"קריאת 10–20 נרות ללא שמות תבניות"},{"href":"candlesticks-unit-5.html?lesson=6","id":"5.6","title":"יסודות ניתוח רב־טווחי (MTF)"},{"href":"candlesticks-unit-5.html?lesson=7","id":"5.7","title":"ניתוח Top-Down והתאמת מגמות"},{"href":"candlesticks-unit-5.html?lesson=8","id":"5.8","title":"שילוב תבניות נרות עם MTF ותרגול"}]},{"title":"כלים טכניים ומתנדים","items":[{"href":"candlesticks-learn.html?u=7&n=1","id":"6.1","title":"ממוצעים נעים SMA ו־EMA"},{"href":"candlesticks-learn.html?u=7&n=2","id":"6.2","title":"נפח מסחר ואיכות הנתונים"},{"href":"candlesticks-learn.html?u=7&n=3","id":"6.3","title":"ATR ותנודתיות"},{"href":"candlesticks-learn.html?u=7&n=4","id":"6.4","title":"יסודות מתנדי מומנטום"},{"href":"candlesticks-learn.html?u=7&n=5","id":"6.5","title":"RSI — שיעור עומק"},{"href":"candlesticks-learn.html?u=7&n=6","id":"6.6","title":"Stochastic — שיעור עומק"},{"href":"candlesticks-learn.html?u=7&n=7","id":"6.7","title":"CCI — שיעור עומק"},{"href":"candlesticks-learn.html?u=7&n=8","id":"6.8","title":"השוואה ואינטגרציה"}]},{"title":"ניתוח תרחישים","items":[{"href":"candlesticks-learn.html?u=8&n=1","id":"7.1","title":"מתי תבנית היא רק תצפית"},{"href":"candlesticks-learn.html?u=8&n=2","id":"7.2","title":"אישור וביטול של רעיון"},{"href":"candlesticks-learn.html?u=8&n=3","id":"7.3","title":"תרחישי עלייה, ירידה ואי־פעולה"},{"href":"candlesticks-learn.html?u=8&n=4","id":"7.4","title":"דוגמאות לפי שווקים וטווחי זמן"}]},{"title":"ניהול סיכונים","items":[{"href":"candlesticks-learn.html?u=9&n=1","id":"8.1","title":"סיכון לעסקה וגודל פוזיציה"},{"href":"candlesticks-learn.html?u=9&n=2","id":"8.2","title":"סטופ, יעד ויחס סיכוי–סיכון"},{"href":"candlesticks-learn.html?u=9&n=3","id":"8.3","title":"אחוז הצלחה ותוחלת"},{"href":"candlesticks-learn.html?u=9&n=4","id":"8.4","title":"רצפי הפסד, Drawdown והטיית הישרדות"},{"href":"candlesticks-learn.html?u=9&n=5","id":"8.5","title":"מינוף, החלקה, עמלות וסיכון לילה"}]},{"title":"תהליך מסחר ובדיקות","items":[{"href":"candlesticks-learn.html?u=10&n=1","id":"9.1","title":"תהליך ניתוח נקי"},{"href":"candlesticks-learn.html?u=10&n=2","id":"9.2","title":"עבודה ללא מידע עתידי"},{"href":"candlesticks-learn.html?u=10&n=3","id":"9.3","title":"יומן תצפיות ועסקאות"},{"href":"candlesticks-learn.html?u=10&n=4","id":"9.4","title":"מדדי הצלחה ובדיקת אסטרטגיה"},{"href":"candlesticks-learn.html?u=10&n=5","id":"9.5","title":"מבחן מסכם ותיק עבודות"}]}];
const $=(s,root=document)=>root.querySelector(s);
function cleanId(id){return String(id).replace(/[^0-9.]/g,'')}
function sourceKey(unit,n){const u=unit>=6?unit+1:unit===4&&n>=6?5:unit;const k=unit===4&&n>=6?n-5:n;return 'wave.candles.v1.lesson.'+String(u).padStart(2,'0')+'-'+String(k).padStart(2,'0')}
function done(unit,n){try{return localStorage.getItem(sourceKey(unit,n))==='done'||(unit===5&&localStorage.getItem('wave.academy.unit5.'+n)==='done')}catch{return false}}
function selectInfo(){
 const file=location.pathname.split('/').pop(),p=new URLSearchParams(location.search);
 let match=file.match(/^candlesticks-lesson-(?:0([1-4])|([23])-([1-5]))\.html$/);
 if(match)return {u:match[1]?1:Number(match[2]),n:match[1]?Number(match[1]):Number(match[3])};
 if(file==='candlesticks-unit-5.html')return {u:5,n:Math.max(1,Math.min(8,Number(p.get('lesson'))||1))};
 if(file==='candlesticks-unit-4.html')return {u:4,n:Math.max(1,Math.min(5,Number(p.get('lesson'))||1))};
 if(file.startsWith('candlesticks-unit4-review-v'))return {u:4,n:Math.max(1,Math.min(12,Number(p.get('lesson'))||1))};
 if(file==='candlesticks-learn.html'){let u=Number(p.get('u')),n=Number(p.get('n'));return {u:u>=6?u-1:u===5?4:u,n:u===5?n+5:n}}
 return null;
}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function linkIsActive(item,n){return Number(item.id.split('.')[1])===n}
function addTextWithEnglish(elm,text){
 const rx=/[A-Za-z][A-Za-z0-9-]*(?:[ -][A-Za-z][A-Za-z0-9-]*)*/g;let at=0,match;
 while((match=rx.exec(text))){if(match.index>at)elm.append(document.createTextNode(text.slice(at,match.index)));let b=el('bdi','wave-en',match[0]);b.dir='ltr';elm.append(b);at=rx.lastIndex}
 if(at<text.length)elm.append(document.createTextNode(text.slice(at)));
}
function makeNav(u,n){
 const uinfo=UNITS[u-1],wrapper=el('div','wave-sidebar-inner');if(!uinfo)return wrapper;
 const h=el('h2','wave-sidebar-heading');h.append(document.createTextNode('יחידה '+u+' — '));addTextWithEnglish(h,uinfo.title);wrapper.append(h);
 wrapper.append(el('p','wave-sidebar-subtitle',uinfo.items.length+' שיעורים · מהיסודות ליישום'));
 const nav=el('nav','wave-lesson-list');nav.setAttribute('aria-label','שיעורי יחידה '+u);
 for(const item of uinfo.items){const idx=Number(item.id.split('.')[1]),active=linkIsActive(item,n);
 const a=el('a','wave-lesson-link'+(active?' is-current':''));
 a.href=item.href;a.setAttribute('data-lesson',item.id);if(active)a.setAttribute('aria-current','page');
 const num=el('span','wave-lesson-number',item.id),label=el('span','wave-lesson-label');addTextWithEnglish(label,item.title);
 a.append(num,label);if(done(u,idx))a.append(el('span','wave-lesson-done','✓'));nav.append(a);}
 wrapper.append(nav);const box=el('div','wave-sidebar-progress');box.append(el('div','wave-current-progress','שיעור '+u+'.'+n+' מתוך '+uinfo.items.length));box.append(el('div','wave-done-progress',uinfo.items.filter(x=>done(u,Number(x.id.split('.')[1]))).length+' שיעורים הושלמו מתוך '+uinfo.items.length));wrapper.append(box);
 return wrapper;
}
function render(){
 const state=selectInfo();if(!state||state.u<1||state.u>UNITS.length)return;
 const aside=$('.sidebar')||$('.aside')||$('.side');if(!aside)return;
 aside.classList.add('wave-unified-sidebar');aside.setAttribute('aria-label','סרגל השיעורים');
 // Preserve contextual section links in legacy lessons, beneath the uniform lesson list.
 const toc=aside.classList.contains('sidebar')?aside.querySelector('nav[aria-label="תוכן השיעור"]'):null;
 const savedToc=toc?toc.cloneNode(true):null;
 aside.replaceChildren(makeNav(state.u,state.n));
 if(savedToc){const details=el('details','wave-section-toc');const summary=el('summary',null,'סעיפי השיעור');details.append(summary,savedToc);aside.append(details)}
}
document.addEventListener('DOMContentLoaded',()=>{render();
 const menu=$('#lesson-menu'),nav=$('#lesson-nav');
 // Interactive unit 4/5 applications navigate without a page reload.
 const observerTarget=menu||nav;
 if(observerTarget){let pending=false;new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;render()})}).observe(observerTarget,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-current']})}
 document.addEventListener('click',e=>{const b=e.target.closest('[data-lesson],#lesson-menu button');if(!b)return;const id=b.getAttribute('data-lesson');if(id){const unit=Number(id.split('.')[0]);if(unit===5&&location.pathname.endsWith('candlesticks-unit-5.html')){return}}});
});
})();