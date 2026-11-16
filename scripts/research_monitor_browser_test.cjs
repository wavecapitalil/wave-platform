// Isolated headless browser. All remote requests are intercepted; no credentials/data leave it.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../apps/terminal/public');
const out=process.env.RESEARCH_MONITOR_QA_OUT||'/tmp/wave-research-monitor-browser';
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const p=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);
 if(!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(p,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':p.endsWith('.json')?'application/json':'text/html'});res.end(e?'not found':b);});
});
const cloudMock=`(() => {
 let state={ready:true,signedIn:false,userId:null};
 window.WaveCloud={getStatus:()=>({...state}),getAccessToken:async owner=>owner===state.userId?'synthetic-'+owner:null};
 window.__switchMonitorAccount=id=>{
  dispatchEvent(new Event('wave-cloud-session-changing'));
  const cleared=document.querySelector('#rm-content').textContent;
  state={ready:true,signedIn:!!id,userId:id};
  dispatchEvent(new Event('wave-cloud-auth'));
  return cleared;
 };
})();`;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',args:['--disable-dev-shm-usage','--no-sandbox']});
 const results=[];
 try{
  for(const [name,width,height] of [['desktop',1440,1000],['tablet',1024,768],['phone',390,844]]){
   const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
   const page=await ctx.newPage();let calls=[],held=[],holdA=false;
   const data={A:[{id:'a1',title:'PRIVATE_ACCOUNT_A',hypothesis:'A private hypothesis',template_key:'custom',status:'active'}],B:[]};
   await page.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.pathname.endsWith('/platform-cloud.js'))return route.fulfill({contentType:'application/javascript',body:cloudMock});
    if(u.pathname.endsWith('/supabase-config.js'))return route.fulfill({contentType:'application/javascript',body:`window.WAVE_SUPABASE_CONFIG={url:'https://mock-monitor.invalid',publishableKey:'synthetic-publishable'};`});
    if(u.hostname==='mock-monitor.invalid'){
     const owner=(req.headers().authorization||'').replace('Bearer synthetic-','');
     assert.ok(owner==='A'||owner==='B','Only synthetic accounts permitted');
     assert.equal(u.pathname,'/rest/v1/wave_research_monitors');
     calls.push({owner,method:req.method()});
     if(req.method()==='POST'){
      const body=req.postDataJSON();assert.equal(body.user_id,undefined);assert.equal(body.template_key,'custom');
      data[owner].push({...body,id:owner+'-'+data[owner].length,status:'active'});
      return route.fulfill({status:201,body:''});
     }
     if(holdA&&owner==='A'){held.push(route);return;}
     return route.fulfill({json:data[owner]});
    }
    if(u.origin===origin)return route.continue();
    // CDN, production APIs and telemetry are never contacted, even during app boot.
    return route.fulfill({status:200,contentType:req.resourceType()==='script'?'application/javascript':'application/json',body:req.resourceType()==='script'?'':'{}'});
   });
   await page.goto(origin+'/terminal_app.html#page=research-monitor',{waitUntil:'load'});
   await page.locator('#page-research-monitor.active').waitFor();
   await page.waitForFunction(()=>window.WaveResearchMonitor&&window.__switchMonitorAccount);
   assert.equal(calls.length,0,'Anonymous deep link must not fetch private data');
   assert.equal(await page.locator('#rm-content a[href="account.html"]').count(),1);
   await page.evaluate(()=>__switchMonitorAccount('A'));
   await page.getByText('PRIVATE_ACCOUNT_A',{exact:true}).waitFor();
   const cleared=await page.evaluate(()=>__switchMonitorAccount('B'));
   assert.ok(!cleared.includes('PRIVATE_ACCOUNT_A'),'A is cleared synchronously before B settles');
   await page.waitForFunction(()=>document.querySelector('#rm-content .rm-toolbar'));
   assert.equal(await page.getByText('PRIVATE_ACCOUNT_A',{exact:true}).count(),0);
   // Delayed A response resolves after B: it must never repopulate the private view.
   holdA=true;
   await page.evaluate(()=>__switchMonitorAccount('A'));
   await page.waitForFunction(()=>document.querySelector('#rm-content').getAttribute('aria-busy')==='true');
   for(let i=0;i<100&&!held.length;i++)await page.waitForTimeout(10);
   assert.equal(held.length,1,'Expected one held A response');
   await page.evaluate(()=>__switchMonitorAccount('B'));
   await page.waitForFunction(()=>document.querySelector('#rm-content .rm-toolbar'));
   await held.pop().fulfill({json:data.A});
   await page.waitForTimeout(100);
   assert.equal(await page.getByText('PRIVATE_ACCOUNT_A',{exact:true}).count(),0,'Late A result is ignored');
   // Actual form submission uses safe text rendering, not HTML insertion.
   await page.locator('#rm-content .rm-actions button').first().click();
   const malicious='<img src=x onerror="window.__xss=1">';
   await page.locator('.rm-form input').fill(malicious);
   await page.locator('.rm-form textarea').fill('<script>window.__xss=2</script> Private B hypothesis');
   await page.locator('.rm-form button[type="submit"]').click();
   await page.locator('.rm-card h2').filter({hasText:malicious}).waitFor();
   assert.equal(await page.locator('.rm-card img').count(),0);
   assert.equal(await page.evaluate(()=>window.__xss),undefined);
   await page.locator('[data-rm-card]').first().click();
   assert.ok((await page.locator('.rm-detail pre').innerText()).includes('<script>'));
   assert.equal(await page.locator('.rm-detail script').count(),0);
   const dimensions=await page.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth,monitor:document.querySelector('#page-research-monitor').scrollWidth}));
   assert.ok(dimensions.page<=width+2,`${name} horizontal overflow: ${JSON.stringify(dimensions)}`);
   await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
   const requestsBeforeLogout=calls.length;
   await page.evaluate(()=>__switchMonitorAccount(null));
   await page.locator('#rm-content a[href="account.html"]').waitFor();
   assert.equal(await page.locator('.rm-card').count(),0);
   assert.equal(calls.length,requestsBeforeLogout,'Logout must not request private data');
   results.push({name,width,height,dimensions,privateRequests:calls.length,passed:true});
   await ctx.close();
  }
  console.log(JSON.stringify({scope:'Mocked auth boundary and REST; no production auth or data',results,screenshots:out},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
