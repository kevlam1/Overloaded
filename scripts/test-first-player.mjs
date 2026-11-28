// Tests for shared/first-player.mjs and the opener in shared/turn-order.mjs (2026-11-26 feedback: who goes first).
import { FIRST_CHOICES, readFirst, pickOpener, revealSequence } from '../shared/first-player.mjs';
import { currentTurn } from '../shared/turn-order.mjs';

let checks = 0;
const check = (label, condition, detail = '') => { checks++; if (!condition) { console.log(`FAILED CHECK: ${label}${detail ? ': ' + detail : ''}`); process.exit(1); } };
check('the choices are Random and the four seats; anything else is Random', FIRST_CHOICES.join() === 'random,1,2,3,4' && readFirst('5') === 'random' && readFirst(null) === 'random');
check('a chosen seat someone sits in opens', pickOpener('3', ['1', '3']) === '3');
check('a chosen seat no one sits in falls back to a random taken seat', ['1', '2'].includes(pickOpener('4', ['1', '2'], () => 0.99)));
check('Random spreads over every taken seat', new Set([0, 0.3, 0.6, 0.99].map((r) => pickOpener('random', ['1', '2', '4'], () => r))).size === 3);
check('no seats taken: no opener', pickOpener('random', []) === null);
const players = [{ seat: '1', name: 'A' }, { seat: '2', name: 'B' }, { seat: '3', name: 'C' }];
const steps = revealSequence(players, '2', 2);
check('the reveal goes round and stops on the opener', steps.length === 8 && steps.at(-1).seat === '2', JSON.stringify(steps.map((p) => p.seat)));
const members = { a: { seat: '1', name: 'A' }, b: { seat: '2', name: 'B' } };
check('the match opens with the opener’s turn', currentTurn({}, members, '2').seat === '2' && currentTurn({}, members, '2').turn === 1);
check('no opener, or an empty seat: the lowest seat', currentTurn({}, members).seat === '1' && currentTurn({}, members, '4').seat === '1');
check('once someone passes, the pass decides', currentTurn({ a: { pass: { n: 2, to: '1' } } }, members, '2').seat === '1');
console.log(`All first player checks passed (${checks}).`);
