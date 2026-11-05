"""Public ETF holdings and sector-metric figures.

Holdings prefer the issuer's daily file when that file identifies the requested
fund and is dated within the last seven days. Otherwise the chart uses Yahoo
Finance top holdings. Statistics come from Yahoo quote fields or from the
adjusted close series. Missing inputs stay null; nothing is estimated to fill
a gap.
"""

from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from math import sqrt
import re
import threading
import xml.etree.ElementTree as ET
import zipfile

import requests
import yfinance as yf

_NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
_SSGA = {
    "SPY", "XLK", "XLC", "XLY", "XLP", "XLE", "XLF", "XLV", "XLI", "XLB", "XLRE", "XLU",
}
_ALIASES = {"SOX": "SOXX", "^SOX": "SOXX"}
_SYMBOL = re.compile(r"(?:\^[A-Z][A-Z0-9.\-]{0,9}|[A-Z0-9][A-Z0-9.\-]{0,9})")
_CACHE = {}
_LOCK = threading.Lock()
_TTL_SECONDS = 900


def resolve_symbol(raw):
    text = (raw or "").strip().upper()
    if not _SYMBOL.fullmatch(text):
        raise ValueError("invalid symbol")
    mapped = _ALIASES.get(text)
    if mapped:
        return mapped, (
            f"{text} has no fund-holdings file. Figures use {mapped}, the listed ETF "
            "for that index example."
        )
    return text, None


def ssga_url(symbol):
    if symbol not in _SSGA:
        raise ValueError("no official holdings file for symbol")
    return (
        "https://www.ssga.com/library-content/products/fund-data/etfs/us/"
        "holdings-daily-us-en-" + symbol.lower() + ".xlsx"
    )


def _sheet_rows(content):
    with zipfile.ZipFile(BytesIO(content)) as book:
        if sum(item.file_size for item in book.infolist()) > 10_000_000:
            raise ValueError("oversized holdings workbook")
        strings = [
            "".join(node.itertext())
            for node in ET.fromstring(book.read("xl/sharedStrings.xml")).findall("s:si", _NS)
        ]
        rows = []
        for row in ET.fromstring(book.read("xl/worksheets/sheet1.xml")).findall(".//s:row", _NS):
            values = {}
            for cell in row:
                node = cell.find("s:v", _NS)
                if node is None or node.text is None:
                    continue
                column = re.sub(r"[0-9]", "", cell.get("r") or "")
                values[column] = strings[int(node.text)] if cell.get("t") == "s" else node.text
            if values:
                rows.append(values)
    return rows


def parse_ssga_holdings(content, fund, now=None):
    """Read official daily weights. Weights are already in percent."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    rows = _sheet_rows(content)
    if not any(row.get("A") == "Ticker Symbol:" and row.get("B") == fund for row in rows):
        raise ValueError("fund identity mismatch")
    try:
        stamp = next(row["B"] for row in rows if row.get("A") == "Holdings:")
    except StopIteration as error:
        raise ValueError("holdings date missing") from error
    as_of = datetime.strptime(stamp.removeprefix("As of "), "%d-%b-%Y").replace(tzinfo=timezone.utc)
    age = (now - as_of).total_seconds()
    if not 0 <= age <= 7 * 86400:
        raise ValueError("holdings date stale or future")
    try:
        header = next(index for index, row in enumerate(rows) if row.get("A") == "Name" and row.get("E") == "Weight")
    except StopIteration as error:
        raise ValueError("holdings header missing") from error
    positions = []
    for row in rows[header + 1:]:
        try:
            weight = float(row.get("E"))
        except (TypeError, ValueError):
            continue
        if weight <= 0:
            continue
        positions.append({
            "symbol": (row.get("B") or "").strip(),
            "name": (row.get("A") or "").strip(),
            "weight": weight,
        })
    total = sum(item["weight"] for item in positions)
    if len(positions) < 5 or not 90 <= total <= 110:
        raise ValueError("holdings weights are incomplete")
    return {"as_of": as_of.date().isoformat(), "positions": positions, "source_url": ssga_url(fund)}


def _percent_weights(rows, weights_are_percent):
    cleaned = []
    for row in rows or []:
        try:
            weight = float(row.get("weight"))
        except (TypeError, ValueError):
            continue
        if weight <= 0:
            continue
        cleaned.append({
            "symbol": str(row.get("symbol") or "").strip(),
            "name": str(row.get("name") or "").strip(),
            "weight": weight,
        })
    if cleaned and not weights_are_percent and max(item["weight"] for item in cleaned) <= 1.5:
        for item in cleaned:
            item["weight"] *= 100
    return cleaned


def chart_slices(positions, complete, weights_are_percent=False):
    """Top weights plus the residual book. Residual is not a named holding."""
    ordered = sorted(_percent_weights(positions, weights_are_percent), key=lambda item: item["weight"], reverse=True)
    if not ordered:
        return [], None, None
    shown = ordered[:10]
    shown_sum = sum(item["weight"] for item in shown)
    total = sum(item["weight"] for item in ordered)
    residual = (total - shown_sum) if complete else (100 - shown_sum)
    slices = [
        {"symbol": item["symbol"] or item["name"], "name": item["name"] or item["symbol"], "weight": round(item["weight"], 4)}
        for item in shown
    ]
    if residual >= 0.05:
        slices.append({"symbol": "OTHER", "name": "OTHER", "weight": round(residual, 4)})
    if complete:
        count = len(ordered)
        top10 = round(total if len(ordered) < 10 else shown_sum, 4)
    else:
        count = None
        top10 = round(shown_sum, 4) if len(ordered) >= 10 and shown_sum <= 100.5 else None
    return slices, count, top10


def _finite(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def usable_pe(value):
    number = _finite(value)
    if number is None or not 0.5 <= number <= 500:
        return None
    return number


def trailing_yield_percent(value):
    number = _finite(value)
    if number is None or not 0 <= number < 1:
        return None
    return number * 100


def expense_percent(annual_fraction, net_reported):
    """Prefer the annual-report fraction. Reject the pair when the units disagree."""
    annual = _finite(annual_fraction)
    net = _finite(net_reported)
    annual_pct = annual * 100 if annual is not None and 0 <= annual <= 0.05 else None
    if annual_pct is None and net is not None and 0.05 < net <= 5:
        return net
    if annual_pct is None:
        return None
    if net is None:
        return annual_pct
    if abs(net - annual_pct) <= 0.05 or abs(net * 100 - annual_pct) <= 0.05:
        return annual_pct
    return None


def _series_return(closes, sessions):
    if len(closes) <= sessions:
        return None
    base = closes[-1 - sessions]
    last = closes[-1]
    if base <= 0 or last <= 0:
        return None
    return (last / base - 1) * 100


def _dma_gap(closes, sessions):
    if len(closes) < sessions:
        return None
    window = closes[-sessions:]
    if any(price <= 0 for price in window):
        return None
    average = sum(window) / sessions
    if average <= 0:
        return None
    return (closes[-1] / average - 1) * 100


def guarded_closes(history):
    """Use provider split-adjusted closes, and withhold them when a session still jumps.

    A one-day move above 50% in the last year of an adjusted series is treated
    as a broken print, often a split the vendor has only partly applied. Those
    return statistics stay null. The closes are not rewritten.
    """
    if history is None or getattr(history, "empty", True) or "Close" not in getattr(history, "columns", []):
        return [], None
    closes = history["Close"].dropna().astype(float)
    splits = history["Stock Splits"] if "Stock Splits" in history.columns else None
    notes = []
    if splits is not None:
        for date, ratio in splits[splits > 0].items():
            factor = float(ratio)
            if factor <= 0:
                continue
            label = date.date().isoformat() if hasattr(date, "date") else str(date)[:10]
            notes.append(f"{label} {factor:g}-for-1")
    values = [(index, float(price)) for index, price in closes.items() if float(price) > 0]
    window = values[-253:]
    for (_, left), (right_date, right) in zip(window, window[1:]):
        if left <= 0:
            continue
        change = right / left - 1
        if abs(change) > 0.5:
            when = right_date.date().isoformat() if hasattr(right_date, "date") else str(right_date)[:10]
            split_text = (" Recorded splits: " + ", ".join(notes) + ".") if notes else ""
            return [], (
                f"Return statistics were withheld. The provider split-adjusted close on {when} "
                f"still moves {change * 100:.1f}% in one session.{split_text} "
                "No repaired price path was substituted."
            )
    return [price for _, price in values], None


def price_statistics(closes):
    values = [price for price in (_finite(item) for item in closes) if price is not None and price > 0]
    stats = {
        "momentum_1m": _series_return(values, 21),
        "momentum_3m": _series_return(values, 63),
        "momentum_6m": _series_return(values, 126),
        "momentum_12m": _series_return(values, 252),
        "vs_50dma": _dma_gap(values, 50),
        "vs_200dma": _dma_gap(values, 200),
        "volatility": None,
        "volatility_sessions": 0,
    }
    if len(values) >= 201:
        returns = [values[index] / values[index - 1] - 1 for index in range(1, len(values))]
        window = returns[-252:]
        if len(window) >= 200:
            mean = sum(window) / len(window)
            variance = sum((item - mean) ** 2 for item in window) / (len(window) - 1)
            stats["volatility"] = sqrt(variance) * sqrt(252) * 100
            stats["volatility_sessions"] = len(window)
    return stats


def _round(value, digits=2):
    number = _finite(value)
    if number is None:
        return None
    return round(number, digits)


def format_aum(value):
    number = _finite(value)
    if number is None:
        return "n/a"
    sign = "-" if number < 0 else ""
    magnitude = abs(number)
    for scale, suffix in ((1e12, "T"), (1e9, "B"), (1e6, "M")):
        if magnitude >= scale:
            return f"{sign}${magnitude / scale:.2f}{suffix}"
    return f"{sign}${magnitude:.0f}"


def format_pct(value, signed=False):
    number = _finite(value)
    if number is None:
        return "n/a"
    body = f"{abs(number):.2f}%"
    if number < 0:
        return "-" + body
    if signed and number > 0:
        return "+" + body
    return body


def format_number(value):
    number = _finite(value)
    return "n/a" if number is None else f"{number:.2f}"


def _field(field_id, label, value, display, unit, source, note, links=None):
    return {
        "id": field_id,
        "label": label,
        "value": value,
        "display": display,
        "unit": unit,
        "source": source,
        "note": note,
        "links": links or [],
    }


def assemble(symbol, name, positions, complete, info, closes, fetched_at, holdings_meta, alias_note=None, weights_are_percent=False, price_block=None):
    info = info or {}
    slices, count, top10 = chart_slices(positions, complete, weights_are_percent)
    prices = price_statistics(closes or [])
    aum = _finite(info.get("totalAssets"))
    if aum is not None and aum < 1_000_000:
        aum = None
    pe = usable_pe(info.get("trailingPE"))
    dividend = trailing_yield_percent(info.get("trailingAnnualDividendYield"))
    expense = expense_percent(info.get("annualReportExpenseRatio"), info.get("netExpenseRatio"))
    beta_field = None
    beta = _finite(info.get("beta"))
    if beta is not None and 0 < beta < 10:
        beta_field = "beta"
    else:
        beta = _finite(info.get("beta3Year"))
        if beta is not None and 0 < beta < 10:
            beta_field = "beta3Year"
        else:
            beta = None
    low = _finite(info.get("fiftyTwoWeekLow"))
    high = _finite(info.get("fiftyTwoWeekHigh"))
    if low is None or high is None or not 0 < low < high:
        low = high = None
    yahoo = f"https://finance.yahoo.com/quote/{symbol}"
    yahoo_link = [{"title": f"Yahoo Finance {symbol}", "url": yahoo}]
    holdings_links = list(holdings_meta.get("links") or [])
    metrics = {
        "aum": aum,
        "pe": _round(pe),
        "pe_5y": None,
        "momentum_1m": _round(prices["momentum_1m"]),
        "momentum_3m": _round(prices["momentum_3m"]),
        "momentum_6m": _round(prices["momentum_6m"]),
        "momentum_12m": _round(prices["momentum_12m"]),
        "vs_50dma": _round(prices["vs_50dma"]),
        "vs_200dma": _round(prices["vs_200dma"]),
        "dividend_yield": _round(dividend),
        "expense_ratio": _round(expense),
        "holdings_count": count,
        "top10": _round(top10),
        "beta": _round(beta),
        "volatility": _round(prices["volatility"]),
        "low_52w": _round(low),
        "high_52w": _round(high),
    }
    range_display = "n/a" if low is None else f"{low:.2f}–{high:.2f}"
    yield_note = (
        "Yahoo Finance summaryDetail.trailingAnnualDividendYield, trailing cash dividends "
        "over the last year divided by price."
    )
    other_yield = trailing_yield_percent(info.get("yield"))
    if other_yield is not None and dividend is not None and abs(other_yield - dividend) > 0.05:
        yield_note += f" Yahoo also publishes summaryDetail.yield at {other_yield:.2f}%. That separate figure is not displayed."
    if dividend is None:
        yield_note = "Yahoo Finance trailingAnnualDividendYield was missing or not a fraction below 1. summaryDetail.yield was not substituted."
    if beta_field == "beta3Year":
        beta_note = "Yahoo Finance defaultKeyStatistics.beta3Year. The separate beta field was empty, so the published 3-year beta is shown. It was not recalculated from prices."
    elif beta_field == "beta":
        beta_note = "Yahoo Finance summaryDetail.beta."
    else:
        beta_note = "Yahoo Finance beta and beta3Year were missing. No price regression was substituted."
    sessions = prices["volatility_sessions"]
    if prices["volatility"] is None:
        vol_note = "Annualized volatility needs at least 200 daily simple returns from split-adjusted closes. That history was not available, so no shorter window was substituted."
    else:
        vol_note = (
            f"Sample standard deviation of the last {sessions} daily simple returns on split-adjusted closes, "
            "multiplied by sqrt(252) and expressed in percent."
        )
    momentum_note = (
        "Total return on split-adjusted daily closes: last close divided by the close N sessions earlier, minus 1. "
        "N is 21, 63, 126 and 252. Dividends are not added. A tenor without that much history is null."
    )
    dma_note = "Last split-adjusted close divided by the arithmetic mean of the last 50 or 200 closes, minus 1."
    range_note = "Published 52-week low and high. Not recomputed from the daily close series."
    if price_block:
        for key in ("momentum_1m", "momentum_3m", "momentum_6m", "momentum_12m", "vs_50dma", "vs_200dma", "volatility"):
            metrics[key] = None
        metrics["low_52w"] = None
        metrics["high_52w"] = None
        range_display = "n/a"
        momentum_note = dma_note = vol_note = range_note = price_block
    fields = []
    if alias_note:
        fields.append(_field("symbol", "Symbol", symbol, symbol, None, "Requested ticker", alias_note, yahoo_link))
    fields.extend([
        _field("holdings", "Holdings", None, f"{len(slices)} slices", None, holdings_meta.get("source"), holdings_meta.get("note"), holdings_links),
        _field("aum", "AUM", metrics["aum"], format_aum(metrics["aum"]), "USD", "Yahoo Finance summaryDetail.totalAssets",
               "Published total assets in USD. The fund-operations total-net-assets cell is a different scale and is not used.", yahoo_link),
        _field("pe", "Avg P/E", metrics["pe"], format_number(metrics["pe"]), None, "Yahoo Finance summaryDetail.trailingPE",
               "Published trailing price/earnings for the fund. Not a 5-year average and not recomputed from constituent earnings. Yahoo equityHoldings.priceToEarnings is a different current field and is not displayed or rescaled.", yahoo_link),
        _field("pe_5y", "5Y avg P/E", None, "n/a", None, None,
               "No 5-year average portfolio P/E is published on Yahoo Finance quote statistics or fund holdings. Current constituent weights were not used to invent one.", yahoo_link),
        _field("momentum_1m", "1M", metrics["momentum_1m"], format_pct(metrics["momentum_1m"], signed=True), "%", "Yahoo Finance daily adjusted close", momentum_note, yahoo_link),
        _field("momentum_3m", "3M", metrics["momentum_3m"], format_pct(metrics["momentum_3m"], signed=True), "%", "Yahoo Finance daily adjusted close", momentum_note, yahoo_link),
        _field("momentum_6m", "6M", metrics["momentum_6m"], format_pct(metrics["momentum_6m"], signed=True), "%", "Yahoo Finance daily adjusted close", momentum_note, yahoo_link),
        _field("momentum_12m", "12M", metrics["momentum_12m"], format_pct(metrics["momentum_12m"], signed=True), "%", "Yahoo Finance daily adjusted close", momentum_note, yahoo_link),
        _field("vs_50dma", "vs 50DMA", metrics["vs_50dma"], format_pct(metrics["vs_50dma"], signed=True), "%", "Yahoo Finance daily adjusted close", dma_note, yahoo_link),
        _field("vs_200dma", "vs 200DMA", metrics["vs_200dma"], format_pct(metrics["vs_200dma"], signed=True), "%", "Yahoo Finance daily adjusted close", dma_note, yahoo_link),
        _field("dividend_yield", "Div. yield", metrics["dividend_yield"], format_pct(metrics["dividend_yield"]), "%",
               "Yahoo Finance summaryDetail.trailingAnnualDividendYield", yield_note, yahoo_link),
        _field("expense_ratio", "Expense ratio", metrics["expense_ratio"], format_pct(metrics["expense_ratio"]), "%",
               "Yahoo Finance fundProfile.feesExpensesInvestment.annualReportExpenseRatio",
               "Annual-report expense ratio converted from a fraction to percent when it is between 0 and 5%. info.netExpenseRatio is used only when it matches that percent. Disagreeing units stay null.", yahoo_link),
        _field("holdings_count", "Holdings", metrics["holdings_count"], "n/a" if count is None else str(count), None,
               holdings_meta.get("source"), holdings_meta.get("count_note"), holdings_links),
        _field("top10", "Top 10", metrics["top10"], format_pct(metrics["top10"]), "%", holdings_meta.get("source"), holdings_meta.get("top10_note"), holdings_links),
        _field("beta", "Beta", metrics["beta"], format_number(metrics["beta"]), None,
               "Yahoo Finance " + (beta_field or "beta"), beta_note, yahoo_link),
        _field("volatility", "Volatility", metrics["volatility"], format_pct(metrics["volatility"]), "%",
               "Yahoo Finance daily adjusted close", vol_note, yahoo_link),
        _field("range_52w", "52W", None if metrics["low_52w"] is None else {"low": metrics["low_52w"], "high": metrics["high_52w"]},
               range_display, "USD", "Yahoo Finance summaryDetail fiftyTwoWeekLow / fiftyTwoWeekHigh",
               range_note, yahoo_link),
    ])
    return {
        "symbol": symbol,
        "name": (name or symbol).strip() or symbol,
        "slices": slices,
        "metrics": metrics,
        "log": {"fetched_at": fetched_at, "fields": fields},
    }


def _yahoo_holdings(ticker):
    frame = ticker.funds_data.top_holdings
    if frame is None or frame.empty:
        return []
    rows = []
    for symbol, row in frame.iterrows():
        weight = row.get("Holding Percent")
        if isinstance(weight, dict):
            weight = weight.get("raw")
        rows.append({"symbol": str(symbol), "name": str(row.get("Name") or symbol), "weight": weight})
    return _percent_weights(rows, weights_are_percent=False)


def _holdings_meta(symbol, parsed, yahoo_rows):
    if parsed is not None:
        url = parsed["source_url"]
        return {
            "positions": parsed["positions"],
            "complete": True,
            "source": "State Street daily holdings file",
            "note": (
                f"Official daily holdings file for {symbol}, as of {parsed['as_of']}. "
                "The chart shows the ten largest weights. Other is the residual published weight, not a single position."
            ),
            "count_note": f"Count of positive-weight lines in the {parsed['as_of']} official file, including cash and non-equity lines.",
            "top10_note": "Sum of the ten largest published weights. When the file has fewer than ten lines, the sum of every published weight is used.",
        "links": [{"title": f"SSGA {symbol} holdings", "url": url}, {"title": f"Yahoo Finance {symbol}", "url": f"https://finance.yahoo.com/quote/{symbol}"}],
        "weights_are_percent": True,
    }
    return {
        "positions": yahoo_rows,
        "complete": False,
        "source": "Yahoo Finance topHoldings" if yahoo_rows else None,
        "note": (
            "Yahoo Finance topHoldings. Reported holdingPercent values are fractions and are converted to percent. "
            "Other is 100 minus the sum of the reported weights. It is not a single position."
            if yahoo_rows else
            "No holdings weights were returned. No static file was substituted."
        ),
        "count_note": "The top-holdings list length is not the number of fund holdings, so the count is null.",
        "top10_note": "Sum of the reported top-holdings weights when at least ten weights are present and they do not exceed 100.5%.",
        "links": [{"title": f"Yahoo Finance {symbol}", "url": f"https://finance.yahoo.com/quote/{symbol}"}],
        "weights_are_percent": False,
    }


def _load(symbol, now):
    ticker = yf.Ticker(symbol)
    try:
        info = dict(ticker.info or {})
    except Exception:
        info = {}
    parsed = None
    if symbol in _SSGA:
        try:
            response = requests.get(ssga_url(symbol), timeout=25, headers={"User-Agent": "WaveCapital research@wavecapital.com"})
            response.raise_for_status()
            parsed = parse_ssga_holdings(response.content, symbol, now)
        except Exception:
            parsed = None
    yahoo_rows = []
    if parsed is None:
        try:
            yahoo_rows = _yahoo_holdings(ticker)
        except Exception:
            yahoo_rows = []
    closes = []
    price_block = None
    try:
        history = ticker.history(period="2y", interval="1d", auto_adjust=True, actions=True)
        closes, price_block = guarded_closes(history)
    except Exception:
        closes = []
        price_block = None
    ratio = None
    try:
        operations = ticker.funds_data.fund_operations
        if operations is not None and symbol in getattr(operations, "columns", []):
            ratio = operations.loc["Annual Report Expense Ratio", symbol]
    except Exception:
        ratio = None
    if ratio is not None:
        info["annualReportExpenseRatio"] = ratio
    if not info and not closes and parsed is None and not yahoo_rows:
        raise LookupError("etf data unavailable")
    name = str(info.get("shortName") or info.get("longName") or symbol)
    meta = _holdings_meta(symbol, parsed, yahoo_rows)
    return assemble(
        symbol, name, meta["positions"], meta["complete"], info, closes,
        now.isoformat(), meta, weights_are_percent=meta["weights_are_percent"],
        price_block=price_block,
    )


def collect_etf(symbol, now=None):
    resolved, alias = resolve_symbol(symbol)
    moment = now or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    with _LOCK:
        cached = _CACHE.get(resolved)
        if cached and 0 <= (moment - cached[0]).total_seconds() < _TTL_SECONDS:
            payload = cached[1]
        else:
            payload = None
    if payload is None:
        payload = _load(resolved, moment)
        with _LOCK:
            _CACHE[resolved] = (moment, payload)
    if not alias:
        return payload
    copy = {
        "symbol": payload["symbol"],
        "name": payload["name"],
        "slices": payload["slices"],
        "metrics": payload["metrics"],
        "log": {"fetched_at": payload["log"]["fetched_at"], "fields": list(payload["log"]["fields"])},
    }
    copy["log"]["fields"] = [
        _field("symbol", "Symbol", resolved, resolved, None, "Requested ticker", alias,
               [{"title": f"Yahoo Finance {resolved}", "url": f"https://finance.yahoo.com/quote/{resolved}"}])
    ] + [field for field in copy["log"]["fields"] if field["id"] != "symbol"]
    return copy
