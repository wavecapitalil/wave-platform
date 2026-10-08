# Terminal product conventions

All source lists, provenance, methodology, disclaimers and confidence assessments belong on the Sources & Methodology page (`page-sources`), last in the sidebar. Do not put explanatory source panels inside market, research or chart screens.

For new dynamic content call `WaveSources.record(key, title, text, links)` or `WaveSources.html(key, title, html)`. Use stable keys per dataset or ticker so refreshed details replace old entries. Existing standalone notes can use `data-wave-source="Section title"`; the central registry collects them and the stylesheet hides their original placement. Keep values, units and applicable fiscal periods beside the metrics they describe. Loading/error states and primary news content remain in their original views.

Load `terminal-sources.js` before modules that register source details. Verify that the research page has no source comparison panel and that the final sidebar item opens the central page with the same details.

Company Research arithmetic must be registered in `supabase/functions/wave-data/calculations.ts` and evaluated by the server calculation service. Preserve same-period inputs, units, null semantics and the owner-only authorization boundary. New calculation engines must be included in the private source catalogue; regenerate it with `python scripts/build-calculation-catalog.py`. Do not present read-only engines as runtime-editable or expose owner settings/history through browser table permissions.

