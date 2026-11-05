/**
 * DOM helpers.
 * Security rule for the whole app: user-provided text is ALWAYS inserted with
 * textContent (never innerHTML), so pasted markup can never run as code.
 */

/**
 * Create an element.
 * @param {string} tag       e.g. 'div', 'button'
 * @param {object} [attrs]   attributes; 'class' and 'text' are special keys
 * @param {Array<Node|string>} [children]
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child === undefined || child === null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Show a short, non-blocking message (accessible via aria-live region). */
export function toast(message, kind = 'info') {
  const region = document.getElementById('toast-region') || createToastRegion();
  const item = el('div', { class: 'notice', role: 'status', 'data-kind': kind, text: message });
  region.append(item);
  setTimeout(() => item.remove(), 4000);
}

function createToastRegion() {
  const region = el('div', { class: 'toast-region', id: 'toast-region', 'aria-live': 'polite' });
  document.body.append(region);
  return region;
}

/** Summary card used on the import and preview screens. */
export function statCard(label, value, note) {
  return el('article', { class: 'card' }, [
    el('p', { class: 'stat-label', text: label }),
    el('p', { class: 'stat-value', text: String(value) }),
    note ? el('p', { class: 'stat-note', text: note }) : null,
  ]);
}

/** Inline status message. kind: 'info' | 'success' | 'warning' | 'error'. */
export function notice(kind, text) {
  return el('div', { class: 'notice', role: 'status', 'data-kind': kind, text });
}
