// Tests for the commander tax: changeTax and commanderUids in shared/zones.mjs and shared/commander-zone.mjs.
import { makeGame, moveCard, changeTax, commanderUids, checkGame, seededRandom, MAX_COUNT } from '../shared/zones.mjs';
import { taxEntries, taxAction, taxWords, TAX_PER_CAST, COMMANDER_TAX_PUBLISHED } from '../shared/commander-zone.mjs';

let checks = 0;
const fail = (label, detail) => { console.log(`FAILED CHECK: ${label}: ${detail}`); process.exit(1); };
const same = (label, actual, expected) => { checks++; if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); };
const check = (label, condition, detail = '') => { checks++; if (!condition) fail(label, detail); };
const refused = (label, run, words) => { checks++; try { run(); } catch (error) { if (error instanceof Error && (!words || words.test(error.message))) return; fail(label, `wrong message: ${error.message}`); } fail(label, 'was accepted'); };

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const deckOf = (commanders) => ({ cards: [...commanders.map((n, i) => ({ i: id(10 + i), n, qty: 1, section: 'commander' })), { i: id(1), n: 'Forest', qty: 40, section: 'main' }], commander: [] });
const fresh = (commanders = ['Tymna the Weaver', 'Thrasios, Triton Hero']) => makeGame(deckOf(commanders), () => ({ t: 'Legendary Creature', m: '', k: [] }), { random: seededRandom(2) });

// ---- the game knows its commanders ----
{
  const game = fresh();
  same('the commanders are the cards in the command zone at the start', [game.cmd, game.zones.command.map((c) => c.uid)], [['c1', 'c2'], ['c1', 'c2']]);
  check('a deck with no commander has no cmd and no commanders', !('cmd' in fresh([])) && commanderUids(fresh([])).length === 0);
  same('after a commander is cast the list stays', commanderUids(moveCard(game, 'c1', 'battlefield')), ['c1', 'c2']);
  same('a game with no cmd (from the live table) uses the command zone', commanderUids({ zones: { command: [{ uid: 'c9' }] } }), ['c9']);
  check('a new game starts with no tax', !('tax' in game));
}

// ---- changing the tax ----
{
  const game = fresh();
  const once = changeTax(game, 'c1', 1);
  same('one cast is stored under the commander', once.tax, { c1: 1 });
  same('two commanders have their own counts', changeTax(once, 'c2', 3).tax, { c1: 1, c2: 3 });
  same('it counts down and the key goes when it reaches 0', ['tax' in changeTax(once, 'c1', -1), changeTax(once, 'c1', -9).tax], [false, undefined]);
  same('the tax follows the commander out of the command zone', changeTax(moveCard(game, 'c1', 'battlefield'), 'c1', 1).tax, { c1: 1 });
  refused('a card that is not a commander has no tax', () => changeTax(game, game.zones.library[0].uid, 1), /not one of your commanders/);
  refused('a made-up uid has no tax', () => changeTax(game, 'zzz', 1), /not one of your commanders/);
  for (const bad of [0, 1.5, NaN, '1', null]) refused(`a step of ${String(bad)}`, () => changeTax(game, 'c1', bad), /whole number/);
  same('it stops at the limit', changeTax(changeTax(game, 'c1', MAX_COUNT), 'c1', 5).tax, { c1: MAX_COUNT });
  check('the old game is not changed', (() => { const frozen = JSON.stringify(game); changeTax(game, 'c1', 1); return JSON.stringify(game) === frozen; })());
  check('life and the zones are untouched', changeTax(game, 'c1', 1).life === game.life && changeTax(game, 'c1', 1).zones === game.zones);
  check('checkGame accepts a good tax', checkGame(once).length === 0 && checkGame(changeTax(changeTax(game, 'c1', 2), 'c2', 1)).length === 0);
  for (const [label, patch] of [['empty tax', { tax: {} }], ['tax for a card that is not a commander', { tax: { c9: 1 } }], ['a zero count', { tax: { c1: 0 } }], ['a count over the limit', { tax: { c1: MAX_COUNT + 1 } }], ['tax as a list', { tax: [1] }], ['an empty list of commanders', { cmd: [] }], ['three commanders', { cmd: ['c1', 'c2', 'c3'] }], ['a commander that is not in the game', { cmd: ['c1', 'nope'] }], ['the same commander twice', { cmd: ['c1', 'c1'] }], ['cmd as text', { cmd: 'c1' }]]) {
    check(`checkGame notices ${label}`, checkGame({ ...structuredClone(game), ...patch }).length > 0, label);
  }
}

// ---- what the page shows ----
{
  const game = fresh();
  same('one entry per commander, in order, with no tax yet', taxEntries(game).map((e) => [e.uid, e.slot, e.name, e.inZone, e.casts, e.tax]), [['c1', 1, 'Tymna the Weaver', true, 0, 0], ['c2', 2, 'Thrasios, Triton Hero', true, 0, 0]]);
  const played = changeTax(moveCard(changeTax(game, 'c1', 2), 'c1', 'battlefield'), 'c2', 1);
  same('the tax is two for each cast, and a commander that has left the zone says where it is', taxEntries(played).map((e) => [e.zone, e.inZone, e.casts, e.tax]), [['battlefield', false, 2, 4], ['command', true, 1, 2]]);
  same('the words', [taxWords(taxEntries(played)[0]), taxWords(taxEntries(game)[0]), TAX_PER_CAST], ['Tax +4', 'Tax +0', 2]);
  same('a deck with no commander has no entries', taxEntries(fresh([])), []);
  check('a deck with one commander has one entry', taxEntries(fresh(['Krenko, Mob Boss'])).length === 1);
  const up = taxAction(game, 'c1', 1);
  same('adding a cast changes the game and says so', [up.run(game).tax, up.message], [{ c1: 1 }, 'Tymna the Weaver: cast 1 time, tax +2.']);
  same('and the second one says "times"', taxAction(changeTax(game, 'c1', 1), 'c1', 1).message, 'Tymna the Weaver: cast 2 times, tax +4.');
  same('taking one back at 0 stays at 0', taxAction(game, 'c1', -1).message, 'Tymna the Weaver: cast 0 times, tax +0.');
  same('not a commander, or a step that is not 1 or more, gives nothing', [taxAction(game, 'c9', 1), taxAction(game, 'c1', 0), taxAction(game, 'c1', 1.5), taxAction(game, 'c1', 'x')], [null, null, null, null]);
  check('the live table does not have it yet (the published rules do not accept it)', COMMANDER_TAX_PUBLISHED === false);
}

// ---- a random walk keeps the game consistent ----
{
  const random = seededRandom(11);
  let game = fresh();
  const zones = ['library', 'hand', 'battlefield', 'graveyard', 'exile', 'command', 'sideboard'];
  for (let step = 0; step < 1000; step++) {
    const roll = random();
    if (roll < 0.4) game = changeTax(game, ['c1', 'c2'][Math.floor(random() * 2)], (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 3)));
    else { const card = game.zones[zones[Math.floor(random() * zones.length)]]; if (card.length) game = moveCard(game, card[Math.floor(random() * card.length)].uid, zones[Math.floor(random() * zones.length)]); }
    const problems = checkGame(game);
    if (problems.length) fail(`random walk step ${step}`, problems.join('; '));
  }
  check('1,000 random moves and tax changes keep the game consistent', true);
}

console.log(`All ${checks} commander zone checks passed.`);
