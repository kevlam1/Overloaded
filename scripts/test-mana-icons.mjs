// Checks shared/mana-icons.mjs against the files in frontend/public/icons/mana: every name has a real svg, and every svg is in the list.
import { readFileSync, readdirSync } from 'node:fs';
import { MANA_ICONS, MANA_ICON_DIR, manaIconUrl } from '../shared/mana-icons.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };

const folder = new URL('../frontend/public/icons/mana/', import.meta.url);
const files = readdirSync(folder).filter((name) => name.endsWith('.svg')).map((name) => name.slice(0, -4)).sort();
same('every svg in the folder is in the list, and every name in the list has an svg', files, [...MANA_ICONS].sort());
same('there is a credits file next to the icons', readdirSync(folder).includes('credits.md'), true);
for (const name of MANA_ICONS) {
  const text = readFileSync(new URL(`${name}.svg`, folder), 'utf8');
  same(`${name}.svg is an svg with a path`, [/^\s*(<!--[\s\S]*?-->\s*)?<svg[\s>]/.test(text), /<path /.test(text)], [true, true]);
  same(`${name}.svg has no script, no event handler and no link to anything else`, [/<script/i.test(text), /\son\w+\s*=/i.test(text), /href\s*=/i.test(text), /<foreignObject/i.test(text)], [false, false, false, false]);
  same(`the address of ${name} is under ${MANA_ICON_DIR}`, manaIconUrl(name), `${MANA_ICON_DIR}/${name}.svg`);
}
same('a name that is not in the list has no address (so text from elsewhere never points at another file)', [manaIconUrl('../../etc/passwd'), manaIconUrl('Tap'), manaIconUrl(''), manaIconUrl(null), manaIconUrl(undefined), manaIconUrl(5), manaIconUrl('tap.svg'), manaIconUrl(['tap'])], [null, null, null, null, null, null, null, null]);
same('the list is made of lowercase file names', MANA_ICONS.every((name) => /^[a-z0-9-]+$/.test(name)), true);
console.log(`All ${checks} Mana icon checks passed.`);
