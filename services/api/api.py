"""WAVE API entrypoint."""

import os

from app_factory import create_app

app = create_app(
    start_background=os.getenv("WAVE_START_BACKGROUND", "1").strip().lower()
    not in {"0", "false", "no", "off"}
)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=False)
