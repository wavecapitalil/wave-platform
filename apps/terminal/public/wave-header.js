(function(){
 'use strict';
 var lang='he';try{if(localStorage.getItem('wc_lang')==='en')lang='en';}catch(e){}
 document.documentElement.setAttribute('data-wave-language',lang);
 function init(){
  var header=document.querySelector('.wave-global-header');if(!header||header.dataset.ready)return;header.dataset.ready='true';
  var toggle=header.querySelector('.wave-global-toggle');
  function close(focus){header.removeAttribute('data-open');toggle.setAttribute('aria-expanded','false');if(focus)toggle.focus();}
  toggle.addEventListener('click',function(){var open=header.getAttribute('data-open')!=='true';header.setAttribute('data-open',String(open));toggle.setAttribute('aria-expanded',String(open));});
  header.querySelector('.wave-global-language').addEventListener('click',function(){try{localStorage.setItem('wc_lang',lang==='he'?'en':'he');}catch(e){}location.reload();});
  header.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){close(false);});});
  document.addEventListener('click',function(e){if(!header.contains(e.target))close(false);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&header.getAttribute('data-open')==='true'){close(true);}});
  addEventListener('pageshow',function(){close(false);});
  matchMedia('(max-width:1200px)').addEventListener('change',function(){close(false);});
 }
 window.WaveHeader={init:init};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
