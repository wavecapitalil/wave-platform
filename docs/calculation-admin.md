# Owner calculation workspace

Open the private capability link supplied to the owner. No email, password or OTP is required. The admin page is not linked from the terminal. Anyone holding the complete secret link can use it; hiding a normal URL is not authorization.
The page shell is static; every registry read, preview and publication is authenticated on the server. No private settings or source catalogue are embedded in the page.

## Live editing

Company Research supports 14 arithmetic definitions in `supabase/functions/wave-data/calculations.ts`. Quick/current ratios, trailing/forward P/E, historical PEG, P/S and P/B are calculated by default. Other annual formulas are opt-in replacements for provider metrics. The UI shows fiscal periods when annual replacements are enabled.

The workflow is edit → preview on a ticker → inspect inputs/periods → enter reason → publish. Publication uses an optimistic revision lock and an atomic settings/history transaction. Reloading company data picks up the next revision; an already-open result does not push-update itself. Restoring a historical version loads a draft and requires preview/publication.

Only constants, approved metric inputs, parentheses, `+ - * /`, and `abs()` are accepted. Expressions cannot run code or make network/database requests. Missing inputs, nonfinite results and zero denominators return null. Positive EPS guards prevent misleading P/E and historical PEG values.

`calculation_meta.baseline` preserves original provider values so previews/restores can correctly remove an opt-in formula. It contains public numeric company metrics only. No owner identities or history are returned to the public stock endpoint.

## Accounting conventions

Quick Ratio uses cash + short-term investments + net trade receivables divided by current liabilities. It excludes financing receivables. All instant facts must share the latest balance-sheet date. A missing tag is not zero. Annual flows use 330–390 day SEC periods and prior-year comparisons must be approximately one year apart. SEC USD facts are not combined with non-USD market caps/quotes.

Provider EPS TTM is used when available. If absent and the newest balance sheet is also the latest fiscal year end, annual diluted SEC EPS is valid TTM EPS. Annual EPS is not substituted after an interim reporting date. Available provider trailing P/E is retained if its underlying EPS is absent and the owner has not overridden the formula. Historical PEG is a separate metric, using positive annual diluted EPS YoY growth in percentage points, never relabelled as forward PEG.

## Other engines

The private catalogue includes the Python data engines, terminal modules, and the deployed edge calculations as searchable source. Those algorithms are read-only in this interface and still require a code release to change. Provider metrics are explicitly listed; vendor internals are not represented as our own editable calculations.

Run `python scripts/build-calculation-catalog.py` after changes and deploy the regenerated catalogue with the edge function. This is a source snapshot, not an execution engine.

## Authorization and deployment

`wave-data` retains its existing public gateway setting. The admin handler accepts an owner capability token in the Authorization header, hashes it with SHA-256, looks up the private `wave_calculation_links` table, rejects revoked links and rechecks the owner table. Existing verified owner JWTs remain supported server-side. Browser roles have no grants to the registry/link tables or publish RPC. Tokens use 256 bits of cryptographic randomness; only hashes are stored in the database. Never commit a raw token or its complete link.

The browser receives the key in the URL fragment, removes the fragment from the address bar immediately, and retains it only in sessionStorage for that tab. No third-party scripts load on the admin page. The page uses a no-referrer policy. Bookmark the original complete link. Closing access clears the tab key. To revoke a leaked link, set `revoked_at=now()` for its hash using a privileged database connection; do not expose a public token issuance endpoint.

Apply the recorded migrations before deploying. Owner assignment and link issuance are deliberately absent from the public repository. Publication still records the owning user ID and requires the same validation/revision lock.

Tests: `node --test scripts/calculations.test.mjs scripts/forward_consensus_test.mjs scripts/calculation-access-link.test.mjs` (Node 24).
