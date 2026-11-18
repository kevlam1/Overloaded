// How long to wait between the cards of "Draw X" (Kevin, 2026-11-18): the first 10 cards come at the normal pace, and from the 11th on the pace speeds up every 5 cards, so drawing 30 or 40 cards does
// not take forever. Plain logic with no browser code (scripts/test-draw-pace.mjs).
export const BASE_PAUSE_MS = 140; // between one card and the next, for the first 10
export const FAST_AFTER = 10; // cards at the normal pace
export const STEP_EVERY = 5; // after that, faster every this many cards
export const FASTER = 0.7; // each step keeps this share of the pause
export const MIN_PAUSE_MS = 25;

// The pause after the card with this number (1 is the first card drawn).
export function drawPause(number) {
  if (!Number.isInteger(number) || number <= FAST_AFTER) return BASE_PAUSE_MS;
  const steps = Math.floor((number - FAST_AFTER - 1) / STEP_EVERY) + 1;
  return Math.max(MIN_PAUSE_MS, Math.round(BASE_PAUSE_MS * FASTER ** steps));
}
