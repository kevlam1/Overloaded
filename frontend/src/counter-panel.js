// The counters panel that opens under your life total on the table page (Kevin, 2026-11-20): commander damage you have taken from each seat with a commander (the player and their
// commander), then your counters (poison and so on), each line with a minus, the number and a plus; Shift changes it by 5. It stays open while you change numbers, and closes on
// Escape, a click outside it, or a second press on the button that opened it. The lines come from shared/player-counters.mjs counterPanelRows; the page does the change.
// Plain DOM, no dependencies. Names are other people's text: put in as text, never as markup.

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

// anchor: the button that opens it. groups(): the groups to show now. onStep(id, delta): a minus or a plus was pressed (id as in counterPanelRows). onClose(): it closed.
// Returns { update(), close(), isOpen() }.
export function createCounterPanel({ anchor, groups, onStep, onClose = () => {} }) {
  let panel = null;
  const outside = (event) => { if (panel && !panel.contains(event.target) && !anchor.contains(event.target)) close(); };
  const keys = (event) => { if (event.key === 'Escape' && panel) { event.preventDefault(); close(); anchor.focus({ preventScroll: true }); } };

  function draw() {
    if (!panel) return;
    const focusedId = document.activeElement?.closest?.('.cp-row')?.dataset.id ?? null;
    const focusedStep = document.activeElement?.dataset?.step ?? null;
    panel.replaceChildren();
    const all = groups();
    if (!all.length) panel.append(make('p', 'cp-empty', 'Nothing to count.'));
    for (const group of all) {
      panel.append(make('h3', 'cp-title', group.title));
      for (const row of group.rows) {
        const line = make('div', `cp-row${row.lethal ? ' lethal' : ''}`);
        line.dataset.id = row.id;
        const words = make('div', 'cp-words');
        words.append(make('span', 'cp-label', row.label));
        if (row.detail) words.append(make('span', 'cp-detail', row.detail));
        const minus = make('button', 'cp-step', '−');
        minus.type = 'button'; minus.dataset.step = '-1'; minus.setAttribute('aria-label', `${row.label}${row.detail ? ` (${row.detail})` : ''}: less`);
        const count = make('span', 'cp-count', String(row.count));
        count.setAttribute('aria-label', `${row.label}: ${row.count}${row.lethal ? ', lethal' : ''}`);
        const plus = make('button', 'cp-step', '+');
        plus.type = 'button'; plus.dataset.step = '1'; plus.setAttribute('aria-label', `${row.label}${row.detail ? ` (${row.detail})` : ''}: more`);
        for (const button of [minus, plus]) button.addEventListener('click', (event) => onStep(row.id, Number(button.dataset.step) * (event.shiftKey ? 5 : 1)));
        line.append(words, minus, count, plus);
        panel.append(line);
        if (row.id === focusedId) queueMicrotask(() => line.querySelector(`[data-step="${focusedStep}"]`)?.focus({ preventScroll: true })); // a redrawn line keeps the pressed button focused
      }
    }
    put();
  }
  function put() {
    const at = anchor.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const room = document.documentElement;
    const below = at.bottom + 4 + box.height <= room.clientHeight - 8;
    panel.style.left = `${Math.max(8, Math.min(at.left, room.clientWidth - box.width - 8))}px`;
    panel.style.top = `${Math.max(8, below ? at.bottom + 4 : at.top - 4 - box.height)}px`;
  }
  function open() {
    if (panel) return;
    panel = make('div', 'counter-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Counters and commander damage');
    document.body.append(panel);
    anchor.setAttribute('aria-expanded', 'true');
    draw();
    panel.querySelector('.cp-step')?.focus({ preventScroll: true });
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0); // (not the press that opened it)
    document.addEventListener('keydown', keys);
  }
  function close() {
    if (!panel) return;
    panel.remove();
    panel = null;
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', keys);
    onClose();
  }
  anchor.addEventListener('click', () => (panel ? close() : open()));
  return { update: draw, close, isOpen: () => panel !== null };
}
