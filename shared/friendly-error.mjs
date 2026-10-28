// Turns any error into words a player should see. Errors from our own code (a bad name, a table that cannot be
// joined) already read well and pass through. Errors from the Firebase SDK ("Firebase: Error (auth/...)") do not, so
// they are mapped to a few plain messages instead of being shown raw.
// No browser-only or server-only code here, so Node tests can load it.
import { isPermissionDenied } from './permission-error.mjs';

export const OFFLINE_MESSAGE = "Can't reach the server. Check your internet connection and try again.";
export const SIGN_IN_MESSAGE = 'Could not sign in. Please try again in a moment.';
export const REFUSED_MESSAGE = 'The server refused that. If it keeps happening, the table may have closed.';
export const GENERIC_MESSAGE = 'Something went wrong talking to the server. Please try again.';

export function friendlyMessage(error) {
  if (!error || typeof error !== 'object') return GENERIC_MESSAGE;
  const code = String(error.code ?? '');
  const message = String(error.message ?? '');
  // No connection: the auth code, the database's "Client is offline.", and a browser's failed fetch.
  if (/^auth\/network/.test(code) || /offline|failed to fetch|network request failed|networkerror/i.test(message)) return OFFLINE_MESSAGE;
  if (isPermissionDenied(error)) return REFUSED_MESSAGE;
  const fromFirebase = error.name === 'FirebaseError' || /^Firebase/i.test(message);
  if (code.startsWith('auth/')) return SIGN_IN_MESSAGE;
  if (fromFirebase) return GENERIC_MESSAGE;
  return message || GENERIC_MESSAGE; // our own messages
}
