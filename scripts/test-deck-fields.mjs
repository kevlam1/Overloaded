// Tests for shared/deck-fields.mjs: the three things a table learns about a deck, checked before they are written.
// With the card list built (frontend/public/data/cards.json) it also checks the limit against every real card name.
import { existsSync, readFileSync } from 'node:fs';
import { COMMANDER_MAX, COMMANDER_JOINER, BRACKETS, commanderText, cleanDeckFields, deckFieldsChanged } from '../shared/deck-fields.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const refused = (label, run, words) => {
  checks++;
  try { run(); } catch (error) { if (error instanceof Error && words.test(error.message)) return; fail(label, `refused with the wrong message: ${error.message}`); }
  fail(label, 'was accepted');
};
const SNAKE = String.fromCodePoint(0x1F40D);

// Written out here, not read from the module, so changing the module's numbers also fails this test.
same('the limit is 220 units, the joiner is " & ", the brackets are 1 to 5', [COMMANDER_MAX, COMMANDER_JOINER, BRACKETS], [220, ' & ', [1, 2, 3, 4, 5]]);

// commanderText
same('no commanders is an empty text', commanderText([]), '');
same('one commander is its name', commanderText(['Atraxa, Praetors\' Voice']), 'Atraxa, Praetors\' Voice');
same('two commanders are joined with " & "', commanderText(['Tymna the Weaver', 'Thrasios, Triton Hero']), 'Tymna the Weaver & Thrasios, Triton Hero');
same('names are tidied (spaces, invisible characters) before joining', commanderText(['  Sol   Ring ', 'Ghave' + String.fromCodePoint(0x200B)]), 'Sol Ring & Ghave');
same('an empty name is dropped, not joined', commanderText(['', 'Sol Ring']), 'Sol Ring');
same('two empty names are no commanders', commanderText(['', '  ']), '');
refused('three commanders', () => commanderText(['A', 'B', 'C']), /at most two/);
refused('not a list', () => commanderText('Sol Ring'), /list of card names/);
refused('null', () => commanderText(null), /list of card names/);

// cleanDeckFields: what setDeck writes
same('nothing given: nothing stored', cleanDeckFields(), { commander: null, bracket: null, bracketGuess: null });
same('an empty object', cleanDeckFields({}), { commander: null, bracket: null, bracketGuess: null });
same('a commander only', cleanDeckFields({ commander: 'Sol Ring' }), { commander: 'Sol Ring', bracket: null, bracketGuess: null });
same('an empty commander text is stored as nothing', cleanDeckFields({ commander: '' }).commander, null);
same('a commander of only spaces is stored as nothing', cleanDeckFields({ commander: '   ' }).commander, null);
same('a commander of only invisible characters is stored as nothing', cleanDeckFields({ commander: String.fromCodePoint(0x200B, 0x202E) }).commander, null);
same('the commander is tidied', cleanDeckFields({ commander: '  Sol   Ring ' }).commander, 'Sol Ring');
for (const level of BRACKETS) same(`bracket ${level}`, cleanDeckFields({ bracket: level }).bracket, level);
same('a picked bracket is not a guess: the guess flag is null, not false', cleanDeckFields({ bracket: 3, bracketGuess: false }), { commander: null, bracket: 3, bracketGuess: null });
same('a guessed bracket keeps the flag as true', cleanDeckFields({ bracket: 3, bracketGuess: true }), { commander: null, bracket: 3, bracketGuess: true });
same('all three', cleanDeckFields({ commander: 'Sol Ring', bracket: 5, bracketGuess: true }), { commander: 'Sol Ring', bracket: 5, bracketGuess: true });
same('a bracket of undefined is no bracket', cleanDeckFields({ bracket: undefined }).bracket, null);
same('exactly 220 units is allowed', cleanDeckFields({ commander: 'x'.repeat(220) }).commander.length, 220);
same('110 emoji are 220 units and allowed', cleanDeckFields({ commander: SNAKE.repeat(110) }).commander.length, 220);
refused('221 units', () => cleanDeckFields({ commander: 'x'.repeat(221) }), /too long \(220/);
refused('111 emoji are 222 units', () => cleanDeckFields({ commander: SNAKE.repeat(111) }), /too long/);
refused('a commander that is a number', () => cleanDeckFields({ commander: 5 }), /must be text/);
refused('a commander that is null', () => cleanDeckFields({ commander: null }), /must be text/);
refused('a commander that is a list', () => cleanDeckFields({ commander: ['Sol Ring'] }), /must be text/);
for (const [label, value] of [['0', 0], ['6', 6], ['-1', -1], ['2.5', 2.5], ['the text "3"', '3'], ['true', true], ['NaN', NaN], ['Infinity', Infinity], ['a list', [3]]]) {
  refused(`a bracket of ${label}`, () => cleanDeckFields({ bracket: value }), /whole number from 1 to 5/);
}
refused('a guess flag that is a text', () => cleanDeckFields({ bracket: 3, bracketGuess: 'true' }), /true or false/);
refused('a guess flag that is a number', () => cleanDeckFields({ bracket: 3, bracketGuess: 1 }), /true or false/);
refused('a guess flag that is null', () => cleanDeckFields({ bracket: 3, bracketGuess: null }), /true or false/);
refused('a guess with no bracket', () => cleanDeckFields({ bracketGuess: true }), /needs a bracket/);
refused('a guess with a bracket of null', () => cleanDeckFields({ bracket: null, bracketGuess: true }), /needs a bracket/);

// deckFieldsChanged: stored fields that are missing count as null
const none = { commander: null, bracket: null, bracketGuess: null };
same('a member with no deck and an empty deck: no change', deckFieldsChanged({ name: 'Bo', seat: '2' }, none), false);
same('no member entry at all and an empty deck: no change', deckFieldsChanged(null, none), false);
same('a first commander is a change', deckFieldsChanged({ name: 'Bo', seat: '2' }, { ...none, commander: 'Sol Ring' }), true);
same('the same commander is not a change', deckFieldsChanged({ commander: 'Sol Ring' }, { ...none, commander: 'Sol Ring' }), false);
same('another commander is a change', deckFieldsChanged({ commander: 'Sol Ring' }, { ...none, commander: 'Ghave' }), true);
same('removing the commander is a change', deckFieldsChanged({ commander: 'Sol Ring' }, none), true);
same('a first bracket is a change', deckFieldsChanged({}, { ...none, bracket: 3 }), true);
same('another bracket is a change', deckFieldsChanged({ bracket: 3 }, { ...none, bracket: 4 }), true);
same('the same bracket is not a change', deckFieldsChanged({ bracket: 3 }, { ...none, bracket: 3 }), false);
same('removing the bracket is a change', deckFieldsChanged({ bracket: 3 }, none), true);
same('a guess becoming a pick is a change', deckFieldsChanged({ bracket: 3, bracketGuess: true }, { ...none, bracket: 3 }), true);
same('a pick becoming a guess is a change', deckFieldsChanged({ bracket: 3 }, { ...none, bracket: 3, bracketGuess: true }), true);
same('the same guess is not a change', deckFieldsChanged({ bracket: 3, bracketGuess: true }, { ...none, bracket: 3, bracketGuess: true }), false);
same('the name, the seat and a ready mark are not deck fields', deckFieldsChanged({ name: 'Bo', seat: '2', ready: 1 }, none), false);

// The limit against the real card list: every name, every alternate title, and the worst possible pairs
const cardsFile = new URL('../frontend/public/data/cards.json', import.meta.url);
if (existsSync(cardsFile)) {
  const cards = JSON.parse(readFileSync(cardsFile, 'utf8'));
  same('the card list has the usual shape (so the loop below tested real cards)', [cards.length > 30000, typeof cards[0].n], [true, 'string']);
  let longest = 0; let changed = 0; let tooLong = 0; let bad = '';
  const names = cards.flatMap((card) => [card.n, ...(card.f ?? [])]);
  for (const name of names) {
    longest = Math.max(longest, name.length);
    let cleaned;
    try { cleaned = cleanDeckFields({ commander: name }).commander; } catch { tooLong++; bad = name; continue; }
    if (cleaned !== name) { changed++; bad = name; }
  }
  checks++;
  if (tooLong || changed) fail('every real card name and alternate title passes unchanged', `${tooLong} too long, ${changed} altered, for example ${JSON.stringify(bad)}`);
  // Two names joined, for the longest ones of any card (the worst a player could pick) and the longest legendary ones.
  const byLength = [...cards].sort((a, b) => b.n.length - a.n.length);
  const legendary = byLength.filter((card) => /Legendary/.test(card.t));
  for (const [label, pool] of [['any two cards', byLength], ['two legendary cards', legendary]]) {
    const joined = commanderText([pool[0].n, pool[1].n]);
    same(`the longest pair for ${label} fits (${joined.length} units)`, cleanDeckFields({ commander: joined }).commander, joined);
  }
  same('the limit leaves a margin over the worst pair of any two names (so a new long card does not break it at once)', COMMANDER_MAX - commanderText([byLength[0].n, byLength[1].n]).length >= 8, true);
  console.log(`(checked ${names.length} real names and titles against the limit; the longest is ${longest} units)`);
} else {
  console.log('(card list not built: the real-name checks were skipped. Build it with: node scripts/build-card-list.mjs --from-files --site)');
}

console.log(`All ${checks} deck field checks passed.`);
