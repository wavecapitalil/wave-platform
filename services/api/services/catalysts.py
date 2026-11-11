"""Public catalyst calendar for one equity ticker.

Sources are read-only and unauthenticated: SEC EDGAR submissions and full-text
search, Yahoo Finance prices, headlines and a single confirmed earnings date,
and openFDA drug application records. Missing sources stay empty. Nothing here
invents a filing, a headline, a decision, or a price reaction.
"""

from __future__ import annotations

import math
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

SEC_USER_AGENT = "WaveCapital research@wavecapital.com"
SEC_HEADERS = {
    "User-Agent": SEC_USER_AGENT,
    "Accept-Encoding": "gzip, deflate",
    "Accept": "application/json",
}

SYMBOL = re.compile(r"^[A-Z][A-Z0-9.-]{0,14}$")
ACCESSION = re.compile(r"^\d{10}-\d{2}-\d{6}$")
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
NY = ZoneInfo("America/New_York")
DEADBAND = 0.01
REACTION_SESSIONS = 3
ALIGN_GAP_DAYS = 7
LOOKBACK_DAYS = 3 * 366
FORWARD_DAYS = 180
CACHE_TTL = 600
_CACHE: dict[str, tuple[float, str, dict]] = {}

ITEM_TYPES = {
    "2.02": ("earnings", "Quarterly results disclosure"),
    "5.02": ("governance", "Item 5.02 officer, director or compensation disclosure"),
    "1.01": ("transactions", "Material agreement disclosure"),
    "1.02": ("transactions", "Material agreement termination disclosure"),
    "2.01": ("transactions", "Acquisition or disposition disclosure"),
    "2.05": ("restructuring", "Restructuring disclosure"),
    "1.03": ("regulatory", "Bankruptcy or receivership disclosure"),
    "2.06": ("regulatory", "Material impairment disclosure"),
    "4.02": ("regulatory", "Financial statement non-reliance disclosure"),
}

METHODOLOGY = (
    "Catalyst Calendar uses only rows returned by the sources below. An empty source is omitted; "
    "no sample filings, headlines, FDA decisions, earnings dates, or price reactions are filled in.\n"
    "Price: Yahoo Finance daily closes, auto-adjusted for splits and dividends, so the reaction is not split-adjusted a second time. "
    "Currency is the provider currency when it is a three-letter code; otherwise the axis is unlabeled.\n"
    "Reaction window: percent change from the close of the last trading session before the event session "
    "to the close three trading sessions after the event session. The event session is the first session on or after the anchor date. "
    "A change above +1.0% is a rally (green). A change below -1.0% is a drop (red). "
    "A change inside ±1.0% (flat), a future event (upcoming), or a window that does not yet contain the prior close and three later sessions (pending) stays unclassified and is drawn gray. "
    "The figure is an observed price change, not evidence that the catalyst caused the move.\n"
    "Anchor date: SEC filings and news items with an exact timestamp at or after 16:00 America/New_York, and SEC filings with a date but no timestamp, use the next calendar day so the event session is the next session. "
    "Earlier exact timestamps use that calendar date. The 16:00 cutoff does not model exchange early closes. "
    "Earnings-calendar dates and FDA status dates are used as published; a Yahoo earnings range with two different dates is dropped because it is not one confirmed date.\n"
    "Chart placement: past and pending events with an event session are drawn on that session's close. "
    "Upcoming events, and pending events with no session yet, are drawn at the latest close on their own date so they stay visible. That height is not a price forecast. "
    "When several catalysts share a session, later dots are nudged up by about 1.2% of price per dot so each hover target is separate.\n"
    "SEC 8-K rows are the item codes listed in the filing index (earnings 2.02, officer/director/compensation 5.02, selected transaction and distress items). "
    "Item 5.02 is not labeled as a specific appointment or departure; the item covers directors, officers, or compensation. Filing bodies are not rephrased into a story.\n"
    "Buyback rows are 8-K filings on the issuer CIK whose EDGAR full text matched \"repurchase program\" or \"share repurchase authorization\". "
    "No repurchase size is inferred.\n"
    "Schedule 13D rows are EDGAR full-text hits for the issuer's SEC name on forms SC 13D and SC 13D/A. "
    "The line names the filer on the hit when the hit provides a display name. No stake size is inferred. "
    "Company submissions do not list activist 13Ds, so this search is separate.\n"
    "News rows are Yahoo Finance headlines already requested for the ticker, with a title, https link, and publication date, whose title matches a catalyst category "
    "(earnings, guidance, leadership, transactions, regulatory or FDA wording, buyback/dividend, products, partnerships). "
    "Headlines about a conference call, webcast, or a plan to present are skipped. Headline wording is not used to color the dot.\n"
    "FDA rows are openFDA drugsfda submissions for the exact SEC issuer name, and only when a status date exists. "
    "Status code AP is labeled Approval and TA Tentative approval. Any other row is included only when openFDA supplies a status description.\n"
    "Retrieved timestamps in this log are the server collection time, not a market timestamp shown on the chart."
)

_SKIP_TITLE = re.compile(
    r"\b(to report|will report|conference call|webcast details|participate[sd]? in|to present at)\b",
    re.I,
)
_CATEGORY_RULES = (
    ("earnings", re.compile(r"\b(results|earnings|quarterly revenue|annual revenue)\b", re.I)),
    ("guidance", re.compile(r"\b(guidance|outlook|forecast)\b", re.I)),
    ("leadership", re.compile(
        r"\b(appoints?|resigns?|steps? down|succession|to become|names? .{0,50}(ceo|chief)|new (ceo|chief executive))\b",
        re.I,
    )),
    ("transactions", re.compile(r"\b(acquir\w*|acquisition|merger|divest\w*|definitive agreement)\b", re.I)),
    ("regulatory", re.compile(r"\b(antitrust|regulat\w*|court|lawsuit|settlement|recall|approval|bankrupt\w*)\b", re.I)),
    ("capital_returns", re.compile(r"\b(dividend|repurchase|buyback|stock split)\b", re.I)),
    ("products", re.compile(
        r"\b(introduc\w*|unveil\w*|launch\w*|new generation|next generation|new .{0,30}(chip|iphone|gpu|processor)|announces? .{0,45}(platform|chip|iphone|gpu|processor))\b",
        re.I,
    )),
    ("partnerships", re.compile(r"\b(partnership|strategic alliance|multi.year agreement|billion.{0,15}(invest|agreement))\b", re.I)),
)
_FDA_STATUS = {"AP": "Approval", "TA": "Tentative approval"}
_ISSUERS: dict[str, dict] | None = None


def market_today(now: datetime | None = None) -> str:
    moment = now or datetime.now(NY)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=NY)
    return moment.astimezone(NY).date().isoformat()


def _parse_date(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d")


def add_days(value: str, days: int) -> str:
    return (_parse_date(value) + timedelta(days=days)).date().isoformat()


def day_gap(left: str, right: str) -> int:
    return abs((_parse_date(left) - _parse_date(right)).days)


def valid_date(value) -> bool:
    if not isinstance(value, str) or not ISO_DATE.fullmatch(value):
        return False
    try:
        return _parse_date(value).date().isoformat() == value
    except ValueError:
        return False


def clean_text(value, limit: int = 140) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    text = re.sub(r"[\x00-\x1f\x7f]", "", text)
    return text[:limit].strip()


def https_url(value) -> str | None:
    if not isinstance(value, str) or len(value) > 2000:
        return None
    if not value.startswith("https://") or " " in value:
        return None
    host = value.split("/", 3)[2].split("@")[-1].lower()
    if host.startswith("localhost") or host.endswith(".local") or host.endswith(".internal"):
        return None
    return value


def material_category(title: str) -> str | None:
    if not title or _SKIP_TITLE.search(title):
        return None
    for name, pattern in _CATEGORY_RULES:
        if pattern.search(title):
            if name == "capital_returns" and re.search(r"\b(buyback|repurchase)\b", title, re.I):
                return "buyback"
            if name == "regulatory" and re.search(r"\bFDA\b", title):
                return "fda"
            return name
    return None


def to_new_york(value) -> datetime | None:
    if isinstance(value, datetime):
        moment = value if value.tzinfo else value.replace(tzinfo=NY)
        return moment.astimezone(NY)
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=NY)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if not math.isfinite(value):
            return None
        seconds = value / 1000 if value > 10_000_000_000 else value
        try:
            return datetime.fromtimestamp(seconds, NY)
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, str):
        text = value.strip()
        if valid_date(text):
            return datetime.strptime(text, "%Y-%m-%d").replace(tzinfo=NY)
        try:
            moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=NY)
        return moment.astimezone(NY)
    return None


def coerce_date(value, *, today: str) -> str | None:
    moment = to_new_york(value)
    if moment is None:
        return None
    date = moment.date().isoformat()
    if not valid_date(date) or date > add_days(today, FORWARD_DAYS):
        return None
    return date


def anchor_date(event_date: str, timestamp, mode: str) -> str:
    """Return the calendar date used to find the event session."""
    if mode == "as_dated":
        return event_date
    if mode == "next_session":
        return add_days(event_date, 1)
    moment = to_new_york(timestamp)
    if moment is None:
        return add_days(event_date, 1)
    date = moment.date().isoformat()
    if moment.hour >= 16:
        return add_days(date, 1)
    return date


def classify_reaction(anchor: str, sessions: list[dict], today: str, source_date: str | None = None) -> dict | None:
    """Classify the close-to-close reaction. None means the date cannot be aligned.

    Upcoming is reserved for a source date that is still in the future. An
    after-close anchor on the next calendar day stays pending until the window
    completes, rather than being labeled as a future catalyst.
    """
    event_date = source_date or anchor
    if not valid_date(anchor) or not valid_date(event_date) or not sessions:
        return None
    if event_date > today:
        if event_date > add_days(today, FORWARD_DAYS):
            return None
        return {"outcome": "upcoming", "reaction_pct": None, "session_date": None}
    if event_date < add_days(today, -LOOKBACK_DAYS):
        return None
    dates = [row["date"] for row in sessions]
    index = next((i for i, date in enumerate(dates) if date >= anchor), None)
    if index is None:
        if day_gap(dates[-1], event_date) > ALIGN_GAP_DAYS:
            return None
        return {"outcome": "pending", "reaction_pct": None, "session_date": None}
    if day_gap(event_date, dates[index]) > ALIGN_GAP_DAYS:
        return None
    session_date = dates[index]
    if index < 1 or index + REACTION_SESSIONS >= len(sessions):
        return {"outcome": "pending", "reaction_pct": None, "session_date": session_date}
    prior = sessions[index - 1]["close"]
    after = sessions[index + REACTION_SESSIONS]["close"]
    if not _positive(prior) or not _positive(after):
        return {"outcome": "pending", "reaction_pct": None, "session_date": session_date}
    change = after / prior - 1
    if change > DEADBAND:
        outcome = "positive"
    elif change < -DEADBAND:
        outcome = "negative"
    else:
        outcome = "flat"
    return {"outcome": outcome, "reaction_pct": round(change * 100, 2), "session_date": session_date}


def _positive(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def _source(name: str, status: str, rows: int) -> dict:
    return {"name": name, "status": status, "rows": rows}


def parse_sec_filings(payload: dict, cik: str, symbol: str, today: str) -> list[dict]:
    recent = (payload or {}).get("filings", {}).get("recent") or {}
    forms = recent.get("form") or []
    if not isinstance(forms, list):
        return []
    rows = []
    filed = recent.get("filingDate") or []
    accepted = recent.get("acceptanceDateTime") or []
    accessions = recent.get("accessionNumber") or []
    documents = recent.get("primaryDocument") or []
    items = recent.get("items") or []
    for index, form in enumerate(forms):
        if form not in ("8-K", "8-K/A"):
            continue
        if index >= len(filed) or index >= len(accessions):
            continue
        accession = accessions[index]
        file_date = filed[index]
        if not valid_date(file_date) or not isinstance(accession, str) or not ACCESSION.fullmatch(accession):
            continue
        raw_items = items[index] if index < len(items) else ""
        codes = [part.strip() for part in str(raw_items or "").split(",") if part.strip()]
        seen = set()
        for code in codes:
            mapped = ITEM_TYPES.get(code)
            if not mapped or mapped[0] in seen:
                continue
            seen.add(mapped[0])
            document = documents[index] if index < len(documents) else ""
            url = _filing_document_url(cik, accession, document) or _filing_index_url(cik, accession)
            if not url:
                continue
            stamp = accepted[index] if index < len(accepted) else None
            mode = "timestamp" if to_new_york(stamp) else "next_session"
            rows.append({
                "id": f"sec:{accession}:{mapped[0]}",
                "date": file_date,
                "anchor": anchor_date(file_date, stamp, mode),
                "type": mapped[0],
                "line": mapped[1],
                "url": url,
                "source": "SEC EDGAR",
                "origin": "sec",
                "ticker": symbol,
            })
    return rows


def parse_efts(payload: dict, kind: str, symbol: str, issuer_cik: str | None = None) -> list[dict]:
    hits = ((payload or {}).get("hits") or {}).get("hits") or []
    if not isinstance(hits, list):
        return []
    rows = []
    allowed = ("SC 13D", "SC 13D/A") if kind == "activist" else ("8-K", "8-K/A")
    for hit in hits[:40]:
        source = (hit or {}).get("_source") or {}
        form = str(source.get("form") or source.get("file_type") or "")
        file_date = source.get("file_date")
        accession = source.get("adsh")
        if form not in allowed or not valid_date(file_date) or not isinstance(accession, str) or not ACCESSION.fullmatch(accession):
            continue
        ciks = source.get("ciks") or []
        cik = str(ciks[0]) if ciks else (issuer_cik or "")
        if not cik.isdigit():
            continue
        url = _filing_index_url(cik, accession)
        names = source.get("display_names") or []
        filer = _filer_name(names[0]) if names else ""
        if kind == "activist":
            line = f"Schedule 13D — {filer}" if filer else "Schedule 13D filing"
            event_type = "activist"
            origin = "sec"
        else:
            line = "Filing references a share repurchase program"
            event_type = "buyback"
            origin = "sec"
        rows.append({
            "id": f"efts:{kind}:{accession}",
            "date": file_date,
            "anchor": anchor_date(file_date, None, "next_session"),
            "type": event_type,
            "line": clean_text(line),
            "url": url,
            "source": "SEC EDGAR full text",
            "origin": origin,
            "ticker": symbol,
        })
    return rows


def _filer_name(value) -> str:
    text = clean_text(value, 80)
    text = re.sub(r"\s*\(CIK\s+\d+\)\s*$", "", text, flags=re.I).strip()
    text = re.sub(r"\s*\([A-Z0-9.-]+\)\s*$", "", text).strip()
    return text


def _filing_index_url(cik: str, accession: str) -> str | None:
    if not str(cik).isdigit() or not ACCESSION.fullmatch(accession):
        return None
    return f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession.replace('-', '')}/{accession}-index.html"


def _filing_document_url(cik: str, accession: str, document: str) -> str | None:
    if not isinstance(document, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,180}", document):
        return None
    if not str(cik).isdigit() or not ACCESSION.fullmatch(accession):
        return None
    return f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession.replace('-', '')}/{document}"


def parse_news(items, symbol: str, today: str) -> list[dict]:
    if not isinstance(items, list):
        return []
    rows = []
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        content = item.get("content") if isinstance(item.get("content"), dict) else item
        title = clean_text(content.get("title") or item.get("title"), 180)
        category = material_category(title)
        if not category:
            continue
        url = _news_url(content, item)
        published = content.get("pubDate") or content.get("displayTime") or item.get("providerPublishTime")
        moment = to_new_york(published)
        if not url or moment is None or url in seen:
            continue
        date = moment.date().isoformat()
        if not valid_date(date) or date > today:
            continue
        seen.add(url)
        provider = content.get("provider") if isinstance(content.get("provider"), dict) else {}
        publisher = content.get("publisher") or provider.get("displayName") or "Yahoo Finance"
        rows.append({
            "id": f"news:{url}",
            "date": date,
            "anchor": anchor_date(date, published, "timestamp"),
            "type": category,
            "line": clean_text(title),
            "url": url,
            "source": clean_text(publisher, 80) or "Yahoo Finance",
            "origin": "news",
            "ticker": symbol,
        })
    return rows


def _news_url(content: dict, item: dict) -> str | None:
    for key in ("canonicalUrl", "clickThroughUrl"):
        value = content.get(key)
        if isinstance(value, dict):
            found = https_url(value.get("url"))
            if found:
                return found
        found = https_url(value)
        if found:
            return found
    for key in ("link", "url"):
        found = https_url(content.get(key) or item.get(key))
        if found:
            return found
    return None


def parse_earnings_calendar(calendar, symbol: str, today: str) -> list[dict]:
    raw = _earnings_values(calendar)
    dates = []
    for value in raw:
        date = coerce_date(value, today=today)
        if date:
            dates.append(date)
    unique = sorted(set(dates))
    if len(unique) != 1:
        return []
    date = unique[0]
    return [{
        "id": f"earnings:{symbol}:{date}",
        "date": date,
        "anchor": anchor_date(date, None, "as_dated"),
        "type": "earnings",
        "line": "Earnings date",
        "url": None,
        "source": "Yahoo Finance",
        "origin": "earnings",
        "ticker": symbol,
    }]


def _earnings_values(calendar) -> list:
    if calendar is None:
        return []
    if isinstance(calendar, dict):
        value = calendar.get("Earnings Date", calendar.get("earningsDate"))
        if value is None:
            return []
        if isinstance(value, (list, tuple)):
            return list(value)
        return [value]
    columns = getattr(calendar, "columns", None)
    index = getattr(calendar, "index", None)
    try:
        if columns is not None and "Earnings Date" in list(columns):
            return [value for value in calendar["Earnings Date"].tolist() if value is not None]
        if index is not None and "Earnings Date" in list(index):
            value = calendar.loc["Earnings Date"]
            if hasattr(value, "tolist"):
                return [item for item in value.tolist() if item is not None]
            return [value]
    except Exception:
        return []
    return []


def parse_fda(payload: dict, symbol: str) -> list[dict]:
    results = (payload or {}).get("results") or []
    if not isinstance(results, list):
        return []
    rows = []
    for record in results:
        if not isinstance(record, dict):
            continue
        openfda = record.get("openfda") or {}
        brands = openfda.get("brand_name") if isinstance(openfda, dict) else None
        brand = clean_text(brands[0], 60) if isinstance(brands, list) and brands else ""
        application = clean_text(record.get("application_number"), 40)
        for submission in record.get("submissions") or []:
            if not isinstance(submission, dict):
                continue
            raw = str(submission.get("submission_status_date") or "")
            if re.fullmatch(r"\d{8}", raw):
                date = f"{raw[0:4]}-{raw[4:6]}-{raw[6:8]}"
            else:
                date = raw
            if not valid_date(date):
                continue
            code = str(submission.get("submission_status") or "")
            label = _FDA_STATUS.get(code)
            if not label:
                description = submission.get("submission_status_description") or submission.get("submission_class_code_description")
                label = clean_text(description, 60) if isinstance(description, str) else ""
            name = brand or application
            if not label or not name:
                continue
            url = _fda_url(application)
            rows.append({
                "id": f"fda:{application or name}:{date}:{code or label}",
                "date": date,
                "anchor": anchor_date(date, None, "as_dated"),
                "type": "fda",
                "line": clean_text(f"FDA {label} · {name}"),
                "url": url,
                "source": "openFDA",
                "origin": "fda",
                "ticker": symbol,
            })
    return rows


def _fda_url(application: str) -> str | None:
    match = re.search(r"(\d{5,7})", application or "")
    if not match:
        return None
    return "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=" + match.group(1)


def _score(row: dict) -> int:
    return {"sec": 4, "fda": 3, "earnings": 2, "news": 1}.get(row.get("origin"), 0)


def dedup(rows: list[dict]) -> list[dict]:
    kept: list[dict] = []
    for row in sorted(rows, key=lambda item: (item["date"], -_score(item))):
        replaced = False
        for index, prev in enumerate(kept):
            same_day = prev["type"] == row["type"] and prev["date"] == row["date"]
            same_url = bool(prev.get("url") and prev.get("url") == row.get("url") and prev["type"] == row["type"])
            near_earnings = row["type"] == "earnings" and prev["type"] == "earnings" and day_gap(prev["date"], row["date"]) <= 5
            near_buyback = row["type"] == "buyback" and prev["type"] == "buyback" and day_gap(prev["date"], row["date"]) <= 5
            if same_day or same_url or near_earnings or near_buyback:
                if _score(row) > _score(prev):
                    kept[index] = row
                replaced = True
                break
        if not replaced:
            kept.append(row)
    return kept


def assemble(symbol: str, today: str, sessions: list[dict], currency: str | None, events: list[dict], sources: list[dict]) -> dict:
    cleaned = _clean_sessions(sessions)
    if len(cleaned) < 2:
        raise LookupError("price history unavailable")
    classified = []
    for event in events:
        if not event.get("line") or not valid_date(event.get("date", "")):
            continue
        reaction = classify_reaction(event.get("anchor") or event["date"], cleaned, today, event["date"])
        if reaction is None:
            continue
        classified.append({
            "id": str(event.get("id") or event["date"] + event["type"]),
            "date": event["date"],
            "type": event["type"],
            "ticker": symbol,
            "outcome": reaction["outcome"],
            "reaction_pct": reaction["reaction_pct"],
            "line": event["line"],
            "url": https_url(event.get("url")),
            "source": event.get("source") or "",
            "session_date": reaction["session_date"],
            "origin": event.get("origin") or "",
        })
    classified = dedup(classified)
    classified.sort(key=lambda row: (row["date"], row["type"]))
    points = [{"date": row["date"], "close": row["close"]} for row in cleaned]
    index_by_date = {row["date"]: i for i, row in enumerate(points)}
    last_close = cleaned[-1]["close"]
    extras = []
    for event in classified:
        session_date = event.get("session_date")
        if session_date in index_by_date and event["outcome"] != "upcoming":
            event["plot_index"] = index_by_date[session_date]
            event["plot_close"] = points[event["plot_index"]]["close"]
        else:
            extras.append(event["date"])
    for date in sorted(set(extras)):
        if date not in index_by_date:
            points.append({"date": date, "close": None})
            index_by_date[date] = len(points) - 1
    for event in classified:
        event.pop("origin", None)
        if "plot_index" in event:
            continue
        event["plot_index"] = index_by_date.get(event["date"])
        event["plot_close"] = last_close
    return {
        "symbol": symbol,
        "currency": currency if isinstance(currency, str) and re.fullmatch(r"[A-Z]{3}", currency) else None,
        "points": points,
        "catalysts": classified,
        "sources": sources,
        "fetched_at": datetime.now(ZoneInfo("UTC")).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "methodology": METHODOLOGY,
    }


def _clean_sessions(sessions: list[dict]) -> list[dict]:
    rows = []
    seen = set()
    for row in sorted(sessions or [], key=lambda item: item.get("date") or ""):
        date = row.get("date")
        close = row.get("close")
        if not valid_date(date) or not _positive(close) or date in seen:
            continue
        seen.add(date)
        rows.append({"date": date, "close": float(close)})
    return rows


def normalize_symbol(symbol: str) -> str:
    value = (symbol or "").strip().upper()
    if not SYMBOL.fullmatch(value):
        raise ValueError("valid symbol required")
    return value


def load_catalysts(symbol: str, today: str | None = None) -> dict:
    ticker = normalize_symbol(symbol)
    day = today or market_today()
    cached = _CACHE.get(ticker)
    now = time.time()
    if cached and now - cached[0] < CACHE_TTL and cached[1] == day:
        return cached[2]
    sessions, currency = fetch_prices(ticker)
    issuer = fetch_issuer(ticker)
    events, sources = fetch_events(ticker, issuer, day)
    payload = assemble(ticker, day, sessions, currency, events, sources)
    _CACHE[ticker] = (now, day, payload)
    return payload


def fetch_prices(symbol: str) -> tuple[list[dict], str | None]:
    import yfinance as yf

    start = (datetime.now(NY) - timedelta(days=LOOKBACK_DAYS + 10)).date().isoformat()
    frame = yf.Ticker(symbol).history(start=start, interval="1d", auto_adjust=True, actions=False)
    if frame is None or getattr(frame, "empty", True) or "Close" not in getattr(frame, "columns", []):
        raise LookupError("price history unavailable")
    close = frame["Close"]
    if hasattr(close, "columns"):
        close = close.iloc[:, 0]
    rows = []
    for index, value in close.items():
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(number) or number <= 0:
            continue
        date = index.strftime("%Y-%m-%d") if hasattr(index, "strftime") else None
        if not valid_date(date):
            continue
        rows.append({"date": date, "close": number})
    if len({row["date"] for row in rows}) < 2:
        raise LookupError("price history unavailable")
    currency = None
    try:
        info = getattr(yf.Ticker(symbol), "fast_info", {}) or {}
        raw = info.get("currency") if hasattr(info, "get") else getattr(info, "currency", None)
        if isinstance(raw, str) and re.fullmatch(r"[A-Z]{3}", raw):
            currency = raw
    except Exception:
        currency = None
    return rows, currency


def fetch_issuer(symbol: str) -> dict | None:
    global _ISSUERS
    import requests

    try:
        if _ISSUERS is None:
            response = requests.get("https://www.sec.gov/files/company_tickers.json", headers=SEC_HEADERS, timeout=12)
            response.raise_for_status()
            mapped = {}
            for value in response.json().values():
                key = str(value.get("ticker") or "").upper()
                cik = value.get("cik_str")
                if key and cik is not None:
                    mapped[key] = {"cik": str(cik).zfill(10), "name": clean_text(value.get("title") or key, 120)}
            _ISSUERS = mapped
        return _ISSUERS.get(symbol)
    except Exception:
        return None


def fetch_events(symbol: str, issuer: dict | None, today: str) -> tuple[list[dict], list[dict]]:
    start = add_days(today, -LOOKBACK_DAYS)
    end = today
    cik = issuer.get("cik") if issuer else None
    name = issuer.get("name") if issuer else ""
    jobs = {
        "news": lambda: _news_job(symbol, today),
        "earnings": lambda: _earnings_job(symbol, today),
        "sec": lambda: _sec_job(symbol, cik, today),
        "buyback": lambda: _buyback_job(symbol, start, end, cik),
        "activist": lambda: _activist_job(symbol, name, start, end),
        "fda": lambda: _fda_job(symbol, name),
    }
    results = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {key: pool.submit(fn) for key, fn in jobs.items()}
        for key, future in futures.items():
            try:
                results[key] = future.result(timeout=28)
            except Exception:
                results[key] = ([], _source(_SOURCE_NAMES[key], "unavailable", 0))
    events = []
    sources = []
    for key in ("sec", "buyback", "activist", "fda", "earnings", "news"):
        rows, source = results[key]
        events.extend(rows)
        sources.append(source)
    return events, sources


_SOURCE_NAMES = {
    "sec": "SEC EDGAR submissions",
    "buyback": "SEC EDGAR full text · repurchase",
    "activist": "SEC EDGAR full text · Schedule 13D",
    "fda": "openFDA drug applications",
    "earnings": "Yahoo Finance earnings date",
    "news": "Yahoo Finance headlines",
}


def _news_job(symbol: str, today: str):
    import yfinance as yf

    try:
        rows = parse_news(yf.Ticker(symbol).news or [], symbol, today)
        return rows, _source(_SOURCE_NAMES["news"], "available" if rows else "empty", len(rows))
    except Exception:
        return [], _source(_SOURCE_NAMES["news"], "unavailable", 0)


def _earnings_job(symbol: str, today: str):
    import yfinance as yf

    try:
        rows = parse_earnings_calendar(yf.Ticker(symbol).calendar, symbol, today)
        return rows, _source(_SOURCE_NAMES["earnings"], "available" if rows else "empty", len(rows))
    except Exception:
        return [], _source(_SOURCE_NAMES["earnings"], "unavailable", 0)


def _sec_job(symbol: str, cik: str | None, today: str):
    if not cik:
        return [], _source(_SOURCE_NAMES["sec"], "unavailable", 0)
    import requests

    try:
        response = requests.get(
            f"https://data.sec.gov/submissions/CIK{cik}.json",
            headers=SEC_HEADERS,
            timeout=12,
        )
        response.raise_for_status()
        rows = parse_sec_filings(response.json(), cik, symbol, today)
        return rows, _source(_SOURCE_NAMES["sec"], "available" if rows else "empty", len(rows))
    except Exception:
        return [], _source(_SOURCE_NAMES["sec"], "unavailable", 0)


def _search_job(symbol: str, kind: str, query: str, forms: str, start: str, end: str, cik: str | None):
    params = {"q": query, "forms": forms, "dateRange": "custom", "startdt": start, "enddt": end}
    if cik:
        params["ciks"] = cik
    import requests

    try:
        response = requests.get(
            "https://efts.sec.gov/LATEST/search-index",
            params=params,
            headers={**SEC_HEADERS, "Accept": "application/json"},
            timeout=12,
        )
        response.raise_for_status()
        rows = parse_efts(response.json(), kind, symbol, cik)
        name = _SOURCE_NAMES["buyback" if kind == "buyback" else "activist"]
        return rows, _source(name, "available" if rows else "empty", len(rows))
    except Exception:
        name = _SOURCE_NAMES["buyback" if kind == "buyback" else "activist"]
        return [], _source(name, "unavailable", 0)


def _plain(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&#8217;", "'").replace("&#8211;", "-").replace("&amp;", "&")
    return re.sub(r"\s+", " ", text)


def confirms_13d_subject(text: str, name: str, ticker: str) -> bool:
    """Keep a Schedule 13D only when the cover names this issuer, not a lookalike."""
    if not text or not name:
        return False
    plain = _plain(text)
    name_pattern = re.escape(name.strip())
    # The issuer name has to follow the cover label directly. A later mention of the
    # same words, or a longer name that only shares a prefix, does not count.
    labeled = re.compile(
        r"(?:name of issuer|subject company)\W{0,24}" + name_pattern + r"(?![A-Za-z0-9])",
        re.I,
    )
    if labeled.search(plain):
        return True
    if ticker and re.search(
        r"(?:name of issuer|subject company)\W{0,24}\(" + re.escape(ticker) + r"\)",
        plain,
        re.I,
    ):
        return True
    return False


def buyback_line(text: str) -> str | None:
    """Return a one-line description only when the filing states a repurchase authorization."""
    if not text:
        return None
    plain = _plain(text)
    match = re.search(r".{0,90}(?:repurchase|buyback).{0,90}", plain, re.I)
    if not match:
        return None
    window = plain[max(0, match.start() - 90):match.end() + 90]
    if not re.search(r"authoriz|approv|program", window, re.I):
        return None
    amount = re.search(r"\$\s?[\d,.]+\s?(?:billion|million)", window, re.I)
    if amount:
        figure = re.sub(r"\s+", " ", amount.group(0)).strip()
        return clean_text(f"Share repurchase authorization of {figure}")
    return "Filing describes a share repurchase authorization"


def _fetch_excerpt(cik: str, accession: str) -> str:
    import requests

    url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession.replace('-', '')}/{accession}.txt"
    response = requests.get(url, headers=SEC_HEADERS, timeout=8, stream=True)
    response.raise_for_status()
    chunks = []
    size = 0
    for chunk in response.iter_content(16384):
        if not chunk:
            continue
        chunks.append(chunk)
        size += len(chunk)
        if size >= 400_000:
            break
    response.close()
    return b"".join(chunks).decode("utf-8", "replace")


def _buyback_job(symbol: str, start: str, end: str, cik: str | None):
    if not cik:
        return [], _source(_SOURCE_NAMES["buyback"], "unavailable", 0)
    rows, source = _search_job(symbol, "buyback", "repurchase", "8-K", start, end, cik)
    if source["status"] != "available":
        return rows, source
    confirmed = []
    for row in rows[:8]:
        try:
            line = buyback_line(_fetch_excerpt(cik, row["id"].split(":")[-1]))
        except Exception:
            continue
        if not line:
            continue
        row = dict(row)
        row["line"] = line
        confirmed.append(row)
    status = "available" if confirmed else "empty"
    return confirmed, _source(_SOURCE_NAMES["buyback"], status, len(confirmed))


def _activist_job(symbol: str, name: str, start: str, end: str):
    if not name or len(name) < 4:
        return [], _source(_SOURCE_NAMES["activist"], "unavailable", 0)
    safe_name = name.replace('"', "")
    rows = []
    failed = False
    for form in ("SC 13D", "SC 13D/A"):
        found, source = _search_job(symbol, "activist", f'"{safe_name}"', form, start, end, None)
        rows.extend(found)
        if source["status"] == "unavailable":
            failed = True
    confirmed = []
    for row in rows[:8]:
        accession = row["id"].split(":")[-1]
        parts = (row.get("url") or "").split("/")
        try:
            cik = parts[parts.index("data") + 1]
        except ValueError:
            continue
        try:
            text = _fetch_excerpt(cik, accession)
        except Exception:
            continue
        if confirms_13d_subject(text, name, symbol):
            confirmed.append(row)
    if confirmed:
        status = "available"
    elif failed and not rows:
        status = "unavailable"
    else:
        status = "empty"
    return confirmed, _source(_SOURCE_NAMES["activist"], status, len(confirmed))


def _fda_job(symbol: str, name: str):
    if not name:
        return [], _source(_SOURCE_NAMES["fda"], "unavailable", 0)
    import requests

    try:
        response = requests.get(
            "https://api.fda.gov/drug/drugsfda.json",
            params={"search": f'sponsor_name:"{name.replace(chr(34), "")}"', "limit": 20},
            headers=SEC_HEADERS,
            timeout=12,
        )
        if response.status_code == 404:
            return [], _source(_SOURCE_NAMES["fda"], "empty", 0)
        response.raise_for_status()
        rows = parse_fda(response.json(), symbol)
        return rows, _source(_SOURCE_NAMES["fda"], "available" if rows else "empty", len(rows))
    except Exception:
        return [], _source(_SOURCE_NAMES["fda"], "unavailable", 0)
