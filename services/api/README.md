# WAVE API

The WAVE Terminal backend is a modular Flask application.

## Entry points

- `api.py` — minimal process entrypoint
- `app_factory.py` — Flask application factory and blueprint registry
- `modules/` — route/domain modules
- `services/` — shared external-provider adapters
- `core/` — cross-cutting helpers

## Local run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/api/requirements.txt
python services/api/api.py
```

Open `http://localhost:5001/`.

## Configuration

See `.env.example`.

Important runtime settings:

- `WAVE_ALLOWED_ORIGINS`
- `WAVE_BRIEF_DIR`
- `WAVE_DATA_DIR`
- `WAVE_START_BACKGROUND`
- optional Anthropic/OpenAI credentials/models

Secrets must come from the deployment environment or its secret manager. Do not commit runtime keys.

## Safety / serving model

Frontend files are served only from an explicit allowlist in `modules/frontend.py`.
Arbitrary project files, databases, environment files and Python source are not publicly served.

## Test gates

The migration branch is guarded by:

- Python syntax check
- JavaScript syntax check
- static frontend/API contract check
- Flask route contract check
- security smoke
- core API smoke
- live provider/schema integration
- desktop + iPad browser QA

See `docs/TERMINAL_ARCHITECTURE.md` for the current module map.
