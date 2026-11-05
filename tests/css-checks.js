/**
 * CSS architecture checks. Run with:  node tests/css-checks.js
 * Verifies the source, not a browser:
 *  1. every class used in JavaScript has a CSS rule
 *  2. every var(--token) used is defined in variables.css
 *  3. no colour literals outside variables.css
 *  4. no inline style attributes in JavaScript
 *  5. every stylesheet linked by index.html exists, and braces balance
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

const cssFiles = walk('css').filter((f) => f.endsWith('.css'));
const cssAll = cssFiles.map(read).join('\n');
const jsFiles = walk('js').filter((f) => f.endsWith('.js'));
const jsAll = jsFiles.map(read).join('\n');
let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log(`  ok    ${name}`); };

console.log('CSS architecture checks\n');

check('every class used in JavaScript has a matching CSS rule', () => {
  const used = new Set();
  for (const m of jsAll.matchAll(/class:\s*'([^']+)'/g)) m[1].split(/\s+/).forEach((c) => used.add(c));
  // 'opt-add' is a JavaScript focus hook (preview.js moves focus to it); it is not styled.
  const HOOKS = new Set(['opt-add']);
  const missing = [...used].filter((c) => !HOOKS.has(c) && !new RegExp(`\\.${c}(?![\\w-])`).test(cssAll));
  assert.deepEqual(missing, [], `classes with no CSS rule: ${missing.join(', ')}`);
});

check('every var(--token) used is defined in variables.css', () => {
  const defined = new Set([...read('css/variables.css').matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...cssAll.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1]));
  const undefinedTokens = [...used].filter((t) => !defined.has(t));
  assert.deepEqual(undefinedTokens, [], `undefined tokens: ${undefinedTokens.join(', ')}`);
});

check('no colour literals outside variables.css (hex, rgb, hsl)', () => {
  const offenders = cssFiles.filter((f) => f !== 'css/variables.css').flatMap((f) =>
    [...read(f).matchAll(/#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(/g)].map((m) => `${f}: ${m[0]}`));
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

check('no inline style attributes in JavaScript', () => {
  const hits = jsFiles.filter((f) => /\bstyle\s*:/.test(read(f)));
  assert.deepEqual(hits, [], `inline styles in: ${hits.join(', ')}`);
});

check('every stylesheet linked by index.html exists, and braces balance in all CSS', () => {
  const html = read('index.html');
  const links = [...html.matchAll(/href="(css\/[^"]+\.css)"/g)].map((m) => m[1]);
  assert.ok(links.length >= 6, 'expected several stylesheets linked');
  for (const l of links) assert.doesNotThrow(() => read(l), `missing ${l}`);
  for (const f of cssFiles) {
    const s = read(f);
    assert.equal(s.split('{').length, s.split('}').length, `unbalanced braces in ${f}`);
  }
  // Every CSS file on disk is linked (no orphaned stylesheet)
  const orphans = cssFiles.filter((f) => !links.includes(f));
  assert.deepEqual(orphans, [], `not linked from index.html: ${orphans.join(', ')}`);
});

console.log(`\n${passed} CSS checks passed.`);
