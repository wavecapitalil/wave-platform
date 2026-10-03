"""Page-level snapshots that are not direct Flask route captures."""
from __future__ import annotations

from datetime import datetime, timezone
import html
import os
import requests

UTC=timezone.utc
SUPABASE_URL=os.getenv("WAVE_SUPABASE_URL","https://nqmtayofbhletydmiujz.supabase.co")
PUBLISHABLE=os.getenv("WAVE_SUPABASE_PUBLISHABLE_KEY","sb_publishable_5WjaBtaWtb3q7EJ3ldUfXQ_rVKIrZZy")


def _snapshot(key):
    r=requests.get(
        SUPABASE_URL+"/rest/v1/data_snapshots",
        params={"dataset_key":"eq."+key,"select":"data,source_timestamp,calculated_at,logic_version"},
        headers={"apikey":PUBLISHABLE},
        timeout=15,
    )
    r.raise_for_status()
    rows=r.json()
    return rows[0] if rows else None


def _fmt_pct(v):
    try:
        x=float(v)
        return f"{x:+.2f}%"
    except Exception:
        return "—"


def collect_daily_brief():
    market=_snapshot("market:core") or {}
    risk=_snapshot("risk:composite") or {}
    sectors=_snapshot("sectors:sp500") or {}
    rates=_snapshot("rates:curve") or {}

    quotes=(market.get("data") or {}).get("quotes") or {}
    risk_data=risk.get("data") or {}
    score=(risk_data.get("score") or {}).get("composite")
    sector_rows=(sectors.get("data") or {}).get("sectors") or []
    curve=(rates.get("data") or {}).get("curve") or []

    quote_order=["SPY","QQQ","VIX","TNX","GOLD","WTI","DXY","BTC","ETH"]
    quote_html=[]
    for name in quote_order:
        q=quotes.get(name)
        if not q:
            continue
        price=q.get("price")
        price_text=f"{float(price):,.2f}" if isinstance(price,(int,float)) else "—"
        quote_html.append(
            f"<div class='tile'><b>{html.escape(name)}</b><span>{price_text}</span><small>{_fmt_pct(q.get('pct'))}</small></div>"
        )

    top=sector_rows[:3]
    bottom=sector_rows[-3:] if len(sector_rows)>=3 else []
    def sector_list(rows):
        return "".join(
            f"<li><b>{html.escape(str(x.get('name') or x.get('symbol') or ''))}</b> {_fmt_pct(x.get('pct'))}</li>"
            for x in rows
        ) or "<li>Not available</li>"

    curve_html="".join(
        f"<div class='rate'><b>{html.escape(str(x.get('label','')))}</b><span>{x.get('yield','—')}%</span></div>"
        for x in curve
    )

    asof=datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    body=f"""<!doctype html>
<html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>
<style>
body{{margin:0;background:#07111c;color:#edf6ff;font-family:Inter,-apple-system,sans-serif;padding:22px}}
h1{{font-size:28px;margin:0 0 4px}} .sub{{color:#7891ab;font-size:12px;margin-bottom:20px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}}
.tile,.card{{border:1px solid #173752;background:#0a1a2a;border-radius:12px;padding:12px}}
.tile b,.tile span,.tile small{{display:block}} .tile span{{font-size:18px;font-weight:800;margin:5px 0}} .tile small{{color:#9bd1ff}}
.row{{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}} .card h2{{font-size:13px;margin:0 0 10px;color:#9bd1ff}}
ul{{margin:0;padding-left:18px;font-size:12px;line-height:1.8}} .risk{{font-size:42px;font-weight:900}} .rate{{display:flex;justify-content:space-between;border-bottom:1px solid #173752;padding:7px 0;font-size:12px}}
.note{{margin-top:14px;color:#7891ab;font-size:10px;line-height:1.5}}
@media(max-width:650px){{.row{{grid-template-columns:1fr}}}}
</style></head><body>
<h1>WAVE Data Brief</h1><div class='sub'>Automated market snapshot · {asof}</div>
<div class='grid'>{''.join(quote_html)}</div>
<div class='row'>
<div class='card'><h2>Cross-Asset Risk Meter</h2><div class='risk'>{score if score is not None else '—'}<small style='font-size:14px;color:#7891ab'> /100</small></div></div>
<div class='card'><h2>Rates Curve</h2>{curve_html or 'Not available'}</div>
</div>
<div class='row'>
<div class='card'><h2>Leading Sectors</h2><ul>{sector_list(top)}</ul></div>
<div class='card'><h2>Lagging Sectors</h2><ul>{sector_list(bottom)}</ul></div>
</div>
<div class='note'>This is the always-available data-engine fallback brief. The richer editorial WAVE/Blockwise briefing can overwrite this route when a curated brief is published.</div>
</body></html>"""

    return {
        "data":{
            "_response_type":"text",
            "_content_type":"text/html; charset=utf-8",
            "_status_code":200,
            "_route":"/api/daily-brief",
            "_query":{},
            "payload":body,
        },
        "source":"WAVE Data Engine snapshots",
        "source_timestamp":datetime.now(UTC).isoformat(),
        "logic_version":"daily_brief_fallback_v1.0",
        "_snapshot_status":"ok",
    }


def page_registry():
    return {
        "api:/api/daily-brief":("brief",60,collect_daily_brief),
    }
