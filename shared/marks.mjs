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

// The whole numbers in a printed "2/2" (the card list's pt); null for a star or anything else ("*/1+*", "?/?").
export function parsePrinted(printed) {
  if (typeof printed !== 'string') return null;
  const match = /^(-?[0-9]+)[/](-?[0-9]+)$/.exec(printed);
  return match ? { power: Number(match[1]), toughness: Number(match[2]) } : null;
}

// The power and toughness a card has now: the printed numbers plus the counters and the hand-set change. null when the printed
// ones are not two whole numbers. shift is -1, 0 or 1 per number: lower than printed, as printed, higher.
export function statsOf(card, printed) {
  const base = parsePrinted(printed);
  if (!base) return null;
  const net = netChange(card);
  return { power: base.power + net.power, toughness: base.toughness + net.toughness, base, shift: { power: Math.sign(net.power), toughness: Math.sign(net.toughness) } };
}

// The printed power and toughness of a card on the table, as text, or null. A token carries its own (its name can equal a real
// card's, so it is never looked up); any other card is looked up in the card list by id, then name (shared/card-lookup.mjs).
// A card turned over to its back face shows the back's numbers, and none if the back has none (a land): never the front's.
export function printedOf(card, lookup) {
  if (!card) return null;
  if (card.tok) return typeof card.pt === 'string' ? card.pt : null;
  const known = typeof lookup === 'function' ? lookup(card) : null;
  const printed = card.turned === true ? known?.bpt : known?.pt;
  return typeof printed === 'string' ? printed : null;
}

// One sentence for the selected-card line and for screen readers: "Counters: +1/+1 3. Change: +5/+3. Now 5/4." ('' when there is
// nothing). printed (optional) is the card's printed power and toughness; with two whole numbers and a change, the sentence ends
// with what the card is now.
export function marksSentence(card, printed = null) {
  const parts = [];
  const chips = counterChips(card);
  if (chips.length) parts.push(`Counters: ${chips.map((chip) => `${chip.word} ${chip.count.toLocaleString('en-US')}`).join(', ')}.`);
  const change = changeLabel(card, false);
  if (change) parts.push(`Change: ${change}.`);
  const stats = change ? statsOf(card, printed) : null;
  if (stats) parts.push(`Now ${stats.power.toLocaleString('en-US')}/${stats.toughness.toLocaleString('en-US')}.`);
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

// The short floating text after a click on a mark: what the click did to the card, and its tone ('up' for stronger, 'down' for
// weaker, 'plain' for counters that change no number). null for a mark that does not exist.
export function markToast(hit) {
  const step = hit.big ? 10 : 1;
  const sign = hit.remove ? '-' : '+';
  if (hit.mark === 'chip') {
    if (hit.kind === 'p' || hit.kind === 'm') {
      const stronger = (hit.kind === 'p') === !hit.remove;
      const mark = stronger ? '+' : '-';
      return { text: `${mark}${step}/${mark}${step}`, tone: stronger ? 'up' : 'down' };
    }
    return Object.hasOwn(COUNTER_WORDS, hit.kind) ? { text: `${sign}${step} ${COUNTER_WORDS[hit.kind]}`, tone: 'plain' } : null;
  }
  const tone = hit.remove ? 'down' : 'up';
  if (hit.mark === 'power') return { text: `${sign}${step} power`, tone };
  if (hit.mark === 'toughness') return { text: `${sign}${step} toughness`, tone };
  if (hit.mark === 'both') return { text: `${sign}${step}/${sign}${step}`, tone };
  return null;
}
