# Research Module Specifications v1

Date: 2026-09-24
Status: user-validated product intent

## 1. Hormuz / Energy Risk Monitor

### Primary question
Is escalation around the Strait of Hormuz creating a meaningful risk to energy supply chains and therefore upward pressure on oil prices?

### Product role
Macro risk monitor. This is not primarily a stock-picking tool.

### Inputs
- credible news / incident feeds related to Hormuz, shipping, sanctions, military activity and supply disruption;
- Brent and WTI price action;
- optional later additions: tanker/shipping data, freight rates, inventories and volatility.

### Outputs
- current risk state;
- recent incidents / developments;
- Brent and WTI confirmation or non-confirmation;
- change versus prior state;
- concise explanation of what changed;
- source and timestamp for every material observation.

### Remove from core
- stock sensitivity ranking as the primary output;
- automatic equity-trade recommendations.

---

## 2. Metals Dashboard

### Primary question
Where is the Gold/Silver Ratio relative to its 10-year history, and what does that imply about relative cheapness between gold and silver?

### Default lookback
10 years.

### Core outputs
- current Gold/Silver Ratio;
- 10-year mean;
- percentile within the 10-year distribution;
- standard deviation / z-distance from the mean;
- 10-year historical chart;
- current gold price;
- current silver price;
- minimal descriptive interpretation only.

### Interpretation rule
Prefer data over narrative.

Allowed:
- "The ratio is in the 88th percentile of its 10-year range; silver is relatively cheap versus gold compared with most observations in the period."

Avoid:
- buy/sell recommendations;
- deterministic mean-reversion claims;
- unsupported historical causal narratives.

---

## 3. Seasonality Scanner

### Primary question
How is the current year tracking versus the typical path of the previous 10 years?

### Default lookback
10 years.

### Visualization
Line chart:
- X axis: progression through the calendar year;
- Y axis: cumulative return;
- line 1: average cumulative path across the prior 10 years;
- line 2: current year's cumulative path in a contrasting style.

### Assets
The scanner should be asset-agnostic and support equities, indices, crypto, commodities and ETFs where sufficient history exists.

### Optional research layer
Add dispersion band / range later, but never replace the two primary lines.

### Product role
Descriptive seasonal context, not an automatic trading signal.

---

## 4. Cross-Asset Flows

### Decision
The legacy Digital Ad Intelligence "Comm Flows" module does not match current product intent and should not be restored as the new flows module.

### Primary question
Where is capital positioning and flow changing across markets?

### Required domains
- equities;
- crypto;
- metals;
- ETFs.

### Required flow / positioning lenses
1. flows by exchange / venue where meaningful and observable;
2. futures positioning;
3. options positioning;
4. short interest / percentage short.

### Design principle
Do not collapse heterogeneous flow measures into one fake universal "money flow" number.

Each metric must preserve:
- instrument / asset;
- venue;
- flow type;
- units;
- source;
- observation window;
- timestamp;
- interpretation boundary.

### Example categories
Equities:
- exchange/venue volume where useful;
- ETF/fund flows;
- futures positioning;
- options positioning;
- short interest.

Crypto:
- exchange inflows/outflows;
- derivatives OI / positioning;
- futures basis/funding where relevant;
- options positioning;
- short/long positioning where source quality permits.

Metals:
- futures positioning;
- ETF flows;
- options positioning;
- short positioning where available.

ETFs:
- creations/redemptions or fund flows;
- options;
- short interest.

---

## 5. Confluence Monitor

### Primary question
Is there recent alignment between:
1. institutional buying;
2. insider buying;
3. analyst upgrades / positive revisions?

### Default window
30 days.

### User-selectable windows
Provide alternative windows, initially:
- 7D
- 30D
- 90D

### Output
Prefer transparent confluence over opaque scoring:
- 3/3 aligned;
- 2/3 aligned;
- 1/3 aligned;
- 0/3 aligned.

Each component must show the underlying evidence and date.

### Interpretation
The confluence result is a research filter, not a standalone signal.

---

## 6. Terminal product identity

The WAVE Terminal combines two roles:

### Monitor
- what changed;
- what is unusual;
- where risk is building;
- where positioning/flows are shifting.

### Research
- why it changed;
- what evidence supports it;
- how it compares historically;
- what data still needs verification.

The Terminal should clearly distinguish descriptive data, research evidence and any future signal layer.
