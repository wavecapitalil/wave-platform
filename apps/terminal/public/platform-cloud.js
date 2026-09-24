(function(){
  'use strict';
  var cfg=window.WAVE_SUPABASE_CONFIG||{};
  var client=null,user=null,unsubLocal=null,syncTimer=null,syncing=false,ready=false;

  function emit(){
    window.dispatchEvent(new CustomEvent('wave-cloud-auth',{detail:{
      ready:ready,
      signedIn:!!user,
      email:user&&user.email?user.email:'',
      userId:user&&user.id?user.id:''
    }}));
  }

  function available(){return !!(window.supabase&&window.supabase.createClient&&cfg.url&&cfg.publishableKey);}

  function mapSaved(rows){
    return (rows||[]).map(function(x){return {
      id:x.item_key,title:x.title||x.item_key,type:x.item_type||'research',href:x.href||'',savedAt:x.saved_at||new Date().toISOString()
    };});
  }
  function mapAlerts(rows){
    return (rows||[]).map(function(x){return {
      id:x.id,symbol:x.symbol,condition:x.condition,enabled:!!x.enabled,mode:x.mode||'saved_rule',createdAt:x.created_at
    };});
  }

  async function pull(){
    if(!client||!user)return;
    syncing=true;
    try{
      var results=await Promise.all([
        client.from('profiles').select('full_name,email').eq('user_id',user.id).maybeSingle(),
        client.from('student_progress').select('progress').eq('user_id',user.id).maybeSingle(),
        client.from('watchlist_items').select('symbol').eq('user_id',user.id).order('created_at'),
        client.from('saved_items').select('item_key,title,item_type,href,saved_at').eq('user_id',user.id).order('saved_at',{ascending:false}),
        client.from('alert_rules').select('id,symbol,condition,enabled,mode,created_at').eq('user_id',user.id).order('created_at',{ascending:false})
      ]);
      var errors=results.map(function(x){return x.error;}).filter(Boolean);
      if(errors.length)throw errors[0];
      var patch={};
      if(results[0].data){
        patch.profile={
          displayName:results[0].data.full_name||user.email||'WAVE Member',
          workspace:'Cloud Research',
          authMode:'supabase'
        };
      }else{
        patch.profile={displayName:user.email||'WAVE Member',workspace:'Cloud Research',authMode:'supabase'};
      }
      if(results[1].data&&results[1].data.progress)patch.progress=results[1].data.progress;
      patch.watchlist=(results[2].data||[]).map(function(x){return x.symbol;});
      patch.saved=mapSaved(results[3].data);
      patch.alerts=mapAlerts(results[4].data);
      WavePlatform.hydrateCloud(patch);
      WavePlatform.toast('Cloud workspace synced');
    }catch(e){
      console.warn('WAVE cloud pull failed',e);
      WavePlatform.toast('Cloud sync unavailable — using local workspace');
    }finally{syncing=false;}
  }

  async function pushNow(){
    if(!client||!user||syncing)return;
    syncing=true;
    try{
      var state=WavePlatform.getState();
      var fullName=state.profile&&state.profile.displayName?state.profile.displayName:'';
      await client.from('profiles').update({full_name:fullName}).eq('user_id',user.id);
      var progressResult=await client.from('student_progress').upsert({user_id:user.id,progress:state.progress},{onConflict:'user_id'});
      if(progressResult.error)throw progressResult.error;

      var wdel=await client.from('watchlist_items').delete().eq('user_id',user.id);
      if(wdel.error)throw wdel.error;
      if(state.watchlist.length){
        var wins=await client.from('watchlist_items').insert(state.watchlist.map(function(symbol){return {user_id:user.id,symbol:symbol};}));
        if(wins.error)throw wins.error;
      }

      var sdel=await client.from('saved_items').delete().eq('user_id',user.id);
      if(sdel.error)throw sdel.error;
      if(state.saved.length){
        var sins=await client.from('saved_items').insert(state.saved.map(function(x){return {
          user_id:user.id,item_key:String(x.id),title:x.title||'',item_type:x.type||'research',href:x.href||'',saved_at:x.savedAt||new Date().toISOString()
        };}));
        if(sins.error)throw sins.error;
      }

      var adel=await client.from('alert_rules').delete().eq('user_id',user.id);
      if(adel.error)throw adel.error;
      if(state.alerts.length){
        var ains=await client.from('alert_rules').insert(state.alerts.map(function(x){return {
          user_id:user.id,symbol:x.symbol,condition:x.condition,enabled:!!x.enabled,mode:'saved_rule',created_at:x.createdAt||new Date().toISOString()
        };}));
        if(ains.error)throw ains.error;
      }
    }catch(e){
      console.warn('WAVE cloud push failed',e);
    }finally{syncing=false;}
  }

  function schedulePush(){
    if(!user||syncing)return;
    clearTimeout(syncTimer);
    syncTimer=setTimeout(pushNow,650);
  }

  async function applySession(session){
    user=session&&session.user?session.user:null;
    if(unsubLocal){unsubLocal();unsubLocal=null;}
    if(user){
      await pull();
      unsubLocal=WavePlatform.subscribe(schedulePush);
    }else{
      WavePlatform.setAuthMode('local_preview');
    }
    emit();
  }

  async function init(){
    if(!available()){ready=true;emit();return;}
    client=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    try{
      var result=await client.auth.getSession();
      ready=true;
      await applySession(result.data&&result.data.session?result.data.session:null);
      client.auth.onAuthStateChange(function(_event,session){
        setTimeout(function(){applySession(session);},0);
      });
    }catch(e){
      ready=true;console.warn('WAVE auth init failed',e);emit();
    }
  }

  async function signInWithEmail(email){
    if(!client)throw new Error('Cloud auth unavailable');
    email=String(email||'').trim();
    if(!email)throw new Error('Email is required');
    var redirect=window.location.origin + '/account';
    var res=await client.auth.signInWithOtp({email:email,options:{shouldCreateUser:true,emailRedirectTo:redirect}});
    if(res.error)throw res.error;
    return true;
  }
  async function signOut(){
    if(!client)return;
    var r=await client.auth.signOut();
    if(r.error)throw r.error;
  }

  window.WaveCloud={
    init:init,
    signInWithEmail:signInWithEmail,
    signOut:signOut,
    getStatus:function(){return {ready:ready,signedIn:!!user,email:user&&user.email?user.email:'',userId:user&&user.id?user.id:''};},
    syncNow:async function(){if(user){await pull();await pushNow();}}
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();