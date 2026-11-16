// The icons copied from the Mana project (https://github.com/andrewgioia/mana) into frontend/public/icons/mana (Kevin, 2026-11-14: "we'll have many more mtg icons being used in the future").
// Only names in this list have a file there; to use another icon, copy its svg into that folder, add its name here, and note it in credits.md. No browser code, so Node can test it
// (scripts/test-mana-icons.mjs, which checks that every name has a file and that no file is missing from the list).
export const MANA_ICON_DIR = '/icons/mana';
export const MANA_ICONS = ['ability-deathtouch', 'ability-doublestrike', 'ability-firststrike', 'ability-flying', 'ability-haste', 'ability-hexproof', 'ability-indestructible', 'ability-lifelink', 'ability-menace', 'ability-reach', 'ability-trample', 'ability-vigilance', 'acorn', 'chaos',
  'counter-arrow', 'counter-brick', 'counter-charge', 'counter-devotion', 'counter-doom', 'counter-echo', 'counter-flame', 'counter-flood', 'counter-fungus', 'counter-gold', 'counter-ki', 'counter-lore', 'counter-loyalty', 'counter-mining', 'counter-muster', 'counter-paw', 'counter-pin',
  'counter-scream', 'counter-shield', 'counter-skeleton', 'counter-skull', 'counter-slime', 'counter-stun', 'counter-time', 'counter-verse', 'counter-vortex', 'e', 'planeswalker', 'tap', 'ticket', 'untap'];

// The address of an icon, or null when the name is not one we have (so a name made from other text can never point at another file).
export function manaIconUrl(name) {
  return typeof name === 'string' && MANA_ICONS.includes(name) ? `${MANA_ICON_DIR}/${name}.svg` : null;
}
