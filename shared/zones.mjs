// The cards of one player's game and where they are: library, hand, battlefield, graveyard, exile, the command zone and
// the sideboard. Plain JavaScript with no browser or network code, so Node tests can load it, and so the live game can use
// the same moves later (the live data model in docs/live-play.md keeps the same zones: hand and library private, the rest
// public). Casual play: nothing here knows the rules of the game; it moves cards and keeps count, like a paper table.
//
// Every function takes a game and returns a NEW game (nothing is changed in place), so a move can be tried, compared and
// undone, and a game is plain data that can be saved or sent as it is. A game is:
//   { zones: { library, hand, battlefield, graveyard, exile, command, sideboard }, life, turn, mulligans, nextUid }
// and each zone is an array of cards { uid, i, n, t, m, k, tapped, turnEntered } and, when the player's deck named one, p:
//   uid: this copy of the card (two Forests have two uids), i: the Scryfall id of the card in the card list (what the card IS,
//   and its default picture), p: the Scryfall id of the printing whose picture to draw (only the art differs: n, t, m, k are
//   the same in every printing; the picture is drawn from p when there is one, else from i), n: name,
//   t: type line, m: mana cost, k: keywords, tapped, turnEntered: the turn it came to the battlefield (null elsewhere).
// For the library, the graveyard and the other piles, index 0 is the TOP.
// A card on the battlefield may also hold, each only when set: ct (counters, an object from kind to count, see COUNTER_KINDS), mp and
// mt (the power and toughness modifier set by hand), nt (a short note), faceDown, and for a token tok: true with pt and cl. A game may hold
// pc (poison, energy, experience) and cd (commander damage by seat). docs/tokens-counters.md explains them.

import { scrubText } from './player-name.mjs';

const SCRYFALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const ZONES = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'command', 'sideboard'];
export const HAND_SIZE = 7;
export const DEFAULT_LIFE = 20;
export const COMMANDER_LIFE = 40;
export const MAX_DRAW = 100;
// One trillion: no limit that matters in play (doublers reach billions), but whole numbers are only exact up to about 9 quadrillion, so a
// ceiling keeps every count, life total and sum of a few of them exact. One number for life, every counter and the modifier (Kevin, 2026-11-04).
export const NUMBER_LIMIT = 1_000_000_000_000;
export const MAX_LIFE = NUMBER_LIMIT;
export const MAX_LIFE_STEP = NUMBER_LIMIT;
const EM_DASH = ' ' + String.fromCharCode(0x2014) + ' ';

// Counters, the power and toughness modifier, a note, face-down and tokens (docs/tokens-counters.md). They belong to a card ON THE
// BATTLEFIELD and are cleared when it leaves it; a token that leaves the battlefield stops existing.
export const COUNTER_KINDS = ['p', 'm', 'l', 'c', 't', 'o']; // +1/+1, -1/-1, loyalty, charge, time, other
export const COUNTER_WORDS = { p: '+1/+1', m: '-1/-1', l: 'Loyalty', c: 'Charge', t: 'Time', o: 'Other' };
export const MAX_COUNT = NUMBER_LIMIT;
export const MAX_MODIFIER = NUMBER_LIMIT;
export const MAX_NOTE = 40;
export const MAX_TOKEN_TEXT = 60;
export const MAX_ZONE_CARDS = 250;
export const PLAYER_COUNTERS = ['poison', 'energy', 'experience'];
export const COMMANDER_SEATS = ['1', '2', '3', '4'];
const BATTLEFIELD_STATE = ['ct', 'mp', 'mt', 'faceDown', 'nt'];
export const TOKEN_POWER_TOUGHNESS = /^[0-9*+-]{1,3}\/[0-9*+-]{1,3}$/;
export const TOKEN_COLORS = /^[WUBRG]{1,5}$/;

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
      zones[zone].push({ uid: `c${uid++}`, i: saved.i, ...(saved.p ? { p: saved.p } : {}), n: saved.n, t: known.t ?? '', m: known.m ?? '', k: known.k ?? [], tapped: false, turnEntered: null });
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
  const leaving = from === 'battlefield' && to !== 'battlefield';
  if (leaving && card.tok) return { ...game, zones }; // a token that leaves the battlefield stops existing
  const moved = { ...card, tapped: to === 'battlefield' ? card.tapped : false, turnEntered: to === 'battlefield' ? (from === 'battlefield' ? card.turnEntered : game.turn) : null };
  if (leaving) for (const key of BATTLEFIELD_STATE) delete moved[key]; // counters, the modifier, the note and face-down stay behind
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
  return { ...game, life: Math.min(MAX_LIFE, Math.max(-MAX_LIFE, game.life + delta)) };
}

// The next turn: the turn number goes up, everything untaps, and one card is drawn. Returns { game, drawn, short }.
export function nextTurn(game) {
  const next = untapAll({ ...game, turn: game.turn + 1 });
  return draw(next, 1);
}

// ---- counters, the modifier, notes, face-down and tokens ----
// The card on the battlefield with this uid, and where it is in that zone. Anything else is refused in words.
function onBattlefield(game, uid, what) {
  const { zone, at } = locate(game, uid);
  if (zone !== 'battlefield') throw new Error(`Only a card on the battlefield can have ${what}.`);
  return { card: game.zones.battlefield[at], at };
}
const putBattlefield = (game, at, card) => ({ ...game, zones: { ...game.zones, battlefield: game.zones.battlefield.map((existing, index) => (index === at ? card : existing)) } });
// A card with this field set, or without it when the value is empty (0, '', false, no counters): nothing is stored for "none".
function with_(card, key, value, empty) {
  const { [key]: _gone, ...rest } = card;
  return empty ? rest : { ...rest, [key]: value };
}
const wholeStep = (delta, what) => {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > NUMBER_LIMIT) throw new Error(`Change ${what} by a whole number from 1 to ${NUMBER_LIMIT.toLocaleString('en-US')}, up or down.`);
};

// Adds (delta above 0) or removes (below 0) counters of one kind. Adding a +1/+1 counter to a card with -1/-1 counters removes
// -1/-1 counters first, and the other way round, as the real rules cancel them in pairs. A count stops at 0 and at MAX_COUNT.
export function changeCounter(game, uid, kind, delta) {
  if (!COUNTER_KINDS.includes(kind)) throw new Error('That is not a kind of counter.');
  wholeStep(delta, 'a counter');
  const { card, at } = onBattlefield(game, uid, 'counters');
  const counts = { ...(card.ct ?? {}) };
  const rival = kind === 'p' ? 'm' : kind === 'm' ? 'p' : null;
  let amount = delta;
  if (rival && amount > 0 && counts[rival] > 0) {
    const cancelled = Math.min(amount, counts[rival]);
    counts[rival] -= cancelled;
    amount -= cancelled;
    if (!counts[rival]) delete counts[rival];
  }
  counts[kind] = Math.min(MAX_COUNT, Math.max(0, (counts[kind] ?? 0) + amount));
  if (!counts[kind]) delete counts[kind];
  return putBattlefield(game, at, with_(card, 'ct', counts, Object.keys(counts).length === 0));
}

// The power and toughness modifier you set by hand (a pump spell, an equipment): part is 'power' or 'toughness'. It is not a counter.
export function changeModifier(game, uid, part, delta) {
  if (part !== 'power' && part !== 'toughness') throw new Error('The modifier is for power or toughness.');
  wholeStep(delta, 'the modifier');
  const { card, at } = onBattlefield(game, uid, 'a modifier');
  const key = part === 'power' ? 'mp' : 'mt';
  const next = Math.min(MAX_MODIFIER, Math.max(-MAX_MODIFIER, (card[key] ?? 0) + delta));
  return putBattlefield(game, at, with_(card, key, next, next === 0));
}

export function resetModifier(game, uid) {
  const { card, at } = onBattlefield(game, uid, 'a modifier');
  return putBattlefield(game, at, with_(with_(card, 'mp', 0, true), 'mt', 0, true));
}

// What the counters and the modifier add up to: { power, toughness } as changes to the printed values (+2 and +1 shows as +2/+1).
export function netChange(card) {
  const counters = card?.ct ?? {};
  const plusMinus = (counters.p ?? 0) - (counters.m ?? 0);
  return { power: (card?.mp ?? 0) + plusMinus, toughness: (card?.mt ?? 0) + plusMinus };
}

// A short note on a card ('' takes it off). Invisible characters are removed, like in names.
export function setNote(game, uid, text) {
  const note = scrubText(String(text ?? ''));
  if (note.length > MAX_NOTE) throw new Error(`A note is at most ${MAX_NOTE} characters.`);
  const { card, at } = onBattlefield(game, uid, 'a note');
  return putBattlefield(game, at, with_(card, 'nt', note, note === ''));
}

export function setFaceDown(game, uid, down) {
  const { card, at } = onBattlefield(game, uid, 'a face-down state');
  return putBattlefield(game, at, with_(card, 'faceDown', true, !down));
}

// Makes a token on the battlefield. spec: { n: name, i: the Scryfall id of the token (its picture), tt: its type line, pt: 'P/T'
// (optional), cl: colors such as 'RG' (optional) }. Returns { game, uid }. A token is a card with tok: true; its type line is its t.
export function createToken(game, spec) {
  const text = (value, what) => {
    const clean = scrubText(String(value ?? ''));
    if (clean.length === 0 || clean.length > MAX_TOKEN_TEXT) throw new Error(`A token's ${what} is 1 to ${MAX_TOKEN_TEXT} characters.`);
    return clean;
  };
  const n = text(spec?.n, 'name');
  const t = text(spec?.tt, 'type line');
  if (typeof spec?.i !== 'string' || !SCRYFALL_ID.test(spec.i)) throw new Error('A token needs the Scryfall id of its picture.');
  if (spec.pt !== undefined && !(typeof spec.pt === 'string' && TOKEN_POWER_TOUGHNESS.test(spec.pt))) throw new Error('A token\'s power and toughness look like 2/2.');
  if (spec.cl !== undefined && !(typeof spec.cl === 'string' && TOKEN_COLORS.test(spec.cl))) throw new Error('A token\'s colors are letters from WUBRG.');
  if (game.zones.battlefield.length >= MAX_ZONE_CARDS) throw new Error(`The battlefield holds at most ${MAX_ZONE_CARDS} cards.`);
  const uid = `c${game.nextUid}`;
  const token = { uid, i: spec.i, n, t, m: '', k: [], tok: true, ...(spec.pt ? { pt: spec.pt } : {}), ...(spec.cl ? { cl: spec.cl } : {}), tapped: false, turnEntered: game.turn };
  return { game: { ...game, zones: { ...game.zones, battlefield: [...game.zones.battlefield, token] }, nextUid: game.nextUid + 1 }, uid };
}

// A copy of a permanent on the battlefield, as a token (what it looks like and is called; no counters, no modifier). Returns { game, uid }.
export function copyAsToken(game, uid) {
  const { card } = onBattlefield(game, uid, 'a copy');
  if (game.zones.battlefield.length >= MAX_ZONE_CARDS) throw new Error(`The battlefield holds at most ${MAX_ZONE_CARDS} cards.`);
  const copyUid = `c${game.nextUid}`;
  const copy = { uid: copyUid, i: card.i, ...(card.p ? { p: card.p } : {}), n: card.n, t: card.t, m: card.m, k: card.k, tok: true, ...(card.pt ? { pt: card.pt } : {}), ...(card.cl ? { cl: card.cl } : {}), tapped: false, turnEntered: game.turn };
  return { game: { ...game, zones: { ...game.zones, battlefield: [...game.zones.battlefield, copy] }, nextUid: game.nextUid + 1 }, uid: copyUid };
}

// Counters on the player: poison, energy and experience (0 to MAX_COUNT), and commander damage taken from the commander of seat 1 to 4.
// Only counts above 0 are stored (game.pc and game.cd).
const bumped = (table, key, delta, what) => {
  wholeStep(delta, what);
  const next = { ...(table ?? {}) };
  next[key] = Math.min(MAX_COUNT, Math.max(0, (next[key] ?? 0) + delta));
  if (!next[key]) delete next[key];
  return next;
};
export function changePlayerCounter(game, kind, delta) {
  if (!PLAYER_COUNTERS.includes(kind)) throw new Error('That is not a counter a player can have.');
  const pc = bumped(game.pc, kind, delta, 'a counter');
  const { pc: _old, ...rest } = game;
  return Object.keys(pc).length ? { ...rest, pc } : rest;
}
export function changeCommanderDamage(game, seat, delta) {
  if (!COMMANDER_SEATS.includes(seat)) throw new Error('Commander damage comes from a seat from 1 to 4.');
  const cd = bumped(game.cd, seat, delta, 'commander damage');
  const { cd: _old, ...rest } = game;
  return Object.keys(cd).length ? { ...rest, cd } : rest;
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
      if ('p' in card && !(typeof card.p === 'string' && SCRYFALL_ID.test(card.p))) problems.push(`card ${card.uid} has a printing that is not an id`);
      if (zone !== 'battlefield' && (card.tapped || card.turnEntered !== null)) problems.push(`card ${card.uid} is tapped or has an entry turn outside the battlefield`);
      if (zone === 'battlefield' && !Number.isInteger(card.turnEntered)) problems.push(`battlefield card ${card.uid} has no entry turn`);
      if (zone !== 'battlefield') {
        for (const key of [...BATTLEFIELD_STATE, 'tok', 'pt', 'cl']) if (key in card) problems.push(`card ${card.uid} has ${key} outside the battlefield`);
      }
      if ('ct' in card) {
        const counts = card.ct;
        const keys = counts && typeof counts === 'object' && !Array.isArray(counts) ? Object.keys(counts) : null;
        if (!keys || keys.length === 0) problems.push(`card ${card.uid} has an empty or damaged counters field`);
        else {
          for (const key of keys) if (!COUNTER_KINDS.includes(key) || !Number.isInteger(counts[key]) || counts[key] < 1 || counts[key] > MAX_COUNT) problems.push(`card ${card.uid} has a damaged ${key} counter`);
          if (counts.p && counts.m) problems.push(`card ${card.uid} has both +1/+1 and -1/-1 counters`);
        }
      }
      for (const key of ['mp', 'mt']) {
        if (key in card && !(Number.isInteger(card[key]) && card[key] !== 0 && Math.abs(card[key]) <= MAX_MODIFIER)) problems.push(`card ${card.uid} has a damaged ${key}`);
      }
      if ('nt' in card && !(typeof card.nt === 'string' && card.nt.length > 0 && card.nt.length <= MAX_NOTE)) problems.push(`card ${card.uid} has a damaged note`);
      if ('faceDown' in card && card.faceDown !== true) problems.push(`card ${card.uid} has a damaged face-down mark`);
      if ('tok' in card && card.tok !== true) problems.push(`card ${card.uid} has a damaged token mark`);
      if (('pt' in card || 'cl' in card) && card.tok !== true) problems.push(`card ${card.uid} has token fields but is not a token`);
      if ('pt' in card && !(typeof card.pt === 'string' && TOKEN_POWER_TOUGHNESS.test(card.pt))) problems.push(`token ${card.uid} has a damaged power and toughness`);
      if ('cl' in card && !(typeof card.cl === 'string' && TOKEN_COLORS.test(card.cl))) problems.push(`token ${card.uid} has damaged colors`);
    }
  }
  if ('pc' in game) {
    const ok = game.pc && typeof game.pc === 'object' && !Array.isArray(game.pc) && Object.keys(game.pc).length > 0 && Object.entries(game.pc).every(([key, value]) => PLAYER_COUNTERS.includes(key) && Number.isInteger(value) && value >= 1 && value <= MAX_COUNT);
    if (!ok) problems.push('the player counters are damaged');
  }
  if ('cd' in game) {
    const ok = game.cd && typeof game.cd === 'object' && !Array.isArray(game.cd) && Object.keys(game.cd).length > 0 && Object.entries(game.cd).every(([key, value]) => COMMANDER_SEATS.includes(key) && Number.isInteger(value) && value >= 1 && value <= MAX_COUNT);
    if (!ok) problems.push('the commander damage is damaged');
  }
  for (const key of Object.keys(game.zones)) if (!ZONES.includes(key)) problems.push(`unknown zone ${key}`);
  if (!Number.isInteger(game.life) || Math.abs(game.life) > MAX_LIFE) problems.push('life is not a whole number within the limit');
  if (!Number.isInteger(game.turn) || game.turn < 1) problems.push('the turn is not a whole number from 1');
  if (!Number.isInteger(game.mulligans) || game.mulligans < 0) problems.push('mulligans is not a whole number from 0');
  return problems.slice(0, 20);
}
