// The wiring between the page and Firebase: start the app, sign in anonymously, and hand the database to the table
// logic in shared/table-ops.mjs. The pages never import Firebase themselves, so changing the service means rewriting
// this file (and the database calls passed to createTableOps), not the pages or the game.
import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, signInAnonymously } from 'firebase/auth';
import { getDatabase, ref, get, update, onValue, serverTimestamp } from 'firebase/database';
import { createTableOps, TableUnavailableError, FlowRefusedError } from '../../shared/table-ops.mjs';

export { TableUnavailableError, FlowRefusedError };

let services = null;
function start() {
  if (!services) {
    const app = initializeApp(__FIREBASE_CONFIG__); // filled in by vite.config.js from .env or Vercel's environment
    // initializeAuth with only the storage we need, instead of getAuth, which also pulls in the sign-in-with-popup
    // code we never use (a smaller download). A persistence MUST be given: with none the SDK keeps the account in
    // memory only, and a refresh would create a new one. IndexedDB first, local storage if that is unavailable.
    const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
    services = { auth, db: getDatabase(app) };
  }
  return services;
}

// An anonymous account: no email or password, just a random id the browser keeps. Returns that id.
// Every caller shares ONE attempt. Without that, two calls made at the same moment on a fresh browser both saw "no
// account yet" and both created one; the second silently replaced the first, so the page could act as two people
// (found by the spike on 2026-10-28: three simultaneous calls gave three different accounts).
let signingIn = null;
export function signIn() {
  if (!signingIn) {
    signingIn = (async () => {
      const { auth } = start();
      await auth.authStateReady(); // waits for the saved sign-in (if any) to load, so a refresh keeps the same id
      if (auth.currentUser) return auth.currentUser.uid;
      const credential = await signInAnonymously(auth);
      return credential.user.uid;
    })();
    signingIn.catch(() => { signingIn = null; }); // a failed attempt can be tried again; callers still see the failure
  }
  return signingIn;
}

let ops = null;
function tableOps() {
  if (!ops) ops = createTableOps({ sdk: { ref, get, update, onValue, serverTimestamp }, db: start().db, getUid: signIn });
  return ops;
}

export const findMyTable = (...args) => tableOps().findMyTable(...args);
export const createTable = (...args) => tableOps().createTable(...args);
export const rejoinTable = (...args) => tableOps().rejoinTable(...args);
export const joinTable = (...args) => tableOps().joinTable(...args);
export const watchMembers = (...args) => tableOps().watchMembers(...args);
export const setReady = (...args) => tableOps().setReady(...args);
export const clearReady = (...args) => tableOps().clearReady(...args);
export const startMatch = (...args) => tableOps().startMatch(...args);
export const concede = (...args) => tableOps().concede(...args);
export const endMatch = (...args) => tableOps().endMatch(...args);
export const endTable = (...args) => tableOps().endTable(...args);
export const leaveTable = (...args) => tableOps().leaveTable(...args);
export const passHost = (...args) => tableOps().passHost(...args);
export const claimHostSlot = (...args) => tableOps().claimHostSlot(...args);
