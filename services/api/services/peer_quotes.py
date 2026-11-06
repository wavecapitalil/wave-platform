"""Bounded daily-peer collection shared across all Flask snapshot workers."""
from datetime import datetime, timezone
import threading
import time
import yfinance as yf

_slots=threading.BoundedSemaphore(2)
_rate_lock=threading.Lock()
_cache_lock=threading.Lock()
_cache={}
_pending={}
_last_started=0.0
_WAIT_SECONDS=45
_MAX_PENDING=64

def _cached(symbol):
    cached=_cache.get(symbol)
    if cached and cached[0]>time.monotonic():
        if cached[2]:raise RuntimeError('Provider backoff active')
        return cached[1]
    return None

def peer_info(symbol):
    global _last_started
    with _cache_lock:
        cached=_cached(symbol)
        if cached is not None:return cached
        event=_pending.get(symbol)
        leader=event is None
        if leader:
            if len(_pending)>=_MAX_PENDING:raise RuntimeError('Peer pending limit')
            event=threading.Event()
            _pending[symbol]=event
    if not leader:
        # This bounds a follower's wait, not the provider call's total duration.
        if not event.wait(_WAIT_SECONDS):raise TimeoutError('Peer single-flight wait expired')
        with _cache_lock:
            cached=_cached(symbol)
            if cached is not None:return cached
        raise RuntimeError('Peer acquisition did not produce a reusable observation')
    acquired_slot=False
    try:
        acquired_slot=_slots.acquire(timeout=10)
        if not acquired_slot:raise TimeoutError('Peer provider concurrency limit')
        with _cache_lock:
            cached=_cached(symbol)
            if cached is not None:return cached
        with _rate_lock:
            time.sleep(max(0,0.5-(time.monotonic()-_last_started)))
            _last_started=time.monotonic()
        # yfinance transport uses a 30-second timeout for each HTTP request.
        # The semaphore bounds provider calls across all four outer workers.
        info=yf.Ticker(symbol).info
        if not isinstance(info,dict) or not info:raise RuntimeError('Empty provider response')
        if info.get('quoteType') not in ('EQUITY',None):raise RuntimeError('Not an equity quote')
        observation={'info':info,'acquired_at':datetime.now(timezone.utc).isoformat()}
        with _cache_lock:_cache[symbol]=(time.monotonic()+21600,observation,False)
        return observation
    except Exception:
        with _cache_lock:_cache[symbol]=(time.monotonic()+300,None,True)
        raise
    finally:
        if acquired_slot:_slots.release()
        with _cache_lock:
            _pending.pop(symbol,None)
            event.set()
