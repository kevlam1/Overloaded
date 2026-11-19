// Tests for foil (Kevin, 2026-11-18): a card is foil because the DECK LIST says so (a *F* on the line, as Moxfield and Archidekt export it, or a printing that exists only as foil), and it is foil in the game.
// There is no way to make a card foil in the game. Run: node scripts/test-foil.mjs
import { buildCardIndex, matchDeck } from '../shared/card-match.mjs';
import { parseDeckText } from '../shared/deck-text.mjs';
import { makePreview, buildSavedDeck, serializeDeck, readSavedDeck } from '../shared/deck-preview.mjs';
import { printingValue } from '../shared/printings.mjs';
import { makeGame, moveCard, seededRandom } from '../shared/zones.mjs';
import { stackKey } from '../shared/stacks.mjs';

let checks = 0;
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); } };

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cards = [{ n: 'Sol Ring', t: 'Artifact', m: '{1}', k: [], i: uuid(1) }, { n: 'Island', t: 'Basic Land', m: '', k: [], i: uuid(2) }];
const files = new Map([['cmm', { 410: printingValue(uuid(11), 'Sol Ring'), 411: printingValue(uuid(12), 'Sol Ring', '2') }]]); // 411 exists only as foil
const preview = (text) => { const parsed = parseDeckText(text); return makePreview(parsed, matchDeck(buildCardIndex(cards), parsed.entries), {}, files); };
const lineOf = (p, name, foil) => p.lines.find((l) => l.name === name && l.foil === foil);

// a *F* on a line makes that line foil; the same card not foil is another line
{ const p = preview('2 Sol Ring *F*\n3 Sol Ring\n1 Island');
  same('a line with *F* is foil, the same card without it is another line, and a card with no mark is not foil', [lineOf(p, 'Sol Ring', true)?.qty, lineOf(p, 'Sol Ring', false)?.qty, lineOf(p, 'Island', false)?.foil, lineOf(p, 'Sol Ring', true)?.foilOnly], [2, 3, false, false]);
  same('two lines that are both foil are one line', preview('1 Sol Ring *F*\n2 Sol Ring *f*').lines.map((l) => [l.qty, l.foil]), [[3, true]]); }

// a printing that exists only as foil makes the line foil without a mark, and a printing with a nonfoil finish does not
{ const p = preview('1 Sol Ring (CMM) 411\n1 Sol Ring (CMM) 410');
  same('a foil-only printing is foil by itself (and says why), a normal printing is not', [lineOf(p, 'Sol Ring', true)?.foilOnly, lineOf(p, 'Sol Ring', true)?.printingId, lineOf(p, 'Sol Ring', false)?.printingId], [true, uuid(12), uuid(11)]);
  same('a foil-only printing with *F* too is one foil line', preview('1 Sol Ring (CMM) 411 *F*\n1 Sol Ring (CMM) 411').lines.map((l) => [l.qty, l.foil]), [[2, true]]); }

// a card typed by another title it was printed under finds the same printing, so it is foil too when that printing is foil only and its set file is loaded, and joins the typed line
{ const titled = [{ ...cards[0], f: ['Heart of the Mountain'], fp: [uuid(12)] }, cards[1]];
  const parsed = parseDeckText('1 Heart of the Mountain\n1 Sol Ring (CMM) 411');
  const p = makePreview(parsed, matchDeck(buildCardIndex(titled), parsed.entries), {}, files);
  same('the title line and the typed line are one foil line of 2 (the printing is foil only for both)', p.lines.map((l) => [l.qty, l.foil, l.printingId]), [[2, true, uuid(12)]]);
  const alone = parseDeckText('1 Heart of the Mountain');
  same('with no set file loaded for it the title line alone is not marked (nothing says it is foil only)', makePreview(alone, matchDeck(buildCardIndex(titled), alone.entries), {}, new Map()).lines.map((l) => l.foil), [false]); }
// saving, reading back, and the game
{ const p = preview('30 Island\n2 Sol Ring *F*\n3 Sol Ring');
  const built = buildSavedDeck(p, { name: 'Foil deck', text: '30 Island\n2 Sol Ring *F*\n3 Sol Ring', commanderIds: [] });
  const saved = built.deck.cards.filter((c) => c.n === 'Sol Ring');
  same('a saved deck keeps foil as its own entry (foil: true only on the foil copies)', saved.map((c) => [c.qty, c.foil ?? false]), [[3, false], [2, true]]);
  const back = readSavedDeck(serializeDeck(built.deck));
  same('reading it back keeps foil, and a foil that is not exactly true makes the deck unreadable', [back.cards.filter((c) => c.foil === true).length, readSavedDeck(serializeDeck({ ...built.deck, cards: built.deck.cards.map((c) => (c.n === 'Island' ? { ...c, foil: false } : c)) }))], [1, null]);
  const game = makeGame(back, () => ({ t: 'Artifact', m: '', k: [] }), { random: seededRandom(3) });
  const all = Object.values(game.zones).flat().filter((c) => c.n === 'Sol Ring');
  same('in the game, exactly the copies from the foil line are foil (2 of the 5), and Islands are not', [all.filter((c) => c.foil === true).length, all.length, Object.values(game.zones).flat().filter((c) => c.n === 'Island' && c.foil).length], [2, 5, 0]);
  const foilCard = all.find((c) => c.foil);
  same('a card keeps being foil when it moves, and a foil and a normal copy do not make one pile', [moveCard(game, foilCard.uid, 'graveyard').zones.graveyard[0].foil, stackKey({ n: 'Sol Ring', foil: true }) === stackKey({ n: 'Sol Ring' })], [true, false]); }

// which foil it is (the look): a surge printing, an etched-only printing, *E* with no printing, and a plain foil
{ const kinds = new Map([['cmm', { 410: printingValue(uuid(11), 'Sol Ring'), 413: printingValue(uuid(13), 'Sol Ring', '3s'), 414: printingValue(uuid(14), 'Sol Ring', '4') }]]);
  const make = (text) => { const parsed = parseDeckText(text); return makePreview(parsed, matchDeck(buildCardIndex(cards), parsed.entries), {}, kinds); };
  same('a surge printing with *F* has the surge look, an etched-only printing is etched, *E* alone is etched, *F* alone is a plain foil, and a normal card has none', [make('1 Sol Ring (CMM) 413 *F*').lines[0].look, make('1 Sol Ring (CMM) 414').lines[0].look, make('1 Sol Ring *E*').lines[0].look, make('1 Sol Ring *F*').lines[0].look, make('1 Sol Ring (CMM) 413').lines[0].look, make('1 Island').lines[0].look], ['surge', 'etched', 'etched', 'traditional', null, null]);
  same('the same card in surge and in plain foil are two lines', make('1 Sol Ring (CMM) 413 *F*\n1 Sol Ring *F*').lines.map((l) => l.look), ['surge', 'traditional']);
  const built = buildSavedDeck(make('1 Sol Ring (CMM) 413 *F*\n1 Sol Ring *F*\n1 Sol Ring *E*\n1 Island'), { name: 'Looks', commanderIds: [] });
  same('a saved deck stores the look only when it is not a plain foil', built.deck.cards.filter((c) => c.n === 'Sol Ring').map((c) => c.look ?? '').sort(), ['', 'etched', 'surge']);
  const back = readSavedDeck(serializeDeck(built.deck));
  same('reading it back keeps the looks, and refuses a look that is not known or is on a card that is not foil', [back.cards.filter((c) => c.look).length, readSavedDeck(serializeDeck({ ...built.deck, cards: built.deck.cards.map((c) => (c.look === 'surge' ? { ...c, look: 'nope' } : c)) })), readSavedDeck(serializeDeck({ ...built.deck, cards: built.deck.cards.map((c) => (c.n === 'Island' ? { ...c, look: 'surge' } : c)) }))], [2, null, null]);
  const game = makeGame(back, () => ({ t: 'Artifact', m: '', k: [] }), { random: seededRandom(3) });
  const rings = Object.values(game.zones).flat().filter((c) => c.n === 'Sol Ring');
  same('the game cards carry the look, and a surge card and a plain foil card do not make one pile', [rings.map((c) => c.look ?? '').sort(), stackKey({ n: 'Sol Ring', foil: true, look: 'surge' }) === stackKey({ n: 'Sol Ring', foil: true })], [['', 'etched', 'surge'], false]); }

console.log(`All ${checks} foil checks passed.`);
