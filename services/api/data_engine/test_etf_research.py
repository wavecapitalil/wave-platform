import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
API_ROOT = HERE.parent
ROOT = API_ROOT.parent.parent
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

import pandas as pd

from services.etf_research import (
    assemble,
    chart_slices,
    collect_etf,
    expense_percent,
    format_aum,
    parse_ssga_holdings,
    price_statistics,
    resolve_symbol,
    guarded_closes,
    usable_pe,
)


class EtfResearchTests(unittest.TestCase):
    def test_sox_alias_and_symbol_guard(self):
        self.assertEqual(resolve_symbol("soxx"), ("SOXX", None))
        symbol, note = resolve_symbol("^SOX")
        self.assertEqual(symbol, "SOXX")
        self.assertIn("SOXX", note)
        with self.assertRaises(ValueError):
            resolve_symbol("SOXX;rm")
        with self.assertRaises(ValueError):
            collect_etf(" ")

    def test_official_xlk_weights_are_percent_and_dated(self):
        raw = (ROOT / "scripts/fixtures/sector-holdings-xlk-20261104.xlsx").read_bytes()
        parsed = parse_ssga_holdings(raw, "XLK", datetime(2026, 11, 5, tzinfo=timezone.utc))
        apple = next(row for row in parsed["positions"] if row["symbol"] == "AAPL")
        self.assertAlmostEqual(apple["weight"], 15.759102, places=4)
        self.assertGreater(parsed["positions"].__len__(), 50)
        self.assertTrue(99 <= sum(row["weight"] for row in parsed["positions"]) <= 101)
        self.assertEqual(parsed["as_of"], "2026-11-04")
        with self.assertRaises(ValueError):
            parse_ssga_holdings(raw, "XLF", datetime(2026, 11, 5, tzinfo=timezone.utc))
        with self.assertRaises(ValueError):
            parse_ssga_holdings(raw, "XLK", datetime(2026, 11, 20, tzinfo=timezone.utc))

    def test_chart_keeps_residual_and_does_not_invent_a_count_from_top_ten(self):
        rows = [{"symbol": f"S{i}", "name": f"S{i}", "weight": 0.06} for i in range(10)]
        slices, count, top10 = chart_slices(rows, complete=False)
        self.assertEqual(count, None)
        self.assertAlmostEqual(top10, 60, places=2)
        self.assertEqual(slices[-1]["symbol"], "OTHER")
        self.assertAlmostEqual(slices[-1]["weight"], 40, places=2)
        official = [{"symbol": "A", "name": "A", "weight": 80}, {"symbol": "B", "name": "B", "weight": 20}]
        slices, count, top10 = chart_slices(official, complete=True, weights_are_percent=True)
        self.assertEqual(count, 2)
        self.assertAlmostEqual(top10, 100, places=2)
        self.assertEqual([item["symbol"] for item in slices], ["A", "B"])

    def test_price_windows_and_refuses_a_short_volatility_sample(self):
        closes = [100] * 253
        closes[-1] = 110
        closes[-22] = 100
        stats = price_statistics(closes)
        self.assertAlmostEqual(stats["momentum_1m"], 10, places=4)
        self.assertIsNone(price_statistics([100, 110])["volatility"])
        self.assertIsNone(price_statistics([100] * 50)["vs_200dma"])

    def test_mixed_split_prints_are_withheld(self):
        index = pd.bdate_range("2026-10-27", periods=5)
        broken = pd.DataFrame({
            "Close": [100, 102, 300, 310, 105],
            "Stock Splits": [0, 0, 0, 0, 3],
        }, index=index)
        closes, note = guarded_closes(broken)
        self.assertEqual(closes, [])
        self.assertIn("No repaired price path", note)
        self.assertIn("3-for-1", note)
        clean = pd.DataFrame({
            "Close": [100, 102, 101, 105],
            "Stock Splits": [0, 0, 0, 3],
        }, index=index[:4])
        closes, note = guarded_closes(clean)
        self.assertIsNone(note)
        self.assertEqual(len(closes), 4)

    def test_unusable_ratios_stay_null(self):
        self.assertIsNone(usable_pe(0.03006))
        self.assertEqual(usable_pe(9.304975), 9.304975)
        self.assertIsNone(expense_percent(0.0033, 1.25))
        self.assertAlmostEqual(expense_percent(0.0033, 0.33), 0.33, places=4)
        self.assertEqual(format_aum(43_666_825_216), "$43.67B")

    def test_assemble_exposes_na_five_year_pe_without_substituting_it(self):
        payload = assemble(
            "SOXX", "iShares PHLX SOX Semiconductor",
            [{"symbol": "NVDA", "name": "NVIDIA", "weight": 0.1}],
            False, {"trailingPE": 0.03, "totalAssets": 100}, [100, 101],
            "2026-11-05T00:00:00+00:00",
            {"source": "Yahoo Finance topHoldings", "note": "partial", "count_note": "count unavailable",
             "top10_note": "top ten", "links": []},
        )
        self.assertIsNone(payload["metrics"]["pe_5y"])
        self.assertIsNone(payload["metrics"]["pe"])
        self.assertIsNone(payload["metrics"]["holdings_count"])
        notes = {field["id"]: field["note"] for field in payload["log"]["fields"]}
        self.assertIn("5-year", notes["pe_5y"])
        self.assertNotIn("as of", payload["name"].lower())


if __name__ == "__main__":
    unittest.main()
