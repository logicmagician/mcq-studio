/**
 * Question Preview and editor (Phase 2).
 * Typing updates the data and saves a draft after a short pause, without redrawing
 * the list, so keyboard focus is never lost. Adding, removing, moving and relabelling
 * redraw the list and put focus back on a sensible control.
 */
import { el, notice, statCard, toast } from '../utils/helpers.js';
import { getDraft, putDraft, saveSet } from '../storage/database.js';
import { validateSet, summarise } from '../parser/validator.js';

const LETTERS = 'ABCDEFGH';
const MAX_OPTIONS = 8;

let state = null;      // { title, questions, globalNotes, setId }
let container = null;  // the #view element
let cards = [];        // per-question { badge, warnings } for in-place refresh
let summaryEl = null;
let saveTimer = null;
let idCounter = 0;

/** Status for display. Drafts saved before answerStatus existed are derived from their answers. */
function statusOf(q) {
  if (q.answerStatus) return q.answerStatus;
  return q.answerLetters?.length ? 'extracted' : 'missing';
}

/** Human-readable answer status (shown as plain text, not a badge, so the badge counts stay unchanged). */
const ANSWER_LABEL = {
  extracted: 'Extracted answer', manual: 'Manual answer', missing: 'Answer missing',
  ambiguous: 'Ambiguous answer', conflicting: 'Conflicting answer', unmatched: 'Unrecognized answer',
};

/** Page heading shared by every state (loading, empty, loaded) so the page is always labelled. */
function pageHeader(subtitle) {
  return el('header', { class: 'page-head' }, [
    el('h1', { id: 'page-title', tabindex: '-1', text: 'Question Preview' }),
    el('p', { text: subtitle }),
  ]);
}

export async function renderPreview(root) {
  container = root;
  root.replaceChildren(pageHeader('Loading your questions…'));
  const draft = await getDraft();
  if (!draft || !draft.questions?.length) {
    root.replaceChildren(
      pageHeader('Review detected questions before you save or use a set.'),
      el('section', { class: 'card empty' }, [
        el('h3', { text: 'Nothing to preview yet' }),
        el('p', { text: 'Paste and import a set of MCQs first.' }),
        el('a', { class: 'btn', href: '#/import', text: 'Go to Import Questions' }),
      ]),
    );
    return;
  }
  state = {
    title: draft.title || 'Untitled set',
    questions: draft.questions,
    globalNotes: draft.globalNotes || [],
    setId: draft.setId || null,
    cleanupReport: draft.cleanupReport || [],
  };
  validateSet(state.questions);
  draw();
}

// ---- Persistence and validation -----------------------------------------

function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => putDraft({ ...state, updatedAt: new Date().toISOString() }), 400);
}

function commit() {
  validateSet(state.questions);
  persistSoon();
}

// ---- Rendering -----------------------------------------------------------

function draw() {
  cards = [];
  const titleInput = el('input', { type: 'text', id: 'set-title', class: 'field', maxlength: '120' });
  titleInput.value = state.title;
  titleInput.addEventListener('input', () => {
    state.title = titleInput.value.trim() || 'Untitled set';
    persistSoon();
  });

  summaryEl = el('section', { class: 'grid summary', 'aria-label': 'Parsing summary' });
  const notes = state.globalNotes.length
    ? el('ul', { class: 'warn-list', 'aria-label': 'Parser notes' }, state.globalNotes.map((n) => el('li', { class: 'info', text: n })))
    : null;

  const cleanup = state.cleanupReport.length
    ? el('details', { class: 'source' }, [
      el('summary', { text: `Cleanup report: ${state.cleanupReport.length} copied artifact(s) removed. Review them.` }),
      el('ul', { class: 'warn-list' }, state.cleanupReport.map((c) => el('li', { class: 'info', text: `Line ${c.line}: ${c.reason}. Before: "${c.before.trim()}"` }))),
    ])
    : null;
  const parts = [
    pageHeader('Check what was detected, fix anything flagged, then save the set.'),
    el('label', { class: 'field-wrap' }, [el('span', { class: 'field-label', text: 'Set title' }), titleInput]),
    summaryEl,
    notes,
    cleanup,
    el('div', { class: 'toolbar' }, [
      el('button', { type: 'button', class: 'btn', text: 'Save question set', onclick: saveSetNow }),
      el('button', { type: 'button', class: 'btn btn-ghost', text: 'Add question', onclick: addQuestion }),
      el('a', { class: 'btn btn-ghost', href: '#/import', text: 'Back to import' }),
    ]),
    el('ol', { class: 'q-list', 'aria-label': 'Questions' }, state.questions.map((q, i) => questionCard(q, i))),
    state.questions.length ? null : notice('info', 'No questions left. Add one, or go back and import again.'),
  ];
  container.replaceChildren(...parts.filter(Boolean));
  refreshAll();
}

/** Redraw, then move focus to a control inside question i (if given). */
function redraw(i, selector) {
  draw();
  if (i !== null && i !== undefined && i >= 0) {
    container.querySelectorAll('.q-card')[i]?.querySelector(selector)?.focus();
  }
}

function refreshSummary() {
  const s = summarise(state.questions);
  summaryEl.replaceChildren(
    statCard('Total', s.total),
    statCard('Ready', s.parsed),
    statCard('Needs attention', s.attention),
    statCard('No answer key', s.unkeyed),
  );
}

function refreshCard(i) {
  const q = state.questions[i];
  const c = cards[i];
  if (!c) return;
  const kind = q.status === 'attention' ? 'attention' : q.unkeyed ? 'unkeyed' : 'ok';
  c.badge.textContent = { attention: 'Needs attention', unkeyed: 'No answer key', ok: 'Ready' }[kind];
  c.badge.className = `badge badge-${kind}`;
  c.warnings.replaceChildren(...q.warnings.map((w) => el('li', { class: w.level, text: w.message })));
  // Status line is refreshed here too, so ticking an answer updates its label immediately
  c.meta.textContent = [q.section, q.difficulty, ANSWER_LABEL[statusOf(q)]].filter(Boolean).join(' · ');
}

/** Refresh every card's badge and warnings, plus the summary (no DOM rebuild). */
function refreshAll() {
  state.questions.forEach((_, i) => refreshCard(i));
  refreshSummary();
}

function questionCard(q, i) {
  const badge = el('span', { class: 'badge' });
  const warnings = el('ul', { class: 'warn-list', 'aria-label': `Question ${i + 1} warnings` });
  const meta = el('p', { class: 'hint' });
  cards[i] = { badge, warnings, meta };

  const text = el('textarea', { class: 'field', rows: '2', 'aria-label': `Question ${i + 1} text` });
  text.value = q.text;
  text.addEventListener('input', () => { q.text = text.value; persistSoon(); });
  text.addEventListener('change', () => { commit(); refreshAll(); });

  const nextLetter = LETTERS.split('').find((L) => !q.options.some((o) => o.label === L));
  const addOpt = el('button', {
    type: 'button',
    class: 'btn btn-ghost btn-sm opt-add',
    text: 'Add option',
    disabled: !nextLetter ? true : null,
    onclick: () => {
      q.options.push({ label: nextLetter, text: '' });
      commit();
      redraw(i, '.opt-row:last-of-type input');
    },
  });

  const answerSet = el('fieldset', { class: 'answer-set' }, [
    el('legend', { text: 'Correct answer(s)' }),
    el('p', { class: 'hint', text: 'Tick one option for a single answer, or several for multi-select. Leave all unticked if the answer is unknown.' }),
    ...q.options.map((o) => answerCheckbox(q, i, o)),
  ]);

  const expl = el('textarea', { class: 'field', rows: '2', 'aria-label': `Question ${i + 1} explanation` });
  expl.value = q.explanation || '';
  expl.addEventListener('input', () => { q.explanation = expl.value; persistSoon(); });

  const last = state.questions.length - 1;
  const actions = el('div', { class: 'q-actions' }, [
    el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Move up', disabled: i === 0 ? true : null, onclick: () => move(i, -1) }),
    el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Move down', disabled: i === last ? true : null, onclick: () => move(i, 1) }),
    el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Delete', onclick: () => removeQuestion(i) }),
  ]);

  const source = el('details', { class: 'source' }, [
    el('summary', { text: 'Original pasted text' }),
    el('pre', { text: q.rawText || '(Added manually. No original text.)' }),
  ]);

  return el('li', { class: 'q-card' }, [
    el('div', { class: 'q-head' }, [el('h3', { text: `Question ${i + 1}` }), badge]),
    meta,
    q.stimulus ? el('details', { class: 'source', open: true }, [
      el('summary', { text: 'Shared stimulus (passage for this question)' }),
      el('pre', { text: q.stimulus }),
    ]) : null,
    el('label', { class: 'field-wrap' }, [el('span', { class: 'field-label', text: 'Question text' }), text]),
    el('div', { class: 'field-wrap' }, [
      el('span', { class: 'field-label', text: 'Options' }),
      el('div', { class: 'opt-list' }, q.options.map((o, j) => optionRow(q, i, j))),
      addOpt,
    ]),
    answerSet,
    el('label', { class: 'field-wrap' }, [el('span', { class: 'field-label', text: 'Explanation (optional)' }), expl]),
    warnings,
    source,
    actions,
  ]);
}

function optionRow(q, i, j) {
  const o = q.options[j];
  const input = el('input', { type: 'text', class: 'field', 'aria-label': `Option ${o.label} text`, maxlength: '500' });
  input.value = o.text;
  input.addEventListener('input', () => { o.text = input.value; persistSoon(); });
  input.addEventListener('change', () => { commit(); refreshAll(); });
  return el('div', { class: 'opt-row' }, [
    el('span', { class: 'opt-label', 'aria-hidden': 'true', text: o.label }),
    input,
    el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': `Remove option ${o.label}`, text: 'Remove',
      onclick: () => { removeOption(q, j); commit(); redraw(i, '.opt-add'); },
    }),
  ]);
}

function answerCheckbox(q, i, o) {
  const box = el('input', { type: 'checkbox', id: `q${i}-ans-${o.label}` });
  box.checked = q.answerLetters.includes(o.label);
  box.addEventListener('change', () => {
    const set = new Set(q.answerLetters);
    if (box.checked) set.add(o.label); else set.delete(o.label);
    q.answerLetters = [...set].sort();
    q.answerSource = 'manual';
    q.answerStatus = q.answerLetters.length ? 'manual' : 'missing';
    q.answerIssue = null;          // the user has now chosen the answer
    commit();
    refreshAll();
  });
  return el('label', { class: 'check-row' }, [box, el('span', { text: `${o.label}. ${o.text || '(no text)'}` })]);
}

// ---- Structural edits ----------------------------------------------------

/** Remove an option and relabel the rest A, B, C… keeping answers pointing at the same text. */
function removeOption(q, j) {
  const removed = q.options[j].label;
  q.options.splice(j, 1);
  const map = {};
  q.options.forEach((o, k) => { map[o.label] = LETTERS[k]; o.label = LETTERS[k]; });
  const hadAnswer = q.answerLetters.includes(removed);
  q.answerLetters = q.answerLetters.filter((l) => l !== removed).map((l) => map[l] ?? l).sort();
  if (hadAnswer) q.answerIssue = 'The correct option was removed. Choose the correct answer again.';
  q.answerSource = 'manual';
  q.answerStatus = q.answerLetters.length ? 'manual' : 'missing';
}

function move(i, delta) {
  const arr = state.questions;
  const j = i + delta;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  commit();
  redraw(j, '.q-actions button');
}

function removeQuestion(i) {
  if (!window.confirm(`Delete question ${i + 1}? This cannot be undone.`)) return;
  state.questions.splice(i, 1);
  commit();
  redraw(Math.min(i, state.questions.length - 1), 'textarea');
}

function addQuestion() {
  state.questions.push(newQuestion());
  commit();
  redraw(state.questions.length - 1, 'textarea');
}

function newQuestion() {
  return {
    id: `m${Date.now().toString(36)}${idCounter++}`,
    number: null,
    text: '',
    options: [
      { label: 'A', text: '' }, { label: 'B', text: '' },
      { label: 'C', text: '' }, { label: 'D', text: '' },
    ],
    answerLetters: [],
    answerSource: null,
    answerIssue: null,
    answerRaw: null,
    explanation: '',
    optionsGenerated: false,
    notes: ['Added manually.'],
    rawText: '',
    warnings: [],
    type: 'single',
    status: 'ok',
    unkeyed: true,
  };
}

// ---- Save ----------------------------------------------------------------

async function saveSetNow() {
  validateSet(state.questions);
  if (!state.questions.length) {
    toast('Add at least one question before saving.', 'error');
    return;
  }
  state.setId = state.setId || `set-${Date.now().toString(36)}`;
  const s = summarise(state.questions);
  try {
    await saveSet({
      id: state.setId,
      title: state.title,
      savedAt: new Date().toISOString(),
      questions: state.questions,
    });
    await putDraft({ ...state, updatedAt: new Date().toISOString() });
    toast(`Saved "${state.title}": ${s.total} questions, ${s.attention} need attention.`, 'success');
  } catch (err) {
    toast(`Could not save the set in this browser. ${err.message}`, 'error');
  }
}
