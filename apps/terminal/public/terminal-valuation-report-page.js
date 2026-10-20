/* One same-origin handoff; no requests, storage writes, or live valuation calculations. */
(function(){
'use strict';
var source=window.opener,received=false;
function receive(event){
 if(received||!source||event.source!==source||event.origin!==location.origin||!event.data||event.data.type!=='wave-report-snapshot')return;
 try{
  var html=WaveValuationReport.render(WaveValuationReport.capture(event.data.snapshot));
  var doc=new DOMParser().parseFromString(html,'text/html');
  document.title=doc.title;
  document.head.appendChild(doc.querySelector('style'));
  document.body.replaceChildren.apply(document.body,Array.from(doc.body.childNodes));
  received=true;window.removeEventListener('message',receive);window.opener=null;source=null;
 }catch(e){document.body.textContent='לא ניתן להציג את הצילום. חזרו למחשבון ושמרו צילום חדש.';}
}
window.addEventListener('message',receive);
if(source)source.postMessage('wave-report-ready',location.origin);
else document.body.textContent='פתחו את הדוח באמצעות כפתור ייצוא דוח אנליסט במחשבון.';
setTimeout(function(){if(!received){window.removeEventListener('message',receive);document.body.textContent='הצילום לא התקבל. חזרו למחשבון ולחצו שוב על ייצוא דוח אנליסט.';}},30000);
})();
