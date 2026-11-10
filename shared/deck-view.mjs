// How a checked deck is laid out for people to read: grouped by card type. Plain data in, plain data out, no browser code, so Node tests can load it
// (scripts/test-deck-view.mjs). The input is the lines of a preview (shared/deck-preview.mjs) and the cards the player picked as commanders.
//
// The groups, in this order (a group with no cards is left out):
//   Not matched   lines the card list could not match (they stay visible so the counts add up)
//   Commander     the picked commander and partner (Commander format only)
//   Companion     the companion line of an import
//   Planeswalkers, Creatures, Battles, Instants, Sorceries, Artifacts, Enchantments, Lands, Other   the main deck by type
//   Sideboard
//   Maybeboard (not counted)
// A card with more than one type goes in the first of these that its front face has: Land, then Planeswalker, Creature, Battle, Instant, Sorcery, Artifact, Enchantment
// (so an Artifact Creature is a creature, an Artifact Land is a land, a Kindred Instant is an instant, and a creature that is also a planeswalker is a planeswalker). Inside a group the cards are sorted by name.

const EM_DASH = ' ' + String.fromCharCode(0x2014) + ' ';

// The order the types are looked for in a card (first match wins), and the order the groups are shown in.
const PRIORITY = ['land', 'planeswalker', 'creature', 'battle', 'instant', 'sorcery', 'artifact', 'enchantment'];
export const CATEGORY_ORDER = ['planeswalker', 'creature', 'battle', 'instant', 'sorcery', 'artifact', 'enchantment', 'land', 'other'];
export const CATEGORY_TITLES = { creature: 'Creatures', planeswalker: 'Planeswalkers', battle: 'Battles', instant: 'Instants', sorcery: 'Sorceries', artifact: 'Artifacts', enchantment: 'Enchantments', land: 'Lands', other: 'Other' };
export const GROUP_TITLES = { unmatched: 'Not matched', commander: 'Commander', companion: 'Companion', sideboard: 'Sideboard', maybeboard: 'Maybeboard (not counted)', ...CATEGORY_TITLES };

// The category of a card from its type line: the front face only ("Creature - Elf // Land" is a creature), the words before the dash.
export function categoryOf(typeLine) {
  const front = String(typeLine ?? '').split(' // ')[0].split(EM_DASH)[0].split(' - ')[0];
  const words = new Set(front.split(/\s+/).filter(Boolean).map((word) => word.toLowerCase()));
  return PRIORITY.find((type) => words.has(type)) ?? 'other';
}

const byName = (a, b) => a.name.localeCompare(b.name, 'en') || String(a.key).localeCompare(String(b.key));
const total = (lines) => lines.reduce((sum, line) => sum + line.qty, 0);
const group = (key, lines) => ({ key, title: GROUP_TITLES[key], lines, count: total(lines) });

// lines: preview.lines. commanderIds: the card ids picked as commanders ([] when the format has none). Returns [{ key, title, lines, count }].
// A line is { key, section, qty, status, card, name, ... }; a commander is taken from its line one copy at a time, so a line of 2 that holds a commander leaves 1 in its type group.
export function groupDeck(lines, { commanderIds = [] } = {}) {
  const wanted = commanderIds.filter(Boolean).slice(0, 2);
  const taken = new Set();
  const commanders = [];
  const rest = [];
  for (const line of lines) {
    const isPick = line.status === 'matched' && line.card && wanted.includes(line.card.i) && !taken.has(line.card.i) && !['sideboard', 'maybeboard', 'companion'].includes(line.section);
    if (!isPick) { rest.push(line); continue; }
    taken.add(line.card.i);
    commanders.push({ ...line, qty: 1, key: `${line.key}#commander` });
    if (line.qty > 1) rest.push({ ...line, qty: line.qty - 1 });
  }
  commanders.sort((a, b) => wanted.indexOf(a.card.i) - wanted.indexOf(b.card.i)); // the commander before the partner, as picked

  const unmatched = rest.filter((line) => line.status !== 'matched' && line.section !== 'maybeboard');
  const matchedMain = rest.filter((line) => line.status === 'matched' && !['companion', 'sideboard', 'maybeboard'].includes(line.section));
  const groups = [group('unmatched', unmatched.sort(byName)), group('commander', commanders)];
  groups.push(group('companion', rest.filter((line) => line.section === 'companion').sort(byName)));
  for (const key of CATEGORY_ORDER) groups.push(group(key, matchedMain.filter((line) => categoryOf(line.card.t) === key).sort(byName)));
  groups.push(group('sideboard', rest.filter((line) => line.section === 'sideboard').sort(byName)));
  groups.push(group('maybeboard', rest.filter((line) => line.section === 'maybeboard').sort(byName)));
  return groups.filter((entry) => entry.lines.length > 0);
}
