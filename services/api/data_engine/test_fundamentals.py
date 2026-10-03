import unittest
from modules.equities_core import _growth_map

class FundamentalGrowthTests(unittest.TestCase):
    def test_annual_growth_uses_previous_year(self):
        raw={"2023-12-31":100.0,"2024-12-31":120.0,"2025-12-31":150.0}
        out=_growth_map(raw,lag=1)
        self.assertEqual(out["2024-12-31"],20.0)
        self.assertEqual(out["2025-12-31"],25.0)

    def test_yfinance_quarterly_growth_uses_same_quarter_prior_year(self):
        raw={
            "2024-03-31":100.0,"2024-06-30":110.0,"2024-09-30":120.0,"2024-12-31":130.0,
            "2025-03-31":118.0,"2025-06-30":121.0,"2025-09-30":144.0,"2025-12-31":143.0,
        }
        out=_growth_map(raw,lag=4)
        self.assertEqual(out["2025-03-31"],18.0)
        self.assertEqual(out["2025-09-30"],20.0)

    def test_sec_10q_growth_uses_three_report_lag(self):
        raw={
            "2024-03-31":100.0,"2024-06-30":110.0,"2024-09-30":120.0,
            "2025-03-31":120.0,"2025-06-30":121.0,"2025-09-30":138.0,
        }
        out=_growth_map(raw,lag=3)
        self.assertEqual(out["2025-03-31"],20.0)
        self.assertEqual(out["2025-09-30"],15.0)

if __name__=="__main__":
    unittest.main()
