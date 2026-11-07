// Checks shared/card-menu.mjs: which choices a card's right-click menu offers in each zone, and what each choice does to a real game.
// Run from the repo root:  node scripts/test-card-menu.mjs
import { menuItems, menuAction, turnLabel, turnMessage, playBackLabel, PLAY_BACK_ZONES, noUntapLabel, sickLabel, untapMessage, ZONE_NAMES, MOVE_TARGETS, COUNTER_AMOUNTS } from '../shared/card-menu.mjs';
import { makeGame, moveCard, createToken, changeCounter, seededRandom, ZONES, checkGame, isLandCard, battlefieldRows, setTapped, setNoUntap } from '../shared/zones.mjs';

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
same('on the battlefield: Modify, Tap, the two marks (does not untap, summoning sick), the counter, Create copy, Move to', ids(menuItems({ tapped: false }, 'battlefield')), ['modify', 'tap', 'nountap', 'sick', 'counter', 'copy', 'move']);
same('an untapped card offers Tap, a tapped one Untap', [menuItems({ tapped: false }, 'battlefield')[1].label, menuItems({ tapped: true }, 'battlefield')[1].label], ['Tap', 'Untap']);
same('the counter item has the quick amounts and its own copy of the list', (() => { const item = menuItems({}, 'battlefield')[4]; item.amounts.push(99); return [item.label, menuItems({}, 'battlefield')[4].amounts]; })(), ['+1/+1 counter', [2, 3, 5]]);
for (const zone of ['hand', 'graveyard', 'exile', 'command', 'sideboard', 'library']) same(`in ${zone} only Move to is offered`, ids(menuItems({}, zone)), ['move']);
same('moves from the battlefield: every zone but the battlefield, then the two library places', ids(menuItems({}, 'battlefield')[6].items), ['move:hand', 'move:graveyard', 'move:exile', 'move:command', 'move:sideboard', 'move:library-top', 'move:library-bottom']);
same('moves from the hand: not to the hand', ids(menuItems({}, 'hand')[0].items), ['move:battlefield', 'move:graveyard', 'move:exile', 'move:command', 'move:sideboard', 'move:library-top', 'move:library-bottom']);
same('from the library you can still put it on the top or bottom of it', ids(menuItems({}, 'library')[0].items).slice(-2), ['move:library-top', 'move:library-bottom']);
same('a card that is not there still gets a menu', ids(menuItems(null, 'battlefield')), ['modify', 'tap', 'nountap', 'sick', 'counter', 'copy', 'move']);
// Ping card (shared/ping.mjs): only on a live table (other players to ping), only for a card in a public zone, and the page sends it (menuAction has nothing to run)
for (const zone of ['battlefield', 'graveyard', 'exile', 'command', 'hand', 'library', 'sideboard']) same('the solo menu never offers Ping card (' + zone + ')', ids(menuItems({}, zone)).includes('ping'), false);
for (const zone of ['battlefield', 'graveyard', 'exile', 'command']) same('a live table offers Ping card for a card in the ' + zone + ', just before Move to', (() => { const list = ids(menuItems({}, zone, { live: true })); return [list.includes('ping'), list.at(-2), list.at(-1)]; })(), [true, 'ping', 'move']);
for (const zone of ['hand', 'library', 'sideboard']) same('a live table does not offer Ping card for a card in the ' + zone + ' (it is hidden: a ping would reveal it)', ids(menuItems({}, zone, { live: true })).includes('ping'), false);
same('the label is plain words', menuItems({}, 'battlefield', { live: true }).find((item) => item.id === 'ping').label, 'Ping card');
same('on the battlefield of a live table the order is the old one with Ping card before Move to', ids(menuItems({}, 'battlefield', { live: true })), ['modify', 'tap', 'nountap', 'sick', 'counter', 'copy', 'ping', 'move']);
same('the options object may be left out or empty', [ids(menuItems({}, 'graveyard', {})).includes('ping'), ids(menuItems({}, 'graveyard', undefined)).includes('ping')], [false, false]);
same('menuAction has nothing to run for ping (the page sends it)', menuAction('ping', { uid: 'c1', n: 'X' }), null);
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
  same('a card with a back face offers Turn over, after Tap and before the counter', ids(menuItems(delver, 'battlefield')), ['modify', 'tap', 'turn', 'nountap', 'sick', 'counter', 'copy', 'move']);
  same('its label says what it will do', [menuItems(delver, 'battlefield')[2].label, menuItems({ ...delver, turned: true }, 'battlefield')[2].label], ['Turn over', 'Turn back to front']);
  same('the label function says the same', [turnLabel(delver), turnLabel({ ...delver, turned: true })], ['Turn over', 'Turn back to front']);
  for (const zone of ['hand', 'graveyard', 'exile', 'command', 'sideboard', 'library']) same(`in ${zone} it is not offered, even for a card with a back`, ids(menuItems(delver, zone)), ['move']);
  for (const bad of [0, true, '1', 2, null]) same(`b that is ${JSON.stringify(bad)} offers no Turn over`, ids(menuItems({ ...delver, b: bad }, 'battlefield')), ['modify', 'tap', 'nountap', 'sick', 'counter', 'copy', 'move']);
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

// ---- Create copy, and playing a modal card as its back face (list format 6, md) ----
{
  const VALAKUT = { i: id(4), n: 'Valakut Awakening // Valakut Stoneforge', t: 'Instant // Land', m: '{2}{R}', k: [], b: 1, md: 1 };
  const DELVER = { i: id(3), n: 'Delver of Secrets // Insectile Aberration', t: 'Creature — Human Wizard // Creature — Human Insect', m: '{U}', k: ['Flying', 'Transform'], b: 1 };
  const known = { [id(2)]: { t: 'Creature - Goblin', m: '', k: [] }, [id(3)]: DELVER, [id(4)]: VALAKUT };
  const look = (card) => (card.i === id(1) ? { t: 'Basic Land - Forest', m: '', k: [] } : known[card.i]);
  const copyDeck = { cards: [{ i: id(1), n: 'Forest', qty: 20, section: 'main' }, { i: id(2), n: 'Goblin Guide', qty: 1, section: 'main' }, { i: id(3), n: DELVER.n, qty: 1, section: 'main' }, { i: id(4), n: VALAKUT.n, qty: 1, section: 'main' }], commander: [] };
  const start = makeGame(copyDeck, look, { random: seededRandom(3) });
  const all = (game) => ZONES.flatMap((zone) => game.zones[zone]);
  const byName = (game, prefix) => all(game).find((card) => card.n.startsWith(prefix));
  const put = (game, uid, zone) => moveCard(game, uid, zone);

  // Create copy
  let game = start;
  for (const name of ['Delver', 'Valakut', 'Goblin']) game = put(game, byName(game, name).uid, 'battlefield');
  const delverCard = byName(game, 'Delver');
  same('Create copy is offered on the battlefield, after the counter and before Move to', ids(menuItems(delverCard, 'battlefield')).slice(-3), ['counter', 'copy', 'move']);
  for (const zone of ['hand', 'graveyard', 'exile', 'command', 'sideboard', 'library']) check(`Create copy is not offered in ${zone}`, !ids(menuItems(delverCard, zone)).includes('copy'));
  const front = menuAction('copy', delverCard, 1, { printed: '1/1' });
  same('a copy of a card showing its front says so, with the front face\'s name', front.message, 'Made a token copy of Delver of Secrets.');
  const copiedFront = front.run(game);
  const frontToken = copiedFront.zones.battlefield.find((card) => card.tok);
  check('it is a token with the front\'s name, type line and printed numbers, and does not show the back', frontToken.n === 'Delver of Secrets' && frontToken.t === 'Creature — Human Wizard' && frontToken.pt === '1/1' && !('turned' in frontToken) && !('b' in frontToken), JSON.stringify(frontToken));
  same('the game with the copy is consistent', checkGame(copiedFront), []);
  check('the type line it carries fits what a stored token may hold (60 characters)', frontToken.t.length <= 60);
  const turnedGame = menuAction('turn', delverCard).run(game);
  const turnedDelver = byName(turnedGame, 'Delver');
  const back = menuAction('copy', turnedDelver, 1, { printed: '3/2' });
  same('a copy of a turned-over card says the back face\'s name', back.message, 'Made a token copy of Insectile Aberration.');
  const copiedBack = back.run(turnedGame);
  const backToken = copiedBack.zones.battlefield.find((card) => card.tok);
  check('it is the BACK face: its name, type line, numbers and picture, with no cost and no back face of its own', backToken.n === 'Insectile Aberration' && backToken.t === 'Creature — Human Insect' && backToken.pt === '3/2' && backToken.turned === true && backToken.m === '' && !('b' in backToken) && !('md' in backToken), JSON.stringify(backToken));
  same('and the game with it is consistent', checkGame(copiedBack), []);
  refused('the copy of a turned card cannot itself be turned over (it is no two-sided card)', () => menuAction('turn', backToken).run(copiedBack), /no back face/);
  const copyOfCopy = menuAction('copy', backToken, 1, { printed: '9/9' }).run(copiedBack);
  const grandToken = copyOfCopy.zones.battlefield.filter((card) => card.tok)[1];
  check('a copy of that copy keeps its numbers (not the printed ones passed in), its back picture and its face\'s name', grandToken.pt === '3/2' && grandToken.turned === true && grandToken.n === 'Insectile Aberration' && checkGame(copyOfCopy).length === 0, JSON.stringify(grandToken));
  const goblin = byName(game, 'Goblin');
  for (const [label, printed, expected] of [['no numbers', null, undefined], ['numbers that cannot be stored (3.5/3.5)', '3.5/3.5', undefined], ['joke numbers (?/?)', '?/?', undefined], ['infinity (∞/5)', '∞/5', undefined], ['a star (*/1+*)', '*/1+*', '*/1+*'], ['text that is not numbers', 'big', undefined], ['not text', 7, undefined], ['a negative modifier-like value (-1/-1)', '-1/-1', '-1/-1']]) {
    const token = menuAction('copy', goblin, 1, { printed }).run(game).zones.battlefield.find((card) => card.tok);
    same(`a copy with printed ${label} gets ${expected ?? 'no numbers'}`, token.pt, expected);
  }
  check('a copy of a card with no options at all still works', menuAction('copy', goblin).run(game).zones.battlefield.some((card) => card.tok && !('pt' in card)));
  const counters = menuAction('counter', goblin, 3).run(game);
  check('a copy has no counters of the card it copies', !('ct' in menuAction('copy', byName(counters, 'Goblin'), 1, { printed: '2/2' }).run(counters).zones.battlefield.find((card) => card.tok)));
  refused('a card in the hand cannot be copied', () => menuAction('copy', byName(start, 'Goblin')).run(start), /battlefield/);
  // A card the list does not know has no type line, so a copy of it would be a token with an empty one: refused, in words (the database rules
  // refuse an empty token type, and a refused zone write would stop every save of that player).
  const unknownGame = moveCard(makeGame(copyDeck, () => null, { random: seededRandom(3) }), makeGame(copyDeck, () => null, { random: seededRandom(3) }).zones.hand[0].uid, 'battlefield');
  const unknownCard = unknownGame.zones.battlefield[0];
  refused('a card whose type is unknown cannot be copied', () => menuAction('copy', unknownCard, 1, { printed: '2/2' }).run(unknownGame), /type is not known/);
  check('and the refusal leaves the game as it was', unknownGame.zones.battlefield.length === 1 && checkGame(unknownGame).length === 0);
  const blank = { ...unknownCard, t: '   ' };
  refused('a type line of only spaces is no type either', () => menuAction('copy', blank).run({ ...unknownGame, zones: { ...unknownGame.zones, battlefield: [blank] } }), /type is not known/);
  const frozen = deepFreeze(game);
  check('works on a frozen game', menuAction('copy', byName(frozen, 'Goblin'), 1, { printed: '2/2' }).run(frozen).zones.battlefield.length === 4);

  // Play the back face of a modal card
  const modal = byName(start, 'Valakut');
  same('a modal card in the hand offers its back face by name, before Move to', ids(menuItems(modal, 'hand')), ['playback', 'move']);
  same('with the back face\'s name in the label', menuItems(modal, 'hand')[0].label, 'Play Valakut Stoneforge');
  same('the label function says the same', playBackLabel(modal), 'Play Valakut Stoneforge');
  same('where a card can be cast from: the hand, graveyard, exile and the command zone', PLAY_BACK_ZONES, ['hand', 'graveyard', 'exile', 'command']);
  for (const zone of PLAY_BACK_ZONES) check(`it is offered in ${zone}`, ids(menuItems(modal, zone)).includes('playback'));
  for (const zone of ['battlefield', 'library', 'sideboard']) check(`and not in ${zone}`, !ids(menuItems(modal, zone)).includes('playback'));
  const transform = byName(start, 'Delver');
  check('a transform card has a back but cannot be played as it', !ids(menuItems(transform, 'hand')).includes('playback') && transform.b === 1 && !('md' in transform));
  same('a card with no back is not offered it either', ids(menuItems(byName(start, 'Goblin'), 'hand')), ['move']);
  for (const bad of [0, true, '1', 2, null]) check(`md that is ${JSON.stringify(bad)} offers nothing`, !ids(menuItems({ ...modal, md: bad }, 'hand')).includes('playback'));
  check('md without b offers nothing', !ids(menuItems({ ...modal, b: undefined }, 'hand')).includes('playback'));
  same('a saved name with no two halves gets words instead of a face name', playBackLabel({ ...modal, n: 'Valakut Awakening' }), 'Play its back face');
  const play = menuAction('playback', modal);
  same('it says what was played', play.message, 'Played Valakut Stoneforge (the back of Valakut Awakening).');
  const played = play.run(deepFreeze(start));
  const stoneforge = byName(played, 'Valakut');
  check('the card is on the battlefield, turned over, with its entry turn', played.zones.battlefield.includes(stoneforge) && stoneforge.turned === true && stoneforge.turnEntered === played.turn);
  check('and it is a land (the back face shows), so it goes in the lands row', isLandCard(stoneforge) && battlefieldRows(played).lands.some((card) => card.uid === stoneforge.uid));
  same('the game is consistent', checkGame(played), []);
  check('the start is not changed (it is frozen)', byName(start, 'Valakut').turnEntered === null);
  for (const zone of ['graveyard', 'exile', 'command']) {
    const from = put(start, modal.uid, zone);
    const result = menuAction('playback', byName(from, 'Valakut')).run(from);
    check(`played from ${zone} it comes onto the battlefield turned over`, byName(result, 'Valakut').turned === true && result.zones.battlefield.some((card) => card.uid === modal.uid) && checkGame(result).length === 0);
  }
  refused('a transform card cannot be played as its back face', () => menuAction('playback', transform).run(start), /cannot be played as its back face/);
  refused('a card with no back at all cannot', () => menuAction('playback', byName(start, 'Goblin')).run(start), /cannot be played as its back face/);
  refused('a card already on the battlefield cannot', () => menuAction('playback', byName(played, 'Valakut')).run(played), /already on the battlefield/);
  const onField = put(start, modal.uid, 'battlefield');
  refused('and not even when it is not turned yet', () => menuAction('playback', byName(onField, 'Valakut')).run(onField), /already on the battlefield/);
}

// ---- the two marks: "doesn't untap" and "summoning sick" (set by hand, because the card data cannot tell) ----
{
  const known = { [id(2)]: { t: 'Creature - Elf', m: '', k: [] }, [id(3)]: { t: 'Artifact', m: '{1}', k: [] }, [id(4)]: { t: 'Instant // Creature - Elf', m: '{G}', k: [], b: 1, md: 1 }, [id(5)]: { t: 'Creature - Elf // Instant', m: '{G}', k: [], b: 1, md: 1 } };
  const look = (card) => (card.i === id(1) ? { t: 'Basic Land - Forest', m: '', k: [] } : known[card.i]);
  const marksDeck = { cards: [{ i: id(1), n: 'Forest', qty: 20, section: 'main' }, { i: id(2), n: 'Elf', qty: 1, section: 'main' }, { i: id(3), n: 'Ring', qty: 1, section: 'main' }, { i: id(4), n: 'Spell // Elf Back', qty: 1, section: 'main' }, { i: id(5), n: 'Elf Front // Spell Back', qty: 1, section: 'main' }], commander: [] };
  const start = makeGame(marksDeck, look, { random: seededRandom(4), handSize: 23 });
  const byName = (game, name) => ZONES.flatMap((zone) => game.zones[zone]).find((card) => card.n === name);
  let game = moveCard(moveCard(start, byName(start, 'Elf').uid, 'battlefield'), byName(start, 'Ring').uid, 'battlefield');
  const elf = byName(game, 'Elf'), ring = byName(game, 'Ring');
  same('a creature that came in is offered "Not summoning sick" and the other card "Summoning sick"', [menuItems(elf, 'battlefield')[3].label, menuItems(ring, 'battlefield')[3].label], ['Not summoning sick', 'Summoning sick']);
  same('both cards offer "Doesn\'t untap" until it is set', [menuItems(elf, 'battlefield')[2].label, menuItems({ ...ring, noUntap: true }, 'battlefield')[2].label], ["Doesn't untap", 'Untaps normally']);
  same('the label functions say the same', [noUntapLabel(ring), noUntapLabel({ ...ring, noUntap: true }), sickLabel(ring), sickLabel(elf)], ["Doesn't untap", 'Untaps normally', 'Summoning sick', 'Not summoning sick']);
  for (const zone of ['hand', 'graveyard', 'exile', 'command', 'sideboard', 'library']) check(`neither is offered in ${zone}`, !ids(menuItems(elf, zone)).includes('nountap') && !ids(menuItems(elf, zone)).includes('sick'));
  const held = menuAction('nountap', ring);
  same('it says what it did', held.message, 'Ring will not untap in the untap step.');
  const marked = held.run(game);
  check('and marks the card', byName(marked, 'Ring').noUntap === true && checkGame(marked).length === 0);
  same('chosen again it undoes it and says so', [menuAction('nountap', byName(marked, 'Ring')).message, 'noUntap' in byName(menuAction('nountap', byName(marked, 'Ring')).run(marked), 'Ring')], ['Ring untaps normally again.', false]);
  const clear = menuAction('sick', elf);
  same('clearing summoning sickness says so', clear.message, 'Elf is no longer marked summoning sick.');
  check('and clears it', !('sick' in byName(clear.run(game), 'Elf')));
  same('marking says so', menuAction('sick', ring).message, 'Ring is marked summoning sick.');
  check('and marks a card that is not a creature (a crewed Vehicle)', byName(menuAction('sick', ring).run(game), 'Ring').sick === true);
  refused('a card in the hand cannot be marked either way', () => menuAction('nountap', byName(start, 'Elf')).run(start), /battlefield/);
  refused('...nor made sick', () => menuAction('sick', byName(start, 'Elf')).run(start), /battlefield/);
  check('the old game is not changed (it is frozen)', !('noUntap' in byName(deepFreeze(JSON.parse(JSON.stringify(game))), 'Ring')));

  // What "Untap all" and a new turn say when marked cards stay tapped.
  const tappedBoth = setTapped(setTapped(game, byName(game, 'Elf').uid, true), byName(game, 'Ring').uid, true);
  same('nothing held back: "Untapped everything."', untapMessage(tappedBoth), 'Untapped everything.');
  const oneHeld = setNoUntap(tappedBoth, byName(tappedBoth, 'Ring').uid, true);
  same('one card held back says so, in the singular', untapMessage(oneHeld), 'Untapped everything except 1 card that does not untap.');
  const twoHeld = setNoUntap(oneHeld, byName(oneHeld, 'Elf').uid, true);
  same('two cards held back say so, in the plural', untapMessage(twoHeld), 'Untapped everything except 2 cards that do not untap.');
  same('the first words can be changed (the new turn uses its own)', untapMessage(oneHeld, 'everything untapped'), 'everything untapped except 1 card that does not untap.');
  same('a marked card that is not tapped is not held back', untapMessage(setNoUntap(game, byName(game, 'Ring').uid, true)), 'Untapped everything.');

  // Play the back face: the mark follows the face that ends up showing.
  const spellFront = byName(start, 'Spell // Elf Back');
  check('a modal card with a creature on its back is not sick as its front (a spell is not a creature), but is when played as the creature', (() => {
    const front = moveCard(start, spellFront.uid, 'battlefield');
    const back = menuAction('playback', spellFront).run(start);
    return !('sick' in byName(front, 'Spell // Elf Back')) && byName(back, 'Spell // Elf Back').sick === true && byName(back, 'Spell // Elf Back').turned === true && checkGame(back).length === 0;
  })());
  const creatureFront = byName(start, 'Elf Front // Spell Back');
  check('a modal card with a creature on its front is sick as its front, and not when played as its spell side', (() => {
    const front = moveCard(start, creatureFront.uid, 'battlefield');
    const back = menuAction('playback', creatureFront).run(start);
    return byName(front, 'Elf Front // Spell Back').sick === true && !('sick' in byName(back, 'Elf Front // Spell Back')) && byName(back, 'Elf Front // Spell Back').turned === true;
  })());
}

console.log(`All ${checks} card menu checks passed.`);
