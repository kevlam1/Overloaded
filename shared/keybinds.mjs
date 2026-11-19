// Rebindable keys (Kevin, 2026-11-19). Plain JavaScript with no browser code, so Node tests can load it (scripts/test-keybinds.mjs). The pages never test `event.key` against a letter: they ask this module which
// ACTION an event is for ("tap", "draw", ...), and the Settings menu lets the player put each action on other keys.
//
// An action has two slots, a first and an alternate key (tap has E and Q). A key is one printable character (a letter, a digit, a symbol), Tab, or F1 to F4 and F6 to F10, written in lowercase ("e", "tab", "f2").
// A key may be on only one action of the same group; asking for a key that another action has SWAPS them (the other action gets the key this slot had, or an empty slot). Groups: "table" (keys pressed on the
// table) and "picture" (keys pressed while Alt shows the big picture of a card), so Q can tap a card and also turn a picture.
export const KEYBINDS_KEY = 'overloaded.keybinds';
export const SLOTS = 2;
// The headings of the list in Settings, in order. An action's `section` says where it is listed; its `group` says which keys it may not share ("table": keys pressed on the table, "picture": keys pressed while Alt
// shows the big picture). `pages` (when it is not both) says where the action exists: the table page has no hand sorting, game history or stack window.
export const SECTIONS = [
  { id: 'cards', title: 'Cards' },
  { id: 'turn', title: 'Turn' },
  { id: 'table', title: 'Table' },
  { id: 'piles', title: 'Piles' },
  { id: 'sort', title: 'Hand sorting' },
  { id: 'windows', title: 'Windows' },
  { id: 'picture', title: 'While Alt shows the big picture' },
];

const none = [null, null];
export const ACTIONS = [
  { id: 'tap', section: 'cards', group: 'table', label: 'Tap or untap', hint: 'The card under the pointer, or the cards you picked.', defaults: ['e', 'q'] },
  { id: 'flip', section: 'cards', group: 'table', label: 'Flip face down', hint: 'The same cards, to the sleeve and back.', defaults: ['f', null] },
  { id: 'draw', section: 'turn', group: 'table', label: 'Draw a card', hint: '', defaults: ['d', null] },
  { id: 'nextTurn', section: 'turn', group: 'table', label: 'Next turn', hint: 'Like the Next turn button (Pass turn at a table).', defaults: none },
  { id: 'untapAll', section: 'turn', group: 'table', label: 'Untap all', hint: 'Like the Untap all button.', defaults: none },
  { id: 'mulligan', section: 'turn', group: 'table', label: 'Mulligan', hint: 'Like the Mulligan button.', defaults: none },
  { id: 'shuffle', section: 'turn', group: 'table', label: 'Shuffle your library', hint: '', defaults: none },
  { id: 'arrange', section: 'table', group: 'table', pages: ['table'], label: 'Auto-arrange', hint: 'Tidy your battlefield.', defaults: none },
  { id: 'lifeUp', section: 'table', group: 'table', label: 'Gain 1 life', hint: '', defaults: none },
  { id: 'lifeDown', section: 'table', group: 'table', label: 'Lose 1 life', hint: '', defaults: none },
  { id: 'viewLibrary', section: 'piles', group: 'table', label: 'Open your library', hint: '', defaults: none },
  { id: 'viewGraveyard', section: 'piles', group: 'table', label: 'Open your graveyard', hint: '', defaults: none },
  { id: 'viewExile', section: 'piles', group: 'table', label: 'Open your exile', hint: '', defaults: none },
  { id: 'sortType', section: 'sort', group: 'table', pages: ['solo'], label: 'Sort by type', hint: 'Like the Type button under your hand.', defaults: none },
  { id: 'sortColor', section: 'sort', group: 'table', pages: ['solo'], label: 'Sort by color', hint: '', defaults: none },
  { id: 'sortCost', section: 'sort', group: 'table', pages: ['solo'], label: 'Sort by cost', hint: '', defaults: none },
  { id: 'sortName', section: 'sort', group: 'table', pages: ['solo'], label: 'Sort A-Z', hint: '', defaults: none },
  { id: 'autoSort', section: 'sort', group: 'table', pages: ['solo'], label: 'Auto sort on or off', hint: 'Like the Auto button.', defaults: none },
  { id: 'settings', section: 'windows', group: 'table', label: 'Open or close Settings', hint: '', defaults: ['tab', null] },
  { id: 'history', section: 'windows', group: 'table', pages: ['solo'], label: 'Open or close game history', hint: '', defaults: none },
  { id: 'stack', section: 'windows', group: 'table', pages: ['solo'], label: 'Open or close the stack', hint: '', defaults: none },
  { id: 'pictureLeft', section: 'picture', group: 'picture', label: 'Turn the picture left', hint: 'For a room, a battle or any card read sideways.', defaults: ['q', null] },
  { id: 'pictureRight', section: 'picture', group: 'picture', label: 'Turn the picture right', hint: '', defaults: ['e', null] },
];
// The actions that exist on a page ('solo' or 'table').
export const actionsFor = (page) => ACTIONS.filter((action) => !action.pages || action.pages.includes(page));
const BY_ID = new Map(ACTIONS.map((action) => [action.id, action]));
export const actionById = (id) => BY_ID.get(id) ?? null;

// Keys that are never bound: they have a job of their own (Escape cancels, Enter and Space press the focused button, Backspace and Delete are how a slot is cleared, the arrows and paging keys move things),
// or the browser owns them (F5, F11, F12), or they are not keys on their own (the modifiers, Caps Lock, dead keys).
const NAMED = new Set(['tab', 'f1', 'f2', 'f3', 'f4', 'f6', 'f7', 'f8', 'f9', 'f10']);

// What a pressed key is called here, or null when it cannot be bound. `raw` is event.key.
export function normalizeKey(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const lower = raw.toLowerCase();
  if (NAMED.has(lower)) return lower;
  const characters = [...raw];
  if (characters.length !== 1) return null; // (a name such as "Escape", "Enter", "ArrowLeft", "Dead", "Shift" is more than one character)
  const [character] = characters;
  if (/\s/.test(character) || /[\u0000-\u001f\u007f]/.test(character)) return null; // (Space and control characters)
  return character.toLowerCase();
}

// Why a key cannot be bound, in a few words (for the Settings menu), or '' when it can.
export function whyNot(raw) {
  if (normalizeKey(raw) !== null) return '';
  if (raw === 'Escape') return 'Escape cancels.';
  if (raw === 'Enter' || raw === ' ') return 'Enter and Space press buttons.';
  if (typeof raw === 'string' && /^(Shift|Control|Alt|Meta|AltGraph|CapsLock|NumLock|ScrollLock|Dead|Process|Unidentified)$/.test(raw)) return 'Press a key on its own.';
  if (typeof raw === 'string' && /^(F5|F11|F12)$/.test(raw)) return 'The browser keeps that key.';
  return 'That key cannot be used.';
}

// How a key is shown: "E", "Tab", "F2", "?".
export function keyLabel(key) {
  if (key === null || key === undefined) return '';
  if (key === 'tab') return 'Tab';
  if (/^f\d+$/.test(key)) return key.toUpperCase();
  return [...key][0].toUpperCase();
}

const emptyRow = () => Array.from({ length: SLOTS }, () => null);
const cloneBinds = (binds) => Object.fromEntries(ACTIONS.map((action) => [action.id, (binds?.[action.id] ?? emptyRow()).slice(0, SLOTS)]));
export const defaultBinds = () => Object.fromEntries(ACTIONS.map((action) => [action.id, action.defaults.slice()]));

// The saved text back into binds. It never throws and never trusts it: anything wrong falls back to the default of that action, a key that is not allowed is an empty slot, and a key that two actions of one group
// both claim stays with the first (in the order of ACTIONS), so the result always follows the rules above.
export function readBinds(text) {
  let saved = null;
  try { saved = JSON.parse(text); } catch { /* damaged or missing: the defaults */ }
  const stored = saved && typeof saved === 'object' && saved.version === 1 && saved.binds && typeof saved.binds === 'object' && !Array.isArray(saved.binds) ? saved.binds : {};
  const binds = {};
  const taken = new Map(); // group + key -> true
  for (const action of ACTIONS) {
    const row = stored[action.id];
    let slots = Array.isArray(row) ? Array.from({ length: SLOTS }, (_, n) => normalizeKey(row[n])) : action.defaults.slice();
    slots = slots.map((key) => {
      if (key === null) return null;
      const id = `${action.group}|${key}`;
      if (taken.has(id)) return null;
      taken.set(id, true);
      return key;
    });
    if (slots[0] === null && slots[1] !== null) slots = [slots[1], null]; // (no gap before a key)
    binds[action.id] = slots;
  }
  return binds;
}

export const writeBinds = (binds) => JSON.stringify({ version: 1, binds: cloneBinds(binds) });

// Where a key is bound in a group: { id, slot } or null.
export function whereBound(binds, group, key) {
  if (key === null) return null;
  for (const action of ACTIONS) {
    if (action.group !== group) continue;
    const slot = (binds[action.id] ?? []).indexOf(key);
    if (slot !== -1) return { id: action.id, slot };
  }
  return null;
}

// Puts the key that was pressed (`raw`, event.key) on a slot of an action. Returns { binds, ok, swapped, reason }: the new binds (the old ones are never changed), whether it worked, the id of the action that
// gave up the key and took this slot's old key (null when there was none), and why not.
export function bindKey(binds, id, slot, raw) {
  const action = actionById(id);
  if (!action || !Number.isInteger(slot) || slot < 0 || slot >= SLOTS) return { binds, ok: false, swapped: null, reason: 'That slot does not exist.' };
  const key = normalizeKey(raw);
  if (key === null) return { binds, ok: false, swapped: null, reason: whyNot(raw) };
  const next = cloneBinds(binds);
  const old = next[id][slot];
  if (old === key) return { binds: next, ok: true, swapped: null, reason: '' };
  const holder = whereBound(next, action.group, key);
  let swapped = null;
  if (holder) {
    next[holder.id][holder.slot] = old; // the other slot takes the key this one had (or becomes empty)
    if (holder.id !== id) swapped = holder.id;
  }
  next[id][slot] = key;
  return { binds: tidy(next, [id, holder?.id]), ok: true, swapped, reason: '' };
}

// An empty first slot with a key in the second moves the key up, so the first slot is the one that is filled first.
function tidy(binds, ids) {
  for (const id of ids) if (id && binds[id][0] === null && binds[id][1] !== null) binds[id] = [binds[id][1], null];
  return binds;
}

export function clearKey(binds, id, slot) {
  const next = cloneBinds(binds);
  if (!next[id] || !Number.isInteger(slot) || slot < 0 || slot >= SLOTS) return next;
  next[id][slot] = null;
  return tidy(next, [id]);
}

export function resetAction(binds, id) {
  const action = actionById(id);
  if (!action) return cloneBinds(binds);
  // A default key that another action has taken now is not given back to this one (it would take it away): only the keys nobody holds in the group come back.
  const next = cloneBinds(binds);
  next[id] = emptyRow();
  action.defaults.forEach((key, slot) => { if (key !== null && !whereBound(next, action.group, key)) next[id][slot] = key; });
  return tidy(next, [id]);
}
export const resetAll = () => defaultBinds();
export const isDefault = (binds, id) => JSON.stringify(binds[id]) === JSON.stringify(actionById(id)?.defaults);

// The action a key event is for in a group, or null. On the table a key must be pressed alone (no Ctrl, Alt, Meta or Shift) and not be held down; for the picture, Alt is down (that is what shows it), Ctrl and Meta
// are not, and Shift is ignored.
export function matchEvent(binds, group, event) {
  if (!event || event.ctrlKey || event.metaKey) return null;
  if (group === 'table' && (event.altKey || event.shiftKey || event.repeat)) return null;
  const key = normalizeKey(event.key);
  const found = whereBound(binds, group, key);
  return found ? found.id : null;
}

// The keys of an action as labels ("E", "Q"), skipping empty slots.
export const labelsOf = (binds, id) => (binds[id] ?? []).filter((key) => key !== null).map(keyLabel);
