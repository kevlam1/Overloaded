// The Keybinds page of Settings (Kevin, 2026-11-19): every action and its keys, to change. Click a key, then press the one you want; if another action already has it the two SWAP; Backspace or Delete empties
// the key; Escape cancels. Each action has two keys (a first and an alternate). The rules are in shared/keybinds.mjs, the saved keys in src/keybinds.js; this only draws the list and listens for the key.
import { SECTIONS, SLOTS, actionById, actionsFor, bindKey, clearKey, resetAction, resetAll, isDefault, keyLabel, normalizeKey } from '../../shared/keybinds.mjs';
import { askConfirm } from './confirm-box.js';

export const HOLD_MS = 2000; // a Reset button works only when it is held this long


const make = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };

const SVG_NS = 'http://www.w3.org/2000/svg';
function resetIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [name, value] of [['viewBox', '0 0 16 16'], ['width', '14'], ['height', '14'], ['fill', 'none'], ['aria-hidden', 'true'], ['focusable', 'false']]) svg.setAttribute(name, value);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M3 8a5 5 0 1 0 1.6-3.7M3 2.6V5.4h2.8');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('fill', 'none');
  svg.append(path);
  return svg;
}

// A button that does its thing only when held for HOLD_MS (mouse, touch, or Enter / Space held): a click does nothing. data-holding="1" runs the fill that shows the time left.
function holdToConfirm(button, done) {
  let timer = null;
  const stop = () => { clearTimeout(timer); timer = null; button.removeAttribute('data-holding'); };
  const start = () => { if (timer !== null || button.disabled) return; button.dataset.holding = '1'; timer = setTimeout(() => { stop(); done(); }, HOLD_MS); };
  button.addEventListener('pointerdown', (event) => { if (event.button === 0) start(); });
  for (const name of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) button.addEventListener(name, stop);
  button.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!event.repeat) start(); } });
  button.addEventListener('keyup', stop);
}

// host: an empty element. keybinds: the instance of src/keybinds.js.
export function mountKeybindSettings(host, { keybinds, page = 'solo' }) {
  if (!host) return;
  const ACTIONS = actionsFor(page);
  let listening = null; // { id, slot, button } while a key is being chosen
  const status = make('p', 'kb-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const say = (words) => { status.textContent = words; };
  const labelOf = (id) => actionById(id)?.label ?? id;

  function stopListening() {
    if (!listening) return;
    listening.button.removeAttribute('data-listening');
    listening = null;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onPointer, true);
  }
  // Every key press while one is being chosen belongs to this page (it is heard on the window, before anything else): the key is chosen, emptied or refused, and nothing else on the page acts on it.
  function onKey(event) {
    if (!listening) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === 'Escape') { const { button } = listening; stopListening(); say('Cancelled.'); draw(); button.focus?.(); return; }
    if (['Shift', 'Control', 'Alt', 'Meta', 'AltGraph'].includes(event.key)) return; // a modifier on its own: wait for the key
    const { id, slot } = listening;
    if (event.key === 'Backspace' || event.key === 'Delete') {
      keybinds.set(clearKey(keybinds.binds(), id, slot));
      stopListening();
      say(`${labelOf(id)}: key ${slot + 1} is empty.`);
      draw(id, slot);
      return;
    }
    if (event.shiftKey) { say('Press the key on its own, without Shift.'); return; }
    const result = bindKey(keybinds.binds(), id, slot, event.key);
    if (!result.ok) { say(result.reason); return; } // (still listening: try another key)
    if (result.swapped) { confirmSwap(id, slot, event.key, result); return; }
    finish(id, slot, result);
  }
  // A key another action has: ask before the two swap (Kevin, 2026-11-19).
  async function confirmSwap(id, slot, raw, result) {
    const { button } = listening;
    stopListening();
    const key = keyLabel(normalizeKey(raw));
    const holder = result.swapped;
    const gets = keybinds.binds()[id][slot];
    const yes = await askConfirm({ title: `${key} is already used`, message: `${labelOf(holder)} has ${key}. Swap? ${labelOf(id)} gets ${key}, and ${labelOf(holder)} ${gets ? 'gets ' + keyLabel(gets) : 'gets no key'}.`, confirmLabel: 'Swap', returnFocus: button });
    if (!yes) { say('Not changed.'); draw(id, slot); return; }
    finish(id, slot, bindKey(keybinds.binds(), id, slot, raw));
  }
  function finish(id, slot, result) {
    keybinds.set(result.binds);
    stopListening();
    const row = result.binds[id].filter((key) => key !== null).map(keyLabel).join(' and ');
    say(result.swapped
      ? `${labelOf(id)} is on ${row}. ${labelOf(result.swapped)} is now on ${result.binds[result.swapped].filter((key) => key !== null).map(keyLabel).join(' and ') || 'no key'}.`
      : `${labelOf(id)} is on ${row}.`);
    draw(id, slot);
  }
  function onPointer(event) { if (listening && !listening.button.contains(event.target)) { stopListening(); say(''); draw(); } }

  function startListening(id, slot, button) {
    stopListening();
    listening = { id, slot, button };
    button.dataset.listening = '1';
    button.textContent = 'Press a key';
    say(`Press the key for ${labelOf(id)}. Backspace empties it, Escape cancels.`);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
  }

  function keyButton(action, slot) {
    const key = keybinds.binds()[action.id][slot];
    const button = make('button', key === null ? 'kb-key kb-empty' : 'kb-key', key === null ? 'Add key' : keyLabel(key));
    button.type = 'button';
    button.dataset.action = action.id;
    button.dataset.slot = String(slot);
    button.setAttribute('aria-label', key === null ? `${action.label}: add a key` : `${action.label}: key ${keyLabel(key)}. Press to change it`);
    button.addEventListener('click', () => startListening(action.id, slot, button));
    return button;
  }

  // Draws the whole list again (the keys are what they are saved as); the key that was just changed gets the focus back.
  function draw(focusId = null, focusSlot = 0) {
    const groups = SECTIONS.map((group) => {
      const actions = ACTIONS.filter((each) => each.section === group.id);
      if (actions.length === 0) return null;
      const section = make('div', 'kb-group');
      section.append(make('h4', 'kb-group-title', group.title));
      const list = make('ul', 'kb-list');
      for (const action of actions) {
        const row = make('li', 'kb-row');
        row.dataset.action = action.id;
        const name = make('div', 'kb-name');
        name.append(make('strong', '', action.label));
        if (action.hint) name.append(make('span', 'kb-hint', action.hint));
        const keys = make('div', 'kb-keys');
        for (let slot = 0; slot < SLOTS; slot++) keys.append(keyButton(action, slot));
        const reset = make('button', 'kb-reset secondary');
        reset.type = 'button';
        reset.dataset.action = action.id;
        reset.disabled = isDefault(keybinds.binds(), action.id);
        reset.title = reset.disabled ? 'Already the default keys' : 'Hold 2 seconds: back to the default keys';
        reset.setAttribute('aria-label', `Reset ${action.label} to its default keys (hold 2 seconds)`);
        reset.append(resetIcon());
        holdToConfirm(reset, () => { keybinds.set(resetAction(keybinds.binds(), action.id)); say(`${action.label} is back to its default keys.`); draw(); });
        row.append(name, keys, reset);
        list.append(row);
      }
      section.append(list);
      return section;
    }).filter(Boolean);
    const intro = make('p', 'kb-intro', 'Click a key, then press the one you want. Backspace empties a key, Escape cancels. Hold a reset button for 2 seconds.');
    const foot = make('div', 'kb-foot');
    const all = make('button', 'secondary', 'Reset all keybinds (hold)');
    all.type = 'button';
    all.id = 'kb-reset-all';
    all.disabled = ACTIONS.every((action) => isDefault(keybinds.binds(), action.id));
    all.title = 'Hold 2 seconds';
    holdToConfirm(all, () => { keybinds.set(resetAll()); say('Every key is back to its default.'); draw(); });
    foot.append(all, status);
    host.replaceChildren(intro, ...groups, foot);
    if (focusId) host.querySelector(`.kb-key[data-action="${focusId}"][data-slot="${focusSlot}"]`)?.focus();
  }

  keybinds.onChange(() => { if (!listening) draw(); }); // (a change made in another tab)
  draw();
}
