// How the life total is changed by hand (Kevin, 2026-11-11): the number itself is the control. Plain logic with no browser code, so Node can test it.
//   click (left)        +1          Shift + click          +5
//   right-click         -1          Shift + right-click    -5
//   hold the number     sets the life total (a circle fills while you hold; frontend/src/life-control.js)
//   keyboard: arrows up or right +1, down or left -1 (Shift: 5), Enter sets it
import { NUMBER_LIMIT } from './zones.mjs';

export const HOLD_MS = 600; // how long the number is held before it asks for a new total
export const BIG_STEP = 5;

// The change for a click: button is the mouse button (0 left, 2 right); anything else (the middle button) changes nothing.
export function lifeDelta({ button = 0, shiftKey = false } = {}) {
  if (button !== 0 && button !== 2) return null;
  const step = shiftKey ? BIG_STEP : 1;
  return button === 0 ? step : -step;
}

// The change for a key press on the number, or null when the key is not one of ours.
export function lifeKeyDelta(key, shiftKey = false) {
  const step = shiftKey ? BIG_STEP : 1;
  if (key === 'ArrowUp' || key === 'ArrowRight') return step;
  if (key === 'ArrowDown' || key === 'ArrowLeft') return -step;
  return null;
}

// What was typed to set the life total: a whole number (a minus sign is allowed: life can go below 0), within the one number limit. Anything else is null.
export function parseLife(text) {
  const trimmed = String(text ?? '').trim().replace(/^−/, '-'); // the real minus sign some keyboards and pastes give
  if (!/^[+-]?\d{1,15}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Math.abs(value) <= NUMBER_LIMIT ? value : null;
}

export const LIFE_HINT = 'Click to gain 1 life, right-click to lose 1, hold Shift for 5, hold the number to set it. With the keyboard: arrow keys change it, Enter sets it.';
