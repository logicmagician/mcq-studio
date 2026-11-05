/**
 * Bengali / mixed-language / artifact parser tests. Run with:  node tests/bengali-parser-tests.js
 * Also runs the real-world fixture (tests/fixtures/bengali-real-world.txt) as an integration test.
 * Rules under test: never invent answers, never delete meaningful numbers silently.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { parseMcqText, resolveAnswer, cleanArtifacts, toAsciiDigits } = await import('../js/parser/parser.js');
const here = dirname(fileURLToPath(import.meta.url));

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed += 1; console.log(`  ok    ${name}`); }
  catch (err) { failed += 1; console.log(`  FAIL  ${name}\n        ${err.message.split('\n')[0]}`); }
};
const warn = (q, text) => q.notes.some((n) => n.includes(text)) || q.warnings.some((w) => w.message.includes(text));

console.log('Bengali and artifact parser tests\n');

// ---- Numbering and options ------------------------------------------------
test('Bengali numbering ১. ২. ৩) and (১)', () => {
  const r = parseMcqText('১. প্রথম?\nক. a\nখ. b\nউত্তর: ক\n\n২) দ্বিতীয়?\nক. a\nখ. b\nউত্তর: খ\n\n(৩) তৃতীয়?\nক. a\nখ. b\nউত্তর: গ');
  assert.deepEqual(r.questions.map((q) => q.number), [1, 2, 3]);
  assert.deepEqual(r.questions.map((q) => q.answerLetters), [['A'], ['B'], []]);
});

test('"প্রশ্ন ১:" and "১নং প্রশ্ন" question styles', () => {
  const r = parseMcqText('প্রশ্ন ১: কোনটি?\nক. a\nখ. b\nউত্তর: খ\n\n২নং প্রশ্ন: কোনটি?\nক. a\nখ. b');
  assert.deepEqual(r.questions.map((q) => q.number), [1, 2]);
  assert.equal(r.questions[0].text, 'কোনটি?');
});

test('Bengali options ক-ঘ, and five or more options are supported', () => {
  const r = parseMcqText('১. প্রশ্ন?\nক. a\nখ. b\nগ. c\nঘ. d\nঙ. e\nউত্তর: ঙ');
  assert.deepEqual(r.questions[0].options.map((o) => o.label), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(r.questions[0].answerLetters, ['E']);
});

test('Bengali option brackets (ক) (খ) are recognised', () => {
  const r = parseMcqText('১. প্রশ্ন?\n(ক) a\n(খ) b\nউত্তর: (খ)');
  assert.deepEqual(r.questions[0].answerLetters, ['B']);
});

test('Mixed Bengali and English in one paste and in one question', () => {
  const r = parseMcqText('1. What is the value of $1011_2$?\nA. 11\nB. 13\nউত্তর: B\n\n২. বাইনারি যোগে 1 + 1 হলে ফলাফল কত?\nক. 1\nখ. 10\nউত্তর: খ');
  assert.deepEqual(r.questions.map((q) => q.number), [1, 2]);
  assert.deepEqual(r.questions.map((q) => q.answerLetters), [['B'], ['B']]);
});

test('Math, LaTeX, subscripts and Unicode are preserved exactly', () => {
  const stem = 'মান কত? $\\text{Sum} = 1$, $(28)_{10}$, ২-এর পরিপূরক (Two\'s Complement)';
  const r = parseMcqText(`১. ${stem}\nক. $x^2$\nখ. $y_1$\nউত্তর: ক`);
  assert.equal(r.questions[0].text, stem);
  assert.equal(r.questions[0].options[0].text, '$x^2$');
});

// ---- Headings and metadata ------------------------------------------------
test('Section heading and difficulty headings are not questions and become metadata', () => {
  const r = parseMcqText('৩. ২০টি বহুনির্বাচনী প্রশ্ন (MCQ)\nক. সহজ স্তর (৭টি)\n\n১. প্রশ্ন?\nক. a\nখ. b\nউত্তর: খ\n\nখ. মধ্যম স্তর (৭টি)\n\n২. প্রশ্ন দুই?\nক. a\nখ. b');
  assert.equal(r.questions.length, 2, 'headings must not become questions');
  assert.equal(r.questions[0].section, '৩. ২০টি বহুনির্বাচনী প্রশ্ন (MCQ)');
  assert.equal(r.questions[0].difficulty, 'সহজ স্তর');
  assert.equal(r.questions[1].difficulty, 'মধ্যম স্তর');
  assert.ok(r.headings.length >= 3);
});

test('English difficulty headings ("Easy Level") are recognised', () => {
  const r = parseMcqText('Easy Level\n1. Q?\nA. a\nB. b\nAnswer: A');
  assert.equal(r.questions[0].difficulty, 'Easy Level');
});

// ---- Answers --------------------------------------------------------------
test('Bengali inline answer with full option text: "উত্তর: (খ) ১-এর পরিপূরক"', () => {
  const r = parseMcqText('১. প্রশ্ন?\nক. ২-এর পরিপূরক\nখ. ১-এর পরিপূরক\nউত্তর: (খ) ১-এর পরিপূরক');
  assert.deepEqual(r.questions[0].answerLetters, ['B']);
  assert.equal(r.questions[0].answerStatus, 'extracted');
});

test('Bengali answer-key list "১. খ / ২. গ" is recognised', () => {
  const r = parseMcqText('১. প্রথম?\nক. a\nখ. b\n\n২. দ্বিতীয়?\nক. a\nখ. b\nগ. c\n\nউত্তরমালা:\n১. খ\n২. গ');
  assert.deepEqual(r.questions.map((q) => q.answerLetters), [['B'], ['C']]);
  assert.equal(r.questions[0].answerSource, 'key');
});

test('Inline answer and key that agree are accepted; disagreeing answers are a conflict', () => {
  const agree = parseMcqText('1. Q?\nA. a\nB. b\nAnswer: B\n\nAnswer Key:\n1. B');
  assert.deepEqual(agree.questions[0].answerLetters, ['B']);
  const clash = parseMcqText('1. Q?\nA. a\nB. b\nAnswer: B\n\nAnswer Key:\n1. A');
  assert.deepEqual(clash.questions[0].answerLetters, []);
  assert.equal(clash.questions[0].answerStatus, 'conflicting');
});

test('Answer text that matches no option is "unmatched", never invented', () => {
  const r = parseMcqText('১. প্রশ্ন?\nক. a\nখ. b\nউত্তর: গ');
  assert.deepEqual(r.questions[0].answerLetters, []);
  assert.equal(r.questions[0].answerStatus, 'unmatched');
});

test('Missing answer is "missing" and keeps the question usable', () => {
  const r = parseMcqText('১. প্রশ্ন?\nক. a\nখ. b');
  assert.equal(r.questions[0].answerStatus, 'missing');
  assert.equal(r.questions[0].status, 'ok');
});

test('An ordinary "উত্তর" inside a question is NOT an answer declaration', () => {
  const r = parseMcqText('১. এই প্রশ্নের উত্তর কী?\nক. a\nখ. b');
  assert.equal(r.questions[0].answerInline ?? null, null);
  assert.equal(r.questions[0].answerStatus, 'missing');
  assert.equal(r.questions[0].text, 'এই প্রশ্নের উত্তর কী?');
});

test('Multi-select answers in Bengali: "ক ও গ"', () => {
  const r = parseMcqText('১. কোনগুলো জোড়?\nক. 2\nখ. 3\nগ. 4\nউত্তর: ক ও গ');
  assert.deepEqual(r.questions[0].answerLetters, ['A', 'C']);
  assert.equal(r.questions[0].type, 'multi');
});

test('resolveAnswer: Bengali letter, Bengali bracket, and invalid letter', () => {
  const opts = [{ label: 'A', text: 'x' }, { label: 'B', text: 'y' }];
  assert.deepEqual(resolveAnswer('খ', opts).letters, ['B']);
  assert.deepEqual(resolveAnswer('(ক)', opts).letters, ['A']);
  assert.ok(resolveAnswer('ঘ', opts).issue, 'option D does not exist');
});

// ---- Explanations ---------------------------------------------------------
test('Bengali explanation "ব্যাখ্যা:" is kept, not added to text or options', () => {
  const r = parseMcqText('১. প্রশ্ন?\nক. a\nখ. b\nউত্তর: খ\nব্যাখ্যা: কারণ এটি সঠিক।\n\n২. অন্য?\nক. a\nখ. b');
  assert.equal(r.questions[0].explanation, 'কারণ এটি সঠিক।');
  assert.equal(r.questions[0].options.length, 2);
  assert.ok(!r.questions[0].text.includes('কারণ'));
});

// ---- Artifacts ------------------------------------------------------------
test('Repeated trailing number (copied artifact) is removed and reported', () => {
  const r = parseMcqText('১. কত?14\nক. a\nখ. b\nউত্তর: খ14');
  assert.equal(r.questions[0].text, 'কত?');
  assert.equal(r.questions[0].options[1].text, 'b');
  assert.ok(r.cleanupReport.length >= 2);
  assert.ok(r.cleanupReport.every((c) => c.reason.includes('repeated')));
});

test('A single trailing number is KEPT and flagged for review (may be real content)', () => {
  const r = parseMcqText('১. বিভাগ 10x2?\nক. a\nখ. b\nউত্তর: খ');
  assert.ok(r.questions[0].text.endsWith('10x2?'), 'must not remove it');
  assert.equal(r.cleanupReport.length, 0);
  assert.ok(warn(r.questions[0], 'may be a copied artifact'));
});

test('Legitimate numbers with spaces are never touched', () => {
  const r = parseMcqText('1. What is 2 + 2 = 4?\nA. 3\nB. 4\nAnswer: B');
  assert.equal(r.questions[0].text, 'What is 2 + 2 = 4?');
  assert.equal(r.cleanupReport.length, 0);
});

test('"more_horiz" UI labels are removed and reported', () => {
  const r = parseMcqText('১. প্রশ্ন?more_horiz\nক. a\nখ. b\nউত্তর: খ\n5more_horiz');
  assert.ok(!r.questions[0].text.includes('more_horiz'));
  assert.ok(r.cleanupReport.some((c) => c.reason.includes('more_horiz')));
});

test('Standalone page-number lines are removed and reported', () => {
  const { lines, report } = cleanArtifacts(['১. প্রশ্ন?', 'ক. a', 'খ. b', '', '14', '', '২. দ্বিতীয়?']);
  assert.equal(lines[4], '');
  assert.ok(report.some((c) => c.reason.includes('page number')));
});

test('Option lines are never altered by artifact cleanup', () => {
  const { lines } = cleanArtifacts(['১. q?', 'ক. আমি 2', 'খ. আমি 2', 'উত্তর: ক']);
  assert.equal(lines[1], 'ক. আমি 2');
  assert.equal(lines[2], 'খ. আমি 2');
});

test('Bengali digits convert to ASCII only where a number is needed', () => {
  assert.equal(toAsciiDigits('১৯ ও ২০'), '19 ও 20');
});

// ---- Stimulus and multi-statement -----------------------------------------
test('Shared stimulus attaches to the referenced questions only, and is not a question', () => {
  const r = parseMcqText([
    'উদ্দীপকটি পড়ে ১ ও ২ নম্বর প্রশ্নের উত্তর দাও:',
    'সোহান একটি সমস্যা সমাধান করছে।',
    '১. প্রশ্ন এক?', 'ক. a', 'খ. b', 'উত্তর: ক', '',
    '২. প্রশ্ন দুই?', 'ক. a', 'খ. b', 'উত্তর: খ', '',
    '৩. প্রশ্ন তিন (উদ্দীপক নেই)?', 'ক. a', 'খ. b',
  ].join('\n'));
  assert.equal(r.questions.length, 3);
  assert.ok(r.questions[0].stimulus.includes('সোহান'));
  assert.ok(r.questions[1].stimulus.includes('সোহান'));
  assert.equal(r.questions[2].stimulus, null);
});

test('Multi-statement i/ii/iii stays inside the question stem', () => {
  const r = parseMcqText('১৫. সুবিধা কী?\ni. প্রথম\nii. দ্বিতীয়\niii. তৃতীয়\nনিচের কোনটি সঠিক?\nক. i ও ii\nখ. i ও iii\nউত্তর: ক');
  assert.equal(r.questions.length, 1);
  assert.ok(r.questions[0].text.includes('ii. দ্বিতীয়'));
  assert.equal(r.questions[0].options.length, 2);
});

// ---- Manual answer mode ---------------------------------------------------
test('Manual mode ignores answer declarations and marks answers missing', () => {
  const r = parseMcqText('১. প্রশ্ন?\nক. a\nখ. b\nউত্তর: খ\nব্যাখ্যা: কারণ।\n\nAnswer Key:\n1. B', { mode: 'manual' });
  assert.deepEqual(r.questions[0].answerLetters, []);
  assert.equal(r.questions[0].answerStatus, 'missing');
  assert.equal(r.questions[0].explanation, 'কারণ।', 'explanations are still kept');
  assert.ok(r.globalNotes.some((n) => n.includes('manual')));
});

// ---- Integration: the real-world fixture ----------------------------------
test('Real-world fixture: 6 questions, correct answers, explanations, stimulus, no artifacts', () => {
  const r = parseMcqText(readFileSync(join(here, 'fixtures', 'bengali-real-world.txt'), 'utf8'));
  assert.deepEqual(r.questions.map((q) => q.number), [1, 2, 8, 15, 19, 20]);
  assert.deepEqual(r.questions.map((q) => q.answerLetters[0]), ['B', 'B', 'C', 'A', 'B', 'C']);
  assert.equal(r.summary.keyed, 6);
  assert.equal(r.summary.attention, 0);
  assert.ok(r.questions[2].explanation.includes('১-এর পরিপূরক'));
  assert.ok(r.questions[4].stimulus.includes('সোহান'));
  assert.equal(r.questions[5].stimulus, r.questions[4].stimulus);
  assert.ok(r.questions.every((q) => !/বহুনির্বাচনী|স্তর/.test(q.text)), 'no heading text in questions');
  assert.ok(r.questions.every((q) => !/\?\d|\$\d+$/.test(q.text)), 'no artifacts left in question text');
  assert.equal(r.cleanupReport.length, 7, 'every removed artifact is reported');
});

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) process.exitCode = 1;
