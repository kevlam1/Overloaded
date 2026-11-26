// The phase of a turn (the redesign, step 4, Kevin 2026-11-24/25): a reminder of where a player is in their turn, shown in the top bar. Nothing happens by itself:
// the player whose turn it is sets it (a click on a step, or a key), and a new turn starts at Untap. On the live table it is stored as ONE record on that player's public
// branch, `phase: { n, s }` (n the table's turn number it belongs to, s the step), so a record from an earlier turn reads as Untap. Plain data, no browser code.

export const PHASES = [
  { id: 'untap', name: 'Untap' },
  { id: 'upkeep', name: 'Upkeep' },
  { id: 'draw', name: 'Draw' },
  { id: 'main1', name: 'Main 1' },
  { id: 'combat', name: 'Combat' },
  { id: 'main2', name: 'Main 2' },
  { id: 'end', name: 'End' },
];
export const LAST_PHASE = PHASES.length - 1;
export const MAX_TURN = 100000; // (the same limit as a pass record)

const wholeIn = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;

// A stored record, read strictly: { n, s } with whole numbers in range, or null.
export function readPhase(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (Object.keys(raw).some((key) => key !== 'n' && key !== 's')) return null;
  return wholeIn(raw.n, 1, MAX_TURN) && wholeIn(raw.s, 0, LAST_PHASE) ? { n: raw.n, s: raw.s } : null;
}

// The step a player is on in this turn: the record's step when it belongs to this turn, else Untap (0).
export function phaseIn(record, turn) {
  const clean = readPhase(record);
  return clean && clean.n === turn ? clean.s : 0;
}

// The record for step s of turn n; refuses anything out of range.
export function phaseRecord(turn, step) {
  if (!wholeIn(turn, 1, MAX_TURN) || !wholeIn(step, 0, LAST_PHASE)) throw new Error('That is not a step of a turn.');
  return { n: turn, s: step };
}

// The step after this one (End stays End: passing the turn is its own button).
export const nextStep = (step) => Math.min(LAST_PHASE, (wholeIn(step, 0, LAST_PHASE) ? step : 0) + 1);
