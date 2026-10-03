import unittest
from calculations import score_risk_signals, gold_silver_stats, average_seasonal_paths

class DataEngineMathTests(unittest.TestCase):
    def test_risk_weights_sum_to_one(self):
        raw={
            "vix":{"current":18.0},"vxv":20.0,
            "credit":{"hyg_pct":0.4,"lqd_pct":0.1},
            "breadth":{"spy_pct":0.3,"rsp_pct":0.5},
            "sector_rotation":{"spread":0.8},
            "spy_200dma":{"pct_above":4.0},
            "pcr":0.8,
        }
        out=score_risk_signals(raw)
        self.assertEqual(round(sum(x["weight"] for x in out["signals"].values()),8),1.0)
        self.assertTrue(0<=out["composite"]<=100)

    def test_risk_is_more_positive_for_better_inputs(self):
        low={
            "vix":{"current":35.0},"vxv":28.0,
            "credit":{"hyg_pct":-1.0,"lqd_pct":0.2},
            "breadth":{"spy_pct":-0.5,"rsp_pct":-1.0},
            "sector_rotation":{"spread":-2.0},
            "spy_200dma":{"pct_above":-8.0},"pcr":1.3,
        }
        high={
            "vix":{"current":13.0},"vxv":17.0,
            "credit":{"hyg_pct":0.8,"lqd_pct":0.1},
            "breadth":{"spy_pct":0.5,"rsp_pct":1.0},
            "sector_rotation":{"spread":2.0},
            "spy_200dma":{"pct_above":8.0},"pcr":0.6,
        }
        self.assertLess(score_risk_signals(low)["composite"],score_risk_signals(high)["composite"])

    def test_gold_silver_stats(self):
        out=gold_silver_stats([70,80,90,100])
        self.assertEqual(out["current"],100)
        self.assertEqual(out["percentile"],100.0)
        self.assertGreater(out["z_score"],0)

    def test_seasonal_average(self):
        paths=[
            [{"date_key":"01-01","return_pct":0},{"date_key":"01-02","return_pct":2}],
            [{"date_key":"01-01","return_pct":0},{"date_key":"01-02","return_pct":4}],
            [{"date_key":"01-01","return_pct":0},{"date_key":"01-02","return_pct":6}],
        ]
        out=average_seasonal_paths(paths,3)
        self.assertEqual(out[1]["return_pct"],4.0)

if __name__=="__main__":
    unittest.main()
