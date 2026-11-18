// How much of a card shows when the hand is resting (Kevin, 2026-11-17): the hand sits lowered, with the bottom of the cards below the bottom edge of the window, and rises when the pointer comes into it.
// It was a quarter of each card hidden (75% showing); the default is now half hidden (50% showing), and Settings has a slider for it. Plain logic with no browser code, so Node tests can load it
// (scripts/test-hand-rest.mjs); frontend/src/hand-rest.js draws the slider and keeps the choice in this browser (never sent to the database).
export const REST_KEY = 'overloaded.handRest';
export const DEFAULT_REST_VISIBLE = 50; // percent of a card's height that shows when the hand is resting
export const MIN_REST_VISIBLE = 20; // less than this leaves too little of the cards to find the hand with the pointer
export const MAX_REST_VISIBLE = 100; // the whole card shows (the cards stay just above the bottom edge)
export const REST_STEP = 5;

// A usable setting from anything: a number (or text of one) is rounded to the step and kept between the least and the most; anything else is the default.
export function cleanRestVisible(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return DEFAULT_REST_VISIBLE;
  const stepped = Math.round(number / REST_STEP) * REST_STEP;
  return Math.min(MAX_REST_VISIBLE, Math.max(MIN_REST_VISIBLE, stepped));
}

// The setting from the text kept in the browser (a plain number such as "50"), or the default for nothing or damaged text.
export const readRestVisible = (text) => cleanRestVisible(typeof text === 'string' ? text : null);
// The text to keep for a setting (cleaned the same way it is read).
export const writeRestVisible = (value) => String(cleanRestVisible(value));
// The share of a card's height that is below the bottom edge of the window when the hand is resting: 0.5 for 50% showing.
export const restHiddenShare = (visible) => Math.round(100 - cleanRestVisible(visible)) / 100;
// What the slider says.
export const restWords = (visible) => `${cleanRestVisible(visible)}% of a card shows`;
