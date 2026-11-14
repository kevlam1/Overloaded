// The Settings menu of the table pages: a gear button that opens a small panel next to it (sound, volume, how piles are drawn). It closes with Escape, with a click outside it, or with the
// button again. The controls inside are mounted by their own modules (sound.js, pile-style.js); this only shows and hides the panel and keeps aria-expanded right.
export function mountSettingsMenu({ button, panel }) {
  if (!button || !panel) return { close() {} };
  const isOpen = () => !panel.hidden;
  function place() {
    const box = button.getBoundingClientRect();
    panel.style.left = '0px';
    panel.style.top = '0px';
    const size = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - size.width - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(box.bottom + 6, window.innerHeight - size.height - 8))}px`;
  }
  function setOpen(open) {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) place();
  }
  button.addEventListener('click', () => setOpen(!isOpen()));
  // Tab opens and closes Settings and does nothing else (Kevin, 2026-11-13): it never moves the focus to a button or a card, whatever is on the page. In a box you type text in, Tab is left alone.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest('textarea, [contenteditable], input:not([type=checkbox]):not([type=range]):not([type=radio]):not([type=button])')) return;
    if (button.offsetParent === null) return; // (the table is not showing: there is no Settings to open)
    event.preventDefault();
    setOpen(!isOpen());
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) { event.stopImmediatePropagation(); setOpen(false); button.focus(); }
  }, true);
  document.addEventListener('click', (event) => {
    if (!isOpen() || panel.contains(event.target) || button.contains(event.target)) return;
    setOpen(false);
  });
  window.addEventListener('resize', () => { if (isOpen()) place(); });
  return { close: () => { if (isOpen()) setOpen(false); } };
}
