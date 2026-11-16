// The kinds of counter a card can be given from its right-click menu: "Add counter" (Kevin, 2026-11-15). Plain data and plain functions with no browser code, so Node can test it (scripts/test-counter-catalog.mjs).
//
// Where the list comes from: the wiki page Kevin named (https://mtg.fandom.com/wiki/Counter_(marker)/Full_List) could not be read from here (HTTP 402), so the names are the counters the cards themselves put on
// permanents, found in the rules text of every card in our own card data (shared/card-rules.mjs, the Oct 26 Oracle Cards file): every "<name> counter" phrase in 34,142 cards, counted by how many cards use it.
// The list below is those with at least two cards, in the order of how many (the most common first), without the ones that are only for players (energy, poison, experience, rad, ticket, speed), plus the thirteen keyword
// counters of the Comprehensive Rules (rule 122.1b) first. Any other counter can be typed in ("Custom..."), so a card newer than this list is never stuck.
//
// A counter is stored on a card as a key of its counters (card.ct, shared/zones.mjs): the fixed kinds keep their one-letter keys (p, m, l, c, t) and every other counter is its slug (flying, first-strike, lore).
export const FIXED = { p: '+1/+1', m: '-1/-1', l: 'Loyalty', c: 'Charge', t: 'Time' };
const RESERVED = new Set(Object.getOwnPropertyNames(Object.prototype)); // (constructor, toString and the like: a counter with one of these names would read as something that is already on every object)
const SLUG = /^[a-z0-9][a-z0-9'-]{1,23}$/; // (at least two characters, so a name can never be mistaken for a one-letter fixed kind)

// Keyword counters (rule 122.1b): the creature has the ability while it has the counter.
export const KEYWORD_COUNTERS = ['flying', 'first-strike', 'double-strike', 'deathtouch', 'haste', 'hexproof', 'indestructible', 'lifelink', 'menace', 'reach', 'shadow', 'trample', 'vigilance'];

// The rest, most common first.
const COMMON = ['stun', 'shield', 'lore', 'oil', 'age', 'level', 'quest', 'finality', 'fade', 'spore', 'storage', 'verse', 'depletion', 'ki', 'plan', 'soul', 'page', 'ice', 'divinity', 'bounty', 'flood', 'fuse', 'doom', 'growth', 'blood',
  'study', 'defense', 'hour', 'corpse', 'wish', 'tide', 'brick', 'coin', 'feather', 'dream', 'stash', 'infection', 'pressure', 'hit', 'omen', 'slime', 'acorn', 'plague', 'hatchling', 'luck', 'cage', 'net', 'hone', 'healing', 'blaze', 'void',
  'velocity', 'eon', 'memory', 'delay', 'wind', 'blight', 'point', 'collection', 'aim', 'egg', 'fire', 'fungus', 'gold', 'scream', 'devotion', 'fate', 'ingenuity', 'arrow', 'mining', 'muster', 'echo', 'flame', 'paw', 'pin', 'skeleton', 'skull', 'vortex'];

// The Mana project's icon for a counter, where it has one (frontend/public/icons/mana, shared/mana-icons.mjs).
export const COUNTER_ICONS = {
  l: 'counter-loyalty', c: 'counter-charge', t: 'counter-time', lore: 'counter-lore', stun: 'counter-stun', shield: 'counter-shield', verse: 'counter-verse', ki: 'counter-ki', flood: 'counter-flood', doom: 'counter-doom', brick: 'counter-brick',
  slime: 'counter-slime', fungus: 'counter-fungus', gold: 'counter-gold', scream: 'counter-scream', devotion: 'counter-devotion', arrow: 'counter-arrow', mining: 'counter-mining', muster: 'counter-muster', echo: 'counter-echo', flame: 'counter-flame',
  paw: 'counter-paw', pin: 'counter-pin', skeleton: 'counter-skeleton', skull: 'counter-skull', vortex: 'counter-vortex', acorn: 'acorn',
  flying: 'ability-flying', 'first-strike': 'ability-firststrike', 'double-strike': 'ability-doublestrike', deathtouch: 'ability-deathtouch', haste: 'ability-haste', hexproof: 'ability-hexproof', indestructible: 'ability-indestructible', lifelink: 'ability-lifelink',
  menace: 'ability-menace', reach: 'ability-reach', trample: 'ability-trample', vigilance: 'ability-vigilance',
};

const WORDS = { 'first-strike': 'First strike', 'double-strike': 'Double strike' };
// How a counter is written: "First strike", "Lore", "Plus-one". A key that is not in the lists (a typed name) is written from its slug.
export function counterLabel(key) {
  if (Object.hasOwn(FIXED, key)) return FIXED[key];
  if (Object.hasOwn(WORDS, key)) return WORDS[key];
  if (typeof key !== 'string' || key.length === 0) return '';
  const words = key.replace(/-/g, ' ');
  return words[0].toUpperCase() + words.slice(1);
}

// Is this key a kind of counter a card may hold: one of the fixed kinds or a slug.
export const isCounterKey = (key) => Object.hasOwn(FIXED, key) || (typeof key === 'string' && SLUG.test(key) && !RESERVED.has(key));
export const counterIcon = (key) => (Object.hasOwn(COUNTER_ICONS, key) ? COUNTER_ICONS[key] : null);

// A typed counter name as a key, or null when it cannot be one: letters, digits, spaces, hyphens and apostrophes, two to twenty-four characters once the spaces are hyphens. "Third-degree burn" is "third-degree-burn".
export function slugOf(text) {
  if (typeof text !== 'string') return null;
  const slug = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’]/g, "'").trim().replace(/\s+/g, '-');
  return SLUG.test(slug) && !RESERVED.has(slug) && !slug.endsWith('-') && !slug.includes('--') ? slug : null;
}

// The lines of the "Add counter" menu: Custom... first, then the two sizes, then the keyword counters, then the others by how common they are. { id: 'counteradd:<key>', label }.
export function counterMenuItems() {
  const line = (key) => ({ id: `counteradd:${key}`, label: counterLabel(key), ...(counterIcon(key) ? { icon: counterIcon(key) } : {}) });
  const items = [{ id: 'counteradd:custom', label: 'Custom...' }, line('p'), line('m')]; // (Custom... first: in a list this long the last line is far away)
  for (const key of KEYWORD_COUNTERS) items.push(line(key));
  for (const key of ['l', 'c', 't']) items.push(line(key));
  for (const key of COMMON) items.push(line(key));
  return items;
}
export const COUNTER_CATALOG_SIZE = 2 + KEYWORD_COUNTERS.length + 3 + COMMON.length;
