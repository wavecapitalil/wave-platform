import unittest

from flask_snapshots import route_specs


class RouteRegistryTests(unittest.TestCase):
    def test_keys_are_unique(self):
        specs=route_specs()
        keys=[s.key for s in specs]
        self.assertEqual(len(keys),len(set(keys)))

    def test_critical_pages_are_covered(self):
        keys={s.key for s in route_specs()}
        required=[
            "api:/api/earnings",
            "api:/api/hormuz/summary",
            "api:/api/crypto-global",
            "api:/api/crypto-scanner",
            "api:/api/flows/futures?asset=gold",
            "api:/api/institutions-list",
            "api:/api/confluence?symbol=AAPL&window=30",
            "api:/api/sector-detail?period=1d&sector=XLK",
            "api:/api/cohort-performance?period=24h",
            "api:/api/onchain-history?days=30&kpi=tvl",
        ]
        for key in required:
            self.assertIn(key,keys)

    def test_ttls_match_data_cadence(self):
        specs={s.key:s for s in route_specs()}
        self.assertEqual(specs["api:/api/flows/futures?asset=gold"].ttl_minutes,10080)
        self.assertEqual(specs["api:/api/hormuz/summary"].ttl_minutes,15)
        self.assertEqual(specs["api:/api/institutions-list"].ttl_minutes,10080)
        self.assertEqual(specs["api:/api/earnings"].ttl_minutes,360)


if __name__=="__main__":
    unittest.main()
