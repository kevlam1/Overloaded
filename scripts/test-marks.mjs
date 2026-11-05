// Checks shared/marks.mjs: how a typed amount is read and what a card shows about counters and its power/toughness change.
// Run from the repo root:  node scripts/test-marks.mjs
import { parseAmount, shortNumber, changeLabel, changeParts, counterChips, marksSentence, markClick } from '../shared/marks.mjs';
import { NUMBER_LIMIT, COUNTER_KINDS, makeGame, moveCard, seededRandom } from '../shared/zones.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };

// ---- a typed amount ----
same('a plain number', parseAmount('5'), 5);
same('spaces around it are ignored', parseAmount('  12  '), 12);
same('commas between digits are allowed', parseAmount('1,500,000'), 1500000);
same('spaces and underscores between digits are allowed', [parseAmount('2 000'), parseAmount('3_000')], [2000, 3000]);
same('the limit itself is allowed', parseAmount('1000000000000'), NUMBER_LIMIT);
same('one past the limit is refused', parseAmount('1000000000001'), null);
same('a number with 16 digits, or 400, is refused (over the limit)', [parseAmount('1000000000000000'), parseAmount('9'.repeat(400))], [null, null]);
same('zero is refused', [parseAmount('0'), parseAmount('000')], [null, null]);
same('leading zeros are read as the number', parseAmount('007'), 7);
for (const bad of ['', '   ', '-1', '+1', '1.5', '1e9', '0x10', 'ten', '1 a', 'NaN', 'Infinity', String.fromCharCode(0x661)]) same(`"${bad}" is refused`, parseAmount(bad), null);
for (const bad of [null, undefined]) same(`${String(bad)} is refused`, parseAmount(bad), null);
same('a number given as a number is read', [parseAmount(7), parseAmount(7.5), parseAmount(-3)], [7, null, null]);

// ---- a number short enough for a label ----
same('below 10,000 it is exact', [shortNumber(0), shortNumber(7), shortNumber(9999), shortNumber(-9999)], ['0', '7', '9999', '-9999']);
same('thousands', [shortNumber(10000), shortNumber(12345), shortNumber(999000)], ['10K', '12.3K', '999K']);
same('millions, billions and a trillion', [shortNumber(4500000), shortNumber(6700000000), shortNumber(NUMBER_LIMIT)], ['4.5M', '6.7B', '1T']);
same('a negative keeps its sign', shortNumber(-4500000), '-4.5M');

// ---- the power and toughness change ----
same('nothing, nothing to show', [changeLabel({}), changeLabel({ ct: {} }), changeLabel(null), changeLabel(undefined)], ['', '', '', '']);
same('+1/+1 counters count for both', changeLabel({ ct: { p: 3 } }), '+3/+3');
same('-1/-1 counters count against both', changeLabel({ ct: { m: 2 } }), '-2/-2');
same('the modifier alone', changeLabel({ mp: 2, mt: -1 }), '+2/-1');
same('three +1/+1 counters and a +2/+0 modifier make +5/+3', changeLabel({ ct: { p: 3 }, mp: 2 }), '+5/+3');
same('a part that is 0 still shows its sign', changeLabel({ mp: 2 }), '+2/+0');
same('loyalty and other counters change nothing', changeLabel({ ct: { l: 4, c: 2, t: 1, o: 9 } }), '');
same('a change that adds up to nothing shows nothing', changeLabel({ ct: { p: 2 }, mp: -2, mt: -2 }), '');
same('the short label shortens big numbers', changeLabel({ mp: 5000000000, mt: 12000 }), '+5B/+12K');
same('the full label keeps every digit', changeLabel({ mp: 5000000000, mt: 12000 }, false), '+5,000,000,000/+12,000');

// ---- the counters ----
same('no counters, no chips', [counterChips({}), counterChips({ ct: {} }), counterChips(null)], [[], [], []]);
same('a chip for each kind in a fixed order, whatever the order stored', counterChips({ ct: { o: 1, p: 3, l: 2 } }).map((chip) => chip.kind), ['p', 'l', 'o']);
same('a chip has the word, the count and the text', counterChips({ ct: { p: 3 } }), [{ kind: 'p', word: '+1/+1', count: 3, text: '+1/+1 3' }]);
same('a big count is short in the text and exact in the count', counterChips({ ct: { c: 2500000000 } }), [{ kind: 'c', word: 'Charge', count: 2500000000, text: 'Charge 2.5B' }]);
same('a zero or missing count shows nothing', counterChips({ ct: { p: 0, m: undefined } }), []);
same('every kind has a chip', counterChips({ ct: Object.fromEntries(COUNTER_KINDS.map((kind) => [kind, 1])) }).length, COUNTER_KINDS.length);

// ---- the sentence ----
same('nothing, no sentence', marksSentence({}), '');
same('counters only', marksSentence({ ct: { l: 4 } }), 'Counters: Loyalty 4.');
same('counters and a change', marksSentence({ ct: { p: 3, o: 1 }, mp: 2 }), 'Counters: +1/+1 3, Other 1. Change: +5/+3.');
same('a change only', marksSentence({ mt: -1 }), 'Change: +0/-1.');
same('big numbers keep every digit in the sentence', marksSentence({ ct: { p: 1500000 } }), 'Counters: +1/+1 1,500,000. Change: +1,500,000/+1,500,000.');

// ---- the change in two pieces ----
same('no change, no pieces', [changeParts({}), changeParts({ ct: { l: 3 } }), changeParts(null)], [null, null, null]);
same('the pieces of +5/+3', changeParts({ ct: { p: 3 }, mp: 2 }), { power: '+5', toughness: '+3' });
same('a part that is 0 keeps its sign', changeParts({ mt: -4 }), { power: '+0', toughness: '-4' });
same('short and full pieces differ for big numbers', [changeParts({ mp: 5000000000 }, true).power, changeParts({ mp: 5000000000 }, false).power], ['+5B', '+5,000,000,000']);
same('the pieces joined with a slash are the label', changeLabel({ ct: { p: 3 }, mp: 2 }), `${changeParts({ ct: { p: 3 }, mp: 2 }).power}/${changeParts({ ct: { p: 3 }, mp: 2 }).toughness}`);

// ---- a click on a chip or the change label of a card ----
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const clickDeck = { cards: [{ i: id(1), n: 'Forest', qty: 30, section: 'main' }], commander: [] };
let clickGame = makeGame(clickDeck, () => ({ t: 'Basic Land - Forest', m: '', k: [] }), { random: seededRandom(3) });
const clickUid = clickGame.zones.hand[0].uid;
clickGame = moveCard(clickGame, clickUid, 'battlefield');
const cardNow = (game) => game.zones.battlefield.find((card) => card.uid === clickUid);
const after = (game, hit) => markClick(hit).run(game, clickUid);
same('a plain click on a chip adds one counter of that kind', cardNow(after(clickGame, { mark: 'chip', kind: 'l' })).ct, { l: 1 });
same('Shift adds ten', cardNow(after(clickGame, { mark: 'chip', kind: 'c', big: true })).ct, { c: 10 });
same('a right-click takes one off', cardNow(after(after(clickGame, { mark: 'chip', kind: 'l', big: true }), { mark: 'chip', kind: 'l', remove: true })).ct, { l: 9 });
same('Shift and right-click takes ten off, and a count stops at 0', cardNow(after(after(clickGame, { mark: 'chip', kind: 'l' }), { mark: 'chip', kind: 'l', remove: true, big: true })).ct, undefined);
same('a click on the power half raises power only', [cardNow(after(clickGame, { mark: 'power' })).mp, cardNow(after(clickGame, { mark: 'power' })).mt], [1, undefined]);
same('a click on the toughness half raises toughness only', [cardNow(after(clickGame, { mark: 'toughness' })).mp, cardNow(after(clickGame, { mark: 'toughness' })).mt], [undefined, 1]);
same('a click on the slash raises both', [cardNow(after(clickGame, { mark: 'both' })).mp, cardNow(after(clickGame, { mark: 'both' })).mt], [1, 1]);
same('a right-click on the slash lowers both, Shift makes it ten', [cardNow(after(clickGame, { mark: 'both', remove: true, big: true })).mp, cardNow(after(clickGame, { mark: 'both', remove: true, big: true })).mt], [-10, -10]);
same('a click on a +1/+1 chip of a card with -1/-1 counters cancels them, as the rules do', cardNow(after(after(clickGame, { mark: 'chip', kind: 'm', big: true }), { mark: 'chip', kind: 'p' })).ct, { m: 9 });
same('the messages say what happened', [markClick({ mark: 'chip', kind: 'p' }).message('Elf'), markClick({ mark: 'chip', kind: 'l', remove: true, big: true }).message('Elf'), markClick({ mark: 'power' }).message('Elf'), markClick({ mark: 'both', remove: true }).message('Elf'), markClick({ mark: 'toughness', big: true }).message('Elf')],
  ['Added 1 +1/+1 counter to Elf.', 'Removed 10 Loyalty counters from Elf.', 'Elf: power up by 1.', 'Elf: power and toughness down by 1.', 'Elf: toughness up by 10.']);
for (const bad of [{ mark: 'chip', kind: 'z' }, { mark: 'chip' }, { mark: 'chip', kind: '__proto__' }, { mark: 'nothing' }, { mark: 'constructor' }, {}]) {
  checks++;
  let threw = false;
  try { markClick(bad); } catch { threw = true; }
  if (!threw) fail(`a click on ${JSON.stringify(bad)} is refused`, 'it was accepted');
}
checks++;
try { markClick({ mark: 'power' }).run(clickGame, 'c99999'); fail('a click on a card that is not in the game is refused', 'it was accepted'); } catch (error) { if (!/not in the game/.test(error.message)) fail('a click on a card that is not in the game is refused', error.message); }
checks++;
try { markClick({ mark: 'power' }).run(moveCard(clickGame, clickUid, 'hand'), clickUid); fail('a click on a card in the hand is refused', 'it was accepted'); } catch (error) { if (!/battlefield/.test(error.message)) fail('a click on a card in the hand is refused', error.message); }

console.log(`All ${checks} marks checks passed.`);
