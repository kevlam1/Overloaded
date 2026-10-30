// Shared links: https://<site>/lobby/ABC234 opens the lobby with the code already typed in.
// The code in a link is only a convenience. The page puts it in the code box and never joins by itself (joining needs
// a name, and the person should see where they are going), so a mangled or hostile link can at worst fill a box.
// No browser-only or server-only code here, so Node tests can load it.
import { normalizeCode, isValidCode } from './table-code.mjs';

// The table code in a page address ("/lobby/ABC234", "/lobby/abc-234/"), or null when there is none or it is not a
// valid code. Exactly one segment after /lobby is accepted, so "/lobby/ABC234/x" and "/pages/lobby/" give null.
function codeAfter(prefix, pathname) {
  const match = new RegExp(`^/${prefix}/([^/]+)/?$`).exec(String(pathname ?? ''));
  if (!match) return null;
  let raw;
  try { raw = decodeURIComponent(match[1]); } catch { return null; } // a broken %-escape is not a code
  const code = normalizeCode(raw);
  return isValidCode(code) ? code : null;
}

export const codeFromPath = (pathname) => codeAfter('lobby', pathname);

// The table page's own address, "/table/ABC234": the page everyone at a started match is sent to. Same rules as above.
export const tableCodeFromPath = (pathname) => codeAfter('table', pathname);

// The link to share for a table. `origin` is the page's own origin, for example "https://overloaded.example".
export function linkForCode(origin, code) {
  return `${origin}/lobby/${code}`;
}

// Where a started match is played (a path, no origin: players are sent there from the lobby).
export const tablePathForCode = (code) => `/table/${code}`;
