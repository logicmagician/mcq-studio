/**
 * Run with:  node tests/storage-tests.js
 * No dependencies. Uses a minimal in-memory localStorage stub.
 */
import assert from 'node:assert/strict';

// --- Minimal stubs for the browser globals the module expects ---
const memory = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
  },
};

const { getSettings, saveSettings, DEFAULT_SETTINGS, SETTINGS_KEY } =
  await import('../js/storage/local-storage.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log('Settings storage tests');

test('returns defaults when nothing is stored', () => {
  memory.clear();
  assert.deepEqual(getSettings(), { ...DEFAULT_SETTINGS });
});

test('saves and reads back the theme', () => {
  memory.clear();
  const r = saveSettings({ theme: 'light' });
  assert.equal(r.ok, true);
  assert.equal(getSettings().theme, 'light');
});

test('ignores invalid theme values and keeps the default', () => {
  memory.clear();
  memory.set(SETTINGS_KEY, JSON.stringify({ theme: 'neon' }));
  assert.equal(getSettings().theme, 'dark');
});

test('recovers from corrupt JSON without throwing', () => {
  memory.clear();
  memory.set(SETTINGS_KEY, '{not json');
  assert.deepEqual(getSettings(), { ...DEFAULT_SETTINGS });
});

test('reports failure when storage refuses to write', () => {
  memory.clear();
  const original = window.localStorage.setItem;
  window.localStorage.setItem = () => { throw new Error('QuotaExceeded'); };
  try {
    const r = saveSettings({ theme: 'light' });
    assert.equal(r.ok, false);
    assert.ok(r.error.length > 0);
  } finally {
    window.localStorage.setItem = original;
  }
});

console.log(`\n${passed} tests passed.`);
