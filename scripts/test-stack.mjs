// Tests for shared/stack.mjs: the stack window's logic (a list of card copies and text boxes, top first, with Undo).
import { MAX_ITEMS, MAX_TEXT, MAX_UNDO, MAX_ARROWS, addArrow, removeArrow, removeArrowsOf, arrowsOf, emptyStack, cleanText, copyForStack, addCard, addText, setText, moveItem, removeItem, topCard, resolveTop, clearStack, canUndo, undo, cardCount, summary } from '../shared/stack.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const throws = (label, fn, pattern) => { checks++; try { fn(); } catch (error) { if (!pattern.test(error.message)) fail(label, `wrong message: ${error.message}`); return; } fail(label, 'did not throw'); };
const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const key of Object.keys(value)) freeze(value[key]); } return value; };

const bear = () => ({ uid: 'c7', i: 'abc', p: 'def', n: 'Grizzly Bears', tapped: true, ct: { p1p1: 2, lore: 1 }, mod: { p: 1, t: -1 }, sick: true, note: 'attacks' });
const bolt = () => ({ uid: 'c9', i: 'ghi', n: 'Lightning Bolt' });
const names = (stack) => stack.items.map((item) => (item.kind === 'card' ? item.card.n : `[${item.text}]`));

// the empty stack
same('an empty stack has no items and nothing to undo', [emptyStack().items, canUndo(emptyStack()), cardCount(emptyStack()), topCard(emptyStack())], [[], false, 0, null]);
same('the limits', [MAX_ITEMS, MAX_TEXT, MAX_UNDO], [40, 160, 30]);

// a copy keeps everything and has its own uid
const original = bear();
const copy = copyForStack(original, 's1');
same('the copy has every field of the card (counters, the change, tapped, marks, picture), a uid of its own, and the uid of the card it copies (src)', copy, { ...bear(), uid: 'stack-s1', src: 'c7' });
copy.ct.p1p1 = 9;
same('the copy is separate: changing it does not change the card', original.ct.p1p1, 2);
throws('a thing that is not a card is refused', () => copyForStack({ uid: 'x' }, 's1'), /not a card/);
throws('nothing is refused with a clear message too', () => copyForStack(null, 's1'), /not a card/);

// adding puts the card on top
let stack = freeze(addCard(emptyStack(), bear()));
stack = freeze(addCard(stack, bolt()));
same('the newest card is on top (index 0)', names(stack), ['Lightning Bolt', 'Grizzly Bears']);
same('every item has its own id and each card its own uid', [stack.items.map((i) => i.id), stack.items.map((i) => i.card.uid)], [['s2', 's1'], ['stack-s2', 'stack-s1']]);
same('the copy was taken when it was added, with the counters then', stack.items[1].card.ct, { p1p1: 2, lore: 1 });
same('adding does not change the stack it started from (frozen)', names(addCard(freeze(emptyStack()), bolt())), ['Lightning Bolt']);
same('the card that was added twice gets two copies', names(addCard(addCard(emptyStack(), bolt()), bolt())), ['Lightning Bolt', 'Lightning Bolt']);

// text boxes
let withText = addText(stack, 1, 'target: Bears');
same('a text box goes where it is asked (between the two cards)', names(withText.stack), ['Lightning Bolt', '[target: Bears]', 'Grizzly Bears']);
same('the text box has an id the page can focus', withText.id, 's3');
same('a place too far is brought to the end and a place before the start to the top', [names(addText(stack, 99, 'x').stack), names(addText(stack, -4, 'x').stack)], [['Lightning Bolt', 'Grizzly Bears', '[x]'], ['[x]', 'Lightning Bolt', 'Grizzly Bears']]);
same('a place of -1 is the top and a place past the end is the end (not the one before the last)', [names(addText(stack, -1, 'x').stack), names(addText(stack, 2, 'x').stack)], [['[x]', 'Lightning Bolt', 'Grizzly Bears'], ['Lightning Bolt', 'Grizzly Bears', '[x]']]);
same('a place that is not a number is the top', names(addText(stack, 'x', 'y').stack), ['[y]', 'Lightning Bolt', 'Grizzly Bears']);
same('text is tidied and cut', [cleanText('  a ' + String.fromCharCode(10) + String.fromCharCode(9) + ' b  '), cleanText('x'.repeat(500)).length, cleanText(7), cleanText('a' + String.fromCharCode(0) + 'b'), cleanText('a' + String.fromCharCode(0x202e) + 'b'), cleanText('a' + String.fromCharCode(0x200b) + 'b')], ['a b', 160, '', 'a b', 'a b', 'a b']);
same('a text box is not a card for the count', [cardCount(withText.stack), withText.stack.items.length], [2, 3]);
const edited = setText(withText.stack, 's3', '  new   words ');
same('setting the text changes it, tidied', names(edited), ['Lightning Bolt', '[new words]', 'Grizzly Bears']);
same('the same text is not a change (the same stack, no step for Undo)', setText(edited, 's3', 'new words') === edited, true);
throws('a card has no text to set', () => setText(stack, 's1', 'x'), /text box/);
throws('an item that is not there has no text', () => setText(stack, 'nope', 'x'), /Not on the stack/);

// moving
let moved = moveItem(stack, 's1', 0);
same('a card moved to the top is on top', names(moved), ['Grizzly Bears', 'Lightning Bolt']);
same('moving where it already is changes nothing (the same stack)', moveItem(stack, 's2', 0) === stack, true);
same('moving the LAST item past the end, or the FIRST before the start, is not a change (the same stack, no step for Undo)', [moveItem(stack, 's1', 50) === stack, moveItem(stack, 's2', -5) === stack], [true, true]);
same('a place past the end is the bottom, before the start the top', [names(moveItem(stack, 's2', 50)), names(moveItem(stack, 's1', -3))], [['Grizzly Bears', 'Lightning Bolt'], ['Grizzly Bears', 'Lightning Bolt']]);
same('a card moves past a text box', names(moveItem(withText.stack, 's2', 2)), ['[target: Bears]', 'Grizzly Bears', 'Lightning Bolt']);
throws('moving what is not there is refused', () => moveItem(stack, 'nope', 0), /Not on the stack/);
throws('moving to a place that is not a number is refused', () => moveItem(stack, 's1', 'top'), /place in the list/);

// removing
same('an item can be taken off from the middle', names(removeItem(withText.stack, 's3')), ['Lightning Bolt', 'Grizzly Bears']);
throws('removing what is not there is refused', () => removeItem(stack, 'nope'), /Not on the stack/);

// the top card and resolving
same('the top card is the first card, a text box above it does not count', topCard(addText(stack, 0, 'note').stack).card.n, 'Lightning Bolt');
const resolved = resolveTop(addText(stack, 0, 'about the bolt').stack);
same('resolving takes the top card AND the text boxes above it', [names(resolved.stack), resolved.resolved.n], [['Grizzly Bears'], 'Lightning Bolt']);
const keepBelow = resolveTop(withText.stack);
same('a text box below the top card stays', names(keepBelow.stack), ['[target: Bears]', 'Grizzly Bears']);
const none = resolveTop(addText(emptyStack(), 0, 'only a note').stack);
same('with no card there is nothing to resolve (the same stack)', [none.resolved, none.stack.items.length], [null, 1]);
same('resolving empties a stack of one card', resolveTop(addCard(emptyStack(), bolt())).stack.items, []);

// clearing
same('clear takes everything off', clearStack(withText.stack).items, []);
same('clearing an empty stack is not a change', (() => { const e = emptyStack(); return clearStack(e) === e; })(), true);

// undo
let u = emptyStack();
u = addCard(u, bear()); u = addCard(u, bolt());
same('Undo takes back the last card', names(undo(u)), ['Grizzly Bears']);
same('Undo twice gives the empty stack and then cannot go on (a third Undo is the same stack)', (() => { const back = undo(undo(u)); return [names(back), canUndo(back), undo(back) === back]; })(), [[], false, true]);
same('Undo brings back a resolved card and the text boxes', names(undo(resolveTop(addText(u, 0, 'a').stack).stack)), ['[a]', 'Lightning Bolt', 'Grizzly Bears']);
same('Undo brings back a cleared stack', names(undo(clearStack(u))), ['Lightning Bolt', 'Grizzly Bears']);
same('Undo takes back a move', names(undo(moveItem(u, 's1', 0))), ['Lightning Bolt', 'Grizzly Bears']);
same('Undo takes back a removal', names(undo(removeItem(u, 's2'))), ['Lightning Bolt', 'Grizzly Bears']);
same('Undo takes back a text change', names(undo(setText(addText(u, 0, 'a').stack, 's3', 'b'))), ['[a]', 'Lightning Bolt', 'Grizzly Bears']);
same('after an Undo the next id is not used again (a new card has a new id, not the one that was taken back)', addCard(undo(u), bolt()).items.map((i) => i.id), ['s3', 's1']);
{ let many = emptyStack(); for (let n = 0; n < MAX_UNDO + 10; n++) many = n % 2 ? addText(many, 0, 'x').stack : moveItem(addCard(many, bolt()), 's1', 0);
  same('Undo keeps at most 30 steps', many.past.length, MAX_UNDO); }

// the size limit
{ let many = emptyStack(); for (let n = 0; n < MAX_ITEMS; n++) many = addCard(many, bolt());
  same('the stack holds 40 items', many.items.length, MAX_ITEMS);
  throws('a 41st card is refused in words', () => addCard(many, bolt()), /full/);
  throws('a 41st text box is refused in words', () => addText(many, 0, 'x'), /full/);
  same('taking one off makes room', addCard(removeItem(many, 's1'), bolt()).items.length, MAX_ITEMS); }

// arrows (Kevin, 2026-11-17)
const names3 = (stack) => stack.items.map((item) => item.card.n);
let ar = freeze(addCard(addCard(addCard(emptyStack(), { uid: 'c1', n: 'Lightning Bolt' }), { uid: 'c2', n: 'Counterspell' }), { uid: 'c3', n: 'Giant Growth' }));
same('an empty stack has no arrows, and the limit', [emptyStack().arrows, MAX_ARROWS], [[], 24]);
const toCard = addArrow(ar, 's3', { card: 'c77' });
same('an arrow from a card of the stack to a real card of the game', [toCard.stack.arrows, toCard.id], [[{ id: 'a4', from: 's3', to: { card: 'c77' } }], 'a4']);
const toItem = addArrow(ar, 's3', { item: 's1' });
same('an arrow from one card of the stack to another', toItem.stack.arrows, [{ id: 'a4', from: 's3', to: { item: 's1' } }]);
same('adding an arrow does not change the stack it started from (frozen), keeps the items, and uses the next id', [ar.arrows, toItem.stack.items === ar.items, toItem.stack.next], [[], true, 5]);
same('an arrow can be undone, and Undo gives the arrows back as they were', [undo(toItem.stack).arrows, undo(undo(toItem.stack)).arrows.length], [[], 0]);
throws('an arrow from an item that is not there is refused', () => addArrow(ar, 'nope', { card: 'c1' }), /Not on the stack/);
throws('an arrow to an item that is not there is refused', () => addArrow(ar, 's3', { item: 'nope' }), /Not on the stack/);
throws('a card cannot point at itself', () => addArrow(ar, 's3', { item: 's3' }), /itself/);
throws('an arrow cannot start from a text box', () => addArrow(addText(ar, 0, 'note').stack, 's4', { card: 'c1' }), /start at cards/);
throws('an arrow cannot point at a text box', () => addArrow(addText(ar, 0, 'note').stack, 's3', { item: 's4' }), /Point at a card/);
throws('no target, junk and a bad uid are refused', () => addArrow(ar, 's3', null), /Point at a card/);
throws('a target that is a number is refused', () => addArrow(ar, 's3', 7), /Point at a card/);
throws('a uid with odd characters is refused', () => addArrow(ar, 's3', { card: 'c1 <b>' }), /Point at a card/);
throws('a uid that is empty is refused', () => addArrow(ar, 's3', { card: '' }), /Point at a card/);
throws('a uid that is too long is refused', () => addArrow(ar, 's3', { card: 'c'.repeat(41) }), /Point at a card/);
same('a uid of 40 letters is fine', addArrow(ar, 's3', { card: 'c'.repeat(40) }).stack.arrows.length, 1);
throws('the same arrow twice is refused', () => addArrow(toItem.stack, 's3', { item: 's1' }), /Already there/);
same('two arrows from one card to different targets, and the same target from different cards', [addArrow(toItem.stack, 's3', { item: 's2' }).stack.arrows.length, addArrow(toItem.stack, 's2', { item: 's1' }).stack.arrows.length], [2, 2]);
same('an arrow to a card of the stack and one to a real card with the same text are different', addArrow(addArrow(ar, 's3', { card: 's1' }).stack, 's3', { item: 's1' }).stack.arrows.length, 2);
{ let many = ar; for (let n = 0; n < MAX_ARROWS; n++) many = addArrow(many, 's3', { card: 'c' + n }).stack;
  same('the stack holds 24 arrows', many.arrows.length, MAX_ARROWS);
  throws('a 25th arrow is refused in words', () => addArrow(many, 's3', { card: 'extra' }), /Too many/); }
// removing arrows
same('an arrow is removed by its id', removeArrow(toItem.stack, 'a4').arrows, []);
throws('removing an arrow that is not there is refused', () => removeArrow(toItem.stack, 'a99'), /No such arrow/);
same('removing one of two arrows keeps the other', removeArrow(addArrow(toItem.stack, 's2', { card: 'c9' }).stack, 'a4').arrows.map((x) => x.id), ['a5']);
same('removing an arrow can be undone', undo(removeArrow(toItem.stack, 'a4')).arrows.length, 1);
const two = addArrow(toItem.stack, 's2', { card: 'c9' }).stack;
same('the arrows of one item (from it or to it) are taken away together, the others stay', [removeArrowsOf(two, 's1').arrows.map((a) => a.id), arrowsOf(two, 's1').map((a) => a.id), arrowsOf(two, 's3').map((a) => a.id), arrowsOf(two, 's2').map((a) => a.id)], [['a5'], ['a4'], ['a4'], ['a5']]);
same('an item that only STARTS an arrow loses it, one that only is pointed at loses it too', [removeArrowsOf(two, 's3').arrows.map((x) => x.id), removeArrowsOf(two, 's1').arrows.map((x) => x.id)], [['a5'], ['a5']]);
same('taking the arrows of an item that has none is not a change (the same stack)', removeArrowsOf(ar, 's1') === ar, true);
// arrows go with the items they are tied to
same('taking an item off takes its arrows (from it and to it) and keeps the others', [removeItem(two, 's3').arrows.map((a) => a.id), removeItem(two, 's1').arrows.map((a) => a.id), removeItem(two, 's2').arrows.map((a) => a.id)], [['a5'], ['a5'], ['a4']]);
same('an arrow to a real card stays when other items go (the card is not on the stack)', removeItem(addArrow(ar, 's3', { card: 'c1' }).stack, 's1').arrows.length, 1);
same('Undo of a removal brings the item and its arrows back', undo(removeItem(two, 's3')).arrows.map((a) => a.id), ['a4', 'a5']);
same('resolving the top card takes the arrows from it and to it', (() => { const r = resolveTop(addArrow(addArrow(ar, 's3', { item: 's2' }).stack, 's2', { card: 'c5' }).stack); return [names3(r.stack), r.stack.arrows.map((a) => a.id)]; })(), [['Counterspell', 'Lightning Bolt'], ['a5']]);
same('moving, adding a card and editing text keep the arrows', [moveItem(two, 's1', 0).arrows.length, addCard(two, { uid: 'c8', n: 'X' }).arrows.length, addText(two, 0, 'a').stack.arrows.length], [2, 2, 2]);
same('clearing the stack takes every arrow, and Undo brings them back', [clearStack(two).arrows, undo(clearStack(two)).arrows.length], [[], 2]);
same('a change that is not one (the same text) keeps the same stack with its arrows', (() => { const w = addText(two, 0, 'hello').stack; return setText(w, 's6', 'hello') === w; })(), true);

// the summary
same('the summary says empty, one card, and two cards with the top one', [summary(emptyStack()), summary(addCard(emptyStack(), bolt())), summary(stack), summary(addText(emptyStack(), 0, 'n').stack)], ['The stack is empty.', '1 card on the stack, Lightning Bolt on top.', '2 cards on the stack, Lightning Bolt on top.', '0 cards on the stack.']);

console.log(`All ${checks} stack checks passed.`);
