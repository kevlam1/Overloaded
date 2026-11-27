// The first-time help for each view of the table (2026-11-26 feedback, step 5): a short window of the main keys and controls the first time a view opens, with "Don't show again".
// Settings > About has a switch per view to show it again. Plain data and logic (scripts/test-view-help.mjs); frontend/src/view-help.js draws it. Kept in this browser only.
// Keep every line a few words long (Kevin's rule for UI text), and true: the keys named here are the defaults in shared/keybinds.mjs.
export const HELP_KEY = 'overloaded.helpSeen';
export const VIEWS = ['solo', 'grid', 'sidebar', 'shared'];
export const VIEW_TITLES = { solo: 'Solo table', grid: 'Grid view', sidebar: 'Sidebar view', shared: 'Shared view' };

const CARDS = [
  ['Right-click', 'A card or pile: its menu'],
  ['Drag', 'Move a card; hold a pile to move it all'],
  ['Double-click, E or Q', 'Tap or untap'],
  ['Alt', 'Show the card under the pointer large'],
  ['D, or right-click Draw', 'Draw 1, or draw 3'],
  ['Tab', 'Settings, with every key'],
];
export const HELP = {
  solo: { title: 'The solo table', lines: CARDS },
  grid: { title: 'Grid view', lines: [...CARDS.slice(0, 4), ['Next turn', 'Pass to the next player'], ['Ping card', 'In a card menu: show it to all'], ['Tab', 'Settings, with every key']] },
  sidebar: { title: 'Sidebar view', lines: [['Players', 'Click a player to show their board'], ...CARDS.slice(0, 4), ['Next turn', 'Pass to the next player'], ['Tab', 'Settings, with every key']] },
  shared: { title: 'Shared view', lines: [['Wheel', 'Zoom in and out'], ['Space and drag', 'Move around the table'], ['Fit, Mine', 'See all, or go to your area'], ['Any card', 'Anyone may move it'], ...CARDS.slice(0, 2), ['Tab', 'Settings, with every key']] },
};

// The views whose help was put away, from the text kept in the browser: a JSON list of view names. Anything damaged reads as none.
export function readSeen(text) {
  try { const list = JSON.parse(typeof text === 'string' ? text : 'null'); return Array.isArray(list) ? VIEWS.filter((view) => list.includes(view)) : []; } catch { return []; }
}
export const writeSeen = (seen) => JSON.stringify(VIEWS.filter((view) => seen.includes(view)));
export const shouldShow = (seen, view) => VIEWS.includes(view) && !seen.includes(view);
export const markSeen = (seen, view) => (VIEWS.includes(view) && !seen.includes(view) ? VIEWS.filter((v) => v === view || seen.includes(v)) : seen);
export const unmarkSeen = (seen, view) => seen.filter((v) => v !== view);
