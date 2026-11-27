// Your color as the site's accent (Kevin, 2026-11-26): every page shows the color you picked in a lobby instead of gold. It is kept in this browser
// (`overloaded.myColor`, a color id) so the solo table, the deck page and home follow it too; until you pick one it stays gold. applyAccent() also runs
// when the theme changes (look-settings.js), because the light theme darkens it.
import { makeSafeStore } from './safe-store.js';
import { accentFor, isColorId } from '../../shared/player-colors.mjs';

const store = makeSafeStore();
const KEY = 'overloaded.myColor';

export function applyAccent(id = store.get(KEY)) {
  const root = document.documentElement;
  if (!isColorId(id) || id === 'gold') { root.style.removeProperty('--gold'); root.style.removeProperty('--gold-ink'); delete root.dataset.accent; return; }
  const { accent, ink } = accentFor(id, root.dataset.theme === 'light' ? 'light' : 'dark');
  root.style.setProperty('--gold', accent);
  root.style.setProperty('--gold-ink', ink);
  root.dataset.accent = id;
}

// Remembers your color (the lobby and the table call it whenever it is known) and shows it.
export function setMyColor(id) {
  if (!isColorId(id)) return;
  if (store.get(KEY) !== id) store.set(KEY, id);
  applyAccent(id);
}
