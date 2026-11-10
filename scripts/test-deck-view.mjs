// Tests for shared/deck-view.mjs: which type group a card is in, and how a deck's lines are grouped and ordered.
import { categoryOf, groupDeck, CATEGORY_ORDER, GROUP_TITLES } from '../shared/deck-view.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };
const DASH = String.fromCharCode(0x2014);

// ---- the category of a type line ----
for (const [type, expected] of [
  ['Creature ' + DASH + ' Elf Druid', 'creature'], ['Legendary Creature ' + DASH + ' Human Noble', 'creature'], ['Artifact Creature ' + DASH + ' Construct', 'creature'], ['Enchantment Creature ' + DASH + ' Nymph', 'creature'],
  ['Land', 'land'], ['Basic Land ' + DASH + ' Forest', 'land'], ['Artifact Land', 'land'], ['Land Creature ' + DASH + ' Forest Dryad', 'land'], ['Legendary Land', 'land'],
  ['Instant', 'instant'], ['Kindred Instant ' + DASH + ' Goblin', 'instant'], ['Sorcery', 'sorcery'], ['Tribal Sorcery ' + DASH + ' Elf', 'sorcery'],
  ['Artifact', 'artifact'], ['Legendary Artifact ' + DASH + ' Equipment', 'artifact'], ['Artifact ' + DASH + ' Vehicle', 'artifact'], ['Enchantment', 'enchantment'], ['Enchantment ' + DASH + ' Aura', 'enchantment'], ['Legendary Enchantment Artifact', 'artifact'],
  ['Legendary Planeswalker ' + DASH + ' Jace', 'planeswalker'], ['Battle ' + DASH + ' Siege', 'battle'], ['Legendary Creature Planeswalker', 'planeswalker'], ['Planeswalker Creature ' + DASH + ' Human', 'planeswalker'], ['Artifact Planeswalker', 'planeswalker'],
  ['Creature ' + DASH + ' Human // Land', 'creature'], ['Land // Creature ' + DASH + ' Elf', 'land'], ['Instant // Sorcery', 'instant'],
  ['Dungeon', 'other'], ['Conspiracy', 'other'], ['', 'other'], [undefined, 'other'], [null, 'other'], [42, 'other'],
  ['Creature - Elf Druid', 'creature'], ['Basic Land - Island', 'land'],
]) same(`${JSON.stringify(type)} is ${expected}`, categoryOf(type), expected);
check('a subtype that is also a type word does not count (the dash ends the types): "Creature - Land Shark"', categoryOf('Creature ' + DASH + ' Land Shark') === 'creature' && categoryOf('Instant ' + DASH + ' Arcane Creature') === 'instant');
same('the order the groups are shown in: planeswalkers above creatures', CATEGORY_ORDER, ['planeswalker', 'creature', 'battle', 'instant', 'sorcery', 'artifact', 'enchantment', 'land', 'other']);
same('every category has a title', CATEGORY_ORDER.map((key) => GROUP_TITLES[key]), ['Planeswalkers', 'Creatures', 'Battles', 'Instants', 'Sorceries', 'Artifacts', 'Enchantments', 'Lands', 'Other']);

// ---- grouping a deck ----
let uid = 0;
const card = (name, t) => ({ i: `id-${name}`, n: name, t, m: '' });
const line = (name, t, qty = 1, section = 'main', status = 'matched') => ({ key: `k${++uid}`, section, qty, status, card: status === 'matched' ? card(name, t) : null, name, typed: name });
const deck = [
  line('Forest', 'Basic Land ' + DASH + ' Forest', 10), line('Sol Ring', 'Artifact', 1), line('Llanowar Elves', 'Creature ' + DASH + ' Elf Druid', 1), line('Birds of Paradise', 'Creature ' + DASH + ' Bird', 1),
  line('Lightning Bolt', 'Instant', 1), line('Counterspell', 'Instant', 1), line('Wrath of God', 'Sorcery', 1), line('Jace', 'Legendary Planeswalker ' + DASH + ' Jace', 1),
  line('Rhystic Study', 'Enchantment', 1), line('Krenko, Mob Boss', 'Legendary Creature ' + DASH + ' Goblin Warrior', 1, 'commander'), line('Island', 'Basic Land ' + DASH + ' Island', 5),
  line('Annul', 'Instant', 2, 'sideboard'), line('Arcum Dagsson', 'Legendary Creature ' + DASH + ' Human Artificer', 1, 'maybeboard'), line('Mystery Card', '', 1, 'main', 'not_found'),
  line('Lurrus of the Dream-Den', 'Legendary Creature ' + DASH + ' Cat Nightmare', 1, 'companion'), line('Skullclamp', 'Artifact ' + DASH + ' Equipment', 1, 'unlabeled'),
];
{
  const groups = groupDeck(deck, { commanderIds: ['id-Krenko, Mob Boss'] });
  same('the groups come in the order: not matched, commander, companion, the types, sideboard, maybeboard', groups.map((g) => g.key), ['unmatched', 'commander', 'companion', 'planeswalker', 'creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'land', 'sideboard', 'maybeboard']);
  same('each group has a title and a count of copies', groups.map((g) => [g.title, g.count]), [['Not matched', 1], ['Commander', 1], ['Companion', 1], ['Planeswalkers', 1], ['Creatures', 2], ['Instants', 2], ['Sorceries', 1], ['Artifacts', 2], ['Enchantments', 1], ['Lands', 15], ['Sideboard', 2], ['Maybeboard (not counted)', 1]]);
  same('the commander is the picked card, taken from its line', groups[1].lines.map((l) => l.name), ['Krenko, Mob Boss']);
  same('inside a group the cards are sorted by name', [groups[4].lines.map((l) => l.name), groups[5].lines.map((l) => l.name), groups[9].lines.map((l) => l.name)], [['Birds of Paradise', 'Llanowar Elves'], ['Counterspell', 'Lightning Bolt'], ['Forest', 'Island']]);
  same('a line after a blank line (unlabeled) is part of the main deck, in its type group', groups[7].lines.map((l) => l.name), ['Skullclamp', 'Sol Ring']);
  same('the sideboard and the maybeboard keep their cards out of the type groups', [groups[10].lines.map((l) => l.name), groups[11].lines.map((l) => l.name), groups.slice(3, 10).flatMap((g) => g.lines).some((l) => l.name === 'Annul' || l.name === 'Arcum Dagsson')], [['Annul'], ['Arcum Dagsson'], false]);
  same('every copy is somewhere: the groups hold as many copies as the lines', groups.reduce((sum, g) => sum + g.count, 0), deck.reduce((sum, l) => sum + l.qty, 0));
}
{
  const groups = groupDeck(deck, { commanderIds: [] });
  same('with no commander picked (Standard) a commander line is just a card in its type group and there is no Commander group', [groups.some((g) => g.key === 'commander'), groups.find((g) => g.key === 'creature').lines.map((l) => l.name)], [false, ['Birds of Paradise', 'Krenko, Mob Boss', 'Llanowar Elves']]);
  same('the same input gives the same groups', groupDeck(deck, { commanderIds: [] }), groups);
  check('the old lines are not changed', (() => { const before = JSON.stringify(deck); groupDeck(deck, { commanderIds: ['id-Krenko, Mob Boss'] }); return JSON.stringify(deck) === before; })());
}
{
  const two = [line('Tymna the Weaver', 'Legendary Creature ' + DASH + ' Human Cleric', 1, 'main'), line('Thrasios, Triton Hero', 'Legendary Creature ' + DASH + ' Merfolk Wizard', 1, 'main'), line('Forest', 'Basic Land', 3)];
  const groups = groupDeck(two, { commanderIds: ['id-Thrasios, Triton Hero', 'id-Tymna the Weaver'] });
  same('a commander and a partner come in the order they were picked', groups[0].lines.map((l) => l.name), ['Thrasios, Triton Hero', 'Tymna the Weaver']);
  same('and are gone from the type groups', groups.filter((g) => g.key === 'creature').length, 0);
  same('a third id is ignored', groupDeck(two, { commanderIds: ['id-Tymna the Weaver', 'id-Thrasios, Triton Hero', 'id-Forest'] })[0].lines.length, 2);
  const many = groupDeck([line('Krenko, Mob Boss', 'Legendary Creature ' + DASH + ' Goblin', 3)], { commanderIds: ['id-Krenko, Mob Boss'] });
  same('a line of three that holds the commander leaves two in its type group', [many[0].key, many[0].count, many[1].key, many[1].count], ['commander', 1, 'creature', 2]);
  same('a pick that is not in the deck, a sideboard copy and an unmatched line are never made commanders', groupDeck([line('Annul', 'Instant', 1, 'sideboard'), line('Nothing', '', 1, 'main', 'not_found')], { commanderIds: ['id-Annul', 'id-Nothing', 'id-Missing'] }).map((g) => g.key), ['unmatched', 'sideboard']);
  same('an empty deck has no groups', groupDeck([], { commanderIds: ['x'] }), []);
  same('bad input is ignored, not a crash', groupDeck([line('Forest', 'Land')], { commanderIds: [null, undefined, ''] }).map((g) => g.key), ['land']);
}
{
  // a modal or transform card is sorted by its front face
  const lines = [line('Valakut Awakening', 'Instant // Land'), line('Delver of Secrets', 'Creature ' + DASH + ' Human Wizard // Creature ' + DASH + ' Human Insect'), line('Treasure Map', 'Artifact // Land')];
  same('two-faced cards go by the front face', groupDeck(lines).map((g) => [g.key, g.lines[0].name]), [['creature', 'Delver of Secrets'], ['instant', 'Valakut Awakening'], ['artifact', 'Treasure Map']]);
}

console.log(`All ${checks} deck view checks passed.`);
