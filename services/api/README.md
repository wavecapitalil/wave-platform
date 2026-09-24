# WAVE API — stabilization baseline

This is the secured working copy of the current Flask backend.

## Changes from legacy v1

- Arbitrary catch-all file serving has been removed.
- Only explicit public frontend files under apps/terminal/public are served.
- CORS is limited to configured origins.
- The original v1 snapshot remains unchanged under legacy/terminal-v1.

## Local run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/api/requirements.txt
python services/api/api.py
```

Open http://localhost:5001/

## Next stabilization work

- reconcile missing Hormuz endpoints
- reconcile Commodities endpoints
- reconcile Seasonality
- restore Comm Flows
- restore Confluence
- add full route smoke tests
- move Morning Brief away from machine-local filesystem dependencies
