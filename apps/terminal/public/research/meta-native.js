const sources=new URLSearchParams(location.search).get('view')==='sources';
document.getElementById('editorial').hidden=sources;document.getElementById('page-sources').hidden=!sources;
if(!sources){
 const configs=JSON.parse(document.getElementById('meta-chart-configs').textContent);
 try { const {mountChart}=await import('https://persistent.oaistatic.com/plugins/visualize/charts/data-analytics-plugin/1.2.1/charts/element.js');
 for(const config of configs){mountChart(document.querySelector('#'+config.id+' [data-viz-container]'),config);}
 }catch(error){document.querySelectorAll('[data-viz-container]').forEach(el=>{el.textContent='התרשים אינו זמין כרגע. הנתונים המספריים נשמרו בטקסט המחקר.';});}
}
