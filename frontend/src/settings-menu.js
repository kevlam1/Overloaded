// The Settings menu of the table pages (Kevin, 2026-11-19: a panel in the middle of the window with tabs, instead of one long popup next to the gear): General (sound, piles, the resting hand, the sideboard),
// Hand sorting, Keybinds and About. The controls inside are mounted by their own modules (sound.js, pile-style.js, hand-rest.js, hand-sort-ui.js, keybind-settings.js); this only shows and hides the panel,
// switches the tabs and keeps aria-expanded right. It closes with Escape, the close button, a click outside it, or the gear again, and the Settings key (Tab unless the player chose another) opens and closes it.
import { keybinds } from './keybinds.js';

export function mountSettingsMenu({ button, panel }) {
  if (!button || !panel) return { close() {}, show() {} };
  const isOpen = () => !panel.hidden;
  // A key is being chosen in the Keybinds page: that page hears every key press itself (Escape cancels, Tab can be chosen), so nothing here may act on it.
  const choosingKey = () => panel.querySelector('[data-listening="1"]') !== null;

  // ---- the tabs: a click or the arrow keys (Up and Down, or Left and Right, Home and End) choose a page; only the chosen tab is in the tab order
  const tabs = [...panel.querySelectorAll('[role="tab"]')];
  const pageOf = (tab) => document.getElementById(tab.getAttribute('aria-controls'));
  function showTab(tab, { focus = false } = {}) {
    for (const each of tabs) {
      const chosen = each === tab;
      each.setAttribute('aria-selected', String(chosen));
      each.tabIndex = chosen ? 0 : -1;
      const page = pageOf(each);
      if (page) page.hidden = !chosen;
    }
    if (focus) tab.focus();
  }
  for (const tab of tabs) tab.addEventListener('click', () => showTab(tab));
  panel.querySelector('[role="tablist"]')?.addEventListener('keydown', (event) => {
    const at = tabs.indexOf(document.activeElement);
    if (at === -1) return;
    const next = { ArrowDown: at + 1, ArrowRight: at + 1, ArrowUp: at - 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    showTab(tabs[(next + tabs.length) % tabs.length], { focus: true });
  });

  function setOpen(open) {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  }
  button.addEventListener('click', () => setOpen(!isOpen()));
  panel.querySelector('#settings-close')?.addEventListener('click', () => { setOpen(false); button.focus(); });
  // The Settings key opens and closes Settings and does nothing else (Kevin, 2026-11-13): it never moves the focus to a button or a card. In a box you type text in, it is left alone.
  document.addEventListener('keydown', (event) => {
    if (choosingKey()) return;
    if (keybinds.match('table', event) !== 'settings') return;
    if (event.target instanceof Element && event.target.closest('textarea, [contenteditable], input:not([type=checkbox]):not([type=range]):not([type=radio]):not([type=button])')) return;
    if (button.offsetParent === null) return; // (the table is not showing: there is no Settings to open)
    event.preventDefault();
    setOpen(!isOpen());
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen() && !choosingKey()) { event.stopImmediatePropagation(); setOpen(false); button.focus(); }
  }, true);
  document.addEventListener('click', (event) => {
    if (!isOpen() || panel.contains(event.target) || event.target.closest?.('.confirm-overlay') || button.contains(event.target)) return;
    setOpen(false);
  });
  return { close: () => { if (isOpen()) setOpen(false); }, show: (name) => { const tab = tabs.find((each) => each.dataset.tab === name); if (tab) showTab(tab); setOpen(true); } };
}
