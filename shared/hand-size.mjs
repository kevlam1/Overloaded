// The size of the cards in the hand (2026-11-26 feedback): a slider in Settings, 70% to 150% of the normal size, kept in this browser (never sent to the database).
// Plain logic with no browser code (scripts/test-hand-size.mjs); frontend/src/hand-size.js draws the slider and sets --hand-scale on the page.
export const SIZE_KEY = 'overloaded.handSize';
export const DEFAULT_SIZE = 100;
export const MIN_SIZE = 70;
export const MAX_SIZE = 150;
export const SIZE_STEP = 10;

// A usable size from anything: a number (or text of one) rounded to the step and kept in range; anything else is the default.
export function cleanSize(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return DEFAULT_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(number / SIZE_STEP) * SIZE_STEP));
}
export const readSize = (text) => cleanSize(typeof text === 'string' ? text : null);
export const writeSize = (value) => String(cleanSize(value));
// The factor the style sheet multiplies a hand card's height by: 1.2 for 120%.
export const sizeScale = (value) => cleanSize(value) / 100;
export const sizeWords = (value) => `${cleanSize(value)}%`;
