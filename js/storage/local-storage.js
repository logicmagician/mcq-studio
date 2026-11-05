/**
 * Lightweight settings in LocalStorage.
 * Only small preference values belong here. Exam records go to IndexedDB.
 * Every call is wrapped so a blocked/full storage never crashes the app.
 */

export const SETTINGS_KEY = 'mcqstudio.settings';

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'dark',        // 'dark' | 'light'
});

/** Read settings, falling back to defaults for anything missing or corrupt. */
export function getSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_SETTINGS, ...sanitise(parsed) };
  } catch (err) {
    console.warn('[MCQ Studio] Could not read settings, using defaults.', err);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Merge and save settings.
 * @returns {{ok: boolean, settings: object, error?: string}}
 */
export function saveSettings(patch) {
  const next = { ...getSettings(), ...sanitise(patch) };
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    return { ok: true, settings: next };
  } catch (err) {
    console.warn('[MCQ Studio] Could not save settings.', err);
    return { ok: false, settings: next, error: 'Your browser blocked saving settings. They will reset on reload.' };
  }
}

/** Keep only known keys with valid values. Protects against tampered data. */
function sanitise(obj) {
  const out = {};
  if (obj && typeof obj === 'object') {
    if (obj.theme === 'dark' || obj.theme === 'light') out.theme = obj.theme;
  }
  return out;
}
