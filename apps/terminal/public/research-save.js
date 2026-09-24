(function(){
  'use strict';
  function key(a){return 'article:'+String(a.id);}
  function label(btn,a){
    if(!btn||!window.WavePlatform)return;
    var saved=WavePlatform.isSaved(key(a));
    btn.textContent=saved?'✓ Saved to Account':'☆ Save to Account';
    btn.setAttribute('aria-pressed',saved?'true':'false');
  }
  window.wireArticleSave=function(a){
    var btn=document.getElementById('articleSaveBtn');if(!btn||!window.WavePlatform)return;
    label(btn,a);
    btn.onclick=function(){
      WavePlatform.saveItem({id:key(a),title:a.title||'Research',type:'research',href:'blog.html?id='+a.id});
      label(btn,a);
      WavePlatform.toast(WavePlatform.isSaved(key(a))?'Saved to Account':'Removed from saved research');
    };
  };
})();