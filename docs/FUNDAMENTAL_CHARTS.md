# Fundamental Charts: values, YoY and PNG

Every selected metric and company uses the active `Value` or `YoY change %` mode on the same chart. Annual comparisons use the previous reporting year; quarterly comparisons use the corresponding prior-year reporting quarter. Growth is computed from all loaded history before applying the visible range.

The provider currently supplies period-end dates, without verified fiscal year/quarter identifiers or a declared currency in every response. Calendar end-year/quarter labels must not be presented as verified fiscal labels. Date-only comparisons require a unique reported period 350–380 days earlier, including 52/53-week fiscal shifts. Missing/ambiguous periods and zero bases are unavailable. Negative earnings bases report loss reduction, loss increase or loss-to-profit rather than a deceptive percentage. CapEx uses explicitly labeled cash-outflow magnitude growth. Positive bases can legitimately decline beyond -100%.

Margin and precomputed growth metrics are percentage-valued series. Their YoY toggle is relative percent change, not percentage-point difference. Legacy growth metric pills are derived from the underlying reported metric using the same matching rules rather than provider row offsets. Percentages and mixed units are never stacked; EPS has its own per-share axis. Currency is named only when the provider declares it.

Newer requests supersede older requests. Editing a ticker invalidates the old chart immediately; clicking Chart loads the new ticker. Metric/period switches reload an existing chart; display/style/range switches reuse the loaded data. Missing values remain gaps, with per-cell reasons in the table.

Download PNG captures the actual visible chart canvas at a 1600px export width, with current ticker(s), series, mode, range, chart type, legend, units and source/retrieval timestamps when provided. The export has an opaque dark background and an informative filename. General methodology stays on Sources & Methodology per the repository convention.

Validation:
- `node --test scripts/fundamental_chart_test.cjs`
- `python scripts/fundamental_chart_browser_qa.py` (actual Chart.js and Chromium with isolated data fixtures)
- `.github/workflows/fundamental-charts.yml` runs relevant valuation, API, private-access, syntax, source catalogue and browser regressions before release.

Browser viewport checks emulate desktop/tablet/mobile sizes; they are not physical iPad or Safari testing.
