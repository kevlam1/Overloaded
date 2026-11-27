// How the site looks (the redesign, step 5b, Kevin 2026-11-25): the theme (Dark or Light) for every page, and the pattern on the battlefields (Dots, Crosses or
// Graph paper: one mark on every cell, so a card that sits off the card-sized blocks and the cut edge of a board never look out of place). Kept in this browser.
// applyLook() puts them on the page (html[data-theme], body[data-board-pattern]); mountLookSettings(host) draws the two choices in Settings.
import { makeSafeStore } from './safe-store.js';
import { applyAccent } from './accent.js';

const store = makeSafeStore();
export const THEME_KEY = 'overloaded.theme';
export const PATTERN_KEY = 'overloaded.boardPattern';
const THEMES = { dark: 'Dark', light: 'Light' };
const PATTERNS = { dots: 'Dots', crosses: 'Crosses', grid: 'Graph paper' };
const pick = (value, options, fallback) => (Object.hasOwn(options, value) ? value : fallback);
export const readTheme = (value) => pick(value, THEMES, 'dark');
export const readPattern = (value) => pick(value, PATTERNS, 'dots');

export function applyLook() {
  const theme = readTheme(store.get(THEME_KEY));
  const pattern = readPattern(store.get(PATTERN_KEY));
  document.documentElement.dataset.theme = theme;
  if (document.body) document.body.dataset.boardPattern = pattern;
  applyAccent(); // (your color as the accent; it depends on the theme)
  return { theme, pattern };
}

function choice(id, label, options, current, onChange) {
  const wrap = document.createElement('label');
  const select = document.createElement('select');
  select.id = id;
  for (const [value, words] of Object.entries(options)) select.append(Object.assign(document.createElement('option'), { value, textContent: words, selected: value === current }));
  select.addEventListener('change', () => onChange(select.value));
  wrap.append(`${label} `, select);
  return wrap;
}

export function mountLookSettings(host) {
  const { theme, pattern } = applyLook();
  if (!host) return;
  host.replaceChildren(
    choice('theme-pick', 'Theme', THEMES, theme, (value) => { store.set(THEME_KEY, readTheme(value)); applyLook(); }),
    choice('pattern-pick', 'Battlefield', PATTERNS, pattern, (value) => { store.set(PATTERN_KEY, readPattern(value)); applyLook(); }),
  );
}

applyLook(); // (as soon as the module loads, so a page never shows the other theme for long)
