// The first-time help window of each table view (2026-11-26 feedback, step 5). The text and the rules are in shared/view-help.mjs.
// showHelpOnce(view): the first time a view opens in this browser, a small window lists its main keys and controls. "Got it" closes it (it shows again next time);
// "Don't show again" puts it away for good. mountHelpSettings(host): a switch per view in Settings > About, on while that view's help still shows.
import { makeSafeStore } from './safe-store.js';
import { HELP_KEY, HELP, VIEWS, VIEW_TITLES, readSeen, writeSeen, shouldShow, markSeen, unmarkSeen } from '../../shared/view-help.mjs';

const store = makeSafeStore();
const seen = () => readSeen(store.get(HELP_KEY));
const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const shownThisPage = new Set(); // (once per page load: a view that opens again in the same visit does not ask again)
const switches = new Map(); // view -> its checkbox in Settings, kept in step with the window

export function showHelpOnce(view) {
  if (window.__overloadedNoHelp) return false; // (set by the browser checks in scripts/lib/browser.mjs, whose clicks the window would block)
  if (!shouldShow(seen(), view) || shownThisPage.has(view) || document.querySelector('.view-help-overlay')) return false;
  shownThisPage.add(view);
  const help = HELP[view];
  const overlay = make('div', 'confirm-overlay view-help-overlay');
  const box = make('div', 'confirm-box view-help');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-labelledby', 'view-help-title');
  const title = make('h2', 'view-help-title', help.title);
  title.id = 'view-help-title';
  const list = make('dl', 'view-help-list');
  for (const [what, does] of help.lines) list.append(make('dt', '', what), make('dd', '', does));
  const row = make('div', 'confirm-buttons view-help-buttons');
  const never = make('button', 'secondary', "Don't show again");
  never.type = 'button';
  never.id = 'view-help-never';
  const ok = make('button', '', 'Got it');
  ok.type = 'button';
  ok.id = 'view-help-ok';
  row.append(never, ok);
  box.append(title, list, row);
  overlay.append(box);
  const before = document.activeElement;
  const close = (forGood) => {
    if (forGood) { store.set(HELP_KEY, writeSeen(markSeen(seen(), view))); const box2 = switches.get(view); if (box2) box2.checked = false; }
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    if (before instanceof HTMLElement && before.isConnected) before.focus({ preventScroll: true });
  };
  const onKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(false); } };
  ok.addEventListener('click', () => close(false));
  never.addEventListener('click', () => close(true));
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(false); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  ok.focus({ preventScroll: true });
  return true;
}

// A switch per view ("Help for Grid view"): on while that help still shows. Turning one on shows that help again the next time the view opens.
export function mountHelpSettings(host, { views = VIEWS } = {}) {
  if (!host) return;
  const group = make('div', 'help-settings');
  for (const view of views) {
    const label = make('label', 'help-switch');
    const input = make('input');
    input.type = 'checkbox';
    input.id = `help-${view}`;
    input.checked = shouldShow(seen(), view);
    input.addEventListener('change', () => {
      store.set(HELP_KEY, writeSeen(input.checked ? unmarkSeen(seen(), view) : markSeen(seen(), view)));
      if (input.checked) shownThisPage.delete(view);
    });
    switches.set(view, input);
    label.append(input, ` ${VIEW_TITLES[view]}`);
    group.append(label);
  }
  host.replaceChildren(group);
}
