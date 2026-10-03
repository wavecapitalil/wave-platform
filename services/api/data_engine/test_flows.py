import unittest
from unittest.mock import Mock, patch

from services.binance import coinm_positioning

class BinancePositioningFallbackTests(unittest.TestCase):
    @patch("services.binance.requests.get")
    def test_usdm_fallback_preserves_three_positioning_series(self,mock_get):
        def fake(url,params=None,timeout=None):
            r=Mock()
            if "dapi.binance.com" in url:
                r.raise_for_status.side_effect=RuntimeError("451")
                return r
            r.raise_for_status.return_value=None
            if "globalLongShortAccountRatio" in url:
                payload=[{"longAccount":"0.55","shortAccount":"0.45","longShortRatio":"1.2222","timestamp":1}]
            elif "topLongShortAccountRatio" in url:
                payload=[{"longAccount":"0.56","shortAccount":"0.44","longShortRatio":"1.2727","timestamp":1}]
            else:
                payload=[{"longAccount":"0.66","shortAccount":"0.34","longShortRatio":"1.9412","timestamp":1}]
            r.json.return_value=payload
            return r

        series,errors,provider=coinm_positioning("BTCUSD","1h",limit=5)
        self.assertFalse(errors)
        self.assertTrue(series["global_accounts"])
        self.assertTrue(series["top_accounts"])
        self.assertTrue(series["top_positions"])
        self.assertEqual(provider["venue"],"Binance USD-M Futures")
        self.assertEqual(provider["provider_symbol"],"BTCUSDT")
        self.assertTrue(provider["fallback"])

if __name__=="__main__":
    unittest.main()
