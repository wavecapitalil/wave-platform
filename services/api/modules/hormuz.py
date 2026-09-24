from datetime import datetime, timezone
from flask import Blueprint, jsonify
import email.utils
import re
import requests
import xml.etree.ElementTree as ET
import yfinance as yf

bp = Blueprint("hormuz", __name__)

RSS_URL = (
    "https://news.google.com/rss/search?"
    "q=%22Strait+of+Hormuz%22+OR+Hormuz+shipping+oil&hl=en-US&gl=US&ceid=US:en"
)

HIGH_TERMS = (
    "closed", "closure", "blocked", "attack", "struck", "seized",
    "mine", "missile", "shipping halted", "tanker hit"
)
MED_TERMS = (
    "threat", "warning", "tension", "military", "sanction",
    "escort", "disruption", "reroute", "intercept"
)


def _price_snapshot(symbol):
    t = yf.Ticker(symbol)
    hist = t.history(period="6d", interval="1d", auto_adjust=True)
    if hist is None or hist.empty:
        return None
    closes = hist["Close"].dropna().tolist()
    if len(closes) < 2:
        return None
    last = float(closes[-1])
    prev = float(closes[-2])
    pct = (last / prev - 1.0) * 100.0 if prev else 0.0
    return {"price": round(last, 4), "daily_pct": round(pct, 3)}


def _fetch_news(limit=20):
    r = requests.get(RSS_URL, timeout=12, headers={"User-Agent": "WaveCapital/1.0"})
    r.raise_for_status()
    root = ET.fromstring(r.content)
    out = []
    for item in root.findall(".//item")[:limit]:
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub = (item.findtext("pubDate") or "").strip()
        ts = None
        try:
            ts = email.utils.parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat()
        except Exception:
            ts = pub
        text = title.lower()
        severity = "LOW"
        if any(term in text for term in HIGH_TERMS):
            severity = "HIGH"
        elif any(term in text for term in MED_TERMS):
            severity = "MEDIUM"
        out.append({"title": title, "link": link, "published": ts, "severity": severity})
    return out


@bp.get("/api/hormuz/summary")
def hormuz_summary():
    brent = _price_snapshot("BZ=F")
    wti = _price_snapshot("CL=F")
    try:
        news = _fetch_news()
    except Exception:
        news = []

    high = sum(1 for x in news if x["severity"] == "HIGH")
    med = sum(1 for x in news if x["severity"] == "MEDIUM")
    oil_move = max(
        abs((brent or {}).get("daily_pct", 0)),
        abs((wti or {}).get("daily_pct", 0)),
    )

    if high >= 2 or (high >= 1 and oil_move >= 3):
        state = "RED"
    elif high >= 1 or med >= 3 or oil_move >= 2:
        state = "YELLOW"
    else:
        state = "GREEN"

    return jsonify({
        "risk_state": state,
        "brent": brent,
        "wti": wti,
        "events": news[:10],
        "event_counts": {"high": high, "medium": med, "total": len(news)},
        "price_confirmation": oil_move >= 2,
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "news_source": "Google News RSS query",
            "market_source": "Yahoo Finance via yfinance",
            "method": "Descriptive rule set combining incident headline severity and daily Brent/WTI movement.",
            "note": "Macro supply-risk monitor; not a stock-picking signal."
        }
    })


@bp.get("/api/hormuz/events")
def hormuz_events():
    try:
        news = _fetch_news(limit=30)
        return jsonify({"events": news})
    except Exception as exc:
        return jsonify({"error": str(exc), "events": []}), 502
