"""Official Select Sector SPDR equity cohorts; no fund-level ratios reused."""
from datetime import datetime, timezone
from io import BytesIO
import re
import zipfile
import xml.etree.ElementTree as ET
import requests

FUNDS = {'XLK':'Technology','XLC':'Communication Services','XLY':'Consumer Discretionary','XLP':'Consumer Staples','XLE':'Energy','XLF':'Financials','XLV':'Health Care','XLI':'Industrials','XLB':'Materials','XLRE':'Real Estate','XLU':'Utilities'}
def source_url(fund):
    if fund not in FUNDS: raise ValueError('Unsupported sector fund')
    return 'https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-'+fund.lower()+'.xlsx'

def parse_holdings(content, fund, now=None):
    now=now or datetime.now(timezone.utc)
    ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(BytesIO(content)) as z:
        if sum(f.file_size for f in z.infolist())>10000000: raise ValueError('Oversized holdings workbook')
        strings=[''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',ns)]
        rows=[]
        for row in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//s:row',ns):
            values={}
            for cell in row:
                v=cell.find('s:v',ns)
                if v is not None: values[re.sub('[0-9]','',cell.get('r'))]=strings[int(v.text)] if cell.get('t')=='s' else v.text
            rows.append(values)
    if not any(r.get('A')=='Ticker Symbol:' and r.get('B')==fund for r in rows): raise ValueError('Fund identity mismatch')
    raw=next(r['B'] for r in rows if r.get('A')=='Holdings:')
    asof=datetime.strptime(raw.removeprefix('As of '),'%d-%b-%Y').replace(tzinfo=timezone.utc)
    if not 0 <= (now-asof).total_seconds() <= 7*86400: raise ValueError('Holdings date stale or future')
    header=next(i for i,r in enumerate(rows) if r.get('A')=='Name' and r.get('B')=='Ticker')
    members=[]
    for row in rows[header+1:]:
        ticker=row.get('B','')
        if re.fullmatch(r'[A-Z]{1,5}(?:[.\-][A-Z])?',ticker) and row.get('H')=='USD' and row.get('C') and float(row.get('G') or 0)>0 and not re.search(r'\b(CASH|FUTURE|TRUST|MONEY MARKET)\b',row.get('A','')):
            members.append(ticker.replace('.','-'))
    if len(set(members))!=len(members) or not 15<=len(members)<=150: raise ValueError('Invalid or incomplete equity membership')
    return {'fund':fund,'sector':FUNDS[fund],'as_of':asof.date().isoformat(),'members':members,'source_url':source_url(fund),'fetched_at':now.isoformat(),'basis':'Official fund USD equity holdings; cash, derivatives and cash-management holdings excluded'}

def collect_universe(fund):
    response=requests.get(source_url(fund),timeout=25)
    response.raise_for_status()
    return parse_holdings(response.content,fund)
