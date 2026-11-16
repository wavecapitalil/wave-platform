// DOM/account behavior only; NOT layout, real Auth, or hosted REST verification.
// npm install --prefix /tmp/wave-monitor-dom-test --no-save --package-lock=false jsdom@26.1.0
// JSDOM_MODULE=/tmp/wave-monitor-dom-test/node_modules/jsdom node scripts/research_monitor_dom_test.cjs
const {JSDOM}=require(process.env.JSDOM_MODULE||'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const dom=new JSDOM('<!doctype html><html lang="en"><body><div id="rm-content"></div></body></html>',{url:'https://monitor-test.invalid/terminal_app.html#page=research-monitor',runScripts:'outside-only'});
const w=dom.window,host=w.document.querySelector('#rm-content');
let auth={ready:true,signedIn:false,userId:null},calls=[],held=[],holdA=false,checks=0;
const data={A:[{id:'a1',title:'PRIVATE_ACCOUNT_A',hypothesis:'Only A',template_key:'custom',status:'active'}],B:[]};
w.getLang=()=> 'en';
w.WAVE_SUPABASE_CONFIG={url:'https://mock-monitor.invalid',publishableKey:'synthetic-publishable'};
w.WaveCloud={getStatus:()=>({...auth}),getAccessToken:async owner=>owner===auth.userId?'synthetic-'+owner:null};
w.fetch=async(url,options)=>{
 const u=new URL(url);assert.equal(u.hostname,'mock-monitor.invalid');assert.equal(u.pathname,'/rest/v1/wave_research_monitors');
 const owner=options.headers.Authorization.replace('Bearer synthetic-','');assert.ok(['A','B'].includes(owner));
 calls.push({owner,method:options.method});
 if(options.method==='POST'){
  const body=JSON.parse(options.body);assert.equal(body.user_id,undefined);assert.equal(body.template_key,'custom');
  data[owner].push({...body,id:owner+'-'+data[owner].length});return {ok:true,status:201};
 }
 if(holdA&&owner==='A')return new Promise(resolve=>held.push(()=>resolve({ok:true,json:async()=>data.A})));
 return {ok:true,json:async()=>data[owner]};
};
function change(id){
 w.dispatchEvent(new w.Event('wave-cloud-session-changing'));
 const cleared=host.textContent;
 auth={ready:true,signedIn:!!id,userId:id};
 w.dispatchEvent(new w.Event('wave-cloud-auth'));return cleared;
}
async function until(fn,label){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,2));}throw Error('Timed out: '+label);}
function ok(value,label){assert.ok(value,label);checks++;}
function button(label){return [...host.querySelectorAll('button')].find(b=>b.textContent===label);}
(async()=>{try{
 w.eval(fs.readFileSync(path.join(__dirname,'../apps/terminal/public/terminal-research-monitor.js'),'utf8'));
 w.WaveResearchMonitor.open();
 ok(host.textContent.includes('Sign in'),'Anonymous view');ok(calls.length===0,'No private call while anonymous');
 change('A');await until(()=>host.textContent.includes('PRIVATE_ACCOUNT_A'),'A row');
 ok(!change('B').includes('PRIVATE_ACCOUNT_A'),'A clears synchronously before B settles');
 await until(()=>host.textContent.includes('No studies yet'),'B empty');
 ok(!host.textContent.includes('PRIVATE_ACCOUNT_A'),'B never sees A');
 holdA=true;change('A');await until(()=>held.length===1,'held A');
 change('B');await until(()=>host.textContent.includes('No studies yet'),'B settled');
 held.pop()();await new Promise(r=>setTimeout(r,10));
 ok(!host.textContent.includes('PRIVATE_ACCOUNT_A'),'Late A callback ignored');
 button('New research').click();
 const title='<img src=x onerror="window.__xss=1">';
 host.querySelector('input').value=title;
 host.querySelector('textarea').value='<script>window.__xss=2</script> Private B';
 host.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 await until(()=>!!host.querySelector('.rm-card'),'Created B');
 ok(host.querySelector('.rm-card h2').textContent===title,'Title preserved as text');
 ok(!host.querySelector('.rm-card img'),'Title not inserted as HTML');
 ok(w.__xss===undefined,'No injected execution');
 button('Details').click();
 ok(host.querySelector('.rm-detail pre').textContent.includes('<script>'),'Hypothesis rendered literally');
 ok(!host.querySelector('.rm-detail script'),'Hypothesis not inserted as script');
 const before=calls.length;change(null);
 ok(!host.querySelector('.rm-card'),'Logout clears cards');ok(calls.length===before,'Logout no private fetch');
 ok(host.textContent.includes('Sign in'),'Logout returns to sign-in state');
 // Closing the route clears private DOM, and outstanding reads cannot restore it.
 change('A');await until(()=>held.length===1,'held A before close');
 w.WaveResearchMonitor.close();held.pop()();await new Promise(r=>setTimeout(r,10));
 ok(host.textContent==='','Closed route rejects outstanding results');
 ok(calls.some(c=>c.owner==='B'&&c.method==='POST'),'B create used B token');
 console.log(`Research Monitor DOM/account checks passed (${checks}). No real auth/data/network; layout not tested.`);
}finally{dom.window.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
