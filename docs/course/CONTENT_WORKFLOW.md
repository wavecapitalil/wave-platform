# WAVE Course Content Publication Gate

## Core principle
Raw PDF extracts, internal notes, and source files stay untouched under `docs/course-workspace/`. They are source materials only, not student-facing lesson bodies.

## Publishing workflow
1. Register research references in a source index (source URL or repository path, author, type, access/license, lessons, verification status).
2. Draft each lesson in a separate editing workspace.
3. Review text for factual accuracy, beginner accessibility, RTL artifacts, figure accuracy, interactive questions and mobile display.
4. Create a clean reviewed lesson file in `docs/course/approved/`.
5. Add an explicit `approved` entry in `docs/course/registry.json` with the exact curated path.
6. Only then may the lesson engine fetch the curated content.

## Default status
Lessons without an approved entry are considered `source_only` or `in_review` and show a clearly labeled not-yet-published state.
Do not auto-approve based on file existence, filename, word count or prior preview visibility.

## Rollback
Reference branch: `backup/course-before-content-gate-20261025`.
Work branch: `feature/course-content-gate-20261025`.
Do not delete, move, or rewrite any existing source files.

## Review checklist
- [ ] Clear objectives and prerequisite definitions
- [ ] Independently verified technical claims
- [ ] Clean Hebrew/English typography and RTL
- [ ] Original and correctly labeled candle illustrations
- [ ] Appropriate exercises with explanations
- [ ] No source-PDF artifacts, prompts, internal approval notes or editorial instructions
- [ ] No implied guaranteed trading outcome
- [ ] Desktop/mobile readability
- [ ] Explicit editorial approval
