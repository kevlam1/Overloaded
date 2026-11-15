// What is typed into the small "X" box of a menu line such as "Draw X..." (Kevin, 2026-11-15: no more rows of number buttons, one typed number instead). Plain logic with no browser code,
// so Node can test it (scripts/test-number-input.mjs); the box itself is frontend/src/number-box.js.
export const COUNT_LIMIT = 999; // the most a menu line asks for unless the line says less (the size of the pile, for example)

// The number typed, as { ok: true, value } or { ok: false, message } with a message that says what to type. Whole numbers only, from min to max.
export function parseCount(text, { min = 1, max = COUNT_LIMIT } = {}) {
  const low = Number.isInteger(min) ? min : 1;
  const high = Number.isInteger(max) ? Math.max(max, low) : COUNT_LIMIT;
  const typed = String(text ?? '').trim();
  if (typed === '') return { ok: false, message: 'Type a number.' };
  if (!/^\d{1,15}$/.test(typed)) return { ok: false, message: 'Use a whole number, like 3.' };
  const value = Number(typed);
  if (value < low) return { ok: false, message: low === 1 ? 'The smallest number is 1.' : `The smallest number is ${low}.` };
  if (value > high) return { ok: false, message: `The most is ${high}.` };
  return { ok: true, value };
}

// The number the box starts with: the last one used, if it fits this line (min to max), else the smallest.
export function startingCount(last, { min = 1, max = COUNT_LIMIT } = {}) {
  const low = Number.isInteger(min) ? min : 1;
  const high = Number.isInteger(max) ? Math.max(max, low) : COUNT_LIMIT;
  const number = Number(last);
  return Number.isInteger(number) && number >= low && number <= high ? number : low;
}
