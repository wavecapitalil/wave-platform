"""Bounded daily-peer collection shared across all Flask snapshot workers."""
import math
import threading
import time
import yfinance as yf

_slots=threading.BoundedSemaphore(2)
_rate_lock=threading.Lock()
_cache_lock=threading.Lock()
_cache={}
_last_started=0.0

def peer_info(symbol):
    global _last_started
    now=time.monotonic()
    with _cache_lock:
        cached=_cache.get(symbol)
        if cached and cached[0]>now:
            if cached[2]:raise RuntimeError('Provider backoff active')
            return cached[1]
    if not _slots.acquire(timeout=10):raise TimeoutError('Peer provider concurrency limit')
    try:
        with _cache_lock:
            cached=_cache.get(symbol)
            if cached and cached[0]>time.monotonic():
                if cached[2]:raise RuntimeError('Provider backoff active')
                return cached[1]
        with _rate_lock:
            time.sleep(max(0,0.5-(time.monotonic()-_last_started)))
            _last_started=time.monotonic()
        # yfinance transport uses a 30-second timeout for each HTTP request.
        # The semaphore bounds provider calls across all four outer workers.
        info=yf.Ticker(symbol).info
        if not isinstance(info,dict) or not info:raise RuntimeError('Empty provider response')
        if info.get('quoteType') not in ('EQUITY',None):raise RuntimeError('Not an equity quote')
        with _cache_lock:_cache[symbol]=(time.monotonic()+21600,info,False)
        return info
    except Exception:
        # Do not immediately retry failures or 429s across duplicate baskets.
        with _cache_lock:_cache[symbol]=(time.monotonic()+300,None,True)
        raise
    finally:_slots.release()
