// Tests for shared/card-search.mjs: searching a pile by name, by letters in order, and by type line.
import { inOrder, words, matchesQuery, searchCards } from '../shared/card-search.mjs';

let checks = 0;
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); } };

const pile = [
  { uid: 'c1', n: 'Forest', t: 'Basic Land - Forest' },
  { uid: 'c2', n: 'Llanowar Elves', t: 'Creature - Elf Druid' },
  { uid: 'c3', n: 'Lightning Bolt', t: 'Instant' },
  { uid: 'c4', n: 'Fireball', t: 'Sorcery' },
  { uid: 'c5', n: 'Sol Ring', t: 'Artifact' },
  { uid: 'c6', n: "Atraxa, Praetors' Voice", t: 'Legendary Creature - Phyrexian Angel Horror' },
  { uid: 'c7', n: 'Island', t: 'Basic Land - Island' },
  { uid: 'c8', n: 'Éowyn, Lady of Rohan', t: 'Legendary Creature - Human Noble' },
  { uid: 'c9', n: 'Forest', t: 'Basic Land - Forest' },
];
const names = (query) => searchCards(pile, query).map((e) => e.card.uid);

// letters in order
same('letters in order, not next to each other', [inOrder('forest', 'ft'), inOrder('forest', 'fet'), inOrder('forest', 'tf'), inOrder('forest', 'z'), inOrder('', 'a'), inOrder('abc', '')], [true, true, false, false, false, true]);
same('the same letter twice needs two of them', [inOrder('forest', 'oo'), inOrder('forest', 'rr'), inOrder('boot', 'oo')], [false, false, true]);
same('words are split on spaces and lowered, accents removed', [words('  Ft  Land '), words(''), words('   '), words('Éowyn')], [['ft', 'land'], [], [], ['eowyn']]);

// matching
same('an empty query matches every card', [matchesQuery(pile[0], ''), matchesQuery(pile[0], '   '), matchesQuery(pile[0], undefined)], [true, true, true]);
same('typing ft finds Forest (and Fireball has an f but no t: it does not match by name, only by letters in order: f ... t is not in "fireball")', [matchesQuery(pile[0], 'ft'), matchesQuery(pile[3], 'ft')], [true, false]);
same('part of a name', [matchesQuery(pile[1], 'elves'), matchesQuery(pile[1], 'LLAN'), matchesQuery(pile[1], 'owar')], [true, true, true]);
same('the type line', [matchesQuery(pile[1], 'creature'), matchesQuery(pile[1], 'druid'), matchesQuery(pile[2], 'instant'), matchesQuery(pile[0], 'basic land')], [true, true, true, true]);
same('letters in order are for names only: "crt" is not found in a type line (it would match almost anything), but "cr" and "dr" as parts of its words are', [matchesQuery(pile[1], 'crt'), matchesQuery(pile[1], 'cr dr')], [false, true]);
same('every word must match, each in the name or the type line', [matchesQuery(pile[1], 'elf creature'), matchesQuery(pile[1], 'elf land'), matchesQuery(pile[0], 'forest land')], [true, false, true]);
same('accents and capitals do not matter', [matchesQuery(pile[7], 'eowyn'), matchesQuery(pile[7], 'ÉOWYN'), matchesQuery(pile[7], 'lady rohan')], [true, true, true]);
same('punctuation in a name is matched as it is', [matchesQuery(pile[5], "praetors'"), matchesQuery(pile[5], 'atraxa,')], [true, true]);
same('a card with no type line still matches by name and does not crash', [matchesQuery({ uid: 'x', n: 'Mystery' }, 'mys'), matchesQuery({ uid: 'x', n: 'Mystery' }, 'creature'), matchesQuery({ uid: 'x' }, 'a'), matchesQuery(null, 'a')], [true, false, false, false]);

// the order of the results
same('no query: every card in the pile order, with its place', searchCards(pile, '').map((e) => [e.card.uid, e.index]), pile.map((c, i) => [c.uid, i]));
same('the name starting with the word comes first, then the name containing it, then the type line, then letters in order', names('l'), ['c2', 'c3', 'c4', 'c5', 'c7', 'c8', 'c1', 'c6', 'c9']);
same('"land" finds the Island first (its NAME contains it) and then the two Forests (their TYPE line does); the Llanowar Elves have no d', names('land'), ['c7', 'c1', 'c9']);
same('"ft" finds the two Forests, in the order of the pile', names('ft'), ['c1', 'c9']);
same('two words narrow it down', names('forest basic'), ['c1', 'c9']);
same('a word nothing has gives nothing', names('xyzzy'), []);
same('the results carry the place in the pile (the library depth)', searchCards(pile, 'island').map((e) => e.index), [6]);
same('the pile is not changed', (() => { const copy = JSON.stringify(pile); searchCards(pile, 'forest'); return JSON.stringify(pile) === copy; })(), true);
same('an empty pile gives nothing', searchCards([], 'a'), []);

console.log(`All ${checks} card search checks passed.`);
