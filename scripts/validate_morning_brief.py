"""Validate a publishable native edition and all of its immutable chart assets."""
import json
import hashlib
import math
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'apps/terminal/public'

def validate():
    manifest = json.loads((PUBLIC / 'briefs/latest.json').read_text())
    edition_date = manifest['date']
    assert str(date.fromisoformat(edition_date)) == edition_date
    assert manifest['schemaVersion'] == 1
    assert manifest['path'] == f'briefs/{edition_date}/edition.json'
    edition = json.loads((PUBLIC / manifest['path']).read_text())
    assert manifest['revision'] == hashlib.sha256((PUBLIC / manifest['path']).read_bytes()).hexdigest()
    assert edition['schemaVersion'] == 1 and edition['date'] == edition_date
    assert edition['language'] == 'he' and edition['title']
    assert edition['sections'] and edition['sources'] and edition['methodology']
    ids = set()
    charts = 0
    for section in edition['sections']:
        assert section['id'] not in ids
        ids.add(section['id'])
        assert section['title'] and section['kicker'] and section['paragraphs']
        for p in section['paragraphs']:
            assert p['kind'] in ('text', 'heading') and isinstance(p['text'], str) and p['text'].strip()
        for image in section.get('charts', []):
            if image.get('type') in ('line','stacked'):
                assert image['title'] and image['period'] and image['unit'] and image['series']
                n=len(image['x']);assert n>=2 and len(image['labels'])==n and len(image['tickLabels'])==n
                assert all(isinstance(v,(int,float)) and math.isfinite(v) for v in image['x'])
                assert all(image['x'][i]<image['x'][i+1] for i in range(n-1))
                for series in image['series']:
                    assert series['label'] and re.fullmatch(r'#[0-9a-fA-F]{6}',series['color'])
                    assert len(series['values'])==n
                    assert all(v is None or (isinstance(v,(int,float)) and math.isfinite(v)) for v in series['values'])
                charts+=1
                continue
            if image.get('type') == 'bars':
                assert image['title'] and image['period'] and image['unit'] and image['rows']
                for row in image['rows']:
                    assert row['label'] and row['display']
                    assert row['value'] is None or (isinstance(row['value'], (int, float)) and math.isfinite(row['value']))
                    if 'color' in row: assert re.fullmatch(r'#[0-9a-fA-F]{6}', row['color'])
                charts += 1
                continue
            assert re.fullmatch(rf'briefs/{edition_date}/[A-Za-z0-9_-]+\.(png|webp|jpg)', image['src'])
            assert (PUBLIC / image['src']).is_file()
            assert image['alt'] and image['width'] > 0 and image['height'] > 0
            charts += 1
        if 'table' in section:
            width = len(section['table']['headers'])
            assert width > 0 and all(len(row) == width for row in section['table']['rows'])
    for source in edition['sources']:
        url = urlsplit(source['url'])
        assert source['title'] and url.scheme == 'https' and url.hostname
        assert not url.username and not url.password and not re.search(r'\s', source['url'])
    # Public editions contain editorial content, not credentials or private Drive embeds.
    encoded = json.dumps(edition)
    assert not any(x in encoded for x in ['drive.google.com', 'sk-proj-', 'sb_secret_', '@gmail.com'])
    print(f'PASS: {edition_date}, {len(ids)} sections, {charts} charts, {len(edition["sources"])} sources')

if __name__ == '__main__':
    validate()
