/**
 * Parser tests. Run with:  node tests/parser-tests.js
 * No dependencies. Each case is a real pasted format; expectations describe what
 * a careful human would extract, and what must be flagged rather than guessed.
 */
import assert from 'node:assert/strict';

const { parseMcqText, resolveAnswer } = await import('../js/parser/parser.js');

let passed = 0;
let failed = 0;
const test = (name, fn) => {
  try { fn(); passed += 1; console.log(`  ok    ${name}`); }
  catch (err) { failed += 1; console.log(`  FAIL  ${name}\n        ${err.message.split('\n')[0]}`); }
};
const warns = (q, text) => q.warnings.some((w) => w.message.includes(text));

console.log('MCQ parser tests\n');

// ---- Formats from the spec ---------------------------------------------

test('Format 1: "1." questions, A-D options, inline "Answer: B"', () => {
  const r = parseMcqText([
    '1. What is the capital of Bangladesh?',
    'A. Chittagong', 'B. Dhaka', 'C. Sylhet', 'D. Rajshahi',
    'Answer: B',
  ].join('\n'));
  const q = r.questions[0];
  assert.equal(r.questions.length, 1);
  assert.equal(q.text, 'What is the capital of Bangladesh?');
  assert.deepEqual(q.options.map((o) => o.label), ['A', 'B', 'C', 'D']);
  assert.deepEqual(q.answerLetters, ['B']);
  assert.equal(q.answerSource, 'inline');
  assert.equal(q.status, 'ok');
});

test('Format 2: "Q1." questions, lowercase (a)-(d), full-text "Correct Answer:"', () => {
  const r = parseMcqText([
    'Q1. Which programming language is used for AI?', '',
    '(a) Python', '(b) HTML', '(c) CSS', '(d) XML', '',
    'Correct Answer: Python',
  ].join('\n'));
  const q = r.questions[0];
  assert.deepEqual(q.options.map((o) => o.label), ['A', 'B', 'C', 'D']);
  assert.deepEqual(q.answerLetters, ['A'], 'full option text must map to its letter');
});

test('Format 3: separate "Answer Key:" with indented options', () => {
  const r = parseMcqText([
    '1. What is 5 + 5?',
    '    A. 5', '    B. 10', '    C. 15', '    D. 20',
    '2. Which is an operating system?',
    '    A. Python', '    B. Linux', '    C. HTML', '    D. SQL',
    '', 'Answer Key:', '', '1. B', '2. B',
  ].join('\n'));
  assert.equal(r.questions.length, 2);
  assert.deepEqual(r.questions.map((q) => q.answerLetters), [['B'], ['B']]);
  assert.equal(r.questions[0].answerSource, 'key');
  assert.equal(r.questions[1].status, 'ok');
});

test('Format 4: "Question 1:" with "Correct answer: A" and ✅ emoji', () => {
  const r = parseMcqText([
    'Question 1: Which gate produces an output of 1 only when all inputs are 1?', '',
    'A) AND', 'B) OR', 'C) NOT', 'D) XOR', '',
    '✅ Correct answer: A',
  ].join('\n'));
  assert.equal(r.questions[0].number, 1);
  assert.deepEqual(r.questions[0].answerLetters, ['A']);
});

// ---- Numbering and option styles -------------------------------------

test('Mixed numbering styles: "Question 1:", "Q2.", "3)"', () => {
  const r = parseMcqText([
    'Question 1: X?', 'a) a1', 'b) b1', 'Answer: a', '',
    'Q2. Y?', 'A) a', 'B) b', 'Answer: B', '',
    '3) Z?', 'A. a', 'B. b', 'Answer: A',
  ].join('\n'));
  assert.deepEqual(r.questions.map((q) => q.number), [1, 2, 3]);
  assert.deepEqual(r.questions.map((q) => q.answerLetters[0]), ['A', 'B', 'A']);
});

test('Headerless answer key at the end ("1. B" lines)', () => {
  const r = parseMcqText([
    '1. Q1?', 'A. a', 'B. b', '2. Q2?', 'A. c', 'B. d', '', '1. B', '2. A',
  ].join('\n'));
  assert.deepEqual(r.questions.map((q) => q.answerLetters), [['B'], ['A']]);
});

test('"Answer Key:" with items on one line', () => {
  const r = parseMcqText('1. Q1?\nA. a\nB. b\n2. Q2?\nA. c\nB. d\nAnswer Key: 1. B 2. A');
  assert.deepEqual(r.questions.map((q) => q.answerLetters), [['B'], ['A']]);
});

test('Markdown: headings, bold, bullets and "**Answer:**"', () => {
  const r = parseMcqText('## 1. **What is X?**\n\n- **A.** one\n- **B.** two\n\n**Answer:** B');
  const q = r.questions[0];
  assert.equal(q.text, 'What is X?');
  assert.deepEqual(q.options.map((o) => o.text), ['one', 'two']);
  assert.deepEqual(q.answerLetters, ['B']);
});

test('CRLF line endings, non-breaking spaces and tabs', () => {
  const r = parseMcqText('1.\u00A0Q?\r\nA. a\r\nB. b\r\nAnswer: B\r\n');
  assert.equal(r.questions[0].text, 'Q?');
  assert.deepEqual(r.questions[0].answerLetters, ['B']);
});

test('"Answer: B) Dhaka" resolves to letter B', () => {
  const r = parseMcqText('1. Capital?\nA. Chittagong\nB. Dhaka\nAnswer: B) Dhaka');
  assert.deepEqual(r.questions[0].answerLetters, ['B']);
  assert.equal(r.questions[0].status, 'ok');
});

test('Questions without numbers are numbered automatically and noted', () => {
  const r = parseMcqText('What is 1+1?\nA. 1\nB. 2\nAnswer: B\n\nWhat is 2+2?\nA. 3\nB. 4');
  assert.equal(r.questions.length, 2);
  assert.deepEqual(r.questions.map((q) => q.number), [1, 2]);
  assert.ok(r.questions[0].notes.some((n) => n.includes('numbered automatically')));
});

// ---- Answer handling -------------------------------------------------

test('Multi-select "Answer: A, C" and "A and C"', () => {
  const r = parseMcqText([
    '1. Which are prime?', 'A. 2', 'B. 4', 'C. 3', 'D. 9', 'Answer: A, C', '',
    '2. Which are even?', 'A. 2', 'B. 3', 'C. 4', 'Answer: A and C',
  ].join('\n'));
  assert.deepEqual(r.questions[0].answerLetters, ['A', 'C']);
  assert.equal(r.questions[0].type, 'multi');
  assert.deepEqual(r.questions[1].answerLetters, ['A', 'C']);
});

test('True/False question gets True/False options when the text asks for them', () => {
  const r = parseMcqText('1. The sky is blue. True or False?\n\nAnswer: True');
  const q = r.questions[0];
  assert.deepEqual(q.options.map((o) => o.text), ['True', 'False']);
  assert.deepEqual(q.answerLetters, ['A']);
  assert.equal(q.type, 'tf');
  assert.equal(q.optionsGenerated, true);
});

test('Inline and key answers that disagree are a conflict, not a guess', () => {
  const r = parseMcqText('1. Q?\nA. a\nB. b\nAnswer: A\n\nAnswer Key:\n1. B');
  const q = r.questions[0];
  assert.deepEqual(q.answerLetters, []);
  assert.ok(q.answerIssue.includes('conflicts'));
  assert.equal(q.status, 'attention');
});

test('Answer text that matches no option is flagged, never invented', () => {
  const r = parseMcqText('1. Q?\nA. Dhaka\nB. Sylhet\nAnswer: Pune');
  const q = r.questions[0];
  assert.deepEqual(q.answerLetters, []);
  assert.ok(q.answerIssue.includes('does not match any option'));
  assert.equal(q.status, 'attention');
  assert.equal(q.unkeyed, true);
});

test('Answer letter outside the options is flagged', () => {
  const r = parseMcqText('1. Q?\nA. a\nB. b\nAnswer: E');
  assert.deepEqual(r.questions[0].answerLetters, []);
  assert.ok(warns(r.questions[0], 'not one of the options'));
});

test('Answer key entry for a missing question is reported, not silently dropped', () => {
  const r = parseMcqText('1. Q?\nA. a\nB. b\nAnswer Key:\n9. C');
  assert.ok(r.globalNotes.some((n) => n.includes('no question 9')));
});

test('resolveAnswer: single letter, full text, and unknown text', () => {
  const opts = [{ label: 'A', text: 'Python' }, { label: 'B', text: 'HTML' }];
  assert.deepEqual(resolveAnswer('b', opts).letters, ['B']);
  assert.deepEqual(resolveAnswer('python', opts).letters, ['A']);
  assert.deepEqual(resolveAnswer('Rust', opts).letters, []);
  assert.ok(resolveAnswer('Rust', opts).issue);
});

// ---- Explanations and layout -----------------------------------------

test('Multi-line explanation is kept until a blank line', () => {
  const r = parseMcqText('1. Q?\nA. a\nB. b\nAnswer: A\nExplanation: first line\ncontinues here.\n\n2. R?\nA. x\nB. y');
  assert.ok(r.questions[0].explanation.includes('first line'));
  assert.ok(r.questions[0].explanation.includes('continues here.'));
  assert.equal(r.questions[1].explanation, '');
});

test('Wrapped option line is joined to its option, with a note', () => {
  const r = parseMcqText('1. Q?\nA. a long\ncontinuation\nB. b\nAnswer: A');
  assert.equal(r.questions[0].options[0].text, 'a long continuation');
  assert.ok(r.questions[0].notes.some((n) => n.includes('wrapped')));
});

test('Text before the first question is kept as a note', () => {
  const r = parseMcqText('Here are your questions:\n1. Q?\nA. a\nB. b');
  assert.equal(r.questions.length, 1);
  assert.ok(r.globalNotes.some((n) => n.includes('Here are your questions')));
});

// ---- Unkeyed, malformed, duplicate ----------------------------------

test('Questions without any answer key are unkeyed, not failed', () => {
  const r = parseMcqText('1. Q?\nA. x\nB. y');
  const q = r.questions[0];
  assert.deepEqual(q.answerLetters, []);
  assert.equal(q.unkeyed, true);
  assert.equal(q.status, 'ok');
  assert.ok(warns(q, 'No answer key'));
  assert.equal(r.summary.unkeyed, 1);
});

test('Missing options: question is kept and flagged for attention', () => {
  const r = parseMcqText('1. Q?\nA. only one\nAnswer: A');
  assert.equal(r.questions.length, 1, 'must not discard the question');
  assert.equal(r.questions[0].status, 'attention');
  assert.ok(warns(r.questions[0], 'Only 1 option'));
});

test('Duplicate questions are both kept and the repeat is flagged', () => {
  const r = parseMcqText('1. Same question?\nA. a\nB. b\n2. Same question?\nA. a\nB. b');
  assert.equal(r.questions.length, 2);
  assert.ok(warns(r.questions[1], 'Possible duplicate of question 1'));
});

test('Empty input returns no questions and a clear note', () => {
  const r = parseMcqText('   \n  ');
  assert.equal(r.questions.length, 0);
  assert.ok(r.globalNotes[0].includes('No text was pasted'));
});

test('Text with no recognisable question returns none, with guidance', () => {
  const r = parseMcqText('Just some random sentence without structure.');
  assert.equal(r.questions.length, 0);
  assert.ok(r.globalNotes.some((n) => n.includes('No questions were found')));
});

test('Question text with HTML is kept as plain text (no code execution path)', () => {
  const r = parseMcqText('1. <img src=x onerror=alert(1)> What?\nA. <b>a</b>\nB. b');
  assert.ok(r.questions[0].text.includes('<img'));
  assert.equal(r.questions[0].options[0].text, '<b>a</b>');
});

// ---- Scale -----------------------------------------------------------

test('Stress: 1000 questions parse completely and quickly', () => {
  const lines = [];
  for (let n = 1; n <= 1000; n += 1) lines.push(`${n}. Question number ${n}?`, `A. a${n}`, `B. b${n}`, `Answer: A`, '');
  const start = Date.now();
  const r = parseMcqText(lines.join('\n'));
  const ms = Date.now() - start;
  assert.equal(r.questions.length, 1000);
  assert.equal(r.summary.keyed, 1000);
  assert.ok(ms < 2000, `took ${ms} ms`);
  console.log(`        (1000 questions parsed in ${ms} ms)`);
});

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) process.exitCode = 1;
