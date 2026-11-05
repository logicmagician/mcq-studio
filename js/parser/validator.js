/**
 * Validation for parsed and edited questions.
 * This is the ONLY place warnings are created, so the import summary and the
 * preview always show the same messages.
 *   attention = needs fixing before the exam is reliable
 *   info      = for awareness only (e.g. no answer key)
 * The validator never changes answers.
 */
import { norm } from '../utils/text.js';

/** Question type from its options and answers. */
export function deriveType(q) {
  const t = q.options.map((o) => norm(o.text));
  if (q.options.length === 2 && t[0] === 'true' && t[1] === 'false') return 'tf';
  return q.answerLetters.length > 1 ? 'multi' : 'single';
}

/** Validate every question in place and return the same array. */
export function validateSet(questions) {
  const firstSeen = new Map(); // normalised text -> index of first occurrence

  questions.forEach((q, index) => {
    const w = [];
    const attention = (message) => w.push({ level: 'attention', message });
    const info = (message) => w.push({ level: 'info', message });
    const labels = q.options.map((o) => o.label);

    if (!norm(q.text)) attention('The question text is empty.');
    if (q.options.length < 2) attention(`Only ${q.options.length} option(s) found. Add at least two options.`);
    const blank = q.options.filter((o) => !norm(o.text)).length;
    if (blank) attention(`${blank} option(s) have no text.`);
    if (new Set(labels).size !== labels.length) attention('Two options use the same letter.');
    if (q.answerIssue) attention(q.answerIssue);
    const bad = q.answerLetters.filter((l) => !labels.includes(l));
    if (bad.length) attention(`Answer ${bad.join(', ')} is not one of the options.`);
    if (!q.answerLetters.length && !q.answerIssue) info('No answer key. This question will not be scored automatically.');
    if (q.optionsGenerated) info('True/False options were generated from the question text.');
    q.notes.forEach((n) => info(n));

    const key = norm(q.text);
    if (key) {
      if (firstSeen.has(key)) attention(`Possible duplicate of question ${firstSeen.get(key) + 1}.`);
      else firstSeen.set(key, index);
    }

    q.warnings = w;
    q.status = w.some((x) => x.level === 'attention') ? 'attention' : 'ok';
    q.unkeyed = q.answerLetters.length === 0;
    q.type = deriveType(q);
  });
  return questions;
}

/** Counts for the summary cards. "parsed" means no attention items. */
export function summarise(questions) {
  let attention = 0;
  let unkeyed = 0;
  for (const q of questions) {
    if (q.status === 'attention') attention += 1;
    if (q.unkeyed) unkeyed += 1;
  }
  return {
    total: questions.length,
    parsed: questions.length - attention,
    attention,
    unkeyed,
    keyed: questions.length - unkeyed,
  };
}
