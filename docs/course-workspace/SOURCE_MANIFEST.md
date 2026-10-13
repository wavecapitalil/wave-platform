# Source manifest and migration notes

Primary source: `Candlesticks_Course_Assembly_Working_v03.pdf`, dated 2026-10-13, 163 pages.

## Successfully imported
- **56 lesson transcripts**: `lessons/01-01.md` through `lessons/10-05.md`, mapped to PDF pages 7–148.
- **4 reference/appendix transcripts**: `appendices/`, covering PDF pages 149–163.
- Lesson source page numbers and non-publication state are noted on each page.

## Still missing or unverified
- Original PDF binary itself has **not** been committed to GitHub.
- Extracted text preserves raw reading order from the PDF, which may have Hebrew RTL punctuation and math formatting issues.
- PDF diagrams, candle charts, embedded pictures, page composition, bookmarks and visual annotations are **not included** in lesson Markdown.
- Lesson structure, references and formula formatting need review against source before claiming faithful conversion.
- Publishing permission has **not** been given for any lesson.

## Editorial protocol
1. Work from the relevant lesson Markdown, its appendix if necessary, and source PDF for visual checks.
2. Track edits as Git commits and keep the original text until explicitly revised.
3. Distinguish verified market data from synthetic education examples.
4. Mark lesson as approved **only** after explicit owner sign-off.

These files are documentation under `docs/course-workspace/`, not part of the frontend.
