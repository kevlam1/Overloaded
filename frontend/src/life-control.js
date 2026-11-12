// The life total as a control (shared/life-input.mjs has the rules): the number itself is a button. Left click +1, right click -1, Shift for 5, and holding it sets the total: a circle fills
// while it is held, and when it is full a small box opens to type the new total in. The keyboard works too (arrow keys, Enter). Plain DOM, no dependencies.
// button: the number's <button>. onDelta(change) and onSet(value) change the game; say(text, isError) shows a message.
import { lifeDelta, lifeKeyDelta, parseLife, HOLD_MS, LIFE_HINT } from '../../shared/life-input.mjs';

const SVG = 'http://www.w3.org/2000/svg';

export function mountLifeControl({ button, onDelta, onSet, say = () => {}, holdMs = HOLD_MS }) {
  const wrap = button.parentElement;
  wrap.classList.add('life-number-wrap');
  button.classList.add('life-number');
  button.title = LIFE_HINT;

  // the circle that fills while the number is held (width, height and fill set directly, as for every inline picture here)
  const ring = document.createElementNS(SVG, 'svg');
  ring.setAttribute('class', 'life-ring');
  ring.setAttribute('width', '26');
  ring.setAttribute('height', '26');
  ring.setAttribute('viewBox', '0 0 26 26');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('aria-hidden', 'true');
  const circle = document.createElementNS(SVG, 'circle');
  circle.setAttribute('cx', '13');
  circle.setAttribute('cy', '13');
  circle.setAttribute('r', '11');
  circle.setAttribute('fill', 'none');
  ring.append(circle);
  wrap.append(ring);
  ring.style.setProperty('--hold', `${holdMs}ms`);

  let timer = null; // set while the number is held and the circle is filling
  let held = false; // the hold finished: the box is open, and the release that follows is not a click
  let editor = null; // the box to type in, while it is open

  const stopHold = () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    ring.classList.remove('holding');
  };

  function closeEditor(refocus = true) {
    if (!editor) return;
    const box = editor;
    editor = null;
    box.remove();
    button.hidden = false;
    wrap.classList.remove('editing');
    if (refocus) button.focus();
  }

  function openEditor() {
    if (editor) return;
    const box = document.createElement('input');
    box.type = 'text';
    box.inputMode = 'numeric';
    box.className = 'life-input';
    box.value = button.textContent.trim();
    box.setAttribute('aria-label', 'Set your life total, then press Enter');
    box.autocomplete = 'off';
    editor = box;
    button.hidden = true;
    wrap.classList.add('editing');
    wrap.append(box);
    box.focus();
    box.select();
    box.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const value = parseLife(box.value);
        if (value === null) { say('Type a whole number for your life total.', true); return; }
        closeEditor();
        onSet(value);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeEditor();
      }
    });
    box.addEventListener('blur', () => closeEditor(false));
  }

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    held = false;
    stopHold();
    void ring.getBoundingClientRect(); // restart the circle's animation
    ring.classList.add('holding');
    timer = setTimeout(() => { timer = null; held = true; ring.classList.remove('holding'); openEditor(); }, holdMs);
  });
  button.addEventListener('pointerup', (event) => {
    if (event.button !== 0) return;
    const wasHolding = timer !== null;
    stopHold();
    if (wasHolding && !held) onDelta(lifeDelta({ button: 0, shiftKey: event.shiftKey }));
  });
  for (const type of ['pointerleave', 'pointercancel']) button.addEventListener(type, () => { stopHold(); });
  // the click that follows a release is already handled by pointerup; a click with no pointer (the keyboard's Space or Enter on a button) is handled by keydown below
  button.addEventListener('click', (event) => { event.preventDefault(); });
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation(); // the menu of counters belongs to the rest of the life area, not to the number
    stopHold();
    const change = lifeDelta({ button: 2, shiftKey: event.shiftKey });
    if (change !== null) onDelta(change);
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEditor(); return; }
    const change = lifeKeyDelta(event.key, event.shiftKey);
    if (change !== null) { event.preventDefault(); onDelta(change); }
  });

  return { openEditor, closeEditor };
}
