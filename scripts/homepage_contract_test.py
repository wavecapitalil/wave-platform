#!/usr/bin/env python3
"""Test the actual Flask homepage boundary without providers or background jobs."""
import sys
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services/api'))
from flask import Flask
from modules import frontend

class Links(HTMLParser):
    def __init__(self, html):
        super().__init__(); self.tags=[]; self.feed(html)
    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

class HomepageContract(unittest.TestCase):
    def setUp(self):
        app=Flask(__name__, static_folder=None); app.register_blueprint(frontend.bp)
        self.client=app.test_client()
    def test_root_and_platform_routes(self):
        for route, file in [('/', 'index.html'),('/index.html','index.html'),('/terminal','terminal_app.html'),('/terminal_app.html','terminal_app.html'),('/university','university.html'),('/products','products.html')]:
            with self.subTest(route=route), self.client.get(route) as r:
                self.assertEqual(r.status_code,200)
                self.assertEqual(r.data,(Path(frontend.PUBLIC_DIR)/file).read_bytes())
    def test_explicit_assets_and_video_seeking(self):
        for file in frontend.HOME_PUBLIC_FILES:
            with self.subTest(file=file), self.client.head('/'+file) as r:
                self.assertEqual(r.status_code,200)
        for file in sorted(f for f in frontend.HOME_PUBLIC_FILES if f.endswith('.mp4')):
            with self.client.get('/'+file,headers={'Range':'bytes=0-127'}) as r:
                self.assertEqual(r.status_code,206)
                self.assertEqual(r.mimetype,'video/mp4')
                self.assertEqual(len(r.data),128)
                self.assertTrue(r.headers['Content-Range'].startswith('bytes 0-127/'))
    def test_home_and_legal_dependencies_are_explicitly_served(self):
        for page in ['index.html','privacy.html','terms.html','accessibility.html']:
            html=(Path(frontend.PUBLIC_DIR)/page).read_text()
            for tag,a in Links(html).tags:
                refs=[a.get('src'),a.get('srcset')]
                if tag=='link': refs.append(a.get('href'))
                for ref in refs:
                    if ref and not ref.startswith(('https:','http:','data:')):
                        self.assertIn(ref.split('?')[0],frontend.PUBLIC_FILES, (page,ref))
    def test_fallback_links_work_without_javascript(self):
        tags=Links((Path(frontend.PUBLIC_DIR)/'index.html').read_text()).tags
        app=[a for tag,a in tags if tag=='a' and 'data-app' in a]
        self.assertTrue(app)
        for a in app:
            self.assertEqual(a['href'],'terminal_app.html'); self.assertNotIn('target',a)
        for target in ['terminal_app.html','university.html','products.html']:
            links=[a for tag,a in tags if tag=='a' and a.get('data-sys')==target]
            self.assertTrue(links)
            for a in links:
                self.assertEqual(a['href'],target); self.assertNotIn('hidden',a)
    def test_private_and_unlisted_existing_files_stay_unreachable(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name in ['private.json','assets/js/private.js','vendor/private.js','.env','calculation-admin.html']:
                p=Path(tmp)/name; p.parent.mkdir(parents=True,exist_ok=True); p.write_text('private-test-marker')
            with patch.object(frontend,'PUBLIC_DIR',tmp):
                for path in ['/private.json','/assets/js/private.js','/vendor/private.js','/.env','/calculation-admin.html','/../private.json','/assets/../private.json','/%2e%2e/private.json','/services/api/app_factory.py']:
                    with self.subTest(path=path), self.client.get(path) as r:
                        self.assertEqual(r.status_code,404); self.assertNotIn(b'private-test-marker',r.data)

if __name__=='__main__': unittest.main()
