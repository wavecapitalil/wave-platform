import unittest
from unittest.mock import patch

from services.binance import coinm_positioning


class FakeResponse:
    def __init__(self, payload=None, error=None):
        self._payload = payload
        self._error = error

    def raise_for_status(self):
        if self._error:
            raise self._error

    def json(self):
        return self._payload


class BinancePositioningFallbackTests(unittest.TestCase):
    @patch("services.binance.requests.get")
    def test_usdm_fallback_preserves_three_positioning_series(self,mock_get):
        def fake(url,params=None,timeout=None):
            if url.startswith("https://dapi.binance.com"):
                return FakeResponse(error=RuntimeError("451 region blocked"))
            if "globalLongShortAccountRatio" in url:
                payload=[{"longAccount":"0.55","shortAccount":"0.45","longShortRatio":"1.2222","timestamp":1}]
            elif "topLongShortAccountRatio" in url:
                payload=[{"longAccount":"0.56","shortAccount":"0.44","longShortRatio":"1.2727","timestamp":1}]
            else:
                payload=[{"longAccount":"0.66","shortAccount":"0.34","longShortRatio":"1.9412","timestamp":1}]
            return FakeResponse(payload=payload)

        mock_get.side_effect=fake
        series,errors,provider=coinm_positioning("BTCUSD","1h",limit=5)

        self.assertFalse(errors)
        self.assertTrue(series["global_accounts"])
        self.assertTrue(series["top_accounts"])
        self.assertTrue(series["top_positions"])
        self.assertEqual(provider["venue"],"Binance USD-M Futures")
        self.assertEqual(provider["provider_symbol"],"BTCUSDT")
        self.assertTrue(provider["fallback"])
        self.assertTrue(any(call.args[0].startswith("https://fapi.binance.com") for call in mock_get.call_args_list))


if __name__=="__main__":
    unittest.main()
