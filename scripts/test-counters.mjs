// Tests for the counters, the power and toughness modifier, notes, face-down, tokens and player counters in shared/zones.mjs
// (docs/tokens-counters.md): what each does, what it refuses, that the old game is never changed, and that long random games
// stay consistent.
import {
  makeGame, moveCard, draw, setTapped, untapAll, adjustLife, nextTurn, shuffleLibrary, mulligan, seededRandom, checkGame, ZONES,
  COUNTER_KINDS, COUNTER_WORDS, MAX_COUNT, MAX_MODIFIER, MAX_NOTE, MAX_TOKEN_TEXT, MAX_ZONE_CARDS, PLAYER_COUNTERS, COMMANDER_SEATS,
  changeCounter, changeModifier, resetModifier, netChange, setNote, setFaceDown, createToken, copyAsToken, changePlayerCounter, changeCommanderDamage,
} from '../shared/zones.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const refused = (label, run, words) => {
  checks++;
  try { run(); } catch (error) { if (error instanceof Error && (!words || words.test(error.message))) return; fail(label, `refused with the wrong message: ${error.message}`); }
  fail(label, 'was accepted');
};
const deepFreeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; };

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deck = {
  cards: [
    { i: id(5), n: 'Krenko, Mob Boss', qty: 1, section: 'commander' },
    { i: id(1), n: 'Forest', qty: 20, section: 'main' }, { i: id(3), n: 'Goblin Guide', qty: 12, section: 'main' }, { i: id(4), n: 'Lightning Bolt', qty: 8, section: 'main', p: id(99) },
  ],
  commander: [id(5)],
};
const lookup = (card) => ({ t: card.i === id(1) ? 'Basic Land - Forest' : 'Creature - Goblin', m: '', k: [] });
const fresh = () => makeGame(deck, lookup, { random: seededRandom(11) });

// A game with some cards on the battlefield: returns { game, ids: [uid, uid, uid], hand: a uid still in the hand }.
function withBattlefield(count = 3) {
  let game = fresh();
  const ids = game.zones.hand.slice(0, count).map((card) => card.uid);
  for (const uid of ids) game = moveCard(game, uid, 'battlefield');
  return { game, ids, hand: game.zones.hand[0].uid };
}
const cardOf = (game, uid) => ZONES.flatMap((zone) => game.zones[zone]).find((card) => card.uid === uid);
const problemsOf = (game) => checkGame(game);
const TOKEN = { n: 'Goblin', i: id(70), tt: 'Token Creature - Goblin', pt: '1/1', cl: 'R' };

// ---- the numbers and words are what the design says (written out here so changing them fails this test) ----
same('counter kinds', COUNTER_KINDS, ['p', 'm', 'l', 'c', 't', 'o']);
same('counter words', COUNTER_WORDS, { p: '+1/+1', m: '-1/-1', l: 'Loyalty', c: 'Charge', t: 'Time', o: 'Other' });
same('the limits', [MAX_COUNT, MAX_MODIFIER, MAX_NOTE, MAX_TOKEN_TEXT, MAX_ZONE_CARDS], [1_000_000_000_000, 1_000_000_000_000, 40, 60, 250]);
same('player counters and seats', [PLAYER_COUNTERS, COMMANDER_SEATS], [['poison', 'energy', 'experience', 'rad', 'ticket', 'speed', 'ring', 'monarch', 'initiative', 'blessing'], ['1', '2', '3', '4']]);

// ---- counters ----
{
  const { game, ids, hand } = withBattlefield();
  const [a, b] = ids;
  check('a card with no counters has no counters field at all', !('ct' in cardOf(game, a)));
  let g = changeCounter(game, a, 'p', 1);
  same('one +1/+1 counter', cardOf(g, a).ct, { p: 1 });
  g = changeCounter(g, a, 'p', 3);
  same('three more', cardOf(g, a).ct, { p: 4 });
  g = changeCounter(g, a, 'p', -1);
  same('one removed', cardOf(g, a).ct, { p: 3 });
  same('another card is not touched', cardOf(g, b), cardOf(game, b));
  g = changeCounter(g, a, 'p', -3);
  check('removing the last one takes the whole field away (nothing is stored for none)', !('ct' in cardOf(g, a)), JSON.stringify(cardOf(g, a)));
  g = changeCounter(g, a, 'p', -5);
  check('removing counters that are not there changes nothing and goes below nothing', !('ct' in cardOf(g, a)));
  same('every other kind works on its own', COUNTER_KINDS.filter((kind) => kind !== 'p' && kind !== 'm').map((kind) => changeCounter(game, a, kind, 2)).map((x) => cardOf(x, a).ct), [{ l: 2 }, { c: 2 }, { t: 2 }, { o: 2 }]);
  same('different kinds sit side by side', cardOf(changeCounter(changeCounter(game, a, 'l', 3), a, 'c', 1), a).ct, { l: 3, c: 1 });
  check('a count stops at the limit', cardOf(changeCounter(changeCounter(game, a, 'o', 99), a, 'o', 99), a).ct.o === 198 && (() => { let x = game; for (let n = 0; n < 3; n++) x = changeCounter(x, a, 'o', MAX_COUNT); return cardOf(x, a).ct.o === MAX_COUNT; })() && cardOf(changeCounter(game, a, 'o', 5_000_000_000), a).ct.o === 5_000_000_000);

  // +1/+1 and -1/-1 cancel in pairs, like the real rules
  let c = changeCounter(game, a, 'm', 3);
  same('three -1/-1 counters', cardOf(c, a).ct, { m: 3 });
  same('adding two +1/+1 removes two -1/-1 instead', cardOf(changeCounter(c, a, 'p', 2), a).ct, { m: 1 });
  same('adding three +1/+1 removes all three -1/-1 and nothing is left', 'ct' in cardOf(changeCounter(c, a, 'p', 3), a), false);
  same('adding five +1/+1 cancels three and leaves two', cardOf(changeCounter(c, a, 'p', 5), a).ct, { p: 2 });
  const d = changeCounter(game, a, 'p', 3);
  same('and the other way round: -1/-1 removes +1/+1 first', cardOf(changeCounter(d, a, 'm', 2), a).ct, { p: 1 });
  same('five -1/-1 on three +1/+1 leaves two -1/-1', cardOf(changeCounter(d, a, 'm', 5), a).ct, { m: 2 });
  same('removing +1/+1 counters never touches the -1/-1 ones', cardOf(changeCounter(changeCounter(game, a, 'm', 2), a, 'p', -1), a).ct, { m: 2 });
  same('cancelling does not touch other kinds', cardOf(changeCounter(changeCounter(changeCounter(game, a, 'l', 4), a, 'm', 2), a, 'p', 2), a).ct, { l: 4 });
  check('a card never ends up with both kinds', (() => { let x = game; const r = seededRandom(5); for (let n = 0; n < 400; n++) { x = changeCounter(x, a, r() < 0.5 ? 'p' : 'm', Math.floor(r() * 7) - 3 || 1); const ct = cardOf(x, a).ct ?? {}; if (ct.p && ct.m) return false; } return true; })());

  // refusals
  refused('an unknown kind', () => changeCounter(game, a, 'x', 1), /kind of counter/);
  for (const bad of [0, 1.5, MAX_COUNT + 1, -MAX_COUNT - 1, NaN, Infinity, '2', null, undefined, true]) refused(`a change of ${String(bad)}`, () => changeCounter(game, a, 'p', bad), /whole number/);
  refused('a card in the hand cannot hold counters', () => changeCounter(game, hand, 'p', 1), /battlefield/);
  refused('a card that is not in the game', () => changeCounter(game, 'c99999', 'p', 1), /not in the game/);
  check('every result is a consistent game', problemsOf(changeCounter(changeCounter(game, a, 'p', 2), b, 'm', 1)).length === 0);
  check('the old game is not changed (frozen games would throw)', (() => { const frozen = deepFreeze(structuredClone(game)); changeCounter(frozen, a, 'p', 2); changeCounter(frozen, a, 'm', 2); return true; })());
}

// ---- the modifier ----
{
  const { game, ids, hand } = withBattlefield();
  const [a, b] = ids;
  let g = changeModifier(game, a, 'power', 1);
  same('power +1', [cardOf(g, a).mp, 'mt' in cardOf(g, a)], [1, false]);
  g = changeModifier(g, a, 'toughness', -3);
  same('toughness -3', [cardOf(g, a).mp, cardOf(g, a).mt], [1, -3]);
  same('another card is not touched', cardOf(g, b), cardOf(game, b));
  g = changeModifier(g, a, 'power', -1);
  same('back to 0 takes the field away', ['mp' in cardOf(g, a), cardOf(g, a).mt], [false, -3]);
  same('the modifier stops at the limit and its negative', [cardOf(changeModifier(changeModifier(game, a, 'power', MAX_MODIFIER), a, 'power', 99), a).mp, cardOf(changeModifier(changeModifier(game, a, 'toughness', -MAX_MODIFIER), a, 'toughness', -50), a).mt], [MAX_MODIFIER, -MAX_MODIFIER]);
  same('a modifier can be in the billions', cardOf(changeModifier(game, a, 'power', 3_000_000_000), a).mp, 3_000_000_000);
  g = changeModifier(changeModifier(game, a, 'power', 4), a, 'toughness', 2);
  const cleared = resetModifier(g, a);
  check('reset takes both away', !('mp' in cardOf(cleared, a)) && !('mt' in cardOf(cleared, a)));
  check('reset on a card with none changes nothing', JSON.stringify(cardOf(resetModifier(game, a), a)) === JSON.stringify(cardOf(game, a)));
  check('the modifier is not a counter: counters are untouched by it', 'ct' in cardOf(changeModifier(changeCounter(game, a, 'p', 2), a, 'power', 1), a) && cardOf(changeModifier(changeCounter(game, a, 'p', 2), a, 'power', 1), a).ct.p === 2);
  refused('a part that is not power or toughness', () => changeModifier(game, a, 'speed', 1), /power or toughness/);
  for (const bad of [0, 2.5, MAX_MODIFIER + 1, NaN, '1', null]) refused(`a modifier change of ${String(bad)}`, () => changeModifier(game, a, 'power', bad), /whole number/);
  refused('a card in the hand', () => changeModifier(game, hand, 'power', 1), /battlefield/);
  refused('reset on a card in the hand', () => resetModifier(game, hand), /battlefield/);

  // netChange: the modifier plus the counters
  same('nothing set', netChange(cardOf(game, a)), { power: 0, toughness: 0 });
  same('a modifier alone', netChange({ mp: 2, mt: 1 }), { power: 2, toughness: 1 });
  same('+1/+1 counters alone', netChange({ ct: { p: 3 } }), { power: 3, toughness: 3 });
  same('-1/-1 counters alone', netChange({ ct: { m: 2 } }), { power: -2, toughness: -2 });
  same('three +1/+1 counters and a +2/+0 modifier make +5/+3 (Kevin\'s example)', netChange({ ct: { p: 3 }, mp: 2 }), { power: 5, toughness: 3 });
  same('other counters change nothing', netChange({ ct: { l: 5, c: 2, t: 1, o: 9 } }), { power: 0, toughness: 0 });
  same('a negative modifier with counters', netChange({ ct: { p: 1 }, mp: -3, mt: 2 }), { power: -2, toughness: 3 });
  same('no card gives nothing', [netChange(null), netChange(undefined), netChange({})], [{ power: 0, toughness: 0 }, { power: 0, toughness: 0 }, { power: 0, toughness: 0 }]);
  check('the old game is not changed', (() => { const frozen = deepFreeze(structuredClone(game)); changeModifier(frozen, a, 'power', 3); resetModifier(changeModifier(frozen, a, 'power', 3), a); return true; })());
}

// ---- notes and face-down ----
{
  const { game, ids, hand } = withBattlefield();
  const [a, b] = ids;
  same('a note', cardOf(setNote(game, a, 'Equipped with Sword'), a).nt, 'Equipped with Sword');
  same('spaces around it are trimmed and runs of spaces become one', cardOf(setNote(game, a, '  two   words  '), a).nt, 'two words');
  same('invisible characters are removed', cardOf(setNote(game, a, `ha${String.fromCharCode(0x200B)}ll${String.fromCharCode(0x202E)}o`), a).nt, 'hallo');
  same('an empty note takes it away', 'nt' in cardOf(setNote(setNote(game, a, 'x'), a, ''), a), false);
  same('so does one of only spaces or invisible characters', 'nt' in cardOf(setNote(setNote(game, a, 'x'), a, `  ${String.fromCharCode(0x200B)} `), a), false);
  same('a note of exactly 40 characters', cardOf(setNote(game, a, 'x'.repeat(40)), a).nt.length, 40);
  refused('a note of 41 characters', () => setNote(game, a, 'x'.repeat(41)), /at most 40/);
  same('a note that is not text is read as text, nothing as no note', ['nt' in cardOf(setNote(game, a, undefined), a), 'nt' in cardOf(setNote(game, a, null), a), cardOf(setNote(game, a, 5), a).nt], [false, false, '5']);
  same('a note stays as plain text, not markup', cardOf(setNote(game, a, '<b>hi</b>'), a).nt, '<b>hi</b>');
  same('another card is not touched', cardOf(setNote(game, a, 'x'), b), cardOf(game, b));
  refused('a card in the hand cannot have a note', () => setNote(game, hand, 'x'), /battlefield/);
  same('face down', cardOf(setFaceDown(game, a, true), a).faceDown, true);
  same('face up again takes the field away', 'faceDown' in cardOf(setFaceDown(setFaceDown(game, a, true), a, false), a), false);
  same('anything truthy turns it face down and anything else face up', [cardOf(setFaceDown(game, a, 1), a).faceDown, 'faceDown' in cardOf(setFaceDown(game, a, 0), a), 'faceDown' in cardOf(setFaceDown(game, a, undefined), a)], [true, false, false]);
  refused('a card in the hand cannot be face down', () => setFaceDown(game, hand, true), /battlefield/);
  check('consistent games', problemsOf(setFaceDown(setNote(game, a, 'x'), b, true)).length === 0);
}

// ---- tokens ----
{
  const { game, ids } = withBattlefield();
  const before = game.zones.battlefield.length;
  const made = createToken(game, TOKEN);
  const token = cardOf(made.game, made.uid);
  same('the token is on the battlefield at the end', [made.game.zones.battlefield.length, made.game.zones.battlefield.at(-1).uid], [before + 1, made.uid]);
  same('its uid comes from the game\'s counter and the counter moves on', [made.uid, made.game.nextUid], [`c${game.nextUid}`, game.nextUid + 1]);
  same('what it holds', token, { uid: made.uid, i: id(70), n: 'Goblin', t: 'Token Creature - Goblin', m: '', k: [], tok: true, pt: '1/1', cl: 'R', sick: true, tapped: false, turnEntered: game.turn, px: token.px, py: token.py }); // a creature token comes in summoning sick, and on a cell of the grid
  check('...whose cell is on the grid', Number.isInteger(token.px) && Number.isInteger(token.py) && token.px >= 0 && token.px <= 88 && token.py >= 0 && token.py <= 24);
  check('the old game is untouched', game.zones.battlefield.length === before && game.nextUid === made.game.nextUid - 1);
  const plain = createToken(game, { n: 'Treasure', i: id(71), tt: 'Token Artifact - Treasure' });
  same('power, toughness and colors are optional and then not stored', ['pt' in cardOf(plain.game, plain.uid), 'cl' in cardOf(plain.game, plain.uid)], [false, false]);
  const twice = createToken(made.game, TOKEN);
  check('two tokens get two uids', twice.uid !== made.uid && twice.game.zones.battlefield.length === before + 2);
  const lands = createToken(game, { n: 'Forest', i: id(72), tt: 'Token Land - Forest' });
  check('a token\'s type line decides its row like any card (a land token is a land)', cardOf(lands.game, lands.uid).t.includes('Land'));
  same('a name is scrubbed like every name', cardOf(createToken(game, { ...TOKEN, n: `  Gob${String.fromCharCode(0x200B)}lin  ` }).game, `c${game.nextUid}`).n, 'Goblin');
  same('a name of 60 characters', cardOf(createToken(game, { ...TOKEN, n: 'x'.repeat(60) }).game, `c${game.nextUid}`).n.length, 60);
  same('colors of all five', cardOf(createToken(game, { ...TOKEN, cl: 'WUBRG' }).game, `c${game.nextUid}`).cl, 'WUBRG');
  same('power and toughness with * and +', cardOf(createToken(game, { ...TOKEN, pt: '*/1+' }).game, `c${game.nextUid}`).pt, '*/1+');
  for (const [label, spec, words] of [
    ['no spec', undefined, /name/], ['no name', { ...TOKEN, n: undefined }, /name/], ['an empty name', { ...TOKEN, n: '' }, /name/], ['a name of only spaces', { ...TOKEN, n: '   ' }, /name/], ['a name of 61 characters', { ...TOKEN, n: 'x'.repeat(61) }, /name/],
    ['no type line', { ...TOKEN, tt: undefined }, /type line/], ['a type line of 61 characters', { ...TOKEN, tt: 'x'.repeat(61) }, /type line/],
    ['no picture id', { ...TOKEN, i: undefined }, /Scryfall id/], ['a picture id that is not an id', { ...TOKEN, i: 'not-an-id' }, /Scryfall id/], ['a picture id in capitals', { ...TOKEN, i: id(70).replace(/^0+/, 'A') }, /Scryfall id/], ['a picture id that could carry markup', { ...TOKEN, i: '"><script>' }, /Scryfall id/], ['a picture id that is a number', { ...TOKEN, i: 70 }, /Scryfall id/],
    ['power and toughness with three parts', { ...TOKEN, pt: '1/1/1' }, /2\/2/], ['power and toughness in words', { ...TOKEN, pt: 'big' }, /2\/2/], ['power and toughness of 4 digits', { ...TOKEN, pt: '1000/1' }, /2\/2/], ['power and toughness that is a number', { ...TOKEN, pt: 11 }, /2\/2/], ['empty power and toughness', { ...TOKEN, pt: '' }, /2\/2/],
    ['a color that does not exist', { ...TOKEN, cl: 'X' }, /WUBRG/], ['six colors', { ...TOKEN, cl: 'WUBRGW' }, /WUBRG/], ['colors in lower case', { ...TOKEN, cl: 'r' }, /WUBRG/], ['empty colors', { ...TOKEN, cl: '' }, /WUBRG/],
  ]) refused(`a token with ${label}`, () => createToken(game, spec), words);
  // a full battlefield
  let full = game;
  while (full.zones.battlefield.length < 48) full = createToken(full, { n: 'Spirit ' + full.zones.battlefield.length, i: id(73), tt: 'Token Creature - Spirit' }).game; // different names, so they do not stack
  same('48 tokens fill the 48 blocks of the grid', full.zones.battlefield.length, 48);
  same('one more token is accepted (cards may overlap, nothing is refused)', createToken(full, TOKEN).game.zones.battlefield.length, 49);
  same('one more copy is accepted too', copyAsToken(full, ids[0]).game.zones.battlefield.length, 49);
  check('a full battlefield is still a consistent game', problemsOf(full).length === 0);
  check('the old game is not changed', (() => { const frozen = deepFreeze(structuredClone(game)); createToken(frozen, TOKEN); copyAsToken(frozen, ids[0]); return true; })());
}

// ---- copies ----
{
  const { game, ids, hand } = withBattlefield();
  const [a] = ids;
  const rich = changeCounter(changeModifier(setNote(setFaceDown(game, a, true), a, 'mine'), a, 'power', 2), a, 'l', 3);
  const original = cardOf(rich, a);
  const copied = copyAsToken(rich, a);
  const copy = cardOf(copied.game, copied.uid);
  same('a copy has the look and the name of the original, as a token', [copy.i, copy.n, copy.t, copy.m, copy.k, copy.tok], [original.i, original.n, original.t, original.m, original.k, true]);
  check('and none of its counters, modifier, note or face-down state', !['ct', 'mp', 'mt', 'nt', 'faceDown'].some((key) => key in copy), JSON.stringify(copy));
  same('it is untapped and arrived this turn', [copy.tapped, copy.turnEntered], [false, rich.turn]);
  same('it gets the next uid', [copied.uid, copied.game.nextUid], [`c${rich.nextUid}`, rich.nextUid + 1]);
  same('the original is untouched', cardOf(copied.game, a), original);
  const bolt = fresh().zones.hand.find((card) => card.p);
  if (bolt) {
    let g = moveCard(fresh(), bolt.uid, 'battlefield');
    const c = copyAsToken(g, bolt.uid);
    same('a copy keeps the printing picture of the original', cardOf(c.game, c.uid).p, bolt.p);
  } else checks++;
  const tokenGame = createToken(game, TOKEN);
  const copyOfToken = copyAsToken(tokenGame.game, tokenGame.uid);
  same('a token can be copied and keeps its power, toughness and colors', [cardOf(copyOfToken.game, copyOfToken.uid).pt, cardOf(copyOfToken.game, copyOfToken.uid).cl], ['1/1', 'R']);
  refused('a card in the hand cannot be copied', () => copyAsToken(game, hand), /battlefield/);
  refused('a card that is not in the game', () => copyAsToken(game, 'c99999'), /not in the game/);
  check('consistent', problemsOf(copied.game).length === 0 && problemsOf(copyOfToken.game).length === 0);
}

// ---- leaving the battlefield ----
{
  const { game, ids } = withBattlefield();
  const [a, b, c] = ids;
  const loaded = changeCounter(changeModifier(setNote(setFaceDown(game, a, true), a, 'x'), a, 'toughness', 3), a, 'p', 2);
  for (const zone of ['hand', 'graveyard', 'exile', 'library', 'command', 'sideboard']) {
    const left = moveCard(loaded, a, zone);
    check(`a card that goes to ${zone} loses its counters, modifier, note and face-down state`, !['ct', 'mp', 'mt', 'nt', 'faceDown'].some((key) => key in cardOf(left, a)), JSON.stringify(cardOf(left, a)));
    check(`...and the game is consistent (${zone})`, problemsOf(left).length === 0, problemsOf(left).join('; '));
  }
  const back = moveCard(moveCard(loaded, a, 'hand'), a, 'battlefield');
  check('and when it comes back it has none of it', !['ct', 'mp', 'mt', 'nt', 'faceDown'].some((key) => key in cardOf(back, a)));
  const reposition = moveCard(loaded, a, 'battlefield', { position: 'top' });
  check('moving it to the battlefield again (within it) keeps its state', cardOf(reposition, a).ct.p === 2 && cardOf(reposition, a).nt === 'x' && cardOf(reposition, a).faceDown === true && cardOf(reposition, a).mt === 3);
  same('another card on the battlefield keeps its state when a card leaves', cardOf(moveCard(changeCounter(game, b, 'o', 4), a, 'hand'), b).ct, { o: 4 });

  // tokens
  const made = createToken(loaded, TOKEN);
  const total = (g) => ZONES.reduce((sum, zone) => sum + g.zones[zone].length, 0);
  for (const zone of ['hand', 'graveyard', 'exile', 'library', 'command', 'sideboard']) {
    const gone = moveCard(made.game, made.uid, zone);
    check(`a token that goes to ${zone} stops existing`, total(gone) === total(made.game) - 1 && !ZONES.some((z) => gone.zones[z].some((card) => card.uid === made.uid)));
  }
  refused('and it cannot be found afterwards', () => moveCard(moveCard(made.game, made.uid, 'hand'), made.uid, 'battlefield'), /not in the game/);
  const tokenStays = moveCard(made.game, made.uid, 'battlefield');
  check('a token moved within the battlefield stays', cardOf(tokenStays, made.uid)?.tok === true);
  const tapped = setTapped(made.game, made.uid, true);
  check('a token can be tapped and untapped', cardOf(tapped, made.uid).tapped === true && cardOf(untapAll(tapped), made.uid).tapped === false);
  const copied = copyAsToken(loaded, c);
  check('the copy of a real card also vanishes when it leaves, the real card stays', total(moveCard(copied.game, copied.uid, 'graveyard')) === total(copied.game) - 1 && !!cardOf(moveCard(copied.game, copied.uid, 'graveyard'), c));
  check('every real card is still in the game exactly once after tokens come and go', (() => { const g = moveCard(createToken(moveCard(game, b, 'graveyard'), TOKEN).game, c, 'exile'); return problemsOf(g).length === 0; })());
}

// ---- player counters ----
{
  const game = fresh();
  check('a new game has no player counters stored', !('pc' in game) && !('cd' in game));
  let g = changePlayerCounter(game, 'poison', 2);
  same('poison', g.pc, { poison: 2 });
  g = changePlayerCounter(g, 'energy', 5);
  g = changePlayerCounter(g, 'experience', 1);
  same('energy and experience next to it', g.pc, { poison: 2, energy: 5, experience: 1 });
  g = changePlayerCounter(g, 'poison', -1);
  same('one poison removed', g.pc.poison, 1);
  same('removing more than there is stops at 0 and then the key is gone', 'poison' in changePlayerCounter(g, 'poison', -9).pc, false);
  check('removing the last of all of them takes pc away', !('pc' in changePlayerCounter(changePlayerCounter(changePlayerCounter(g, 'poison', -1), 'energy', -9), 'experience', -1)));
  same('the limit', changePlayerCounter(changePlayerCounter(game, 'energy', 99), 'energy', 99).pc.energy, 198);
  check('and it stops at the limit', (() => { let x = game; for (let n = 0; n < 3; n++) x = changePlayerCounter(x, 'energy', MAX_COUNT); return x.pc.energy === MAX_COUNT; })());
  refused('an unknown player counter', () => changePlayerCounter(game, 'loyalty', 1), /counter a player can have/);
  same('a mark is on or off: adding five monarchs is one, taking it off removes it', [changePlayerCounter(game, 'monarch', 5).pc, 'pc' in changePlayerCounter(changePlayerCounter(game, 'monarch', 1), 'monarch', -1)], [{ monarch: 1 }, false]);
  same('the new counts add up like the others', changePlayerCounter(changePlayerCounter(game, 'rad', 3), 'rad', 2).pc, { rad: 5 });
  for (const bad of [0, 1.5, MAX_COUNT + 1, NaN, '1', null]) refused(`a player counter change of ${String(bad)}`, () => changePlayerCounter(game, 'poison', bad), /whole number/);
  check('life and the zones are untouched by counters', changePlayerCounter(game, 'poison', 3).life === game.life && changePlayerCounter(game, 'poison', 3).zones === game.zones);

  let d = changeCommanderDamage(game, '2', 7);
  same('commander damage from seat 2', d.cd, { 2: 7 });
  d = changeCommanderDamage(d, '4', 3);
  same('and from seat 4', d.cd, { 2: 7, 4: 3 });
  same('removing it', changeCommanderDamage(d, '2', -7).cd, { 4: 3 });
  check('the last one gone takes cd away', !('cd' in changeCommanderDamage(changeCommanderDamage(d, '2', -9), '4', -3)));
  for (const seat of ['0', '5', 1, 'one', '', undefined, null, '1 ', '01']) refused(`commander damage from seat ${JSON.stringify(seat)}`, () => changeCommanderDamage(game, seat, 1), /seat from 1 to 4/);
  refused('a commander damage change of 0', () => changeCommanderDamage(game, '1', 0), /whole number/);
  check('counters and commander damage do not disturb each other', (() => { const x = changeCommanderDamage(changePlayerCounter(game, 'poison', 2), '1', 4); return x.pc.poison === 2 && x.cd[1] === 4; })());
  check('consistent games', problemsOf(d).length === 0 && problemsOf(g).length === 0);
  check('the old game is not changed', (() => { const frozen = deepFreeze(structuredClone(game)); changePlayerCounter(frozen, 'poison', 1); changeCommanderDamage(frozen, '1', 1); return true; })());
}

// ---- checkGame notices damage ----
{
  const { game, ids, hand } = withBattlefield();
  const [a] = ids;
  const good = createToken(changeCounter(changeModifier(setNote(setFaceDown(game, a, true), a, 'x'), a, 'power', 2), a, 'l', 2), TOKEN).game;
  same('a game using every field is consistent', problemsOf(good), []);
  const onCard = (patch, uid = a, zone = 'battlefield') => { const g = structuredClone(good); g.zones[zone] = g.zones[zone].map((card) => (card.uid === uid ? { ...card, ...patch } : card)); return g; };
  for (const [label, patch] of [
    ['an empty counters object', { ct: {} }], ['counters that are a list', { ct: [1] }], ['counters that are text', { ct: 'p' }], ['counters that are null', { ct: null }], ['an unknown kind', { ct: { z: 1 } }], ['a zero count', { ct: { l: 0 } }], ['a count over the limit', { ct: { l: MAX_COUNT + 1 } }],
    ['a fractional count', { ct: { l: 1.5 } }], ['a text count', { ct: { l: '2' } }], ['both +1/+1 and -1/-1', { ct: { p: 1, m: 1 } }],
    ['a zero modifier', { mp: 0 }], ['a modifier over the limit', { mp: MAX_MODIFIER + 1 }], ['a fractional modifier', { mt: 0.5 }], ['a text modifier', { mt: '1' }],
    ['an empty note', { nt: '' }], ['a note of 41 characters', { nt: 'x'.repeat(41) }], ['a note that is a number', { nt: 5 }],
    ['face-down that is false', { faceDown: false }], ['face-down that is 1', { faceDown: 1 }], ['a token mark that is false', { tok: false }], ['a token mark that is 1', { tok: 1 }],
    ['power and toughness on a card that is not a token', { tok: undefined, pt: '1/1' }], ['damaged token power and toughness', { pt: 'x' }],
  ]) {
    const target = label.includes('token') || label.includes('not a token') || label.includes('power and toughness') ? good.zones.battlefield.at(-1).uid : a;
    const damaged = label === 'power and toughness on a card that is not a token' ? onCard({ pt: '1/1' }, a) : onCard(patch, target);
    check(`checkGame notices ${label}`, problemsOf(damaged).length > 0, JSON.stringify(patch));
  }
  check('checkGame notices damaged colors on a token', problemsOf(onCard({ cl: 'rg' }, good.zones.battlefield.at(-1).uid)).length > 0);
  for (const key of ['ct', 'mp', 'mt', 'nt', 'faceDown', 'tok']) {
    const value = { ct: { l: 1 }, mp: 1, mt: 1, nt: 'x', faceDown: true, tok: true }[key];
    check(`checkGame notices ${key} on a card in the hand`, problemsOf(onCard({ [key]: value }, hand, 'hand')).length > 0, key);
  }
  for (const [label, patch] of [['empty player counters', { pc: {} }], ['an unknown player counter', { pc: { loyalty: 1 } }], ['a mark above 1', { pc: { monarch: 2 } }], ['a zero player counter', { pc: { poison: 0 } }], ['a player counter over the limit', { pc: { poison: MAX_COUNT + 1 } }], ['player counters as a list', { pc: [1] }], ['empty commander damage', { cd: {} }], ['commander damage from seat 5', { cd: { 5: 1 } }], ['zero commander damage', { cd: { 1: 0 } }], ['text commander damage', { cd: { 1: '2' } }]]) {
    check(`checkGame notices ${label}`, problemsOf({ ...structuredClone(good), ...patch }).length > 0, label);
  }
  check('and a game with good player counters is fine', problemsOf({ ...structuredClone(good), pc: { poison: 3 }, cd: { 2: 5 } }).length === 0);
}

// ---- long random games: every move keeps the game consistent and no real card is lost or copied ----
for (const seed of [1, 2, 3, 4, 5]) {
  const random = seededRandom(seed * 977);
  const pick = (list) => list[Math.floor(random() * list.length)];
  let game = makeGame(deck, lookup, { random: seededRandom(seed) });
  const realCards = ZONES.reduce((sum, zone) => sum + game.zones[zone].length, 0);
  let tokensMade = 0;
  for (let step = 0; step < 2000; step++) {
    const battlefield = game.zones.battlefield;
    const all = ZONES.flatMap((zone) => game.zones[zone]);
    const op = pick(['move', 'move', 'draw', 'counter', 'counter', 'modifier', 'reset', 'note', 'facedown', 'token', 'copy', 'player', 'commander', 'turn', 'tap', 'life', 'untap']);
    try {
      if (op === 'move' && all.length) game = moveCard(game, pick(all).uid, pick(ZONES), { position: pick(['top', 'bottom']) });
      else if (op === 'draw') game = draw(game, 1 + Math.floor(random() * 2)).game;
      else if (op === 'counter' && battlefield.length) game = changeCounter(game, pick(battlefield).uid, pick(COUNTER_KINDS), (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 4)));
      else if (op === 'modifier' && battlefield.length) game = changeModifier(game, pick(battlefield).uid, pick(['power', 'toughness']), (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 30)));
      else if (op === 'reset' && battlefield.length) game = resetModifier(game, pick(battlefield).uid);
      else if (op === 'note' && battlefield.length) game = setNote(game, pick(battlefield).uid, random() < 0.3 ? '' : `note ${Math.floor(random() * 1000)}`);
      else if (op === 'facedown' && battlefield.length) game = setFaceDown(game, pick(battlefield).uid, random() < 0.5);
      else if (op === 'token' && battlefield.length < MAX_ZONE_CARDS) { game = createToken(game, TOKEN).game; tokensMade++; }
      else if (op === 'copy' && battlefield.length && battlefield.length < MAX_ZONE_CARDS) { game = copyAsToken(game, pick(battlefield).uid).game; tokensMade++; }
      else if (op === 'player') game = changePlayerCounter(game, pick(PLAYER_COUNTERS), (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 5)));
      else if (op === 'commander') game = changeCommanderDamage(game, pick(COMMANDER_SEATS), (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 5)));
      else if (op === 'turn') game = nextTurn(game).game;
      else if (op === 'tap' && battlefield.length) { const card = pick(battlefield); game = setTapped(game, card.uid, !card.tapped); }
      else if (op === 'life') game = adjustLife(game, Math.floor(random() * 11) - 5);
      else if (op === 'untap') game = untapAll(game);
    } catch (error) {
      if (/battlefield is full/.test(error.message)) continue; // the grid holds 48 cards: a move or a token that does not fit is refused in words
      fail(`random game ${seed}, step ${step} (${op})`, `an operation that should work threw: ${error.message}`);
    }
    const problems = problemsOf(game);
    if (problems.length) fail(`random game ${seed}, step ${step} (${op})`, problems.join('; '));
    if (step % 100 === 0 || step === 1999) {
      const real = ZONES.reduce((sum, zone) => sum + game.zones[zone].filter((card) => !card.tok).length, 0);
      if (real !== realCards) fail(`random game ${seed}, step ${step}`, `real cards went from ${realCards} to ${real}`);
      if (ZONES.some((zone) => zone !== 'battlefield' && game.zones[zone].some((card) => card.tok))) fail(`random game ${seed}, step ${step}`, 'a token is outside the battlefield');
    }
  }
  check(`random game ${seed}: 2,000 moves with counters, tokens and modifiers stayed consistent and no real card was lost (${tokensMade} tokens made)`, true);
}

console.log(`All ${checks} counter and token checks passed.`);
