/* Seven-portfolio extension. Daily adjusted-price paths; never spliced with monthly proxies. */
(async()=>{'use strict';
 const response=await fetch('data/seven-portfolios-results.json');if(!response.ok)throw new Error('נתוני התרשים אינם זמינים');const d=await response.json();
 const names={A:'S&P 500',B:'50% S&P + 50% Nasdaq',C:'70% S&P + 30% זהב',F:'Nasdaq-100',G:'זהב',D:'שלישים',E:'70% Nasdaq + 30% זהב'},colors={A:'#bd4141',B:'#865db3',C:'#a36a37',F:'#2676bc',G:'#b38a21',D:'#338b78',E:'#173c68'};
 const chart=document.getElementById('seven-chart'),info=document.getElementById('seven-value'),controls=document.getElementById('seven-controls'),selected=new Set(d.columns);let log=false;
 d.columns.forEach(k=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;input.addEventListener('change',()=>{input.checked?selected.add(k):selected.delete(k);render();});label.style.borderColor=colors[k];label.append(input,document.createTextNode(names[k]));controls.append(label);});
 const money=v=>'$'+Math.round(v).toLocaleString('en-US');
 function render(){const W=1000,H=410,L=75,R=20,T=20,B=42,rows=d.equity,n=rows.length,chosen=d.columns.filter(k=>selected.has(k));
 if(!chosen.length){chart.innerHTML='';info.textContent='יש לבחור לפחות תיק אחד להצגה.';return;}
 const tr=v=>log?Math.log10(v):v,vals=rows.flatMap(row=>chosen.map(k=>tr(row[d.columns.indexOf(k)+1]))),min=log?Math.floor(Math.min(...vals)):0,max=log?Math.ceil(Math.max(...vals)):Math.ceil(Math.max(...vals)/50000)*50000,x=i=>L+i/(n-1)*(W-L-R),y=v=>H-B-(tr(v)-min)/(max-min)*(H-T-B);let svg='';
 for(let j=0;j<=5;j++){const v=min+j/5*(max-min),yy=H-B-j/5*(H-T-B);svg+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" stroke="#e4e9ee"/><text x="${L-8}" y="${yy+5}" text-anchor="end" font-size="14" fill="#52677a">${money(log?10**v:v)}</text>`;}
 for(let j=0;j<=5;j++){const i=Math.round(j/5*(n-1));svg+=`<text x="${x(i)}" y="${H-12}" text-anchor="middle" font-size="14" fill="#52677a">${rows[i][0].slice(0,7)}</text>`;}
 chosen.forEach(k=>{const c=d.columns.indexOf(k)+1,path=rows.map((r,i)=>(i?'L':'M')+x(i).toFixed(2)+','+y(r[c]).toFixed(2)).join('');svg+=`<path data-portfolio="${k}" d="${path}" fill="none" stroke="${colors[k]}" stroke-width="2"/>`;});chart.setAttribute('viewBox',`0 0 ${W} ${H}`);chart.innerHTML=svg;
 function show(i){info.textContent=rows[i][0]+' | '+chosen.map(k=>names[k]+': '+money(rows[i][d.columns.indexOf(k)+1])).join(' · ');}
 chart.onpointermove=e=>{const box=chart.getBoundingClientRect(),px=(e.clientX-box.left)/box.width*W;show(Math.max(0,Math.min(n-1,Math.round((px-L)/(W-L-R)*(n-1)))));};show(n-1);}
 document.getElementById('seven-scale').onclick=e=>{log=!log;e.target.setAttribute('aria-pressed',String(log));render();};
 document.getElementById('seven-download').onclick=()=>{const url=URL.createObjectURL(new Blob(['date,'+d.columns.map(k=>k+'_USD').join(',')+'\n'+d.equity.map(r=>r.join(',')).join('\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='seven_portfolios_daily_equity_USD.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);};render();window.__SEVEN_PORTFOLIOS_READY__=true;
})().catch(error=>{document.getElementById('seven-value').textContent='לא ניתן לטעון את נתוני התרשים. הטבלאות זמינות; נסו לרענן.';console.error(error);});
