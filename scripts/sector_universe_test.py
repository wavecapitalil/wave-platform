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
if __name__=='__main__':unittest.main()
