import unittest
from modules.equities_core import _edgar_extract

class SecConceptMergeTests(unittest.TestCase):
    def test_sparse_preferred_concept_is_filled_by_fallback_concept(self):
        facts={
            "PreferredRevenue":{
                "units":{"USD":[
                    {"form":"10-Q","start":"2019-01-01","end":"2019-03-31","filed":"2019-05-01","val":100},
                ]}
            },
            "FallbackRevenue":{
                "units":{"USD":[
                    {"form":"10-Q","start":"2019-01-01","end":"2019-03-31","filed":"2019-05-02","val":999},
                    {"form":"10-Q","start":"2020-01-01","end":"2020-03-31","filed":"2020-05-01","val":120},
                ]}
            },
        }
        out=_edgar_extract(facts,["PreferredRevenue","FallbackRevenue"],"10-Q",60,100)
        self.assertEqual(out["2019-03-31"],100.0)
        self.assertEqual(out["2020-03-31"],120.0)

if __name__=="__main__":
    unittest.main()
