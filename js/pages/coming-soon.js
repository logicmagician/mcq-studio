import { el } from '../utils/helpers.js';

/**
 * Honest placeholder for screens built in later phases.
 * It states the phase, so nothing looks broken or pretends to work.
 */
export function renderComingSoon(root, { title, phase, description }) {
  root.replaceChildren(
    el('header', { class: 'page-head' }, [
      el('h1', { id: 'page-title', tabindex: '-1', text: title }),
    ]),
    el('section', { class: 'card empty' }, [
      el('h3', { text: `Scheduled for ${phase}` }),
      el('p', { text: description }),
      el('a', { class: 'btn btn-ghost', href: '#/dashboard', text: 'Back to dashboard' }),
    ]),
  );
}
