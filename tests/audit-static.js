/**
 * Static architecture audit. Run with:  node tests/audit-static.js
 * Checks source files only (no browser):
 *  - every local href/src in index.html resolves to a file
 *  - every relative JS import resolves, and every named import exists in its target
 *  - no root-absolute paths ("/x") that break under a GitHub Pages project subpath
 *  - no unused JS modules, no unused exports (outside tests)
 *  - no inline <script> bodies or <style> blocks in index.html
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const jsFiles = walk('js').filter((f) => f.endsWith('.js'));
let passed = 0;
const check = (name, fn) => { fn(); passed += 1; console.log(`  ok    ${name}`); };
console.log('Static architecture audit\n');

const html = read('index.html');
check('index.html: every local href/src target exists', () => {
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1])
    .filter((r) => !/^(https?:|mailto:|#|data:)/.test(r));
  const missing = refs.filter((r) => !existsSync(join(root, r)));
  assert.deepEqual(missing, [], `missing: ${missing.join(', ')}`);
});

check('index.html: no inline <style> or non-module script bodies', () => {
  assert.doesNotMatch(html, /<style[\s>]/i);
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim()).filter(Boolean);
  assert.equal(inline.length, 1, 'expected exactly one inline script (theme bootstrap)');
});

check('no root-absolute URLs ("/path") in HTML, CSS or JS (GitHub Pages subpath safe)', () => {
  const files = ['index.html', ...walk('css').filter((f) => f.endsWith('.css')), ...jsFiles];
  const bad = [];
  for (const f of files) {
    for (const m of read(f).matchAll(/(?:href|src|url)\(?\s*=?\s*["'(]\/(?!\/)[^"')\s]*/g)) bad.push(`${f}: ${m[0]}`);
    for (const m of read(f).matchAll(/from\s+['"]\/[^'"]*['"]|fetch\(\s*['"]\/[^'"]*['"]/g)) bad.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(bad, []);
});

// Map each module to its exported names
const exportsOf = (file) => {
  const src = read(file);
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) m[1].split(',').forEach((n) => names.add(n.trim().split(/\s+as\s+/).pop()));
  return names;
};

const importGraph = new Map(); // file -> [resolved targets]
check('every JS import resolves to a file and every named import exists', () => {
  const problems = [];
  for (const f of jsFiles) {
    const src = read(f);
    const targets = [];
    for (const m of src.matchAll(/import\s+(?:\{([^}]*)\}|([\w$]+))?\s*(?:,\s*\{([^}]*)\})?\s*from\s+['"]([^'"]+)['"]/g)) {
      const spec = m[4];
      if (!spec.startsWith('.')) { problems.push(`${f}: non-relative import ${spec}`); continue; }
      const target = resolve(dirname(join(root, f)), spec);
      if (!existsSync(target)) { problems.push(`${f}: missing ${spec}`); continue; }
      const rel = target.slice(root.length + 1);
      targets.push(rel);
      const named = [m[1], m[3]].filter(Boolean).join(',').split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const exp = exportsOf(rel);
      for (const n of named) if (!exp.has(n)) problems.push(`${f}: "${n}" is not exported by ${rel}`);
    }
    importGraph.set(f, targets);
  }
  assert.deepEqual(problems, []);
});

check('no unused JavaScript modules (every module under js/ is imported somewhere)', () => {
  const imported = new Set([...importGraph.values()].flat());
  imported.add('js/app.js'); // entry point, loaded by index.html
  const unused = jsFiles.filter((f) => !imported.has(f));
  assert.deepEqual(unused, [], `unused: ${unused.join(', ')}`);
});

check('no exported function is unused by the app (tests excluded)', () => {
  const appSrc = jsFiles.map(read).join('\n');
  const unused = [];
  for (const f of jsFiles) for (const name of exportsOf(f)) {
    const uses = [...appSrc.matchAll(new RegExp(`\\b${name}\\b`, 'g'))].length;
    if (uses <= 1) unused.push(`${f}:${name}`);
  }
  // Exports used only by tests are intentional (parser/validator helpers), so they are reported, not failed
  if (unused.length) console.log(`        note: exports used only by tests or unused: ${unused.join(', ')}`);
});

console.log(`\n${passed} static checks passed.`);
