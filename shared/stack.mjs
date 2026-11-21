// The stack window (Kevin, 2026-11-17): a visual aid for the spells and abilities that are waiting. A vertical list: the card at index 0 is the TOP of the stack (the one that resolves first), and
// text boxes can sit between the cards to say what is going on. A card on the stack is a COPY of the card as it was when it was added (counters, power and toughness change, marks, picture),
// so later changes to the real card do not touch it and the real card is never moved. Plain logic with no browser code so Node tests can load it (scripts/test-stack.mjs).
// Every function returns a NEW stack and never changes the old one. Nothing here is saved or sent anywhere: the solo table only.
//
// A stack is { items, arrows, next, past }:
//   items: [{ id, kind: 'card', card } | { id, kind: 'text', text }], index 0 on top;
//   arrows: [{ id, from, to }] (Kevin, 2026-11-17): an arrow from a CARD of the stack (from is its item id) to a target, which is another item of the stack ({ item: id }) or a real card of the game
//     ({ card: uid }, for example a creature on the battlefield). An arrow goes when the item it starts from or points to is taken off the stack; one that points at a real card stays (the page hides it while
//     that card is not on the table);
//   next: the number the next item or arrow id is made from; past: earlier { items, arrows }, newest last, for Undo.
export const MAX_ITEMS = 40; // cards and text boxes together
export const MAX_TEXT = 160; // letters in one text box
export const MAX_UNDO = 30; // how many changes Undo can take back
export const MAX_ARROWS = 24;

export const emptyStack = () => ({ items: [], arrows: [], next: 1, past: [] });

const fail = (message) => { throw new Error(message); };
const indexOfItem = (stack, id) => stack.items.findIndex((item) => item.id === id);
const need = (stack, id) => { const index = indexOfItem(stack, id); if (index < 0) fail('Not on the stack.'); return index; };
const full = (stack) => { if (stack.items.length >= MAX_ITEMS) fail('Stack full.'); };

// The arrows that still have both ends: the ones whose item (and target item) are in the list.
const stillThere = (arrows, items) => arrows.filter((arrow) => items.some((item) => item.id === arrow.from) && (arrow.to.item === undefined || items.some((item) => item.id === arrow.to.item)));

// A change: the new list of items (and arrows: the old ones that still have both ends, unless the change gives its own), the old state kept for Undo (at most MAX_UNDO of them).
function changed(stack, items, extra = {}) {
  const arrows = extra.arrows ?? stillThere(stack.arrows, items);
  return { items, next: stack.next, past: [...stack.past, { items: stack.items, arrows: stack.arrows }].slice(-MAX_UNDO), ...extra, arrows };
}

// The text of a text box as it is kept: control characters and runs of spaces tidied, cut to MAX_TEXT letters.
const ranges = [[0x00, 0x1f], [0x7f, 0x7f], [0x200b, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069]]; // control and invisible direction characters
const UNSEEN = new RegExp('[' + ranges.map(([from, to]) => String.fromCharCode(from) + '-' + String.fromCharCode(to)).join('') + ']', 'g');
export function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(UNSEEN, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

// A copy of a game card for the stack. It keeps every field (counters, the power and toughness change, tapped, marks, which printing), and gets a uid of its own so it never collides with a real card
// (the page draws it with its own set of card buttons, keyed by uid). Fields that are not plain data are dropped by the copy.
export function copyForStack(card, id) {
  if (!card || typeof card !== 'object' || typeof card.n !== 'string') fail('That is not a card.');
  const copy = JSON.parse(JSON.stringify(card));
  if (typeof card.uid === 'string' && /^c[1-9][0-9]{0,5}$/.test(card.uid)) copy.src = card.uid; // (the real card it is a copy of: the live table stores the copy under that card's own id, shared/stack-sync.mjs)
  copy.uid = `stack-${id}`;
  return copy;
}

// Puts a copy of the card on TOP of the stack.
export function addCard(stack, card) {
  full(stack);
  const id = `s${stack.next}`;
  return changed(stack, [{ id, kind: 'card', card: copyForStack(card, id) }, ...stack.items], { next: stack.next + 1 });
}

// Puts an empty text box at a place in the list (index 0 is above everything, items.length below everything). Returns the new stack and the id of the box, so the page can focus it.
export function addText(stack, index = 0, text = '') {
  full(stack);
  const at = Number.isInteger(index) ? Math.min(stack.items.length, Math.max(0, index)) : 0;
  const id = `s${stack.next}`;
  const items = [...stack.items.slice(0, at), { id, kind: 'text', text: cleanText(text) }, ...stack.items.slice(at)];
  return { stack: changed(stack, items, { next: stack.next + 1 }), id };
}

// Changes what a text box says. The same text is not a change (no Undo step for it). Typing is not undone one letter at a time: the page calls this when the box is left.
export function setText(stack, id, text) {
  const index = need(stack, id);
  const item = stack.items[index];
  if (item.kind !== 'text') fail('Only a text box has text.');
  const clean = cleanText(text);
  if (clean === item.text) return stack;
  return changed(stack, stack.items.map((entry, i) => (i === index ? { ...entry, text: clean } : entry)));
}

// Moves an item so it ends up at `toIndex` of the new list (0 is the top). Moving it where it already is is not a change.
export function moveItem(stack, id, toIndex) {
  const from = need(stack, id);
  if (!Number.isInteger(toIndex)) fail('Move it to a place in the list.');
  const to = Math.min(stack.items.length - 1, Math.max(0, toIndex));
  if (to === from) return stack;
  const items = [...stack.items];
  const [item] = items.splice(from, 1);
  items.splice(to, 0, item);
  return changed(stack, items);
}

export function removeItem(stack, id) {
  const index = need(stack, id);
  return changed(stack, stack.items.filter((_, i) => i !== index));
}

// The top card of the stack: the first CARD in the list (a text box above it does not count), or null.
export const topCard = (stack) => stack.items.find((item) => item.kind === 'card') ?? null;

// Resolves the top card: it is taken off, together with the text boxes above it (they were notes about it). Nothing happens to the game: this is a visual aid. Returns { stack, resolved } where
// resolved is the card taken off, or null (and the same stack) when there is no card.
export function resolveTop(stack) {
  const top = topCard(stack);
  if (!top) return { stack, resolved: null };
  const at = indexOfItem(stack, top.id);
  return { stack: changed(stack, stack.items.slice(at + 1)), resolved: top.card };
}

// Takes everything off the stack (Undo brings it back).
export function clearStack(stack) {
  if (stack.items.length === 0) return stack;
  return changed(stack, []);
}

export const canUndo = (stack) => stack.past.length > 0;

// Takes back the last change. The changes made since are not kept to redo (a visual aid: adding the card again is quick).
export function undo(stack) {
  if (!canUndo(stack)) return stack;
  const { items, arrows } = stack.past.at(-1);
  return { items, arrows, next: stack.next, past: stack.past.slice(0, -1) };
}

// ---- arrows ----
const CARD_UID = /^[A-Za-z0-9_-]{1,40}$/; // the uid of a real card of the game (c12, stack-s3 and the like): plain letters, numbers, dash and underscore

// Draws an arrow from a CARD of the stack to a target: { item: id } for another item of the stack (a card, not itself) or { card: uid } for a real card of the game. The same arrow twice, an arrow
// from a text box and more than MAX_ARROWS are refused in words. Returns { stack, id } (the id of the arrow) like addText.
export function addArrow(stack, fromId, to) {
  const from = stack.items[need(stack, fromId)];
  if (from.kind !== 'card') fail('Arrows start at cards.');
  let target;
  if (to && typeof to === 'object' && typeof to.item === 'string') {
    if (to.item === fromId) fail('Not itself.');
    const item = stack.items[need(stack, to.item)];
    if (item.kind !== 'card') fail('Point at a card.');
    target = { item: to.item };
  } else if (to && typeof to === 'object' && typeof to.card === 'string' && CARD_UID.test(to.card)) {
    target = { card: to.card, ...(typeof to.owner === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(to.owner) ? { owner: to.owner } : {}) }; // (owner: the player whose card it is, on the live table, where every player's cards are numbered from c1)
  } else fail('Point at a card.');
  if (stack.arrows.some((arrow) => arrow.from === fromId && arrow.to.item === target.item && arrow.to.card === target.card && arrow.to.owner === target.owner)) fail('Already there.');
  if (stack.arrows.length >= MAX_ARROWS) fail('Too many arrows.');
  const id = `a${stack.next}`;
  const arrows = [...stack.arrows, { id, from: fromId, to: target }];
  return { stack: changed(stack, stack.items, { arrows, next: stack.next + 1 }), id };
}

export function removeArrow(stack, arrowId) {
  if (!stack.arrows.some((arrow) => arrow.id === arrowId)) fail('No such arrow.');
  return changed(stack, stack.items, { arrows: stack.arrows.filter((arrow) => arrow.id !== arrowId) });
}

// Takes away every arrow that starts from, or points at, an item (nothing changes when it has none).
export function removeArrowsOf(stack, itemId) {
  const kept = stack.arrows.filter((arrow) => arrow.from !== itemId && arrow.to.item !== itemId);
  if (kept.length === stack.arrows.length) return stack;
  return changed(stack, stack.items, { arrows: kept });
}

export const arrowsOf = (stack, itemId) => stack.arrows.filter((arrow) => arrow.from === itemId || arrow.to.item === itemId);

// How many cards are on the stack (text boxes do not count).
export const cardCount = (stack) => stack.items.filter((item) => item.kind === 'card').length;

// The words for the window: what the list says to a screen reader.
export function summary(stack) {
  const cards = cardCount(stack);
  if (stack.items.length === 0) return 'The stack is empty.';
  const top = topCard(stack);
  return `${cards} ${cards === 1 ? 'card' : 'cards'} on the stack${top ? `, ${top.card.n} on top` : ''}.`;
}
