// Which way the other players' boards face on the Seats table (Kevin, 2026-11-20): "turned" (the default) shows each one as if the player sat across from you, their battlefield upside down with their
// lands along the far edge; "upright" shows it the same way up as yours, easier to read. Kept in this browser; the page reads it from body[data-facing] in the style sheet.
import { makeSafeStore } from './safe-store.js';

export const FACING_KEY = 'overloaded.facing';
// 'turned-all' (2026-11-26 feedback): their hand and piles turn with their board, as if the whole of their side of the table sat across from you (their name strip stays upright).
export const FACINGS = [['turned', 'Turned to face you'], ['turned-all', 'Turned, with hand and piles'], ['upright', 'Upright']];
export const readFacing = (text) => (text === 'upright' || text === 'turned-all' ? text : 'turned');

export function mountFacing(host, { store = makeSafeStore(), body = document.body } = {}) {
  let facing = readFacing(store.get(FACING_KEY));
  body.dataset.facing = facing;
  if (!host) return;
  // a dropdown like the pile styles beside it (Kevin, 2026-11-21: the two radio buttons were drawn apart from their words)
  const label = document.createElement('label');
  const select = document.createElement('select');
  select.id = 'facing-pick';
  for (const [value, words] of FACINGS) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = words;
    option.selected = value === facing;
    select.append(option);
  }
  select.addEventListener('change', () => { facing = readFacing(select.value); store.set(FACING_KEY, facing); body.dataset.facing = facing; });
  label.append("Other players' boards ", select);
  host.append(label);
}
