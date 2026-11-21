// Tests for shared/keybinds.mjs: which keys can be bound, swapping, saving and reading back, and which action a key event is for. Run: node scripts/test-keybinds.mjs
import { ACTIONS, SECTIONS, actionsFor, SLOTS, defaultBinds, normalizeKey, whyNot, keyLabel, readBinds, writeBinds, bindKey, clearKey, resetAction, resetAll, isDefault, matchEvent, whereBound, labelsOf } from '../shared/keybinds.mjs';

let checks = 0;
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); } };

// ---- keys
same('letters, digits and symbols are keys, in lowercase', ['E', 'e', '7', '?', 'é'].map(normalizeKey), ['e', 'e', '7', '?', 'é']);
same('Tab and F1 to F4 and F6 to F10 are keys, written in lowercase', ['Tab', 'F2', 'F10', 'F1'].map(normalizeKey), ['tab', 'f2', 'f10', 'f1']);
same('Escape, Enter, Space, Backspace, the arrows, F5, F11, F12, the modifiers and nothing are not keys', ['Escape', 'Enter', ' ', 'Backspace', 'Delete', 'ArrowLeft', 'F5', 'F11', 'F12', 'Shift', 'Dead', '', null, undefined, 5].map(normalizeKey), Array(15).fill(null));
same('a key is shown as a capital, a name or a symbol', ['e', 'tab', 'f2', '?', null].map(keyLabel), ['E', 'Tab', 'F2', '?', '']);
same('a few words say why a key cannot be used', [whyNot('e'), whyNot('Escape'), whyNot(' '), whyNot('Shift'), whyNot('F5')], ['', 'Escape cancels.', 'Enter and Space press buttons.', 'Press a key on its own.', 'The browser keeps that key.']);

// ---- the defaults are what the game had before keys could be changed
const defaults = defaultBinds();
same('the defaults: E and Q tap, F flips, D draws, Tab opens Settings, nothing on Untap all and Next turn', [defaults.tap, defaults.flip, defaults.draw, defaults.settings, defaults.untapAll, defaults.nextTurn], [['e', 'q'], ['f', null], ['d', null], ['tab', null], [null, null], [null, null]]);
same('Q and E also turn the big picture (a group of their own)', [defaults.pictureLeft, defaults.pictureRight], [['q', null], ['e', null]]);
same('every action has the right number of slots', ACTIONS.every((action) => defaults[action.id].length === SLOTS), true);

// ---- changing a key
let r = bindKey(defaults, 'draw', 0, 'x');
same('a free key goes on the slot', [r.ok, r.binds.draw, r.swapped, defaults.draw], [true, ['x', null], null, ['d', null]]);
r = bindKey(defaults, 'draw', 0, 'F');
same('a key another action has SWAPS: draw takes F and flip gets D', [r.ok, r.binds.draw, r.binds.flip, r.swapped], [true, ['f', null], ['d', null], 'flip']);
r = bindKey(defaults, 'draw', 1, 'e');
same('a second key for an action that another has: tap loses E, which draw takes in its second slot (tap then has Q first)', [r.binds.draw, r.binds.tap, r.swapped], [['d', 'e'], ['q', null], 'tap']);
r = bindKey(defaults, 'tap', 0, 'q');
same('the same action\'s two slots swap when the key is on its other slot', [r.binds.tap, r.swapped], [['q', 'e'], null]);
r = bindKey(defaults, 'flip', 1, 'z');
same('a second key can be added to an action with one', r.binds.flip, ['f', 'z']);
r = bindKey(defaults, 'pictureLeft', 0, 'e');
same('a key used in the other group is not a conflict (E taps and turns the picture right); within the picture group E swaps (picture right gets Q)', [r.binds.pictureLeft, r.binds.pictureRight, r.binds.tap], [['e', null], ['q', null], ['e', 'q']]);
r = bindKey(defaults, 'draw', 0, 'Escape');
same('a key that cannot be used changes nothing and says why', [r.ok, r.binds === defaults, r.reason], [false, true, 'Escape cancels.']);
same('a slot or an action that does not exist changes nothing', [bindKey(defaults, 'nope', 0, 'x').ok, bindKey(defaults, 'draw', 2, 'x').ok, bindKey(defaults, 'draw', -1, 'x').ok], [false, false, false]);
same('binding the key a slot already has changes nothing', bindKey(defaults, 'draw', 0, 'd').binds.draw, ['d', null]);
same('clearing the first slot moves the second up; clearing the only key leaves none', [clearKey(defaults, 'tap', 0).tap, clearKey(defaults, 'flip', 0).flip], [['q', null], [null, null]]);
same('the old binds are never changed', JSON.stringify(defaultBinds()) === JSON.stringify(defaults), true);

// ---- resetting
let changed = bindKey(bindKey(defaults, 'draw', 0, 'F').binds, 'tap', 0, 'x').binds;
same('Reset on an action gives back its keys that nobody holds (flip has D now, so draw gets nothing; tap gets E and Q back)', [resetAction(changed, 'draw').draw, isDefault(resetAction(changed, 'tap'), 'tap')], [[null, null], true]);
same('Reset all gives every default back', [JSON.stringify(resetAll()) === JSON.stringify(defaults), isDefault(defaults, 'tap'), isDefault(changed, 'draw')], [true, true, false]);
same('Reset on tap restores E, since nobody holds it', resetAction(bindKey(defaults, 'tap', 0, 'x').binds, 'tap').tap, ['e', 'q']);

// ---- saving and reading
same('a round trip keeps every key', readBinds(writeBinds(changed)), changed);
same('nothing saved, junk, and the wrong shape give the defaults', [readBinds(null), readBinds('not json'), readBinds('[]'), readBinds('{"version":2,"binds":{}}'), readBinds('{"version":1}')].map((b) => JSON.stringify(b) === JSON.stringify(defaults)), [true, true, true, true, true]);
same('a cleared action stays cleared (an empty row is a choice, a missing one is the default)', [readBinds('{"version":1,"binds":{"draw":[null,null]}}').draw, readBinds('{"version":1,"binds":{}}').draw], [[null, null], ['d', null]]);
same('keys that cannot be used become empty slots, extra slots are dropped, and a gap is closed', [readBinds('{"version":1,"binds":{"draw":["Enter","x","y"]}}').draw, readBinds('{"version":1,"binds":{"tap":[5,{}]}}').tap], [['x', null], [null, null]]);
same('a key two actions of one group both claim stays with the first', [readBinds('{"version":1,"binds":{"tap":["x",null],"draw":["x",null]}}').tap, readBinds('{"version":1,"binds":{"tap":["x",null],"draw":["x",null]}}').draw], [['x', null], [null, null]]);
same('the same key in two groups is fine', whereBound(readBinds('{"version":1,"binds":{"tap":["x",null],"pictureLeft":["x",null]}}'), 'picture', 'x'), { id: 'pictureLeft', slot: 0 });

// ---- which action a key event is for
const press = (key, extra = {}) => ({ key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, ...extra });
same('E and e (Caps Lock) tap, F flips, D draws, Tab opens Settings', [matchEvent(defaults, 'table', press('e')), matchEvent(defaults, 'table', press('E')), matchEvent(defaults, 'table', press('q')), matchEvent(defaults, 'table', press('f')), matchEvent(defaults, 'table', press('d')), matchEvent(defaults, 'table', press('Tab'))], ['tap', 'tap', 'tap', 'flip', 'draw', 'settings']);
same('with Ctrl, Alt, Meta or Shift held, or held down, a table key does nothing', [press('e', { ctrlKey: true }), press('e', { altKey: true }), press('e', { metaKey: true }), press('e', { shiftKey: true }), press('e', { repeat: true })].map((event) => matchEvent(defaults, 'table', event)), Array(5).fill(null));
same('a key nobody has, and a missing event, are no action', [matchEvent(defaults, 'table', press('z')), matchEvent(defaults, 'table', null), matchEvent(defaults, 'table', press(undefined))], [null, null, null]);
same('for the picture Alt is held and Q and E turn it left and right', [matchEvent(defaults, 'picture', press('q', { altKey: true })), matchEvent(defaults, 'picture', press('E', { altKey: true })), matchEvent(defaults, 'picture', press('q', { altKey: true, ctrlKey: true }))], ['pictureLeft', 'pictureRight', null]);
const moved = bindKey(defaults, 'draw', 0, 'x').binds;
same('after draw moves to X, X draws and D does nothing', [matchEvent(moved, 'table', press('x')), matchEvent(moved, 'table', press('d'))], ['draw', null]);
same('the labels of an action skip empty slots', [labelsOf(defaults, 'tap'), labelsOf(defaults, 'flip'), labelsOf(defaults, 'untapAll')], [['E', 'Q'], ['F'], []]);

// ---- the other actions
same('Shuffle and Mulligan are actions with no key yet', [defaults.shuffle, defaults.mulligan], [[null, null], [null, null]]);
same('every action is listed under a known section', ACTIONS.every((action) => SECTIONS.some((section) => section.id === action.section)), true);
same('both pages sort the hand and have the history; the table page has no stack yet and has Auto-arrange; the solo page has no Auto-arrange', [actionsFor('table').some((a) => a.id === 'sortType'), actionsFor('table').some((a) => a.id === 'history'), actionsFor('table').some((a) => a.id === 'stack'), actionsFor('table').some((a) => a.id === 'arrange'), actionsFor('solo').some((a) => a.id === 'sortType'), actionsFor('solo').some((a) => a.id === 'arrange')], [true, true, false, true, true, false]);
r = bindKey(defaults, 'shuffle', 0, 'd');
same('Shuffle on D swaps with Draw, which then has no key', [r.binds.shuffle, r.binds.draw, r.swapped], [['d', null], [null, null], 'draw']);
same('a key on the new actions matches', matchEvent(bindKey(defaults, 'mulligan', 0, 'm').binds, 'table', press('m')), 'mulligan');

console.log(`All ${checks} keybind checks passed.`);
