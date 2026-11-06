import sys,unittest
from pathlib import Path
from datetime import datetime,timezone
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'services/api'))
from services.sector_universe import parse_holdings
class OfficialHoldingsTest(unittest.TestCase):
 def test_verified_xlk_file(self):
  path=Path(__file__).resolve().parents[1]/'scripts/fixtures/sector-holdings-xlk-20261104.xlsx'
  d=parse_holdings(path.read_bytes(),'XLK',datetime(2026,11,5,tzinfo=timezone.utc))
  self.assertEqual(len(d['members']),76)
  self.assertIn('MSFT',d['members']);self.assertNotIn('IXTZ6',d['members']);self.assertNotIn('-',d['members'])
  with self.assertRaises(ValueError):parse_holdings(path.read_bytes(),'XLF',datetime(2026,11,5,tzinfo=timezone.utc))
  with self.assertRaises(ValueError):parse_holdings(path.read_bytes(),'XLK',datetime(2026,11,20,tzinfo=timezone.utc))
 def test_trust_named_equities_remain_in_official_universe(self):
  for fund,expected in [('XLRE',{'DLR','ESS','CPT','FRT'}),('XLF',{'NTRS'})]:
   path=Path(__file__).resolve().parents[1]/('scripts/fixtures/sector-holdings-'+fund.lower()+'-20261104.xlsx')
   d=parse_holdings(path.read_bytes(),fund,datetime(2026,11,5,tzinfo=timezone.utc))
   self.assertTrue(expected.issubset(set(d['members'])),(fund,d['members']))
 def test_all_supported_sectors_have_scheduled_peer_observations(self):
  from data_engine.flask_snapshots import route_specs
  from modules.equities_core import SECTOR_DETAIL
  specs=[s for s in route_specs() if s.path=='/api/peers']
  scheduled={s.query_dict['symbol'] for s in specs}
  self.assertLessEqual(len(scheduled),50)
  self.assertTrue(all(s.ttl_minutes==1440 for s in specs))
  for sector in SECTOR_DETAIL.values():
   for members in sector['subsectors'].values():
    if members:self.assertTrue(scheduled.intersection(members))
 def test_unreviewed_fund_identity_cannot_be_labeled_equity(self):
  from io import BytesIO
  import zipfile
  raw=(Path(__file__).resolve().parents[1]/'scripts/fixtures/sector-holdings-xlk-20261104.xlsx').read_bytes()
  src=zipfile.ZipFile(BytesIO(raw));out=BytesIO()
  with zipfile.ZipFile(out,'w') as z:
   for n in src.namelist():
    b=src.read(n)
    if n=='xl/sharedStrings.xml':b=b.replace(b'APPLE INC',b'UNREVIEWED INVESTMENT VEHICLE').replace(b'AAPL',b'FAKE')
    z.writestr(n,b)
  with self.assertRaisesRegex(ValueError,'Unreviewed holding identity'):parse_holdings(out.getvalue(),'XLK',datetime(2026,11,5,tzinfo=timezone.utc))
if __name__=='__main__':unittest.main()
