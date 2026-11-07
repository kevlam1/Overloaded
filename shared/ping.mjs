// Pinging a card: showing one of your cards to the whole table (Kevin, 2026-11-06). Plain logic with no browser or network code, so Node tests can load it
// (scripts/test-ping.mjs). The pages draw the spotlight and the glow and send the record.
//
// THE DESIGN. A player can only write their own branch, so a ping is ONE small record on the pinger's own public branch: ping = { k, card }. card is the pinged card
// packed exactly as a game card is stored (shared/game-sync.mjs packCard), so it is read back with the same strict reader. k is a number that is different for every ping
// of that player (seconds since 1970, or one more than the player's last ping if two come in the same second). Every page already reads everyone's public branch, so every
// page sees the record; a page shows a ping when its k is different from the last k it saw for that player. The first snapshot after a page loads is only remembered, never
// shown, so an old ping does not come back after a refresh. Only cards in public zones can be pinged (battlefield, graveyard, exile, command zone): they are already visible
// to everyone, so a ping reveals nothing new. A card in the hand or the library cannot be pinged.
import { packCard, unpackCard } from './game-sync.mjs';
import { NUMBER_LIMIT } from './zones.mjs';

export const PING_ZONES = ['battlefield', 'graveyard', 'exile', 'command'];
export const canPing = (zone) => PING_ZONES.includes(zone);

// The number for a new ping: the time in whole seconds, or one more than this player's previous ping when that is later (two pings in the same second).
export function pingKey(previous = 0, nowMs = Date.now()) {
  const before = Number.isInteger(previous) && previous > 0 ? previous : 0;
  const key = Math.max(before + 1, Math.floor(nowMs / 1000));
  if (!Number.isSafeInteger(key) || key > NUMBER_LIMIT) throw new Error('That ping cannot be sent: the clock is wrong.');
  return key;
}

// The record to write for pinging `card` in `zone`. Throws, in words, for a card that cannot be pinged.
export function makePing(card, zone, { previous = 0, now = Date.now() } = {}) {
  if (!canPing(zone)) throw new Error('Only a card on the battlefield, in the graveyard, in exile or in the command zone can be pinged.');
  if (!card || typeof card !== 'object') throw new Error('That is not a card.');
  const packed = packCard(card);
  if (unpackCard(packed) === null) throw new Error(`${card.n ?? 'That card'} cannot be pinged: it is not stored in a form the table can read.`);
  return { k: pingKey(previous, now), card: packed };
}

// One stored ping read back, or null if it is not exactly a ping. lookup is the page's card list lookup (as for unpackCard). Everything here is another player's text.
export function readPing(stored, lookup) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
  if (!Number.isSafeInteger(stored.k) || stored.k < 1 || stored.k > NUMBER_LIMIT) return null;
  const card = unpackCard(stored.card, lookup);
  return card ? { k: stored.k, card } : null;
}

// Which pings are new. branches: every player's stored public branch ({ uid: branch }). seen: { uid: k } of what was seen before, or null for the FIRST snapshot after
// the page loaded (those pings are only remembered). Returns { shown, seen }: shown is a list of { uid, k, card } for pings whose k is not the one seen for that player,
// oldest first (by k, then uid), and seen is the new memory. A player with no ping, or a damaged one, shows nothing.
export function newPings(branches, seen, lookup) {
  const current = {};
  const found = [];
  for (const [uid, branch] of Object.entries(branches && typeof branches === 'object' ? branches : {})) {
    const ping = readPing(branch?.ping, lookup);
    if (!ping) continue;
    current[uid] = ping.k;
    found.push({ uid, k: ping.k, card: ping.card });
  }
  if (seen === null) return { shown: [], seen: current };
  const shown = found.filter((ping) => seen[ping.uid] !== ping.k).sort((a, b) => a.k - b.k || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  return { shown, seen: { ...seen, ...current } };
}

// The words for a ping, for the spotlight and for a screen reader: who pinged which card. seat is the player's seat ('1' to '4') or ''.
export const pingSentence = (name, seat, card) => `${seat ? `Seat ${seat}: ` : ''}${name} pinged ${card.n}.`;
