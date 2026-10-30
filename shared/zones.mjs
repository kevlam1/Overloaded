// The cards of one player's game and where they are: library, hand, battlefield, graveyard, exile, the command zone and
// the sideboard. Plain JavaScript with no browser or network code, so Node tests can load it, and so the live game can use
// the same moves later (the live data model in docs/live-play.md keeps the same zones: hand and library private, the rest
// public). Casual play: nothing here knows the rules of the game; it moves cards and keeps count, like a paper table.
//
// Every function takes a game and returns a NEW game (nothing is changed in place), so a move can be tried, compared and
// undone, and a game is plain data that can be saved or sent as it is. A game is:
//   { zones: { library, hand, battlefield, graveyard, exile, command, sideboard }, life, turn, mulligans, nextUid }
// and each zone is an array of cards { uid, i, n, t, m, k, tapped, turnEntered }:
//   uid: this copy of the card (two Forests have two uids), i: the Scryfall id of its printing (its picture), n: name,
//   t: type line, m: mana cost, k: keywords, tapped, turnEntered: the turn it came to the battlefield (null elsewhere).
// For the library, the graveyard and the other piles, index 0 is the TOP.

export const ZONES = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'command', 'sideboard'];
export const HAND_SIZE = 7;
export const DEFAULT_LIFE = 20;
export const COMMANDER_LIFE = 40;
export const MAX_DRAW = 100;
export const MAX_LIFE_STEP = 1000;
const EM_DASH = ' ' + String.fromCharCode(0x2014) + ' ';

// Where a card goes in a pile when no position is given: on top of the library and of the graveyard (the newest card is
// first), at the end of the others.
const DEFAULT_POSITION = { library: 'top', graveyard: 'top', hand: 'bottom', battlefield: 'bottom', exile: 'bottom', command: 'bottom', sideboard: 'bottom' };

// ---- randomness ----
// A function that returns a number from 0 up to but not including 1. The shuffle takes one so tests can give it a known
// sequence; the real one comes from the browser's secure random source.
export function secureRandom() {
  const words = new Uint32Array(1);
  globalThis.crypto.getRandomValues(words);
  return words[0] / 4294967296;
}
// A small repeatable generator for tests and demos (mulberry32).
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A fair shuffle (Fisher-Yates): every order is equally likely if the generator is fair. Returns a new array.
export function shuffled(list, random = secureRandom) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---- what a card is ----
// Is this card a land? Judged by the front face, because some two-faced cards are a land only on their back (82 of them,
// checked in docs/scryfall.md): the front face shows on the table. "Land Creature" and "Artifact Land" are lands.
export function isLandCard(card) {
  const front = String(card?.t ?? '').split(' // ')[0].split(EM_DASH)[0];
  return /\bLand\b/.test(front);
}

// ---- starting a game ----
// deck: a saved deck as read by shared/deck-preview.mjs (cards with i, n, qty, section, and commander ids).
// lookup: (savedCard) => { t, m, k } or null: what the card list knows about it (type line, cost, keywords). A card the
//   list no longer knows still plays; it just has no type, so it goes in the "other" row.
// The commander goes to the command zone, the main deck to the library (shuffled), the sideboard and the companion to
// the sideboard. Life is 40 with a commander and 20 without. The opening hand is drawn.
export function makeGame(deck, lookup = () => null, { random = secureRandom, handSize = HAND_SIZE } = {}) {
  if (!deck || !Array.isArray(deck.cards)) throw new Error('That is not a deck.');
  const zones = Object.fromEntries(ZONES.map((zone) => [zone, []]));
  let uid = 1;
  const into = { commander: 'command', main: 'library', sideboard: 'sideboard', companion: 'sideboard' };
  for (const saved of deck.cards) {
    const zone = into[saved.section];
    if (!zone) throw new Error(`A card is in a section this game does not know: ${saved.section}`);
    const known = lookup(saved) ?? {};
    for (let copy = 0; copy < saved.qty; copy++) {
      zones[zone].push({ uid: `c${uid++}`, i: saved.i, n: saved.n, t: known.t ?? '', m: known.m ?? '', k: known.k ?? [], tapped: false, turnEntered: null });
    }
  }
  zones.library = shuffled(zones.library, random);
  const game = { zones, life: zones.command.length ? COMMANDER_LIFE : DEFAULT_LIFE, turn: 1, mulligans: 0, nextUid: uid };
  return draw(game, handSize).game;
}

// ---- moves ----
function locate(game, uid) {
  for (const zone of ZONES) {
    const at = game.zones[zone].findIndex((card) => card.uid === uid);
    if (at >= 0) return { zone, at };
  }
  throw new Error('That card is not in the game.');
}

// Moves one card to a zone. position: 'top' or 'bottom' of that pile (see DEFAULT_POSITION). A card that leaves the
// battlefield is untapped; one that arrives there remembers the turn it arrived.
export function moveCard(game, uid, to, { position } = {}) {
  if (!ZONES.includes(to)) throw new Error(`There is no zone called ${to}.`);
  const where = position ?? DEFAULT_POSITION[to];
  if (where !== 'top' && where !== 'bottom') throw new Error('A position is "top" or "bottom".');
  const { zone: from, at } = locate(game, uid);
  const zones = { ...game.zones };
  const card = game.zones[from][at];
  zones[from] = game.zones[from].filter((_, index) => index !== at);
  const moved = { ...card, tapped: to === 'battlefield' ? card.tapped : false, turnEntered: to === 'battlefield' ? (from === 'battlefield' ? card.turnEntered : game.turn) : null };
  zones[to] = where === 'top' ? [moved, ...zones[to]] : [...zones[to], moved];
  return { ...game, zones };
}

// Draws cards from the top of the library into the hand. Returns { game, drawn: [uid], short } where short is true if the
// library ran out before n cards were drawn (the player decides what that means; casual play does not end the game).
export function draw(game, count = 1) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_DRAW) throw new Error(`Draw between 1 and ${MAX_DRAW} cards.`);
  const taken = game.zones.library.slice(0, count);
  const zones = { ...game.zones, library: game.zones.library.slice(taken.length), hand: [...game.zones.hand, ...taken] };
  return { game: { ...game, zones }, drawn: taken.map((card) => card.uid), short: taken.length < count };
}

export function shuffleLibrary(game, random = secureRandom) {
  return { ...game, zones: { ...game.zones, library: shuffled(game.zones.library, random) } };
}

// A mulligan: the hand goes back into the library, which is shuffled, and a new hand is drawn. In casual play the player
// then puts one card per mulligan on the bottom of the library with moveCard (so the count is kept in `mulligans`).
export function mulligan(game, { random = secureRandom, handSize = HAND_SIZE } = {}) {
  const library = shuffled([...game.zones.library, ...game.zones.hand], random);
  const back = { ...game, zones: { ...game.zones, library, hand: [] }, mulligans: game.mulligans + 1 };
  return draw(back, handSize).game;
}

export function setTapped(game, uid, tapped) {
  const { zone, at } = locate(game, uid);
  if (zone !== 'battlefield') throw new Error('Only a card on the battlefield can be tapped.');
  const battlefield = game.zones.battlefield.map((card, index) => (index === at ? { ...card, tapped: Boolean(tapped) } : card));
  return { ...game, zones: { ...game.zones, battlefield } };
}

export function untapAll(game) {
  return { ...game, zones: { ...game.zones, battlefield: game.zones.battlefield.map((card) => (card.tapped ? { ...card, tapped: false } : card)) } };
}

export function adjustLife(game, delta) {
  if (!Number.isInteger(delta) || Math.abs(delta) > MAX_LIFE_STEP) throw new Error(`Change life by a whole number up to ${MAX_LIFE_STEP}.`);
  return { ...game, life: game.life + delta };
}

// The next turn: the turn number goes up, everything untaps, and one card is drawn. Returns { game, drawn, short }.
export function nextTurn(game) {
  const next = untapAll({ ...game, turn: game.turn + 1 });
  return draw(next, 1);
}

// ---- looking ----
// The battlefield in its two rows, each in the order the cards came: lands, and everything else.
export function battlefieldRows(game) {
  const lands = [];
  const other = [];
  for (const card of game.zones.battlefield) (isLandCard(card) ? lands : other).push(card);
  return { lands, other };
}

export const zoneCounts = (game) => Object.fromEntries(ZONES.map((zone) => [zone, game.zones[zone].length]));

// Is this game consistent? Every card is in exactly one zone, uids are unique, every card has the fields a card needs,
// only battlefield cards are tapped or have an entry turn. Returns a list of problems; empty means fine. Used by the
// tests, and by the live game later to refuse a damaged state.
export function checkGame(game) {
  const problems = [];
  if (!game || typeof game !== 'object' || !game.zones) return ['not a game'];
  const seen = new Set();
  for (const zone of ZONES) {
    if (!Array.isArray(game.zones[zone])) { problems.push(`zone ${zone} is not a list`); continue; }
    for (const card of game.zones[zone]) {
      if (!card || typeof card.uid !== 'string' || typeof card.i !== 'string' || typeof card.n !== 'string') { problems.push(`a card in ${zone} is missing a field`); continue; }
      if (seen.has(card.uid)) problems.push(`card ${card.uid} is in two places`);
      seen.add(card.uid);
      if (zone !== 'battlefield' && (card.tapped || card.turnEntered !== null)) problems.push(`card ${card.uid} is tapped or has an entry turn outside the battlefield`);
      if (zone === 'battlefield' && !Number.isInteger(card.turnEntered)) problems.push(`battlefield card ${card.uid} has no entry turn`);
    }
  }
  for (const key of Object.keys(game.zones)) if (!ZONES.includes(key)) problems.push(`unknown zone ${key}`);
  if (!Number.isInteger(game.life)) problems.push('life is not a whole number');
  if (!Number.isInteger(game.turn) || game.turn < 1) problems.push('the turn is not a whole number from 1');
  if (!Number.isInteger(game.mulligans) || game.mulligans < 0) problems.push('mulligans is not a whole number from 0');
  return problems.slice(0, 20);
}
