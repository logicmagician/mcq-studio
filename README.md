# MCQ Studio

**Import. Practice. Improve.**

A free, personal MCQ examination platform. Paste MCQs from ChatGPT or Gemini,
preview the parsed questions, set a timer, sit the exam and see your result.
No account, no server, no paid service. Data stays in your browser.

> Status: **Phase 2 (smart importer) implemented.** Paste, parse, preview and edit
> questions. Exam setup, the exam room, results and history come in later phases.
> See `docs/PROGRESS.md`.

## Run locally

No build step. Serve the folder with any static server, for example:

    cd mcq-studio
    python3 -m http.server 8080

Then open http://localhost:8080. (Opening `index.html` directly also works for
the UI, but a local server is recommended for ES module loading in all browsers.)

## How to use the importer

1. Open **Import Questions** and paste the whole set (ChatGPT, Gemini or any MCQ text).
2. Press **Import questions**. The status shows how many questions were detected and how many need attention.
3. Open **Question Preview**. Fix anything flagged, add or remove options, tick the correct answer(s), and add explanations.
4. Press **Save question set**.

Supported: `1.` / `1)` / `Q1.` / `Question 1:` numbers; `A.` `B)` `(a)` `a:` options;
`Answer: B`, `Correct answer: Python`, `Answer: A, C` (multi-select), `Answer: A and C`;
an `Answer Key:` section or key lines at the end; `Explanation:` text; True/False questions;
Markdown headings, bold and bullets. Questions without an answer key are kept and marked as unkeyed.
Nothing is ever given an invented answer: unclear or conflicting answers are flagged for you to fix.

Bengali is supported: ১. / ১) / প্রশ্ন ১: / ১নং প্রশ্ন numbers, ক. খ. গ. options, উত্তর: and ব্যাখ্যা: labels,
and "উত্তরমালা" answer keys. Section and difficulty headings are kept as metadata, not questions.
Shared passages ("উদ্দীপক") attach to the questions they reference. Copied artifacts such as page numbers
and repeated trailing numbers are removed only with evidence and listed in a cleanup report.
Choose "Manual entry" on the import screen to ignore answers in the text and select them yourself.

## Run the tests

    npm test          # unit, parser, CSS and static architecture suites (Node 18+, no dependencies)

Browser audit (needs Python 3 and Playwright with Chromium):

    python3 -m http.server 8765 &
    python3 tests/e2e/audit_ui.py http://localhost:8765/
    # project-subpath check: copy index.html, css/, js/, .nojekyll into a folder named mcq-studio
    # served by a second server, then run the audit against http://host:port/mcq-studio/

Screenshots and a JSON report are written to audit-shots/.

## Deploy to GitHub Pages

1. Push the `mcq-studio` folder contents to a GitHub repository.
2. Repository **Settings → Pages**, source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. Open the published URL. All paths are relative, so project subpaths work.

## Data and privacy

- Preferences (theme) are kept in LocalStorage.
- Question drafts and saved question sets are kept in IndexedDB (Phase 2). Exam attempts will be kept there in Phase 3 and 4.
- Data lives only in the browser on this device. It does **not** sync between devices.
- Nothing is sent to any server.

## Project layout

    index.html            app shell
    css/variables.css     design tokens (dark default, light theme)
    css/base.css          reset, typography, focus, skip link
    css/layout.css        app grid, sidebar, navigation
    css/components.css    reusable cards, buttons, forms, notices
    css/dashboard.css     dashboard-only styles
    css/importer.css      importer and preview styles
    css/responsive.css    breakpoints and reduced-motion
    js/app.js             entry point and hash router
    js/pages/             one module per screen
    js/parser/            MCQ parser and validator (pure logic, no DOM)
    js/storage/           LocalStorage settings; IndexedDB drafts and sets
    js/utils/helpers.js   safe DOM helpers (textContent only)
    tests/                automated tests

## Known limitations

- Numbered options ("1. Python" as an option) are not supported; see docs/PROGRESS.md.
- Compact answer forms such as "AC" are flagged, not parsed.
- Duplicate detection is exact (after normalising case and punctuation).
- Exam Setup, the exam room, results and history are placeholders until Phases 3 and 4.
- The user interface has not yet been tested in a browser; see docs/PROGRESS.md.
