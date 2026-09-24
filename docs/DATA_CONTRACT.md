# WAVE Data Response Contract

Date: 2026-09-24

Every new or migrated data endpoint should expose provenance metadata under a `meta` object.

## Required fields

```json
{
  "meta": {
    "source": "Provider or source name",
    "source_timestamp": null,
    "fetched_at": "2026-09-24T14:00:00+00:00",
    "freshness": "live",
    "stale": false,
    "fallback": false
  }
}
```

### source
Human-readable provider or source.

### source_timestamp
Timestamp/date of the underlying observation/report where the provider exposes one. May be null when unavailable.

### fetched_at
UTC time when WAVE fetched or generated the response.

### freshness
Descriptive cadence/state such as:
- live
- snapshot
- historical_daily
- historical_monthly
- weekly_report
- reported_with_lag
- mixed
- static

### stale
True only when WAVE intentionally serves data known to be older than the expected freshness window.

### fallback
True when the response came from a fallback provider or fallback method rather than the primary path.

## Current coverage

The stabilized research modules now use the shared helper in `services/api/core/meta.py`:
- Seasonality
- Gold/Silver Ratio
- Hormuz
- Cross-Asset Flows
- Confluence

Legacy endpoints will be migrated to this contract progressively during backend modularization.
