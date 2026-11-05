// What a card shows about its counters and its power/toughness change, and how a typed amount is read. Plain text in, plain
// text out, no browser code, so Node tests can load it (scripts/test-marks.mjs).
import { COUNTER_KINDS, COUNTER_WORDS, NUMBER_LIMIT, netChange } from './zones.mjs';

// A typed amount: whole digits only, commas, spaces and underscores allowed between them ("1,500,000"). Returns the number, or
// null when it is empty, not a whole number above 0, or over NUMBER_LIMIT. No "1e9", no signs, no decimals: the buttons pick the direction.
export function parseAmount(text) {
  const clean = String(text ?? '').trim().replace(/[,_ ]/g, '');
  if (!/^[0-9]+$/.test(clean)) return null;
  const value = Number(clean);
  return value >= 1 && value <= NUMBER_LIMIT ? value : null;
}

// A number short enough for a card label: exact below 10,000, then 12.3K, 4.5M, 6.7B, 1T.
export function shortNumber(value) {
  const size = Math.abs(value);
  if (size < 10000) return String(value);
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  const [scale, letter] = units.find(([unit]) => size >= unit);
  const scaled = Math.round((size / scale) * 10) / 10;
  return `${value < 0 ? '-' : ''}${scaled}${letter}`;
}

const signed = (value, short) => `${value < 0 ? '-' : '+'}${short ? shortNumber(Math.abs(value)) : Math.abs(value).toLocaleString('en-US')}`;

// The change to power and toughness from counters and the modifier together, as "+5/+3", or '' when there is none.
// short: true for the card label, false for a full-length version (a tooltip, a screen reader).
export function changeLabel(card, short = true) {
  const { power, toughness } = netChange(card);
  if (power === 0 && toughness === 0) return '';
  return `${signed(power, short)}/${signed(toughness, short)}`;
}

// The counters on a card, as chips for the card and in the order of COUNTER_KINDS: [{ kind, word, count, text }].
export function counterChips(card) {
  const counters = card?.ct ?? {};
  return COUNTER_KINDS.filter((kind) => counters[kind] > 0).map((kind) => ({
    kind,
    word: COUNTER_WORDS[kind],
    count: counters[kind],
    text: `${COUNTER_WORDS[kind]} ${shortNumber(counters[kind])}`,
  }));
}

// One sentence for the selected-card line and for screen readers: "Counters: +1/+1 3. Change: +5/+3." ('' when there is nothing).
export function marksSentence(card) {
  const parts = [];
  const chips = counterChips(card);
  if (chips.length) parts.push(`Counters: ${chips.map((chip) => `${chip.word} ${chip.count.toLocaleString('en-US')}`).join(', ')}.`);
  const change = changeLabel(card, false);
  if (change) parts.push(`Change: ${change}.`);
  return parts.join(' ');
}
