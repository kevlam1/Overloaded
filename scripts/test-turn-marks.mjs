// Tests for summoning sickness (a hybrid reminder), the "doesn't untap" mark, and starting a turn (shared/zones.mjs, storage in shared/game-sync.mjs).
// The card shapes are the real list entries (checked 2026-11-06): Goblin Guide lists Haste, Fervor and Lightning Greaves (which GRANT haste) do not.
// Run from the repo root:  node scripts/test-turn-marks.mjs
import {
  makeGame, moveCard, setTapped, untapAll, heldTapped, beginTurn, startTurn, nextTurn, setSick, markSickByFace, setNoUntap, turnOver, createToken, copyAsToken,
  isCreatureCard, hasPrintedHaste, entersSick, seededRandom, checkGame, ZONES, MAX_TURN, changeCounter,
} from '../shared/zones.mjs';
import { packCard, unpackCard, splitGame, joinGame } from '../shared/game-sync.mjs';
import { makeLookup } from '../shared/card-lookup.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };
const unstored = ({ cmd, tax, ...rest }) => rest; // the list of commanders and the commander tax are not stored on the live table yet, so a game read back lacks the tax and works out the commanders from the command zone
const canon = (value) => JSON.stringify(value, (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
const same = (label, actual, expected) => { checks++; if (canon(actual) !== canon(expected)) fail(label, `expected ${canon(expected)}, got ${canon(actual)}`); };
const refused = (label, run, words) => {
  checks++;
  try { run(); } catch (error) { if (error instanceof Error && (!words || words.test(error.message))) return; fail(label, `refused with the wrong message: ${error.message}`); }
  fail(label, 'was accepted');
};
const deepFreeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; };

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const LIST = [
  { n: 'Goblin Guide', t: 'Creature — Goblin Scout', m: '{R}', k: ['Haste'], i: id(1), pt: '2/2' },
  { n: 'Llanowar Elves', t: 'Creature — Elf Druid', m: '{G}', k: [], i: id(2), pt: '1/1' },
  { n: 'Sol Ring', t: 'Artifact', m: '{1}', k: [], i: id(3) },
  { n: 'Forest', t: 'Basic Land — Forest', m: '', k: [], i: id(4) },
  { n: 'Fervor', t: 'Enchantment', m: '{2}{R}', k: [], i: id(5) }, // grants haste, but its keywords do not say so
  { n: 'Smugglers Copter', t: 'Artifact — Vehicle', m: '{2}', k: ['Flying', 'Crew'], i: id(6), pt: '3/3' },
  { n: 'Delver of Secrets // Insectile Aberration', t: 'Creature — Human Wizard // Creature — Human Insect', m: '{U}', k: ['Flying', 'Transform'], i: id(7), pt: '1/1', b: 1, bpt: '3/2' },
  { n: 'Valakut Awakening // Valakut Stoneforge', t: 'Instant // Land', m: '{2}{R}', k: [], i: id(8), b: 1, md: 1 },
  { n: 'Esika, God of the Tree // The Prismatic Bridge', t: 'Legendary Creature — God // Legendary Enchantment', m: '{1}{G}{G}', k: ['Vigilance'], i: id(9), pt: '1/4', b: 1, md: 1 },
  { n: 'Sundering Titan', t: 'Artifact Creature — Golem', m: '{8}', k: [], i: id(10), pt: '6/6' },
  { n: 'Hellrider', t: 'Creature — Devil', m: '{2}{R}{R}', k: ['Haste'], i: id(11), pt: '3/3' },
];
const lookup = makeLookup(LIST);
const deck = { cards: LIST.map((card) => ({ i: card.i, n: card.n, qty: 1, section: 'main' })), commander: [] };
// Every card is in the hand (a deck of exactly 11 cards and a hand of 11), so nothing depends on luck.
const fresh = () => makeGame(deck, lookup, { random: seededRandom(3), handSize: LIST.length });
const all = (game) => ZONES.flatMap((zone) => game.zones[zone]);
const named = (game, prefix) => all(game).find((card) => card.n.startsWith(prefix));
const play = (game, prefix) => moveCard(game, named(game, prefix).uid, 'battlefield');

// ---- what counts ----
check('a creature is a creature', isCreatureCard({ t: 'Creature — Elf Druid' }) && isCreatureCard({ t: 'Artifact Creature — Golem' }) && isCreatureCard({ t: 'Legendary Creature — God' }));
check('a land, an artifact, an enchantment and a Vehicle are not (a Vehicle is not a creature until crewed)', ['Basic Land — Forest', 'Artifact', 'Enchantment', 'Artifact — Vehicle', 'Instant', 'Planeswalker — Jace'].every((t) => !isCreatureCard({ t })));
check('"Creature" in the subtypes does not make a card a creature', !isCreatureCard({ t: 'Enchantment — Creature Feature' }));
check('a card with no type line is not a creature', !isCreatureCard({}) && !isCreatureCard(null) && !isCreatureCard({ t: '' }));
check('a two-sided card is judged by the face that shows', isCreatureCard({ t: 'Creature — Human Wizard // Creature — Human Insect', b: 1 }) && !isCreatureCard({ t: 'Instant // Land', b: 1, md: 1 }) && isCreatureCard({ t: 'Instant // Creature — Elf', b: 1, md: 1, turned: true }) && !isCreatureCard({ t: 'Creature — Elf // Land', b: 1, md: 1, turned: true }));
check('printed haste is in the card\'s own keywords', hasPrintedHaste({ k: ['Flying', 'Haste'] }) && !hasPrintedHaste({ k: ['Flying'] }) && !hasPrintedHaste({ k: [] }) && !hasPrintedHaste({}) && !hasPrintedHaste(null) && !hasPrintedHaste({ k: 'Haste' }));
check('a creature with printed haste does not come in sick, any other creature does, and nothing that is not a creature does', !entersSick({ t: 'Creature — Goblin', k: ['Haste'] }) && entersSick({ t: 'Creature — Elf', k: [] }) && !entersSick({ t: 'Artifact', k: [] }) && entersSick({ t: 'Creature — Elf' }));

// ---- coming onto the battlefield ----
{
  let game = fresh();
  check('nothing is sick before it comes in', all(game).every((card) => !('sick' in card)));
  for (const name of ['Goblin Guide', 'Llanowar Elves', 'Sol Ring', 'Forest', 'Fervor', 'Smugglers Copter', 'Delver', 'Valakut', 'Esika', 'Sundering Titan', 'Hellrider']) game = play(game, name);
  const sickNames = game.zones.battlefield.filter((card) => card.sick).map((card) => card.n.split(' // ')[0]);
  same('a creature without printed haste comes in sick; haste, lands, artifacts, enchantments, a Vehicle and a modal card showing its spell side do not', sickNames, ['Llanowar Elves', 'Delver of Secrets', 'Esika, God of the Tree', 'Sundering Titan']);
  check('the mark is exactly true, and it is a game that checks out', game.zones.battlefield.every((card) => !('sick' in card) || card.sick === true) && checkGame(game).length === 0, checkGame(game).join('; '));
  check('Fervor does not stop a creature coming in sick: the card data cannot know (that is what the one-click clear is for)', named(game, 'Llanowar Elves').sick === true);
  const elves = named(game, 'Llanowar Elves');
  const moved = moveCard(game, elves.uid, 'battlefield', { position: 'top' });
  check('moving within the battlefield keeps the mark and does not add one', named(moved, 'Llanowar Elves').sick === true && !('sick' in named(moved, 'Sol Ring')));
  const cleared = setSick(game, elves.uid, false);
  check('moving a creature within the battlefield does not make it sick again (the mark was cleared by hand, or its turn started)', !('sick' in named(moveCard(cleared, elves.uid, 'battlefield', { position: 'top' }), 'Llanowar Elves')) && !('sick' in named(moveCard(cleared, elves.uid, 'battlefield'), 'Llanowar Elves')));
  for (const zone of ['hand', 'graveyard', 'exile', 'command', 'sideboard', 'library']) {
    const left = moveCard(game, elves.uid, zone);
    check(`a creature that goes to ${zone} loses it`, !('sick' in named(left, 'Llanowar Elves')) && checkGame(left).length === 0);
    check(`and is sick again when it comes back from ${zone}`, named(moveCard(left, elves.uid, 'battlefield'), 'Llanowar Elves').sick === true);
  }
  const hand = fresh();
  check('a card that is not on the battlefield never has it', !('sick' in named(hand, 'Llanowar Elves')));
}

// ---- the hand and the two-sided cards ----
{
  let game = play(fresh(), 'Delver');
  const sick = named(game, 'Delver').sick;
  game = turnOver(game, named(game, 'Delver').uid);
  check('turning a creature over does not change its mark (it is not a new object)', named(game, 'Delver').sick === sick);
  const modal = play(fresh(), 'Valakut');
  check('a modal card played as its front (an Instant) is not sick', !('sick' in named(modal, 'Valakut')));
  const esikaBack = markSickByFace(turnOver(play(fresh(), 'Esika'), named(play(fresh(), 'Esika'), 'Esika').uid), named(fresh(), 'Esika').uid);
  check('marking by the face that shows: Esika turned into her enchantment side is not sick', !('sick' in named(esikaBack, 'Esika')));
  const valakut = play(fresh(), 'Valakut');
  const stoneforge = markSickByFace(turnOver(valakut, named(valakut, 'Valakut').uid), named(valakut, 'Valakut').uid);
  check('marking by the face that shows: a land is not sick', !('sick' in named(stoneforge, 'Valakut')));
  const elves = play(fresh(), 'Llanowar');
  check('marking by the face that shows keeps a creature sick', markSickByFace(elves, named(elves, 'Llanowar').uid).zones.battlefield.find((c) => c.n === 'Llanowar Elves').sick === true);
  refused('marking by the face needs the battlefield', () => markSickByFace(fresh(), named(fresh(), 'Llanowar').uid), /battlefield/);
}

// ---- tokens and copies ----
{
  const game = fresh();
  const goblin = createToken(game, { n: 'Goblin', i: id(70), tt: 'Token Creature — Goblin', pt: '1/1', cl: 'R' });
  check('a creature token comes in sick (a token has no keywords, so haste is the player\'s to clear)', goblin.game.zones.battlefield.find((c) => c.uid === goblin.uid).sick === true);
  const treasure = createToken(game, { n: 'Treasure', i: id(71), tt: 'Token Artifact — Treasure' });
  check('a Treasure token is not sick', !('sick' in treasure.game.zones.battlefield.find((c) => c.uid === treasure.uid)));
  const guide = play(game, 'Goblin Guide');
  const guideCopy = copyAsToken(guide, named(guide, 'Goblin Guide').uid);
  check('a copy of a creature with printed haste keeps the haste, so it is not sick', !('sick' in guideCopy.game.zones.battlefield.find((c) => c.uid === guideCopy.uid)));
  const elves = play(game, 'Llanowar');
  const elvesCopy = copyAsToken(elves, named(elves, 'Llanowar').uid, { printed: '1/1' });
  const copied = elvesCopy.game.zones.battlefield.find((c) => c.uid === elvesCopy.uid);
  check('a copy of a creature without haste is sick (a new permanent)', copied.sick === true && checkGame(elvesCopy.game).length === 0);
  const ring = play(game, 'Sol Ring');
  check('a copy of an artifact is not sick', !('sick' in copyAsToken(ring, named(ring, 'Sol Ring').uid).game.zones.battlefield.find((c) => c.tok)));
  const turned = turnOver(play(game, 'Delver'), named(play(game, 'Delver'), 'Delver').uid);
  check('the card that is copied keeps its own mark; the copy decides for itself', named(copyAsToken(turned, named(turned, 'Delver').uid).game, 'Delver').sick === true);
}

// ---- setting and clearing by hand ----
{
  const game = deepFreeze(play(play(fresh(), 'Llanowar'), 'Goblin Guide'));
  const elves = named(game, 'Llanowar').uid, guide = named(game, 'Goblin Guide').uid;
  check('clearing the mark of a sick creature (Fervor is out)', !('sick' in named(setSick(game, elves, false), 'Llanowar')) && checkGame(setSick(game, elves, false)).length === 0);
  check('adding it to a creature that is not sick (control changed hands)', named(setSick(game, guide, true), 'Goblin Guide').sick === true);
  check('it works on a card that is not a creature (a crewed Vehicle)', named(setSick(play(game, 'Smugglers Copter'), named(play(game, 'Smugglers Copter'), 'Smugglers').uid, true), 'Smugglers').sick === true);
  check('setting it twice is the same as once, and clearing a mark that is not there changes nothing', canon(setSick(setSick(game, guide, true), guide, true)) === canon(setSick(game, guide, true)) && canon(setSick(game, guide, false)) === canon(game));
  check('anything truthy sets it, anything else clears it', named(setSick(game, guide, 1), 'Goblin Guide').sick === true && !('sick' in named(setSick(game, elves, 0), 'Llanowar')));
  check('the old game is not changed (it is frozen)', named(game, 'Llanowar').sick === true);
  const edit = (base, uid, change) => ({ ...base, zones: { ...base.zones, battlefield: base.zones.battlefield.map((card) => (card.uid === uid ? change(card) : card)) } });
  for (const [key, word] of [['sick', 'summoning sickness'], ['noUntap', 'untap']]) {
    for (const bad of [false, 0, 1, 'true', null, {}, []]) check(`${key} that is ${JSON.stringify(bad)} is a problem`, checkGame(edit(game, elves, (card) => ({ ...card, [key]: bad }))).some((p) => p.includes(word)), checkGame(edit(game, elves, (card) => ({ ...card, [key]: bad }))).join('; '));
    check(`${key} outside the battlefield is a problem`, checkGame({ ...game, zones: { ...game.zones, hand: [{ ...game.zones.hand[0], [key]: true }, ...game.zones.hand.slice(1)] } }).some((p) => p.includes(`has ${key} outside the battlefield`)));
  }
  refused('a card in the hand cannot be marked', () => setSick(game, named(game, 'Forest').uid, true), /battlefield/);
  refused('a card that is not there', () => setSick(game, 'c999', true), /not in the game/);
}

// ---- "doesn't untap" ----
{
  let game = play(play(play(fresh(), 'Sol Ring'), 'Forest'), 'Llanowar');
  const ring = named(game, 'Sol Ring').uid, forest = named(game, 'Forest').uid, elves = named(game, 'Llanowar').uid;
  for (const uid of [ring, forest, elves]) game = setTapped(game, uid, true);
  check('nothing is marked at first, and nothing is held back', all(game).every((card) => !('noUntap' in card)) && heldTapped(game) === 0);
  const held = setNoUntap(game, ring, true);
  check('marking a card sets exactly one field', named(held, 'Sol Ring').noUntap === true && !('noUntap' in named(held, 'Forest')) && checkGame(held).length === 0);
  check('one tapped card is held back', heldTapped(held) === 1);
  const untapped = untapAll(held);
  check('untap all untaps the others and leaves the marked card tapped', named(untapped, 'Sol Ring').tapped === true && named(untapped, 'Forest').tapped === false && named(untapped, 'Llanowar').tapped === false);
  check('the mark stays after an untap step (a Claustrophobia aura lasts many turns)', named(untapped, 'Sol Ring').noUntap === true && named(startTurn(untapped, 9).game, 'Sol Ring').noUntap === true);
  check('a marked card that is not tapped is not held back, and nothing changes for it', heldTapped(setNoUntap(setTapped(held, ring, false), ring, true)) === 0);
  const byHand = setTapped(held, ring, false);
  check('it can still be untapped by hand (Mana Vault: pay at upkeep)', named(byHand, 'Sol Ring').tapped === false && named(byHand, 'Sol Ring').noUntap === true);
  check('removing the mark makes the next untap step untap it', named(untapAll(setNoUntap(held, ring, false)), 'Sol Ring').tapped === false && !('noUntap' in named(setNoUntap(held, ring, false), 'Sol Ring')));
  check('two marked cards are both held back', heldTapped(setNoUntap(held, forest, true)) === 2 && untapAll(setNoUntap(held, forest, true)).zones.battlefield.filter((c) => c.tapped).length === 2);
  const left = moveCard(held, ring, 'graveyard');
  check('a card that leaves loses the mark and comes back normal', !('noUntap' in named(left, 'Sol Ring')) && !('noUntap' in named(moveCard(left, ring, 'battlefield'), 'Sol Ring')) && checkGame(left).length === 0);
  check('the mark does not change what else the card has (counters, notes)', named(setNoUntap(changeCounter(game, ring, 'c', 2), ring, true), 'Sol Ring').ct.c === 2);
  check('the old game is not changed, and an untap step makes a new one', named(held, 'Sol Ring').noUntap === true && !('noUntap' in named(game, 'Sol Ring')) && untapAll(held) !== held);
  refused('a card in the hand cannot be marked', () => setNoUntap(fresh(), named(fresh(), 'Llanowar').uid, true), /battlefield/);
  check('a game with a marked card is consistent', checkGame(held).length === 0);
}

// ---- starting a turn ----
{
  let game = fresh();
  for (const name of ['Fervor', 'Smugglers']) game = moveCard(game, named(game, name).uid, 'library'); // something to draw
  game = play(play(play(play(game, 'Llanowar'), 'Sol Ring'), 'Forest'), 'Sundering');
  const ring = named(game, 'Sol Ring').uid;
  for (const card of [...game.zones.battlefield]) game = setTapped(game, card.uid, true);
  game = setNoUntap(game, ring, true);
  game = changeCounter(game, named(game, 'Llanowar').uid, 'p', 2);
  const library = game.zones.library.length;
  const result = startTurn(game, 5);
  const next = result.game;
  check('the turn number is the one given', next.turn === 5);
  check('everything untaps except the card marked "doesn\'t untap"', next.zones.battlefield.filter((card) => card.tapped).map((card) => card.n).join() === 'Sol Ring' && next.zones.battlefield.length === 4);
  check('summoning sickness ends for every permanent', next.zones.battlefield.every((card) => !('sick' in card)));
  check('one card is drawn', result.drawn.length === 1 && next.zones.hand.length === game.zones.hand.length + 1 && next.zones.library.length === library - 1 && result.short === false);
  check('counters and the marks the player set stay', named(next, 'Llanowar').ct.p === 2 && named(next, 'Sol Ring').noUntap === true);
  check('the game is consistent and every card is still somewhere exactly once', checkGame(next).length === 0 && all(next).length === all(game).length);
  check('the old game is not changed', game.turn === 1 && game.zones.battlefield.some((card) => card.sick) && game.zones.battlefield.every((card) => card.tapped));
  const one = nextTurn(game);
  check('the next turn of a game with no table is one more, and does the same', one.game.turn === 2 && one.game.zones.battlefield.every((card) => !('sick' in card)) && named(one.game, 'Sol Ring').tapped === true);
  const empty = { ...fresh(), zones: { ...fresh().zones, library: [] } };
  check('with an empty library the draw is short, and the turn still starts', startTurn(empty, 2).short === true && startTurn(empty, 2).game.turn === 2);
  for (const bad of [0, -1, 1.5, '2', null, NaN, Infinity, MAX_TURN + 1]) refused(`turn ${JSON.stringify(bad)} is not a turn number`, () => startTurn(game, bad), /not a turn number/);
  check('the largest turn number is allowed', startTurn(game, MAX_TURN).game.turn === MAX_TURN);
  check('with no number given it is the next one', startTurn(game).game.turn === game.turn + 1);
  const frozen = deepFreeze(JSON.parse(JSON.stringify(game)));
  check('it works on a frozen game', startTurn(frozen, 3).game.turn === 3);
}

// ---- a turn begins at a table: the number is set and sickness ends, and NOTHING else is automatic ----
{
  let game = fresh();
  for (const name of ['Fervor', 'Smugglers']) game = moveCard(game, named(game, name).uid, 'library'); // something to draw
  game = play(play(play(game, 'Llanowar'), 'Sol Ring'), 'Forest');
  for (const card of [...game.zones.battlefield]) game = setTapped(game, card.uid, true);
  game = changeCounter(setNoUntap(game, named(game, 'Sol Ring').uid, true), named(game, 'Llanowar').uid, 'p', 2);
  const begun = beginTurn(game, 5);
  check('the turn number is the one given', begun.turn === 5);
  check('summoning sickness ends for every permanent', game.zones.battlefield.some((card) => card.sick) && begun.zones.battlefield.every((card) => !('sick' in card)));
  check('nothing untaps (the player untaps with the button, because some turns say otherwise)', begun.zones.battlefield.every((card) => card.tapped === true));
  check('nothing is drawn: the hand and the library are exactly as they were', begun.zones.hand === game.zones.hand && begun.zones.library === game.zones.library && begun.zones.hand.length === game.zones.hand.length);
  check('counters and the marks the player set stay', named(begun, 'Llanowar').ct.p === 2 && named(begun, 'Sol Ring').noUntap === true);
  check('life, the graveyard and the rest are untouched, and the game checks out', begun.life === game.life && begun.zones.graveyard === game.zones.graveyard && checkGame(begun).length === 0);
  check('it returns a game (not { game, drawn })', Array.isArray(begun.zones.battlefield) && !('drawn' in begun));
  check('the old game is not changed', game.turn === 1 && game.zones.battlefield.some((card) => card.sick));
  check('with no number given it is the next one', beginTurn(game).turn === game.turn + 1);
  for (const bad of [0, -1, 1.5, '2', null, NaN, Infinity, MAX_TURN + 1]) refused(`turn ${JSON.stringify(bad)} is not a turn number`, () => beginTurn(game, bad), /not a turn number/);
  check('the largest turn number is allowed', beginTurn(game, MAX_TURN).turn === MAX_TURN);
  check('it works on a frozen game', beginTurn(deepFreeze(JSON.parse(JSON.stringify(game))), 3).turn === 3);
  // The solo table's whole start is the beginning of the turn plus the untap step and one draw.
  const whole = startTurn(game, 5);
  check('startTurn (the solo "Next turn" button) is beginTurn, then untap except the marked card, then one draw', canon(whole.game.zones.battlefield) === canon(untapAll(begun).zones.battlefield) && whole.game.zones.hand.length === game.zones.hand.length + 1 && whole.game.turn === 5 && whole.game.zones.battlefield.filter((card) => card.tapped).map((card) => card.n).join() === 'Sol Ring');
}

// ---- storage ----
{
  let game = play(play(fresh(), 'Llanowar'), 'Sol Ring');
  game = setNoUntap(setTapped(game, named(game, 'Sol Ring').uid, true), named(game, 'Sol Ring').uid, true);
  const elves = packCard(named(game, 'Llanowar')), ring = packCard(named(game, 'Sol Ring'));
  check('a sick card is stored with sk: 1, and nothing else changes', elves.sk === 1 && !('nu' in elves) && Object.keys(elves).sort().join() === 'e,i,n,px,py,sk,u'); // (px and py: the card's cell on the battlefield grid)
  check('a card that does not untap is stored with nu: 1', ring.nu === 1 && !('sk' in ring) && ring.x === 1);
  same('both read back as the card they were', [unpackCard(elves, lookup), unpackCard(ring, lookup)], [named(game, 'Llanowar'), named(game, 'Sol Ring')]);
  for (const key of ['sk', 'nu']) for (const bad of [0, 2, true, '1', null, [1], {}]) check(`${key} that is ${JSON.stringify(bad)} makes the stored card unreadable`, unpackCard({ ...elves, [key]: bad }, lookup) === null);
  const sides = splitGame(game);
  same('a whole game with both marks comes back the same', joinGame(sides.public, sides.private, lookup), game);
  check('the marks are in the public branch (the other players see them), and a hand has none', JSON.stringify(sides.public).includes('"sk":1') && JSON.stringify(sides.public).includes('"nu":1') && !JSON.stringify(sides.private).includes('"sk"'));
  check('a mark on a stored card that is in the hand is not a field a hand has, but is read as what it is (the page never writes one)', unpackCard({ ...elves, sk: 1 }, lookup).sick === true);
}

// ---- long random games: nothing is lost, every game checks out, and a saved game reads back the same ----
{
  const random = seededRandom(91);
  const pick = (list) => list[Math.floor(random() * list.length)];
  for (let round = 0; round < 4; round++) {
    let game = makeGame(deck, lookup, { random: seededRandom(200 + round), handSize: 5 });
    const total = all(game).length;
    for (let step = 0; step < 1200; step++) {
      if (all(game).filter((card) => !card.tok).length !== total) fail(`round ${round} step ${step}: no real card is lost or copied (tokens come and go)`, `${all(game).filter((card) => !card.tok).length} of ${total}`);
      const cards = all(game);
      const battlefield = game.zones.battlefield;
      const roll = random();
      if (roll < 0.3) game = moveCard(game, pick(cards).uid, pick(ZONES));
      else if (roll < 0.45 && battlefield.length) game = setTapped(game, pick(battlefield).uid, random() < 0.6);
      else if (roll < 0.55 && battlefield.length) game = setNoUntap(game, pick(battlefield).uid, random() < 0.5);
      else if (roll < 0.65 && battlefield.length) game = setSick(game, pick(battlefield).uid, random() < 0.5);
      else if (roll < 0.75) game = startTurn(game, Math.min(MAX_TURN, game.turn + 1 + Math.floor(random() * 4))).game;
      else if (roll < 0.8 && battlefield.length) { try { game = turnOver(game, pick(battlefield).uid); } catch (error) { if (!/no back face/.test(error.message)) throw error; } }
      else if (roll < 0.85 && battlefield.length) game = copyAsToken(game, pick(battlefield).uid).game;
      else if (roll < 0.9) game = untapAll(game);
      else { const sides = splitGame(game); same(`round ${round} step ${step}: a saved game reads back the same`, unstored(joinGame(sides.public, sides.private, lookup)), unstored(game)); }
      const problems = checkGame(game);
      if (problems.length) fail(`round ${round} step ${step}: the game stays consistent`, problems.join('; '));
      for (const card of game.zones.battlefield) if (card.noUntap && card.tapped && game.turn < 0) fail('impossible', card.uid);
      for (const zone of ZONES) if (zone !== 'battlefield') for (const card of game.zones[zone]) if ('sick' in card || 'noUntap' in card) fail(`round ${round} step ${step}: a card outside the battlefield has a mark`, card.uid);
    }
    check(`round ${round}: the mark never survives an untap step (sick) and never stops being held (noUntap)`, startTurn(game, game.turn + 1).game.zones.battlefield.every((card) => !('sick' in card)));
    check(`round ${round}: after a turn starts, every card still tapped is a marked one`, startTurn(game, game.turn + 1).game.zones.battlefield.every((card) => !card.tapped || card.noUntap === true));
  }
}

console.log(`All ${checks} turn mark checks passed.`);
