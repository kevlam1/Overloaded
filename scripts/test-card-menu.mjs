// Checks shared/card-menu.mjs: which choices a card's right-click menu offers in each zone, and what each choice does to a real game.
// Run from the repo root:  node scripts/test-card-menu.mjs
import { menuItems, menuAction, turnLabel, turnMessage, ZONE_NAMES, MOVE_TARGETS, COUNTER_AMOUNTS } from '../shared/card-menu.mjs';
import { makeGame, moveCard, createToken, changeCounter, seededRandom, ZONES, checkGame } from '../shared/zones.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const refused = (label, run, words) => {
  checks++;
  try { run(); } catch (error) { if (error instanceof Error && (!words || words.test(error.message))) return; fail(label, `wrong message: ${error.message}`); }
  fail(label, 'was accepted');
};
const deepFreeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; };

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deck = { cards: [{ i: id(1), n: 'Forest', qty: 30, section: 'main' }, { i: id(2), n: 'Goblin Guide', qty: 10, section: 'main' }], commander: [] };
const lookup = (card) => ({ t: card.i === id(1) ? 'Basic Land - Forest' : 'Creature - Goblin', m: '', k: [] });
const fresh = () => makeGame(deck, lookup, { random: seededRandom(5) });
const cardOf = (game, uid) => ZONES.flatMap((zone) => game.zones[zone]).find((card) => card.uid === uid);
const zoneOf = (game, uid) => ZONES.find((zone) => game.zones[zone].some((card) => card.uid === uid));
function onBattlefield() {
  let game = fresh();
  const uid = game.zones.hand[0].uid;
  game = moveCard(game, uid, 'battlefield');
  return { game: deepFreeze(game), uid, card: cardOf(game, uid) };
}

// ---- the constants are what the design says ----
same('the move targets', MOVE_TARGETS.map(([to]) => to), ['hand', 'battlefield', 'graveyard', 'exile', 'command', 'sideboard']);
same('the quick counter amounts', COUNTER_AMOUNTS, [2, 3, 5]);
same('every zone has words', ZONES.every((zone) => typeof ZONE_NAMES[zone] === 'string'), true);

// ---- what is offered ----
const ids = (items) => items.map((item) => item.id);
same('on the battlefield: Modify, Tap, the counter, Move to', ids(menuItems({ tapped: false }, 'battlefield')), ['modify', 'tap', 'counter', 'move']);
same('an untapped card offers Tap, a tapped one Untap', [menuItems({ tapped: false }, 'battlefield')[1].label, menuItems({ tapped: true }, 'battlefield')[1].label], ['Tap', 'Untap']);
same('the counter item has the quick amounts and its own copy of the list', (() => { const item = menuItems({}, 'battlefield')[2]; item.amounts.push(99); return [item.label, menuItems({}, 'battlefield')[2].amounts]; })(), ['+1/+1 counter', [2, 3, 5]]);
for (const zone of ['hand', 'graveyard', 'exile', 'command', 'sideboard', 'library']) same(`in ${zone} only Move to is offered`, ids(menuItems({}, zone)), ['move']);
same('moves from the battlefield: every zone but the battlefield, then the two library places', ids(menuItems({}, 'battlefield')[3].items), ['move:hand', 'move:graveyard', 'move:exile', 'move:command', 'move:sideboard', 'move:library-top', 'move:library-bottom']);
same('moves from the hand: not to the hand', ids(menuItems({}, 'hand')[0].items), ['move:battlefield', 'move:graveyard', 'move:exile', 'move:command', 'move:sideboard', 'move:library-top', 'move:library-bottom']);
same('from the library you can still put it on the top or bottom of it', ids(menuItems({}, 'library')[0].items).slice(-2), ['move:library-top', 'move:library-bottom']);
same('a card that is not there still gets a menu', ids(menuItems(null, 'battlefield')), ['modify', 'tap', 'counter', 'move']);
same('labels are plain words', menuItems({}, 'hand')[0].items.map((item) => item.label), ['Battlefield', 'Graveyard', 'Exile', 'Command zone', 'Sideboard', 'Top of library', 'Bottom of library']);

// ---- what each choice does ----
{
  const { game, uid, card } = onBattlefield();
  const tap = menuAction('tap', card);
  check('Tap taps the card and says so', cardOf(tap.run(game), uid).tapped === true && tap.message === `Tapped ${card.n}.`, tap.message);
  const tapped = tap.run(game);
  const untap = menuAction('tap', cardOf(tapped, uid));
  check('Untap untaps it', cardOf(untap.run(tapped), uid).tapped === false && untap.message === `Untapped ${card.n}.`);
  for (const amount of [1, 2, 3, 5]) {
    const add = menuAction('counter', card, amount);
    same(`the counter item adds ${amount}`, [cardOf(add.run(game), uid).ct, add.message, add.toast], [{ p: amount }, `Added ${amount} +1/+1 counter${amount === 1 ? '' : 's'} to ${card.n}.`, { text: `+${amount}/+${amount}`, tone: 'up' }]);
  }
  same('the counter item with no amount adds one', cardOf(menuAction('counter', card).run(game), uid).ct, { p: 1 });
  for (const bad of [0, 4, 10, -1, 2.5, '2', NaN, null]) refused(`the counter item refuses ${String(bad)}`, () => menuAction('counter', card, bad), /1, 2, 3 or 5/);
  const minus = changeCounter(game, uid, 'm', 3);
  same('a +1/+1 counter from the menu cancels -1/-1 counters first, as the rules do', [cardOf(menuAction('counter', card, 2).run(minus), uid).ct, cardOf(menuAction('counter', card, 5).run(minus), uid).ct], [{ m: 1 }, { p: 2 }]);
  for (const [to, label] of [['hand', 'Hand'], ['graveyard', 'Graveyard'], ['exile', 'Exile'], ['command', 'Command zone'], ['sideboard', 'Sideboard']]) {
    const move = menuAction(`move:${to}`, card);
    const after = move.run(game);
    check(`Move to ${label} moves the card there and says so`, zoneOf(after, uid) === to && move.message === `Moved ${card.n} to ${ZONE_NAMES[to]}.` && checkGame(after).length === 0, move.message);
  }
  const top = menuAction('move:library-top', card).run(game);
  const bottom = menuAction('move:library-bottom', card).run(game);
  check('Top of library puts it first', top.zones.library[0].uid === uid && zoneOf(top, uid) === 'library');
  check('Bottom of library puts it last', bottom.zones.library.at(-1).uid === uid && zoneOf(bottom, uid) === 'library');
  same('and the messages say which', [menuAction('move:library-top', card).message, menuAction('move:library-bottom', card).message], [`Put ${card.n} on top of your library.`, `Put ${card.n} on the bottom of your library.`]);
  const handCard = cardOf(game, game.zones.hand[0].uid);
  const play = menuAction('move:battlefield', handCard);
  check('a card in the hand goes to the battlefield', zoneOf(play.run(game), handCard.uid) === 'battlefield' && play.message === `Moved ${handCard.n} to the battlefield.`);
  check('a game after a menu choice is still a whole game', [menuAction('tap', card), menuAction('counter', card, 3), menuAction('move:exile', card)].every((action) => checkGame(action.run(game)).length === 0));
  refused('Tap on a card that is not on the battlefield is refused by the game', () => menuAction('tap', handCard).run(game), /battlefield/);
  refused('a counter on a card in the hand is refused by the game', () => menuAction('counter', handCard, 2).run(game), /battlefield/);
  refused('a card that is not in the game is refused', () => menuAction('tap', { uid: 'c99999', n: 'Ghost' }).run(game), /not in the game/);
}
{
  // a token that leaves the battlefield is gone, and the message says so
  let game = fresh();
  const made = createToken(game, { n: 'Goblin', i: id(70), tt: 'Token Creature - Goblin', pt: '1/1' });
  const token = cardOf(made.game, made.uid);
  const gone = menuAction('move:graveyard', token);
  check('a token moved off the battlefield is gone, and the message says so', zoneOf(gone.run(made.game), made.uid) === undefined && gone.message === 'Goblin is a token, so it is gone.', gone.message);
  check('a token moved to the battlefield keeps its normal message', menuAction('move:battlefield', token).message === 'Moved Goblin to the battlefield.');
}

// ---- things that are not choices ----
same('Modify and the Move to heading are the page\'s own business', [menuAction('modify', { n: 'x', uid: 'c1' }), menuAction('move', { n: 'x', uid: 'c1' })], [null, null]);
for (const bad of ['', 'nothing', 'move:', 'move:nowhere', 'move:library', 'move:__proto__', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 5, null, undefined, {}]) same(`${JSON.stringify(bad)} is not a choice`, menuAction(bad, { n: 'x', uid: 'c1' }), null);
same('no card, no action', [menuAction('tap', null), menuAction('tap', undefined)], [null, null]);

// ---- turning a two-sided card over (a card with b: 1, list format 5) ----
{
  const backDeck = { cards: [{ i: id(1), n: 'Forest', qty: 30, section: 'main' }, { i: id(3), n: 'Delver of Secrets // Insectile Aberration', qty: 10, section: 'main' }], commander: [] };
  const backLookup = (card) => (card.i === id(3) ? { t: 'Creature — Human Wizard // Creature — Human Insect', m: '{U}', k: [], b: 1 } : { t: 'Basic Land - Forest', m: '', k: [] });
  let game = makeGame(backDeck, backLookup, { random: seededRandom(5) });
  const delverUid = game.zones.hand.find((card) => card.b === 1)?.uid ?? game.zones.library.find((card) => card.b === 1).uid;
  game = deepFreeze(moveCard(game, delverUid, 'battlefield'));
  const delver = cardOf(game, delverUid);
  same('a card with a back face offers Turn over, after Tap and before the counter', ids(menuItems(delver, 'battlefield')), ['modify', 'tap', 'turn', 'counter', 'move']);
  same('its label says what it will do', [menuItems(delver, 'battlefield')[2].label, menuItems({ ...delver, turned: true }, 'battlefield')[2].label], ['Turn over', 'Turn back to front']);
  same('the label function says the same', [turnLabel(delver), turnLabel({ ...delver, turned: true })], ['Turn over', 'Turn back to front']);
  for (const zone of ['hand', 'graveyard', 'exile', 'command', 'sideboard', 'library']) same(`in ${zone} it is not offered, even for a card with a back`, ids(menuItems(delver, zone)), ['move']);
  for (const bad of [0, true, '1', 2, null]) same(`b that is ${JSON.stringify(bad)} offers no Turn over`, ids(menuItems({ ...delver, b: bad }, 'battlefield')), ['modify', 'tap', 'counter', 'move']);
  same('a card with no back, and no card, offer none', [ids(menuItems(onBattlefield().card, 'battlefield')).includes('turn'), ids(menuItems(null, 'battlefield')).includes('turn')], [false, false]);
  const turn = menuAction('turn', delver);
  same('Turn over says what it did', turn.message, `Turned ${delver.n} over.`);
  const turned = turn.run(game);
  check('and turns the card', cardOf(turned, delverUid).turned === true);
  same('turned again it says it went back, and turns it back', [menuAction('turn', cardOf(turned, delverUid)).message, 'turned' in cardOf(menuAction('turn', cardOf(turned, delverUid)).run(turned), delverUid)], [`Turned ${delver.n} back to its front.`, false]);
  same('the message function agrees', [turnMessage(delver), turnMessage({ ...delver, turned: true })], [`Turned ${delver.n} over.`, `Turned ${delver.n} back to its front.`]);
  same('the turned game is consistent', checkGame(turned), []);
  check('the game it started from is not changed (it is frozen)', !('turned' in cardOf(game, delverUid)));
  const plain = onBattlefield();
  refused('Turn over on a card with no back is refused in words, and the game is as it was', () => menuAction('turn', plain.card).run(plain.game), /no back face/);
  const inHand = fresh();
  refused('Turn over on a card that is not on the battlefield is refused', () => menuAction('turn', { ...delver, uid: inHand.zones.hand[0].uid }).run(inHand), /battlefield|no back face/);
}

console.log(`All ${checks} card menu checks passed.`);
