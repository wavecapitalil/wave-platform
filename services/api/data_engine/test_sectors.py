import sys
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from services.sector_pulse import SECTORS, session_move

NY = ZoneInfo("America/New_York")


def _ts(year, month, day, hour, minute):
    return int(datetime(year, month, day, hour, minute, tzinfo=NY).timestamp())


class SectorSessionTests(unittest.TestCase):
    def test_open_session_uses_prior_completed_close(self):
        # Wednesday 25 Nov close, then the Friday 27 Nov shortened session.
        timestamps = [
            _ts(2026, 11, 24, 9, 30),
            _ts(2026, 11, 25, 9, 30),
            _ts(2026, 11, 27, 9, 30),
        ]
        closes = [160.69, 155.79, 157.10]
        meta = {
            "regularMarketPrice": 157.31,
            "regularMarketTime": _ts(2026, 11, 27, 9, 35),
            "previousClose": 155.82,
        }
        move = session_move(meta, timestamps, closes)
        self.assertEqual(move["session"], "2026-11-27")
        self.assertEqual(move["previous_session"], "2026-11-25")
        self.assertEqual(move["previous_close"], 155.79)
        self.assertEqual(move["price"], 157.31)
        self.assertEqual(move["pct"], round((157.31 - 155.79) / 155.79 * 100, 4))

    def test_closed_market_keeps_latest_session(self):
        timestamps = [_ts(2026, 11, 24, 9, 30), _ts(2026, 11, 25, 9, 30)]
        closes = [157.09, 155.79]
        meta = {
            "regularMarketPrice": 155.79,
            "regularMarketTime": _ts(2026, 11, 25, 16, 0),
        }
        move = session_move(meta, timestamps, closes)
        self.assertEqual(move["session"], "2026-11-25")
        self.assertEqual(move["previous_session"], "2026-11-24")
        self.assertEqual(move["pct"], round((155.79 - 157.09) / 157.09 * 100, 4))

    def test_same_day_bar_is_not_the_baseline(self):
        timestamps = [_ts(2026, 11, 27, 9, 30)]
        closes = [157.31]
        meta = {
            "regularMarketPrice": 157.31,
            "regularMarketTime": _ts(2026, 11, 27, 9, 40),
            "previousClose": 155.79,
        }
        move = session_move(meta, timestamps, closes)
        self.assertEqual(move["previous_close"], 155.79)
        self.assertIsNone(move["previous_session"])
        self.assertNotEqual(move["pct"], 0)

    def test_missing_price_is_an_error(self):
        with self.assertRaises(ValueError):
            session_move({"regularMarketTime": _ts(2026, 11, 27, 9, 35)}, [], [])

    def test_universe_is_the_eleven_spdr_sectors(self):
        self.assertEqual(
            [symbol for symbol, _name in SECTORS],
            ["XLK", "XLC", "XLY", "XLF", "XLI", "XLV", "XLP", "XLB", "XLE", "XLRE", "XLU"],
        )


if __name__ == "__main__":
    unittest.main()
