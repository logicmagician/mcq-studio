import { el, statCard } from '../utils/helpers.js';
import { listSets } from '../storage/database.js';

/**
 * Dashboard. Every number comes from stored data:
 *  - Questions imported: total questions across saved question sets (Phase 2).
 *  - Examinations, average and best score: need exam attempts, which arrive in
 *    Phases 3 and 4, so they show zero or "—" rather than invented values.
 */
export async function renderDashboard(root) {
  let sets = null;
  try { sets = await listSets(); } catch (err) { console.warn('[MCQ Studio] Could not read saved sets.', err); }

  const questionTotal = sets ? sets.reduce((n, set) => n + (set.questions?.length || 0), 0) : '—';
  const setNote = sets ? `${sets.length} saved set(s).` : 'Storage is unavailable in this browser.';

  const stats = [
    { label: 'Examinations', value: '0', note: 'Exams are created in Phase 3.' },
    { label: 'Questions imported', value: questionTotal, note: setNote },
    { label: 'Average score', value: '—', note: 'Needs at least one graded attempt.' },
    { label: 'Best score', value: '—', note: 'Needs at least one graded attempt.' },
  ];

  const showEmpty = !sets || sets.length === 0;

  const parts = [
    el('header', { class: 'hero' }, [
      el('div', {}, [
        el('h1', { id: 'page-title', tabindex: '-1', text: 'Welcome to MCQ Studio' }),
        el('p', { text: 'Paste questions from ChatGPT or Gemini, then review and correct them. Timed exams arrive in a later release.' }),
      ]),
      el('a', { class: 'btn', href: '#/import', text: 'Import questions' }),
    ]),
    el('section', { class: 'grid', 'aria-label': 'Statistics' },
      stats.map((s) => statCard(s.label, s.value, s.note))),
    showEmpty ? el('section', { class: 'card empty mt-5' }, [
      el('h3', { text: 'No examinations yet' }),
      el('p', { text: 'Start by pasting a set of MCQs. Nothing is uploaded: everything stays in this browser.' }),
      el('a', { class: 'btn btn-ghost', href: '#/import', text: 'Import your first set' }),
    ]) : null,
  ];
  root.replaceChildren(...parts.filter(Boolean)); // filter: replaceChildren would print null as text
}
