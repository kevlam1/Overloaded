// Every database call the page makes goes through this file: sign in, create a table, join a table, watch the
// players. The pages never import Firebase themselves, so changing the service means rewriting only this file.
//
// What the rules allow (backend/database.rules.json) shapes the code here:
// - a table is created in ONE write: meta, the first heartbeat, your member entry, seat 1 and your host slot;
// - joining is one write that takes a free seat and creates your member entry (a taken seat refuses the whole write);
// - a person who is not at the table cannot read it, so joining tries seats one at a time;
// - a host holds one table at a time: making a new one deletes the old one in the same write.
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase, ref, get, update, onValue, serverTimestamp } from 'firebase/database';
import { makeTableCode, isValidCode } from '../../shared/table-code.mjs';
import { cleanPlayerName } from '../../shared/player-name.mjs';
import { isPermissionDenied } from '../../shared/permission-error.mjs';

const LOBBY_IDLE_MS = 30 * 60 * 1000; // must equal the lobby idle limit in the rules
const SEAT_COUNTS = [2, 3, 4];
const MAX_SEATS = 4;
const CREATE_ATTEMPTS = 5;

let services = null;
function start() {
  if (!services) {
    const app = initializeApp(__FIREBASE_CONFIG__); // filled in by vite.config.js from .env or Vercel's environment
    services = { auth: getAuth(app), db: getDatabase(app) };
  }
  return services;
}

export class TableUnavailableError extends Error {
  constructor() {
    super('Could not join that table. It may not exist, may be full, may have started, or may have closed.');
    this.name = 'TableUnavailableError';
  }
}

// An anonymous account: no email or password, just a random id the browser keeps. Returns that id.
export async function signIn() {
  const { auth } = start();
  await auth.authStateReady(); // waits for the saved sign-in (if any) to load, so a refresh keeps the same id
  if (auth.currentUser) return auth.currentUser.uid;
  const credential = await signInAnonymously(auth);
  return credential.user.uid;
}

// The host's current table, if it still exists: { code, players }. A host holds one table at a time.
export async function findMyTable() {
  const uid = await signIn();
  const { db } = start();
  const code = (await get(ref(db, `hosts/${uid}`))).val();
  if (!code) return null;
  try {
    const table = (await get(ref(db, `tables/${code}`))).val();
    // The host slot can outlive its table (the table closed or was deleted). Then there is nothing to warn about.
    if (!table || !table.meta) return null;
    return { code, players: Object.keys(table.members ?? {}).length };
  } catch (error) {
    if (isPermissionDenied(error)) return null; // not readable: the table is gone or is not ours any more
    throw error;
  }
}

// Creates a table and takes seat 1. If the host already holds a table, it is deleted in the same write.
// The page should warn first (findMyTable); this function does what it is told.
export async function createTable({ name, seats = 4, format = 'commander' }) {
  const playerName = cleanPlayerName(name);
  if (!SEAT_COUNTS.includes(seats)) throw new Error('A table has 2, 3 or 4 seats.');
  const uid = await signIn();
  const { db } = start();
  const oldCode = (await get(ref(db, `hosts/${uid}`))).val();

  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const code = makeTableCode();
    const table = `tables/${code}`;
    const writes = {
      [`${table}/meta`]: { host: uid, createdAt: serverTimestamp(), seats, format, status: 'lobby', idleLimit: LOBBY_IDLE_MS, match: 1 },
      [`${table}/activity/lastActive`]: serverTimestamp(),
      [`${table}/members/${uid}`]: { name: playerName, seat: '1' },
      [`${table}/seats/1`]: uid,
      [`hosts/${uid}`]: code,
    };
    if (oldCode) writes[`tables/${oldCode}`] = null;
    try {
      await update(ref(db), writes);
      return { code, uid, seat: '1', replaced: oldCode || null };
    } catch (error) {
      // A refused write is almost always a code that is already in use, so try another one.
      if (!isPermissionDenied(error)) throw error;
    }
  }
  throw new Error('Could not create a table. Please try again in a moment.');
}

// Already at this table (for example after a refresh)? Returns { code, uid, seat } or null.
export async function rejoinTable(code) {
  if (!isValidCode(code)) return null;
  const uid = await signIn();
  const { db } = start();
  try {
    const mine = (await get(ref(db, `tables/${code}/members/${uid}`))).val();
    return mine ? { code, uid, seat: mine.seat } : null;
  } catch (error) {
    if (isPermissionDenied(error)) return null; // not a member (or the table is gone)
    throw error;
  }
}

// Joins a table by code: takes the first free seat. Returns { code, uid, seat, rejoined }.
export async function joinTable({ code, name }) {
  if (!isValidCode(code)) throw new Error('That does not look like a table code.');
  const playerName = cleanPlayerName(name);
  const existing = await rejoinTable(code);
  if (existing) return { ...existing, rejoined: true };
  const uid = await signIn();
  const { db } = start();
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
  throw new TableUnavailableError();
}

// Calls onChange with the table's members ({ uid: { name, seat } }) now and whenever they change.
// onChange(null, error) if the list can no longer be read. Returns a function that stops watching.
export function watchMembers(code, onChange) {
  const { db } = start();
  return onValue(
    ref(db, `tables/${code}/members`),
    (snapshot) => onChange(snapshot.val() ?? {}),
    (error) => onChange(null, error),
  );
}
