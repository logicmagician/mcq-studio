import { el, notice, statCard } from '../utils/helpers.js';
import { parseMcqText } from '../parser/parser.js';
import { putDraft } from '../storage/database.js';

const SAMPLE = [
  '1. What is the capital of Bangladesh?',
  'A. Chittagong',
  'B. Dhaka',
  'C. Sylhet',
  'D. Rajshahi',
  'Answer: B',
  '',
  'Q2. Which gate outputs 1 only when all inputs are 1?',
  'a) AND',
  'b) OR',
  'c) NOT',
  'd) XOR',
  '',
  'Answer Key:',
  '2. A',
].join('\n');

const FORMAT_HELP = [
  'Question numbers:  1.   1)   Q1.   Q1:   Question 1:',
  'Options:           A.  B.  C.  D.   a)  b)   (a)  (b)   A:',
  'Inline answers:    Answer: B   |   Correct answer: Python   |   Ans: C',
  'Multiple correct:  Answer: A, C   or   Answer: A and C',
  'True/False:        Options True and False, or the question asks "True or False?"',
  'Answer key:        a line "Answer Key:" followed by "1. B" lines,',
  '                   or key lines at the very end with no heading',
  'Explanations:      "Explanation:" followed by text on the same or next lines',
  'Markdown:          headings, bold, bullets and blank lines are handled',
].join('\n');

let answerMode = 'auto';   // 'auto' = extract answers from text (default); 'manual' = user enters answers

export function renderImporter(root) {
  const input = el('textarea', {
    id: 'importer-input',
    class: 'field mcq-input',
    rows: '12',
    spellcheck: 'false',
    'aria-describedby': 'import-help',
    placeholder: 'Paste MCQs from ChatGPT, Gemini or another source here…',
  });
  const counter = el('p', { class: 'hint', 'aria-live': 'polite', text: '0 characters' });
  const status = el('section', { id: 'parse-status', 'aria-label': 'Parsing status', 'aria-live': 'polite', class: 'summary-block' });

  const updateCount = () => { counter.textContent = `${input.value.length.toLocaleString()} characters`; };
  input.addEventListener('input', updateCount);

  async function runImport() {
    const text = input.value;
    if (!text.trim()) {
      status.replaceChildren(notice('error', 'Paste some questions first, then press Import questions.'));
      input.focus();
      return;
    }
    const result = parseMcqText(text, { mode: answerMode });
    if (!result.questions.length) {
      renderStatus(result, true);
      return;
    }
    const saved = await putDraft({
      title: 'Untitled set',
      questions: result.questions,
      globalNotes: result.globalNotes,
      sourceText: text,
      answerMode,
      cleanupReport: result.cleanupReport,
      updatedAt: new Date().toISOString(),
    });
    renderStatus(result, saved.persisted);
  }

  function renderStatus(result, persisted = true) {
    const s = result.summary;
    const children = [];
    if (!result.questions.length) {
      children.push(notice('error', 'No questions were detected. Check the format help below, then try again.'));
    } else {
      children.push(el('div', { class: 'grid summary' }, [
        statCard('Detected', s.total),
        statCard('Ready', s.parsed),
        statCard('Needs attention', s.attention),
        statCard('No answer key', s.unkeyed),
      ]));
      children.push(notice(
        s.attention ? 'warning' : 'success',
        s.attention
          ? `${s.attention} question(s) need attention. Fix them in the preview before using the set.`
          : 'All questions parsed cleanly.',
      ));
      children.push(el('a', { class: 'btn', href: '#/preview', text: 'Open question preview' }));
    }
    if (!persisted) {
      children.push(notice('error', 'The draft could not be saved in this browser, so it may be lost on refresh.'));
    }
    if (result.headings && result.headings.length) {
      children.push(notice('info', `Detected ${result.headings.length} heading(s) (sections and difficulty levels). They were kept as metadata, not questions.`));
    }
    if (result.cleanupReport && result.cleanupReport.length) {
      children.push(el('details', { class: 'source' }, [
        el('summary', { text: `Cleanup report: ${result.cleanupReport.length} copied artifact(s) removed` }),
        el('ul', { class: 'warn-list' }, result.cleanupReport.map((c) => el('li', { class: 'info', text: `Line ${c.line}: ${c.reason}. Before: "${c.before.trim()}"` }))),
      ]));
    }
    if (result.globalNotes.length) {
      children.push(el('ul', { class: 'warn-list', 'aria-label': 'Parser notes' },
        result.globalNotes.map((n) => el('li', { class: 'attention', text: n }))));
    }
    status.replaceChildren(...children);
  }

  root.replaceChildren(
    el('header', { class: 'page-head' }, [
      el('h1', { id: 'page-title', tabindex: '-1', text: 'Import Questions' }),
      el('p', { id: 'import-help', text: 'Paste the whole set at once. MCQ Studio finds the numbers, options, answers and explanations. Nothing is uploaded.' }),
    ]),
    el('div', { class: 'card' }, [
      el('label', { class: 'field-label', for: 'importer-input', text: 'Paste your MCQs' }),
      input,
      counter,
      el('fieldset', { class: 'answer-set' }, [
        el('legend', { text: 'Answer handling' }),
        el('label', { class: 'check-row' }, [
          el('input', { type: 'radio', name: 'answer-mode', value: 'auto', checked: true, onchange: () => { answerMode = 'auto'; } }),
          el('span', { text: 'Extract answers from the text (recommended)' }),
        ]),
        el('label', { class: 'check-row' }, [
          el('input', { type: 'radio', name: 'answer-mode', value: 'manual', onchange: () => { answerMode = 'manual'; } }),
          el('span', { text: 'Manual entry: I will choose the answers in the preview' }),
        ]),
      ]),
      el('div', { class: 'toolbar' }, [
        el('button', { type: 'button', class: 'btn', text: 'Import questions', onclick: runImport }),
        el('button', {
          type: 'button', class: 'btn btn-ghost', text: 'Load sample',
          onclick: () => { input.value = SAMPLE; updateCount(); },
        }),
        el('button', {
          type: 'button', class: 'btn btn-ghost', text: 'Clear text',
          onclick: () => { input.value = ''; updateCount(); status.replaceChildren(); input.focus(); },
        }),
      ]),
    ]),
    el('details', { class: 'card formats mt-4' }, [
      el('summary', { text: 'Supported formats' }),
      el('pre', { text: FORMAT_HELP }),
    ]),
    status,
  );
}
