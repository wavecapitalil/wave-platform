# WAVE Academy — Course-wide QA workstream (2026-10-27)

## Scope and preservation contract
- All 56 lesson identities and source drafts: spelling, punctuation, grammar, Hebrew/English bidi, spacing, mathematical notation.
- Reuse approved Deep Navy visual language from lessons 1.1–1.4 without rewriting SVG source automatically.
- Audit all figure labels, OHLC values, axes and captions separately from prose.
- Preserve source facts, lesson sequence, interaction code and original artwork unless a specific verified correction is required.
- This branch is not published. Never merge until verified and approved.

## Baseline established
- Canonical outline: docs/course-workspace/COURSE_OUTLINE.md (56 lessons, 10 units).
- Dedicated HTML exists for units 1 and 2 (9 lessons).
- Other lesson drafts in docs/course-workspace/lessons/*.md include PDF-extracted bidirectional formatting artifacts.
- Asset manifest: docs/course-workspace/manifest.json (37 figure records).
- The approved-publication registry docs/course/registry.json currently has zero approved lesson entries.
- Do not treat Markdown source as student-ready HTML.

## Workflow and acceptance gates
1. Inventory all lessons, scripts, source assets and content status.
2. Preserve copies; edit structured text nodes without touching chart data/behavior.
3. Human-quality editorial pass lesson-by-lesson: detect OCR/PDF broken word order, punctuation, list numbering, equations and bilingual parentheses.
4. Source-to-edited diff: preserve intended meaning and all examples; flag ambiguous extraction for editorial review.
5. Figure QA: verify label legibility, numbers, OHLC order, candle direction, chart axes and responsive viewBox at desktop/mobile widths.
6. UI: centralize design tokens from Deep Navy; pilot on unit 2; adapt full-engine approved lesson renderer without exposing draft Markdown.
7. Browser QA: desktop/mobile/RTL/keyboard/interactions with screenshots and issue tracking.
8. Approve the bundle; only after approval merge and publish.

## Status
- Repository inventory and branch setup: started.
- Complete 56-lesson proofread: NOT DONE.
- Course-wide UI standardization: NOT DONE.
- Figure QA: NOT DONE.
- Browser QA: NOT DONE.
- No change to main or public site from this workstream.

## Inventory update — 2026-10-27
- Verified **all 56 of 56** lesson draft Markdown files at `docs/course-workspace/lessons/UU-NN.md`. No missing lesson IDs.
- Every inspected draft contains bidirectional PDF extraction control characters. Typical counts range from ~170 to 870 per lesson; preserving source and rebuilding clean editorial copies is necessary.
- 37 asset entries in the existing manifest require illustration-level verification: source figure vs displayed labels, axes, data, and responsive readability.
- Staged `candlesticks-course-deep-navy-stage.css` and linked it to the five dedicated unit-2 lesson HTML pages **only on this branch**. The sole HTML change is a stylesheet link. Unit-2 rendering has **not yet passed browser QA**.
- Unit 1 on main is the approved UX baseline but its copy still requires a complete final manual proofread.

## Risks to resolve before publish
- Copying a 56-lesson PDF extraction into student-facing HTML would bypass the existing content approval gate. Forbidden.
- Auto-deleting all RTL/bidi markers can silently re-order numbers, punctuation, formulas, ranges and bilingual expressions.
- Dark chart containers do not fix SVG intrinsic text geometry; figure labels must be audited individually.
- A green code-diff check is not equivalent to browser-verified functionality.

## Working-state checklist
| Deliverable | Status |
|---|---|
| 56/56 draft-file inventory | Verified |
| Base Deep Navy CSS staged for unit 2 | Implemented on QA branch |
| 2.1–2.5 linked to staged theme | Implemented on QA branch |
| All 56 lessons professionally copyedited | Not complete |
| 37 asset-manifest figures manually QA'd | Not complete |
| Browser desktop and mobile screenshots | Not complete |
| Content semantics / interactions regression tests | Not complete |
| Main branch merge / public publish | Not performed |

## Publishing gate
Only merge after a reviewed editorial diff for every modified lesson, accurate captions and graphic labels, confirmed responsive/keyboard tests, and user approval. Original PDF extracts and original figures remain immutable references.
