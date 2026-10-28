// What the page does with a table: find your table, create one, join one, rejoin, watch the players.
// The database functions are PASSED IN (`sdk`), so this file imports no Firebase code. That keeps the logic in one place
// for the page and for the tests that run it against the local emulator, and means changing the database service
// means rewriting only the wiring in frontend/src/db.js.
//
// What the rules (backend/database.rules.json) allow shapes the code here:
// - a table is created in ONE write: meta, the first heartbeat, your member entry, seat 1 and your host slot;
// - joining is one write that takes a free seat and creates your member entry (a taken seat refuses the whole write);
// - a person who is not at the table cannot read it, so joining tries seats one at a time;
// - a host holds one table at a time: making a new one deletes the old one in the same write.
// No browser-only or server-only code here, so Node tests can load it.
import { makeTableCode, isValidCode } from './table-code.mjs';
import { cleanPlayerName } from './player-name.mjs';
import { isPermissionDenied } from './permission-error.mjs';

export const LOBBY_IDLE_MS = 30 * 60 * 1000; // must equal the lobby idle limit in the rules
export const PLAYING_IDLE_MS = 60 * 60 * 1000; // must equal the playing idle limit in the rules
export const SEAT_COUNTS = [2, 3, 4];
export const MAX_SEATS = 4;
const CREATE_ATTEMPTS = 5;

export class TableUnavailableError extends Error {
  constructor() {
    super('Could not join that table. It may not exist, may be full, may have started, or may have closed.');
    this.name = 'TableUnavailableError';
  }
}

// The page's own "no" (as opposed to the database's): who may do this, and when, in words a player can read.
export class FlowRefusedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FlowRefusedError';
  }
}

// sdk:    { ref, get, update, onValue, serverTimestamp } from the database library
// db:     the database to use
// getUid: () => Promise<string>, the signed-in person's id
// makeCode: replaceable in tests
export function createTableOps({ sdk, db, getUid, makeCode = makeTableCode }) {
  const { ref, get, update, onValue, serverTimestamp } = sdk;

  // The host's current table, if it still exists: { code, players }. A host holds one table at a time.
  async function findMyTable() {
    const uid = await getUid();
    const code = (await get(ref(db, `hosts/${uid}`))).val();
    if (!code) return null;
    try {
      // Read the parts a member may read. Reading the whole table at once is refused for everyone on purpose (it
      // would include other players' private cards), so asking for it here always failed and no one was ever
      // warned before their old table was closed (found by the spike on 2026-10-28).
      const [meta, members] = await Promise.all([get(ref(db, `tables/${code}/meta`)), get(ref(db, `tables/${code}/members`))]);
      // The host slot can outlive its table (the table closed or was deleted). Then there is nothing to warn about.
      if (!meta.exists()) return null;
      return { code, players: Object.keys(members.val() ?? {}).length };
    } catch (error) {
      if (isPermissionDenied(error)) return null; // not readable: the table is gone or is not ours any more
      throw error;
    }
  }

  // Creates a table and takes seat 1. If the host already holds a table, it is deleted in the same write.
  // The page should warn first (findMyTable); this function does what it is told.
  async function createTable({ name, seats = 4, format = 'commander' }) {
    const playerName = cleanPlayerName(name);
    if (!SEAT_COUNTS.includes(seats)) throw new Error('A table has 2, 3 or 4 seats.');
    const uid = await getUid();
    const oldCode = (await get(ref(db, `hosts/${uid}`))).val();

    for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
      const code = makeCode();
      const table = `tables/${code}`;
      const writes = {
        [`${table}/meta`]: { host: uid, createdAt: serverTimestamp(), seats, format, status: 'lobby', idleLimit: LOBBY_IDLE_MS, match: 1 },
        [`${table}/activity/lastActive`]: serverTimestamp(),
        [`${table}/members/${uid}`]: { name: playerName, seat: '1' },
        [`${table}/seats/1`]: uid,
        [`hosts/${uid}`]: code,
      };
      // With an old slot there are two writes to try. First one that also deletes the old table. If the old table is
      // already gone (it expired and was cleaned up) the rules refuse that delete, but accept the same write without
      // it, so try that second (found by the table logic test on 2026-10-28: a stale slot made every attempt fail).
      const variants = oldCode ? [{ ...writes, [`tables/${oldCode}`]: null }, writes] : [writes];
      for (const variant of variants) {
        try {
          await update(ref(db), variant);
          return { code, uid, seat: '1', replaced: oldCode || null };
        } catch (error) {
          // A refused write is a code already in use or an old table that is gone; try the next way, then a new code.
          if (!isPermissionDenied(error)) throw error;
        }
      }
    }
    throw new Error('Could not create a table. Please try again in a moment.');
  }

  // Already at this table (for example after a refresh)? Returns { code, uid, seat } or null.
  async function rejoinTable(code) {
    if (!isValidCode(code)) return null;
    const uid = await getUid();
    try {
      const mine = (await get(ref(db, `tables/${code}/members/${uid}`))).val();
      return mine ? { code, uid, seat: mine.seat } : null;
    } catch (error) {
      if (isPermissionDenied(error)) return null; // not a member (or the table is gone)
      throw error;
    }
  }

  // Joins a table by code: takes the first free seat. Returns { code, uid, seat, rejoined }.
  async function joinTable({ code, name }) {
    if (!isValidCode(code)) throw new Error('That does not look like a table code.');
    const playerName = cleanPlayerName(name);
    const existing = await rejoinTable(code);
    if (existing) return { ...existing, rejoined: true };
    const uid = await getUid();
    for (let n = 1; n <= MAX_SEATS; n++) {
      const seat = String(n);
      try {
        await update(ref(db), {
          [`tables/${code}/members/${uid}`]: { name: playerName, seat },
          [`tables/${code}/seats/${seat}`]: uid,
        });
        return { code, uid, seat, rejoined: false };
      } catch (error) {
        if (!isPermissionDenied(error)) throw error; // that seat is taken (or the join is not allowed): try the next
      }
    }
    // No free seat to take. Maybe this is a player coming back to the seat they still hold: someone who left or
    // crashed mid-match keeps their seat reserved. The rules accept a member entry only for a seat the person holds.
    for (let n = 1; n <= MAX_SEATS; n++) {
      const seat = String(n);
      try {
        await update(ref(db), { [`tables/${code}/members/${uid}`]: { name: playerName, seat } });
        return { code, uid, seat, rejoined: true };
      } catch (error) {
        if (!isPermissionDenied(error)) throw error;
      }
    }
    throw new TableUnavailableError();
  }

  // Calls onChange with the table's members ({ uid: { name, seat } }) now and whenever they change.
  // onChange(null, error) if the list can no longer be read. Returns a function that stops watching.
  function watchMembers(code, onChange) {
    return onValue(
      ref(db, `tables/${code}/members`),
      (snapshot) => onChange(snapshot.val() ?? {}),
      (error) => onChange(null, error),
    );
  }

  // ---- The rest of the lobby flow: ready, start, concede, end the match, leave, end the table. ----
  // Each of these checks the flow's own rules first (who may do it, and when) and refuses in plain words before any
  // write; the database rules stay the real lock. Where the rules are looser than the flow (for example they let a host
  // start with nobody ready), the page enforces the stricter flow, and docs/game-flow.md says so.

  // What a member of this table needs to know before acting: their entry, the table's meta, and everyone's entries.
  // Returns null for each piece that cannot be read (not a member, or the table is gone).
  async function look(code) {
    const uid = await getUid();
    const read = async (path) => {
      try { return (await get(ref(db, `tables/${code}/${path}`))).val(); } catch (error) {
        if (isPermissionDenied(error)) return null;
        throw error;
      }
    };
    const [meta, members] = await Promise.all([read('meta'), read('members')]);
    return { uid, meta, members: members ?? {}, mine: members?.[uid] ?? null };
  }
  const refuse = (message) => { throw new FlowRefusedError(message); };

  // Marks you ready for the current match. Only while the table is in the lobby.
  async function setReady(code) {
    const { uid, meta, mine } = await look(code);
    if (!meta || !mine) refuse('You are not at that table.');
    if (meta.status !== 'lobby') refuse('The match has started, so there is nothing to ready up for.');
    await update(ref(db), { [`tables/${code}/members/${uid}/ready`]: meta.match });
  }

  // Takes the ready mark back. Only while the table is in the lobby.
  async function clearReady(code) {
    const { uid, meta, mine } = await look(code);
    if (!meta || !mine) refuse('You are not at that table.');
    if (meta.status !== 'lobby') refuse('The match has started.');
    await update(ref(db), { [`tables/${code}/members/${uid}/ready`]: null });
  }

  // The host starts the match: at least two players, and everyone ready for this match.
  async function startMatch(code) {
    const { uid, meta, members } = await look(code);
    if (!meta) refuse('That table is not available.');
    if (meta.host !== uid) refuse('Only the host can start the match.');
    if (meta.status !== 'lobby') refuse('The match has already started.');
    const players = Object.values(members);
    if (players.length < 2) refuse('You need at least two players to start.');
    if (!players.every((p) => p.ready === meta.match)) refuse('Everyone needs to be ready first.');
    await update(ref(db), { [`tables/${code}/meta/status`]: 'playing', [`tables/${code}/meta/idleLimit`]: PLAYING_IDLE_MS });
  }

  // You give up the current match. It cannot be taken back during the match.
  async function concede(code) {
    const { uid, meta, mine } = await look(code);
    if (!meta || !mine) refuse('You are not at that table.');
    if (meta.status !== 'playing') refuse('There is no match to concede.');
    await update(ref(db), { [`tables/${code}/members/${uid}/conceded`]: meta.match });
  }

  // The host ends the match for everyone and the table goes back to the lobby for another one.
  async function endMatch(code) {
    const { uid, meta, members } = await look(code);
    if (!meta) refuse('That table is not available.');
    if (meta.host !== uid) refuse('Only the host can end the match.');
    if (meta.status !== 'playing') refuse('There is no match to end.');
    await update(ref(db), {
      [`tables/${code}/meta/status`]: 'lobby',
      [`tables/${code}/meta/idleLimit`]: LOBBY_IDLE_MS,
      [`tables/${code}/meta/match`]: meta.match + 1,
    });
    // Seats held for players who left during the match are released now, so the lobby has them free again. (The rules
    // let the host free a seat only in the lobby, which is why this is a second write.)
    let seats = null;
    try { seats = (await get(ref(db, `tables/${code}/seats`))).val(); } catch (error) { if (!isPermissionDenied(error)) throw error; }
    const empty = Object.entries(seats ?? {}).filter(([, holder]) => holder && !members[holder]).map(([seat]) => seat);
    if (empty.length) await update(ref(db), Object.fromEntries(empty.map((seat) => [`tables/${code}/seats/${seat}`, null])));
  }

  // The host closes the table for everyone (and gives up their one-table slot).
  async function endTable(code) {
    const { uid, meta } = await look(code);
    if (!meta) refuse('That table is not available.');
    if (meta.host !== uid) refuse('Only the host can close the table.');
    const writes = { [`tables/${code}`]: null };
    if ((await get(ref(db, `hosts/${uid}`))).val() === code) writes[`hosts/${uid}`] = null;
    await update(ref(db), writes);
  }

  // You leave. In the lobby your seat is freed. Mid-match your entry goes and your seat stays RESERVED for you, so you
  // can come back to it (joinTable with the same code, from the same browser) until the host ends the match, which
  // releases it. If you are the only one left, the table closes. If you are the host and others are at the table, the
  // table is handed to the player in the lowest seat as you leave (the next one if the rules refuse that player, for
  // example because they already host another table).
  async function leaveTable(code) {
    const { uid, meta, members, mine } = await look(code);
    if (!meta || !mine) refuse('You are not at that table.');
    const others = Object.keys(members).filter((id) => id !== uid);
    const isHost = meta.host === uid;
    const ownSlotIsThisTable = isHost && (await get(ref(db, `hosts/${uid}`))).val() === code;
    if (others.length === 0) {
      const writes = { [`tables/${code}`]: null };
      if (ownSlotIsThisTable) writes[`hosts/${uid}`] = null;
      return update(ref(db), writes);
    }
    const writes = { [`tables/${code}/members/${uid}`]: null };
    if (meta.status === 'lobby') writes[`tables/${code}/seats/${mine.seat}`] = null;
    if (!isHost) return update(ref(db), writes);
    if (ownSlotIsThisTable) writes[`hosts/${uid}`] = null;
    const bySeat = others.sort((a, b) => Number(members[a].seat) - Number(members[b].seat));
    for (const next of bySeat) {
      try {
        await update(ref(db), { ...writes, [`tables/${code}/meta/host`]: next });
        return { newHost: next };
      } catch (error) {
        if (!isPermissionDenied(error)) throw error; // that player cannot take over: offer it to the next one
      }
    }
    refuse('Nobody at the table can take it over right now. Close the table instead.');
  }

  // The host hands the table to another player at it. Your host slot is cleared in the same write; the new host claims
  // theirs afterwards with claimHostSlot (only they can write it).
  async function passHost(code, newHost) {
    const { uid, meta, members } = await look(code);
    if (!meta) refuse('That table is not available.');
    if (meta.host !== uid) refuse('Only the host can hand over the table.');
    if (newHost === uid) refuse('You are already the host.');
    if (!members[newHost]) refuse('That player is not at the table.');
    const writes = { [`tables/${code}/meta/host`]: newHost };
    if ((await get(ref(db, `hosts/${uid}`))).val() === code) writes[`hosts/${uid}`] = null;
    try {
      await update(ref(db), writes);
    } catch (error) {
      if (isPermissionDenied(error)) refuse('That player cannot take over the table right now. They may already host another table.');
      throw error;
    }
  }

  // The new host (after a hand-over) takes the one-table-per-host slot. Safe to call again.
  async function claimHostSlot(code) {
    const { uid, meta } = await look(code);
    if (!meta) refuse('That table is not available.');
    if (meta.host !== uid) refuse('You are not the host of this table.');
    if ((await get(ref(db, `hosts/${uid}`))).val() === code) return;
    await update(ref(db), { [`hosts/${uid}`]: code });
  }

  return { findMyTable, createTable, rejoinTable, joinTable, watchMembers, setReady, clearReady, startMatch, concede, endMatch, endTable, leaveTable, passHost, claimHostSlot };
}
