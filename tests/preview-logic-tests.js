/**
 * Logic behind the preview screen and storage fallback. Run with:
 *   node tests/preview-logic-tests.js
 * DOM rendering is not covered here (no browser/jsdom available in the build environment).
 */
import assert from 'node:assert/strict';

// No IndexedDB in Node, so putDraft/getDraft must fall back to memory and say so.
globalThis.window = {};
const { parseMcqText } = await import('../js/parser/parser.js');
const { validateSet, summarise, deriveType } = await import('../js/parser/validator.js');
const { putDraft, getDraft } = await import('../js/storage/database.js');

let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log(`  ok    ${name}`); };
console.log('Preview logic and storage fallback tests\n');

await test('validator: unkeyed question becomes keyed after a manual answer is chosen', () => {
  const qs = parseMcqText('1. Q?\nA. a\nB. b').questions;
  assert.equal(qs[0].unkeyed, true);
  qs[0].answerLetters = ['B']; qs[0].answerSource = 'manual';
  validateSet(qs);
  assert.equal(qs[0].unkeyed, false);
  assert.equal(qs[0].status, 'ok');
});

await test('validator: adding a fourth option clears "too few options" attention', () => {
  const qs = parseMcqText('1. Q?\nA. a\nAnswer: A').questions;
  assert.equal(qs[0].status, 'attention');
  qs[0].options.push({ label: 'B', text: 'b' });
  validateSet(qs);
  assert.equal(qs[0].status, 'ok');
});

await test('validator: editing a question into a duplicate flags the later copy', () => {
  const qs = parseMcqText('1. First?\nA. a\nB. b\n2. Second?\nA. a\nB. b').questions;
  qs[1].text = 'First?';
  validateSet(qs);
  assert.equal(qs[1].status, 'attention');
  assert.ok(qs[1].warnings.some((w) => w.message.includes('Possible duplicate of question 1')));
});

await test('validator: an answer letter left pointing at a removed option is flagged', () => {
  const qs = parseMcqText('1. Q?\nA. a\nB. b\nC. c\nAnswer: C').questions;
  qs[0].options.pop(); // remove C without updating the answer
  validateSet(qs);
  assert.equal(qs[0].status, 'attention');
});

await test('deriveType: single, multi and true/false', () => {
  const single = { options: [{ text: 'x' }, { text: 'y' }], answerLetters: ['A'] };
  const multi = { options: [{ text: 'x' }, { text: 'y' }, { text: 'z' }], answerLetters: ['A', 'C'] };
  const tf = { options: [{ text: 'True' }, { text: 'False' }], answerLetters: [] };
  assert.equal(deriveType(single), 'single');
  assert.equal(deriveType(multi), 'multi');
  assert.equal(deriveType(tf), 'tf');
});

await test('summarise: counts parsed, attention and unkeyed correctly', () => {
  const r = parseMcqText('1. Ok?\nA. a\nB. b\nAnswer: A\n\n2. Unkeyed?\nA. a\nB. b\n\n3. Broken?\nA. only');
  assert.equal(r.summary.total, 3);
  assert.equal(r.summary.attention, 1);
  assert.equal(r.summary.parsed, 2);
  assert.equal(r.summary.unkeyed, 2);
});

await test('storage: without IndexedDB, draft is kept in memory and persisted=false is reported', async () => {
  const saved = await putDraft({ questions: [{ id: 'x' }], title: 'T' });
  assert.equal(saved.persisted, false);
  const back = await getDraft();
  assert.equal(back.title, 'T');
});

console.log(`\n${passed} passed.`);
