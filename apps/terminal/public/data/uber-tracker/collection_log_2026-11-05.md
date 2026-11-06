# Uber city signal panel — collection log
Collected: 2026-11-05 (Asia/Jerusalem, UTC+2). Box local times match user zone.

## Collected
- UBER Q3 2026 print (reported 2026-11-04 BMO): SEC Exhibit 99.1
- NYC HVFHV daily averages Sep 2025–Aug 2026: TLC Help from TLC trip records
- NYC HV Aug 2026 YoY +6.3%, Uber UR Jul 52.1% vs 54.4% YA: AutoMarketplace citing TLC
- LAX TNC Jun 2026 & Sep 2026 official LAWA PDFs
- Driver guaranteed-earnings offers for 10 US cities (independent referral pages, verified 2026-11-05)

## Not collected this pass
- Live Uber/Lyft in-app fare/ETA/surge quotes (no browser/desktop; requires authenticated rider session or fare-estimate UI)
- Google Trends time series (Trends API returned 429/401 from this host)
- Delivery restaurant coverage / fee ETAs without login
- Direct TLC HVFHV parquet download (CloudFront SSL EOF / multi-hundred-MB; used published aggregations instead)
- City-level official TNC for London/Paris/Mexico City/Sao Paulo/Sydney this pass
- App rank / SensorTower / SimilarWeb / card-spend (not inventing)

## Protocol for live quote basket (next pass)
1. Use box-desktop browser signed into rider accounts (or public fare-estimate pages if available without login).
2. For each route in route_basket_v1.csv, record: timestamp (Asia/Jerusalem), product (UberX/Comfort/Black; Lyft equiv), quote low-high, ETA minutes, surge multiplier or "Busy" flag, "no cars" if shown.
3. Quote same local hour windows: weekday 08:00, 17:30; Fri/Sat 23:00; airport 06:00 and 20:00.
4. Store CSV; never invent missing cells.
