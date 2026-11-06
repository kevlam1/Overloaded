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
import { ZONES, MAX_LIFE, COUNTER_KINDS, MAX_COUNT, MAX_MODIFIER, MAX_NOTE, MAX_TOKEN_TEXT, PLAYER_COUNTERS, COMMANDER_SEATS, TOKEN_POWER_TOUGHNESS, TOKEN_COLORS } from './zones.mjs';

export const PUBLIC_ZONES = ['battlefield', 'graveyard', 'exile', 'command'];
export const PRIVATE_ZONES = ['library', 'hand', 'sideboard'];
export const MAX_CARDS_PER_ZONE = 250;

const UID = /^c[1-9][0-9]{0,5}$/;
const SCRYFALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_NAME = 200;
const MAX_TURN = 100000;

export function packCard(card) {
  return {
    u: card.uid,
    i: card.i,
    ...(card.p ? { p: card.p } : {}),
    n: card.n,
    ...(card.tapped ? { x: 1 } : {}),
    ...(Number.isInteger(card.turnEntered) ? { e: card.turnEntered } : {}),
    // docs/tokens-counters.md: a token carries its own type line (it is not in the card list), counters, the modifier, a note and face-down.
    ...(card.tok ? { tok: 1, tt: card.t, ...(card.pt ? { pt: card.pt } : {}), ...(card.cl ? { cl: card.cl } : {}) } : {}),
    ...(card.ct ? { ct: { ...card.ct } } : {}),
    ...(card.mp ? { mp: card.mp } : {}),
    ...(card.mt ? { mt: card.mt } : {}),
    ...(card.faceDown ? { f: 1 } : {}),
    ...(card.turned ? { bk: 1 } : {}), // the other face of a two-sided card shows; whether the card HAS one (b) comes from each page's card list
    ...(card.nt ? { nt: card.nt } : {}),
  };
}

// The counters object of a stored card: only the fixed kinds, whole numbers 1 to MAX_COUNT, at least one, never +1/+1 and -1/-1 together.
const validCounters = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0 || !keys.every((key) => COUNTER_KINDS.includes(key) && Number.isInteger(value[key]) && value[key] >= 1 && value[key] <= MAX_COUNT)) return false;
  return !(value.p && value.m);
};
// A table of counts with only the allowed keys and valid whole numbers 1 to MAX_COUNT (anything else is dropped).
const cleanCounts = (value, allowed) => Object.fromEntries(Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
  .filter(([key, count]) => allowed.includes(key) && Number.isInteger(count) && count >= 1 && count <= MAX_COUNT));

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
  if ('tok' in raw && raw.tok !== 1) return null;
  const token = raw.tok === 1;
  if (token) {
    if (typeof raw.tt !== 'string' || raw.tt.length === 0 || raw.tt.length > MAX_TOKEN_TEXT) return null;
    if ('pt' in raw && !(typeof raw.pt === 'string' && TOKEN_POWER_TOUGHNESS.test(raw.pt))) return null;
    if ('cl' in raw && !(typeof raw.cl === 'string' && TOKEN_COLORS.test(raw.cl))) return null;
  } else if ('tt' in raw || 'pt' in raw || 'cl' in raw) return null; // token fields on a card that is not a token
  if ('ct' in raw && !validCounters(raw.ct)) return null;
  for (const key of ['mp', 'mt']) if (key in raw && !(Number.isInteger(raw[key]) && raw[key] !== 0 && Math.abs(raw[key]) <= MAX_MODIFIER)) return null;
  if ('f' in raw && raw.f !== 1) return null;
  if ('bk' in raw && raw.bk !== 1) return null;
  if ('nt' in raw && !(typeof raw.nt === 'string' && raw.nt.length > 0 && raw.nt.length <= MAX_NOTE)) return null;
  // A real card's type, cost and keywords come from the card list. A token's type line is stored with it (a token is not in the list),
  // but its cost and keywords are still looked up BY ID ONLY: a copy of a real card has that card's id and so keeps them, a token picture
  // is not in the list and gets none, and a token that merely shares a name with a real card (87 names do) is never matched by name.
  const known = lookup(token ? { i: raw.i, n: '' } : { i: raw.i, n: raw.n }) ?? {};
  return {
    uid: raw.u,
    i: raw.i,
    ...(raw.p ? { p: raw.p } : {}),
    n: raw.n,
    t: token ? raw.tt : (typeof known.t === 'string' ? known.t : ''),
    m: token && raw.bk === 1 ? '' : typeof known.m === 'string' ? known.m : '', // a copy of a back face has no cost (the list's cost is the front's)
    k: Array.isArray(known.k) ? known.k : [],
    // A back face exists only when this page's card list says so (by id, never for a token): a stored turned-over mark on any
    // other card is ignored, so another player cannot make an ordinary card show a back picture it does not have.
    ...(!token && known.b === 1 ? { b: 1, ...(known.md === 1 ? { md: 1 } : {}), ...(raw.bk === 1 ? { turned: true } : {}) } : {}),
    // A token that copies a turned-over card shows the back picture of the card it copies. It is no two-sided card (no b), so the mark
    // means only "draw the back picture"; a card that has no such picture shows its name instead.
    ...(token && raw.bk === 1 ? { turned: true } : {}),
    ...(token ? { tok: true, ...(raw.pt ? { pt: raw.pt } : {}), ...(raw.cl ? { cl: raw.cl } : {}) } : {}),
    ...('ct' in raw ? { ct: { ...raw.ct } } : {}),
    ...('mp' in raw ? { mp: raw.mp } : {}),
    ...('mt' in raw ? { mt: raw.mt } : {}),
    ...(raw.f === 1 ? { faceDown: true } : {}),
    ...(raw.nt ? { nt: raw.nt } : {}),
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
      ...(game.pc ? { pc: { ...game.pc } } : {}), // poison, energy, experience: only counts above 0 are stored
      ...(game.cd ? { cd: { ...game.cd } } : {}), // commander damage by seat
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
    ...(Object.keys(cleanCounts(storedPublic.pc, PLAYER_COUNTERS)).length ? { pc: cleanCounts(storedPublic.pc, PLAYER_COUNTERS) } : {}),
    ...(Object.keys(cleanCounts(storedPublic.cd, COMMANDER_SEATS)).length ? { cd: cleanCounts(storedPublic.cd, COMMANDER_SEATS) } : {}),
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
    pc: cleanCounts(stored.pc, PLAYER_COUNTERS), // always an object; only valid kinds with whole counts from 1 to the number limit survive
    cd: cleanCounts(stored.cd, COMMANDER_SEATS),
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
  for (const key of ['pc', 'cd']) put(`public/${uid}/${key}`, now.public[key] ?? null, then ? (then.public[key] ?? null) : undefined);
  for (const zone of PUBLIC_ZONES) put(`public/${uid}/${zone}`, now.public[zone].length ? now.public[zone] : null, then ? (then.public[zone].length ? then.public[zone] : null) : undefined);
  for (const zone of PRIVATE_ZONES) put(`private/${uid}/${zone}`, now.private[zone].length ? now.private[zone] : null, then ? (then.private[zone].length ? then.private[zone] : null) : undefined);
  return writes;
}
