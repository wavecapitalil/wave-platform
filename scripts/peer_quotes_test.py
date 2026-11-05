import sys,unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'services/api'))
from services import peer_quotes as p
class PeerQuotesTest(unittest.TestCase):
 def setUp(self):p._cache.clear();p._last_started=0
 def test_duplicate_baskets_reuse_one_provider_fetch(self):
  with patch.object(p.yf,'Ticker',return_value=SimpleNamespace(info={'quoteType':'EQUITY','trailingPE':20})) as ticker:
   self.assertEqual(p.peer_info('TEST'),p.peer_info('TEST'));self.assertEqual(ticker.call_count,1)
 def test_failure_backoff_does_not_hammer_provider(self):
  with patch.object(p.yf,'Ticker',side_effect=RuntimeError('rate limited')) as ticker:
   for _ in range(2):
    with self.assertRaises(RuntimeError):p.peer_info('TEST')
   self.assertEqual(ticker.call_count,1)
if __name__=='__main__':unittest.main()
