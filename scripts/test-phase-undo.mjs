// The phase of a turn (shared/phase.mjs) and undo (shared/undo.mjs). One check per behavior.
import { PHASES, readPhase, phaseIn, phaseRecord, nextStep } from '../shared/phase.mjs';
import { emptyUndo, remember, canUndo, takeBack, undoWords, UNDO_LIMIT } from '../shared/undo.mjs';

let checks = 0;
const same = (label, got, want) => { checks += 1; if (JSON.stringify(got) !== JSON.stringify(want)) { console.log('FAILED CHECK:', label, JSON.stringify(got), 'expected', JSON.stringify(want)); process.exit(1); } };
const throws = (label, run) => { checks += 1; try { run(); } catch { return; } console.log('FAILED CHECK:', label, 'did not throw'); process.exit(1); };

same('a turn has seven steps, Untap to End', PHASES.map((p) => p.name), ['Untap', 'Upkeep', 'Draw', 'Main 1', 'Combat', 'Main 2', 'End']);
same('a record of this turn gives its step; one of an earlier turn, or none, gives Untap', [phaseIn({ n: 5, s: 4 }, 5), phaseIn({ n: 4, s: 4 }, 5), phaseIn(null, 5)], [4, 0, 0]);
same('a damaged record reads as nothing', [readPhase({ n: 5, s: 7 }), readPhase({ n: 0, s: 1 }), readPhase({ n: 5, s: 1, x: 1 }), readPhase('5:1'), readPhase({ n: 5.5, s: 1 })], [null, null, null, null, null]);
same('the next step follows, and End stays End', [nextStep(0), nextStep(5), nextStep(6)], [1, 6, 6]);
throws('a record out of range is refused', () => phaseRecord(3, 9));

const g1 = { id: 1 }; const g2 = { id: 2 };
let undo = remember(remember(emptyUndo(), g1, 'Played Forest.'), g2, 'Drew a card.');
const back = takeBack(undo);
same('undo gives back the game from before the last move, with its words', [back.game, undoWords(back.label), canUndo(back.undo)], [g2, 'Undid: Drew a card.', true]);
same('the same game is not remembered twice in a row, and no game is never remembered', [remember(undo, g2).steps.length, remember(undo, null).steps.length], [2, 2]);
for (let i = 0; i < UNDO_LIMIT + 5; i++) undo = remember(undo, { id: 100 + i });
same(`at most ${UNDO_LIMIT} steps are kept, the oldest go first`, [undo.steps.length, undo.steps[0].game.id], [UNDO_LIMIT, 105]);
same('with nothing remembered there is nothing to undo', [canUndo(emptyUndo()), takeBack(emptyUndo())], [false, null]);

console.log(`All ${checks} phase and undo checks passed.`);
