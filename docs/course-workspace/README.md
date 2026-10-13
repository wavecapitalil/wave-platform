# Japanese Candlesticks — working course workspace

**Status: WORK IN PROGRESS — not approved for publishing.**

This directory is the editable source-of-truth workspace for developing the Hebrew course **תורת הנרות היפניים** (56 lessons, 10 units). It is **not** a website route or deployment asset. Nothing under this directory should be imported into frontend bundles.

## Working principles
- Hebrew instructional content with English professional terminology.
- Beginners from zero; Japanese candlesticks are the focus. Technical analysis and risk management are supporting tools.
- Named candlestick patterns include one or two candles only; longer sequences are context, not named patterns.
- Original teaching charts and clean anatomical diagrams; identify synthetic examples versus historical market data.
- All existing lessons remain drafts pending explicit review and approval.
- Do not confuse draft completeness with publication approval; do not invent market data or verified strategy performance.

## Navigation
- [Course outline](COURSE_OUTLINE.md)
- [Status and next work](PROGRESS.md)
- [Decisions](DECISIONS.md)
- [Source and migration notes](SOURCE_MANIFEST.md)
- `lessons/` will contain one Markdown file per lesson once content is migrated and checked against the PDF.

## Collaboration protocol
1. Identify lesson ID and inspect this README, decisions, status and that lesson's file only.
2. Work on one lesson or limited batch; do not silently rewrite approved sections.
3. Mark changes and issues in progress log, then commit.
4. Explicit user approval is required before changing any lesson's status to APPROVED.
5. Archive PDF is a reference snapshot, not the working format.

Repository is public by owner's decision (2026-10-13).
