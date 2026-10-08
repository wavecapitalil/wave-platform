# Annual Equity Valuation

Entry point: Terminal → Equities → Equity Valuation (`terminal_app.html#valuation`).

## Product

Basic view retains Bull, Base/Neutral and Bear scenarios and five sourced historical years followed by 1–10 independently editable annual forecasts. Growth and share-count assumptions compound year by year; margins, exit multiples and year-end balances apply to their own year. Advanced reveals buyback, dilution, debt components and methodology. Missing observations stay missing.

The live page reads `/api/valuation-inputs` from the existing Wave gateway, using SEC CompanyFacts and independently timestamped Yahoo USD quotes when available. The checked-in historical JSON is test data only and is not loaded by production. Unsupported currencies, ambiguous share classes, split bases or fiscal periods are withheld. The latest usable history must match the declared model base before forecasts can calculate.

Users may provide a dated reference price when a verified quote is unavailable. User entries are labeled manual/unverified and affect comparisons only, never modeled prices. The displayed gap is `(forecast price / reference price − 1) × 100`, not annualized return. Changing company clears the manual reference.

## Accounting

- Revenue[t] = Revenue[t−1] × (1 + growth[t]/100)
- EBIT[t] = Revenue[t] × margin[t]/100
- Shares[t] = Shares[t−1] × (1 − buyback[t]/100 + dilution[t]/100)
- EV[t] = EBIT[t] × EV/EBIT[t]
- Equity[t] = EV[t] + cash[t] − modeled debt[t] − other claims[t]
- Price[t] = max(0, Equity[t]) / Shares[t]

Currency and share counts use millions in the UI; API values are raw USD/shares. Both share rates apply to opening-year shares. Historical shares are point-in-time common shares, not public float or weighted-average diluted EPS shares. Historical gross dilution is never inferred from net share movement.

Cash/debt are balances AFTER buybacks, cash flows, issuance and financing. There is no second subtraction of repurchase spending. Flat initial balances are editable assumptions, not a funded cash-flow forecast. Debt components are explicitly separated; a component sum is not certified as a comprehensive total. Nonpositive EBIT produces no EV/EBIT price; negative equity is retained with a zero common-share-price floor. Future scenario prices are not discounted values today.

Detailed sources, fiscal periods, warnings and methods are recorded in Sources & Methodology. The new client scenario model and SEC adapter are included in the private source catalogue as read-only engines; owner formula editing for Company Research is unchanged.

## Safety and integration

The existing gateway authentication setting is preserved. No new schema, key or permission change is required. Company Research formulas and owner-only calculation reads/writes retain their existing authorization. No private admin link, owner history or capability token is exposed through the new page/menu.

In the full Terminal shell, the existing main pane owns vertical scrolling; the worksheet owns horizontal scrolling only. The jump-to-table action preserves the valuation deep link. Other pages retain their existing shell behavior.

## Validation

Run the node model/UI/adapter/route/private-access/Company Research tests listed in `.github/workflows/equity-valuation.yml`, syntax checks, static contracts and Flask route contracts. `scripts/valuation_browser_qa.py` exercises the full Terminal with fixture financial responses in real Chromium at desktop, 750px embed, iPad landscape/portrait and phone widths. Screenshots/report are retained as CI artifacts. This fixture browser test is separate from real deployed API smoke tests.

Live release smoke checks should cover AAPL, MSFT, CSCO, malformed tickers, quote/fiscal dates, null fields, existing Cisco ratios and anonymous owner-admin denials. Regenerate the source catalog with `python scripts/build-calculation-catalog.py` whenever included code changes.
