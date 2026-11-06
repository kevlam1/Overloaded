// Tests for turning a two-sided card over (list format 5, `b` and `bpt`): the game logic in shared/zones.mjs, the storage in
// shared/game-sync.mjs, the list lookup in shared/card-lookup.mjs and the printed numbers in shared/marks.mjs. The four cards are the
// real list entries printed on 2026-11-06 (Sephiroth and Delver are transform cards, Valakut Awakening is a modal card, Fire // Ice
// is a split card with no back).
import {
  makeGame, moveCard, setTapped, nextTurn, seededRandom, checkGame, ZONES, faceType, isLandCard, battlefieldRows, turnOver, setFaceDown,
  changeCounter, changeModifier, setNote, createToken, copyAsToken,
} from '../shared/zones.mjs';
import { packCard, unpackCard, readCards, splitGame, joinGame } from '../shared/game-sync.mjs';
import { makeLookup } from '../shared/card-lookup.mjs';
import { printedOf, statsOf } from '../shared/marks.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };
// The same data, whatever order the keys of an object were written in.
const canon = (value) => (Array.isArray(value) ? value.map(canon) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canon(value[key])])) : value);
const same = (label, actual, expected) => { checks++; if (JSON.stringify(canon(actual)) !== JSON.stringify(canon(expected))) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const refused = (label, run, words) => {
  checks++;
  try { run(); } catch (error) { if (error instanceof Error && (!words || words.test(error.message))) return; fail(label, `refused with the wrong message: ${error.message}`); }
  fail(label, 'was accepted');
};
const deepFreeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; };

const SEPHIROTH = '85eaf5e7-77dc-4842-a70c-ce4ac7f724df';
const VALAKUT = '228e551e-023a-4c9a-8f32-58dae6ffdf7f';
const DELVER = '6904ea20-e504-47da-95a0-08739fdde260';
const FIRE_ICE = '18303862-4726-4136-814f-157aa7006579';
const FOREST = '00000000-0000-4000-8000-000000000001';
const LIST = [
  { n: 'Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel', t: 'Legendary Creature — Human Avatar Soldier // Legendary Creature — Angel Nightmare Avatar', m: '{2}{B}', k: ['Flying', 'Transform', 'Super Nova'], i: SEPHIROTH, pt: '3/3', b: 1, bpt: '5/5' },
  { n: 'Valakut Awakening // Valakut Stoneforge', t: 'Instant // Land', m: '{2}{R}', k: [], i: VALAKUT, b: 1 },
  { n: 'Delver of Secrets // Insectile Aberration', t: 'Creature — Human Wizard // Creature — Human Insect', m: '{U}', k: ['Flying', 'Transform'], i: DELVER, pt: '1/1', b: 1, bpt: '3/2' },
  { n: 'Fire // Ice', t: 'Instant // Instant', m: '{1}{R} // {1}{U}', k: [], i: FIRE_ICE },
  // 79 real cards have numbers on the front and none on the back; this one is a creature that turns into a land.
  { n: 'Aclazotz, Deepest Betrayal // Temple of the Dead', t: 'Legendary Creature — Bat God // Land', m: '{3}{B}{B}', k: ['Flying', 'Lifelink', 'Transform'], i: '627c392c-4d18-4eb2-a4e8-c668f61f5487', pt: '4/4', b: 1 },
  { n: 'Forest', t: 'Basic Land — Forest', m: '', k: [], i: FOREST },
];
const lookup = makeLookup(LIST);
const deck = {
  cards: [
    { i: SEPHIROTH, n: LIST[0].n, qty: 2, section: 'main' }, { i: VALAKUT, n: LIST[1].n, qty: 2, section: 'main' },
    { i: DELVER, n: LIST[2].n, qty: 2, section: 'main' }, { i: FIRE_ICE, n: 'Fire // Ice', qty: 2, section: 'main' }, { i: FOREST, n: 'Forest', qty: 30, section: 'main' },
  ],
  commander: [],
};
const fresh = () => makeGame(deck, lookup, { random: seededRandom(5) });
const allCards = (game) => ZONES.flatMap((zone) => game.zones[zone]);
const firstOf = (game, id) => allCards(game).find((card) => card.i === id);
const cardOf = (game, uid) => allCards(game).find((card) => card.uid === uid);
// A game with one copy of each test card on the battlefield.
function table() {
  let game = fresh();
  const uids = {};
  for (const [key, id] of Object.entries({ sephiroth: SEPHIROTH, valakut: VALAKUT, delver: DELVER, fireIce: FIRE_ICE, forest: FOREST })) {
    uids[key] = firstOf(game, id).uid;
    game = moveCard(game, uids[key], 'battlefield');
  }
  return { game, uids };
}

// ---- what a game card knows ----
{
  const game = fresh();
  check('a transform card has b: 1 from the card list', firstOf(game, SEPHIROTH).b === 1 && firstOf(game, DELVER).b === 1);
  check('a modal card has b: 1', firstOf(game, VALAKUT).b === 1);
  check('a split card and a basic land have no b', !('b' in firstOf(game, FIRE_ICE)) && !('b' in firstOf(game, FOREST)));
  check('a card is not turned when it is dealt', allCards(game).every((card) => !('turned' in card)));
  same('the new game is consistent', checkGame(game), []);
  const unknown = makeGame(deck, () => null, { random: seededRandom(5) });
  check('a card the list does not know has no b', allCards(unknown).every((card) => !('b' in card)));
  check('a lookup that says b: 2 does not give b (only exactly 1)', allCards(makeGame(deck, () => ({ t: 'T', m: '', k: [], b: 2 }), { random: seededRandom(5) })).every((card) => !('b' in card)));
}

// ---- turnOver ----
{
  const { game, uids } = table();
  const turned = turnOver(game, uids.sephiroth);
  check('turning a transform card sets turned', cardOf(turned, uids.sephiroth).turned === true);
  check('it keeps its type line, b, name and id', cardOf(turned, uids.sephiroth).t === LIST[0].t && cardOf(turned, uids.sephiroth).b === 1 && cardOf(turned, uids.sephiroth).i === SEPHIROTH);
  check('turning it again turns it back, and the field is gone', !('turned' in cardOf(turnOver(turned, uids.sephiroth), uids.sephiroth)));
  same('turning twice gives the same card as before', cardOf(turnOver(turned, uids.sephiroth), uids.sephiroth), cardOf(game, uids.sephiroth));
  check('turning one card leaves the others alone', cardOf(turned, uids.delver) === cardOf(game, uids.delver) && cardOf(turned, uids.valakut) === cardOf(game, uids.valakut));
  check('the old game is not changed', !('turned' in cardOf(game, uids.sephiroth)));
  const frozen = deepFreeze(table());
  check('works on a frozen game (nothing is changed in place)', cardOf(turnOver(frozen.game, frozen.uids.valakut), frozen.uids.valakut).turned === true);
  check('tapped and the entry turn do not change', cardOf(turned, uids.sephiroth).tapped === false && cardOf(turned, uids.sephiroth).turnEntered === game.turn);
  check('a tapped card stays tapped when turned', cardOf(turnOver(setTapped(game, uids.delver, true), uids.delver), uids.delver).tapped === true);
  refused('a split card has no back face', () => turnOver(game, uids.fireIce), /Fire \/\/ Ice has no back face/);
  refused('a basic land has no back face', () => turnOver(game, uids.forest), /no back face/);
  const withBackInLibrary = fresh();
  const libraryBack = withBackInLibrary.zones.library.find((card) => card.b === 1);
  check('the test game has a card with a back in its library', Boolean(libraryBack));
  refused('a card in the library cannot be turned over', () => turnOver(withBackInLibrary, libraryBack.uid), /battlefield/);
  const handGame = moveCard(withBackInLibrary, libraryBack.uid, 'hand');
  refused('a card in the hand cannot be turned over', () => turnOver(handGame, libraryBack.uid), /battlefield/);
  for (const zone of ['graveyard', 'exile', 'command', 'sideboard']) refused(`a card in ${zone} cannot be turned over`, () => turnOver(moveCard(withBackInLibrary, libraryBack.uid, zone), libraryBack.uid), /battlefield/);
  refused('a card that is not in the game', () => turnOver(game, 'c999'), /not in the game/);
  same('a game with a turned card is consistent', checkGame(turned), []);
  same('and with several', checkGame(turnOver(turnOver(turned, uids.valakut), uids.delver)), []);
}

// ---- the face that shows decides the row ----
{
  const { game, uids } = table();
  same('the face type of a card not turned is its front half', faceType(cardOf(game, uids.valakut)), 'Instant');
  same('turned, it is the back half', faceType(cardOf(turnOver(game, uids.valakut), uids.valakut)), 'Land');
  same('a split card is always its front half', faceType(cardOf(game, uids.fireIce)), 'Instant');
  same('a card with no type line', faceType({}), '');
  same('no card at all', faceType(null), '');
  check('a turned flag on a card with no back is ignored', faceType({ t: 'Instant // Land', turned: true }) === 'Instant');
  check('b without turned is the front', faceType({ t: 'Instant // Land', b: 1 }) === 'Instant');
  check('a type line with three parts is not cut at the back', faceType({ t: 'A // B // C', b: 1, turned: true }) === 'A');
  check('Valakut Awakening is not a land in the hand or on the battlefield', !isLandCard(cardOf(game, uids.valakut)));
  check('turned over, Valakut Stoneforge is a land', isLandCard(cardOf(turnOver(game, uids.valakut), uids.valakut)));
  check('Sephiroth is not a land either way', !isLandCard(cardOf(game, uids.sephiroth)) && !isLandCard(cardOf(turnOver(game, uids.sephiroth), uids.sephiroth)));
  check('a basic land is a land', isLandCard(cardOf(game, uids.forest)));
  const before = battlefieldRows(game);
  same('before: one land, the rest in the other row', [before.lands.map((c) => c.uid), before.other.map((c) => c.uid)], [[uids.forest], [uids.sephiroth, uids.valakut, uids.delver, uids.fireIce]]);
  const after = battlefieldRows(turnOver(game, uids.valakut));
  same('after turning Valakut it moves to the land row, in the order cards came', [after.lands.map((c) => c.uid), after.other.map((c) => c.uid)], [[uids.valakut, uids.forest], [uids.sephiroth, uids.delver, uids.fireIce]]);
  same('turning it back puts it in the other row again', battlefieldRows(turnOver(turnOver(game, uids.valakut), uids.valakut)), before);
  // A land on the front with a creature on the back (none such is a modal card today, but the rule is the face that shows).
  const odd = { uid: 'c1', t: 'Land // Creature — Elf', b: 1 };
  check('a land front with a creature back: a land until turned, then not', isLandCard(odd) && !isLandCard({ ...odd, turned: true }));
}

// ---- leaving the battlefield ----
{
  const { game, uids } = table();
  const turned = turnOver(turnOver(game, uids.sephiroth), uids.valakut);
  for (const zone of ['hand', 'graveyard', 'exile', 'command', 'sideboard', 'library']) {
    const left = moveCard(turned, uids.sephiroth, zone);
    check(`a turned card that goes to ${zone} is not turned any more`, !('turned' in cardOf(left, uids.sephiroth)));
    check(`but still has its back face (b) in ${zone}`, cardOf(left, uids.sephiroth).b === 1);
    check(`and the game is consistent after it goes to ${zone}`, checkGame(left).length === 0, checkGame(left).join('; '));
    check(`when it comes back from ${zone} it shows its front`, !('turned' in cardOf(moveCard(left, uids.sephiroth, 'battlefield'), uids.sephiroth)));
  }
  const moved = moveCard(turned, uids.valakut, 'battlefield', { position: 'top' });
  check('moving within the battlefield keeps it turned', cardOf(moved, uids.valakut).turned === true);
  const next = nextTurn(turned).game;
  check('a new turn keeps it turned', cardOf(next, uids.sephiroth).turned === true);
  const rich = changeCounter(changeModifier(setNote(setFaceDown(turned, uids.sephiroth, true), uids.sephiroth, 'x'), uids.sephiroth, 'power', 2), uids.sephiroth, 'p', 1);
  check('it works with counters, a note, a modifier and face-down together', cardOf(rich, uids.sephiroth).turned === true && cardOf(rich, uids.sephiroth).ct.p === 1 && cardOf(rich, uids.sephiroth).faceDown === true);
  same('and the game is consistent', checkGame(rich), []);
  check('turning a face-down card over still works (face-down is a separate state)', cardOf(turnOver(setFaceDown(game, uids.delver, true), uids.delver), uids.delver).faceDown === true);
  const copy = copyAsToken(turned, uids.sephiroth);
  check('a copy is a token with no back face and not turned', copy.uid && !('b' in cardOf(copy.game, copy.uid)) && !('turned' in cardOf(copy.game, copy.uid)));
  same('and the game with the copy is consistent', checkGame(copy.game), []);
  const token = createToken(game, { n: 'Goblin', i: '00000000-0000-4000-8000-000000000009', tt: 'Token Creature — Goblin', pt: '1/1', cl: 'R' });
  refused('a token has no back face', () => turnOver(token.game, token.uid), /no back face/);
}

// ---- consistency check ----
{
  const { game, uids } = table();
  const turned = turnOver(game, uids.sephiroth);
  const edit = (base, uid, change) => ({ ...base, zones: { ...base.zones, battlefield: base.zones.battlefield.map((card) => (card.uid === uid ? change(card) : card)) } });
  check('turned without b is a problem', checkGame(edit(turned, uids.sephiroth, ({ b, ...rest }) => rest)).some((p) => /turned over but has no back face/.test(p)));
  for (const bad of [false, 1, 'true', null]) {
    check(`turned that is ${JSON.stringify(bad)} is a problem`, checkGame(edit(game, uids.sephiroth, (card) => ({ ...card, turned: bad }))).some((p) => /turned over but has no back face/.test(p)));
  }
  for (const bad of [0, true, '1', 2, null]) {
    check(`b that is ${JSON.stringify(bad)} is a problem`, checkGame(edit(game, uids.sephiroth, (card) => ({ ...card, b: bad }))).some((p) => /damaged back-face mark/.test(p)));
  }
  const outside = { ...turned, zones: { ...turned.zones, hand: [{ ...turned.zones.hand[0], b: 1, turned: true }, ...turned.zones.hand.slice(1)] } };
  check('turned outside the battlefield is a problem', checkGame(outside).some((p) => /has turned outside the battlefield/.test(p)));
  check('b outside the battlefield is fine', checkGame(fresh()).length === 0 && fresh().zones.library.some((card) => card.b === 1));
}

// ---- storage ----
{
  const { game, uids } = table();
  const turned = turnOver(game, uids.sephiroth);
  const packed = packCard(cardOf(turned, uids.sephiroth));
  check('a turned card is stored with bk: 1', packed.bk === 1);
  check('b is not stored (each page knows it from its own card list)', !('b' in packed));
  check('a card that is not turned has no bk', !('bk' in packCard(cardOf(game, uids.sephiroth))));
  same('a stored card reads back the same', unpackCard(packed, lookup), cardOf(turned, uids.sephiroth));
  same('a card that is not turned reads back the same', unpackCard(packCard(cardOf(game, uids.valakut)), lookup), cardOf(game, uids.valakut));
  const unknownPage = unpackCard(packed, () => null);
  check('a page whose list does not know the card shows no back and no b', !('turned' in unknownPage) && !('b' in unknownPage) && unknownPage.n === LIST[0].n);
  const oldList = unpackCard(packed, makeLookup(LIST.map(({ b, bpt, ...rest }) => rest)));
  check('a page with an older list (no b) ignores bk', !('turned' in oldList) && !('b' in oldList));
  const forced = unpackCard(packCard({ ...cardOf(game, uids.forest), turned: true }), lookup);
  check('a turned-over mark on a card with no back is ignored (a basic land, by another player)', !('turned' in forced) && !('b' in forced) && forced.n === 'Forest');
  const splitForced = unpackCard(packCard({ ...cardOf(game, uids.fireIce), turned: true }), lookup);
  check('and on a split card', !('turned' in splitForced) && !('b' in splitForced));
  for (const bad of [0, 2, true, '1', null, [1], {}]) check(`bk that is ${JSON.stringify(bad)} makes the stored card unreadable`, unpackCard({ ...packed, bk: bad }, lookup) === null);
  const token = createToken(game, { n: 'Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel', i: SEPHIROTH, tt: 'Token Creature — Goblin', pt: '1/1' });
  const tokenRead = unpackCard({ ...packCard(cardOf(token.game, token.uid)), bk: 1 }, lookup);
  check('a token that shares a name and id with a card with a back never gets one', tokenRead && !('b' in tokenRead) && !('turned' in tokenRead));
  // Whole games through the public and private branches.
  const sides = splitGame(turned);
  const back = joinGame(sides.public, sides.private, lookup);
  same('a whole game with a turned card comes back the same', back, turned);
  check('the turned mark is in the public branch (the other players see it)', JSON.stringify(sides.public).includes('"bk":1'));
  check('the hand and library stay private, and have no turned cards', !JSON.stringify(sides.private).includes('"bk"'));
  const read = readCards(sides.public.battlefield, lookup);
  check('readCards (what another player sees) shows it turned', read.some((card) => card.uid === uids.sephiroth && card.turned === true));
}

// ---- the list lookup ----
{
  same('the lookup gives b and bpt for Sephiroth', lookup({ i: SEPHIROTH }), { t: LIST[0].t, m: '{2}{B}', k: LIST[0].k, pt: '3/3', b: 1, bpt: '5/5' });
  same('and b alone for a modal card with no back power and toughness', lookup({ i: VALAKUT }), { t: 'Instant // Land', m: '{2}{R}', k: [], b: 1 });
  same('and neither for a split card', lookup({ i: FIRE_ICE }), { t: 'Instant // Instant', m: '{1}{R} // {1}{U}', k: [] });
  same('found by name when the id is stale', lookup({ i: 'ffffffff-ffff-4fff-8fff-ffffffffffff', n: 'Delver of Secrets // Insectile Aberration' }).bpt, '3/2');
  const odd = makeLookup([{ n: 'X', t: 'T', m: '', k: [], i: 'a', bpt: '1/1' }, { n: 'Y', t: 'T', m: '', k: [], i: 'b', b: 0, bpt: '1/1' }, { n: 'Z', t: 'T', m: '', k: [], i: 'c', b: 1, bpt: 7 }]);
  check('bpt without b is ignored', !('bpt' in odd({ i: 'a' })) && !('b' in odd({ i: 'a' })));
  check('b that is not exactly 1 is ignored', !('b' in odd({ i: 'b' })) && !('bpt' in odd({ i: 'b' })));
  check('a bpt that is not text is ignored but b stays', odd({ i: 'c' }).b === 1 && !('bpt' in odd({ i: 'c' })));
}

// ---- the printed numbers follow the face that shows ----
{
  const { game, uids } = table();
  const sephiroth = cardOf(game, uids.sephiroth);
  same('the front shows the printed 3/3', printedOf(sephiroth, lookup), '3/3');
  same('turned over it shows 5/5', printedOf({ ...sephiroth, turned: true }, lookup), '5/5');
  same('Delver turned over is 3/2', printedOf({ ...cardOf(game, uids.delver), turned: true }, lookup), '3/2');
  same('Valakut Stoneforge has no numbers, and never borrows the front\'s', printedOf({ ...cardOf(game, uids.valakut), turned: true }, lookup), null);
  const aclazotz = { uid: 'c1', i: '627c392c-4d18-4eb2-a4e8-c668f61f5487', n: 'Aclazotz, Deepest Betrayal // Temple of the Dead', t: LIST[4].t, m: '', k: [], b: 1, tapped: false, turnEntered: 1 };
  same('Aclazotz shows its 4/4 on the front', printedOf(aclazotz, lookup), '4/4');
  same('turned into its land it shows no numbers, not the front\'s 4/4', printedOf({ ...aclazotz, turned: true }, lookup), null);
  check('and it is a creature on the front and a land when turned', !isLandCard(aclazotz) && isLandCard({ ...aclazotz, turned: true }));
  same('a card with no list entry has none',printedOf({ ...sephiroth, i: 'x', n: 'Nobody', turned: true }, lookup), null);
  same('a card that is not turned does not use the back', printedOf(cardOf(game, uids.delver), lookup), '1/1');
  same('a turned token still uses its own numbers', printedOf({ tok: true, pt: '2/2', turned: true }, lookup), '2/2');
  const changed = changeCounter(turnOver(game, uids.sephiroth), uids.sephiroth, 'p', 2);
  const stats = statsOf(cardOf(changed, uids.sephiroth), printedOf(cardOf(changed, uids.sephiroth), lookup));
  same('counters add to the back\'s numbers (5/5 and two +1/+1 counters is 7/7)', [stats.power, stats.toughness], [7, 7]);
}

// ---- long random games: nothing breaks, nothing is lost ----
{
  const random = seededRandom(77);
  const pick = (list) => list[Math.floor(random() * list.length)];
  for (let round = 0; round < 5; round++) {
    let game = makeGame(deck, lookup, { random: seededRandom(100 + round) });
    const total = allCards(game).length;
    for (let step = 0; step < 1500; step++) {
      const cards = allCards(game);
      const battlefield = game.zones.battlefield;
      const roll = random();
      if (roll < 0.35 && battlefield.length) { try { game = turnOver(game, pick(battlefield).uid); } catch (error) { if (!/no back face/.test(error.message)) throw error; } }
      else if (roll < 0.7) game = moveCard(game, pick(cards).uid, pick(ZONES));
      else if (roll < 0.8 && battlefield.length) game = setTapped(game, pick(battlefield).uid, random() < 0.5);
      else if (roll < 0.9) game = nextTurn(game).game;
      else { const wire = joinGame(splitGame(game).public, splitGame(game).private, lookup); same(`round ${round} step ${step}: a saved game reads back the same`, wire, game); }
      const problems = checkGame(game);
      if (problems.length) fail(`round ${round} step ${step}: the game stays consistent`, problems.join('; '));
      if (allCards(game).length !== total) fail(`round ${round} step ${step}: no card is lost or copied`, `${allCards(game).length} of ${total}`);
      for (const card of game.zones.battlefield) if (card.turned && !(card.b === 1)) fail('a turned card has a back face', card.uid);
    }
  }
  checks++;
}

console.log(`All ${checks} turn over checks passed.`);
