# Unit 4 — editorial content and internal artwork handoff (2026-11-05)

## Confirmed course structure
- 9 units and 56 lesson cards remain present in the course catalog.
- Combined unit 4: display lessons **4.1–4.12**.
- Display 4.1–4.5 read original source 4.1–4.5; display 4.6–4.12 read original 5.1–5.7.
- Old source IDs, URLs and localStorage progress keys must remain unchanged.

## Editorial work committed
- All 12 source-derived lessons assembled in `apps/terminal/public/assets/candlesticks-unit4/unit4-editorial-review.json`.
- Main theory, key source OHLC examples, exercises and explanatory answer keys revised for readability and correct pattern definitions.
- New independent page: `apps/terminal/public/candlesticks-unit4-review-v3.html`.
- UI includes Deep Navy visual system, one lesson at a time, 12-item lesson navigation, readable Hebrew/English typography, clear section hierarchy and collapsible solutions.
- Unapproved content is **not** registered in `docs/course/registry.json`.
- Source Markdown under `docs/course-workspace/lessons/` remains unchanged.

## Approved internal illustration assets
- 12 individual illustrations were approved by course owner: 4.1–4.12.
- A complete local ZIP package was built for upload to `apps/terminal/public/assets/candlesticks-unit4/internal/`.
- Expected filenames: `fig-4-01-approved.webp` … `fig-4-12-approved.webp`.
- `apps/terminal/public/assets/candlesticks-unit4/internal/README.md` maps the 12 files to 12 lessons.
- **BLOCKER:** The binary files are not yet in GitHub; the GitHub file-edit integration cannot directly transfer sandbox PNG/WebP bytes. The review page intentionally shows a placeholder for missing files, not a broken preview.
- Earlier Figure 4.1 #1 at `apps/terminal/public/assets/candlesticks-unit4/fig-4-1-01.svg` is already in GitHub and linked from the review page.

## Remaining QA / publication guards
1. Upload the 12 approved WebP files from the package without overwriting existing lesson-cover thumbnails.
2. Review every figure for candlestick anatomy, stated OHLC prices, relative body/range boundaries and correct Hebrew/English titles.
3. The PDF source for lesson 4.5 describes 18 exercise cards, but 18 separate figures have not been recovered. One approved illustration of sample cases does not replace all 18 cards.
4. Compare difficult or ambiguous PDF-derived numerical strings and formulas against their original page images.
5. Visually QA desktop and mobile layout. GitHub source and asset existence were checked; runtime browser display has not yet been verified.
6. Obtain explicit publication approval before moving material to the approved course registry.

**Current status:** Review content and asset handoff prepared, but full illustration deployment and final publication QA not completed.
