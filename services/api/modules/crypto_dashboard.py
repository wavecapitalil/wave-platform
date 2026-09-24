"""Crypto dashboard, cohort, token-detail and on-chain routes."""

from concurrent.futures import ThreadPoolExecutor
import requests
import xml.etree.ElementTree as ET

from flask import Blueprint, jsonify, request

bp = Blueprint("crypto_dashboard", __name__)

# ── Crypto Dashboard ──────────────────────────────────────────────────────────

# Cohort definitions: 1 representative per cohort for price history,
# multiple coins for average-change calculation
COHORT_COINS = {
    'BTC':           ['bitcoin'],
    'ETH Network':   ['ethereum', 'lido-dao', 'rocket-pool'],
    'SOL Network':   ['solana', 'jito-governance-token', 'marinade'],
    'Large Caps':    ['ethereum', 'binancecoin', 'ripple', 'cardano', 'solana', 'avalanche-2'],
    'L1s':           ['solana', 'avalanche-2', 'cardano', 'near', 'aptos', 'sui', 'sei-network'],
    'L2s':           ['matic-network', 'arbitrum', 'optimism', 'starknet'],
    'DEX Tokens':    ['uniswap', 'pancakeswap-token', 'curve-dao-token', 'aerodrome-finance', 'jupiter-exchange-solana'],
    'DeFi':          ['aave', 'maker', 'compound-governance-token', 'sky-governance-token'],
    'AI Tokens':     ['bittensor', 'render-token', 'fetch-ai', 'akash-network', 'ocean-protocol'],
    'Privacy':       ['monero', 'zcash', 'dash', 'secret'],
    'Infra/Oracle':  ['chainlink', 'the-graph', 'filecoin', 'api3'],
    'RWA':           ['ondo-finance', 'centrifuge', 'maple'],
    'Memes':         ['dogecoin', 'shiba-inu', 'pepe', 'bonk'],
}

COHORT_REP = {
    'BTC': 'bitcoin', 'ETH Network': 'ethereum', 'SOL Network': 'solana',
    'Large Caps': 'binancecoin', 'L1s': 'avalanche-2', 'L2s': 'arbitrum',
    'DEX Tokens': 'uniswap', 'DeFi': 'aave', 'AI Tokens': 'bittensor',
    'Privacy': 'monero', 'Infra/Oracle': 'chainlink', 'RWA': 'ondo-finance',
    'Memes': 'dogecoin',
}

_cg_global_cache = {'data': None, 'ts': 0}
_cohort_perf_cache = {}
_cohort_prices_cache = {}
_onchain_cache2 = {}

@bp.route('/api/crypto-global')
def crypto_global():
    import time as _t
    global _cg_global_cache
    if _cg_global_cache['data'] and (_t.time() - _cg_global_cache['ts']) < 120:
        return jsonify(_cg_global_cache['data'])
    try:
        import requests as _req
        headers = {'User-Agent': 'Mozilla/5.0'}
        r1 = _req.get('https://api.coingecko.com/api/v3/global', headers=headers, timeout=12)
        d  = r1.json().get('data', {})
        total_mc  = d.get('total_market_cap', {}).get('usd', 0)
        chg_24h   = round(float(d.get('market_cap_change_percentage_24h_usd', 0)), 2)
        btc_dom   = round(float(d.get('market_cap_percentage', {}).get('btc', 0)), 1)
        eth_dom   = round(float(d.get('market_cap_percentage', {}).get('eth', 0)), 1)
        total_vol = d.get('total_volume', {}).get('usd', 0)
        # 7d change: use BTC+ETH average as proxy
        r2 = _req.get(
            'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd'
            '&ids=bitcoin,ethereum&price_change_percentage=7d',
            headers=headers, timeout=12)
        coins = r2.json() or []
        chg_7d = round(sum((c.get('price_change_percentage_7d_in_currency') or 0) for c in coins) / max(len(coins), 1), 2)
        result = {
            'total_market_cap': round(total_mc),
            'mc_change_24h': chg_24h,
            'mc_change_7d': chg_7d,
            'btc_dominance': btc_dom,
            'eth_dominance': eth_dom,
            'total_volume_24h': round(total_vol),
        }
        _cg_global_cache = {'data': result, 'ts': _t.time()}
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)})


@bp.route('/api/cohort-performance')
def cohort_performance():
    import time as _t
    global _cohort_perf_cache
    period = request.args.get('period', '24h')   # 24h | 7d | 30d | 1y
    cache_key = period
    if _cohort_perf_cache.get(cache_key) and (_t.time() - _cohort_perf_cache.get(cache_key + '_ts', 0)) < 600:
        return jsonify(_cohort_perf_cache[cache_key])
    try:
        import requests as _req
        field_map = {
            '24h': 'price_change_percentage_24h_in_currency',
            '7d':  'price_change_percentage_7d_in_currency',
            '30d': 'price_change_percentage_30d_in_currency',
            '1y':  'price_change_percentage_1y_in_currency',
        }
        pct_field = field_map.get(period, field_map['24h'])
        all_ids = list(set(cid for coins in COHORT_COINS.values() for cid in coins))
        url = ('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd'
               '&ids=' + ','.join(all_ids) +
               '&price_change_percentage=24h,7d,30d,1y&per_page=250&order=market_cap_desc')
        r = _req.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=20)
        raw = {c['id']: c for c in (r.json() or [])}
        result = []
        for cohort, ids in COHORT_COINS.items():
            vals = [raw[i][pct_field] for i in ids if i in raw and raw[i].get(pct_field) is not None]
            if not vals:
                continue
            avg = round(sum(vals) / len(vals), 2)
            coins_detail = []
            for cid in ids:
                c = raw.get(cid)
                if not c:
                    continue
                coins_detail.append({
                    'id': cid,
                    'name': c.get('symbol', cid).upper(),
                    'change': round(c.get(pct_field) or 0, 2),
                    'price': c.get('current_price', 0),
                    'mcap_b': round((c.get('market_cap') or 0) / 1e9, 1),
                })
            result.append({'cohort': cohort, 'change': avg, 'n': len(vals), 'coins': coins_detail})
        result.sort(key=lambda x: x['change'], reverse=True)
        _cohort_perf_cache[cache_key] = result
        _cohort_perf_cache[cache_key + '_ts'] = _t.time()
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)})


@bp.route('/api/cohort-prices')
def cohort_prices():
    import time as _t
    global _cohort_prices_cache
    days = request.args.get('days', '30')
    cache_key = days
    if _cohort_prices_cache.get(cache_key) and (_t.time() - _cohort_prices_cache.get(cache_key + '_ts', 0)) < 1800:
        return jsonify(_cohort_prices_cache[cache_key])
    try:
        import requests as _req, time as _time
        headers = {'User-Agent': 'Mozilla/5.0'}
        result = {}
        for cohort, rep_id in COHORT_REP.items():
            try:
                url = (f'https://api.coingecko.com/api/v3/coins/{rep_id}/market_chart'
                       f'?vs_currency=usd&days={days}&interval=daily')
                r = _req.get(url, headers=headers, timeout=12)
                if r.status_code == 429:
                    _time.sleep(2)
                    r = _req.get(url, headers=headers, timeout=12)
                prices_raw = r.json().get('prices', [])
                if len(prices_raw) < 2:
                    continue
                base = prices_raw[0][1]
                if base == 0:
                    continue
                result[cohort] = {
                    'timestamps': [p[0] for p in prices_raw],
                    'indexed':    [round(p[1] / base * 100, 2) for p in prices_raw],
                }
                _time.sleep(0.35)
            except Exception:
                continue
        _cohort_prices_cache[cache_key] = result
        _cohort_prices_cache[cache_key + '_ts'] = _t.time()
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)})


_onchain_hist_cache = {}

ONCHAIN_DEFAULTS = {
    'tvl':        [('lido','Lido'),('aave-v3','Aave V3'),('makerdao','MakerDAO'),
                   ('compound-v3','Compound'),('uniswap','Uniswap'),('eigenlayer','EigenLayer')],
    'dex_volume': [('uniswap-v4','Uni V4'),('uniswap-v3','Uni V3'),('pancakeswap-v3','Cake V3'),
                   ('aerodrome-slipstream','Aerodrome'),('curve','Curve'),('raydium','Raydium')],
    'fees':       [('uniswap-v3','Uni V3'),('uniswap-v4','Uni V4'),('lido','Lido'),
                   ('aave-v3','Aave V3'),('pancakeswap-v3','Cake V3'),('hyperliquid-perp','Hyperliquid')],
    'revenue':    [('makerdao','MakerDAO'),('lido','Lido'),('aave-v3','Aave V3'),
                   ('compound-v3','Compound'),('uniswap-v3','Uni V3'),('curve','Curve')],
}

@bp.route('/api/onchain-history')
def onchain_history():
    import time as _t
    global _onchain_hist_cache
    kpi   = request.args.get('kpi', 'tvl')
    days  = int(request.args.get('days', '30'))
    slugs = request.args.get('protocols', '')   # comma-sep slug:name pairs, optional

    cache_key = f'{kpi}_{days}_{slugs}'
    if (_onchain_hist_cache.get(cache_key) and
            _t.time() - _onchain_hist_cache.get(cache_key+'_ts', 0) < 1800):
        return jsonify(_onchain_hist_cache[cache_key])

    import requests as _req, time as _time
    headers = {'User-Agent': 'Mozilla/5.0'}
    cutoff  = int(_t.time()) - days * 86400

    if slugs:
        pairs = []
        for part in slugs.split(','):
            if ':' in part:
                s, n = part.split(':', 1)
                pairs.append((s.strip(), n.strip()))
            else:
                pairs.append((part.strip(), part.strip().title()))
    else:
        pairs = ONCHAIN_DEFAULTS.get(kpi, ONCHAIN_DEFAULTS['tvl'])

    def _fetch(slug_name):
        slug, name = slug_name
        try:
            if kpi == 'tvl':
                r = _req.get(f'https://api.llama.fi/protocol/{slug}',
                             headers=headers, timeout=12)
                if r.status_code != 200:
                    return name, None
                pts = [(p['date'], p['totalLiquidityUSD'])
                       for p in r.json().get('tvl', [])
                       if p.get('date', 0) >= cutoff]
            else:
                endpoint  = 'dexs' if kpi == 'dex_volume' else 'fees'
                data_type = {'dex_volume':'dailyVolume','fees':'dailyFees','revenue':'dailyRevenue'}.get(kpi,'dailyFees')
                r = _req.get(f'https://api.llama.fi/summary/{endpoint}/{slug}',
                             headers=headers, timeout=12)
                if r.status_code != 200:
                    return name, None
                key = 'totalDataChart'
                pts = [(p[0], p[1])
                       for p in r.json().get(key, [])
                       if p[0] >= cutoff]
            if len(pts) < 3:
                return name, None
            return name, {
                'timestamps': [p[0] * 1000 for p in pts],   # ms for JS
                'values':     [round(p[1]) for p in pts],
            }
        except Exception:
            return name, None

    result = {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = [ex.submit(_fetch, p) for p in pairs]
        for f in futs:
            name, data = f.result(timeout=25)
            if data:
                result[name] = data

    # Also return available protocol list for the picker
    result['__protocols__'] = [{'slug': s, 'name': n} for s, n in pairs]

    _onchain_hist_cache[cache_key]         = result
    _onchain_hist_cache[cache_key + '_ts'] = _t.time()
    return jsonify(result)


@bp.route('/api/onchain-kpi')
def onchain_kpi():
    import time as _t
    global _onchain_cache2
    kpi = request.args.get('kpi', 'tvl')   # tvl | dex_volume | fees | revenue
    if _onchain_cache2.get(kpi) and (_t.time() - _onchain_cache2.get(kpi + '_ts', 0)) < 600:
        return jsonify(_onchain_cache2[kpi])
    try:
        import requests as _req
        result = []
        if kpi == 'tvl':
            r = _req.get('https://api.llama.fi/protocols', timeout=15)
            protos = r.json()
            top = sorted(
                [p for p in protos if p.get('tvl') and p.get('category') not in ('Chain',)],
                key=lambda x: x.get('tvl', 0), reverse=True)[:20]
            result = [{'name': p['name'], 'value': round(p.get('tvl', 0)),
                       'change_1d': round(p.get('change_1d') or 0, 2),
                       'change_7d': round(p.get('change_7d') or 0, 2),
                       'category': p.get('category', ''), 'chain': p.get('chain', '')} for p in top]
        elif kpi in ('fees', 'revenue'):
            r = _req.get('https://api.llama.fi/overview/fees'
                         '?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true', timeout=15)
            protos = r.json().get('protocols', [])
            vk = 'total24h'
            rk = 'revenue24h' if kpi == 'revenue' else None
            key = rk if kpi == 'revenue' else vk
            top = sorted([p for p in protos if p.get(key)],
                         key=lambda x: x.get(key, 0) or 0, reverse=True)[:20]
            result = [{'name': p.get('displayName') or p.get('name', ''),
                       'value': round(p.get(key) or 0),
                       'value_7d': round(p.get('total7d') or 0),
                       'value_30d': round(p.get('total30d') or 0),
                       'category': p.get('category', '')} for p in top]
        elif kpi == 'dex_volume':
            r = _req.get('https://api.llama.fi/overview/dexs'
                         '?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true', timeout=15)
            protos = r.json().get('protocols', [])
            top = sorted([p for p in protos if p.get('total24h')],
                         key=lambda x: x.get('total24h', 0) or 0, reverse=True)[:20]
            result = [{'name': p.get('displayName') or p.get('name', ''),
                       'value': round(p.get('total24h') or 0),
                       'value_7d': round(p.get('total7d') or 0),
                       'value_30d': round(p.get('total30d') or 0),
                       'category': p.get('category', 'DEX')} for p in top]
        _onchain_cache2[kpi] = result
        _onchain_cache2[kpi + '_ts'] = _t.time()
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)})


_token_detail_cache = {}

@bp.route('/api/token-detail')
def token_detail():
    import time as _t
    coin_id = request.args.get('id', '').strip().lower()
    if not coin_id:
        return jsonify({'error': 'missing id'})
    now = _t.time()
    if coin_id in _token_detail_cache:
        entry = _token_detail_cache[coin_id]
        if now - entry['ts'] < 300:
            return jsonify(entry['data'])
    headers = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json'}
    try:
        r = requests.get(
            f'https://api.coingecko.com/api/v3/coins/{coin_id}'
            '?localization=false&tickers=false&market_data=true'
            '&community_data=true&developer_data=true&sparkline=false',
            headers=headers, timeout=12)
        d = r.json()
        # 30-day price history
        hist_r = requests.get(
            f'https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart'
            '?vs_currency=usd&days=30&interval=daily',
            headers=headers, timeout=12)
        hist = hist_r.json()
        md = d.get('market_data', {})
        links = d.get('links', {})
        result = {
            'id': coin_id,
            'name': d.get('name'),
            'symbol': (d.get('symbol') or '').upper(),
            'image': d.get('image', {}).get('large'),
            'description': (d.get('description', {}).get('en') or '')[:3000],
            'categories': d.get('categories', [])[:6],
            'genesis_date': d.get('genesis_date'),
            'whitepaper': links.get('whitepaper') or '',
            'homepage': ((links.get('homepage') or [''])[0]) or '',
            'twitter': links.get('twitter_screen_name') or '',
            'reddit': links.get('subreddit_url') or '',
            'github': ((links.get('repos_url', {}).get('github') or [''])[0]) or '',
            'coingecko_score': d.get('coingecko_score'),
            'developer_score': d.get('developer_score'),
            'community_score': d.get('community_score'),
            'sentiment_up': d.get('sentiment_votes_up_percentage'),
            'watchlist_users': d.get('watchlist_portfolio_users'),
            'market_cap_rank': d.get('market_cap_rank'),
            'price': md.get('current_price', {}).get('usd'),
            'price_change_24h': md.get('price_change_percentage_24h'),
            'price_change_7d': md.get('price_change_percentage_7d'),
            'price_change_30d': md.get('price_change_percentage_30d'),
            'market_cap': md.get('market_cap', {}).get('usd'),
            'fdv': md.get('fully_diluted_valuation', {}).get('usd'),
            'volume_24h': md.get('total_volume', {}).get('usd'),
            'circulating_supply': md.get('circulating_supply'),
            'total_supply': md.get('total_supply'),
            'max_supply': md.get('max_supply'),
            'ath': md.get('ath', {}).get('usd'),
            'ath_change_pct': md.get('ath_change_percentage', {}).get('usd'),
            'ath_date': (md.get('ath_date', {}).get('usd') or '')[:10],
            'atl': md.get('atl', {}).get('usd'),
            'atl_change_pct': md.get('atl_change_percentage', {}).get('usd'),
            'prices_30d': hist.get('prices', []),
        }
        _token_detail_cache[coin_id] = {'ts': now, 'data': result}
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)})


_cohort_news_cache = {}
_COHORT_KEYWORDS = {
    'BTC': ['bitcoin','btc'],
    'ETH Network': ['ethereum','eth','lido','staking'],
    'SOL Network': ['solana','sol','jito'],
    'Large Caps': ['ethereum','bnb','xrp','cardano','ripple'],
    'L1s': ['solana','avalanche','cardano','near','aptos','sui','sei'],
    'L2s': ['polygon','arbitrum','optimism','starknet','base','layer 2'],
    'DEX Tokens': ['uniswap','pancakeswap','curve','aerodrome','dex','decentralized exchange'],
    'DeFi': ['aave','makerdao','compound','defi','lending','yield'],
    'AI Tokens': ['bittensor','render','fetch.ai','akash','ocean','ai tokens'],
    'Privacy': ['monero','zcash','dash','privacy coin'],
    'Infra/Oracle': ['chainlink','the graph','filecoin','oracle','infrastructure'],
    'RWA': ['ondo','centrifuge','maple','real world asset','rwa','tokenized'],
    'Memes': ['dogecoin','shiba','pepe','bonk','meme coin','memecoin'],
}

@bp.route('/api/cohort-news')
def cohort_news():
    import time as _t, xml.etree.ElementTree as ET, html as _html
    cohort = request.args.get('cohort', '')
    now = _t.time()
    cache_key = f'cnews_{cohort}'
    if cache_key in _cohort_news_cache:
        e = _cohort_news_cache[cache_key]
        if now - e['ts'] < 600:
            return jsonify(e['data'])
    keywords = [k.lower() for k in _COHORT_KEYWORDS.get(cohort, [cohort.lower()])]
    feeds = [
        'https://www.coindesk.com/arc/outboundfeeds/rss/',
        'https://cointelegraph.com/rss',
        'https://decrypt.co/feed',
    ]
    stories = []
    for feed_url in feeds:
        try:
            proxy_url = f'https://api.allorigins.win/get?url={requests.utils.quote(feed_url)}'
            fr = requests.get(proxy_url, headers={'User-Agent':'Mozilla/5.0'}, timeout=8)
            raw = fr.json().get('contents','')
            root = ET.fromstring(raw)
            ns = {'atom': 'http://www.w3.org/2005/Atom'}
            items = root.findall('.//item')
            for item in items[:30]:
                title = (item.findtext('title') or '').strip()
                link  = (item.findtext('link') or '').strip()
                desc  = _html.unescape((item.findtext('description') or '')[:300]).strip()
                pub   = (item.findtext('pubDate') or '')[:16]
                combined = (title + ' ' + desc).lower()
                if any(kw in combined for kw in keywords):
                    stories.append({'title': title, 'url': link, 'desc': desc, 'pub': pub,
                                    'source': feed_url.split('/')[2].replace('www.','')})
            if len(stories) >= 8:
                break
        except Exception:
            continue
    stories = stories[:8]
    result = stories
    _cohort_news_cache[cache_key] = {'ts': now, 'data': result}
    return jsonify(result)


