// Tests for rotateCard in shared/zones.mjs (2026-11-26 feedback, "Rotate 90 degrees"): quarter turns apart from tapping.
import { makeGame, addCard, rotateCard, setTapped, moveCard, seededRandom } from '../shared/zones.mjs';

let checks = 0;
const check = (label, condition, detail = '') => { checks++; if (!condition) { console.log(`FAILED CHECK: ${label}${detail ? ': ' + detail : ''}`); process.exit(1); } };
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const lookup = () => ({ t: 'Artifact', m: '', k: [] });
const start = makeGame({ cards: [{ i: id(1), n: 'Forest', qty: 40, section: 'main' }], commander: [] }, lookup, { random: seededRandom(3) });
const { game, uid } = addCard(start, { i: id(7), n: 'Sol Ring' }, lookup);
const rt = (g) => g.zones.battlefield.find((c) => c.uid === uid).rt;
let g = rotateCard(game, uid);
check('one turn is a quarter turn', rt(g) === 1);
g = rotateCard(rotateCard(g, uid), uid);
check('three turns are three quarter turns', rt(g) === 3);
check('a fourth turn takes it off', rt(rotateCard(g, uid)) === undefined && !('rt' in rotateCard(g, uid).zones.battlefield.find((c) => c.uid === uid)));
check('it is apart from tapping', setTapped(g, uid, true).zones.battlefield.find((c) => c.uid === uid).rt === 3 && rt(g) === 3);
check('it goes when the card leaves the battlefield', !('rt' in moveCard(g, uid, 'graveyard').zones.graveyard.find((c) => c.uid === uid)));
let refused = false; try { rotateCard(g, 'c1'); } catch { refused = true; }
check('only a battlefield card turns', refused);
console.log(`All rotate checks passed (${checks}).`);
