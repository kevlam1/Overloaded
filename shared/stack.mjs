// The stack window (Kevin, 2026-11-17): a visual aid for the spells and abilities that are waiting. A vertical list: the card at index 0 is the TOP of the stack (the one that resolves first), and
// text boxes can sit between the cards to say what is going on. A card on the stack is a COPY of the card as it was when it was added (counters, power and toughness change, marks, picture),
// so later changes to the real card do not touch it and the real card is never moved. Plain logic with no browser code so Node tests can load it (scripts/test-stack.mjs).
// Every function returns a NEW stack and never changes the old one. Nothing here is saved or sent anywhere: the solo table only.
//
// A stack is { items, next, past }:
//   items: [{ id, kind: 'card', card } | { id, kind: 'text', text }], index 0 on top;
//   next: the number the next item id is made from; past: earlier lists of items, newest last, for Undo.
export const MAX_ITEMS = 40; // cards and text boxes together
export const MAX_TEXT = 160; // letters in one text box
export const MAX_UNDO = 30; // how many changes Undo can take back

export const emptyStack = () => ({ items: [], next: 1, past: [] });

const fail = (message) => { throw new Error(message); };
const indexOfItem = (stack, id) => stack.items.findIndex((item) => item.id === id);
const need = (stack, id) => { const index = indexOfItem(stack, id); if (index < 0) fail('That is not on the stack.'); return index; };
const full = (stack) => { if (stack.items.length >= MAX_ITEMS) fail(`The stack is full (${MAX_ITEMS} items at most).`); };

// A change: the new list of items, the old one kept for Undo (at most MAX_UNDO of them).
function changed(stack, items, extra = {}) {
  return { items, next: stack.next, past: [...stack.past, stack.items].slice(-MAX_UNDO), ...extra };
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
  return { items: stack.past.at(-1), next: stack.next, past: stack.past.slice(0, -1) };
}

// How many cards are on the stack (text boxes do not count).
export const cardCount = (stack) => stack.items.filter((item) => item.kind === 'card').length;

// The words for the window: what the list says to a screen reader.
export function summary(stack) {
  const cards = cardCount(stack);
  if (stack.items.length === 0) return 'The stack is empty.';
  const top = topCard(stack);
  return `${cards} ${cards === 1 ? 'card' : 'cards'} on the stack${top ? `, ${top.card.n} on top` : ''}.`;
}
