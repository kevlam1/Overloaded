// Undo for your own game (the redesign, step 4, Kevin 2026-11-24/25): before each move the page remembers the game as it was, and Undo puts the last one back.
// At most UNDO_LIMIT steps. It never crosses a turn: the page clears it when a turn is passed or starts, and on a new game or match. On the live table the game put back
// is saved like any other move (only what differs is written), so no database change is needed. Plain data: the games are the immutable games of shared/zones.mjs.

export const UNDO_LIMIT = 30;

export const emptyUndo = () => ({ steps: [] });

// Remembers `game` (the game BEFORE a move) with a few words about the move. Nothing is remembered for no game, or the same game twice in a row.
export function remember(undo, game, label = '') {
  if (!game) return undo;
  const steps = undo.steps;
  if (steps.length && steps[steps.length - 1].game === game) return undo;
  return { steps: [...steps, { game, label: String(label ?? '') }].slice(-UNDO_LIMIT) };
}

export const canUndo = (undo) => undo.steps.length > 0;

// The last remembered game and the undo without it, or null when there is nothing to undo.
export function takeBack(undo) {
  if (!canUndo(undo)) return null;
  const last = undo.steps[undo.steps.length - 1];
  return { undo: { steps: undo.steps.slice(0, -1) }, game: last.game, label: last.label };
}

// The words for an undo: "Undid: Played Forest." or "Undid the last move."
export const undoWords = (label) => (label ? `Undid: ${label}` : 'Undid the last move.');
