# Owner calculation workspace

Open `/calculation-admin.html` and sign in using the existing owner account.
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

`wave-data` retains its existing public gateway setting. The `/api/admin/calculations` handler verifies a bearer token using Supabase Auth `getUser`, requires a confirmed account, and checks the private `wave_calculation_owners` table. Browser roles have no table grants or publish-RPC permission; all three registry tables have RLS enabled with no browser policies. The service-role key remains server-side only. Adding owners is a separate privileged database operation; public sign-up or user metadata cannot grant access.

Apply the recorded schema migration before deploying the edge files. Owner assignment is deliberately not stored in the public repository. Existing Supabase sessions work on the admin page. Email login uses `shouldCreateUser: false`; the exact admin URL must be in the Supabase Auth redirect allowlist for direct magic-link return. Email OTP entry is also supported if the existing email template includes a token.

Tests: `node --test scripts/calculations.test.mjs scripts/forward_consensus_test.mjs` (Node 24). Tests cover SEC fixtures, missingness, period matching, restricted expressions, live field overrides/restoration, owner-only reads/writes and revision conflicts. The Cisco fixture is a public SEC excerpt as of 2026-10-08, not a live-price expectation.
