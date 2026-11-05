"""
Browser audit for MCQ Studio (Phase 1 + Phase 2), using Python Playwright + Chromium.

Run:
    python3 -m http.server 8765 --directory <mcq-studio folder> &
    python3 tests/e2e/audit_ui.py http://localhost:8765/

Each check prints ok/FAIL. Console errors, page errors and failed requests are collected
for every page and reported at the end. Screenshots are written to ./audit-shots/.
"""
import sys, os, json
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
SHOTS = os.path.join(os.path.dirname(__file__), '..', '..', 'audit-shots')
os.makedirs(SHOTS, exist_ok=True)

results = []          # (name, ok, detail)
problems = []         # console errors / page errors / failed requests

def record(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail and not ok else ''))

def heading_is(page, title, timeout=5000):
    # Wait until the router has rendered the page with this heading (no stale reads)
    page.wait_for_function("(t) => (document.getElementById('page-title')||{}).textContent === t", arg=title, timeout=timeout)
    return True

def watch(page, label):
    page.on('console', lambda m: problems.append(f'{label}: console.{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: problems.append(f'{label}: pageerror: {e}'))
    page.on('requestfailed', lambda r: problems.append(f'{label}: requestfailed: {r.url}'))
    page.on('response', lambda r: problems.append(f'{label}: HTTP {r.status}: {r.url}') if r.status >= 400 else None)

SAMPLE_MALFORMED = """1. Which is a prime number?
A. 4
B. 9

2. Capital of Bangladesh?
A. Dhaka
B. Pune
C. Sylhet
D. Rajshahi
Answer: Kolkata

3. Only one option here?
A. yes
Answer: A

4. Which is an operating system?
A. Python
B. Linux
C. HTML
D. SQL
Answer Key:
4. B
"""

SAMPLE_UNKEYED = """1. What is 2 + 2?
A. 3
B. 4
C. 5
D. 6

2. What is 3 x 3?
A. 6
B. 9
C. 12
D. 15
"""

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ------------------------------------------------------------------ AUDIT 2a: dashboard + navigation
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = ctx.new_page(); watch(page, 'dashboard')
    page.goto(BASE + '#/dashboard'); page.wait_for_selector('#page-title')
    record('dashboard loads with heading', 'Welcome to MCQ Studio' in page.inner_text('#page-title'))
    record('dashboard shows 4 statistic cards', page.locator('section[aria-label="Statistics"] article').count() == 4)
    record('dashboard empty state visible', page.get_by_text('No examinations yet').is_visible())
    record('dashboard stats show "—" for score (no fabricated data)',
           page.locator('section[aria-label="Statistics"] article').nth(2).locator('.stat-value').inner_text() == '—')
    page.screenshot(path=os.path.join(SHOTS, 'dashboard-desktop.png'))

    nav = {'Import Questions': 'Import Questions', 'Question Preview': 'Question Preview', 'Exam Setup': 'Exam Setup',
           'Examination Room': 'Examination Room', 'Results': 'Results', 'History': 'Examination History', 'Settings': 'Settings'}
    for link, title in nav.items():
        page.get_by_role('link', name=link, exact=True).first.click()
        ok = heading_is(page, title)
        record(f'sidebar link "{link}" opens its page', ok)
    page.get_by_role('link', name='Dashboard', exact=True).first.click()
    ok = heading_is(page, 'Welcome to MCQ Studio')
    record('sidebar "Dashboard" returns to dashboard', ok)
    record('active nav item has aria-current=page',
           page.locator('.nav-link[aria-current="page"]').count() == 1)
    record('the active nav item is the Dashboard link itself',
           page.locator('.nav-link[aria-current="page"]').get_attribute('data-route') == 'dashboard')
    # Keyboard: needs a genuinely fresh page load (a hash change would not reproduce first-load focus)
    kctx = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = kctx.new_page(); watch(page, 'keyboard')
    page.goto(BASE + '#/dashboard'); page.wait_for_selector('#page-title')
    page.keyboard.press('Tab')
    record('keyboard: first Tab focuses the skip link', page.evaluate("document.activeElement.className") == 'skip-link')
    page.keyboard.press('Enter')
    record('keyboard: skip link moves focus to the main content', page.evaluate("document.activeElement.id") == 'view')
    record('keyboard: skip link does not change the route', page.evaluate("location.hash") == '#/dashboard')
    kctx.close()
    ctx.close()

    # ------------------------------------------------------------------ AUDIT 2b: theme
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = ctx.new_page(); watch(page, 'theme')
    page.goto(BASE + '#/settings'); page.wait_for_selector('#page-title')
    dark_bg = page.evaluate("getComputedStyle(document.body).backgroundColor")
    record('default theme is dark', page.evaluate("document.documentElement.dataset.theme") == 'dark', dark_bg)
    record('dark background is #0B0F19 (rgb 11, 15, 25)', dark_bg == 'rgb(11, 15, 25)', dark_bg)
    page.get_by_role('button', name='Light').click()
    light_bg = page.evaluate("getComputedStyle(document.body).backgroundColor")
    record('clicking Light switches data-theme to light', page.evaluate("document.documentElement.dataset.theme") == 'light')
    record('light background is #F5F7FB (rgb 245, 247, 251)', light_bg == 'rgb(245, 247, 251)', light_bg)
    record('Light button shows aria-pressed=true', page.get_by_role('button', name='Light').get_attribute('aria-pressed') == 'true')
    page.reload(); page.wait_for_selector('#page-title')
    record('light theme persists after reload (before first paint)',
           page.evaluate("document.documentElement.dataset.theme") == 'light')
    page.screenshot(path=os.path.join(SHOTS, 'settings-light.png'))
    page.get_by_role('button', name='Dark (default)').click()
    record('switching back to dark works', page.evaluate("document.documentElement.dataset.theme") == 'dark')
    ctx.close()

    # ------------------------------------------------------------------ AUDIT 2c: responsive layouts
    for w, h in [(360, 740), (390, 844), (430, 932), (768, 1024), (1024, 768), (1440, 900)]:
        ctx = browser.new_context(viewport={'width': w, 'height': h})
        page = ctx.new_page(); watch(page, f'responsive-{w}')
        page.goto(BASE + '#/dashboard'); page.wait_for_selector('#page-title')
        overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        record(f'{w}px: no horizontal scrolling', overflow <= 0, f'overflow {overflow}px')
        sidebar_w = page.evaluate("document.querySelector('.sidebar').getBoundingClientRect().width")
        if w < 768:
            record(f'{w}px: navigation becomes top bar (sidebar full width)', sidebar_w >= w - 2, f'{sidebar_w}px')
        else:
            record(f'{w}px: sidebar at side (≈ {int(sidebar_w)}px wide)', sidebar_w < w * 0.4, f'{sidebar_w}px')
        smallest = page.evaluate("Math.min(...[...document.querySelectorAll('.nav-link, .btn')].map(e => e.getBoundingClientRect().height))")
        record(f'{w}px: interactive targets at least 36px tall', smallest >= 36, f'{smallest}px')
        page.screenshot(path=os.path.join(SHOTS, f'dashboard-{w}.png'))
        ctx.close()

    # ------------------------------------------------------------------ AUDIT 3 + 4: full workflow
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = ctx.new_page(); watch(page, 'workflow')
    page.goto(BASE + '#/dashboard'); page.wait_for_selector('#page-title')
    page.get_by_role('link', name='Import questions', exact=True).first.click()
    record('dashboard "Import questions" opens Import', heading_is(page, 'Import Questions'))
    page.get_by_role('button', name='Load sample').click()
    record('Load sample fills the paste area',
           'Bangladesh' in page.input_value('#importer-input'))
    page.get_by_role('button', name='Import questions').click()
    page.wait_for_selector('#parse-status .summary')
    status = page.inner_text('#parse-status')
    record('sample import detects 2 questions', 'Detected' in status and '2' in page.locator('#parse-status .stat-value').first.inner_text(), status[:80])
    record('sample: no question needs attention', page.locator('#parse-status .stat-value').nth(2).inner_text() == '0')
    record('sample: both questions keyed (inline + answer key), 0 unkeyed', page.locator('#parse-status .stat-value').nth(3).inner_text() == '0')
    page.screenshot(path=os.path.join(SHOTS, 'import-sample-desktop.png'))

    page.get_by_role('link', name='Open question preview').click()
    page.wait_for_selector('.q-card')
    record('preview shows 2 question cards', page.locator('.q-card').count() == 2)
    record('preview shows question text from the paste',
           'capital of Bangladesh' in page.locator('.q-card textarea').first.input_value())
    ticked = page.locator('.q-card').first.locator('label.check-row:has(input:checked)')
    record('inline answer ticked in preview (Answer: B)',
           ticked.count() == 1 and ticked.first.inner_text().startswith('B.'), ticked.first.inner_text() if ticked.count() else 'none')
    page.locator('.q-card textarea').first.fill('What is the capital city of Bangladesh?')
    page.locator('.q-card textarea').first.dispatch_event('change')
    record('edited question text is kept in the editor',
           'capital city' in page.locator('.q-card textarea').first.input_value())
    page.get_by_role('button', name='Save question set').click()
    page.wait_for_selector('.notice[data-kind="success"]', timeout=5000)
    record('save question set shows success notice', 'Saved' in page.inner_text('.notice[data-kind="success"]'))
    page.reload(); page.wait_for_selector('.q-card')
    record('preview survives a page reload (IndexedDB draft)',
           page.locator('.q-card').count() == 2 and 'capital city' in page.locator('.q-card textarea').first.input_value())
    page.screenshot(path=os.path.join(SHOTS, 'preview-desktop.png'))

    # Malformed paste: expect warnings, nothing dropped
    page.goto(BASE + '#/import'); page.wait_for_selector('#importer-input')
    page.fill('#importer-input', SAMPLE_MALFORMED)
    page.get_by_role('button', name='Import questions').click()
    page.wait_for_selector('#parse-status .summary')
    record('malformed set: all 4 questions kept (none silently dropped)',
           page.locator('#parse-status .stat-value').nth(0).inner_text() == '4')
    # Expected from the input: Q2 has an answer that matches no option, Q3 has one option.
    # Q1 has no answer key at all, which is reported as unkeyed, not as an error.
    record('malformed set: attention count is 2 (Q2 bad answer, Q3 one option)',
           page.locator('#parse-status .stat-value').nth(2).inner_text() == '2',
           page.locator('#parse-status .stat-value').nth(2).inner_text())
    page.get_by_role('link', name='Open question preview').click(); page.wait_for_selector('.q-card')
    badges = page.locator('.q-card .badge').all_inner_texts()
    record('preview badges: 2 "Needs attention", 1 "No answer key", 1 "Ready"',
           badges.count('Needs attention') == 2 and badges.count('No answer key') == 1 and badges.count('Ready') == 1, str(badges))
    record('preview shows the parser warning text',
           page.locator('.q-card .warn-list li').first.count() > 0)
    page.screenshot(path=os.path.join(SHOTS, 'preview-malformed.png'))

    # Unkeyed paste
    page.goto(BASE + '#/import'); page.wait_for_selector('#importer-input')
    page.fill('#importer-input', SAMPLE_UNKEYED)
    page.get_by_role('button', name='Import questions').click()
    page.wait_for_selector('#parse-status .summary')
    record('unkeyed set: 2 questions, none need attention',
           page.locator('#parse-status .stat-value').nth(0).inner_text() == '2' and page.locator('#parse-status .stat-value').nth(2).inner_text() == '0')
    record('unkeyed set: reported as "No answer key"', page.locator('#parse-status .stat-value').nth(3).inner_text() == '2')

    # Empty paste: leave the page first so the paste area is genuinely fresh
    page.get_by_role('link', name='Dashboard', exact=True).first.click(); heading_is(page, 'Welcome to MCQ Studio')
    page.get_by_role('link', name='Import Questions', exact=True).first.click(); heading_is(page, 'Import Questions')
    page.get_by_role('button', name='Import questions').click()
    record('empty paste shows an error message', 'Paste some questions' in page.inner_text('#parse-status'))

    # Clear text
    page.fill('#importer-input', 'x'); page.get_by_role('button', name='Clear text').click()
    record('Clear text empties the paste area', page.input_value('#importer-input') == '')

    # Add / delete / move question in preview
    page.fill('#importer-input', SAMPLE_UNKEYED)
    page.get_by_role('button', name='Import questions').click(); page.wait_for_selector('#parse-status .summary')
    page.get_by_role('link', name='Open question preview').click(); page.wait_for_selector('.q-card')
    page.get_by_role('button', name='Add question').click()
    record('Add question adds a card (3 total)', page.locator('.q-card').count() == 3)
    page.once('dialog', lambda d: d.accept())   # confirm the delete
    page.locator('.q-card').nth(2).get_by_role('button', name='Delete').click()
    page.wait_for_function("() => document.querySelectorAll('.q-card').length === 2")
    record('Delete removes the card after confirmation', page.locator('.q-card').count() == 2)
    page.locator('.q-card').nth(1).get_by_role('button', name='Move up').click()
    record('Move up reorders questions', 'What is 3' in page.locator('.q-card textarea').first.input_value())
    page.locator('.q-card').first.get_by_role('button', name='Add option').click()
    before = page.locator('.q-card').first.locator('.opt-row').count()
    page.locator('.q-card').first.get_by_role('button', name='Add option').click()
    after = page.locator('.q-card').first.locator('.opt-row').count()
    record('Add option adds one option row', after == before + 1, f'{before} -> {after}')
    page.screenshot(path=os.path.join(SHOTS, 'preview-edit.png'))
    ctx.close()

    # Mobile workflow
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page(); watch(page, 'mobile-workflow')
    page.goto(BASE + '#/import'); page.wait_for_selector('#importer-input')
    page.fill('#importer-input', SAMPLE_UNKEYED)
    page.get_by_role('button', name='Import questions').click(); page.wait_for_selector('#parse-status .summary')
    page.get_by_role('link', name='Open question preview').click(); page.wait_for_selector('.q-card')
    overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    record('mobile preview: no horizontal scrolling', overflow <= 0, f'overflow {overflow}px')
    page.screenshot(path=os.path.join(SHOTS, 'preview-mobile-390.png'), full_page=False)
    ctx.close()


    # ------------------------------------------------------------------ AUDIT 3 extras: Phase 2 requirements
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = ctx.new_page(); watch(page, 'phase2-extras')
    def no_leak(label):
        text = page.inner_text('body')
        bad = [w for w in ('null', 'undefined', '[object Object]', 'NaN') if w in text.split()]
        record(f'{label}: no leaked "null"/"undefined"/"NaN" text', not bad, str(bad))

    page.goto(BASE + '#/import'); page.wait_for_selector('#importer-input')
    page.fill('#importer-input', '1. Which is correct?\n(a) first\n(b) second\nAnswer: (b)\nExplanation: Because second is right.\n\n2. Mixed style?\nA) x\nB) y\nAnswer: A')
    page.get_by_role('button', name='Import questions').click(); page.wait_for_selector('#parse-status .summary')
    record('explanation + lowercase (a)/(b) + "Answer: (b)" import', page.locator('#parse-status .stat-value').nth(0).inner_text() == '2')
    page.get_by_role('link', name='Open question preview').click(); page.wait_for_selector('.q-card')
    labels = page.locator('.q-card').first.locator('.opt-label').all_inner_texts()
    record('lowercase options shown as uppercase labels A, B', labels == ['A', 'B'], str(labels))
    ticked = page.locator('.q-card').first.locator('label.check-row:has(input:checked)').all_inner_texts()
    record('"Answer: (b)" ticked as option B', len(ticked) == 1 and ticked[0].startswith('B.'), str(ticked))
    record('explanation preserved in the preview editor',
           'Because second is right.' in page.locator('.q-card').first.locator('textarea').nth(1).input_value())
    no_leak('preview (phase 2 extras)')

    page.goto(BASE + '#/import'); page.wait_for_selector('#importer-input')
    page.fill('#importer-input', 'Question 1: X?\na) a1\nb) b1\nAnswer: a\n\nQ2. Y?\nA) a\nB) b\n\n3) Z?\nA. a\nB. b\nAnswer: A')
    page.get_by_role('button', name='Import questions').click(); page.wait_for_selector('#parse-status .summary')
    record('three numbering styles in one paste all detected (3 questions)',
           page.locator('#parse-status .stat-value').nth(0).inner_text() == '3')
    no_leak('import status')

    # Saved set must change the dashboard statistic (no hard-coded numbers)
    page.fill('#importer-input', SAMPLE_UNKEYED)
    page.get_by_role('button', name='Import questions').click(); page.wait_for_selector('#parse-status .summary')
    page.get_by_role('link', name='Open question preview').click(); page.wait_for_selector('.q-card')
    page.get_by_role('button', name='Save question set').click()
    page.wait_for_selector('.notice[data-kind="success"]')
    page.get_by_role('link', name='Dashboard', exact=True).first.click(); heading_is(page, 'Welcome to MCQ Studio')
    record('dashboard "Questions imported" reflects the saved set (2 questions)',
           page.locator('section[aria-label="Statistics"] article').nth(1).locator('.stat-value').inner_text() == '2')
    record('dashboard hides the empty state once a set is saved', page.get_by_text('No examinations yet').count() == 0)
    page.screenshot(path=os.path.join(SHOTS, 'dashboard-after-save.png'))
    no_leak('dashboard')
    favicon = page.evaluate("!!document.querySelector('link[rel=icon]')")
    record('page declares an inline favicon (no 404 request)', favicon)
    ctx.close()


    # ------------------------------------------------------------------ Security: pasted markup must never run
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = ctx.new_page(); watch(page, 'xss')
    page.goto(BASE + '#/import'); page.wait_for_selector('#importer-input')
    page.fill('#importer-input', '1. <img src=x onerror="window.__xss=1"> Q?\nA. <b>bold</b>\nB. b\nAnswer: A')
    page.get_by_role('button', name='Import questions').click(); page.wait_for_selector('#parse-status .summary')
    page.get_by_role('link', name='Open question preview').click(); page.wait_for_selector('.q-card')
    record('pasted <img onerror> did not execute', page.evaluate("window.__xss === undefined"))
    record('pasted HTML is shown as literal text in the editor',
           '<img src=x' in page.locator('.q-card textarea').first.input_value())
    record('no injected <img> element exists in the page', page.locator('.q-card img').count() == 0)
    ctx.close()


    # ------------------------------------------------------------------ Bengali real-world fixture in the UI
    fixture = open(os.path.join(os.path.dirname(__file__), '..', 'fixtures', 'bengali-real-world.txt'), encoding='utf-8').read()
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = ctx.new_page(); watch(page, 'bengali-ui')
    page.goto(BASE + '#/import'); page.wait_for_selector('#importer-input')
    page.fill('#importer-input', fixture)
    page.get_by_role('button', name='Import questions').click(); page.wait_for_selector('#parse-status .summary')
    record('Bengali fixture: 6 questions detected in the UI', page.locator('#parse-status .stat-value').nth(0).inner_text() == '6')
    record('Bengali fixture: 0 need attention', page.locator('#parse-status .stat-value').nth(2).inner_text() == '0')
    record('Bengali fixture: cleanup report lists the removed copied numbers',
           'copied artifact' in page.inner_text('#parse-status'))
    page.get_by_role('link', name='Open question preview').click(); page.wait_for_selector('.q-card')
    record('Bengali fixture: preview shows 6 question cards', page.locator('.q-card').count() == 6)
    record('Bengali fixture: shared stimulus shown on question 5', page.locator('.q-card').nth(4).locator('details summary:has-text("Shared stimulus")').count() == 1)
    record('Bengali fixture: section and difficulty shown as metadata',
           'সহজ স্তর' in page.locator('.q-card').first.inner_text())
    record('Bengali fixture: heading text is not an editable question',
           all('বহুনির্বাচনী' not in t for t in page.locator('.q-card textarea').evaluate_all('els => els.map(e => e.value)')))
    no_leak('bengali preview')
    ctx.close()

    # Manual mode: answer declarations are not used, questions must be answered by the user
    ctx = browser.new_context(viewport={'width': 1440, 'height': 900})
    page = ctx.new_page(); watch(page, 'manual-mode')
    page.goto(BASE + '#/import'); page.wait_for_selector('#importer-input')
    page.get_by_role('radio', name='Manual entry').check()
    page.fill('#importer-input', fixture)
    page.get_by_role('button', name='Import questions').click(); page.wait_for_selector('#parse-status .summary')
    page.get_by_role('link', name='Open question preview').click(); page.wait_for_selector('.q-card')
    ticked = page.locator('.q-card').first.locator('label.check-row:has(input:checked)').count()
    record('manual mode: no answer is pre-ticked', ticked == 0, str(ticked))
    record('manual mode: preview labels answers as missing',
           'Answer missing' in page.locator('.q-card').first.inner_text())
    page.locator('.q-card').first.locator('input[type=checkbox]').first.check()
    record('manual mode: ticking an answer changes its label to "Manual answer"',
           'Manual answer' in page.locator('.q-card').first.inner_text())
    ctx.close()
    ctx.close()


    # ------------------------------------------------------------------ Real persistence: close the browser completely, reopen the same profile
    import tempfile
    profile = tempfile.mkdtemp(prefix='mcqstudio-profile-')
    ctx = p.chromium.launch_persistent_context(profile, viewport={'width': 1440, 'height': 900})
    page = ctx.new_page(); watch(page, 'persist-1')
    page.goto(BASE + '#/import'); page.wait_for_selector('#importer-input')
    page.fill('#importer-input', SAMPLE_UNKEYED)
    page.get_by_role('button', name='Import questions').click(); page.wait_for_selector('#parse-status .summary')
    page.get_by_role('link', name='Open question preview').click(); page.wait_for_selector('.q-card')
    page.locator('.q-card textarea').first.fill('Persisted question text?'); page.locator('.q-card textarea').first.dispatch_event('change')
    page.get_by_role('button', name='Save question set').click(); page.wait_for_selector('.notice[data-kind="success"]')
    ctx.close()                                   # browser fully closed
    ctx = p.chromium.launch_persistent_context(profile, viewport={'width': 1440, 'height': 900})
    page = ctx.new_page(); watch(page, 'persist-2')
    page.goto(BASE + '#/dashboard'); heading_is(page, 'Welcome to MCQ Studio')
    record('IndexedDB: saved set survives closing and reopening the browser',
           page.locator('section[aria-label="Statistics"] article').nth(1).locator('.stat-value').inner_text() == '2')
    page.goto(BASE + '#/preview'); page.wait_for_selector('.q-card')
    record('IndexedDB: draft text edited before closing is still there after reopening',
           'Persisted question text?' in page.locator('.q-card textarea').first.input_value())
    ctx.close()

    # ------------------------------------------------------------------ Responsive: preview screen must not overflow sideways
    for w, h in [(360, 740), (768, 1024)]:
        ctx = browser.new_context(viewport={'width': w, 'height': h})
        page = ctx.new_page(); watch(page, f'preview-{w}')
        page.goto(BASE + '#/import'); page.wait_for_selector('#importer-input')
        page.fill('#importer-input', SAMPLE_UNKEYED)
        page.get_by_role('button', name='Import questions').click(); page.wait_for_selector('#parse-status .summary')
        page.get_by_role('link', name='Open question preview').click(); page.wait_for_selector('.q-card')
        overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        record(f'preview at {w}px: no horizontal scrolling', overflow <= 0, f'overflow {overflow}px')
        ctx.close()

    browser.close()

print('\n--- Console, page and network problems ---')
if problems:
    for p_ in sorted(set(problems)):
        print('  ' + p_)
else:
    print('  none')

passed = sum(1 for _, ok, _ in results if ok)
print(f'\nBrowser audit: {passed}/{len(results)} checks passed, {len(set(problems))} distinct console/network problems.')
json.dump({'results': results, 'problems': sorted(set(problems))}, open(os.path.join(SHOTS, 'audit-results.json'), 'w'), indent=2, ensure_ascii=False)
sys.exit(0 if passed == len(results) and not problems else 1)