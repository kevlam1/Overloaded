// Tests for shared/card-lookup.mjs (find a saved card in the card list by id, then by name) and shared/card-image.mjs
// (a picture's address from its id). Uses the small real card fixture. Run: node scripts/test-card-lookup.mjs
import { readFileSync } from 'node:fs';
import { makeLookup } from '../shared/card-lookup.mjs';
import { imageUrl, IMAGE_HOST, IMAGE_SIZES, IMAGE_FACES } from '../shared/card-image.mjs';

let checks = 0;
function check(label, condition, detail = '') {
  checks++;
  if (!condition) { console.error(`FAILED: ${label} ${detail}`); process.exit(1); }
}
const fixture = JSON.parse(readFileSync(new URL('./fixtures/cards-sample.json', import.meta.url), 'utf8')).cards;
const lookup = makeLookup(fixture);
const solRing = fixture.find((c) => c.n === 'Sol Ring');

// ---- lookup ----
check('a card is found by its id', JSON.stringify(lookup({ i: solRing.i, n: 'whatever' })) === JSON.stringify({ t: solRing.t, m: solRing.m, k: solRing.k }));
check('and gives its type, cost and keywords', lookup({ i: solRing.i }).t === 'Artifact' && lookup({ i: solRing.i }).m === '{1}');
check('a stale id falls back to the name', lookup({ i: '00000000-0000-4000-8000-000000000001', n: 'Sol Ring' }).t === 'Artifact');
check('the name is matched the way the matcher matches (case, accents, spacing)', lookup({ i: 'x', n: 'sol  ring' }).t === 'Artifact' && lookup({ i: 'x', n: String.fromCharCode(0xC9) + 'owyn, Lady of Rohan' }).t.includes('Legendary Creature') && lookup({ i: 'x', n: 'Eowyn, Lady of Rohan' }).t.includes('Legendary Creature'));
check('a two-faced card is found by its full name', lookup({ i: 'x', n: 'Fire // Ice' }).t === 'Instant // Instant' && lookup({ i: 'x', n: 'Fire/Ice' }).t === 'Instant // Instant');
check('the id wins over the name when both are there but differ', lookup({ i: solRing.i, n: 'Forest' }).t === 'Artifact');
check('a card the list does not know gives null', lookup({ i: 'x', n: 'Totally Fake Card' }) === null);
check('so does a saved card with no usable id or name', lookup({}) === null && lookup(null) === null && lookup(undefined) === null && lookup({ i: 5, n: 7 }) === null && lookup({ n: null }) === null);
check('a card with no id is still found by name', lookup({ n: 'Lightning Bolt' }).t === 'Instant');
check('an empty list knows nothing', makeLookup([])({ i: solRing.i, n: 'Sol Ring' }) === null);
{
  const twins = fixture.filter((c) => c.n === 'B.F.M. (Big Furry Monster)');
  check('two cards with one name: the id picks the right one, the name picks the first', twins.length === 2 && lookup({ i: twins[1].i, n: twins[1].n }).t === twins[1].t && lookup({ i: 'x', n: twins[0].n }).t === twins[0].t);
}
check('the lookup does not change the list', fixture.length === 29);

// ---- imageUrl ----
const id = 'fc817e07-c1f3-469f-9cf7-0945dea7400f';
check('the host is Scryfall\'s picture server', IMAGE_HOST === 'https://cards.scryfall.io');
check('a small front picture', imageUrl(id) === 'https://cards.scryfall.io/small/front/f/c/fc817e07-c1f3-469f-9cf7-0945dea7400f.jpg');
check('the address is the one that was checked against the real server (HTTP 200, 11,919 bytes)', imageUrl(id, 'small', 'front') === `https://cards.scryfall.io/small/front/${id[0]}/${id[1]}/${id}.jpg`);
check('other sizes', imageUrl(id, 'normal') === `https://cards.scryfall.io/normal/front/f/c/${id}.jpg` && imageUrl(id, 'large') === `https://cards.scryfall.io/large/front/f/c/${id}.jpg`);
check('the back face', imageUrl(id, 'small', 'back') === `https://cards.scryfall.io/small/back/f/c/${id}.jpg`);
check('the sizes and faces that exist', IMAGE_SIZES.join() === 'small,normal,large' && IMAGE_FACES.join() === 'front,back');
for (const [label, bad] of [['text that is not an id', 'abc'], ['an uppercase id', id.toUpperCase().replace(/[0-9]/g, 'A')], ['an id with text around it', `x${id}`], ['an id that is too long', `${id}0`], ['a number', 5], ['null', null], ['undefined', undefined], ['an id with a slash in it', 'fc817e07-c1f3-469f-9cf7-0945dea7400/'], ['a path trying to climb', '../../etc/passwd'], ['an empty string', '']]) {
  check(`${label} gives no address`, imageUrl(bad) === null);
}
// One group in capitals at a time (each of the five groups has a letter in it), so each group's own pattern is tested.
for (const [index, group] of id.split('-').entries()) {
  check(`an id with only group ${index + 1} in capitals gives no address`, imageUrl(id.split('-').map((g, i) => (i === index ? group.toUpperCase() : g)).join('-')) === null);
}
check('an id inside an array or an object is not an id, even if its text looks like one', imageUrl([id]) === null && imageUrl({ toString: () => id }) === null && imageUrl(new String(id)) === null);
check('a size that does not exist gives no address', imageUrl(id, 'huge') === null && imageUrl(id, '../x') === null && imageUrl(id, undefined) !== null);
check('a face that does not exist gives no address', imageUrl(id, 'small', 'side') === null && imageUrl(id, 'small', '../x') === null);
check('an address never contains anything but the host, the size, the face and the id', /^https:\/\/cards\.scryfall\.io\/(small|normal|large)\/(front|back)\/[0-9a-f]\/[0-9a-f]\/[0-9a-f-]{36}\.jpg$/.test(imageUrl(id)));

console.log(`All ${checks} card lookup and picture address checks passed.`);
