// Table codes: 6 characters from an alphabet with no look-alikes (no 0, O, 1, I), about a billion codes.
// The code is the join secret for a table, so it is drawn from the browser's secure random source.
// No browser-only or server-only code here, so Node tests can load it.

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 characters
export const CODE_LENGTH = 6;

// 32 divides 256, so taking 5 bits of a random byte picks every character equally often (no modulo bias).
const secureBytes = (count) => globalThis.crypto.getRandomValues(new Uint8Array(count));

// `randomBytes` can be replaced in tests; it must return `count` random bytes.
export function makeTableCode(randomBytes = secureBytes) {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[bytes[i] & 31];
  return code;
}

export function isValidCode(code) {
  if (typeof code !== 'string' || code.length !== CODE_LENGTH) return false;
  for (const character of code) if (!CODE_ALPHABET.includes(character)) return false;
  return true;
}

// What a person typed or pasted: spaces and dashes removed, upper case. It is not "fixed" any further, so a
// 0 or an O stays invalid instead of silently joining a different table.
export function normalizeCode(text) {
  return String(text ?? '').replace(/[\s-]/g, '').toUpperCase();
}
