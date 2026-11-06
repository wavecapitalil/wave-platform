import sys,unittest,threading,time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'services/api'))
from services import peer_quotes as p
class PeerQuotesTest(unittest.TestCase):
 def setUp(self):p._cache.clear();p._pending.clear();p._last_started=0
 def test_duplicate_baskets_preserve_original_acquisition(self):
  with patch.object(p.yf,'Ticker',return_value=SimpleNamespace(info={'quoteType':'EQUITY','trailingPE':20})) as ticker:
   first=p.peer_info('TEST');second=p.peer_info('TEST')
   self.assertIs(first,second);self.assertEqual(first['acquired_at'],second['acquired_at']);self.assertTrue(first['acquired_at'].endswith('+00:00'));self.assertEqual(ticker.call_count,1)
 def test_expired_cache_acquires_new_observation(self):
  with patch.object(p.yf,'Ticker',return_value=SimpleNamespace(info={'quoteType':'EQUITY'})) as ticker:
   first=p.peer_info('TEST');p._cache['TEST']=(0,first,False)
   second=p.peer_info('TEST');self.assertNotEqual(first['acquired_at'],second['acquired_at']);self.assertEqual(ticker.call_count,2)
 def test_failure_backoff_does_not_hammer_provider(self):
  with patch.object(p.yf,'Ticker',side_effect=RuntimeError('rate limited')) as ticker:
   for _ in range(2):
    with self.assertRaises(RuntimeError):p.peer_info('TEST')
   self.assertEqual(ticker.call_count,1);self.assertFalse(p._pending)
 def concurrent_case(self,fail):
  entered=threading.Event();release=threading.Event();waiting=threading.Event();count=0;lock=threading.Lock()
  def provider(symbol):
   entered.set();self.assertTrue(release.wait(5))
   if fail:raise RuntimeError('rate limited')
   return SimpleNamespace(info={'quoteType':'EQUITY','trailingPE':20})
  with patch.object(p.yf,'Ticker',side_effect=provider) as ticker,ThreadPoolExecutor(max_workers=8) as pool:
   leader=pool.submit(p.peer_info,'TEST');self.assertTrue(entered.wait(3))
   event=p._pending['TEST'];original=event.wait
   def wait(timeout):
    nonlocal count
    with lock:
     count+=1
     if count==7:waiting.set()
    return original(timeout)
   event.wait=wait
   followers=[pool.submit(p.peer_info,'TEST') for _ in range(7)]
   self.assertTrue(waiting.wait(3));release.set()
   for f in [leader]+followers:
    if fail:
     with self.assertRaises(RuntimeError):f.result(3)
    else:self.assertIs(f.result(3),leader.result())
   self.assertEqual(ticker.call_count,1);self.assertFalse(p._pending)
   if fail:
    with self.assertRaises(RuntimeError):p.peer_info('TEST')
    self.assertEqual(ticker.call_count,1)
 def test_concurrent_success_single_flight(self):self.concurrent_case(False)
 def test_concurrent_failure_single_flight_and_backoff(self):self.concurrent_case(True)
 def test_follower_timeout_does_not_start_duplicate_or_remove_leader(self):
  event=threading.Event();p._pending['TEST']=event
  with patch.object(p,'_WAIT_SECONDS',0.01),patch.object(p.yf,'Ticker') as ticker:
   with self.assertRaises(TimeoutError):p.peer_info('TEST')
   ticker.assert_not_called();self.assertIs(p._pending['TEST'],event)
  p._pending.clear()
 def test_peer_payload_preserves_acquisition_across_rewrapping(self):
  from flask import Flask
  from modules.equities_research import bp
  from modules import equities_core
  app=Flask(__name__);app.register_blueprint(bp)
  universe={'TEST':{'name':'Test','subsectors':{'Test':['A','B']}}}
  with patch.object(equities_core,'SECTOR_DETAIL',universe),patch.object(p.yf,'Ticker',return_value=SimpleNamespace(info={'quoteType':'EQUITY','trailingPE':20})) as ticker:
   first=app.test_client().get('/api/peers?symbol=A').get_json()['peers']
   second=app.test_client().get('/api/peers?symbol=B').get_json()['peers']
   self.assertEqual([x['acquired_at'] for x in first],[x['acquired_at'] for x in second]);self.assertEqual(ticker.call_count,2)
   self.assertTrue(all(x['pe_trailing']==20 for x in second))
 def test_global_two_call_cap_and_spacing(self):
  active=0;peak=0;starts=[];lock=threading.Lock()
  def provider(symbol):
   nonlocal active,peak
   with lock:active+=1;peak=max(peak,active);starts.append(time.monotonic())
   time.sleep(0.65)
   with lock:active-=1
   return SimpleNamespace(info={'quoteType':'EQUITY'})
  with patch.object(p.yf,'Ticker',side_effect=provider),ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(p.peer_info,['A','B','C','D']))
  self.assertEqual(peak,2);self.assertTrue(all(b-a>=0.48 for a,b in zip(starts,starts[1:])));self.assertFalse(p._pending)
if __name__=='__main__':unittest.main()
