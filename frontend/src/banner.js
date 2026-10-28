// Puts the table's warning (idle, 8-hour limit, or closed) into one page element. It only sets properties on the
// element it is given (hidden, textContent, dataset.level), so Node tests can run it with a plain object.
// data-level is "quiet" (a gentle note), "urgent" (the 8-hour limit within 10 minutes) or "closed".
import { limitsAt, bannerText, closedText } from '../../shared/table-limits.mjs';

// element: the banner element. now: the SERVER's time in ms. table: { createdAt, lastActive, idleLimit } or null when
// not all of it has arrived yet. formatTime(ms): "3:42 PM" in the player's locale. Returns what limitsAt returned.
export function renderBanner(element, { now, table, formatTime }) {
  const hide = () => { element.hidden = true; element.textContent = ''; delete element.dataset.level; };
  if (!table || !Number.isFinite(table.createdAt) || !Number.isFinite(table.lastActive) || !Number.isFinite(table.idleLimit)) { hide(); return null; }
  const state = limitsAt(now, table);
  if (state.closed) {
    element.hidden = false;
    element.dataset.level = 'closed';
    element.textContent = closedText(state);
  } else if (state.banner) {
    element.hidden = false;
    element.dataset.level = state.banner.urgent ? 'urgent' : 'quiet';
    element.textContent = bannerText(state.banner, state.closesAt, formatTime);
  } else {
    hide();
  }
  return state;
}
