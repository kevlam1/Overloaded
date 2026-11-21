// Checks shared/stack-sync.mjs: the shared stack of the live table, stored and read back. Short on purpose. Run from the repo root: node scripts/test-stack-sync.mjs
import { packStack, readStack, sameStack } from '../shared/stack-sync.mjs';
import { emptyStack, addCard, addText, addArrow, MAX_ITEMS } from '../shared/stack.mjs';

let checks = 0;
function check(label, pass, detail = '') {
  checks++;
  if (!pass) { console.log(`FAILED CHECK: ${label}${detail ? ` (${detail})` : ''}`); process.exit(1); }
}

const card = (uid, n, extra = {}) => ({ uid, i: '00000000-0000-4000-8000-000000000001', n, ...extra });
let stack = addCard(emptyStack(), card('c7', 'Lightning Bolt'));
stack = addCard(stack, card('c9', 'Counterspell', { tapped: true }));
stack = addText(stack, 1, 'Bob responds').stack;
stack = addArrow(stack, stack.items[0].id, { item: stack.items[2].id }).stack;
stack = addArrow(stack, stack.items[2].id, { card: 'c3', owner: 'bobUid' }).stack;

const stored = packStack(stack, 'aliceUid');
check('an empty stack is stored as nothing', packStack(emptyStack(), 'me') === null);
check('stored: who changed it, each item with its kind and owner, a card under the id of the card it copies', stored.by === 'aliceUid' && stored.items.map((i) => i.k).join() === 'c,t,c' && stored.items.every((i) => i.o === 'aliceUid') && stored.items[0].c.u === 'c9' && stored.items[0].c.x === 1 && stored.items[1].t === 'Bob responds', JSON.stringify(stored.items[0]));
check('arrows: to an item, and to a real card with whose card it is', JSON.stringify(stored.arrows.map((a) => [a.ti ?? null, a.tc ?? null, a.to ?? null])) === JSON.stringify([[stack.items[2].id, null, null], [null, 'c3', 'bobUid']]));

const back = readStack(JSON.parse(JSON.stringify(stored)));
check('read back: the same items in the same order, the copies with their own uids, the arrows, the next number', back.items.map((i) => i.id).join() === stack.items.map((i) => i.id).join() && back.items[0].card.uid === `stack-${back.items[0].id}` && back.items[0].card.src === 'c9' && back.items[0].card.tapped === true && back.arrows.length === 2 && back.arrows[1].to.owner === 'bobUid' && back.next === stack.next);
check('reading the same thing twice gives the same stack', sameStack(back, readStack(JSON.parse(JSON.stringify(stored)))));

const hostile = { next: -5, items: { 0: { id: 's1', k: 'c', o: 'x', c: { u: 'c1', n: 'No id' } }, 1: { id: 's2', k: 't', o: 'x', t: 'ok' }, 2: { id: 'bad', k: 't', t: 'x' }, 3: { id: 's2', k: 't', t: 'twice' }, 4: { id: 's4', k: 'z' }, 5: 'junk' },
  arrows: { 0: { id: 'a1', from: 's2', ti: 's2' }, 1: { id: 'a2', from: 's9', ti: 's2' }, 2: { id: 'x', from: 's2' } } };
const cleaned = readStack(hostile);
check('a damaged or hostile stack keeps only what has the exact shape (a card with no id, a bad id, a second s2, an unknown kind, arrows from text or nowhere all go)', cleaned.items.map((i) => i.id).join() === 's2' && cleaned.arrows.length === 0 && cleaned.next === 3, JSON.stringify(cleaned));
check('at most the stack limit of items', readStack({ next: 1, items: Array.from({ length: MAX_ITEMS + 10 }, (_, k) => ({ id: `s${k + 1}`, k: 't', t: 'x' })) }).items.length === MAX_ITEMS);
check('nothing stored is an empty stack', readStack(null).items.length === 0 && readStack('x').next === 1);
check('the stack carries the match number, and a stack of another match shows as empty (its numbers go on)', packStack(stack, 'me', 3).m === 3 && readStack({ ...packStack(stack, 'me', 2) }, () => null, 3).items.length === 0 && readStack(packStack(stack, 'me', 3), () => null, 3).items.length === 3 && readStack(packStack(stack, 'me', 2), () => null, 3).next === stack.next);
console.log(`All ${checks} stack sync checks passed.`);
