/**
 * MCQ Studio entry point.
 * Hash-based routing (#/dashboard, #/settings, ...) so it works on GitHub Pages
 * project subpaths with no server rewrites and no page reloads between screens.
 */
import { getSettings } from './storage/local-storage.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderSettings, applyTheme } from './pages/settings.js';
import { renderComingSoon } from './pages/coming-soon.js';
import { renderImporter } from './pages/importer.js';
import { renderPreview } from './pages/preview.js';
import { el } from './utils/helpers.js';

// Route table. Each entry renders into the main view.
const ROUTES = {
  dashboard: renderDashboard,
  settings: renderSettings,
  import: renderImporter,
  preview: renderPreview,
  configure: (root) => renderComingSoon(root, {
    title: 'Exam Setup', phase: 'Phase 3',
    description: 'Duration, question count, marking and randomisation settings.',
  }),
  exam: (root) => renderComingSoon(root, {
    title: 'Examination Room', phase: 'Phase 3',
    description: 'The timed exam interface with navigation, marking for review and auto-submit.',
  }),
  results: (root) => renderComingSoon(root, {
    title: 'Results', phase: 'Phase 4',
    description: 'Scores, answer review and export.',
  }),
  history: (root) => renderComingSoon(root, {
    title: 'Examination History', phase: 'Phase 4',
    description: 'Saved attempts, retakes and deletion.',
  }),
};

const DEFAULT_ROUTE = 'dashboard';

function currentRouteName() {
  const name = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES[name] ? name : DEFAULT_ROUTE;
}

/**
 * Render the current route.
 * @param {boolean} moveFocus  true on in-app navigation (so screen readers hear the new page);
 *                              false on first load, so the skip link stays the first Tab stop.
 */
function render(moveFocus = true) {
  const name = currentRouteName();
  const view = document.getElementById('view');

  // Mark the active nav link for keyboard and screen-reader users
  document.querySelectorAll('.nav-link').forEach((link) => {
    if (link.dataset.route === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  // Pages may load data asynchronously, so update the title and focus after they finish
  Promise.resolve(ROUTES[name](view))
    .catch((err) => {
      console.error('[MCQ Studio] Page failed to load.', err);
      view.replaceChildren(el('p', { class: 'notice', 'data-kind': 'error', role: 'status', text: 'This page could not be loaded. Try refreshing.' }));
    })
    .then(() => {
      document.title = `${document.getElementById('page-title')?.textContent || 'MCQ Studio'} · MCQ Studio`;
      view.scrollTo({ top: 0 });
      if (moveFocus) document.getElementById('page-title')?.focus({ preventScroll: true });
    });
}

function init() {
  // Apply the saved theme (the inline head script already set it before paint;
  // this keeps the meta theme-color in sync too).
  applyTheme(getSettings().theme);

  window.addEventListener('hashchange', () => render(true));

  // Skip link moves focus to the content without changing the route hash
  document.querySelector('.skip-link')?.addEventListener('click', (event) => {
    event.preventDefault();
    document.getElementById('view')?.focus();
  });

  render(false);
}

init();
