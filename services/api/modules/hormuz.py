from datetime import datetime, timezone
from flask import Blueprint, jsonify
import email.utils
import re
import requests
import xml.etree.ElementTree as ET
import yfinance as yf
from core.meta import build_meta

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
    "escort", "disruption", "reroute", "intercept",
    "traffic falls", "shipping traffic", "vessels trickle", "flows fall"
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

    # Google News RSS can be relevance-ordered. The monitor needs chronological
    # ordering so the "latest development" and visible feed are actually current.
    out.sort(key=lambda x: x.get("published") or "", reverse=True)
    return out


@bp.get("/api/hormuz/summary")
def hormuz_summary():
    brent = _price_snapshot("BZ=F")
    wti = _price_snapshot("CL=F")
    try:
        news = _fetch_news()
    except Exception:
        news = []

    now = datetime.now(timezone.utc)
    recent = []
    for item in news:
        try:
            dt = datetime.fromisoformat(str(item.get("published", "")).replace("Z", "+00:00"))
            if (now - dt).days <= 7:
                recent.append(item)
        except Exception:
            continue

    high = sum(1 for x in recent if x["severity"] == "HIGH")
    med = sum(1 for x in recent if x["severity"] == "MEDIUM")

    oil_moves = [
        (brent or {}).get("daily_pct"),
        (wti or {}).get("daily_pct"),
    ]
    oil_moves = [float(x) for x in oil_moves if x is not None]
    oil_avg = sum(oil_moves) / len(oil_moves) if oil_moves else 0.0
    both_positive = len(oil_moves) >= 2 and all(x >= 1.0 for x in oil_moves)
    price_confirmation = oil_avg >= 1.5 or both_positive

    if high >= 1 and price_confirmation:
        state = "RED"
    elif high >= 1 or med >= 2 or oil_avg >= 2.0:
        state = "YELLOW"
    else:
        state = "GREEN"

    return jsonify({
        "risk_state": state,
        "brent": brent,
        "wti": wti,
        "events": news[:10],
        "event_counts": {"high": high, "medium": med, "total": len(recent), "headline_total": len(news)},
        "price_confirmation": price_confirmation,
        "oil_average_daily_pct": round(oil_avg, 3),
        "meta": build_meta(
            "Google News RSS + Yahoo Finance via yfinance",
            freshness="live_with_daily_market_confirmation",
            note="Macro supply-risk monitor; not a stock-picking signal.",
            news_source="Google News RSS query",
            market_source="Yahoo Finance via yfinance",
            method="Descriptive rule set combining incident headline severity and daily Brent/WTI movement.",
        )
    })


@bp.get("/api/hormuz/events")
def hormuz_events():
    try:
        news = _fetch_news(limit=30)
        return jsonify({"events": news, "meta": build_meta("Google News RSS", freshness="live")})
    except Exception as exc:
        return jsonify({"error": str(exc), "events": []}), 502
