from datetime import datetime, timezone

def build_meta(
    source,
    *,
    source_timestamp=None,
    freshness="live",
    stale=False,
    fallback=False,
    note=None,
    **extra,
):
    meta = {
        "source": source,
        "source_timestamp": source_timestamp,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "freshness": freshness,
        "stale": bool(stale),
        "fallback": bool(fallback),
    }
    if note is not None:
        meta["note"] = note
    meta.update(extra)
    return meta
