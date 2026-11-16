// Tests for shared/counter-catalog.mjs (the kinds of counter in the "Add counter" menu) and for named counters in shared/zones.mjs, shared/marks.mjs and shared/card-menu.mjs.
import { FIXED, KEYWORD_COUNTERS, COUNTER_ICONS, counterLabel, isCounterKey, counterIcon, slugOf, counterMenuItems, COUNTER_CATALOG_SIZE } from '../shared/counter-catalog.mjs';
import { MANA_ICONS } from '../shared/mana-icons.mjs';
import { makeGame, moveCard, changeCounter, checkGame, seededRandom, MAX_COUNTER_KINDS, isCounterKind } from '../shared/zones.mjs';
import { counterChips, markClick } from '../shared/marks.mjs';
import { menuItems, menuAction } from '../shared/card-menu.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };
const refused = (label, run, pattern) => { checks++; let message = null; try { run(); } catch (error) { message = error.message; } if (message === null) fail(label, 'it did not throw'); else if (!pattern.test(message)) fail(label, `wrong message: ${message}`); };

// the catalog
const items = counterMenuItems();
const keys = items.map((i) => i.id.slice('counteradd:'.length));
same('the menu starts with Custom..., then +1/+1 and -1/-1, then the keyword counters, then Loyalty, Charge and Time', items.slice(1, 3 + KEYWORD_COUNTERS.length + 3).map((i) => i.label), ['+1/+1', '-1/-1', 'Flying', 'First strike', 'Double strike', 'Deathtouch', 'Haste', 'Hexproof', 'Indestructible', 'Lifelink', 'Menace', 'Reach', 'Shadow', 'Trample', 'Vigilance', 'Loyalty', 'Charge', 'Time']);
same('Custom... is the first line', items[0], { id: 'counteradd:custom', label: 'Custom...' });
same('the size is the lines without Custom', [items.length - 1, COUNTER_CATALOG_SIZE], [COUNTER_CATALOG_SIZE, COUNTER_CATALOG_SIZE]);
check('no kind is twice, every kind is a counter a card may hold, and every label is words', new Set(keys).size === keys.length && keys.slice(1).every((k) => isCounterKey(k)) && items.every((i) => i.label.length > 0));
check('every icon named is a Mana icon we have a file for', Object.values(COUNTER_ICONS).every((name) => MANA_ICONS.includes(name)) && items.every((i) => !i.icon || MANA_ICONS.includes(i.icon)));
same('a line has its icon when the counter has one', [items.find((i) => i.id === 'counteradd:flying').icon, items.find((i) => i.id === 'counteradd:lore').icon, items.find((i) => i.id === 'counteradd:p').icon ?? null], ['ability-flying', 'counter-lore', null]);
same('labels', [counterLabel('p'), counterLabel('first-strike'), counterLabel('lore'), counterLabel('third-degree-burn'), counterLabel(''), counterLabel(null)], ['+1/+1', 'First strike', 'Lore', 'Third degree burn', '', '']);
same('counterIcon', [counterIcon('trample'), counterIcon('nothing'), counterIcon('constructor')], ['ability-trample', null, null]);
// what may be a key
same('the fixed kinds and slugs are counters; other things are not', ['p', 'm', 'l', 'c', 't', 'flying', 'ki', 'third-degree-burn', "wanderer's-mark"].map(isCounterKey), Array(9).fill(true));
same('...a letter on its own, capitals, spaces, symbols, too long, empty and non-text are not', ['x', 'Flying', 'two words', 'a/b', '../x', 'a'.repeat(25), '', null, 5, undefined].map(isCounterKey), Array(10).fill(false));
same('...and nothing from Object.prototype is', ['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__', 'isPrototypeOf'].map(isCounterKey), Array(6).fill(false));
// typed names
same('a typed name becomes a slug', [slugOf('Flying'), slugOf('  First Strike '), slugOf('Third-degree burn'), slugOf("Wanderer’s Mark"), slugOf('Café'), slugOf('Ki')], ['flying', 'first-strike', 'third-degree-burn', "wanderer's-mark", 'cafe', 'ki']);
same('...and what cannot be one is null', ['', 'x', 'a'.repeat(30), 'two--hyphens', '-start', 'end-', 'a_b', 'a/b', 'constructor', '<b>', null, 5].map(slugOf), Array(12).fill(null));

// the game: a named counter is held like the others
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deck = { cards: [{ i: id(1), n: 'Forest', qty: 30, section: 'main' }], commander: [] };
let game = makeGame(deck, () => ({ t: 'Creature', m: '', k: [] }), { random: seededRandom(2) });
const uid = game.zones.hand[0].uid;
game = moveCard(game, uid, 'battlefield');
const counts = (g) => g.zones.battlefield.find((c) => c.uid === uid).ct ?? null;
game = changeCounter(game, uid, 'flying', 1);
game = changeCounter(game, uid, 'lore', 3);
game = changeCounter(game, uid, 'p', 2);
same('a card holds named counters beside the fixed ones', counts(game), { flying: 1, lore: 3, p: 2 });
check('...and the game is still consistent', checkGame(game).length === 0, checkGame(game).join('; '));
same('they come off one at a time, and the kind goes when it reaches 0', [counts(changeCounter(game, uid, 'lore', -1)).lore, counts(changeCounter(game, uid, 'flying', -1)).flying ?? 'gone'], [2, 'gone']);
same('a named counter does not touch +1/+1 and -1/-1 (they only cancel each other)', counts(changeCounter(game, uid, 'stun', 1)), { flying: 1, lore: 3, p: 2, stun: 1 });
refused('a name that is not a kind is refused', () => changeCounter(game, uid, 'Two Words', 1), /not a kind of counter/);
refused('so is a name from the prototype', () => changeCounter(game, uid, 'constructor', 1), /not a kind of counter/);
{
  let full = moveCard(makeGame(deck, () => ({ t: 'Creature', m: '', k: [] }), { random: seededRandom(3) }), uid, 'battlefield');
  full = moveCard(full, full.zones.hand[0].uid, 'battlefield');
  const target = full.zones.battlefield[0].uid;
  const names = ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg', 'hh', 'ii', 'jj', 'kk', 'll'];
  for (const name of names) full = changeCounter(full, target, name, 1);
  same(`a card holds at most ${MAX_COUNTER_KINDS} kinds`, Object.keys(full.zones.battlefield.find((c) => c.uid === target).ct).length, MAX_COUNTER_KINDS);
  refused('a thirteenth kind is refused in words', () => changeCounter(full, target, 'mm', 1), /at most 12 kinds/);
  same('...but one it already has can still grow', full.zones.battlefield.find((c) => c.uid === target).ct && changeCounter(full, target, 'aa', 1).zones.battlefield.find((c) => c.uid === target).ct.aa, 2);
  check('a damaged card with a made-up counter key is a problem', checkGame({ ...game, zones: { ...game.zones, battlefield: game.zones.battlefield.map((c) => ({ ...c, ct: { 'Bad Key': 1 } })) } }).some((p) => /damaged Bad Key counter/.test(p)));
}
check('every fixed kind is a counter kind', ['p', 'm', 'l', 'c', 't', 'o'].every(isCounterKind));
// chips and clicks
same('named counters have chips after the fixed ones with their icons', counterChips({ ct: counts(game) }).map((c) => [c.kind, c.text, c.icon ?? null]), [['p', '+1/+1 2', null], ['flying', 'Flying 1', 'ability-flying'], ['lore', 'Lore 3', 'counter-lore']]);
const click = markClick({ mark: 'chip', kind: 'lore' }, { shift: false });
check('a click on a named chip adds one and a right-click takes one off', click && click.run(game, uid).zones.battlefield[0].ct.lore === 4 && markClick({ mark: 'chip', kind: 'lore', remove: true }, {}).run(game, uid).zones.battlefield[0].ct.lore === 2);
same('a chip of a kind that does not exist is refused', (() => { try { markClick({ mark: 'chip', kind: 'Not A Kind' }, {}); return 'no error'; } catch (error) { return error.message; } })(), 'That is not a kind of counter.');
// the menu
const card = { uid: 'u1', n: 'Elf', t: 'Creature' };
const heading = menuItems(card, 'battlefield', { counters: true }).find((i) => i.id === 'counters');
same('the battlefield menu has Add counter when the page asks, as a heading you can search', [heading?.label, heading?.searchable, heading?.items.length], ['Add counter', true, COUNTER_CATALOG_SIZE + 1]);
same('...and not otherwise, nor off the battlefield', [menuItems(card, 'battlefield').some((i) => i.id === 'counters'), ['hand', 'graveyard', 'exile', 'command'].some((z) => menuItems(card, z, { counters: true }).some((i) => i.id === 'counters'))], [false, false]);
{
  const action = menuAction('counteradd:flying', { uid, n: 'Forest' });
  const next = action.run(game);
  same('choosing Flying adds one flying counter, says so and gives a small note', [counts(next).flying, action.message, action.toast], [2, 'Added a Flying counter to Forest.', { text: '+1 Flying', tone: 'plain' }]);
  same('+1/+1 from the list has the green note', menuAction('counteradd:p', { uid, n: 'Forest' }).toast, { text: '+1/+1', tone: 'up' });
  same('Custom... is the page\'s (it asks for a name): nothing to run', menuAction('counteradd:custom', { uid, n: 'Forest' }), null);
  refused('a made-up kind is refused when it runs', () => menuAction('counteradd:Not-A-Kind', { uid, n: 'Forest' }).run(game), /not a kind of counter/);
}
console.log(`All ${checks} counter catalog checks passed.`);
void FIXED;
