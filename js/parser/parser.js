/**
 * MCQ parser. Pure logic (no DOM), testable in Node.
 * Pipeline: normalise -> clean copied artifacts -> split off answer key ->
 *           walk lines (headings, stimulus, questions, options, answers, explanations)
 *           -> resolve answers -> validate.
 * Rules: never invent an answer. Uncertain artifacts are kept and flagged, never silently deleted.
 * Supports English and Bengali digits (০-৯), option letters (ক-জ), and labels (উত্তর, ব্যাখ্যা).
 */
import { norm } from '../utils/text.js';
import { validateSet, summarise } from './validator.js';

// ---- Digits and letters ---------------------------------------------------
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const toAsciiDigits = (s) => String(s).replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
const numberOf = (s) => Number(toAsciiDigits(s));

// Bengali option letters ক খ গ ঘ ঙ চ ছ জ correspond to A-H
const BN_LETTER = { 'ক': 'A', 'খ': 'B', 'গ': 'C', 'ঘ': 'D', 'ঙ': 'E', 'চ': 'F', 'ছ': 'G', 'জ': 'H' };
const toLetter = (ch) => BN_LETTER[ch] || ch.toUpperCase();

// ---- Line patterns (English and Bengali) ----------------------------------
const PREFIXED_Q   = /^(?:question|q)\s*\.?\s*([0-9০-৯]{1,4})(?![0-9০-৯])\s*[.):\-–]?\s*(.*)$/i; // Q1. / Question 1:
const PREFIXED_BN  = /^প্রশ্ন\s*([0-9০-৯]{1,4})(?![0-9০-৯])\s*[:.)ঃ\-–]?\s*(.*)$/;              // প্রশ্ন ১:
const SUFFIX_NNO   = /^([0-9০-৯]{1,4})\s*নং\s*প্রশ্ন\s*[:.)ঃ\-–]?\s*(.*)$/;                      // ১নং প্রশ্ন
const BARE_Q       = /^([0-9০-৯]{1,4})\s*[.)]\s*(.*)$/;                                          // 1. / ১)
const PAREN_Q      = /^\(([0-9০-৯]{1,4})\)\s*(.*)$/;                                             // (1) / (১)
const OPTION_PAREN = /^\(([A-Ha-hক-জ])\)\s*(.*)$/;                                               // (a) / (ক)
const OPTION_PUNCT = /^([A-Ha-hক-জ])\s*[.):\-–]\s*(.*)$/;                                         // A. / ক. / খ)
const ANSWER_LINE  = /^(?:(?:correct|right)\s+)?(?:answers?|ans|correct\s+option|সঠিক\s+উত্তর|উত্তর)\s*[:\-–ঃ]\s*(.*)$/i;
const EXPLAIN_LINE = /^(?:explanations?|rationale|solution|reason|ব্যাখ্যা|সমাধান|বিশ্লেষণ)\s*[:\-–ঃ]\s*(.*)$/i;
const KEY_HEADER   = /^(?:(?:correct\s+)?answer\s*key|answer\s*sheet|answers|উত্তরমালা|উত্তর\s*তালিকা)\s*[:\-–ঃ]?\s*(.*)$/i;
const KEY_ITEM     = /^(?:q(?:uestion)?\s*|প্রশ্ন\s*)?([0-9০-৯]{1,4})\s*[.):\-–ঃ]\s*(.+)$/i;
const LETTER_ONE   = /^[A-Ha-hক-জ]$/;
const LETTER_MULTI = /^[A-Ha-hক-জ](?:\s*(?:,|&|\/|\band\b|ও)\s*[A-Ha-hক-জ])+\.?$/i;

// Headings, difficulty levels, stimulus passages
const HEADING_TITLE = /বহুনির্বাচনী|\(MCQ\)/i;
const HEADING_LABEL = /^(?:chapter|section|part|অধ্যায়|পর্ব|বিভাগ)\s*[0-9০-৯A-Za-z]{1,3}\s*[:.\-]?\s*$/i;
const DIFFICULTY    = /(?:সহজ|মধ্যম|কঠিন|easy|medium|hard)\s*(?:স্তর|level)/i;
const STIMULUS_START = /^উদ্দীপক/;

// Copied-artifact patterns
const TAIL_NUMBER    = /(?<=[^\s0-9০-৯])([0-9০-৯]{1,3})(\s*[।.?!]*\s*)$/u; // "...?14", "$1$14", "...$9।"
const MORE_HORIZ     = /\s*[0-9০-৯]*\s*more_horiz\b/gi;
const STANDALONE_NUM = /^\s*[0-9০-৯]{1,4}\s*$/;

// ---- Text cleaning ----------------------------------------------------------

/** Convert CRLF, remove zero-width characters, turn non-breaking spaces into normal spaces. */
export function normaliseText(input) {
  return String(input ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\t/g, '  ');
}

/** Remove Markdown noise (headings, quotes, bullets, bold, code ticks) from one line. */
function cleanLine(raw) {
  let s = raw.trim();
  if (/^([-*_=])\1{2,}$/.test(s)) return '';
  s = s.replace(/^#{1,6}\s+/, '').replace(/^>\s?/, '').replace(/^[-*+•]\s+(?=\S)/, '');
  return s.replace(/\*\*|__|`/g, '').trim();
}

/** Strip leading emoji and symbols (not letters, digits or "(") so "✅ উত্তর: ক" still matches. */
const labelOf = (s) => s.replace(/^[^\p{L}\p{N}(]+/u, '');

const isLetterValue = (v) => LETTER_ONE.test(v.trim()) || LETTER_MULTI.test(v.trim());
const isOptionLine = (raw) => { const s = cleanLine(raw); return OPTION_PAREN.test(s) || OPTION_PUNCT.test(s); };

/**
 * Remove copied web/PDF artifacts. Each removal is recorded in the report.
 *  - "more_horiz" UI labels (always an artifact)
 *  - standalone number lines next to blank lines (page numbers)
 *  - a number attached to the end of a question/answer/explanation line (e.g. "কত?14"),
 *    removed ONLY when the same number is repeated at the end of at least two such lines.
 *    A single occurrence is kept and flagged for review (it may be real content, e.g. "10x2").
 * Option lines are never changed.
 */
export function cleanArtifacts(lines) {
  const out = [...lines];
  const report = [];
  const reviewNotes = new Map(); // line index -> review message

  out.forEach((l, i) => {
    if (/more_horiz/i.test(l)) {
      const after = l.replace(MORE_HORIZ, '').trimEnd();
      report.push({ line: i + 1, before: l, after, reason: 'UI label "more_horiz" copied from a web page' });
      out[i] = after;
    }
  });

  out.forEach((l, i) => {
    if (!STANDALONE_NUM.test(l)) return;
    const prevBlank = i === 0 || !out[i - 1].trim();
    const nextBlank = i === out.length - 1 || !out[i + 1].trim();
    if (prevBlank || nextBlank) {
      report.push({ line: i + 1, before: l, after: '', reason: 'standalone number line (likely a page number)' });
      out[i] = '';
    }
  });

  const byValue = new Map();
  out.forEach((l, i) => {
    if (!l || isOptionLine(l)) return;
    const m = l.match(TAIL_NUMBER);
    if (!m) return;
    const v = toAsciiDigits(m[1]);
    byValue.set(v, [...(byValue.get(v) || []), i]);
  });
  for (const [v, idxs] of byValue) {
    if (idxs.length >= 2) {
      for (const i of idxs) {
        const before = out[i];
        const after = before.replace(TAIL_NUMBER, '$2').trimEnd();
        report.push({ line: i + 1, before, after, reason: `number ${v} repeated at the end of ${idxs.length} lines (copied artifact)` });
        out[i] = after;
      }
    } else {
      reviewNotes.set(idxs[0], `Trailing number "${v}" was kept. It may be a copied artifact; check the text.`);
    }
  }
  return { lines: out, report, reviewNotes };
}

// ---- Headings, stimulus, question starts ------------------------------------

/** Classify a line as a section heading or difficulty heading (never a question). */
function classifyHeading(s) {
  if (s.length > 120 || /[?？]/.test(s)) return null;
  if (HEADING_TITLE.test(s) || HEADING_LABEL.test(s)) return { kind: 'section', title: s };
  const d = s.match(DIFFICULTY);
  return d ? { kind: 'difficulty', title: d[0] } : null;
}

/** Recognise "১ নম্বর প্রশ্ন" references, including lists such as "১৯ ও ২০ নম্বর". */
function stimulusRefs(s) {
  const refs = [];
  for (const m of s.matchAll(/((?:[0-9০-৯]{1,4}\s*(?:,|ও|এবং|-|–)?\s*)+)\s*(?:নম্বর|নং)/g)) {
    refs.push(...(m[1].match(/[0-9০-৯]{1,4}/g) || []).map(numberOf));
  }
  return refs;
}

/** Returns {number, text, explicit} if the line starts a question, otherwise null. */
function matchQuestionStart(s) {
  let m = s.match(PREFIXED_Q) || s.match(PREFIXED_BN) || s.match(SUFFIX_NNO);
  if (m) return { number: numberOf(m[1]), text: m[2].trim(), explicit: true };
  m = s.match(BARE_Q) || s.match(PAREN_Q);
  if (m) return { number: numberOf(m[1]), text: m[2].trim(), explicit: false };
  return null;
}

// ---- Question walker --------------------------------------------------------

/**
 * Walk the body lines into question drafts. Every line is classified in order:
 * heading, question start, stimulus, option, answer, explanation, unnumbered question,
 * or continuation. Lines that cannot be placed are kept as notes, never dropped.
 */
function parseBody(lines, reviewNotes) {
  const drafts = [];
  const preamble = [];
  const headings = [];
  let cur = null;
  let mode = 'none'; // 'text' | 'options' | 'answer' | 'explain' | 'stimulus' | 'none'
  let section = null;
  let difficulty = null;
  let stim = null;   // { text: string[], refs: number[] }
  const lastNumber = () => (drafts.length ? drafts[drafts.length - 1].number : 0);

  const start = (number, text, raw, index, numbered) => {
    let stimulus = null;
    if (stim) {
      if (stim.refs.length === 0 || stim.refs.includes(number)) stimulus = stim.text.join('\n');
      else stim = null;
    }
    cur = {
      number, textParts: text ? [text] : [], options: [], explanation: '',
      answerInline: null, keyAnswer: null, rawLines: [raw], lineIdx: [index],
      notes: numbered ? [] : ['The question number was missing, so it was numbered automatically.'],
      section, difficulty, stimulus,
    };
    drafts.push(cur);
    mode = 'text';
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const s = cleanLine(raw);
    if (!s) { if (mode === 'explain') mode = 'none'; continue; }

    // 1. Headings end the current question and set section/difficulty metadata
    const heading = classifyHeading(s);
    if (heading) {
      cur = null;
      mode = 'none';
      if (heading.kind === 'section') { section = heading.title; difficulty = null; stim = null; }
      else difficulty = heading.title;
      headings.push({ kind: heading.kind, title: heading.title, beforeQuestion: lastNumber() + 1 });
      continue;
    }

    // 2. Question starts. Numbered lines must rise (so numbered options are not mistaken for questions)
    const q = matchQuestionStart(s);
    if (q && (q.explicit || drafts.length === 0 || q.number > lastNumber())) {
      start(q.number, q.text, raw, i, true);
      continue;
    }
    if (q && cur) cur.notes.push(`"${s}" looks like a numbered line that is not a higher question number, so it was kept as question text. Numbered options are not supported.`);

    // 3. Stimulus passages (shared text for one or more questions)
    if (STIMULUS_START.test(s)) {
      cur = null;
      mode = 'stimulus';
      stim = { text: [s], refs: stimulusRefs(s) };
      continue;
    }
    if (mode === 'stimulus' && stim) { stim.text.push(s); continue; }

    const addLine = () => { cur.rawLines.push(raw); cur.lineIdx.push(i); };

    // 4. Lines that belong to the current question
    if (cur) {
      let m;
      if ((m = s.match(OPTION_PAREN) || s.match(OPTION_PUNCT))) {
        addLine();
        cur.options.push({ label: toLetter(m[1]), text: m[2].trim() });
        mode = 'options';
        continue;
      }
      if ((m = labelOf(s).match(ANSWER_LINE))) { addLine(); cur.answerInline = m[1].trim(); mode = 'answer'; continue; }
      if ((m = labelOf(s).match(EXPLAIN_LINE))) { addLine(); cur.explanation = m[1].trim(); mode = 'explain'; continue; }
      if (mode === 'explain') { addLine(); cur.explanation += (cur.explanation ? '\n' : '') + s; continue; }
    }

    // 5. An unnumbered question after a finished one
    if (s.endsWith('?') && (!cur || cur.options.length > 0)) { start(lastNumber() + 1, s, raw, i, false); continue; }

    // 6. Text before the first question is kept, not treated as a question
    if (!cur) { preamble.push(s); continue; }

    addLine();
    if (mode === 'options' && cur.options.length) {
      const last = cur.options[cur.options.length - 1];
      last.text = `${last.text} ${s}`.trim();
      cur.notes.push(`A wrapped line was joined to option ${last.label}.`);
      continue;
    }
    if (mode === 'answer') {
      cur.explanation += (cur.explanation ? '\n' : '') + s;
      cur.notes.push('Text after the answer line was kept as an explanation.');
      continue;
    }
    cur.textParts.push(s);
  }

  // Attach review messages for trailing numbers that were kept
  for (const d of drafts) {
    for (const li of d.lineIdx) if (reviewNotes.has(li)) d.notes.push(reviewNotes.get(li));
  }
  return { drafts, preamble, headings };
}

// ---- Answer resolution ------------------------------------------------------

/**
 * Resolve one answer value against the options.
 * Accepts "B", "(B)", "খ", "(খ)", "B) Dhaka", "(খ) শুধুমাত্র 15", full option text, "A, C", "A and C", "ক ও খ".
 * Returns {letters, issue}. Never guesses: anything unclear becomes an issue.
 */
export function resolveAnswer(value, options) {
  const v = String(value ?? '').trim().replace(/^\((.+)\)$/, '$1').replace(/\.$/, '').trim();
  if (!v) return { letters: [], issue: 'The answer is empty.' };
  const has = (L) => options.some((o) => o.label === L);
  const textOf = (L) => options.find((o) => o.label === L)?.text ?? '';

  if (LETTER_ONE.test(v)) {
    const L = toLetter(v);
    return has(L) ? { letters: [L], issue: null } : { letters: [], issue: `Answer ${L} is not one of the options.` };
  }
  if (LETTER_MULTI.test(v)) {
    const letters = [...new Set(v.split(/\s*(?:,|&|\/|\band\b|ও)\s*/i).filter(Boolean).map(toLetter))];
    const missing = letters.filter((L) => !has(L));
    return missing.length
      ? { letters: [], issue: `Answers ${missing.join(', ')} are not among the options.` }
      : { letters, issue: null };
  }

  // Full option text, e.g. "Answer: Python" or "উত্তর: ১-এর পরিপূরক"
  const byText = options.filter((o) => norm(o.text) && norm(o.text) === norm(v));
  if (byText.length === 1) return { letters: [byText[0].label], issue: null };
  if (byText.length > 1) return { letters: [], issue: `The answer "${v}" matches more than one option.` };

  // Letter followed by the option text, e.g. "B) Dhaka", "(খ) শুধুমাত্র 15"
  const m = v.match(/^\(([A-Ha-hক-জ])\)\s*(.*)$/) || v.match(/^([A-Ha-hক-জ])\s*[.):]\s*(.*)$/) || v.match(/^([A-Ha-hক-জ])\s+(.+)$/);
  if (m) {
    const L = toLetter(m[1]);
    const rest = m[2].trim();
    if (has(L) && (!rest || norm(rest) === norm(textOf(L)) || /^(is\s+)?(correct|right)\.?$/i.test(rest))) {
      return { letters: [L], issue: null };
    }
  }
  return { letters: [], issue: `The answer "${v}" does not match any option.` };
}

/** Combine the inline answer and the answer-key answer for one question. */
function resolveAnswers(d, options) {
  const inline = d.answerInline !== null ? resolveAnswer(d.answerInline, options) : null;
  const key = d.keyAnswer !== null ? resolveAnswer(d.keyAnswer, options) : null;

  if (inline && key) {
    const same = inline.letters.join() === key.letters.join();
    if (!inline.issue && !key.issue && same) {
      return { letters: inline.letters, source: 'inline', issue: null, raw: d.answerInline };
    }
    return {
      letters: [],
      source: 'conflict',
      issue: `The inline answer "${d.answerInline}" conflicts with the answer key "${d.keyAnswer}". Choose the correct answer in the preview.`,
      raw: d.answerInline,
    };
  }
  const r = inline || key;
  if (!r) return { letters: [], source: null, issue: null, raw: null };
  return {
    letters: r.issue ? [] : r.letters,
    source: inline ? 'inline' : 'key',
    issue: r.issue,
    raw: inline ? d.answerInline : d.keyAnswer,
  };
}

/** Summary status shown in the preview: extracted, missing, ambiguous, conflicting or unmatched. */
function answerStatusOf(answer) {
  if (answer.source === 'conflict') return 'conflicting';
  if (answer.issue) return /more than one/.test(answer.issue) ? 'ambiguous' : 'unmatched';
  return answer.letters.length ? 'extracted' : 'missing';
}

/** Build the final question object from a draft. */
function buildQuestion(d, index, extract) {
  const src = extract ? d : { ...d, answerInline: null, keyAnswer: null };
  let options = d.options.map((o) => ({ label: o.label, text: o.text }));
  let optionsGenerated = false;

  // True/False: only generate options when the text clearly asks for them
  const looksTF = /\btrue\s*(?:or|\/)\s*false\b/i.test(d.textParts.join(' '))
    || [src.answerInline, src.keyAnswer].some((v) => v !== null && /^(true|false)$/i.test(v.trim()));
  if (options.length === 0 && looksTF) {
    options = [{ label: 'A', text: 'True' }, { label: 'B', text: 'False' }];
    optionsGenerated = true;
  }

  const answer = resolveAnswers(src, options);
  return {
    id: `q${index + 1}`,
    number: d.number,
    text: d.textParts.join(' ').trim(),
    options,
    answerLetters: answer.letters,
    answerSource: answer.source,
    answerIssue: answer.issue,
    answerRaw: answer.raw,
    answerStatus: answerStatusOf(answer),
    explanation: d.explanation,
    optionsGenerated,
    notes: d.notes,
    rawText: d.rawLines.join('\n'),
    section: d.section,
    difficulty: d.difficulty,
    stimulus: d.stimulus,
    warnings: [],
    type: 'single',
    status: 'ok',
    unkeyed: true,
  };
}

// ---- Answer key section -----------------------------------------------------

/** Split "1. B 2. C" into [{number, value}] entries. */
function splitKeyItems(text) {
  const parts = text.split(/\s+(?=(?:q(?:uestion)?\s*|প্রশ্ন\s*)?[0-9০-৯]{1,4}\s*[.):\-–ঃ]\s*\S)/i);
  const items = [];
  for (const part of parts) {
    const m = part.trim().match(KEY_ITEM);
    if (m) items.push({ number: numberOf(m[1]), value: m[2].trim() });
  }
  return items;
}

/**
 * Find the answer-key section: a heading ("Answer Key:", "উত্তরমালা:") or, failing that,
 * at least two key lines at the very end ("1. B", "২. খ"). Returns {start, from, inline} or null.
 */
function findKeySection(lines) {
  for (let i = 0; i < lines.length; i++) {
    const m = labelOf(cleanLine(lines[i])).match(KEY_HEADER);
    if (m && (m[1].trim() === '' || splitKeyItems(m[1]).length > 0)) {
      return { start: i, from: i + 1, inline: m[1] };
    }
  }
  let j = lines.length - 1;
  let count = 0;
  while (j >= 0) {
    const s = cleanLine(lines[j]);
    if (!s) { j -= 1; continue; }
    const m = s.match(KEY_ITEM);
    if (!m || !isLetterValue(m[2])) break;
    count += 1;
    j -= 1;
  }
  return count >= 2 ? { start: j + 1, from: j + 1, inline: '' } : null;
}

// ---- Public entry point -----------------------------------------------------

/**
 * Parse pasted MCQ text.
 * @param {string} input
 * @param {{mode?: 'auto'|'manual'}} [options]  auto (default): extract answers. manual: ignore answer text, the user enters answers.
 * @returns {{questions, globalNotes, summary, cleanupReport, headings}}
 */
export function parseMcqText(input, options = {}) {
  const extract = options.mode !== 'manual';
  const text = normaliseText(input);
  if (!text.trim()) {
    return {
      questions: [], globalNotes: ['No text was pasted. Paste your MCQs, then press Import questions.'],
      summary: summarise([]), cleanupReport: [], headings: [],
    };
  }

  const cleaned = cleanArtifacts(text.split('\n'));
  const lines = cleaned.lines;
  const globalNotes = [];
  const key = findKeySection(lines);
  const { drafts, preamble, headings } = parseBody(key ? lines.slice(0, key.start) : lines, cleaned.reviewNotes);

  if (preamble.length) {
    globalNotes.push(`Text before the first question was kept but not treated as a question: "${preamble.join(' ').slice(0, 160)}".`);
  }

  if (key && extract) {
    const byNumber = new Map();
    for (const d of drafts) if (!byNumber.has(d.number)) byNumber.set(d.number, d);
    for (const src of [key.inline, ...lines.slice(key.from)]) {
      const s = cleanLine(src);
      if (!s) continue;
      const items = splitKeyItems(s);
      if (!items.length) { globalNotes.push(`Unrecognised answer-key line kept for review: "${s}".`); continue; }
      for (const item of items) {
        const d = byNumber.get(item.number);
        if (!d) globalNotes.push(`The answer key lists question ${item.number}, but no question ${item.number} was found.`);
        else if (d.keyAnswer === null) d.keyAnswer = item.value;
        else globalNotes.push(`The answer key lists question ${item.number} more than once. The first entry was used.`);
      }
    }
  } else if (key && !extract) {
    globalNotes.push('The answer key was not used because manual answer entry is on. Choose the answers in the preview.');
  }
  if (!extract && drafts.some((d) => d.answerInline !== null)) {
    globalNotes.push('Answer declarations in the text were not used because manual answer entry is on.');
  }
  if (!drafts.length) {
    globalNotes.push('No questions were found. Start each question with a number such as "1.", "Q1.", "১." or "প্রশ্ন ১:", then list options such as "A.", "a)" or "ক.".');
  }
  if (cleaned.report.length) {
    globalNotes.push(`${cleaned.report.length} copied artifact(s) were removed. Review them in the cleanup report.`);
  }

  const questions = drafts.map((d, i) => buildQuestion(d, i, extract));
  validateSet(questions);
  return { questions, globalNotes, summary: summarise(questions), cleanupReport: cleaned.report, headings };
}
