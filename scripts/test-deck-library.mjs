// Tests for shared/deck-library.mjs: up to 20 saved decks with an id and a format each, which one is selected, replacing a deck
// by name, and reading everything back strictly from the browser's storage (including the old single deck). Decks are small
// hand-made saved decks that the real strict reader accepts. No browser, no network. Run: node scripts/test-deck-library.mjs
import { LIBRARY_KEY, LEGACY_KEY, LIBRARY_VERSION, MAX_DECKS, FORMATS, FORMAT_TITLES, newDeckId, formatOf, emptyLibrary, readLibrary, serializeLibrary, selectedEntry, decksOfFormat, addDeck, removeDeck, selectDeck } from '../shared/deck-library.mjs';
import { serializeDeck } from '../shared/deck-preview.mjs';

let checks = 0;
function check(label, condition, detail = '') {
  checks++;
  if (!condition) { console.error(`FAILED: ${label} ${detail}`); process.exit(1); }
}
const same = (label, actual, expected) => check(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
const deepFreeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const key of Object.keys(value)) deepFreeze(value[key]); } return value; };

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// A saved deck the real reader accepts. commander: true makes card 1 the commander.
const deckOf = (name, { commander = false, n = 1 } = {}) => ({
  version: 1, name, savedAt: '2026-10-30T12:00:00.000Z', commander: commander ? [uuid(n)] : [],
  cards: commander ? [{ i: uuid(n), n: 'Card One', qty: 1, section: 'commander' }, { i: uuid(n + 1000), n: 'Forest', qty: 5, section: 'main' }] : [{ i: uuid(n + 1000), n: 'Forest', qty: 5, section: 'main' }],
  skipped: 0, text: '1 Card One\n5 Forest',
});
// A counting source of ids, so the tests know them: d0000000001, d0000000002, ...
const counter = () => { let n = 0; return () => `d${String(++n).padStart(10, '0')}`; };
const id = (n) => `d${String(n).padStart(10, '0')}`;
// A library of the given decks, made the way the page makes it.
const libraryOf = (...decks) => { let lib = emptyLibrary(); const nextId = counter(); for (const deck of decks) lib = addDeck(lib, deck, { newId: nextId }).library; return lib; };
const names = (lib) => lib.decks.map((entry) => entry.deck.name);

// ---- constants ----
check('the keys, the limit and the formats are what the notes say', LIBRARY_KEY === 'overloaded.decks' && LEGACY_KEY === 'overloaded.deck' && LIBRARY_VERSION === 1 && MAX_DECKS === 20 && FORMATS.join() === 'commander,standard');
same('every format has a title', FORMAT_TITLES, { commander: 'Commander', standard: 'Standard' });

// ---- ids ----
check('an id is a d and 10 lowercase letters or digits', /^d[a-z0-9]{10}$/.test(newDeckId()));
same('an id comes from the bytes given, each byte as a base 36 digit', newDeckId(() => Uint8Array.from([0, 1, 9, 10, 35, 36, 71, 72, 255, 100])), 'd019az0z03s');
check('twenty real ids are all different', new Set(Array.from({ length: 20 }, () => newDeckId())).size === 20);

// ---- format and the empty library ----
check('a deck with a commander is for Commander, one without for Standard', formatOf(deckOf('a', { commander: true })) === 'commander' && formatOf(deckOf('b')) === 'standard');
same('the empty library', emptyLibrary(), { version: 1, selected: null, decks: [] });
check('each call gives a new empty library', emptyLibrary() !== emptyLibrary());

// ---- addDeck ----
{
  const lib = deepFreeze(emptyLibrary());
  const first = addDeck(lib, deckOf('Merfolk', { commander: true }), { newId: counter() });
  check('the first deck is added, selected and tagged with its format', first.ok && first.replaced === false && first.id === id(1) && first.library.selected === id(1) && first.library.decks.length === 1 && first.library.decks[0].format === 'commander', JSON.stringify(first));
  check('the library it was added to is not changed', lib.decks.length === 0 && lib.selected === null);
  const nextId = counter();
  const a = addDeck(emptyLibrary(), deckOf('Alpha'), { newId: nextId });
  const b = addDeck(a.library, deckOf('Beta', { commander: true }), { newId: nextId });
  same('a second deck goes at the end and becomes the selected one', [names(b.library), b.library.selected, b.id], [['Alpha', 'Beta'], id(2), id(2)]);
  same('a deck without a commander gets Standard', a.library.decks[0].format, 'standard');
  check('the format can be chosen, whatever the deck has', addDeck(emptyLibrary(), deckOf('x', { commander: true }), { format: 'standard', newId: counter() }).library.decks[0].format === 'standard');
  check('a format that is not one is refused in words', ['modern', '', 'Commander', null, undefined, 5].every((format) => { const r = addDeck(emptyLibrary(), deckOf('x'), { format }); return format === undefined ? r.ok : (!r.ok && /Commander or Standard/.test(r.error)); }));

  // The same name replaces the deck where it is.
  const three = libraryOf(deckOf('Alpha'), deckOf('Beta'), deckOf('Gamma'));
  const again = addDeck(deepFreeze(three), deckOf('beta', { commander: true, n: 7 }), { newId: counter() });
  same('the same name (capitals do not matter) replaces that deck where it is', [again.ok, again.replaced, names(again.library).join(), again.id], [true, true, 'Alpha,beta,Gamma', id(2)]);
  check('it keeps the deck\'s id and selects it, with the new format', again.library.selected === id(2) && again.library.decks[1].id === id(2) && again.library.decks[1].format === 'commander' && again.library.decks[1].deck.cards.length === 2);
  check('capitals in the new name do not matter either', names(addDeck(three, deckOf('BETA'), { newId: counter() }).library).join() === 'Alpha,BETA,Gamma' && addDeck(three, deckOf('BETA'), { newId: counter() }).replaced === true);
  check('and the old library is not changed', names(three).join() === 'Alpha,Beta,Gamma' && three.selected === id(3));
  check('the same name with a different format changes the format', addDeck(three, deckOf('Alpha', { commander: true }), { format: 'standard' }).library.decks[0].format === 'standard');

  // The limit.
  let full = emptyLibrary();
  const ids = counter();
  for (let n = 1; n <= MAX_DECKS; n++) { const r = addDeck(full, deckOf(`Deck ${n}`), { newId: ids }); check(`deck ${n} of ${MAX_DECKS} is accepted`, r.ok); full = r.library; }
  deepFreeze(full);
  const over = addDeck(full, deckOf('One too many'), { newId: ids });
  check('the next deck is refused with what to do', !over.ok && /up to 20 decks\. Delete one first/.test(over.error), JSON.stringify(over));
  check('a full library still takes a replacement of a deck it has', addDeck(full, deckOf('deck 7', { commander: true }), { newId: ids }).ok);
  check('and has room again after one is removed', addDeck(removeDeck(full, id(3)), deckOf('One too many'), { newId: ids }).ok);

  // Ids that are already taken are not used again.
  const taken = libraryOf(deckOf('Alpha'));
  const ask = [id(1), id(1), id(9)]; let at = 0;
  check('an id that is already in the library is skipped', addDeck(taken, deckOf('Beta'), { newId: () => ask[at++] }).id === id(9));
  let calls = 0;
  let threw = false;
  try { addDeck(taken, deckOf('Gamma'), { newId: () => { calls++; return id(1); } }); } catch { threw = true; }
  check('and a source that only gives taken ids stops with an error, not a loop', threw && calls === 20);
}

// ---- removeDeck, selectDeck, selectedEntry, decksOfFormat ----
{
  const lib = deepFreeze(libraryOf(deckOf('Alpha'), deckOf('Beta', { commander: true }), deckOf('Gamma')));
  same('the last deck added is selected', selectedEntry(lib).deck.name, 'Gamma');
  same('removing the selected deck selects the first one left', (({ selected }) => selected)(removeDeck(lib, id(3))), id(1));
  same('removing another deck leaves the selection alone', (({ selected, decks }) => [selected, decks.length])(removeDeck(lib, id(1))), [id(3), 2]);
  check('removing the only deck leaves nothing selected', (({ selected, decks }) => selected === null && decks.length === 0)(removeDeck(libraryOf(deckOf('Solo')), id(1))));
  check('removing an id that is not there changes nothing', removeDeck(lib, 'dnothingatall') === lib);
  check('removing does not change the library it was given', lib.decks.length === 3);
  same('selecting a deck', selectDeck(lib, id(2)).selected, id(2));
  check('selecting an id that is not there changes nothing', selectDeck(lib, 'dnothingatall') === lib);
  check('with nothing selected there is no selected deck', selectedEntry(emptyLibrary()) === null && selectedEntry({ ...lib, selected: 'dnothingatall' }) === null);
  same('the decks of a format', [decksOfFormat(lib, 'commander').map((e) => e.deck.name), decksOfFormat(lib, 'standard').map((e) => e.deck.name), decksOfFormat(lib, 'modern').length], [['Beta'], ['Alpha', 'Gamma'], 0]);
}

// ---- readLibrary: what comes back out of storage ----
{
  const lib = libraryOf(deckOf('Alpha'), deckOf('Beta', { commander: true }));
  const raw = serializeLibrary(lib);
  const read = readLibrary(raw);
  same('a library reads back exactly as it was saved', [read.library, read.source, read.skipped], [lib, 'library', 0]);
  same('nothing stored gives an empty library', readLibrary(null, null), { library: emptyLibrary(), source: 'empty', skipped: 0 });
  same('so does nothing at all', readLibrary(undefined, undefined).source, 'empty');

  // The old single deck becomes the first deck, once.
  const legacy = serializeDeck(deckOf('Old deck', { commander: true }));
  const migrated = readLibrary(null, legacy, counter());
  same('the old single deck becomes a library of one, selected', [migrated.source, names(migrated.library), migrated.library.selected, migrated.library.decks[0].format], ['legacy', ['Old deck'], id(1), 'commander']);
  check('an old deck without a commander is for Standard', readLibrary(null, serializeDeck(deckOf('Old plain')), counter()).library.decks[0].format === 'standard');
  const bothPresent = readLibrary(raw, legacy);
  same('once the library exists the old deck is not read, so a deleted deck cannot come back', [bothPresent.source, names(bothPresent.library)], ['library', ['Alpha', 'Beta']]);
  same('even an empty library wins over an old deck', readLibrary(serializeLibrary(emptyLibrary()), legacy).source, 'library');
  same('an old deck that cannot be read is damaged, not repaired', [readLibrary(null, '{ nope').source, readLibrary(null, '{ nope').skipped, readLibrary(null, '{ nope').library.decks.length], ['damaged', 1, 0]);
  check('an old deck that parses but is not a deck is damaged too', ['null', '[]', '5', '{}', '"x"'].every((text) => readLibrary(null, text).source === 'damaged'));

  // A library that is wrong as a whole is damaged and is NOT replaced by the old deck.
  for (const [label, text] of [
    ['not JSON', '{ nope'], ['an empty text', ''], ['null', 'null'], ['a list', '[]'], ['a number', '5'], ['no version', JSON.stringify({ selected: null, decks: [] })],
    ['another version', JSON.stringify({ version: 2, selected: null, decks: [] })], ['decks that is not a list', JSON.stringify({ version: 1, selected: null, decks: {} })],
    ['decks missing', JSON.stringify({ version: 1, selected: null })], ['more decks than the limit', JSON.stringify({ version: 1, selected: null, decks: Array.from({ length: 21 }, (_, n) => ({ id: id(n + 1), format: 'standard', deck: deckOf(`D${n}`) })) })],
  ]) {
    const result = readLibrary(text, legacy);
    check(`${label} is a damaged library, and the old deck is not used instead`, result.source === 'damaged' && result.library.decks.length === 0 && result.library.selected === null, JSON.stringify(result.source));
  }

  // One bad deck is dropped and counted; the rest are kept.
  const good = JSON.parse(raw);
  const withEntry = (entry) => readLibrary(JSON.stringify({ ...good, decks: [good.decks[0], entry, good.decks[1]] }));
  for (const [label, entry] of [
    ['null', null], ['a number', 5], ['no deck', { id: id(50), format: 'standard' }], ['a deck that is not a deck', { id: id(50), format: 'standard', deck: { name: 'x' } }],
    ['no id', { format: 'standard', deck: deckOf('X') }], ['an id that is not one', { id: 'xyz', format: 'standard', deck: deckOf('X') }], ['an uppercase id', { id: 'DABCDEFGHIJ', format: 'standard', deck: deckOf('X') }],
    ['an id used twice', { id: good.decks[0].id, format: 'standard', deck: deckOf('X') }], ['a format that is not one', { id: id(50), format: 'modern', deck: deckOf('X') }],
    ['no format', { id: id(50), deck: deckOf('X') }], ['a deck with a bad card', { id: id(50), format: 'standard', deck: { ...deckOf('X'), cards: [{ i: 'no', n: 'x', qty: 1, section: 'main' }] } }],
  ]) {
    const result = withEntry(entry);
    check(`${label} is dropped and counted, and the other decks stay`, result.source === 'library' && result.skipped === 1 && names(result.library).join() === 'Alpha,Beta', `${result.skipped} ${names(result.library)}`);
  }
  same('a selected deck that is not in the library falls back to the first', readLibrary(JSON.stringify({ ...good, selected: 'dnothingatall' })).library.selected, id(1));
  same('so does a selection that is not text', [readLibrary(JSON.stringify({ ...good, selected: 5 })).library.selected, readLibrary(JSON.stringify({ ...good, selected: null })).library.selected], [id(1), id(1)]);
  same('a selection of a deck that was dropped falls back too', readLibrary(JSON.stringify({ ...good, selected: id(50), decks: [good.decks[0], { id: id(50), format: 'modern', deck: deckOf('X') }] })).library.selected, id(1));
  check('an empty library has nothing selected', readLibrary(serializeLibrary(emptyLibrary())).library.selected === null);
  check('extra fields added by hand are dropped from the library, the entries and the decks', (() => {
    const hand = JSON.parse(raw); hand.evil = 1; hand.decks[0].evil = 2; hand.decks[0].deck.evil = 3; hand.decks[0].deck.cards[0].evil = 4;
    return !JSON.stringify(readLibrary(JSON.stringify(hand)).library).includes('evil');
  })());
  check('the deck inside is checked by the strict deck reader (a name with an invisible character is refused)', (() => {
    const hand = JSON.parse(raw); hand.decks[0].deck.name = `Al${String.fromCharCode(0x200b)}pha`;
    return readLibrary(JSON.stringify(hand)).skipped === 1;
  })());
}

console.log(`All ${checks} deck library checks passed.`);
