// Which way the other players' boards face on the Seats table (Kevin, 2026-11-20): "turned" (the default) shows each one as if the player sat across from you, their battlefield upside down with their
// lands along the far edge; "upright" shows it the same way up as yours, easier to read. Kept in this browser; the page reads it from body[data-facing] in the style sheet.
import { makeSafeStore } from './safe-store.js';

export const FACING_KEY = 'overloaded.facing';
export const FACINGS = [['turned', 'Turned to face you'], ['upright', 'Upright']];
export const readFacing = (text) => (text === 'upright' ? 'upright' : 'turned');

export function mountFacing(host, { store = makeSafeStore(), body = document.body } = {}) {
  let facing = readFacing(store.get(FACING_KEY));
  body.dataset.facing = facing;
  if (!host) return;
  const group = document.createElement('div');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', "Other players' boards");
  for (const [value, words] of FACINGS) {
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'facing';
    radio.value = value;
    radio.id = `facing-${value}`;
    radio.checked = value === facing;
    radio.addEventListener('change', () => { if (!radio.checked) return; facing = value; store.set(FACING_KEY, value); body.dataset.facing = value; });
    label.append(radio, ` ${words}`);
    group.append(label);
  }
  host.append(group);
}
