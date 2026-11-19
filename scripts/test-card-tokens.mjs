// Tests for shared/card-tokens.mjs: grouping token printings, the links from cards, reading the file back, the menus' lists and the build checks. Run: node scripts/test-card-tokens.mjs
import { TokenCollector, readTokens, readTokenRow, tokensForCards, commonTokens, searchTokens, validateTokens, countTokens, COMMON_NAMES } from '../shared/card-tokens.mjs';

let checks = 0;
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); } };

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const token = (n, over = {}) => ({ id: id(n), oracle_id: id(1000 + (over.group ?? n)), layout: 'token', lang: 'en', name: 'Soldier', type_line: 'Token Creature — Soldier', power: '1', toughness: '1', colors: ['W'], oracle_text: '', set: 'tst', collector_number: String(n), released_at: '2020-05-05', ...over });
const emblem = (n, over = {}) => ({ id: id(n), oracle_id: id(1000 + n), layout: 'emblem', lang: 'en', name: 'Elspeth Emblem', type_line: 'Emblem — Elspeth', oracle_text: 'Creatures you control get +2/+2.', colors: [], set: 'tmm', collector_number: String(n), released_at: '2019-01-01', ...over });
const card = (name, n, parts) => ({ id: id(n), oracle_id: id(5000 + n), layout: 'normal', name, all_parts: parts });
const part = (printingId, component = 'token', type_line = 'Token Creature') => ({ object: 'related_card', id: printingId, component, type_line });

const c = new TokenCollector();
c.add(token(1)); // a white 1/1 Soldier, the same token as the next two printings (one oracle id)
c.add(token(2, { group: 1, released_at: '2023-03-03', set: 'new' }));
c.add(token(3, { group: 1, lang: 'ja' })); // Japanese: counts for a link, is not a printing
c.add(token(4, { group: 4, name: 'Soldier', power: '2', toughness: '2', colors: ['R'], oracle_text: 'Haste' })); // another token with the same name
c.add({ ...token(5, { group: 5 }), layout: 'double_faced_token', name: 'Front // Back', card_faces: [{ name: 'Front', type_line: 'Token Creature — Bat', power: '1', toughness: '1', colors: ['B'], oracle_text: 'Flying' }, { name: 'Back', type_line: 'Token Creature — Bat' }] });
c.add(emblem(6));
c.add(card('Sun Champion', 7, [part(id(2)), part(id(6), 'combo_piece', 'Emblem — Elspeth'), part(id(7), 'combo_piece', 'Legendary Planeswalker'), part(id(99))])); // (the last is not in the file)
c.add(card('Goblin Maker', 8, [part(id(4))]));
c.add(card('Bat Maker', 9, [part(id(5)), part(id(3))])); // (a link to the Japanese printing finds the same token as the English ones)
c.add(card('Stranger', 10, [part(id(1))]));
c.add(null); c.add({}); c.add({ layout: 'token' });
const names = new Map([[id(5007), 'Sun Champion'], [id(5008), 'Goblin Maker'], [id(5009), 'Bat Maker']]); // (Stranger is not in the card list)
const built = c.build(names);

same('tokens come before emblems, then by name, type, numbers, colors and text', built.t.map((row) => [row[0], row[2], row[3], row[5]]), [['Front', '1/1', 'B', 0], ['Soldier', '1/1', 'W', 0], ['Soldier', '2/2', 'R', 0], ['Elspeth Emblem', '', '', 1]]);
same('a double-faced token is named and typed from its front face', [built.t[0][1], built.t[0][4]], ['Token Creature — Bat', 'Flying']);
same('printings of one oracle id are one token, newest first, English only, as [id, set, number, year]', built.t[1][6], [[id(2), 'new', '2', '2023'], [id(1), 'tst', '1', '2020']]);
same('an emblem keeps its text', built.t[3][4], 'Creatures you control get +2/+2.');
same('a card links to its tokens and its emblem (not to a planeswalker part, nor to a printing that is missing)', built.l['Sun Champion'], [1, 3]);
same('a link to a Japanese printing finds the English token (the Bat, and the Soldier through its Japanese printing)', built.l['Bat Maker'], [0, 1]);
same('cards that are not in the card list are left out, and the links are in name order', Object.keys(built.l), ['Bat Maker', 'Goblin Maker', 'Sun Champion']);
same('the same input always makes the same bytes', JSON.stringify(c.build(names)), JSON.stringify(built));
same('the counts', countTokens(built), { tokens: 3, emblems: 1, printings: 5, cards: 3 });

// ---- reading it back
const data = readTokens(JSON.parse(JSON.stringify(built)));
same('the file reads back, with a link to each token', [data.tokens.length, data.links.get('Sun Champion').map((t) => t.name), data.tokens[1].printings[0]], [4, ['Soldier', 'Elspeth Emblem'], { id: id(2), set: 'new', number: '2', year: '2023' }]);
same('anything that is not a tokens file is null', [null, [], { v: 2, t: [], l: {} }, { v: 1, t: {}, l: {} }, { v: 1, t: [], l: [] }].map(readTokens), Array(5).fill(null));
const row = built.t[1];
same('a bad row is not a token: wrong id, set, number, stats, colors, kind or no printings', [
  readTokenRow([...row.slice(0, 6), [['nope', 'tst', '1', '2020']]], 0), readTokenRow([...row.slice(0, 6), [[id(1), 'TOOLONGSET', '1', '2020']]], 0), readTokenRow([...row.slice(0, 6), [[id(1), 'tst', 'a/b', '2020']]], 0),
  readTokenRow([row[0], row[1], '1-1', ...row.slice(3)], 0), readTokenRow([...row.slice(0, 3), 'XYZ', ...row.slice(4)], 0), readTokenRow([...row.slice(0, 5), 2, row[6]], 0), readTokenRow([...row.slice(0, 6), []], 0),
].map((r) => r === null), Array(7).fill(true));
const withBad = JSON.parse(JSON.stringify(built)); withBad.t[1] = 'junk';
same('a bad row is dropped and the links to it with it', [readTokens(withBad).tokens.length, readTokens(withBad).links.get('Sun Champion').map((t) => t.name)], [3, ['Elspeth Emblem']]);

// ---- the menus' lists
same('a deck\'s tokens are the ones its cards make, most-made first', tokensForCards(data, ['Goblin Maker', 'Sun Champion', 'Sun Champion', 'Nobody']).map((t) => t.pt), ['1/1', '2/2']);
same('emblems are listed apart from tokens', [tokensForCards(data, ['Sun Champion'], true).map((t) => t.name), tokensForCards(data, ['Goblin Maker'], true)], [['Elspeth Emblem'], []]);
same('the common tokens are the 16 names in order, each the one with most printings; those that do not exist are skipped', [COMMON_NAMES.length, commonTokens(data).map((t) => [t.name, t.colors, t.printings.length])], [16, [['Soldier', 'W', 2]]]);
same('search needs every word in the name or the type, in any case, and names that start with the word come first', [searchTokens(data, 'SOLDIER').map((t) => t.pt), searchTokens(data, 'creature bat').map((t) => t.name), searchTokens(data, 'zzz'), searchTokens(data, 'elsp').length], [['1/1', '2/2'], ['Front'], [], 0]);
same('search with emblem set looks only at emblems; with no words it lists them all, up to the limit', [searchTokens(data, 'elsp', { emblem: true }).map((t) => t.name), searchTokens(data, '', { limit: 2 }).length, searchTokens(data, '', { emblem: true }).length], [['Elspeth Emblem'], 2, 1]);

// ---- the build's checks
const loose = { minTokens: 1, minPrintings: 1, minCards: 1, mustHave: [], mustLink: [] };
same('a good file passes', validateTokens(built, loose), []);
const broken = (change) => { const copy = JSON.parse(JSON.stringify(built)); change(copy); return validateTokens(copy, loose).length > 0; };
same('a file that is much too small, with a bad row, an unordered pair or a bad link fails', [validateTokens(built, { ...loose, minTokens: 10 }).length > 0, validateTokens(built, { ...loose, minPrintings: 100 }).length > 0, validateTokens(built, { ...loose, minCards: 100 }).length > 0,
  broken((f) => { f.t[0] = 'x'; }), broken((f) => { f.t.reverse(); }), broken((f) => { f.l['Bat Maker'] = [99]; }), broken((f) => { f.l['Bat Maker'] = []; }), validateTokens(built, { ...loose, previousPrintings: 100 }).length > 0], Array(8).fill(true));
same('a token or a link that must be there, and a file of the wrong shape, fail', [validateTokens(built, { ...loose, mustHave: ['Treasure'] }).length > 0, validateTokens(built, { ...loose, mustLink: ['Nobody'] }).length > 0, validateTokens(null).length > 0, validateTokens({ v: 1 }).length > 0], [true, true, true, true]);

console.log(`All ${checks} card token checks passed.`);
