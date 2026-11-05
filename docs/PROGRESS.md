# MCQ Studio: development progress

## Phase 1: Foundation and design system (complete)
- App shell, hash router, sidebar and compact mobile navigation
- Design tokens (dark default, optional light theme); working theme switch
- Dashboard empty state (no invented statistics); Settings page
- Safe DOM helper (textContent only); accessibility basics (skip link, focus, aria-current, 44px targets)

## Phase 2: Smart MCQ importer (implemented; UI not browser-tested)

Files created
- js/parser/parser.js: pure parser (no DOM). Question detection, options, inline and key answers, explanations, Markdown cleanup, CRLF/nbsp handling, true/false and multi-select
- js/parser/validator.js: the only place warnings are created; duplicates, missing options, answer problems, deriveType, summarise
- js/utils/text.js: Unicode-aware normalisation for comparisons
- js/storage/database.js: IndexedDB draft and saved sets, with in-memory fallback that reports persisted: false
- js/pages/importer.js: paste, parse, sample, clear, parsing status
- js/pages/preview.js: edit text, options (add/remove/relabel), correct answers, explanations; reorder, delete, add manually; live warnings; save set
- css/importer.css: form, card, badge and warning styles, phone layout
- tests/parser-tests.js (28 cases), tests/preview-logic-tests.js (7 cases)

Files modified
- js/app.js: real routes for import and preview; async-safe page title and focus; error fallback
- js/utils/helpers.js: added statCard and notice
- index.html: links css/importer.css
- package.json: npm test runs all three suites

Tests actually executed (Node 22)
- tests/storage-tests.js: 5/5 passed
- tests/parser-tests.js: 28/28 passed (formats from the spec, malformed input, duplicates, conflicts, 1000-question stress test in ~32 ms)
- tests/preview-logic-tests.js: 7/7 passed (validator after manual edits, storage fallback)
- Syntax check of every JavaScript file: passed
- HTML tag balance and CSS brace balance: passed

NOT yet executed
- Any screen rendered in a real browser (no browser or jsdom in the build environment)
- Responsive checks at 360–1440px, keyboard walkthrough, screen-reader check
- Real IndexedDB behaviour (only the no-IndexedDB fallback was exercised)

Known limitations
- Numbered options ("1. Python" as an option) are not supported; a note is added and the line is kept as question text, which may split questions.
- Compact answer forms such as "AC" are not parsed; they are flagged as unmatched.
- Duplicate detection is exact after normalising case and punctuation; near-duplicates are not detected.
- Only one working draft exists at a time; a new import replaces it. Saved sets are kept.
- Saved sets have no list screen yet (Exam Setup and history come in Phase 3/4).

## Next: Phase 3 (examination engine). Not started; awaiting approval.

## Phase 1 CSS audit and remediation (verified from source)

Findings before remediation
- Stylesheets were separate files in css/ (variables.css, main.css, importer.css). No <style> blocks existed.
- main.css combined base, layout, components and responsive rules in one 181-line file, against the modular structure in the spec.
- Six inline style attributes were set from JavaScript (dashboard, importer, settings).
- Colour literals appeared outside variables.css (status backgrounds, white text on buttons).
- Filled-button hover colour #7C7FF5 gave white text a contrast of 3.38:1 (fails WCAG AA).
- Unused tokens: --radius-lg. Status tokens (--success, --error, --warning, --secondary) were not used.

Changes
- Split main.css into css/base.css, css/layout.css, css/components.css, css/dashboard.css, css/responsive.css. importer.css and variables.css kept. index.html links all seven in cascade order.
- Added semantic tokens in variables.css: --primary-strong (#5558E8), --primary-strong-hover (#4F46E5), --on-primary, --success-soft, --warning-soft, --error-soft.
- Filled buttons use --primary-strong. #6366F1 is kept for accents, links and focus.
- Status notices use soft-background tokens plus a coloured edge, so they are not colour-only.
- Replaced the six inline styles with utility classes (.mt-4, .mt-5, .flush, .section-title).
- Removed --radius-lg (unused). --glass is used by the mobile sticky header.
- Added tests/css-checks.js (5 checks) and added it to npm test.

Contrast (WCAG 2.1, computed from the hex values)
- Dark theme: text on background 17.4:1; secondary text on card 6.6:1; focus ring on background 9.6:1; white on filled button 5.32:1 (was 4.47:1).
- Light theme: text on background 16.5:1; secondary text on card 7.6:1; focus ring on background 7.4:1; white on filled button 5.32:1.
- Hover state: white on #4F46E5 is 6.29:1 (was 3.38:1 on #7C7FF5).

Phase 1 requirement status
- CSS variables: complete (all colours, spacing, type and radius come from variables.css).
- Dark and light themes: complete in source. Switch and persistence tested in code, not in a browser.
- Reusable components: complete in source (.btn, .card, .notice, .segmented, .setting-row, .stat-*, .empty).
- Responsive layout: partial. Breakpoints at 1023, 767, 479 and 379px exist in source. Not verified in a browser at 360, 390, 430, 768, 1024 or 1440px.
- Modular CSS architecture: complete (seven stylesheets, one concern each).
- Icons (Lucide or fallback): missing. Text labels are used instead.
- Loading and success feedback: partial. Success toasts exist; there is no loading indicator on page loads.

Automated verification (tests/css-checks.js)
- Every class used in JavaScript has a CSS rule (one documented exception: opt-add, a focus hook).
- Every var(--token) used is defined.
- No colour literals outside variables.css.
- No inline style attributes in JavaScript.
- Every stylesheet linked from index.html exists, all are linked, and braces balance.

## Pre-deployment integration audit (Phase 1 + Phase 2)

Environment: Node 22, Python 3 with Playwright 1.63, Chromium 153 (headless). Firefox and Safari were not tested.

Results
- Static audit (tests/audit-static.js): 6/6 passed. Every local link and import resolves, named imports exist, no root-absolute paths, no unused modules.
- CSS checks (tests/css-checks.js): 5/5 passed.
- Unit suites: storage 5/5, parser 28/28, preview logic 7/7.
- Browser audit (tests/e2e/audit_ui.py), at the server root and under a GitHub Pages-style subpath: 80/80 passed in both runs, with 0 console errors, 0 page errors and 0 failed or 4xx/5xx requests.

Bugs found and fixed during this audit
1. Question Preview had no page heading in its loading and empty states, so the page had no title or focus target.
2. The text "null" was printed on the Preview page. Cause: replaceChildren() converts a null argument into text. Fixed by filtering nulls.
3. The same "null" problem on the Dashboard after a set was saved. Fixed the same way.
4. Dashboard "Questions imported" was hard-coded to 0. It now counts questions across saved sets.
5. A Dashboard note still said "appear here after Phase 2". Corrected.
6. Headings received a focus outline after navigation, which looked like a bug to mouse users. Outline removed for the programmatic focus target only.
7. On phones the navigation wrapped to four lines (about a third of the screen) and the summary cards stacked singly. Navigation is now one scrollable row inside the nav, and stat cards are two per row under 480px.
8. Focus moved to the page heading on first load, so the first Tab skipped the skip link. Verified: the old behaviour put the first Tab on the "Create new exam" button; the fixed code puts it on the skip link. Focus now moves only on in-app navigation.
9. No favicon, so browsers requesting /favicon.ico would get a 404 on GitHub Pages. Added an inline SVG icon.
10. Duplicated stat-card markup in the Dashboard. Merged into statCard().

Test-script defects corrected (these were in the audit code, not the app): several checks read the heading before the router had rendered the new page; one expected count was wrong (the sample has 2 flagged questions, not 3); a checkbox query read the input instead of its label; the empty-paste check reused a non-empty paste area.

Verified working in the browser
- Dashboard loads, shows four statistics, and shows zero or dash values where no data exists.
- All seven sidebar links open their pages; the active link is marked aria-current.
- Dark and light themes: correct background colours (rgb 11,15,25 and rgb 245,247,251), choice persists after reload.
- No horizontal page scrolling at 360, 390, 430, 768, 1024 and 1440 px. Interactive controls at least 36 px tall.
- Import: sample, pasted questions with three numbering styles, lowercase options, inline and separate answer keys, explanations, unkeyed questions, malformed questions (flagged, not dropped), empty paste.
- Preview: editing text and options, ticking answers, add/delete/move, save, draft survives reload, dashboard count updates after saving.
- Security: pasted HTML such as an img onerror attribute does not execute and appears as literal text.
- Keyboard: the skip link is the first Tab stop on load and moves focus to the content without changing the route.

Known incomplete items (not Phase 1 or 2 defects, but still open)
- Lucide icons not added (text labels used).
- Dashboard "quick access to saved exams" and "recent history" need Phases 3 and 4.
- Numbered options (for example "1. Python" as an option) are not supported.
- Compact answers such as "AC" are flagged, not parsed.
- manifest.json and sw.js (PWA) are Phase 5.
- Not tested: Firefox, Safari, real touch devices, IndexedDB quota limits, several tabs open at once.

## Parser enhancement: Bengali support, artifact cleanup, headings, stimulus, answer modes

Root causes of the original failure (real-world Bengali input): the parser knew only English digits, option letters and labels; question numbers had to be strictly sequential (1, 2, 8, 15, 19, 20 failed); the label stripper deleted leading Bengali letters so "উত্তর:" never matched; headings, stimulus passages and copied numbers ("কত?14") were treated as question text. On that input the old parser found 1 question; the new one finds 6.

Parser capabilities (js/parser/parser.js, same exports and pipeline as before)
- Numbers: 1. 1) (1) Q1: Question 1: প্রশ্ন ১: ১নং প্রশ্ন, with ASCII or Bengali digits. Numbers must rise, so numbered options are not mistaken for questions.
- Options: A. a) (a) and ক. খ) (গ) to ঙ and beyond. Four or more options.
- Answers: উত্তর: (খ), উত্তর: খ, সঠিক উত্তর: (গ), Answer: B, Ans: C, Answer: B) text, full option text, multi-select (A, C / A and C / ক ও গ). Answer keys: "উত্তরমালা", Answer Key, or a list such as "১. খ" / "২. গ" at the end.
- Conflicts: inline answer and key disagree → "conflicting". Text matching no option → "unmatched". Missing → "missing". Nothing is guessed.
- Explanations: ব্যাখ্যা, সমাধান, বিশ্লেষণ, Explanation, Solution.
- Headings: section titles (containing বহুনির্বাচনী or "(MCQ)", Chapter/অধ্যায় labels) and difficulty levels (সহজ/মধ্যম/কঠিন/Easy/Medium/Hard + স্তর/Level). Never questions. Stored as section and difficulty metadata on each question.
- Shared stimulus: an "উদ্দীপক..." block. Its "১৯ ও ২০ নম্বর" references attach it to those questions only. Not a question.
- Multi-statement i. ii. iii. stays inside the stem.
- Artifact cleanup (every removal is reported with its reason):
  - "more_horiz" UI labels: always removed.
  - Standalone number lines next to blank lines: removed as page numbers.
  - A number attached to the end of a question, answer or explanation line: removed only when the same number repeats at the end of at least two such lines. A single occurrence is kept and flagged for review (for example "10x2"). Option lines are never changed.
- Modes: Automatic (default, extracts answers) and Manual (ignores answer text; the user chooses answers in the preview).
- Math, LaTeX, subscripts and Unicode are preserved exactly. Math is not rendered.

Files modified
- js/parser/parser.js (rewritten in place, same exports)
- js/pages/importer.js: answer-handling choice, cleanup report, heading notice
- js/pages/preview.js: section, difficulty and answer status line, stimulus block, cleanup report, status refreshes when answers change, status derived for drafts saved before this change
- tests/e2e/audit_ui.py: Bengali fixture and manual-mode browser checks
- package.json: npm test includes the Bengali suite

Files created
- tests/bengali-parser-tests.js (28 cases)
- tests/fixtures/bengali-real-world.txt (the real-world sample, used as input data, not hardcoded in the parser)

Data model and IndexedDB
- New optional question fields: section, difficulty, stimulus, answerStatus.
- New draft fields: answerMode, cleanupReport.
- No IndexedDB version change. Drafts and sets saved before this change still load (missing fields are derived).

Test results (executed)
- Unit and static suites (npm test): all pass. Storage 5, parser 28, Bengali 28, preview logic 7, CSS 5, static 6.
- Browser audit, server root and GitHub Pages-style subpath: 91/91 in both runs, no console or network errors.
- Mutation check: deliberately breaking artifact removal or conflict detection makes the Bengali suite fail.
- Performance: 2000 Bengali questions (225 KB) parsed in 154 ms.

Found and fixed during testing
- Answer-status label did not update when a user ticked an answer; now refreshes in place.
- Drafts saved before answerStatus existed showed "Answer missing" even when they had answers; now derived.

Not implemented (outside the current phases, or deferred)
- Answer privacy during the exam, explanations hidden during the exam, stimulus shown during the exam, section and difficulty filters, scoring and result review. These need the exam room (Phase 3) and results (Phase 4), which do not exist yet, so they are untested.
- Answers placed before their question with an explicit reference.
- Navigation text such as "Previous | Next" in copied web pages (only more_horiz, page numbers and repeated trailing numbers are detected).
- A separate view for unrecognized content (currently notes only) and an in-app viewer for the whole original input (per-question original text is available).
- Numbered options (1. 2. 3. as options).
- Math rendering (LaTeX is preserved as text).
- Browsers other than Chromium.

## Release-readiness audit: Phase 1 + Phase 2 (milestone, before Phase 3)

Results (executed)
- npm test: all suites pass. Storage 5, parser 28, Bengali 28, preview logic 7, CSS 5, static 6 (79 total).
- Browser audit at server root: 95/95, 0 console errors, 0 page errors, 0 failed or 4xx/5xx requests.
- Browser audit under GitHub Pages-style subpath: 95/95, same result.
- Persistence: a saved set and an edited draft survive closing and reopening the browser (persistent profile).
- Responsive: no horizontal scrolling on the dashboard at 360–1440 px and on the preview at 360, 390 and 768 px.
- Static: every local link and import resolves; no unused modules or exports; no absolute or sandbox paths.
- Dependencies: none.

Corrections made during the audit
- Dashboard copy promised a "timed exam" that does not exist yet. Corrected.
- Dashboard button "Create new exam" only opens the importer. Renamed to "Import questions".
- README said exam records were stored from Phase 2. Corrected: drafts and saved sets are stored in Phase 2; exam attempts from Phase 3.
- Generated audit screenshots added to .gitignore.

Not verifiable yet
- Correct answers hidden during an active examination: no exam screen exists yet. This must be the first acceptance test in Phase 3.
- Answer text appears on the import screen only inside parser notes for unrecognised answer-key lines; the preview is the only screen that shows answers as data.

Remaining release decisions and limits
- No LICENSE file. Choose one before making the repository public.
- Tested in Chromium only. Firefox, Safari and real touch devices are not covered.