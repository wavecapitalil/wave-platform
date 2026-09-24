// ── CONFLUENCE MONITOR ───────────────────────────────────────
var _confWindow=30;

function confSetWindow(days,btn){
  _confWindow=days;
  document.querySelectorAll('#confWindowBtns .cd-vbtn').forEach(function(b){b.classList.remove('active');});
  if(btn) btn.classList.add('active');
  loadConfluence();
}

function confEvidenceCard(title,aligned,summary,body){
  var col=aligned?'#48d18a':'#90a8c2';
  var label=aligned?'ALIGNED':'NOT ALIGNED';
  return '<div class="mini-section" style="border-top:2px solid '+col+'!important">'
    +'<div style="display:flex;justify-content:space-between;gap:10px"><div class="ms-title">'+title+'</div><span style="font-size:9px;font-weight:800;color:'+col+'">'+label+'</span></div>'
    +'<div style="font-size:20px;font-weight:850;color:#edf6ff;margin-top:10px">'+summary+'</div>'
    +'<div style="margin-top:10px">'+body+'</div></div>';
}

async function loadConfluence(){
  var input=document.getElementById('confSymbol');
  if(!input) return;
  var sym=(input.value||'').trim().toUpperCase();
  if(!sym){input.focus();return;}
  input.value=sym;
  var out=document.getElementById('confResults');
  var status=document.getElementById('confStatus');
  if(out) out.innerHTML='<div class="mini-section" style="padding:34px;text-align:center;color:#90a8c2">Checking institutional, insider and analyst evidence…</div>';
  if(status) status.textContent=_confWindow+'-day view · loading…';

  try{
    var d=await fetch(API+'/api/confluence?symbol='+encodeURIComponent(sym)+'&window='+_confWindow).then(function(r){return r.json();});
    if(d.error) throw new Error(d.error);

    var instRows=((d.institutional&&d.institutional.evidence)||[]).filter(function(x){return x.change==='NEW'||x.change==='INCREASED';}).slice(0,8);
    var insRows=((d.insiders&&d.insiders.evidence)||[]).slice(0,8);
    var anRows=((d.analysts&&d.analysts.evidence)||[]).slice(0,8);

    function rows(items,render,empty){
      if(!items.length) return '<div style="font-size:11px;color:#597895">'+empty+'</div>';
      return '<div style="display:flex;flex-direction:column;gap:7px">'+items.map(render).join('')+'</div>';
    }

    var instBody=rows(instRows,function(x){
      return '<div style="font-size:11px;color:#b9d9f4"><b>'+x.institution+'</b> · '+x.change+(x.change_pct!=null?' '+(x.change_pct>=0?'+':'')+x.change_pct.toFixed(1)+'%':'')+' · filed '+(x.filing_date||'—')+'</div>';
    },'No positive 13F change found in the tracked institution set.');

    var insBody=rows(insRows,function(x){
      return '<div style="font-size:11px;color:#b9d9f4"><b>'+(x.name||'Insider')+'</b> · '+(x.shares!=null?Number(x.shares).toLocaleString()+' shares':'purchase')+' · '+(x.date||'—')+'</div>';
    },'No qualifying open-market insider purchase found in this window.');

    var anBody=rows(anRows,function(x){
      return '<div style="font-size:11px;color:#b9d9f4"><b>'+(x.firm||'Analyst')+'</b> · '+(x.action||'')+' · '+(x.from_grade||'')+' → '+(x.to_grade||'')+' · '+(x.date||'—')+'</div>';
    },'No recent analyst revision evidence found in this window.');

    var count=d.aligned_count||0;
    var col=count===3?'#48d18a':count===2?'#ffc857':'#90a8c2';

    out.innerHTML='<div class="hero-card" style="padding:22px;margin-bottom:12px">'
      +'<div style="display:flex;align-items:end;gap:18px;flex-wrap:wrap"><div><div style="font-size:11px;color:#90a8c2">'+d.company+'</div><div style="font-size:34px;font-weight:900;color:#edf6ff">'+d.symbol+'</div></div>'
      +'<div style="margin-left:auto;text-align:right"><div style="font-size:10px;color:#90a8c2">Evidence alignment</div><div style="font-size:40px;font-weight:950;color:'+col+'">'+d.label+'</div></div></div>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">'
      +confEvidenceCard('Institutional',d.alignment&&d.alignment.institutional,(d.institutional&&d.institutional.positive_count||0)+' positive tracked filings',instBody)
      +confEvidenceCard('Insiders',d.alignment&&d.alignment.insiders,(d.insiders&&d.insiders.buy_count||0)+' qualifying purchases',insBody)
      +confEvidenceCard('Analysts',d.alignment&&d.alignment.analysts,(d.analysts&&d.analysts.upgrades||0)+' positive vs '+(d.analysts&&d.analysts.downgrades||0)+' negative',anBody)
      +'</div>';

    if(status) status.textContent=d.symbol+' · '+_confWindow+'D · updated '+new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  }catch(e){
    if(out) out.innerHTML='<div class="callout red">Confluence data unavailable: '+e.message+'</div>';
    if(status) status.textContent='Data unavailable';
  }
}

