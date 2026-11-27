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
    if (open && peekPill) peekPill.hidden = true; // (opened again any way: the "Back to Settings" pill goes)
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  }
  button.addEventListener('click', () => { if (peekPill && !peekPill.hidden) { peekPill.hidden = true; } setOpen(!isOpen()); });
  // An eye button beside the close button hides Settings to see the board, and a "Back to Settings" pill at the top centre brings it back (Kevin's friends, 2026-11-26:
  // like the pile windows' eye). Built here, so every page with Settings gets it.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const eyeIcon = () => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    for (const [name, value] of [['width', '18'], ['height', '18'], ['viewBox', '0 0 24 24'], ['fill', 'none'], ['aria-hidden', 'true']]) svg.setAttribute(name, value);
    const lid = document.createElementNS(SVG_NS, 'path');
    for (const [name, value] of [['d', 'M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linejoin', 'round'], ['fill', 'none']]) lid.setAttribute(name, value);
    const pupil = document.createElementNS(SVG_NS, 'circle');
    for (const [name, value] of [['cx', '12'], ['cy', '12'], ['r', '3'], ['fill', 'currentColor']]) pupil.setAttribute(name, value);
    svg.append(lid, pupil);
    return svg;
  };
  const closeButton = panel.querySelector('#settings-close');
  let peekPill = null;
  if (closeButton) {
    const eye = document.createElement('button');
    eye.type = 'button'; eye.id = 'settings-eye'; eye.className = 'settings-close secondary settings-eye';
    eye.title = 'Hide to see the board'; eye.setAttribute('aria-label', 'Hide Settings to see the board');
    eye.append(eyeIcon());
    closeButton.before(eye);
    peekPill = document.createElement('button');
    peekPill.type = 'button'; peekPill.id = 'settings-peek'; peekPill.className = 'viewer-peek'; peekPill.hidden = true;
    const words = document.createElement('span'); words.textContent = 'Back to Settings';
    peekPill.append(eyeIcon(), words);
    document.body.append(peekPill);
    eye.addEventListener('click', () => { setOpen(false); peekPill.hidden = false; peekPill.focus(); });
    peekPill.addEventListener('click', () => { peekPill.hidden = true; setOpen(true); eye.focus(); });
  }
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
  // (a pill being dragged in Hand sorting takes Escape itself: it goes back to its place)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen() && !choosingKey() && !panel.querySelector('.is-dragging')) { event.stopImmediatePropagation(); setOpen(false); button.focus(); }
  }, true);
  document.addEventListener('click', (event) => {
    if (!isOpen() || panel.contains(event.target) || event.target.closest?.('.confirm-overlay') || button.contains(event.target) || peekPill?.contains(event.target)) return; // (the pill's own click opened it)
    setOpen(false);
  });
  return { close: () => { if (isOpen()) setOpen(false); }, show: (name) => { const tab = tabs.find((each) => each.dataset.tab === name); if (tab) showTab(tab); setOpen(true); } };
}
