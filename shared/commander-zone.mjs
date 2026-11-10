// What the command zone shows and does: up to two commanders, each with a commander tax counter. Plain data in, plain data out, no browser code, so Node tests can load it
// (scripts/test-commander-zone.mjs). The game itself (game.cmd, game.tax, changeTax) is in shared/zones.mjs.
//
// The tax is kept as how many times the commander has been cast from the command zone; each cast makes the next one cost 2 more. It is a counter the player moves by hand,
// like the paper game: nothing counts a cast for you.
import { ZONES, changeTax, commanderUids } from './zones.mjs';

export const TAX_PER_CAST = 2;
// Whether the PUBLISHED database rules accept the tax and the list of commanders under public/{uid}. They do not yet, so the live table hides the tax and only the solo table has it.
// Change this, and only this (after the rules change is pasted), to turn it on for the live table too (and add the fields to shared/game-sync.mjs).
export const COMMANDER_TAX_PUBLISHED = false;

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
  const casts = Math.max(0, entry.casts + delta);
  return { run: (current) => changeTax(current, uid, delta), message: `${entry.name}: cast ${casts} ${casts === 1 ? 'time' : 'times'}, tax +${casts * TAX_PER_CAST}.` };
}
