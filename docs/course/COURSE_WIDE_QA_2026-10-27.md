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
