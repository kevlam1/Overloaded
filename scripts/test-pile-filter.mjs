// Tests for shared/pile-filter.mjs: the type and mana value filters of the pile windows.
import { TYPE_OPTIONS, VALUE_OPTIONS, typeTitle, valueTitle, typeWordsOf, valueOf, emptyFilter, filterActive, matchesFilter, filterRows, describeFilter } from '../shared/pile-filter.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };

same('the types on offer', TYPE_OPTIONS, ['creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'land', 'planeswalker', 'battle']);
same('the mana values on offer are 0 to 7 and 8 for 8 or more, and they read 8+', [VALUE_OPTIONS, valueTitle(7), valueTitle(8), valueTitle(12)], [[0, 1, 2, 3, 4, 5, 6, 7, 8], '7', '8+', '8+']);
same('a type has a capital letter', TYPE_OPTIONS.map(typeTitle), ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land', 'Planeswalker', 'Battle']);

// the type words
same('the words of the front face before the dash', [...typeWordsOf('Legendary Artifact Creature — Golem')], ['legendary', 'artifact', 'creature']);
same('a hyphen with spaces is a dash too (the card list may use either)', [...typeWordsOf('Basic Land - Forest')], ['basic', 'land']);
same('only the front face counts', [...typeWordsOf('Creature — Elf // Land')], ['creature']);
same('a subtype that is also a type is not read as one (Tribal and the creature type Wizard are not types here)', typeWordsOf('Instant — Arcane').has('arcane'), false);
same('nothing, or not text, has no words', [typeWordsOf('').size, typeWordsOf(null).size, typeWordsOf(undefined).size, typeWordsOf(5).size], [0, 0, 0, 1]);

// the mana value
const card = (t, m, n = 'X') => ({ uid: n, n, t, m });
same('the mana value of a cost, with X as 0, a land as 0 and 8 or more as 8', [valueOf(card('Instant', '{R}')), valueOf(card('Creature', '{2}{G}{G}')), valueOf(card('Land', '')), valueOf(card('Sorcery', '{X}{R}')), valueOf(card('Creature', '{9}{R}')), valueOf(card('Creature', '{8}')), valueOf(card('Creature', '{7}'))], [1, 4, 0, 1, 8, 8, 7]);
same('a split card counts its first half', valueOf(card('Instant // Instant', '{R} // {1}{W}')), 1);
same('a card with no cost field is 0', [valueOf({}), valueOf(null), valueOf(undefined)], [0, 0, 0]);

// a pile to filter
const pile = [
  card('Basic Land — Forest', '', 'Forest'), card('Basic Land — Island', '', 'Island'), card('Artifact', '{1}', 'Sol Ring'), card('Instant', '{R}', 'Lightning Bolt'),
  card('Creature — Elf Druid', '{G}', 'Llanowar Elves'), card('Artifact Creature — Golem', '{4}', 'Walking Ballista'), card('Sorcery', '{3}{R}{R}', 'Big Spell'), card('Creature — Eldrazi', '{10}', 'Ulamog'),
];
const rows = pile.map((c, index) => ({ card: c, index }));
const names = (filter) => filterRows(rows, filter).map((row) => row.card.n);

same('an empty filter lets everything through, and says it is not active', [filterActive(emptyFilter()), filterActive(null), filterActive({ types: [], values: [] }), names(emptyFilter()).length, filterRows(rows, null) === rows], [false, false, false, 8, true]);
same('one type', names({ types: ['land'], values: [] }), ['Forest', 'Island']);
same('an Artifact Creature is both an Artifact and a Creature', [names({ types: ['artifact'], values: [] }), names({ types: ['creature'], values: [] })], [['Sol Ring', 'Walking Ballista'], ['Llanowar Elves', 'Walking Ballista', 'Ulamog']]);
same('several types show a card of ANY of them, in the pile order', names({ types: ['instant', 'sorcery'], values: [] }), ['Lightning Bolt', 'Big Spell']);
same('one mana value', names({ types: [], values: [1] }), ['Sol Ring', 'Lightning Bolt', 'Llanowar Elves']);
same('0 is the lands', names({ types: [], values: [0] }), ['Forest', 'Island']);
same('several mana values', names({ types: [], values: [1, 5] }), ['Sol Ring', 'Lightning Bolt', 'Llanowar Elves', 'Big Spell']);
same('8+ takes everything from 8 up', names({ types: [], values: [8] }), ['Ulamog']);
same('a type and a mana value must both fit', [names({ types: ['creature'], values: [1] }), names({ types: ['creature'], values: [4] }), names({ types: ['land'], values: [3] })], [['Llanowar Elves'], ['Walking Ballista'], []]);
same('the rows keep their place numbers', filterRows(rows, { types: ['instant'], values: [] }).map((row) => row.index), [3]);
same('a card with no type line passes no type filter and a free one passes only 0', [matchesFilter({ n: 'x' }, { types: ['land'], values: [] }), matchesFilter({ n: 'x' }, { types: [], values: [0] })], [false, true]);
same('a token with only a token type line (tt) is filtered by it', matchesFilter({ n: 'Goblin', tt: 'Token Creature — Goblin', m: '' }, { types: ['creature'], values: [] }), true);

// words
same('what the filter says in words', [describeFilter(emptyFilter()), describeFilter({ types: ['creature', 'land'], values: [] }), describeFilter({ types: [], values: [3, 8] }), describeFilter({ types: ['instant'], values: [1] })], ['', 'Creature or Land', 'mana value 3 or 8+', 'Instant, mana value 1']);

console.log(`All ${checks} pile filter checks passed.`);
