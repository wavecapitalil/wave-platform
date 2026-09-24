(function(){
  'use strict';
  var PROJECT='nqmtayofbhletydmiujz';
  var FN='https://'+PROJECT+'.supabase.co/functions/v1/wave-tutor';
  var panel,body,input,sendBtn,contextEl,selectionEl,conversationId=null,mode='explain',busy=false;
  var MODES={explain:'Explain',socratic:'Socratic',quiz:'Quiz me',research:'Research'};

  function escText(v){return String(v==null?'':v);}
  function pageProduct(){
    var p=location.pathname.toLowerCase();
    if(p.indexOf('university')>=0)return 'university';
    if(p.indexOf('terminal')>=0)return 'terminal';
    if(p.indexOf('blog')>=0)return 'research';
    if(p.indexOf('account')>=0)return 'account';
    if(p.indexOf('products')>=0)return 'products';
    return 'home';
  }
  function visibleText(selector,limit){
    var el=document.querySelector(selector);if(!el)return '';
    var t=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
    return t.slice(0,limit||1800);
  }
  function selectedText(){
    try{return String(window.getSelection&&window.getSelection().toString()||'').trim().slice(0,2500);}catch(e){return '';}
  }
  function pageContext(){
    var product=pageProduct(),page='',course='',lesson='',summary='',data={};
    if(product==='terminal'){
      page=window.currentPage||new URLSearchParams((location.hash||'').replace(/^#/,'')).get('page')||'welcome';
      var active=document.querySelector('.page.active');
      summary=active?(active.innerText||'').replace(/\s+/g,' ').trim().slice(0,3200):'';
      var title=active&&active.querySelector('.page-header-title,.welcome-title,.ms-title');
      if(title)page=page+' · '+title.textContent.trim();
      ['SPY','QQQ','VIX','BTC','Gold','DXY','10Y','WTI'].forEach(function(k){
        var id={'SPY':'t-spy','QQQ':'t-qqq','VIX':'t-vix','BTC':'t-btc','Gold':'t-gold','DXY':'t-dxy','10Y':'t-10y','WTI':'t-wti'}[k];
        var el=document.getElementById(id);if(el&&el.textContent&&el.textContent!=='—')data[k]=el.textContent.trim();
      });
    }else if(product==='university'){
      page='University hub';summary=visibleText('main',3200);
      var focus=document.querySelector('.wp-course:hover,[data-course-active="true"]');
      if(focus){course=focus.getAttribute('data-course')||'';page=(focus.querySelector('h3')||{}).textContent||page;}
    }else if(product==='research'){
      var h=document.querySelector('.article-title');page=h?h.textContent.trim():'Research library';summary=visibleText('#page',3200);
    }else if(product==='account'){page='Account workspace';summary=visibleText('main',2400);}
    else if(product==='products'){page='Products';summary=visibleText('.page',2400);}
    else{page='WAVE Home';summary=visibleText('body',2200);}
    return {product:product,page:page,course_id:course,lesson_id:lesson,title:document.title,selected_text:selectedText(),screen_summary:summary,data:data};
  }

  function ensure(){
    if(panel)return;
    var launcher=document.createElement('button');launcher.id='waveTutorLauncher';launcher.type='button';launcher.title='Ask WAVE AI';launcher.setAttribute('aria-label','Open WAVE AI Tutor');launcher.textContent='AI';
    launcher.onclick=function(){toggle();};
    document.body.appendChild(launcher);

    panel=document.createElement('section');panel.id='waveTutorPanel';panel.setAttribute('aria-label','WAVE AI Tutor');
    panel.innerHTML='<div class="wt-head"><div class="wt-mark">W</div><div class="wt-head-copy"><div class="wt-title">WAVE AI Tutor</div><div class="wt-context" id="wtContext">Context aware</div></div><button class="wt-icon-btn" id="wtNew" title="New chat">＋</button><button class="wt-icon-btn" id="wtClose" title="Close">×</button></div><div class="wt-modes" id="wtModes"></div><div class="wt-body" id="wtBody"></div><div class="wt-foot" id="wtFoot"><div class="wt-selection" id="wtSelection"></div><div class="wt-compose"><textarea class="wt-input" id="wtInput" rows="1" placeholder="Ask about what you are learning or seeing…"></textarea><button class="wt-send" id="wtSend" type="button">↑</button></div><div class="wt-footnote">WAVE Tutor uses your course progress and current page context.</div></div>';
    document.body.appendChild(panel);
    body=document.getElementById('wtBody');input=document.getElementById('wtInput');sendBtn=document.getElementById('wtSend');contextEl=document.getElementById('wtContext');selectionEl=document.getElementById('wtSelection');
    var modes=document.getElementById('wtModes');
    Object.keys(MODES).forEach(function(k){var b=document.createElement('button');b.className='wt-mode'+(k===mode?' active':'');b.textContent=MODES[k];b.dataset.mode=k;b.onclick=function(){mode=k;modes.querySelectorAll('.wt-mode').forEach(function(x){x.classList.toggle('active',x.dataset.mode===mode);});updatePlaceholder();};modes.appendChild(b);});
    document.getElementById('wtClose').onclick=function(){panel.classList.remove('open');};
    document.getElementById('wtNew').onclick=function(){conversationId=null;localStorage.removeItem('wave.tutor.conversation');renderEmpty();};
    sendBtn.onclick=send;
    input.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});
    input.addEventListener('input',resizeInput);
    document.addEventListener('selectionchange',updateSelection);
    updatePlaceholder();renderEmpty();updateContext();
  }
  function updatePlaceholder(){if(!input)return;input.placeholder={explain:'Ask me to explain what you are seeing…',socratic:'Work through a concept with me…',quiz:'Quiz me on this topic…',research:'Help me analyze this more deeply…'}[mode];}
  function updateContext(){if(!contextEl)return;var c=pageContext();contextEl.textContent=(c.product||'WAVE')+' · '+(c.page||c.title||'Current page');}
  function updateSelection(){if(!selectionEl)return;var s=selectedText();if(s){selectionEl.textContent='Selected: '+s;selectionEl.classList.add('show');}else selectionEl.classList.remove('show');}
  function resizeInput(){input.style.height='auto';input.style.height=Math.min(input.scrollHeight,110)+'px';}
  function addMessage(role,text){
    var el=document.createElement('div');el.className='wt-msg '+role;el.textContent=escText(text);body.appendChild(el);body.scrollTop=body.scrollHeight;return el;
  }
  function renderEmpty(){
    if(!body)return;body.innerHTML='';
    var status=window.WaveCloud&&WaveCloud.getStatus?WaveCloud.getStatus():{signedIn:false};
    if(!status.signedIn){
      body.innerHTML='<div class="wt-signin"><h3>Your personal tutor lives with your account.</h3><p>Sign in once and WAVE AI can remember your course progress, questions and learning profile across devices.</p><a href="account.html">Sign in to WAVE</a></div>';
      document.getElementById('wtFoot').style.display='none';
    }else{
      document.getElementById('wtFoot').style.display='block';
      body.innerHTML='<div class="wt-empty"><strong>Ask WAVE about this page.</strong>I know where you are, your current course progress, and the WAVE curriculum. Select text on the page for even tighter context.</div>';
    }
  }
  async function token(){
    if(!window.WaveCloud||!WaveCloud.getAccessToken)return null;
    try{return await WaveCloud.getAccessToken();}catch(e){return null;}
  }
  async function send(){
    if(busy)return;
    var msg=(input.value||'').trim();if(!msg)return;
    var access=await token();
    if(!access){renderEmpty();return;}
    var empty=body.querySelector('.wt-empty');if(empty)empty.remove();
    addMessage('user',msg);input.value='';resizeInput();busy=true;sendBtn.disabled=true;
    var think=addMessage('assistant','');think.innerHTML='<span class="wt-thinking"><i></i><i></i><i></i></span>';
    try{
      var c=pageContext();updateContext();
      var r=await fetch(FN,{method:'POST',headers:{'authorization':'Bearer '+access,'content-type':'application/json'},body:JSON.stringify({message:msg,mode:mode,conversation_id:conversationId||localStorage.getItem('wave.tutor.conversation')||'',page_context:c})});
      var d=await r.json().catch(function(){return {};});
      think.remove();
      if(!r.ok){
        if(d.error==='ai_not_configured')addMessage('system','The Tutor UI and memory are live, but the OpenAI server secret has not been configured yet.');
        else if(r.status===401)addMessage('system','Your WAVE session expired. Sign in again from Account.');
        else addMessage('system',d.message||'WAVE Tutor could not answer right now.');
      }else{
        conversationId=d.conversation_id||conversationId;if(conversationId)localStorage.setItem('wave.tutor.conversation',conversationId);
        addMessage('assistant',d.answer||'');
        if(d.check_question)addMessage('assistant',d.check_question);
      }
    }catch(e){think.remove();addMessage('system','Network error. Your question was not lost locally; try again.');}
    finally{busy=false;sendBtn.disabled=false;input.focus();}
  }
  function toggle(){ensure();panel.classList.toggle('open');updateContext();updateSelection();if(panel.classList.contains('open'))setTimeout(function(){input&&input.focus();},40);}
  function authChanged(){if(!panel)return;renderEmpty();}
  window.addEventListener('wave-cloud-auth',authChanged);
  window.addEventListener('hashchange',updateContext);
  window.WaveTutor={open:function(){ensure();panel.classList.add('open');updateContext();},close:function(){if(panel)panel.classList.remove('open');},context:pageContext};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure);else ensure();
})();