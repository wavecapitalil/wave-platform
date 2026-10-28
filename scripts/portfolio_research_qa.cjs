// Isolated local browser; read-only fixture for the unrelated legacy article feed.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../apps/terminal/public'),out=process.env.WAVE_PORTFOLIO_QA_OUT||'/tmp/wave-portfolio-qa';
fs.mkdirSync(out,{recursive:true});const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png'};
const server=http.createServer((req,res)=>{const name=decodeURIComponent(req.url.split('?')[0]);let file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(err?'not found':data);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--disable-dev-shm-usage']});const results=[];
try{for(const [width,height]of [[1440,1000],[390,844]]){
 const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{let u=route.request().url();if(u.includes('/api/blog/articles'))return route.fulfill({json:{articles:[],total:0}});if(u.startsWith(base)||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();return route.abort();});
 await page.goto(base+'/blog.html',{waitUntil:'networkidle'});await page.locator('.research-feature').waitFor();
 assert.equal(await page.locator('.page-title').innerText(),'מחקרים');assert.equal(await page.locator('.research-feature img').evaluate(e=>e.complete&&e.naturalWidth>0),true);assert.equal(await page.locator('.research-feature').getAttribute('href'),'research/three-portfolios.html');
 assert(await page.locator('.research-feature__allocations').innerText().then(s=>s.includes('100%')&&s.includes('30%')));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:path.join(out,'listing-'+width+'.png'),fullPage:true});
 await page.locator('.research-feature').click();await page.waitForFunction(()=>window.__ABC_REPORT_READY__===true);
 assert.equal(await page.locator('main section').count(),15);assert.equal(await page.locator('td[data-metric]').count(),24);assert.equal(await page.locator('#overview .card').count(),3);
 assert(await page.locator('#overview').innerText().then(s=>s.includes('100% S&P 500')&&s.includes('50% Nasdaq-100')&&s.includes('30% זהב')));
 const canonical=JSON.parse(fs.readFileSync(process.env.ABC_RESULTS||path.join(root,'research/data/three-portfolios-results.json'),'utf8'));const cells=await page.locator('td[data-metric]').evaluateAll(es=>es.map(e=>({key:e.dataset.metric,k:e.dataset.portfolio,v:Number(e.dataset.value)})));for(const x of cells)assert(Math.abs(x.v-canonical.metrics[x.k][x.key])<1e-8*Math.max(1,Math.abs(x.v)));
 await page.locator('[data-scale="log"]').click();assert.equal(await page.locator('[data-scale="log"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#wealth-chart path').count(),3);await page.locator('[data-scale="linear"]').click();
 await page.locator('#rolling-select').selectOption('10');assert.equal(await page.locator('[data-rolling="10"]').isVisible(),true);assert.equal(await page.locator('[data-rolling="1"]').isVisible(),false);
 await page.locator('#calendar details summary').click();await page.locator('[data-heat-select="C"]').click();assert.equal(await page.locator('[data-heat="C"]').isVisible(),true);
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download-equity').click()]);assert.equal(download.suggestedFilename(),'ABC_daily_equity_annual.csv');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,'report-'+width+'.png')});
 await page.locator('#growth').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'metrics-'+width+'.png')});
 // Every embedded chart is a real image, including charts initially hidden in selectors.
 const broken=await page.locator('main img').evaluateAll(es=>es.filter(e=>e.complete&&e.naturalWidth===0).length);assert.equal(broken,0);
 // Only report errors are decisive here; unrelated legacy app integrations are outside this static change.
 const reportErrors=errors.filter(x=>!x.includes('supabase'));assert.deepEqual(reportErrors,[]);
 results.push({width,status:'PASS',headlineParity:24,sections:15,portfolioLegend:'PASS',banner:'PASS',logToggle:'PASS',rollingSelector:'PASS',monthlySelector:'PASS',csvDownload:'PASS',overflow:'PASS',errors});await ctx.close();}
 fs.writeFileSync(path.join(out,'qa.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e.stack);server.close();process.exitCode=1;});
