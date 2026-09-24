# WAVE Terminal

The deployable stabilization/migration baseline lives in `apps/terminal/public`.
The immutable v1 reference remains under `legacy/terminal-v1`.

## Current frontend structure

- `terminal_app.html` — page structure
- `terminal.css` — base Terminal CSS
- `wave-university-theme.css` — shared WAVE visual language overrides
- `i18n.js` — EN/HE localization
- `terminal.js` — shared shell plus legacy domains still being extracted
- `terminal-flows.js`
- `terminal-hormuz.js`
- `terminal-metals.js`
- `terminal-confluence.js`
- `terminal-seasonality.js`

## Migration rule

The current product remains usable at every step.

A frontend domain is only considered migrated when:
1. its JavaScript is isolated from the legacy bundle;
2. its API contract is explicit;
3. desktop and iPad browser workflows pass;
4. no hidden dependency on removed legacy code remains.

React/Next migration comes after these boundaries are stable, not before.
