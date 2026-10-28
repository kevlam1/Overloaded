// Tests for shared/friendly-error.mjs. Run: node scripts/test-friendly-error.mjs
import { friendlyMessage, OFFLINE_MESSAGE, SIGN_IN_MESSAGE, REFUSED_MESSAGE, GENERIC_MESSAGE } from '../shared/friendly-error.mjs';

let checks = 0;
function check(label, condition) {
  if (!condition) { console.error('FAILED:', label); process.exit(1); }
  checks++;
}
// The shapes the Firebase SDK produced (the first was seen in headless Chrome with the network switched off)
const firebaseError = (code, message) => Object.assign(new Error(message), { name: 'FirebaseError', code });

// No connection
check('auth network failure (seen offline in Chrome)', friendlyMessage(firebaseError('auth/network-request-failed', 'Firebase: Error (auth/network-request-failed).')) === OFFLINE_MESSAGE);
check('the database saying it is offline', friendlyMessage(new Error('Client is offline.')) === OFFLINE_MESSAGE);
check('a browser failed fetch', friendlyMessage(new TypeError('Failed to fetch')) === OFFLINE_MESSAGE);
check('another network wording', friendlyMessage(new Error('A network request failed')) === OFFLINE_MESSAGE || friendlyMessage(new Error('Network request failed')) === OFFLINE_MESSAGE);

// Refused by the rules
check('a refused read ("Permission denied")', friendlyMessage(new Error('Permission denied')) === REFUSED_MESSAGE);
check('a refused write (code and message)', friendlyMessage(Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' })) === REFUSED_MESSAGE);

// Sign-in problems and other Firebase errors are never shown raw
check('too many sign-in attempts', friendlyMessage(firebaseError('auth/too-many-requests', 'Firebase: Error (auth/too-many-requests).')) === SIGN_IN_MESSAGE);
check('anonymous sign-in switched off in the project', friendlyMessage(firebaseError('auth/operation-not-allowed', 'Firebase: Error (auth/operation-not-allowed).')) === SIGN_IN_MESSAGE);
check('an unknown Firebase error becomes the generic message', friendlyMessage(firebaseError('database/unknown', 'Firebase: something odd')) === GENERIC_MESSAGE);
check('a Firebase-looking message without the error name is still not shown raw', friendlyMessage(new Error('Firebase: Error (storage/whatever).')) === GENERIC_MESSAGE);
for (const error of [firebaseError('auth/network-request-failed', 'Firebase: Error (auth/network-request-failed).'), firebaseError('auth/too-many-requests', 'Firebase: Error (auth/too-many-requests).'), firebaseError('x/y', 'Firebase: boom')]) {
  const shown = friendlyMessage(error);
  check('no Firebase wording or auth code reaches the player', !/Firebase|auth\//.test(shown));
}

// Our own messages pass through unchanged
for (const own of ['Type a name first.', 'Names can be up to 30 characters.', 'That does not look like a table code.', 'Could not join that table. It may not exist, may be full, may have started, or may have closed.', 'Could not create a table. Please try again in a moment.']) {
  check(`our own message passes through: ${own.slice(0, 30)}`, friendlyMessage(new Error(own)) === own);
}

// Odd inputs never crash and never show nothing
check('undefined', friendlyMessage(undefined) === GENERIC_MESSAGE);
check('null', friendlyMessage(null) === GENERIC_MESSAGE);
check('a string', friendlyMessage('boom') === GENERIC_MESSAGE);
check('a number', friendlyMessage(42) === GENERIC_MESSAGE);
check('an error with no message', friendlyMessage(new Error('')) === GENERIC_MESSAGE);
check('an empty object', friendlyMessage({}) === GENERIC_MESSAGE);
check('every message is non-empty text', [OFFLINE_MESSAGE, SIGN_IN_MESSAGE, REFUSED_MESSAGE, GENERIC_MESSAGE].every((m) => typeof m === 'string' && m.length > 10));
check('the four messages are different', new Set([OFFLINE_MESSAGE, SIGN_IN_MESSAGE, REFUSED_MESSAGE, GENERIC_MESSAGE]).size === 4);

console.log(`All ${checks} friendly error checks passed.`);
