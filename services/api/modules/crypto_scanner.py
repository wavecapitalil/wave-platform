"""Crypto network scanner routes."""

import requests
from flask import Blueprint, jsonify

bp = Blueprint("crypto_scanner", __name__)

# ── Crypto Scanner — CoinGecko + DeFiLlama + GitHub ──────────────────────────
SCANNER_CHAINS = [
    {'name':'Ethereum',  'symbol':'ETH',  'cg':'ethereum',       'llama':'Ethereum',  'gh':'ethereum/go-ethereum'},
    {'name':'Solana',    'symbol':'SOL',  'cg':'solana',          'llama':'Solana',    'gh':'solana-labs/solana'},
    {'name':'BNB Chain', 'symbol':'BNB',  'cg':'binancecoin',     'llama':'BSC',       'gh':'bnb-chain/bsc'},
    {'name':'Avalanche', 'symbol':'AVAX', 'cg':'avalanche-2',     'llama':'Avalanche', 'gh':'ava-labs/avalanchego'},
    {'name':'Sui',       'symbol':'SUI',  'cg':'sui',             'llama':'Sui',       'gh':'MystenLabs/sui'},
    {'name':'Sei',       'symbol':'SEI',  'cg':'sei-network',     'llama':'Sei',       'gh':'sei-protocol/sei-chain'},
    {'name':'Arbitrum',  'symbol':'ARB',  'cg':'arbitrum',        'llama':'Arbitrum',  'gh':'OffchainLabs/nitro'},
    {'name':'Base',      'symbol':'BASE', 'cg':None,              'llama':'Base',      'gh':'base-org/node'},
]

@bp.route('/api/crypto-scanner')
def crypto_scanner():
    result = {c['name']: {'name': c['name'], 'symbol': c['symbol']} for c in SCANNER_CHAINS}

    # 1. CoinGecko — price, market cap, volume, 24h%, 7d%, FDV
    try:
        cg_ids = ','.join(c['cg'] for c in SCANNER_CHAINS if c['cg'])
        r = requests.get(
            'https://api.coingecko.com/api/v3/coins/markets'
            '?vs_currency=usd&ids=' + cg_ids +
            '&order=market_cap_desc&per_page=20&sparkline=false'
            '&price_change_percentage=7d',
            timeout=12
        )
        for coin in r.json():
            for c in SCANNER_CHAINS:
                if c['cg'] == coin['id']:
                    result[c['name']].update({
                        'price':      coin.get('current_price'),
                        'market_cap': coin.get('market_cap'),
                        'fdv':        coin.get('fully_diluted_valuation'),
                        'volume_24h': coin.get('total_volume'),
                        'pct_24h':    coin.get('price_change_percentage_24h'),
                        'pct_7d':     coin.get('price_change_percentage_7d_in_currency'),
                    })
    except Exception:
        pass

    # 2. DeFiLlama — TVL per chain
    try:
        r = requests.get('https://api.llama.fi/v2/chains', timeout=10)
        llama_map = {item['name']: item.get('tvl') for item in r.json()}
        for c in SCANNER_CHAINS:
            tvl = llama_map.get(c['llama'])
            if tvl:
                result[c['name']]['tvl'] = tvl
    except Exception:
        pass

    # 3. DeFiLlama — stablecoin supply per chain
    try:
        r = requests.get('https://stablecoins.llama.fi/stablecoins?includePrices=true', timeout=12)
        chain_stable = {}
        for s in r.json().get('peggedAssets', []):
            for chain, data in s.get('chainCirculating', {}).items():
                amt = (data.get('current') or {}).get('peggedUSD') or 0
                key = chain.lower()
                chain_stable[key] = chain_stable.get(key, 0) + amt
        llama_key = {
            'Ethereum':'ethereum','Solana':'solana','BNB Chain':'bsc',
            'Avalanche':'avax','Sui':'sui','Sei':'sei',
            'Arbitrum':'arbitrum','Base':'base'
        }
        for name, key in llama_key.items():
            if key in chain_stable:
                result[name]['stablecoin_supply'] = chain_stable[key]
    except Exception:
        pass

    # 4. GitHub — dev commits last 30 days (last 4 weeks of commit_activity)
    for c in SCANNER_CHAINS:
        try:
            r = requests.get(
                'https://api.github.com/repos/' + c['gh'] + '/stats/commit_activity',
                headers={'Accept': 'application/vnd.github.v3+json'},
                timeout=8
            )
            if r.status_code == 200:
                weeks = r.json()
                result[c['name']]['dev_commits_30d'] = sum(w.get('total', 0) for w in weeks[-4:])
        except Exception:
            pass

    # 5. Derived metrics
    for d in result.values():
        mcap = d.get('market_cap')
        tvl  = d.get('tvl')
        vol  = d.get('volume_24h')
        if mcap and tvl and tvl > 0:
            d['mcap_tvl'] = round(mcap / tvl, 2)
        if mcap and vol and mcap > 0:
            d['vol_mcap_pct'] = round(vol / mcap * 100, 2)

    return jsonify({'chains': list(result.values())})


