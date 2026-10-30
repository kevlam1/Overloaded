// The wiring between the page and Firebase: start the app, sign in anonymously, and hand the database to the table
// logic in shared/table-ops.mjs. The pages never import Firebase themselves, so changing the service means rewriting
// this file (and the database calls passed to createTableOps), not the pages or the game.
import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence, signInAnonymously } from 'firebase/auth';
import { getDatabase, ref, get, update, onValue, onDisconnect, serverTimestamp } from 'firebase/database';
import { createTableOps, TableUnavailableError, FlowRefusedError } from '../../shared/table-ops.mjs';

export { TableUnavailableError, FlowRefusedError };

let services = null;
function start() {
  if (!services) {
    const app = initializeApp(__FIREBASE_CONFIG__); // filled in by vite.config.js from .env or Vercel's environment
    // initializeAuth with only the storage we need, instead of getAuth, which also pulls in the sign-in-with-popup
    // code we never use (a smaller download). A persistence MUST be given: with none the SDK keeps the account in
    // memory only, and a refresh would create a new one. IndexedDB first, local storage if that is unavailable, and as a
    // last resort memory only: with every kind of browser storage blocked (some privacy settings) the page still works
    // for this visit, it just cannot put you back at your table after a refresh.
    const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence] });
    services = { auth, db: getDatabase(app) };
  }
  return services;
}

// An anonymous account: no email or password, just a random id the browser keeps. Returns that id.
// Every caller shares ONE attempt. Without that, two calls made at the same moment on a fresh browser both saw "no
// account yet" and both created one; the second silently replaced the first, so the page could act as two people
// (found by the spike on 2026-10-28: three simultaneous calls gave three different accounts).
// Two TABS of one browser have the same problem (checked 2026-10-28 with two tabs opened at once on a fresh profile: two
// accounts, the browser kept one, and the other tab went on acting as the account that was lost). So the tabs take
// turns with a Web Lock; a tab that had to wait gives the first tab's saved account a moment to arrive instead of
// creating its own. The answer is also read from the live sign-in each time, never remembered for good.
const SIGN_IN_LOCK = 'overloaded-sign-in';
const SAVED_ACCOUNT_WAIT_MS = 3000;
function waitForSavedAccount(auth, ms) {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (auth.currentUser || Date.now() - started >= ms) { clearInterval(timer); resolve(); }
    }, 100);
  });
}
async function createOrFind(auth) {
  await auth.authStateReady(); // waits for the saved sign-in (if any) to load, so a refresh keeps the same id
  if (auth.currentUser) return auth.currentUser.uid;
  const credential = await signInAnonymously(auth);
  return credential.user.uid;
}
let signingIn = null;
export function signIn() {
  const { auth } = start();
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  if (!signingIn) {
    signingIn = (async () => {
      await auth.authStateReady();
      if (auth.currentUser) return auth.currentUser.uid;
      if (!globalThis.navigator?.locks) return createOrFind(auth); // no Web Locks: the old behavior
      const first = await navigator.locks.request(SIGN_IN_LOCK, { ifAvailable: true }, (lock) => (lock ? createOrFind(auth) : null));
      if (first) return first;
      // Another tab is signing in. Wait for it to finish, then look for the account it saved before making our own.
      return navigator.locks.request(SIGN_IN_LOCK, async () => {
        await waitForSavedAccount(auth, SAVED_ACCOUNT_WAIT_MS);
        return createOrFind(auth);
      });
    })();
    const attempt = signingIn;
    attempt.then(() => { if (signingIn === attempt) signingIn = null; }, () => { if (signingIn === attempt) signingIn = null; }); // a failed attempt can be tried again; callers still see the failure
  }
  return signingIn;
}

let ops = null;
function tableOps() {
  if (!ops) ops = createTableOps({ sdk: { ref, get, update, onValue, onDisconnect, serverTimestamp }, db: start().db, getUid: signIn });
  return ops;
}

export const findMyTable = (...args) => tableOps().findMyTable(...args);
export const createTable = (...args) => tableOps().createTable(...args);
export const rejoinTable = (...args) => tableOps().rejoinTable(...args);
export const joinTable = (...args) => tableOps().joinTable(...args);
export const watchMembers = (...args) => tableOps().watchMembers(...args);
export const setReady = (...args) => tableOps().setReady(...args);
export const clearReady = (...args) => tableOps().clearReady(...args);
export const setDeck = (...args) => tableOps().setDeck(...args);
export const startMatch = (...args) => tableOps().startMatch(...args);
export const concede = (...args) => tableOps().concede(...args);
export const endMatch = (...args) => tableOps().endMatch(...args);
export const endTable = (...args) => tableOps().endTable(...args);
export const leaveTable = (...args) => tableOps().leaveTable(...args);
export const passHost = (...args) => tableOps().passHost(...args);
export const takeOverHost = (...args) => tableOps().takeOverHost(...args);
export const claimHostSlot =(...args) => tableOps().claimHostSlot(...args);
export const heartbeat = (...args) => tableOps().heartbeat(...args);
export const watchActivity = (...args) => tableOps().watchActivity(...args);
export const watchConnection = (...args) => tableOps().watchConnection(...args);
export const startPresence =(...args) => tableOps().startPresence(...args);
export const watchPresence = (...args) => tableOps().watchPresence(...args);
export const watchMeta = (...args) => tableOps().watchMeta(...args);
export const watchServerOffset = (...args) => tableOps().watchServerOffset(...args);
