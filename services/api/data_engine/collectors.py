"""Provider collectors for WAVE Data Engine v1."""
from __future__ import annotations

from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
import math
import requests
import pandas as pd
import yfinance as yf

from calculations import (
    score_risk_signals,
    gold_silver_stats,
    average_seasonal_paths,
    RISK_LOGIC_VERSION,
    GSR_LOGIC_VERSION,
    SEASONALITY_LOGIC_VERSION,
)

UTC = timezone.utc

MARKET_SYMBOLS = {
    "SPY": "SPY",
    "QQQ": "QQQ",
    "IWM": "IWM",
    "DIA": "DIA",
    "VIX": "^VIX",
    "TNX": "^TNX",
    "GOLD": "GC=F",
    "WTI": "CL=F",
    "DXY": "DX-Y.NYB",
    "BTC": "BTC-USD",
    "ETH": "ETH-USD",
}

SECTORS = [
    ("XLK", "Technology"), ("XLC", "Comm. Services"), ("XLY", "Consumer Disc."),
    ("XLF", "Financials"), ("XLI", "Industrials"), ("XLV", "Healthcare"),
    ("XLP", "Consumer Staples"), ("XLB", "Materials"), ("XLE", "Energy"),
    ("XLRE", "Real Estate"), ("XLU", "Utilities"),
]

SEASONALITY_SYMBOLS = ["SPY","QQQ","GLD","BTC-USD","IWM","TLT","USO","EEM","DX-Y.NYB","^TNX"]


def _now() -> datetime:
    return datetime.now(UTC)


def _safe(v):
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except Exception:
        return None


def _series(frame, symbol):
    close = frame["Close"]
    if hasattr(close, "columns"):
        if symbol in close.columns:
            return close[symbol].dropna()
        if len(close.columns) == 1:
            return close.iloc[:, 0].dropna()
    return close.dropna()


def _daily_quote(symbol: str) -> dict:
    df = yf.download(symbol, period="5d", interval="1d", auto_adjust=True, progress=False)
    s = _series(df, symbol)
    if s.empty:
        raise LookupError(symbol)
    last = float(s.iloc[-1])
    prev = float(s.iloc[-2]) if len(s) > 1 else last
    return {"price": last, "pct": ((last-prev)/prev*100 if prev else 0.0)}


def collect_market() -> dict:
    symbols = list(MARKET_SYMBOLS.values())
    frame = yf.download(symbols, period="5d", interval="1d", auto_adjust=True, progress=False, group_by="column")
    out = {}
    latest_ts = None
    for name, sym in MARKET_SYMBOLS.items():
        try:
            s = _series(frame, sym)
            if s.empty:
                continue
            last = float(s.iloc[-1])
            prev = float(s.iloc[-2]) if len(s) > 1 else last
            out[name] = {"symbol": sym, "price": round(last, 6), "pct": round(((last-prev)/prev*100 if prev else 0), 4)}
            ts = s.index[-1]
            latest_ts = max(latest_ts, ts) if latest_ts is not None else ts
        except Exception:
            continue
    return {
        "data": {"quotes": out},
        "source": "Yahoo Finance via yfinance",
        "source_timestamp": latest_ts.isoformat() if latest_ts is not None else None,
        "logic_version": "market_snapshot_v1.0",
    }


def _fetch_pcr() -> float:
    url = "https://cdn.cboe.com/api/global/delayed_quotes/options/SPY.json"
    r = requests.get(url, headers={"User-Agent":"Mozilla/5.0"}, timeout=20)
    r.raise_for_status()
    options = r.json()["data"]["options"]
    put_vol = sum((o.get("volume") or 0) for o in options if len(o.get("option","")) >= 9 and o["option"][-9] == "P")
    call_vol = sum((o.get("volume") or 0) for o in options if len(o.get("option","")) >= 9 and o["option"][-9] == "C")
    return round(put_vol / call_vol, 3) if call_vol else 1.0


def collect_risk() -> dict:
    syms = ["^VIX","^VIX3M","HYG","LQD","SPY","RSP","XLK","XLY","XLC","XLU","XLP","XLV"]
    with ThreadPoolExecutor(max_workers=8) as ex:
        quotes = dict(zip(syms, ex.map(_daily_quote, syms)))

    spy_hist = yf.download("SPY", period="1y", interval="1d", auto_adjust=True, progress=False)
    spy_close = _series(spy_hist, "SPY")
    ma200 = float(spy_close.tail(200).mean()) if len(spy_close) >= 200 else float(spy_close.mean())
    spy_price = quotes["SPY"]["price"]
    pct_above = (spy_price-ma200)/ma200*100 if ma200 else 0.0

    vix_hist = yf.download("^VIX", period="7d", interval="1d", auto_adjust=True, progress=False)
    vix_closes = [round(float(x),2) for x in _series(vix_hist,"^VIX").tail(5).tolist()]
    pcr = _fetch_pcr()

    ro = round(sum(quotes[s]["pct"] for s in ["XLK","XLY","XLC"]) / 3, 3)
    rf = round(sum(quotes[s]["pct"] for s in ["XLU","XLP","XLV"]) / 3, 3)

    raw = {
        "vix": {"current": round(quotes["^VIX"]["price"],2), "closes": vix_closes},
        "vxv": round(quotes["^VIX3M"]["price"],2),
        "credit": {"hyg_pct": round(quotes["HYG"]["pct"],3), "lqd_pct": round(quotes["LQD"]["pct"],3)},
        "breadth": {"spy_pct": round(quotes["SPY"]["pct"],3), "rsp_pct": round(quotes["RSP"]["pct"],3)},
        "sector_rotation": {
            "spread": round(ro-rf,3), "risk_on_avg": ro, "risk_off_avg": rf,
            "risk_on_detail": {s:round(quotes[s]["pct"],2) for s in ["XLK","XLY","XLC"]},
            "risk_off_detail": {s:round(quotes[s]["pct"],2) for s in ["XLU","XLP","XLV"]},
        },
        "spy_200dma": {"current":spy_price,"ma200":round(ma200,2),"pct_above":round(pct_above,2)},
        "pcr": pcr,
    }
    scored = score_risk_signals(raw)
    return {
        "data": {**raw, "score": scored},
        "source": "Yahoo Finance + CBOE",
        "source_timestamp": _now().isoformat(),
        "logic_version": RISK_LOGIC_VERSION,
    }


def collect_sectors() -> dict:
    symbols=[s for s,_ in SECTORS]
    raw=yf.download(symbols,period="5d",interval="1d",progress=False,auto_adjust=True)
    rows=[]
    for sym,name in SECTORS:
        try:
            s=_series(raw,sym)
            last=float(s.iloc[-1]); prev=float(s.iloc[-2]) if len(s)>1 else last
            rows.append({"symbol":sym,"name":name,"price":round(last,4),"pct":round((last-prev)/prev*100 if prev else 0,4)})
        except Exception:
            pass
    rows.sort(key=lambda x:x["pct"],reverse=True)
    return {"data":{"sectors":rows},"source":"Yahoo Finance via yfinance","source_timestamp":_now().isoformat(),"logic_version":"sector_strength_v1.0"}


def collect_rates() -> dict:
    curve=[("3M","^IRX"),("2Y","2YY=F"),("5Y","^FVX"),("10Y","^TNX"),("30Y","^TYX")]
    rows=[]
    for label,sym in curve:
        try:
            q=_daily_quote(sym)
            rows.append({"label":label,"symbol":sym,"yield":round(q["price"],3)})
        except Exception:
            pass
    by={x["label"]:x["yield"] for x in rows}
    return {
        "data":{
            "curve":rows,
            "spread_2_10":round(by["10Y"]-by["2Y"],3) if "10Y" in by and "2Y" in by else None,
            "spread_3m_10":round(by["10Y"]-by["3M"],3) if "10Y" in by and "3M" in by else None,
        },
        "source":"Yahoo Finance via yfinance","source_timestamp":_now().isoformat(),"logic_version":"rates_curve_v1.0"
    }


def collect_metals() -> dict:
    gold=yf.download("GC=F",period="10y",interval="1mo",auto_adjust=True,progress=False)
    silver=yf.download("SI=F",period="10y",interval="1mo",auto_adjust=True,progress=False)
    g=_series(gold,"GC=F").to_frame("gold")
    s=_series(silver,"SI=F").to_frame("silver")
    joined=g.join(s,how="inner").dropna()
    joined=joined[joined["silver"]>0]
    ratio=joined["gold"]/joined["silver"]
    stats=gold_silver_stats(ratio.tolist())
    monthly=[{"date":idx.strftime("%Y-%m-%d"),"ratio":round(float(v),4)} for idx,v in ratio.items()]

    gold1=yf.download("GC=F",period="1y",interval="1d",auto_adjust=True,progress=False)
    silver1=yf.download("SI=F",period="1y",interval="1d",auto_adjust=True,progress=False)
    djoin=_series(gold1,"GC=F").to_frame("gold").join(_series(silver1,"SI=F").to_frame("silver"),how="inner").dropna()
    djoin=djoin[djoin["silver"]>0]
    daily=[{"date":idx.strftime("%Y-%m-%d"),"ratio":round(float(row.gold/row.silver),4)} for idx,row in djoin.iterrows()]

    data={
        **stats,
        "n_years":10,
        "start_date":joined.index[0].strftime("%Y-%m-%d"),
        "end_date":joined.index[-1].strftime("%Y-%m-%d"),
        "gold_price":round(float(joined["gold"].iloc[-1]),4),
        "silver_price":round(float(joined["silver"].iloc[-1]),4),
        "monthly":monthly,
        "daily_1y":daily,
    }
    return {"data":data,"source":"Yahoo Finance futures continuous contracts via yfinance","source_timestamp":joined.index[-1].isoformat(),"logic_version":GSR_LOGIC_VERSION}


def _year_path(symbol: str, year: int) -> list[dict]:
    df=yf.download(symbol,start=f"{year}-01-01",end=f"{year+1}-01-01",auto_adjust=True,progress=False)
    if df is None or df.empty:
        return []
    s=_series(df,symbol)
    s=s[s.index.year==year]
    if s.empty:return []
    cumulative=(s/float(s.iloc[0])-1.0)*100.0
    cal=cumulative.reindex(pd.date_range(start=f"{year}-01-01",end=s.index[-1].normalize(),freq="D")).ffill().fillna(0.0)
    return [{"date_key":dt.strftime("%m-%d"),"return_pct":round(float(v),4)} for dt,v in cal.items() if dt.strftime("%m-%d")!="02-29"]


def collect_seasonality(symbol: str) -> dict:
    year=_now().year
    historical=[]; used=[]
    for y in range(year-10,year):
        path=_year_path(symbol,y)
        if path: historical.append(path); used.append(y)
    current=_year_path(symbol,year)
    if not historical: raise LookupError(f"insufficient history for {symbol}")
    avg=average_seasonal_paths(historical,min_samples=max(3,len(historical)-1))
    return {
        "data":{"symbol":symbol,"lookback_years":10,"years_used":used,"historical_average":avg,"current_year":year,"current_path":current},
        "source":"Yahoo Finance via yfinance","source_timestamp":_now().isoformat(),"logic_version":SEASONALITY_LOGIC_VERSION
    }


def collect_crypto() -> dict:
    rows={}
    for symbol in ["BTCUSDT","ETHUSDT","SOLUSDT"]:
        r=requests.get("https://data-api.binance.vision/api/v3/ticker/24hr",params={"symbol":symbol},timeout=15)
        r.raise_for_status(); d=r.json()
        rows[symbol]={"price":float(d["lastPrice"]),"pct_24h":float(d["priceChangePercent"]),"volume":float(d["volume"]),"quote_volume":float(d["quoteVolume"])}
    return {"data":{"assets":rows},"source":"Binance Spot","source_timestamp":_now().isoformat(),"logic_version":"crypto_market_v1.0"}


def collect_calendar() -> dict:
    r=requests.get("https://nfs.faireconomy.media/ff_calendar_thisweek.json",headers={"User-Agent":"Mozilla/5.0","Accept":"application/json"},timeout=15)
    r.raise_for_status()
    return {"data":{"events":r.json()},"source":"Fair Economy calendar","source_timestamp":_now().isoformat(),"logic_version":"econ_calendar_v1.0"}
