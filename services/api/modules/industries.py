"""Industry-specific research routes."""

from concurrent.futures import ThreadPoolExecutor, as_completed

from flask import Blueprint, jsonify
from services.yahoo import ticker_info

bp = Blueprint("industries", __name__)

# ── Health check ──────────────────────────────────────────────────────────────
# ── EV Industry ───────────────────────────────────────────────────────────────
@bp.route('/api/ev-market')
def ev_market():
    # Global adoption: IEA / BloombergNEF annual data (BEV+PHEV, millions)
    ADOPTION = [
        {'year': 2018, 'ev': 2.1,  'total': 86.0},
        {'year': 2019, 'ev': 2.2,  'total': 90.3},
        {'year': 2020, 'ev': 3.1,  'total': 77.9},
        {'year': 2021, 'ev': 6.6,  'total': 82.7},
        {'year': 2022, 'ev': 10.5, 'total': 85.3},
        {'year': 2023, 'ev': 14.1, 'total': 92.7},
        {'year': 2024, 'ev': 17.1, 'total': 94.3},
    ]
    for row in ADOPTION:
        row['ice'] = round(row['total'] - row['ev'], 1)
        row['ev_pct'] = round(row['ev'] / row['total'] * 100, 1)

    # 2024 delivery rankings (thousands of units)
    DELIVERIES_BEV = [
        {'company': 'Tesla',        'k': 1789, 'ticker': 'TSLA', 'flag': '🇺🇸'},
        {'company': 'BYD',          'k': 1765, 'ticker': 'BYDDY','flag': '🇨🇳'},
        {'company': 'VW Group',     'k': 715,  'ticker': 'VWAGY','flag': '🇩🇪'},
        {'company': 'Hyundai/Kia',  'k': 493,  'ticker': None,   'flag': '🇰🇷'},
        {'company': 'BMW Group',    'k': 374,  'ticker': None,   'flag': '🇩🇪'},
        {'company': 'SAIC (MG)',    'k': 337,  'ticker': None,   'flag': '🇨🇳'},
        {'company': 'Mercedes',     'k': 241,  'ticker': None,   'flag': '🇩🇪'},
        {'company': 'Stellantis',   'k': 227,  'ticker': 'STLA', 'flag': '🇪🇺'},
        {'company': 'Geely/Volvo',  'k': 200,  'ticker': None,   'flag': '🇨🇳'},
        {'company': 'GM',           'k': 190,  'ticker': 'GM',   'flag': '🇺🇸'},
    ]
    DELIVERIES_TOTAL = [  # BEV + PHEV
        {'company': 'BYD',          'k': 4272, 'ticker': 'BYDDY','flag': '🇨🇳'},
        {'company': 'Tesla',        'k': 1789, 'ticker': 'TSLA', 'flag': '🇺🇸'},
        {'company': 'VW Group',     'k': 1104, 'ticker': 'VWAGY','flag': '🇩🇪'},
        {'company': 'BMW Group',    'k': 572,  'ticker': None,   'flag': '🇩🇪'},
        {'company': 'Hyundai/Kia',  'k': 568,  'ticker': None,   'flag': '🇰🇷'},
        {'company': 'Mercedes',     'k': 370,  'ticker': None,   'flag': '🇩🇪'},
        {'company': 'SAIC (MG)',    'k': 337,  'ticker': None,   'flag': '🇨🇳'},
        {'company': 'Stellantis',   'k': 260,  'ticker': 'STLA', 'flag': '🇪🇺'},
        {'company': 'Geely/Volvo',  'k': 250,  'ticker': None,   'flag': '🇨🇳'},
        {'company': 'GM',           'k': 190,  'ticker': 'GM',   'flag': '🇺🇸'},
    ]

    # Live financials for public EV companies
    FX = {}
    try:
        FX['CNY'] = float(ticker_info('CNYUSD=X').get('regularMarketPrice', 0.138))
        FX['EUR'] = float(ticker_info('EURUSD=X').get('regularMarketPrice', 1.08))
    except Exception:
        FX = {'CNY': 0.138, 'EUR': 1.08}

    COMPANY_META = [
        {'ticker': 'TSLA',  'name': 'Tesla',       'flag': '🇺🇸', 'currency': 'USD'},
        {'ticker': 'BYDDY', 'name': 'BYD',         'flag': '🇨🇳', 'currency': 'CNY'},
        {'ticker': 'VWAGY', 'name': 'Volkswagen',  'flag': '🇩🇪', 'currency': 'EUR'},
        {'ticker': 'GM',    'name': 'General Motors','flag':'🇺🇸', 'currency': 'USD'},
        {'ticker': 'F',     'name': 'Ford',         'flag': '🇺🇸', 'currency': 'USD'},
        {'ticker': 'STLA',  'name': 'Stellantis',   'flag': '🇪🇺', 'currency': 'EUR'},
        {'ticker': 'NIO',   'name': 'NIO',          'flag': '🇨🇳', 'currency': 'CNY'},
        {'ticker': 'LI',    'name': 'Li Auto',      'flag': '🇨🇳', 'currency': 'CNY'},
        {'ticker': 'XPEV',  'name': 'XPeng',        'flag': '🇨🇳', 'currency': 'CNY'},
        {'ticker': 'RIVN',  'name': 'Rivian',       'flag': '🇺🇸', 'currency': 'USD'},
        {'ticker': 'LCID',  'name': 'Lucid',        'flag': '🇺🇸', 'currency': 'USD'},
    ]

    def fetch_company(meta):
        try:
            info = ticker_info(meta['ticker'])
            rev   = info.get('totalRevenue')
            mc    = info.get('marketCap')
            gm    = info.get('grossMargins')
            price = info.get('regularMarketPrice') or info.get('currentPrice')
            chg   = info.get('regularMarketChangePercent', 0)
            fx    = FX.get(meta['currency'], 1.0)
            return {
                'ticker':   meta['ticker'],
                'name':     meta['name'],
                'flag':     meta['flag'],
                'rev_usd':  round(rev * fx / 1e9, 1) if rev else None,
                'mc_usd':   round(mc  * fx / 1e9, 1) if mc  else None,
                'gm_pct':   round(gm * 100, 1)       if gm  else None,
                'price':    price,
                'chg_pct':  round(chg, 2),
            }
        except Exception:
            return None

    companies = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(fetch_company, m): m for m in COMPANY_META}
        for fut in as_completed(futs):
            res = fut.result()
            if res:
                companies.append(res)
    companies.sort(key=lambda c: c['mc_usd'] or 0, reverse=True)

    return jsonify({
        'adoption':        ADOPTION,
        'deliveries_bev':  DELIVERIES_BEV,
        'deliveries_total':DELIVERIES_TOTAL,
        'companies':       companies,
    })


