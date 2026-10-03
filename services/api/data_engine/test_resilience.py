import sys
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
API_ROOT = HERE.parent
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from flask import Flask
from modules.equities_core import SECTOR_DETAIL
from modules import hormuz


class DataEngineResilienceTests(unittest.TestCase):
    def test_fintech_peer_universe_covers_hood_and_sofi(self):
        fintech = SECTOR_DETAIL["XLF"]["subsectors"]["Fintech & Brokerage"]
        self.assertIn("HOOD", fintech)
        self.assertIn("SOFI", fintech)

    def test_hormuz_events_provider_outage_is_graceful(self):
        app = Flask(__name__)
        app.register_blueprint(hormuz.bp)
        with patch.object(hormuz, "_fetch_news", side_effect=RuntimeError("provider down")):
            with app.test_client() as client:
                response = client.get("/api/hormuz/events")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["events"], [])
        self.assertIn("warning", payload)
        self.assertNotIn("error", payload)


if __name__ == "__main__":
    unittest.main()
