// What a keyword means, in a line (Kevin, 2026-11-25: "does holding Alt explain the keywords on a card, even the ones whose rules text the card does not print?").
// Scryfall gives each card a list of its keywords (`k` in the card list); many of them, like Flying or Haste, have no reminder text on the card. The Alt picture shows
// these lines beside the card. Written in our own plain words from the game's rules; short on purpose. `icon` is the name of a Mana icon
// (frontend/public/icons/mana/ability-NAME.svg) when the Mana project has one. Plain data, no browser code.

const K = (text, icon = null) => ({ text, icon });

export const GLOSSARY = {
  // evergreen abilities
  deathtouch: K('Any damage it deals to a creature destroys that creature.', 'deathtouch'),
  defender: K("Can't attack.", 'defender'),
  'double strike': K('Deals combat damage twice: first-strike damage, then regular damage.', 'doublestrike'),
  equip: K('Pay the cost to attach it to a creature you control. Only when you could cast a sorcery.'),
  'first strike': K('Deals combat damage before creatures without first strike.', 'firststrike'),
  flash: K('You may cast it any time you could cast an instant.', 'flash'),
  flying: K('Can be blocked only by creatures with flying or reach.', 'flying'),
  haste: K('Can attack and use tap abilities as soon as you control it.', 'haste'),
  hexproof: K("Can't be the target of spells or abilities your opponents control.", 'hexproof'),
  indestructible: K("Damage and \"destroy\" effects don't destroy it.", 'indestructible'),
  lifelink: K('Damage it deals also makes you gain that much life.', 'lifelink'),
  menace: K("Can't be blocked except by two or more creatures.", 'menace'),
  protection: K("Can't be damaged, enchanted, equipped, blocked or targeted by what it has protection from."),
  reach: K('Can block creatures with flying.', 'reach'),
  trample: K('Combat damage past what kills its blockers goes to the player or planeswalker it attacks.', 'trample'),
  vigilance: K("Attacking doesn't tap it.", 'vigilance'),
  ward: K('When it becomes the target of an opponent\'s spell or ability, counter that unless they pay the ward cost.', 'ward'),
  // other abilities
  affinity: K('Costs {1} less for each of the named things you control.'),
  afterlife: K('When it dies, create that many 1/1 white and black Spirit tokens with flying.', 'afterlife'),
  annihilator: K('Whenever it attacks, the defending player sacrifices that many permanents.'),
  backup: K('When it enters, put that many +1/+1 counters on a target creature. If it is another creature, it also gets the abilities below until end of turn.', 'backup'),
  bestow: K('You may cast it as an Aura for its bestow cost. If it falls off, it is a creature again.'),
  blitz: K('Cast it for its blitz cost: it has haste and "when this dies, draw a card", and is sacrificed at the end step.', 'blitz'),
  buyback: K('Pay the extra cost as you cast it to put it back in your hand.'),
  cascade: K('When you cast it, exile cards from the top of your library until a nonland card with lower mana value. You may cast that card free.'),
  casualty: K('As you cast it, you may sacrifice a creature with at least that much power to copy the spell.', 'casualty'),
  changeling: K('It is every creature type.', 'changeling'),
  companion: K('If your deck meets its condition, you may pay {3} once to put it into your hand from outside the game.', 'companion'),
  convoke: K('Your creatures can help cast it: each one you tap pays {1} or one mana of its color.', 'convoke'),
  crew: K('Tap creatures with that much total power: it becomes an artifact creature until end of turn.'),
  cycling: K('Pay the cost and discard it to draw a card.'),
  dash: K('Cast it for its dash cost: it has haste and returns to your hand at the end step.'),
  daybound: K('Turns over when it becomes night (a player casts no spells on their own turn).', 'day-night'),
  nightbound: K('Turns back when it becomes day (a player casts two or more spells during their own turn).', 'day-night'),
  decayed: K("Can't block. When it attacks, sacrifice it at end of combat.", 'decayed'),
  delve: K('Each card you exile from your graveyard while casting it pays for {1}.'),
  disturb: K('You may cast it from your graveyard, turned over to its back face.', 'disturb'),
  embalm: K('Exile it from your graveyard: create a token copy, a white Zombie. Only as a sorcery.', 'embalm'),
  enlist: K('As it attacks, you may tap a creature that isn\'t attacking to add its power until end of turn.', 'enlist'),
  escape: K('You may cast it from your graveyard for its escape cost.', 'escape'),
  eternalize: K('Exile it from your graveyard: create a 4/4 black Zombie token copy. Only as a sorcery.', 'eternalize'),
  evoke: K('Cast it for its evoke cost: it is sacrificed when it enters.'),
  evolve: K('Whenever a creature with more power or toughness enters under your control, put a +1/+1 counter on it.'),
  exalted: K('Whenever a creature you control attacks alone, it gets +1/+1 until end of turn.'),
  extort: K('Whenever you cast a spell, you may pay {W/B}: each opponent loses 1 life and you gain that much.'),
  fabricate: K('When it enters, put that many +1/+1 counters on it, or create that many 1/1 Servos.', 'fabricate'),
  fear: K('Can be blocked only by artifact and/or black creatures.'),
  flashback: K('You may cast it from your graveyard for its flashback cost. Then it is exiled.'),
  'for mirrodin!': K('When it enters, create a 2/2 red Rebel creature token and attach it to that token.', 'for-mirrodin'),
  foretell: K('On your turn, pay {2} and exile it face down. Cast it later for its foretell cost.', 'foretell'),
  infect: K('Deals damage to creatures as -1/-1 counters and to players as poison counters.'),
  intimidate: K('Can be blocked only by artifact creatures and creatures that share a color with it.'),
  'jump-start': K('You may cast it from your graveyard by also discarding a card. Then it is exiled.', 'jumpstart'),
  kicker: K('You may pay the kicker cost as you cast it for the extra effect.', 'kicker'),
  'living weapon': K('When it enters, create a 0/0 black Germ creature token and attach it to that token.'),
  madness: K('If you discard it, you may cast it for its madness cost.'),
  mentor: K('When it attacks, put a +1/+1 counter on a target attacking creature with less power.', 'mentor'),
  morph: K('You may cast it face down as a 2/2 for {3}. Turn it face up any time for its morph cost.'),
  disguise: K('You may cast it face down as a 2/2 with ward {2} for {3}. Turn it face up for its disguise cost.'),
  mutate: K('Cast it for its mutate cost onto a non-Human creature you own: the two merge into one.', 'mutate'),
  myriad: K('Whenever it attacks, for each other opponent, create a token copy attacking that player. Exile them at end of combat.'),
  ninjutsu: K('Pay the cost and return an unblocked attacker you control to your hand: put this onto the battlefield tapped and attacking.', 'ninjutsu'),
  offspring: K('Pay the extra cost as you cast it: when it enters, create a 1/1 token copy of it.'),
  overload: K('Cast it for its overload cost: "target" becomes "each".'),
  partner: K('You can have two commanders if both have partner.'),
  persist: K('When it dies, if it had no -1/-1 counters, return it with a -1/-1 counter.'),
  plot: K('Exile it from your hand for its plot cost. On a later turn, cast it free as a sorcery.'),
  prototype: K('You may cast it for its prototype cost: it is smaller and its color may change.', 'prototype'),
  prowess: K('Whenever you cast a noncreature spell, it gets +1/+1 until end of turn.', 'prowess'),
  'read ahead': K('Choose the chapter it starts on. Earlier chapters do not trigger.', 'read-ahead'),
  reconfigure: K('Attach it to a creature you control, or unattach it, as a sorcery. While attached it is not a creature.', 'reconfigure'),
  riot: K('It enters with your choice of a +1/+1 counter or haste.', 'riot'),
  saddle: K('Tap creatures with that much total power: it is saddled until end of turn. Only as a sorcery.'),
  shroud: K("Can't be the target of any spells or abilities."),
  spectacle: K('You may cast it for its spectacle cost if an opponent lost life this turn.', 'spectacle'),
  storm: K('When you cast it, copy it for each spell cast before it this turn.'),
  suspend: K('Exile it with time counters. Remove one each upkeep; when the last is gone, cast it free.'),
  toxic: K('A player dealt combat damage by it also gets that many poison counters.', 'toxic'),
  training: K('Whenever it attacks with a creature with more power, put a +1/+1 counter on it.', 'training'),
  undying: K('When it dies, if it had no +1/+1 counters, return it with a +1/+1 counter.'),
  unearth: K('Return it from your graveyard with haste. Exile it at the next end step or if it would leave.', 'unearth'),
  wither: K('Deals damage to creatures as -1/-1 counters.'),
  // keyword actions
  amass: K('Put that many +1/+1 counters on an Army you control. If you have none, create a 0/0 Army first.', 'amass'),
  connive: K('Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on it.'),
  discover: K('Exile cards from the top until a nonland card with that mana value or less. Cast it free or put it in your hand.'),
  explore: K('Reveal the top card. A land goes to your hand; otherwise put a +1/+1 counter on it and you may mill that card.', 'explore'),
  fight: K('Each deals damage equal to its power to the other.'),
  goad: K('Until your next turn it attacks each combat if able, and attacks a player other than you if able.', 'goad'),
  incubate: K('Create an Incubator token with that many +1/+1 counters. Pay {2}: it becomes a Phyrexian artifact creature.', 'incubate'),
  investigate: K('Create a Clue token: {2}, sacrifice it, draw a card.', 'investigate'),
  mill: K('Put that many cards from the top of a library into its owner\'s graveyard.'),
  proliferate: K('Choose any permanents and players with counters. Give each another counter of a kind it already has.', 'proliferate'),
  scry: K('Look at that many cards from the top. Put any on the bottom and the rest back in any order.'),
  surveil: K('Look at that many cards from the top. Put any into your graveyard and the rest back in any order.', 'surveil'),
  'venture into the dungeon': K('Move into the next room of a dungeon and do what it says.', 'dungeon'),
  'the ring tempts you': K('Your Ring-bearer grows stronger: choose a creature as your Ring-bearer.', 'the-ring-tempts-you'),
  // ability words (a name for a kind of ability; they mean nothing by themselves)
  landfall: K('Triggers when a land enters under your control.', 'landfall'),
  raid: K('Better if you attacked this turn.', 'raid'),
  revolt: K('Better if a permanent you controlled left the battlefield this turn.', 'revolt'),
  morbid: K('Better if a creature died this turn.'),
  threshold: K('Better with seven or more cards in your graveyard.'),
  delirium: K('Better with four or more card types among cards in your graveyard.'),
  metalcraft: K('Better while you control three or more artifacts.'),
  ferocious: K('Better while you control a creature with power 4 or more.'),
  constellation: K('Triggers when an enchantment enters under your control.', 'constellation'),
  magecraft: K('Triggers when you cast or copy an instant or sorcery.', 'magecraft'),
  alliance: K('Triggers when another creature enters under your control.', 'alliance'),
  coven: K('Better while you control three or more creatures with different powers.', 'coven'),
  domain: K('Counts the basic land types among lands you control.', 'domain'),
  corrupted: K('Better while an opponent has three or more poison counters.', 'corrupted'),
  heroic: K('Triggers when you cast a spell that targets it.'),
  enrage: K('Triggers when it is dealt damage.', 'enrage'),
  adamant: K('Better if at least three mana of one color was spent to cast it.', 'adamant'),
  undergrowth: K('Counts the creature cards in your graveyard.', 'undergrowth'),
  addendum: K('Better if you cast it during your main phase.', 'addendum'),
};

// The note for one keyword as Scryfall names it ("Flying", "Double strike", "Toxic"), or null when we have none.
export function keywordNote(name) {
  if (typeof name !== 'string') return null;
  const key = name.trim().toLowerCase();
  return Object.hasOwn(GLOSSARY, key) ? { name: name.trim(), ...GLOSSARY[key] } : null;
}

// The notes for a card's keywords, in the card's order, known ones first; unknown keywords are kept with no text (the name alone still helps).
export function keywordNotes(keywords) {
  const list = Array.isArray(keywords) ? keywords.filter((k) => typeof k === 'string' && k.trim()) : [];
  const seen = new Set();
  const out = [];
  for (const name of list) {
    const key = name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(keywordNote(name) ?? { name: name.trim(), text: null, icon: null });
  }
  return out.sort((a, b) => Number(b.text !== null) - Number(a.text !== null));
}

// The Mana icon files the glossary uses (each must be in frontend/public/icons/mana/; a test checks it).
export const GLOSSARY_ICONS = [...new Set(Object.values(GLOSSARY).map((entry) => entry.icon).filter(Boolean))];
