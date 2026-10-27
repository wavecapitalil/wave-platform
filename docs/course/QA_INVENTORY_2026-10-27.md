# WAVE Academy — QA inventory, 2026-10-27

## Evidence-based inventory
- Course outline: **56 lessons**, 10 units, checked against `docs/course-workspace/COURSE_OUTLINE.md`.
- **9 dedicated student HTML pages** in units 1–2, inspected via GitHub on the isolated QA branch.
- **47 Markdown draft lesson sources** in units 3–10, all fetched and inspected for bidi controls; no files missing.
- All 47 Markdown drafts have a substantial number of embedded directional control marks (approximately 170–510 per file in the inspected sample counts), indicating PDF-derived RTL extraction. These are **not** proof of error individually; they are risk indicators.
- **37 listed figures** in `docs/course-workspace/manifest.json`. Manifest counts are not a visual QA pass.
- The publication registry has no approved lessons. Do not publish unapproved drafts.

## Nine dedicated lesson pages
| Lesson | Deep Navy linked | Inline SVG count | Potential extraction/formatting regex hits (unverified) |
|---|---|---:|---:|
| 1.1 | Yes | 0 | 18 |
| 1.2 | Yes | 2 | 18 |
| 1.3 | Yes | 0 | 12 |
| 1.4 | Yes | 0 | 13 |
| 2.1 | No (separate pre-existing theme) | 2 | 31 |
| 2.2 | No | 0 | 20 |
| 2.3 | No | 0 | 15 |
| 2.4 | No | 0 | 12 |
| 2.5 | No | 0 | 12 |

Numbers in the final column are broad heuristic regex matches and **must not** be presented as confirmed mistakes.

## Priority and safeguards
1. **High:** visibly scrambled mixed Hebrew/English/number passages in units 1–2 require human contextual rewording, not regex-only replacement.
2. **High:** directional PDF artifacts in source drafts 3–10 require source-vs-extraction review before any automated normalization. Never strip marks in-place on `docs/course-workspace/lessons`.
3. **High:** Figure labels, price axes, OHLC consistency and numerically truthful diagrams require illustration-by-illustration review against source.
4. **High:** Preserve lesson chronology, trading assertions, numbers, interaction code and original figure assets.
5. **Medium:** Deep Navy approved styling should be generalized through tested shared components; lesson 2.1 has special CSS and must be piloted independently.
6. **Medium:** Validate mobile/tablet/desktop, RTL and accessibility with browser screenshots; code inspection is insufficient.

## Edit/approval ledger
- Audit inventory: completed in the **work** branch.
- Proofread all 56: pending.
- Correct chart drawings: pending.
- Site-wide UX/UI: pending.
- Browser regression: pending.
- Main branch changes by this workstream: **none**.
- Merge/live publishing: **not approved**.

## Next gated action
Create an edited copy of lessons 1.1–1.4 and pilot unit 2 lesson 2.1 with full text diffs, screenshot checks, and figure integrity checks. After that, process Markdown units 3–10 in unit batches, leaving approved source files unchanged.

## Editing progress: lesson 2.1 pilot
- Completed two contextual proofread passes over lesson 2.1: 17 verified passage replacements.
- Fixed scrambled PDF-extraction tokens in learning objectives, price-example prose, bullish/bearish candle examples, OHLC definitions, body/range formulas, validity constraints, and exercise questions.
- Source HTML, SVG elements, scripts, class names, illustrations and navigation were preserved. The editing remains **draft**, not reviewed in a browser, and other passages still need a full line-by-line pass.
- Design audit: lesson 2.1 includes `candlesticks-21-master.css` (a pre-existing light master theme) and `candlesticks-course-deep-navy-stage.css` loaded later. Cascade needs a screenshot-based regression check before declaring visual parity with unit 1.
- Next: complete lesson 2.1 copy-edit, verify graphical OHLC and numerical constraints, then use the approved treatment as the unit-2 style baseline before broader rollout.
