import { el, toast } from '../utils/helpers.js';
import { getSettings, saveSettings } from '../storage/local-storage.js';

/** Apply a theme to the document. Used at startup and when the user changes it. */
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#F5F7FB' : '#0B0F19');
}

export function renderSettings(root) {
  const current = getSettings().theme;

  const themeButtons = ['dark', 'light'].map((mode) =>
    el('button', {
      type: 'button',
      class: 'btn btn-ghost',
      'aria-pressed': mode === current ? 'true' : 'false',
      dataset: { theme: mode },
      text: mode === 'dark' ? 'Dark (default)' : 'Light',
      onclick: () => {
        const result = saveSettings({ theme: mode });
        applyTheme(mode);
        // Update pressed state on both buttons
        themeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === mode)));
        if (result.ok) toast(`Switched to ${mode} theme.`, 'success');
        else toast(result.error, 'error');
      },
    })
  );

  root.replaceChildren(
    el('header', { class: 'page-head' }, [
      el('h1', { id: 'page-title', tabindex: '-1', text: 'Settings' }),
      el('p', { text: 'Preferences are saved in this browser only.' }),
    ]),

    el('section', { class: 'card', 'aria-labelledby': 'appearance-h' }, [
      el('h2', { id: 'appearance-h', class: 'section-title', text: 'Appearance' }),
      el('div', { class: 'setting-row' }, [
        el('div', {}, [
          el('strong', { text: 'Theme' }),
          el('p', { text: 'Dark is the default. Light is available for bright environments.', class: 'flush' }),
        ]),
        el('div', { class: 'segmented', role: 'group', 'aria-label': 'Theme' }, themeButtons),
      ]),
    ]),

    el('section', { class: 'card mt-4', 'aria-labelledby': 'privacy-h' }, [
      el('h2', { id: 'privacy-h', class: 'section-title', text: 'Your data' }),
      el('p', { text: 'MCQ Studio has no accounts and no servers. Your exams and results are stored only in this browser on this device, so they will not sync to other devices. Export and backup tools arrive in a later phase.' }),
    ]),
  );
}
