// How one player's game (shared/zones.mjs) is kept in the live database, and how it is read back. Plain functions with no
// browser or network code, so Node tests can load them (the page and shared/table-ops.mjs do the reading and writing).
//
// Under tables/CODE each player has two branches (docs/live-play.md):
//   public/{uid}:  life, turn, mulligans, next (the next card number), counts (how many cards are in each HIDDEN zone) and
//                  the zones everyone may see: battlefield, graveyard, exile, command. Every member reads it.
//   private/{uid}: library (in order), hand, sideboard. Only that player reads or writes it (the rules enforce it).
// A card is stored as { u, i, p?, n, x?, e? }: u its copy (the game's uid), i the card, p the printing whose picture to draw,
// n the name, x: 1 when tapped, e the turn it came to the battlefield. The type line, cost and keywords are NOT stored:
// every page looks them up in its own card list by i, like the solo table does. A zone is an array; an empty zone is stored
// as nothing (the database cannot hold an empty array), and a missing zone reads as empty.
// A move writes only the pieces that changed (gameWrites), never the whole game.
// Everything read from the database is untrusted (another player's browser wrote their public branch), so readCards drops
// any card that is not exactly this shape, and the picture ids must be Scryfall ids.
import { ZONES } from './zones.mjs';

export const PUBLIC_ZONES = ['battlefield', 'graveyard', 'exile', 'command'];
export const PRIVATE_ZONES = ['library', 'hand', 'sideboard'];
export const MAX_CARDS_PER_ZONE = 250;

const UID = /^c[1-9][0-9]{0,5}$/;
const SCRYFALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_NAME = 200;
const MAX_TURN = 100000;
const MAX_LIFE = 1000000;

export function packCard(card) {
  return {
    u: card.uid,
    i: card.i,
    ...(card.p ? { p: card.p } : {}),
    n: card.n,
    ...(card.tapped ? { x: 1 } : {}),
    ...(Number.isInteger(card.turnEntered) ? { e: card.turnEntered } : {}),
  };
}

// One stored card back to a game card, or null if it is not a card. lookup({ i, n }) gives { t, m, k } (what the card list
// knows) or null; a card the list does not know still plays, it just has no type.
export function unpackCard(raw, lookup = () => null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.u !== 'string' || !UID.test(raw.u)) return null;
  if (typeof raw.i !== 'string' || !SCRYFALL_ID.test(raw.i)) return null;
  if ('p' in raw && (typeof raw.p !== 'string' || !SCRYFALL_ID.test(raw.p))) return null;
  if (typeof raw.n !== 'string' || raw.n.length === 0 || raw.n.length > MAX_NAME) return null;
  if ('x' in raw && raw.x !== 1) return null;
  if ('e' in raw && !(Number.isInteger(raw.e) && raw.e >= 0 && raw.e <= MAX_TURN)) return null;
  const known = lookup({ i: raw.i, n: raw.n }) ?? {};
  return {
    uid: raw.u,
    i: raw.i,
    ...(raw.p ? { p: raw.p } : {}),
    n: raw.n,
    t: typeof known.t === 'string' ? known.t : '',
    m: typeof known.m === 'string' ? known.m : '',
    k: Array.isArray(known.k) ? known.k : [],
    tapped: raw.x === 1,
    turnEntered: 'e' in raw ? raw.e : null,
  };
}

// A stored zone (an array, or the object Firebase gives back for a list) to game cards. Cards that are not cards are dropped,
// and a zone is cut at MAX_CARDS_PER_ZONE, so a damaged or hostile branch cannot make a page build thousands of cards.
export function readCards(stored, lookup) {
  const list = Array.isArray(stored) ? stored : (stored && typeof stored === 'object' ? Object.keys(stored).sort((a, b) => Number(a) - Number(b)).map((key) => stored[key]) : []);
  const cards = [];
  for (const raw of list.slice(0, MAX_CARDS_PER_ZONE)) {
    const card = unpackCard(raw, lookup);
    if (card) cards.push(card);
  }
  return cards;
}

const whole = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;

// A game into its two branches, as plain values ready to be written (empty zones as empty arrays here; gameWrites turns them
// into "nothing").
export function splitGame(game) {
  const counts = Object.fromEntries(PRIVATE_ZONES.map((zone) => [zone, game.zones[zone].length]));
  return {
    public: {
      life: game.life, turn: game.turn, mulligans: game.mulligans, next: game.nextUid, counts,
      ...Object.fromEntries(PUBLIC_ZONES.map((zone) => [zone, game.zones[zone].map(packCard)])),
    },
    private: Object.fromEntries(PRIVATE_ZONES.map((zone) => [zone, game.zones[zone].map(packCard)])),
  };
}

// The two stored branches (as read from the database, either may be missing) back to one game. Returns null when there is no
// public branch (nothing was ever saved). Used when a player comes back to their table: they get their own game back.
export function joinGame(storedPublic, storedPrivate, lookup) {
  if (!storedPublic || typeof storedPublic !== 'object') return null;
  const zones = Object.fromEntries(ZONES.map((zone) => [zone, []]));
  for (const zone of PUBLIC_ZONES) zones[zone] = readCards(storedPublic[zone], lookup);
  for (const zone of PRIVATE_ZONES) zones[zone] = readCards(storedPrivate?.[zone], lookup);
  const used = ZONES.flatMap((zone) => zones[zone].map((card) => Number(card.uid.slice(1))));
  const nextUid = whole(storedPublic.next, 1, 1e9) ? Math.max(storedPublic.next, ...used.map((n) => n + 1)) : Math.max(1, ...used.map((n) => n + 1));
  return {
    zones,
    life: whole(storedPublic.life, -MAX_LIFE, MAX_LIFE) ? storedPublic.life : 20,
    turn: whole(storedPublic.turn, 1, MAX_TURN) ? storedPublic.turn : 1,
    mulligans: whole(storedPublic.mulligans, 0, 1000) ? storedPublic.mulligans : 0,
    nextUid,
  };
}

// What another player's public branch shows: { life, turn, counts: { library, hand, sideboard }, zones: { battlefield,
// graveyard, exile, command } } or null. Safe to draw: numbers are checked and every card has the exact shape.
export function readPublic(stored, lookup) {
  if (!stored || typeof stored !== 'object') return null;
  const count = (value) => (whole(value, 0, 100000) ? value : 0);
  return {
    life: whole(stored.life, -MAX_LIFE, MAX_LIFE) ? stored.life : 0,
    turn: whole(stored.turn, 1, MAX_TURN) ? stored.turn : 1,
    counts: Object.fromEntries(PRIVATE_ZONES.map((zone) => [zone, count(stored.counts?.[zone])])),
    zones: Object.fromEntries(PUBLIC_ZONES.map((zone) => [zone, readCards(stored[zone], lookup)])),
  };
}

// The writes for a move: a map from a path under tables/CODE to its new value, holding only the pieces that differ between
// `before` and `after` (both games, or `before` null to write everything). An empty zone is written as null (deleted).
// life, turn, mulligans, next and the hidden counts are separate small pieces; each zone is one piece.
export function gameWrites(uid, before, after) {
  const now = splitGame(after);
  const then = before ? splitGame(before) : null;
  const writes = {};
  const put = (path, value, old) => {
    if (JSON.stringify(value) !== JSON.stringify(old)) writes[path] = value;
  };
  for (const key of ['life', 'turn', 'mulligans', 'next']) put(`public/${uid}/${key}`, now.public[key], then?.public[key]);
  for (const zone of PRIVATE_ZONES) put(`public/${uid}/counts/${zone}`, now.public.counts[zone], then?.public.counts[zone]);
  for (const zone of PUBLIC_ZONES) put(`public/${uid}/${zone}`, now.public[zone].length ? now.public[zone] : null, then ? (then.public[zone].length ? then.public[zone] : null) : undefined);
  for (const zone of PRIVATE_ZONES) put(`private/${uid}/${zone}`, now.private[zone].length ? now.private[zone] : null, then ? (then.private[zone].length ? then.private[zone] : null) : undefined);
  return writes;
}
