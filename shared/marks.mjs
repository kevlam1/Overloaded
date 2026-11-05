// What a card shows about its counters and its power/toughness change, and how a typed amount is read. Plain text in, plain
// text out, no browser code, so Node tests can load it (scripts/test-marks.mjs).
import { COUNTER_KINDS, COUNTER_WORDS, NUMBER_LIMIT, netChange, changeCounter, changeModifier } from './zones.mjs';

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
  const parts = changeParts(card, short);
  return parts ? `${parts.power}/${parts.toughness}` : '';
}

// The same change in two pieces, { power: '+5', toughness: '+3' }, or null when there is none (the card draws them as two
// clickable halves with a "/" between).
export function changeParts(card, short = true) {
  const { power, toughness } = netChange(card);
  if (power === 0 && toughness === 0) return null;
  return { power: signed(power, short), toughness: signed(toughness, short) };
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

// A click on a card's own chips or change label. hit: { mark: 'chip' | 'power' | 'both' | 'toughness', kind (for a chip),
// remove (a right-click), big (Shift held) }. A plain click adds 1, a right-click takes 1 off, and Shift makes it 10.
// Returns { run(game, uid) -> game, message(name) -> text }; run throws what the game logic throws, so the page shows it.
export function markClick(hit) {
  const step = hit.big ? 10 : 1;
  const delta = hit.remove ? -step : step;
  const verb = hit.remove ? 'Removed' : 'Added';
  if (hit.mark === 'chip') {
    if (!COUNTER_KINDS.includes(hit.kind)) throw new Error('That is not a kind of counter.');
    return {
      run: (game, uid) => changeCounter(game, uid, hit.kind, delta),
      message: (name) => `${verb} ${step} ${COUNTER_WORDS[hit.kind]} counter${step === 1 ? '' : 's'} ${hit.remove ? 'from' : 'to'} ${name}.`,
    };
  }
  const table = { power: ['power'], toughness: ['toughness'], both: ['power', 'toughness'] };
  if (!Object.hasOwn(table, hit.mark)) throw new Error('That is not part of the change.');
  const parts = table[hit.mark];
  return {
    run: (game, uid) => parts.reduce((next, part) => changeModifier(next, uid, part, delta), game),
    message: (name) => `${name}: ${parts.length === 2 ? 'power and toughness' : parts[0]} ${hit.remove ? 'down' : 'up'} by ${step}.`,
  };
}
