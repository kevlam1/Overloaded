// The icons copied from the Mana project (https://github.com/andrewgioia/mana) into frontend/public/icons/mana (Kevin, 2026-11-14: "we'll have many more mtg icons being used in the future").
// Only names in this list have a file there; to use another icon, copy its svg into that folder, add its name here, and note it in credits.md. No browser code, so Node can test it
// (scripts/test-mana-icons.mjs, which checks that every name has a file and that no file is missing from the list).
export const MANA_ICON_DIR = '/icons/mana';
export const MANA_ICONS = [
  'ability-adamant', 'ability-addendum', 'ability-afterlife', 'ability-alliance', 'ability-amass', 'ability-backup', 'ability-blitz', 'ability-casualty', 'ability-changeling', 'ability-companion',
  'ability-constellation', 'ability-convoke', 'ability-corrupted', 'ability-coven', 'ability-day-night', 'ability-deathtouch', 'ability-decayed', 'ability-defender', 'ability-disturb',
  'ability-domain', 'ability-doublestrike', 'ability-dungeon', 'ability-embalm', 'ability-enlist', 'ability-enrage', 'ability-escape', 'ability-eternalize', 'ability-explore', 'ability-fabricate',
  'ability-firststrike', 'ability-flash', 'ability-flying', 'ability-for-mirrodin', 'ability-foretell', 'ability-goad', 'ability-haste', 'ability-hexproof', 'ability-incubate',
  'ability-indestructible', 'ability-investigate', 'ability-jumpstart', 'ability-kicker', 'ability-landfall', 'ability-lifelink', 'ability-magecraft', 'ability-menace', 'ability-mentor',
  'ability-mutate', 'ability-ninjutsu', 'ability-proliferate', 'ability-prototype', 'ability-prowess', 'ability-raid', 'ability-reach', 'ability-read-ahead', 'ability-reconfigure', 'ability-revolt',
  'ability-riot', 'ability-spectacle', 'ability-summoning-sickness', 'ability-surveil', 'ability-the-ring-tempts-you', 'ability-toxic', 'ability-training', 'ability-trample', 'ability-undergrowth',
  'ability-unearth', 'ability-vigilance', 'ability-ward', 'acorn', 'chaos', 'counter-arrow', 'counter-brick', 'counter-charge', 'counter-devotion', 'counter-doom', 'counter-echo', 'counter-flame',
  'counter-flood', 'counter-fungus', 'counter-gold', 'counter-ki', 'counter-lore', 'counter-loyalty', 'counter-mining', 'counter-muster', 'counter-paw', 'counter-pin', 'counter-scream',
  'counter-shield', 'counter-skeleton', 'counter-skull', 'counter-slime', 'counter-stun', 'counter-time', 'counter-verse', 'counter-vortex', 'e', 'planeswalker', 'tap', 'ticket', 'untap',
];

// The address of an icon, or null when the name is not one we have (so a name made from other text can never point at another file).
export function manaIconUrl(name) {
  return typeof name === 'string' && MANA_ICONS.includes(name) ? `${MANA_ICON_DIR}/${name}.svg` : null;
}
