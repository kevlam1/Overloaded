// What the command zone shows and does: up to two commanders, each with a commander tax counter. Plain data in, plain data out, no browser code, so Node tests can load it
// (scripts/test-commander-zone.mjs). The game itself (game.cmd, game.tax, changeTax) is in shared/zones.mjs.
//
// The tax is kept as how many times the commander has been cast from the command zone; each cast makes the next one cost 2 more. It is a counter the player moves by hand,
// like the paper game: nothing counts a cast for you.
import { ZONES, changeTax, commanderUids, MAX_CASTS } from './zones.mjs';

export const TAX_PER_CAST = 2;
// Whether the PUBLISHED database rules accept the tax and the list of commanders under public/{uid}. They do not yet, so the live table hides the tax and only the solo table has it.
// Change this, and only this (after the rules change is pasted), to turn it on for the live table too (and add the fields to shared/game-sync.mjs).
export const COMMANDER_TAX_PUBLISHED = true; // (2026-11-23: the live table stores the tax at public/{uid}/tax as its own write, so a database still on the old rules refuses only that write; the rules file accepts it)

const findCard = (game, uid) => {
  for (const zone of ZONES) {
    const card = game.zones[zone].find((candidate) => candidate.uid === uid);
    if (card) return { card, zone };
  }
  return null;
};

// One entry for each commander (at most two): { uid, slot (1 or 2), name, zone (where it is now), inZone (in the command zone), casts, tax (the extra cost now) }.
export function taxEntries(game) {
  return commanderUids(game).slice(0, 2).map((uid, index) => {
    const found = findCard(game, uid);
    const casts = Number.isInteger(game.tax?.[uid]) && game.tax[uid] > 0 ? game.tax[uid] : 0;
    return { uid, slot: index + 1, name: found?.card.n ?? 'Commander', zone: found?.zone ?? null, inZone: found?.zone === 'command', casts, tax: casts * TAX_PER_CAST };
  });
}

export const taxWords = (entry) => `Tax +${entry.tax}`;

// A step of the counter: { run(game) -> game, message } or null when the card is not a commander. delta is +1 (one more cast) or -1 (take one back).
export function taxAction(game, uid, delta) {
  const entry = taxEntries(game).find((candidate) => candidate.uid === uid);
  if (!entry || !Number.isInteger(delta) || delta === 0) return null;
  const casts = Math.min(MAX_CASTS, Math.max(0, entry.casts + delta));
  if (casts === entry.casts) return null; // (at 0, or at the most: nothing to do, so no message: Kevin's friends saw "cast 0 times" repeated in the history, 2026-11-26)
  return { run: (current) => changeTax(current, uid, delta), message: `${entry.name}: cast ${casts} ${casts === 1 ? 'time' : 'times'}, tax +${casts * TAX_PER_CAST}.` };
}

// ANOTHER player's two command slots (Kevin's friends, 2026-11-26: two taxes were added into one number, a commander's tax vanished once it was out, and a player with
// one commander showed one slot). Their list of commanders is not published, so the commanders are the cards in their command zone that are not emblems, plus any of
// their cards with a tax that is elsewhere (out on the battlefield, in the graveyard or exile, or hidden in their hand or library). In card-number order (c1 before c2:
// the commanders are dealt first), two slots, each { uid, name, inZone, casts, tax } or null (an empty slot).
// view: what shared/game-sync.mjs readPublic gives for that player ({ zones, tax }).
const cardNumber = (uid) => Number(String(uid).replace(/\D/g, '')) || 0;
export function otherCommandSlots(view) {
  const tax = view?.tax ?? {};
  const zones = view?.zones ?? {};
  const inZone = (zones.command ?? []).filter((card) => card && card.emb !== true);
  const seen = new Set(inZone.map((card) => card.uid));
  const elsewhere = ['battlefield', 'graveyard', 'exile'].flatMap((zone) => zones[zone] ?? []);
  const commanders = inZone.map((card) => ({ uid: card.uid, name: card.n, inZone: true }));
  for (const uid of Object.keys(tax)) {
    if (seen.has(uid) || !(tax[uid] > 0)) continue;
    seen.add(uid);
    const card = elsewhere.find((each) => each.uid === uid);
    commanders.push({ uid, name: card?.n ?? 'Commander', inZone: false });
  }
  const slots = commanders.sort((a, b) => cardNumber(a.uid) - cardNumber(b.uid)).slice(0, 2)
    .map((entry) => { const casts = Number.isInteger(tax[entry.uid]) && tax[entry.uid] > 0 ? tax[entry.uid] : 0; return { ...entry, casts, tax: casts * TAX_PER_CAST }; });
  while (slots.length < 2) slots.push(null);
  return slots;
}
