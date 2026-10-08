/* Export the visible Chart.js canvas with its current labels and units. */
(function(root){
  'use strict';
  function safe(s){return String(s).replace(/[^a-z0-9._-]+/gi,'-').replace(/^-|-$/g,'').slice(0,180);}
  function lines(ctx,text,maxWidth){
    var words=String(text).split(/\s+/),out=[],line='';
    words.forEach(function(word){var next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>maxWidth){out.push(line);line=word;}else line=next;});
    if(line)out.push(line);return out;
  }
  async function download(chart,meta){
    if(!chart||!chart.canvas||!meta)throw new Error('Load a chart first.');
    var width=1600,pad=56,font='Arial, sans-serif',measure=document.createElement('canvas').getContext('2d');
    measure.font='bold 32px '+font;
    var titleLines=lines(measure,meta.title,width-2*pad);
    measure.font='24px '+font;
    var legend=meta.legend.map(function(item){return {color:item.color,lines:lines(measure,item.label,width-2*pad-34)};});
    var subtitle=meta.range+' · '+meta.chartType+' · Reporting-period end';
    var headerHeight=pad+titleLines.length*42+42+legend.reduce(function(n,item){return n+item.lines.length*32+8;},0)+26;
    var footer=[];
    if(meta.unavailable)footer.push('N/A: '+meta.unavailable+' unavailable values. See the chart data table for each reason.');
    (meta.sources||[]).forEach(function(s){footer.push('Source: '+s);});
    if((meta.asOf||[]).length)footer.push('Data retrieved: '+meta.asOf.join('; '));
    footer.push('Exported: '+new Date().toISOString()+' · WAVE Terminal');
    measure.font='20px '+font;
    var footerLines=footer.flatMap(function(s){return lines(measure,s,width-2*pad);});
    // Re-render the SAME visible chart at a higher backing resolution. Its range,
    // datasets, visibility, scale configuration and logical layout stay unchanged.
    var dpr=chart.options.devicePixelRatio,logicalWidth=chart.width,logicalHeight=chart.height;
    if(!logicalWidth||!logicalHeight)throw new Error('Chart has no visible size.');
    var plotHeight=Math.round(logicalHeight/logicalWidth*(width-2*pad));
    var canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=headerHeight+plotHeight+footerLines.length*29+pad*2;
    var ctx=canvas.getContext('2d');
    ctx.fillStyle='#0f172a';ctx.fillRect(0,0,canvas.width,canvas.height);
    try{
      chart.options.devicePixelRatio=(width-2*pad)/logicalWidth;
      chart.resize(logicalWidth,logicalHeight);chart.update('none');
      ctx.drawImage(chart.canvas,pad,headerHeight,width-2*pad,plotHeight);
    }finally{
      chart.options.devicePixelRatio=dpr;chart.resize();chart.update('none');
    }
    ctx.textBaseline='top';ctx.fillStyle='#f1f5f9';ctx.font='bold 32px '+font;
    var y=pad;titleLines.forEach(function(s){ctx.fillText(s,pad,y);y+=42;});
    ctx.fillStyle='#cbd5e1';ctx.font='22px '+font;ctx.fillText(subtitle,pad,y);y+=42;
    ctx.font='24px '+font;
    legend.forEach(function(item){ctx.fillStyle=item.color;ctx.fillRect(pad,y+5,18,18);ctx.fillStyle='#e2e8f0';item.lines.forEach(function(s){ctx.fillText(s,pad+34,y);y+=32;});y+=8;});
    y=headerHeight+plotHeight+pad;ctx.font='20px '+font;ctx.fillStyle='#94a3b8';
    footerLines.forEach(function(s){ctx.fillText(s,pad,y);y+=29;});
    var blob=await new Promise(function(resolve,reject){canvas.toBlob(function(b){if(b)resolve(b);else reject(new Error('Browser could not create the PNG.'));},'image/png');});
    var url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=safe('WAVE-'+meta.tickers.join('-')+'-'+meta.period+'-'+meta.mode+'-'+meta.range+'-'+meta.metrics.join('-'))+'.png';
    document.body.appendChild(a);a.click();a.remove();
    // Safari may consume the blob after the click task has completed.
    setTimeout(function(){URL.revokeObjectURL(url);},60000);
    return {filename:a.download,width:canvas.width,height:canvas.height};
  }
  root.WaveChartExport={download:download};
})(typeof window!=='undefined'?window:globalThis);
