// The icons copied from the Mana project (https://github.com/andrewgioia/mana) into frontend/public/icons/mana (Kevin, 2026-11-14: "we'll have many more mtg icons being used in the future").
// Only names in this list have a file there; to use another icon, copy its svg into that folder, add its name here, and note it in credits.md. No browser code, so Node can test it
// (scripts/test-mana-icons.mjs, which checks that every name has a file and that no file is missing from the list).
export const MANA_ICON_DIR = '/icons/mana';
export const MANA_ICONS = ['tap'];

// The address of an icon, or null when the name is not one we have (so a name made from other text can never point at another file).
export function manaIconUrl(name) {
  return typeof name === 'string' && MANA_ICONS.includes(name) ? `${MANA_ICON_DIR}/${name}.svg` : null;
}
