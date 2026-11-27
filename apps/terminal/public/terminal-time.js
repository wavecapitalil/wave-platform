/* Shared display timezone. The homepage selector stores an IANA zone in localStorage
   'wc-tz'. Empty means the browser zone. Other pages can call WaveTime.format. */
(function(){
  'use strict';
  var KEY='wc-tz';
  var ALT=['wc_tz','wc-timezone','wc_timezone'];
  var ZONES=[
    {id:'',en:'Browser timezone',he:'אזור הזמן של הדפדפן'},
    {id:'Asia/Jerusalem',en:'Jerusalem',he:'ירושלים'},
    {id:'Europe/London',en:'London',he:'לונדון'},
    {id:'America/New_York',en:'New York',he:'ניו יורק'},
    {id:'America/Chicago',en:'Chicago',he:'שיקגו'},
    {id:'America/Los_Angeles',en:'Los Angeles',he:'לוס אנג׳לס'},
    {id:'UTC',en:'UTC',he:'UTC'}
  ];
  function validZone(zone){
    if(!zone||typeof zone!=='string')return false;
    try{new Intl.DateTimeFormat('en',{timeZone:zone});return true;}catch(e){return false;}
  }
  function browserZone(){
    try{var zone=Intl.DateTimeFormat().resolvedOptions().timeZone;if(validZone(zone))return zone;}catch(e){}
    return 'UTC';
  }
  function stored(){
    var keys=[KEY].concat(ALT);
    try{
      for(var i=0;i<keys.length;i++){
        var zone=localStorage.getItem(keys[i]);
        if(validZone(zone))return zone;
      }
    }catch(e){}
    return '';
  }
  function zone(){return stored()||browserZone();}
  function hebrew(){
    try{
      if(typeof getLang==='function')return getLang()==='he';
      return document.documentElement.lang==='he'||localStorage.getItem('wc_lang')==='he';
    }catch(e){return false;}
  }
  function locale(){return hebrew()?'he-IL':'en-GB';}
  function format(stamp,extra){
    if(stamp==null||!Number.isFinite(Date.parse(stamp)))return '';
    var opts=Object.assign({timeZone:zone(),year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'},extra||{});
    var loc=opts.locale||locale();
    delete opts.locale;delete opts.timeZoneName;
    if(!validZone(opts.timeZone))opts.timeZone=zone();
    return new Intl.DateTimeFormat(loc,opts).format(new Date(stamp));
  }
  function announce(){
    try{if(typeof updateClock==='function')updateClock();}catch(e){}
    try{
      if(typeof CustomEvent!=='function'||!window.dispatchEvent)return;
      window.dispatchEvent(new CustomEvent('wc-tz',{detail:{timeZone:zone()}}));
    }catch(e){}
  }
  function set(next){
    try{
      if(!next){localStorage.removeItem(KEY);ALT.forEach(function(k){localStorage.removeItem(k);});}
      else if(validZone(next))localStorage.setItem(KEY,next);
      else return false;
    }catch(e){return false;}
    announce();
    return true;
  }
  function paint(){
    var select=document.getElementById('homeTimezone');
    if(!select||select.id!=='homeTimezone')return;
    var current=stored();
    var options=ZONES.slice();
    if(current&&!options.some(function(z){return z.id===current;}))options.push({id:current,en:current,he:current});
    select.innerHTML=options.map(function(z){
      return '<option value="'+String(z.id).replace(/"/g,'')+'"'+(z.id===current?' selected':'')+'>'+(hebrew()?z.he:z.en)+'</option>';
    }).join('');
  }
  function boot(){
    paint();
    var select=document.getElementById('homeTimezone');
    if(!select||select.id!=='homeTimezone'||select.dataset.waveTz==='1')return;
    select.dataset.waveTz='1';
    select.addEventListener('change',function(){set(select.value);});
  }
  window.WaveTime={key:KEY,zone:zone,format:format,set:set,paint:paint,validZone:validZone};
  if(window.addEventListener)window.addEventListener('storage',function(e){
    if(!e||[KEY].concat(ALT).indexOf(e.key)===-1)return;
    paint();announce();
  });
  var previous=window.onLangChange;
  window.onLangChange=function(lang){if(typeof previous==='function')previous(lang);paint();};
  if(document.readyState==='loading'&&document.addEventListener)document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
