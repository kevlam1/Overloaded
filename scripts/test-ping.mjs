// Tests for shared/ping.mjs: which cards can be pinged, the record that is written, how a stored ping is read back (strictly), and which pings a page shows.
import { PING_ZONES, canPing, pingKey, makePing, readPing, newPings, pingSentence } from '../shared/ping.mjs';
import { packCard, unpackCard } from '../shared/game-sync.mjs';
import { NUMBER_LIMIT } from '../shared/zones.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const refused = (label, run, words) => {
  checks++;
  try { run(); } catch (error) { if (error instanceof Error && (!words || words.test(error.message))) return; fail(label, `refused with the wrong message: ${error.message}`); }
  fail(label, 'was accepted');
};

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const card = (n = 1, extra = {}) => ({ uid: `c${n}`, i: id(n), n: 'Llanowar Elves', t: 'Creature - Elf Druid', m: '{G}', k: [], tapped: false, turnEntered: null, ...extra });
const NOW = 1_800_000_000_000; // a fixed time in ms

// ---- which cards can be pinged ----
same('the public zones, and only those', PING_ZONES, ['battlefield', 'graveyard', 'exile', 'command']);
for (const zone of PING_ZONES) check(`a card in the ${zone} can be pinged`, canPing(zone));
for (const zone of ['hand', 'library', 'sideboard', 'stack', '', undefined, null, 'toString']) check(`a card in "${zone}" cannot be pinged`, !canPing(zone));

// ---- the number of a ping ----
same('the key is the time in whole seconds', pingKey(0, NOW), NOW / 1000);
same('a ping in the same second as the last is one more', pingKey(NOW / 1000, NOW + 500), NOW / 1000 + 1);
same('...and again one more', pingKey(NOW / 1000 + 1, NOW + 700), NOW / 1000 + 2);
same('a later second is the time again', pingKey(NOW / 1000, NOW + 5000), NOW / 1000 + 5);
same('a previous number that is not a number is ignored', [pingKey('x', NOW), pingKey(null, NOW), pingKey(-4, NOW), pingKey(1.5, NOW), pingKey(NaN, NOW)], Array(5).fill(NOW / 1000));
same('a clock that is behind the last ping still gives a new number', pingKey(NOW / 1000 + 100, NOW), NOW / 1000 + 101);
refused('a clock so far ahead that the number is over the limit is refused', () => pingKey(0, 1e18), /clock/);
refused('a previous ping at the limit leaves no new number', () => pingKey(NUMBER_LIMIT, NOW), /clock/);

// ---- the record that is written ----
{
  const record = makePing(card(7, { tapped: true, ct: { p: 2 }, mp: 1 }), 'battlefield', { previous: 0, now: NOW });
  same('the record is { k, card } and nothing else', Object.keys(record).sort(), ['card', 'k']);
  same('k is the number of the ping', record.k, NOW / 1000);
  same('the card is the card packed as the game stores it (with its counters and tapped mark)', record.card, packCard(card(7, { tapped: true, ct: { p: 2 }, mp: 1 })));
  check('and it reads back as a card with the same copy number, id and name', (() => { const back = unpackCard(record.card); return back && back.uid === 'c7' && back.i === id(7) && back.n === 'Llanowar Elves' && back.tapped === true; })());
  same('the record survives a trip through JSON unchanged', JSON.parse(JSON.stringify(record)), record);
  same('the second ping in the same second gets the next number', makePing(card(), 'graveyard', { previous: record.k, now: NOW }).k, record.k + 1);
  for (const zone of PING_ZONES) check(`a card in the ${zone} can be made into a ping`, makePing(card(), zone, { now: NOW }).card.n === 'Llanowar Elves');
  refused('a card in the hand is refused, in words', () => makePing(card(), 'hand', { now: NOW }), /battlefield/);
  refused('a card in the library is refused', () => makePing(card(), 'library', { now: NOW }), /battlefield/);
  refused('no zone is refused', () => makePing(card(), undefined, { now: NOW }), /battlefield/);
  refused('no card is refused', () => makePing(null, 'battlefield', { now: NOW }), /not a card/);
  refused('text instead of a card is refused', () => makePing('Llanowar Elves', 'battlefield', { now: NOW }), /not a card/);
  refused('a card with a damaged id is refused, naming it', () => makePing(card(1, { i: 'nope' }), 'battlefield', { now: NOW }), /Llanowar Elves cannot be pinged/);
  refused('a card with an empty name is refused', () => makePing(card(1, { n: '' }), 'battlefield', { now: NOW }), /cannot be pinged/);
  refused('a card with a name over 200 characters is refused', () => makePing(card(1, { n: 'x'.repeat(201) }), 'battlefield', { now: NOW }), /cannot be pinged/);
  check('the longest name (200 characters) is accepted', makePing(card(1, { n: 'x'.repeat(200) }), 'battlefield', { now: NOW }).card.n.length === 200);
  const token = makePing({ uid: 'c9', i: id(70), n: 'Goblin', t: 'Token Creature - Goblin', m: '', k: [], tok: true, pt: '1/1', cl: 'R', tapped: false, turnEntered: null }, 'battlefield', { now: NOW });
  same('a token is pinged with its own type line, power and colors', [token.card.tok, token.card.tt, token.card.pt, token.card.cl], [1, 'Token Creature - Goblin', '1/1', 'R']);
}

// ---- reading a stored ping back ----
{
  const good = makePing(card(3), 'battlefield', { now: NOW });
  const lookup = ({ i }) => (i === id(3) ? { t: 'Creature - Elf Druid', m: '{G}', k: ['Haste'] } : null);
  const read = readPing(good, lookup);
  same('a good ping reads back with its number and its card (type and keywords from the card list)', [read.k, read.card.uid, read.card.n, read.card.t, read.card.k], [good.k, 'c3', 'Llanowar Elves', 'Creature - Elf Druid', ['Haste']]);
  check('without a card list the card still reads, with no type', readPing(good).card.t === '' && readPing(good).card.n === 'Llanowar Elves');
  for (const [label, value] of [['nothing', undefined], ['null', null], ['text', 'ping'], ['a number', 5], ['an array', [good]], ['true', true], ['an empty object', {}],
    ['no card', { k: 5 }], ['no number', { card: good.card }], ['a number as text', { ...good, k: String(good.k) }], ['zero', { ...good, k: 0 }], ['negative', { ...good, k: -3 }],
    ['a fraction', { ...good, k: 1.5 }], ['over the limit', { ...good, k: NUMBER_LIMIT + 1 }], ['NaN', { ...good, k: NaN }], ['Infinity', { ...good, k: Infinity }],
    ['a card that is text', { ...good, card: 'Island' }], ['a card with a bad id', { ...good, card: { ...good.card, i: 'x' } }], ['a card with a bad copy number', { ...good, card: { ...good.card, u: 'bad' } }],
    ['a card with an empty name', { ...good, card: { ...good.card, n: '' } }], ['a card with a name over 200', { ...good, card: { ...good.card, n: 'x'.repeat(201) } }],
    ['a card with an unknown field marked as a token but no type', { ...good, card: { ...good.card, tok: 1 } }], ['a card that is an array', { ...good, card: [good.card] }]]) {
    check(`a damaged ping is dropped: ${label}`, readPing(value, lookup) === null, JSON.stringify(readPing(value, lookup)));
  }
  check('a number exactly at the limit is accepted', readPing({ ...good, k: NUMBER_LIMIT }, lookup)?.k === NUMBER_LIMIT);
  check('a number of 1 is accepted', readPing({ ...good, k: 1 }, lookup)?.k === 1);
  check('markup in a name comes back as the same text (it is drawn as text, never as markup)', readPing({ ...good, card: { ...good.card, n: '<img src=x onerror=alert(1)>' } }, lookup).card.n === '<img src=x onerror=alert(1)>');
}

// ---- which pings a page shows ----
{
  const ping = (n, k, name = 'Llanowar Elves') => ({ k, card: { u: `c${n}`, i: id(n), n: name } });
  const branch = (extra = {}) => ({ life: 40, ...extra });

  // the first snapshot only remembers
  let result = newPings({ alice: branch({ ping: ping(1, 100) }), bob: branch() }, null);
  same('the first snapshot shows nothing (an old ping does not come back after a refresh)', result.shown, []);
  same('...and remembers each ping it saw', result.seen, { alice: 100 });
  let seen = result.seen;

  result = newPings({ alice: branch({ ping: ping(1, 100) }), bob: branch() }, seen);
  same('the same snapshot again shows nothing', result.shown, []);

  result = newPings({ alice: branch({ ping: ping(1, 100) }), bob: branch({ ping: ping(2, 105, 'Sol Ring') }) }, seen);
  same('a ping from another player is shown once', result.shown.map((p) => [p.uid, p.k, p.card.n]), [['bob', 105, 'Sol Ring']]);
  seen = result.seen;
  same('...and remembered', seen, { alice: 100, bob: 105 });
  same('...so the next snapshot shows nothing', newPings({ alice: branch({ ping: ping(1, 100) }), bob: branch({ ping: ping(2, 105, 'Sol Ring') }) }, seen).shown, []);

  result = newPings({ alice: branch({ ping: ping(3, 101, 'Island') }), bob: branch({ ping: ping(2, 105, 'Sol Ring') }) }, seen);
  same('a new ping from the same player, with a different number, is shown', result.shown.map((p) => [p.uid, p.k]), [['alice', 101]]);

  result = newPings({ alice: branch({ ping: ping(3, 90, 'Island') }) }, seen);
  same('a number that is LOWER than the last one is shown too (a number only has to be different, a clock can be wrong)', result.shown.map((p) => p.k), [90]);

  result = newPings({ alice: branch({ ping: ping(1, 110) }), bob: branch({ ping: ping(2, 107, 'Sol Ring') }), cy: branch({ ping: ping(4, 109, 'Mind Stone') }) }, { alice: 100, bob: 105 });
  same('two new pings at once are shown oldest first, and a player not seen before counts as new', result.shown.map((p) => [p.uid, p.k]), [['bob', 107], ['cy', 109], ['alice', 110]]);
  same('pings with the same number are ordered by player', newPings({ zed: branch({ ping: ping(1, 50) }), amy: branch({ ping: ping(2, 50) }) }, {}).shown.map((p) => p.uid), ['amy', 'zed']);

  result = newPings({ alice: branch({ ping: ping(1, 110) }) }, { alice: 110, bob: 105 });
  same('a player who has no ping now is remembered as before', result.seen, { alice: 110, bob: 105 });
  result = newPings({ alice: branch(), bob: branch({ ping: ping(2, 105, 'Sol Ring') }) }, { alice: 110, bob: 105 });
  same('a ping that is deleted shows nothing', result.shown, []);

  // a hostile or damaged branch shows nothing and breaks nothing
  for (const [label, branches] of [['null', null], ['undefined', undefined], ['text', 'x'], ['an array', []], ['a damaged ping', { eve: branch({ ping: { k: 5, card: 'x' } }) }], ['no branch', { eve: null }], ['a branch that is text', { eve: 'x' }], ['a ping that is text', { eve: { ping: 'now' } }]]) {
    const r = newPings(branches, {});
    same(`${label} shows nothing and does not throw`, [r.shown, typeof r.seen], [[], 'object']);
  }
  same('the first snapshot of a damaged table is also fine', newPings(null, null), { shown: [], seen: {} });
  same('the memory passed in is not changed', (() => { const mine = { alice: 1 }; newPings({ alice: branch({ ping: ping(1, 2) }) }, mine); return mine; })(), { alice: 1 });
  check('a ping that is a prototype name is not mistaken for something seen', newPings({ toString: branch({ ping: ping(1, 7) }) }, {}).shown.length === 1);
}

// ---- the words ----
same('the sentence names the seat, the player and the card', pingSentence('Alice', '2', { n: 'Sol Ring' }), 'Seat 2: Alice pinged Sol Ring.');
same('without a seat it leaves the seat out', pingSentence('Alice', '', { n: 'Sol Ring' }), 'Alice pinged Sol Ring.');

console.log(`All ${checks} ping checks passed.`);
