// How a pile of same-name cards is drawn on the battlefield (Kevin, 2026-11-09): the copies under the top card go up and to the left ("diagonal", the first way) or straight to the left
// ("horizontal", the bottom-most card on the left). Only how it is drawn changes, never the game: a pile is the same cards on the same cell either way. The choice is kept in this
// browser (frontend/src/pile-style.js). Plain data with no browser code, so Node tests can load it (scripts/test-pile-style.mjs).
export const PILE_STYLE_KEY = 'overloaded.pileStyle';
export const PILE_STYLES = ['diagonal', 'horizontal'];
export const DEFAULT_PILE_STYLE = 'diagonal';
export const PILE_STYLE_LABELS = { diagonal: 'Diagonal', horizontal: 'Horizontal' };

// The style from the text kept in the browser, or from nothing: always one of PILE_STYLES (anything else is the default).
export function readPileStyle(text) {
  return typeof text === 'string' && PILE_STYLES.includes(text) ? text : DEFAULT_PILE_STYLE;
}

// Where a tapped card steps out of its pile: beside it, in both styles (Kevin, 2026-11-10: the Horizontal style first sent it up, and he wanted it to act like the Diagonal one). The 'up' way is
// still in shared/zones.mjs (setTapStepOut) and could be given to a style again by changing this one line.
export const stepOutFor = () => 'right';
