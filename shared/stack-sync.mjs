// The stack window on the live table (Kevin, 2026-11-20): one stack for the whole table, at tables/{code}/stack, that every player sees and any player can change (a casual table: players take turns,
// and the last change wins). Plain logic with no browser code (scripts/test-stack-sync.mjs). The stack itself is shared/stack.mjs; this turns it into what is stored and back.
//
// Stored: { next, by, items: [{ id, k: 'c', o, c } | { id, k: 't', o, t }], arrows: [{ id, from, ti } | { id, from, tc, to }] }
//   next: the number the next id is made from; by: who changed it last (a player's uid);
//   an item: id 's12', k card or text, o the player who put it there, c the card (stored like a card of a zone, under the id of the real card it copies, shared/game-sync.mjs packCard), t a note;
//   an arrow: id 'a5', from an item id, to another item (ti) or to a real card (tc, its id, and to, whose card it is).
// Undo is kept by each page for its own changes (not stored).
import { packCard, unpackCard } from './game-sync.mjs';
import { MAX_ITEMS, MAX_ARROWS, MAX_TEXT, cleanText } from './stack.mjs';

const ITEM_ID = /^s[1-9][0-9]{0,8}$/;
const ARROW_ID = /^a[1-9][0-9]{0,8}$/;
const CARD_ID = /^c[1-9][0-9]{0,5}$/;
const PLAYER = /^[A-Za-z0-9_-]{1,128}$/;
const listOf = (value) => (Array.isArray(value) ? value : value && typeof value === 'object' ? Object.keys(value).sort((a, b) => Number(a) - Number(b)).map((key) => value[key]) : []);

// A stack to what is stored, or null for an empty one (nothing is kept). me: your uid (by, and the owner of items that have none yet). match: the table's match number (m: a stack of another match
// is not shown, readStack).
export function packStack(stack, me, match = 1) {
  if (!stack || (stack.items.length === 0 && stack.arrows.length === 0)) return null;
  const items = stack.items.slice(0, MAX_ITEMS).map((item) => (item.kind === 'card'
    ? { id: item.id, k: 'c', o: item.owner ?? me, c: packCard({ ...item.card, uid: CARD_ID.test(item.card.src ?? '') ? item.card.src : 'c1' }) }
    : { id: item.id, k: 't', o: item.owner ?? me, t: cleanText(item.text) || '...' }));
  const arrows = stack.arrows.slice(0, MAX_ARROWS).map((arrow) => (arrow.to.item !== undefined
    ? { id: arrow.id, from: arrow.from, ti: arrow.to.item }
    : { id: arrow.id, from: arrow.from, tc: arrow.to.card, to: arrow.to.owner ?? me }));
  return { next: stack.next, by: me, m: match, items, ...(arrows.length ? { arrows } : {}) };
}

// What is stored (any player's browser wrote it) back to a stack: only items and arrows of exactly the right shape survive. lookup: the card list (the type of a card, as for a card of a zone).
// match: the table's match number now; a stack stored in another match is an empty stack (null: do not look).
export function readStack(stored, lookup = () => null, match = null) {
  const empty = { items: [], arrows: [], next: 1, past: [] };
  if (!stored || typeof stored !== 'object') return empty;
  if (match !== null && stored.m !== match) return { ...empty, next: Number.isInteger(stored.next) && stored.next >= 1 && stored.next <= 1e9 ? stored.next : 1 };
  const items = [];
  const seen = new Set();
  for (const raw of listOf(stored.items).slice(0, MAX_ITEMS)) {
    if (!raw || typeof raw !== 'object' || !ITEM_ID.test(raw.id ?? '') || seen.has(raw.id)) continue;
    const owner = typeof raw.o === 'string' && PLAYER.test(raw.o) ? raw.o : null;
    if (raw.k === 'c') {
      const card = unpackCard(raw.c, lookup);
      if (!card) continue;
      items.push({ id: raw.id, kind: 'card', owner, card: { ...card, src: card.uid, uid: `stack-${raw.id}` } });
    } else if (raw.k === 't' && typeof raw.t === 'string') {
      items.push({ id: raw.id, kind: 'text', owner, text: cleanText(raw.t).slice(0, MAX_TEXT) });
    } else continue;
    seen.add(raw.id);
  }
  const arrows = [];
  for (const raw of listOf(stored.arrows).slice(0, MAX_ARROWS)) {
    if (!raw || typeof raw !== 'object' || !ARROW_ID.test(raw.id ?? '') || !seen.has(raw.from)) continue;
    if (items.find((item) => item.id === raw.from)?.kind !== 'card') continue;
    if (typeof raw.ti === 'string' && seen.has(raw.ti) && raw.ti !== raw.from) arrows.push({ id: raw.id, from: raw.from, to: { item: raw.ti } });
    else if (typeof raw.tc === 'string' && CARD_ID.test(raw.tc) && typeof raw.to === 'string' && PLAYER.test(raw.to)) arrows.push({ id: raw.id, from: raw.from, to: { card: raw.tc, owner: raw.to } });
  }
  const used = [...items.map((item) => Number(item.id.slice(1))), ...arrows.map((arrow) => Number(arrow.id.slice(1)))];
  const next = Number.isInteger(stored.next) && stored.next >= 1 && stored.next <= 1e9 ? stored.next : 1;
  return { items, arrows, next: Math.max(next, ...used.map((n) => n + 1)), past: [] };
}

// Whether two stacks show the same thing (the page skips a redraw, and keeps its Undo, when the database sends back what it already has).
export const sameStack = (a, b) => JSON.stringify([a?.items, a?.arrows, a?.next]) === JSON.stringify([b?.items, b?.arrows, b?.next]);
