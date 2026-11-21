// The game history of the live table (Kevin, 2026-11-20: "everyone's moves"): what each player did, in order, seen by the whole table. Plain logic with no browser code (scripts/test-live-history.mjs).
//
// SAFETY: an entry is worked out from what CHANGED in the game (describeMove), never from the line the page shows its own player, because that line names hidden cards ("Drew Sol Ring.").
// A card is named only when it is seen by everyone: when it comes from or goes to a public zone (the battlefield, the graveyard, the exile, the command zone) face up. A card that goes between the
// library and the hand, or is moved inside the library, is only counted ("drew 2 cards").
//
// STORAGE: each player writes only their own branch, so each keeps their last LOG_SLOTS entries at public/{uid}/log/{slot}: { k, t, n, at } (k counts that player's entries from 1, slot = k % LOG_SLOTS,
// t the text, n the turn, at the database's time). The text says {their} and {has} where the words depend on who reads it (your / their, have / has); mergeHistory fills them in.
export const LOG_SLOTS = 30;
export const MAX_TEXT = 120;
const PUBLIC = new Set(['battlefield', 'graveyard', 'exile', 'command']);
const WORDS = { library: '{their} library', hand: '{their} hand', battlefield: 'the battlefield', graveyard: '{their} graveyard', exile: 'exile', command: 'the command zone', sideboard: '{their} sideboard' };
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

// Where every card of a game is: uid -> { zone, card }.
function placesOf(game) {
  const places = new Map();
  for (const [zone, cards] of Object.entries(game?.zones ?? {})) for (const card of cards ?? []) places.set(card.uid, { zone, card });
  return places;
}
// The name of a card as the table may see it in this zone, or null when it must not be named.
function shownName(card, zone) {
  if (!card || !PUBLIC.has(zone) || card.faceDown) return null;
  return typeof card.n === 'string' && card.n ? card.n : null;
}
// (the card as it is now, in the zone it went to, and as it was, in the zone it left: a face-down card on the battlefield is not named as it leaves)
const named = ({ was, now }, from, to) => shownName(now, to) ?? shownName(was, from);

// One move of one card (or of several cards the same way) in words. pairs: [{ was, now }] (either may be missing: a card made, or a token gone).
function moveWords({ from, to, pairs }) {
  const cards = pairs.map((pair) => pair.now ?? pair.was);
  const count = cards.length;
  const names = pairs.map((pair) => named(pair, from, to));
  const one = count === 1 ? names[0] : null;
  const what = one ?? (names.every(Boolean) && count <= 3 ? names.join(', ') : count === 1 ? 'a card' : plural(count, 'card', 'cards'));
  if (from === null) return cards.every((card) => card.em) ? `created ${what}` : cards.every((card) => card.tok) ? `created ${count === 1 && one ? `a ${one} token` : plural(count, 'token', 'tokens')}` : `put ${what} onto ${WORDS[to] ?? to}`;
  if (to === null) return `removed ${count === 1 && one ? `the ${one} token` : plural(count, 'token', 'tokens')}`;
  if (from === 'library' && to === 'hand') return `drew ${plural(count, 'card', 'cards')}`;
  if (from === 'hand' && to === 'battlefield') return `played ${what}`;
  if (from === 'command' && to === 'battlefield') return `played ${what} from the command zone`;
  if (from === 'hand' && to === 'graveyard') return `discarded ${what}`;
  if (from === 'library' && to === 'graveyard') return `milled ${what}`;
  if (to === 'exile') return `exiled ${what}${from === 'battlefield' ? '' : ` from ${WORDS[from] ?? from}`}`;
  if (to === 'hand') return `returned ${what} to {their} hand${from === 'battlefield' ? '' : ` from ${WORDS[from] ?? from}`}`;
  return `put ${what} from ${WORDS[from] ?? from} into ${WORDS[to] ?? to}`;
}

// What changed between two games of one player, as one line in the words above, or '' when nothing the table should hear about changed (a card moved on the grid, the hand put in another order).
// note: what the page knows that the games do not say ('shuffle' when the library was shuffled). seatName(seat): a player's name for commander damage.
export function describeMove(before, after, { note = null, seatName = (seat) => `seat ${seat}` } = {}) {
  if (!before || !after) return '';
  const parts = [];
  if ((after.mulligans ?? 0) > (before.mulligans ?? 0)) parts.push(`took a mulligan (${after.mulligans})`);
  const was = placesOf(before);
  const now = placesOf(after);
  // moves between zones, grouped by where from and where to (the cards of a mulligan are not listed: the mulligan says it)
  const groups = new Map();
  if (!parts.length) {
    for (const uid of new Set([...was.keys(), ...now.keys()])) {
      const from = was.get(uid)?.zone ?? null;
      const to = now.get(uid)?.zone ?? null;
      if (from === to) continue;
      const key = `${from}>${to}`;
      if (!groups.has(key)) groups.set(key, { from, to, pairs: [] });
      groups.get(key).pairs.push({ was: was.get(uid)?.card ?? null, now: now.get(uid)?.card ?? null });
    }
    for (const group of groups.values()) parts.push(moveWords(group));
  }
  // cards that stayed on the battlefield and changed
  const tapped = []; const untapped = []; const other = [];
  for (const [uid, { zone, card }] of now) {
    const old = was.get(uid);
    if (!old || old.zone !== zone || zone !== 'battlefield') continue;
    const name = shownName(card, zone) ?? 'a face-down card';
    if (Boolean(card.tapped) !== Boolean(old.card.tapped)) (card.tapped ? tapped : untapped).push(name);
    if (Boolean(card.faceDown) !== Boolean(old.card.faceDown)) other.push(card.faceDown ? `turned ${shownName(old.card, zone) ?? 'a card'} face down` : `turned ${name} face up`);
    if (Boolean(card.turned) !== Boolean(old.card.turned)) other.push(`turned ${name} over`);
    if (JSON.stringify(card.ct ?? {}) !== JSON.stringify(old.card.ct ?? {}) || (card.mp ?? 0) !== (old.card.mp ?? 0) || (card.mt ?? 0) !== (old.card.mt ?? 0)) other.push(`changed the counters on ${name}`);
  }
  if (tapped.length) parts.push(`tapped ${tapped.length <= 2 ? tapped.join(' and ') : plural(tapped.length, 'card', 'cards')}`);
  if (untapped.length) parts.push(`untapped ${untapped.length <= 2 ? untapped.join(' and ') : plural(untapped.length, 'card', 'cards')}`);
  parts.push(...other.slice(0, 2));
  if (other.length > 2) parts.push(`changed ${other.length - 2} more cards`);
  // the library put in another order with the same cards (a shuffle, or cards put back on top or bottom): never which cards
  const order = (game) => (game.zones?.library ?? []).map((card) => card.uid).join();
  if (!groups.size && !parts.some((part) => part.startsWith('took a mulligan')) && order(before) !== order(after)) parts.push(note === 'shuffle' ? 'shuffled {their} library' : 'rearranged {their} library');
  else if (note === 'shuffle' && !parts.some((part) => part.startsWith('took a mulligan'))) parts.push('shuffled {their} library');
  // life, counters, commander damage, the turn
  if (after.life !== before.life) parts.push(`went from ${before.life} to ${after.life} life`);
  for (const [kind, count] of Object.entries(after.pc ?? {})) if ((before.pc?.[kind] ?? 0) !== count) parts.push(`{has} ${count} ${kind}`);
  for (const kind of Object.keys(before.pc ?? {})) if (!(kind in (after.pc ?? {}))) parts.push(`{has} no ${kind}`);
  for (const seat of new Set([...Object.keys(before.cd ?? {}), ...Object.keys(after.cd ?? {})])) {
    const change = (after.cd?.[seat] ?? 0) - (before.cd?.[seat] ?? 0);
    if (change) parts.push(`${change > 0 ? 'took' : 'removed'} ${Math.abs(change)} commander damage from ${seatName(seat)} (${after.cd?.[seat] ?? 0} in all)`);
  }
  if (after.pass && (!before.pass || after.pass.n > before.pass.n)) parts.push('passed the turn');
  else if (before.pass && (!after.pass || after.pass.n < before.pass.n)) parts.push('took back the pass');
  return cleanText(parts.join('; '));
}

// The text as stored: control characters become spaces, runs of spaces one, cut to MAX_TEXT.
export function cleanText(value) {
  if (typeof value !== 'string') return '';
  let out = '';
  for (const ch of value) { const code = ch.codePointAt(0); out += code < 32 || code === 127 ? ' ' : ch; }
  return out.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

// The slot an entry goes in, and the entry itself (at: the database's time placeholder the page passes in).
export const slotFor = (k) => String(k % LOG_SLOTS);
export const makeEntry = ({ k, text, turn, at }) => ({ k, t: cleanText(text), n: Number.isInteger(turn) && turn >= 1 ? turn : 1, at });

// A stored log (another player's browser wrote it) to clean entries, oldest first: { k, t, n, at } with whole numbers and text, anything else dropped.
export function readLog(stored) {
  if (!stored || typeof stored !== 'object') return [];
  const entries = [];
  for (const value of Object.values(stored)) {
    if (!value || typeof value !== 'object') continue;
    const { k, t, n, at } = value;
    if (!Number.isInteger(k) || k < 1 || typeof t !== 'string' || !t || !Number.isFinite(at) || at <= 0) continue;
    entries.push({ k, t: cleanText(t), n: Number.isInteger(n) && n >= 1 ? n : 1, at });
  }
  return entries.sort((a, b) => a.at - b.at || a.k - b.k).slice(-LOG_SLOTS);
}
export const lastK = (stored) => readLog(stored).reduce((max, entry) => Math.max(max, entry.k), 0);

// Everyone's entries for this match as one list, oldest first, at most `limit`: { turn, text, mine, at }. branches: uid -> public branch; names: uid -> name; me: your uid.
export function mergeHistory(branches, { names = {}, me = null, match = null, limit = 200 } = {}) {
  const all = [];
  for (const [uid, branch] of Object.entries(branches ?? {})) {
    if (match !== null && branch?.match !== match) continue;
    const mine = uid === me;
    const who = mine ? 'You' : (typeof names[uid] === 'string' && names[uid] ? names[uid] : 'A player');
    for (const entry of readLog(branch?.log)) {
      const text = entry.t.replaceAll('{their}', mine ? 'your' : 'their').replaceAll('{has}', mine ? 'have' : 'has');
      all.push({ turn: entry.n, text: `${who} ${text}.`, mine, at: entry.at, k: entry.k });
    }
  }
  return all.sort((a, b) => a.at - b.at || a.k - b.k).slice(-limit).map(({ turn, text, mine, at }) => ({ turn, text, mine, at }));
}
