// Tests for shared/lobby-deck.mjs: what the lobby sends for a saved deck, which deck it offers, and what a seat shows.
import { emptyLibrary, addDeck } from '../shared/deck-library.mjs';
import { deckFieldsOf, defaultDeckFor, deckChoiceLabel, isReady, seatDeckText } from '../shared/lobby-deck.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(expected === undefined ? actual : actual)}`);
};

const deckOf = (name, commanders = []) => ({
  version: 1, name, text: '', savedAt: 1, skipped: 0, commander: commanders.map((_, n) => `id${n}`),
  cards: [...commanders.map((c, n) => ({ i: `id${n}`, n: c, qty: 1, section: 'commander' })), { i: 'x', n: 'Island', qty: 30, section: 'main' }],
});
let idCounter = 0;
const newId = () => `d${String(++idCounter).padStart(10, '0')}`;
const entry = (name, format, commanders, bracket) => {
  const r = addDeck(emptyLibrary(), deckOf(name, commanders), { format, bracket: bracket ?? null, newId });
  if (!r.ok) fail('building a test entry', r.error);
  return r.library.decks[0];
};

// ---- deckFieldsOf ----
same('a Commander deck sends its commander and bracket, never as a guess', deckFieldsOf(entry('A', 'commander', ['Krenko, Mob Boss'], 3)), { commander: 'Krenko, Mob Boss', bracket: 3, bracketGuess: false });
same('two commanders are joined with " & "', deckFieldsOf(entry('B', 'commander', ['Tymna the Weaver', 'Thrasios, Triton Hero'])).commander, 'Tymna the Weaver & Thrasios, Triton Hero');
same('a Commander deck with no bracket sends none', deckFieldsOf(entry('C', 'commander', ['Krenko, Mob Boss'])).bracket, null);
same('a Standard deck sends nothing about a commander or bracket', deckFieldsOf(entry('D', 'standard', [])), { commander: '', bracket: null, bracketGuess: false });
same('even a Standard deck that still lists a commander card sends none', deckFieldsOf(entry('E', 'standard', ['Krenko, Mob Boss'], 4)), { commander: '', bracket: null, bracketGuess: false });
same('a Commander deck with no commander card sends an empty commander', deckFieldsOf(entry('F', 'commander', [])).commander, '');
same('every bracket 1 to 5 is passed on', [1, 2, 3, 4, 5].map((n) => deckFieldsOf(entry(`G${n}`, 'commander', ['K'], n)).bracket), [1, 2, 3, 4, 5]);
{
  let threw = false;
  try { deckFieldsOf(entry('H', 'commander', ['A', 'B', 'C'])); } catch { threw = true; }
  checks++; if (!threw) fail('three commander cards', 'were accepted');
}

// ---- defaultDeckFor ----
{
  const lib = (...specs) => specs.reduce((library, [name, format]) => addDeck(library, deckOf(name), { format, newId }).library, emptyLibrary());
  const a = lib(['Std 1', 'standard'], ['Cmd 1', 'commander'], ['Std 2', 'standard']);
  same('the selected deck is offered when it is for the table\'s format', defaultDeckFor(a, 'standard').deck.name, 'Std 2');
  same('otherwise the first deck of the format', defaultDeckFor(a, 'commander').deck.name, 'Cmd 1');
  same('a format with no deck offers none', defaultDeckFor(lib(['Only', 'standard']), 'commander'), null);
  same('an empty library offers none', defaultDeckFor(emptyLibrary(), 'standard'), null);
  const selectedOther = { ...a, selected: a.decks[1].id };
  same('with a Commander deck selected, a Standard table offers the first Standard deck', defaultDeckFor(selectedOther, 'standard').deck.name, 'Std 1');
  same('an unknown format offers none', defaultDeckFor(a, 'modern'), null);
}

// ---- deckChoiceLabel ----
same('a Commander deck shows its commander and bracket', deckChoiceLabel(entry('My deck', 'commander', ['Krenko, Mob Boss'], 3)), 'My deck (Krenko, Mob Boss, bracket 3)');
same('a Commander deck with no bracket shows only the commander', deckChoiceLabel(entry('My deck', 'commander', ['Krenko, Mob Boss'])), 'My deck (Krenko, Mob Boss)');
same('a Standard deck shows only its name', deckChoiceLabel(entry('Burn', 'standard', [])), 'Burn');

// ---- isReady ----
same('ready for this match', isReady({ ready: 2 }, { match: 2 }), true);
same('a mark from an earlier match does not count', isReady({ ready: 1 }, { match: 2 }), false);
same('no mark is not ready', isReady({}, { match: 1 }), false);
same('a mark of true is not ready', isReady({ ready: true }, { match: 1 }), false);
same('a text mark is not ready', isReady({ ready: '1' }, { match: 1 }), false);
same('without the table\'s match number nobody is ready', [isReady({ ready: 1 }, {}), isReady({ ready: 1 }, null), isReady({ ready: undefined }, { match: undefined })], [false, false, false]);
same('no member is not ready', [isReady(null, { match: 1 }), isReady(undefined, { match: 1 })], [false, false]);

// ---- seatDeckText ----
same('a commander and a bracket', seatDeckText({ commander: 'Krenko, Mob Boss', bracket: 3 }), 'Krenko, Mob Boss, bracket 3');
same('a guessed bracket says so', seatDeckText({ commander: 'Krenko, Mob Boss', bracket: 3, bracketGuess: true }), 'Krenko, Mob Boss, bracket 3 (guess)');
same('a commander alone', seatDeckText({ commander: 'Krenko, Mob Boss' }), 'Krenko, Mob Boss');
same('a bracket alone', seatDeckText({ bracket: 2 }), 'bracket 2');
same('nothing told to the table is an empty text', seatDeckText({ name: 'Bob', seat: 2 }), '');
same('a guess flag without a bracket shows nothing', seatDeckText({ bracketGuess: true }), '');
same('a guess flag that is not true is ignored', seatDeckText({ bracket: 3, bracketGuess: 'yes' }), 'bracket 3');
same('values another browser could have written are not trusted', [
  seatDeckText({ commander: 5, bracket: 3 }), seatDeckText({ commander: ['x'] }), seatDeckText({ bracket: 9 }), seatDeckText({ bracket: '3' }),
  seatDeckText({ bracket: 2.5 }), seatDeckText({ bracket: 0 }), seatDeckText({ commander: null, bracket: null }), seatDeckText(null), seatDeckText(undefined),
], ['bracket 3', '', '', '', '', '', '', '', '']);
same('a commander that looks like markup is returned as is, for the page to show as text', seatDeckText({ commander: '<img src=x onerror=alert(1)>' }), '<img src=x onerror=alert(1)>');

console.log(`All ${checks} lobby deck checks passed.`);
