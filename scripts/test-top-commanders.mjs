// Tests for shared/top-commanders.mjs and markTopCommanders (scripts/lib/card-list.mjs): which records count, the ranking, the published rows, the random pick.
import { TOP_COMMANDERS, rankedCommander, commandersFromList, pickCommander } from '../shared/top-commanders.mjs';
import { markTopCommanders } from './lib/card-list.mjs';

let checks = 0;
const same = (label, actual, expected) => {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); }
};
const record = (over) => ({ type_line: 'Legendary Creature — Goblin Warrior', legalities: { commander: 'legal' }, edhrec_rank: 1089, ...over });

same('a legendary creature legal as a commander, with a rank, counts', rankedCommander(record()), true);
same('not legendary: no', rankedCommander(record({ type_line: 'Creature — Goblin' })), false);
same('a legendary planeswalker: no', rankedCommander(record({ type_line: 'Legendary Planeswalker — Karn' })), false);
same('banned as a commander: no', rankedCommander(record({ legalities: { commander: 'banned' } })), false);
same('no rank: no', rankedCommander(record({ edhrec_rank: undefined })), false);

const entry = (name) => ({ n: name, i: `00000000-0000-0000-0000-${String(name.length).padStart(12, '0')}` });
const a = entry('Alpha'); const b = entry('Bravo!'); const c = entry('Charlie');
markTopCommanders([[300, a], [5, c], [40, b]]);
same('marked 1, 2, 3 by rank, the most played first', [c.cr, b.cr, a.cr], [1, 2, 3]);
same('the published rows are [id, name] in rank order', commandersFromList([a, b, c, { n: 'Unranked', i: 'x' }]).map((row) => row[1]), ['Charlie', 'Bravo!', 'Alpha']);
const many = Array.from({ length: TOP_COMMANDERS + 5 }, (_, n) => [n + 1, { n: `C${String(n).padStart(5, '0')}`, i: 'id' }]);
markTopCommanders(many);
same(`only the best ${TOP_COMMANDERS} are marked`, many.filter(([, e]) => e.cr).length, TOP_COMMANDERS);

const rows = [['824b2d73-2151-4e5e-9f05-8f63e2bdcaa9', 'Krenko, Mob Boss'], ['11111111-2222-3333-4444-555555555555', 'Other']];
same('the pick takes a row by the random number', [pickCommander(rows, 0)[1], pickCommander(rows, 0.99)[1]], ['Krenko, Mob Boss', 'Other']);
same('a damaged file gives no pick (the card then stays face down)', [pickCommander(null), pickCommander([['not an id', 'X']])], [null, null]);

console.log(`All ${checks} top commanders checks passed.`);
