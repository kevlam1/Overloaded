// The player's keys, shared by everything on a page (Kevin, 2026-11-19). One instance: the table pages, the Alt picture and the Settings menu all ask it which action a key press is for, and the Settings menu
// changes it. The keys are kept in this browser (shared/keybinds.mjs has the rules and the saved format) and a change made in another tab is picked up.
import { makeSafeStore } from './safe-store.js';
import { KEYBINDS_KEY, readBinds, writeBinds, matchEvent, labelsOf } from '../../shared/keybinds.mjs';

export function createKeybinds(store = makeSafeStore()) {
  let binds = readBinds(store.get(KEYBINDS_KEY));
  const listeners = new Set();
  const tell = () => { for (const listener of listeners) listener(binds); };
  if (typeof window !== 'undefined') window.addEventListener('storage', (event) => { if (event.key === KEYBINDS_KEY) { binds = readBinds(event.newValue); tell(); } });
  return {
    binds: () => binds,
    // The action a key event is for in a group ('table' or 'picture'), or null.
    match: (group, event) => matchEvent(binds, group, event),
    // The keys of an action as labels, for words on the page ("E or Q taps them").
    labels: (id) => labelsOf(binds, id),
    set(next) { binds = readBinds(writeBinds(next)); store.set(KEYBINDS_KEY, writeBinds(binds)); tell(); },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

export const keybinds = createKeybinds();
