// Shared by both company-research entry points. Escape all provider content.
function forwardEscape(value){
  return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function forwardNote(d){
  var s=d.forward_consensus && d.forward_consensus.selected;
  return s ? 'FY ending '+forwardEscape(s.period_end)+' · '+forwardEscape(s.basis) : 'Verified fiscal-year consensus unavailable';
}
function forwardEpsValue(d){
  var s=d.forward_consensus && d.forward_consensus.selected;
  if(!s || d.eps_forward==null) return '—';
  return forwardEscape(s.currency)+' '+Number(d.eps_forward).toFixed(2);
}
function forwardDetails(d){
  var f=d.forward_consensus;
  if(!f) return '';
  var s=f.selected;
  var html='<div style="margin:18px 0;padding:16px;border:1px solid var(--border);border-radius:10px;overflow-wrap:anywhere">';
  html+='<div style="font-size:13px;font-weight:700;color:#e2e8f0">Forward EPS · Source comparison</div>';
  if(s){
    html+='<div style="margin:8px 0;color:'+(s.confidence==='low'?'#f59e0b':'#94a3b8')+';font-size:12px">'+
      forwardNote(d)+' · '+s.source_count+' sources · '+forwardEscape(s.confidence)+' confidence'+
      (s.source_count===1?' · Single source; no average':'')+'</div>';
    html+='<div style="font-size:12px;color:#94a3b8">Range: '+forwardEscape(s.currency)+' '+s.range_low.toFixed(2)+' – '+s.range_high.toFixed(2)+
      ' · Spread: '+(s.spread_pct==null?'undefined near zero':s.spread_pct.toFixed(1)+'%')+'</div>';
    if(s.pe_unavailable_reason) html+='<div style="font-size:12px;color:#f59e0b;margin-top:6px">P/E unavailable: '+forwardEscape(s.pe_unavailable_reason)+'</div>';
  }else{
    html+='<div style="margin:8px 0;font-size:12px;color:#f59e0b">Comparable forecasts unavailable.</div>';
  }
  html+='<div style="font-size:11px;color:#94a3b8;margin-top:8px">Mean EPS first, then current price / mean EPS. Fiscal year, not next 12 months. Provider adjustments may differ.</div>';
  if(d.price_timestamp) html+='<div style="font-size:11px;color:#94a3b8;margin-top:4px">Quote timestamp: '+forwardEscape(d.price_timestamp)+'</div>';
  var rows=[];
  (f.series||[]).forEach(function(group){
    (group.sources||[]).forEach(function(row){rows.push({row:row,state:group.period_end===(s&&s.period_end)&&group.basis===(s&&s.basis)?'Included':'Other fiscal year / basis'});});
  });
  (f.excluded||[]).forEach(function(row){rows.push({row:row,state:row.reason});});
  if(rows.length){
    html+='<details style="margin-top:12px" open><summary style="cursor:pointer;color:#93c5fd;font-size:12px">Forecast sources and dates</summary>';
    rows.forEach(function(item){
      var row=item.row;
      var url=/^https:\/\/(stockanalysis\.com|www\.nasdaq\.com|finance\.yahoo\.com)\//.test(row.url||'')?row.url:'#';
      html+='<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;color:#94a3b8">'+
        '<a href="'+forwardEscape(url)+'" target="_blank" rel="noopener noreferrer" style="color:#93c5fd">'+forwardEscape(row.source)+'</a>'+ ' · '+forwardEscape(row.provider)+
        ' · '+forwardEscape(row.currency)+' '+Number(row.eps).toFixed(3)+' · FY '+forwardEscape(row.period_end)+' · '+forwardEscape(row.basis)+
        '<div style="font-size:11px;margin-top:3px">'+forwardEscape(item.state)+' · Updated: '+forwardEscape(row.source_updated_at||'Not supplied')+
        ' · Fetched: '+forwardEscape(row.fetched_at)+(row.analysts==null?'':' · Analysts: '+row.analysts)+'</div>'+
        '<div style="font-size:11px;margin-top:3px">'+forwardEscape(row.adjustment_note)+'</div></div>';
    });
    html+='</details>';
  }
  (f.availability||[]).filter(function(x){return x.status!=='ok';}).forEach(function(x){
    html+='<div style="font-size:11px;color:#94a3b8;margin-top:6px">'+forwardEscape(x.source)+': unavailable · '+forwardEscape(x.detail)+'</div>';
  });
  return html+'</div>';
}


function forwardPanel(d){
  if(d.forward_consensus && window.WaveSources){
    WaveSources.html('forward:'+d.symbol,'תחזיות — '+d.symbol,forwardDetails(d));
  }
  return '';
}
