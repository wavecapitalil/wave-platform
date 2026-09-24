from datetime import datetime, timedelta, timezone
import re
import time
import xml.etree.ElementTree as ET

import requests
import yfinance as yf
from flask import Blueprint, jsonify, request

bp = Blueprint("confluence_v2", __name__)

SEC_HEADERS = {"User-Agent": "WaveCapital research@wavecapital.com"}

INSTITUTIONS = [
    {"name": "Berkshire Hathaway", "cik": "1067983"},
    {"name": "Pershing Square", "cik": "1336528"},
    {"name": "ARK Invest", "cik": "1697748"},
    {"name": "Bridgewater", "cik": "1350694"},
    {"name": "Goldman Sachs", "cik": "886982"},
    {"name": "Citadel Advisors", "cik": "1423053"},
    {"name": "JPMorgan Chase", "cik": "19617"},
]

_CACHE = {}


def _norm(name):
    name = (name or "").upper()
    for token in (
        " INCORPORATED"," CORPORATION"," COMPANY"," LIMITED"," INC"," CORP"," CO",
        " LLC"," LTD"," PLC"," GROUP"," HOLDINGS"," INTERNATIONAL"," TECHNOLOGIES",
        " TECHNOLOGY"," SYSTEMS"," SOLUTIONS"," FINANCIAL"," SERVICES"
    ):
        name = name.replace(token, "")
    return re.sub(r"[^A-Z0-9 ]", "", name).strip()


def _similar(a, b):
    a, b = _norm(a), _norm(b)
    if not a or not b:
        return False
    if a == b or (min(len(a), len(b)) >= 8 and (a.startswith(b) or b.startswith(a))):
        return True
    wa, wb = set(a.split()), set(b.split())
    return bool(wa and wb and len(wa & wb) / len(wa | wb) >= 0.6)


def _parse_13f(xml_text):
    root = ET.fromstring(xml_text)
    out = []
    for e in root.iter():
        if e.tag.split("}")[-1] != "infoTable":
            continue
        row = {}
        for c in e.iter():
            tag = c.tag.split("}")[-1]
            if c.text and tag in {"nameOfIssuer","cusip","value","sshPrnamt"}:
                row[tag] = c.text
        if row.get("nameOfIssuer"):
            out.append(row)
    return out


def _two_13fs(cik):
    padded = str(int(cik)).zfill(10)
    subs = requests.get(
        f"https://data.sec.gov/submissions/CIK{padded}.json",
        headers=SEC_HEADERS, timeout=15
    ).json()
    rec = subs["filings"]["recent"]
    idxs = [i for i, form in enumerate(rec["form"]) if form == "13F-HR"][:2]

    def load(idx):
        accession = rec["accessionNumber"][idx]
        filed = rec["filingDate"][idx]
        acc_nd = accession.replace("-", "")
        page = requests.get(
            f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc_nd}/",
            headers=SEC_HEADERS, timeout=15
        ).text
        paths = re.findall(r'/Archives/edgar/data/[^"\']+\.xml', page, re.I)
        for path in paths:
            if "primary" in path.split("/")[-1].lower():
                continue
            try:
                r = requests.get("https://www.sec.gov" + path, headers=SEC_HEADERS, timeout=20)
                parsed = _parse_13f(r.text)
                if parsed:
                    return parsed, filed
            except Exception:
                continue
        return [], filed

    current = load(idxs[0]) if len(idxs) > 0 else ([], None)
    previous = load(idxs[1]) if len(idxs) > 1 else ([], None)
    return current, previous


def _aggregate(rows):
    out = {}
    for row in rows:
        name = row.get("nameOfIssuer", "")
        try:
            shares = int(float(row.get("sshPrnamt", 0) or 0))
        except Exception:
            shares = 0
        try:
            value = int(float(row.get("value", 0) or 0))
        except Exception:
            value = 0
        key = row.get("cusip") or _norm(name)
        if key not in out:
            out[key] = {"name": name, "shares": 0, "value": 0}
        out[key]["shares"] += shares
        out[key]["value"] += value
    return out


def _institutional_signal(symbol, company_name):
    cache_key = ("inst", symbol)
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached["ts"] < 3600:
        return cached["data"]

    evidence = []
    for inst in INSTITUTIONS:
        try:
            (curr_rows, curr_date), (prev_rows, prev_date) = _two_13fs(inst["cik"])
            curr, prev = _aggregate(curr_rows), _aggregate(prev_rows)

            curr_match = next((v for v in curr.values() if _similar(v["name"], company_name)), None)
            prev_match = next((v for v in prev.values() if _similar(v["name"], company_name)), None)
            if not curr_match:
                continue

            prev_shares = (prev_match or {}).get("shares", 0)
            curr_shares = curr_match.get("shares", 0)
            if prev_shares <= 0:
                change_type = "NEW"
                change_pct = None
            else:
                change_pct = (curr_shares / prev_shares - 1) * 100
                if change_pct > 5:
                    change_type = "INCREASED"
                elif change_pct < -5:
                    change_type = "DECREASED"
                else:
                    change_type = "UNCHANGED"

            evidence.append({
                "institution": inst["name"],
                "change": change_type,
                "change_pct": round(change_pct, 2) if change_pct is not None else None,
                "shares": curr_shares,
                "filing_date": curr_date,
                "previous_filing_date": prev_date,
            })
        except Exception:
            continue

    positive = [x for x in evidence if x["change"] in {"NEW","INCREASED"}]
    result = {
        "aligned": len(positive) > 0,
        "positive_count": len(positive),
        "evidence": evidence,
        "note": "13F data is quarterly and cannot represent true 30-day live institutional buying."
    }
    _CACHE[cache_key] = {"ts": now, "data": result}
    return result


def _analyst_signal(symbol, days):
    try:
        df = yf.Ticker(symbol).upgrades_downgrades
        if df is None or df.empty:
            return {"aligned": False, "upgrades": 0, "downgrades": 0, "evidence": []}
        cutoff = datetime.now() - timedelta(days=days)
        recent = df[df.index >= cutoff.strftime("%Y-%m-%d")].copy()
        rows, ups, downs = [], 0, 0
        for dt, row in recent.iterrows():
            action = str(row.get("Action", "")).lower()
            if action in {"up","init","reit"}:
                ups += 1
            elif action == "down":
                downs += 1
            rows.append({
                "date": str(dt)[:10],
                "firm": str(row.get("Firm", "")),
                "action": action,
                "from_grade": str(row.get("FromGrade", "")),
                "to_grade": str(row.get("ToGrade", "")),
            })
        rows.sort(key=lambda x: x["date"], reverse=True)
        return {
            "aligned": ups > downs and ups > 0,
            "upgrades": ups,
            "downgrades": downs,
            "evidence": rows[:20],
        }
    except Exception:
        return {"aligned": False, "upgrades": 0, "downgrades": 0, "evidence": []}


def _insider_signal(symbol, days):
    try:
        df = yf.Ticker(symbol).insider_transactions
        if df is None or df.empty:
            return {"aligned": False, "buy_count": 0, "evidence": []}
        cutoff = datetime.now() - timedelta(days=days)
        rows = []
        for _, row in df.iterrows():
            text = str(row.get("Text", ""))
            if not re.search(r"purchase|acquisition|direct purchase", text, re.I):
                continue
            if re.search(r"gift|award|grant|exercise", text, re.I):
                continue
            raw_date = row.get("Start Date") or row.get("Date") or ""
            try:
                dt = datetime.fromisoformat(str(raw_date)[:10])
                if dt < cutoff:
                    continue
            except Exception:
                pass
            rows.append({
                "date": str(raw_date)[:10],
                "name": str(row.get("Insider", row.get("Name", ""))),
                "title": str(row.get("Position", row.get("Title", ""))),
                "shares": row.get("Shares"),
                "value": row.get("Value"),
            })
        rows.sort(key=lambda x: x["date"], reverse=True)
        return {"aligned": len(rows) > 0, "buy_count": len(rows), "evidence": rows[:20]}
    except Exception:
        return {"aligned": False, "buy_count": 0, "evidence": []}


@bp.get("/api/confluence")
def confluence():
    symbol = request.args.get("symbol", "").strip().upper()
    if not symbol:
        return jsonify({"error": "symbol required"}), 400

    try:
        window = int(request.args.get("window", "30"))
    except ValueError:
        return jsonify({"error": "window must be an integer"}), 400
    if window not in {7, 30, 90}:
        return jsonify({"error": "window must be 7, 30, or 90"}), 400

    ticker = yf.Ticker(symbol)
    info = ticker.info
    company = info.get("longName") or info.get("shortName") or symbol

    institutional = _institutional_signal(symbol, company)
    insiders = _insider_signal(symbol, window)
    analysts = _analyst_signal(symbol, window)

    aligned = {
        "institutional": bool(institutional["aligned"]),
        "insiders": bool(insiders["aligned"]),
        "analysts": bool(analysts["aligned"]),
    }
    count = sum(1 for v in aligned.values() if v)

    return jsonify({
        "symbol": symbol,
        "company": company,
        "window_days": window,
        "alignment": aligned,
        "aligned_count": count,
        "aligned_total": 3,
        "label": f"{count}/3",
        "institutional": institutional,
        "insiders": insiders,
        "analysts": analysts,
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "method": "Transparent three-way evidence overlap; no opaque 0-100 score.",
            "note": "13F institutional evidence is quarterly, while insider and analyst evidence use the selected window."
        }
    })
