// The Settings menu of the table pages: a gear button that opens a small panel next to it (sound, volume, how piles are drawn). It closes with Escape, with a click outside it, or with the
// button again. The controls inside are mounted by their own modules (sound.js, pile-style.js); this only shows and hides the panel and keeps aria-expanded right.
export function mountSettingsMenu({ button, panel }) {
  if (!button || !panel) return;
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
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) { event.stopImmediatePropagation(); setOpen(false); button.focus(); }
  }, true);
  document.addEventListener('click', (event) => {
    if (!isOpen() || panel.contains(event.target) || button.contains(event.target)) return;
    setOpen(false);
  });
  window.addEventListener('resize', () => { if (isOpen()) place(); });
}
