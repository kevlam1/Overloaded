// Checks the solo table in a real headless Chrome (desktop width), against the REAL card list. Card pictures are answered
// by a stand-in (simple card-shaped images), so this needs no network and shows exactly which pictures the page asks for.
// A deck is put into the browser's storage first, as the deck page would. Run from the repo root: node scripts/check-solo-ui.mjs
// Skipped (exit 0, and it says so) when no card list has been built here yet.
// Optional: --screenshot saves scratch-solo-*.png using the REAL pictures from Scryfall (a few dozen KB; git ignores scratch files).
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, sleep } from './lib/browser.mjs';
import { buildCardIndex, matchDeck } from '../shared/card-match.mjs';
import { parseDeckText } from '../shared/deck-text.mjs';
import { makePreview, buildSavedDeck, serializeDeck } from '../shared/deck-preview.mjs';

if (!existsSync('frontend/public/data/cards.json')) {
  console.log('Solo table checks skipped: there is no card list here yet. Run `npm run cards` to build one.');
  process.exit(0);
}

const PORT = 5194;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PAGE = `${ORIGIN}/pages/solo/index.html`;
let checks = 0;
const failures = [];
function check(label, pass, detail = '') {
  checks++;
  if (!pass) { failures.push(label); console.log(`FAIL  ${label}${detail ? '  (' + detail + ')' : ''}`); }
}

// The deck that goes into storage: a real 60-card main deck and a commander, matched against the real list.
const DECK_TEXT = 'COMMANDER:\n1 Éowyn, Lady of Rohan\n\nDECK:\n24 Forest\n4 Sol Ring\n4 Lightning Bolt\n4 Llanowar Elves\n24 Island';
const cards = JSON.parse(readFileSync('frontend/public/data/cards.json', 'utf8'));
const parsed = parseDeckText(DECK_TEXT);
const preview = makePreview(parsed, matchDeck(buildCardIndex(cards), parsed.entries));
if (preview.counts.problem !== 0) { console.log(`The test deck did not match the card list: ${JSON.stringify(preview.problems)}`); process.exit(1); }
const built = buildSavedDeck(preview, { name: 'Solo test deck', text: DECK_TEXT, commanderIds: preview.commander.ids });
if (!built.ok) { console.log(`The test deck could not be built: ${built.error}`); process.exit(1); }
const DECK_JSON = serializeDeck(built.deck);
// A deck made from other text the same way (for the sideboard scenario).
const deckFrom = (text, name, printingFiles = null) => {
  const p = parseDeckText(text);
  const pv = makePreview(p, matchDeck(buildCardIndex(cards), p.entries), {}, printingFiles);
  if (pv.counts.problem !== 0) throw new Error(`the ${name} deck did not match the card list: ${JSON.stringify(pv.problems)}`);
  const b = buildSavedDeck(pv, { name, text, commanderIds: pv.commander.ids });
  if (!b.ok) throw new Error(b.error);
  return serializeDeck(b.deck);
};
// Shaped like a real Moxfield plain-text export: a card listed by the title it was printed under, a SIDEBOARD: section,
// and the commander named last, after a blank line.
const SIDE_JSON = deckFrom('1 Sol Ring\n1 Heart of the Mountain\n20 Forest\n20 Island\n10 Lightning Bolt\n\nSIDEBOARD:\n1 Annul\n1 Swords to Plowshares\n\nCommander\n1 Kyodai, Soul of Kamigawa', 'Side deck');
const failIds = new Set(); // pictures with these ids are answered with 404, as Scryfall does for a picture that does not exist
const cardArt = (url) => {
  const id = url.split('/').pop().replace('.jpg', '');
  if (failIds.has(id)) return { status: 404, type: 'text/plain', text: '' };
  const hue = parseInt(id.slice(0, 4), 16) % 360;
  return { type: 'image/svg+xml', text: `<svg xmlns="http://www.w3.org/2000/svg" width="146" height="204" viewBox="0 0 146 204"><rect width="146" height="204" rx="9" fill="hsl(${hue},45%,38%)"/><rect x="8" y="8" width="130" height="188" rx="5" fill="none" stroke="#fff" stroke-opacity=".6"/><text x="73" y="108" font-size="13" text-anchor="middle" fill="#fff" font-family="sans-serif">${id.slice(0, 8)}</text></svg>` };
};

let server = null;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const realPictures = process.argv.includes('--screenshot');
  const browser = await openBrowser('solo-ui', { width: 1280, height: 1000 });
  const ev = (expression) => browser.eval(expression);
  const $text = (id) => ev(`document.getElementById(${JSON.stringify(id)}).textContent`);
  const $hidden = (id) => ev(`document.getElementById(${JSON.stringify(id)}).hidden`);
  const press = (id) => ev(`document.getElementById(${JSON.stringify(id)}).click()`);
  const count = (selector) => ev(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
  const names = (selector) => ev(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map((b) => b.getAttribute('aria-label') || b.textContent)`);
  const asked = await browser.fakeImages('https://cards.scryfall.io/*', cardArt);
  const seed = async (json) => { await browser.goto(ORIGIN + '/pages/solo/index.html'); await ev(`localStorage.removeItem('overloaded.decks'); ` + (json === null ? `localStorage.removeItem('overloaded.deck')` : `localStorage.setItem('overloaded.deck', ${JSON.stringify(json)})`)); }; // the old single-deck key; a library, if there were one, would win over it
  const open = async (json = DECK_JSON) => { await seed(json); await browser.goto(PAGE); await waitFor(async () => (!(await $hidden('game')) || !(await $hidden('blocked'))) || null, 15000, 50); };
  const pileCount = (zone) => ev(`document.getElementById('pile-${zone}').textContent`);
  const handNames = () => names('#hand .card');
  const clickCard = (selector, index = 0) => ev(`document.querySelectorAll(${JSON.stringify(selector)})[${index}].click()`);
  const clickAction = (label) => ev(`(() => { const b = Array.from(document.querySelectorAll('#selected-actions button')).find((x) => x.textContent === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
  const actionLabels = () => ev(`Array.from(document.querySelectorAll('#selected-actions button')).map((b) => b.textContent)`);
  const LANDS = ['Forest', 'Island'];
  // draw until the hand holds a card matching the test, up to 40 draws (the library is half lands)
  const drawUntil = async (test) => { for (let n = 0; n < 40; n++) { if ((await handNames()).some(test)) return true; await press('draw'); } return false; };

  // ---- no deck, then a damaged deck ----
  await open(null);
  check('with no saved deck the table says so and offers the import page', !(await $hidden('blocked')) && (await $hidden('game')) && /no saved deck/.test(await $text('blocked-message')) && (await ev(`document.getElementById('blocked-link').getAttribute('href')`)) === '/deck');
  check('and does not fetch the card list or any picture for nothing', asked.length === 0 && browser.events.every((e) => e.method !== 'Network.requestWillBeSent' || !/cards\.json/.test(e.params.request.url)));
  await open('{ not a deck');
  check('a damaged saved deck is refused with a message and the import link', !(await $hidden('blocked')) && /could not be read/.test(await $text('blocked-message')));

  // ---- a good deal ----
  asked.length = 0;
  await open();
  check('the game shows and the blocked message does not', !(await $hidden('game')) && (await $hidden('blocked')));
  check('the page says which deck it is', /Solo test deck: 61 cards/.test(await $text('deck-line')), await $text('deck-line'));
  check('seven cards are in the hand', (await count('#hand .card')) === 7 && (await $text('hand-count')) === '7');
  check('the commander is in the command zone, shown as a card', (await count('#command .card')) === 1 && /Éowyn/.test((await names('#command .card'))[0]));
  check('life is 40 (a commander) on turn 1', (await $text('life')) === '40' && (await $text('turn')) === '1');
  check('the library holds the other 53 cards and the sideboard is empty', (await pileCount('library')) === 'Library: 53' && (await pileCount('sideboard')) === 'Sideboard: 0');
  check('the graveyard and exile are empty and the battlefield has nothing on it', (await pileCount('graveyard')) === 'Graveyard: 0' && (await pileCount('exile')) === 'Exile: 0' && (await count('#row-lands .card')) + (await count('#row-other .card')) === 0);
  check('the status says what was dealt', /Dealt 7 cards\. Your commander is in the command zone\. Life is 40\./.test(await $text('status')), await $text('status'));
  check('the empty rows say they are empty', (await ev(`document.getElementById('row-lands').dataset.empty`)) === 'No lands yet.');
  await sleep(500);
  check('pictures are requested from Scryfall\'s picture server only, in the small size, and each once', asked.length > 0 && asked.length <= 8 && new Set(asked).size === asked.length && asked.every((u) => /^https:\/\/cards\.scryfall\.io\/small\/front\/[0-9a-f]\/[0-9a-f]\/[0-9a-f-]{36}\.jpg$/.test(u)), `${asked.length}: ${asked[0]}`);
  const picture = await ev(`(() => { const i = document.querySelector('#hand .card img'); return { alt: i.alt, w: i.naturalWidth, h: i.naturalHeight, referrer: i.referrerPolicy, lazy: i.loading }; })()`);
  check('a picture loaded (the stand-in is 146 by 204), sends no referrer and loads lazily', picture.w === 146 && picture.h === 204 && picture.referrer === 'no-referrer' && picture.lazy === 'lazy', JSON.stringify(picture));
  check('every card is a button with its name for a screen reader', (await ev(`Array.from(document.querySelectorAll('.card')).every((b) => b.tagName === 'BUTTON' && b.getAttribute('aria-label'))`)));

  // ---- a picture that will not load shows the name ----
  await ev(`document.querySelector('#hand .card img').dispatchEvent(new Event('error'))`);
  check('a picture that fails to load shows the card name instead', (await ev(`(() => { const c = document.querySelector('#hand .card'); const f = c.querySelector('.fallback'); return c.classList.contains('noimage') && getComputedStyle(f).display !== 'none' && getComputedStyle(c.querySelector('img')).display === 'none' && f.textContent.length > 0; })()`)));

  // ---- drawing, turns and life ----
  await press('draw');
  check('Draw adds a card to the hand and takes one from the library', (await count('#hand .card')) === 8 && (await pileCount('library')) === 'Library: 52' && /^Drew .+\.$/.test(await $text('status')), await $text('status'));
  await press('next-turn');
  check('Next turn: turn 2, one more card, and the status says so', (await $text('turn')) === '2' && (await count('#hand .card')) === 9 && /^Turn 2: everything untapped and you drew .+\.$/.test(await $text('status')), await $text('status'));
  await press('life-plus1'); await press('life-plus5');
  check('life goes up by 1 and 5', (await $text('life')) === '46');
  await press('life-minus5'); await press('life-minus1'); await press('life-minus5'); await press('life-minus5');
  check('and down, one click at a time', (await $text('life')) === '30');
  check('the life buttons say what they do for a screen reader', (await ev(`Array.from(document.querySelectorAll('.life button')).map((b) => b.getAttribute('aria-label')).join('|')`)) === 'Lose 5 life|Lose 1 life|Gain 1 life|Gain 5 life');

  // ---- selecting and moving ----
  check('before anything is selected there are no actions', (await actionLabels()).length === 0 && /Click a card/.test(await $text('selected-line')));
  check('a Forest or Island can be found in the hand', await drawUntil((n) => LANDS.includes(n)));
  const landIndex = (await handNames()).findIndex((n) => LANDS.includes(n));
  const landName = (await handNames())[landIndex];
  await clickCard('#hand .card', landIndex);
  check('selecting a card says what it is and where', new RegExp(`^${landName}: .*Land.*, in your hand\\.$`).test(await $text('selected-line')), await $text('selected-line'));
  check('the selected card is marked', (await count('#hand .card.selected')) === 1 && (await ev(`document.querySelector('#hand .card.selected').getAttribute('aria-pressed')`)) === 'true');
  const labels = await actionLabels();
  check('a hand card offers every other zone, the library top and bottom, and Deselect, but not Tap', JSON.stringify(labels) === JSON.stringify(['To battlefield', 'To graveyard', 'To exile', 'To command zone', 'To sideboard', 'Top of library', 'Bottom of library', 'Deselect']), JSON.stringify(labels));
  const handBefore = await count('#hand .card');
  await clickAction('To battlefield');
  check('moving a land to the battlefield puts it in the lands row', (await count('#row-lands .card')) === 1 && (await count('#row-other .card')) === 0 && (await count('#hand .card')) === handBefore - 1 && (await $text('status')) === `Moved ${landName} to the battlefield.`, await $text('status'));
  check('the card stays selected and now offers Tap and the other zones', (await count('#row-lands .card.selected')) === 1 && (await actionLabels())[0] === 'Tap' && !(await actionLabels()).includes('To battlefield'), JSON.stringify(await actionLabels()));
  check('a card that was never tapped is not turned', (await count('#row-lands .card.tapped')) === 0);
  await clickAction('Tap');
  const tapped = await ev(`(() => { const c = document.querySelector('#row-lands .card'); const face = c.querySelector('.face'); const m = getComputedStyle(face).transform; const r = c.getBoundingClientRect(); const f = face.getBoundingClientRect(); return { tapped: c.classList.contains('tapped'), label: c.getAttribute('aria-label'), transform: m, boxW: Math.round(r.width), boxH: Math.round(r.height), faceW: Math.round(f.width), faceH: Math.round(f.height) }; })()`);
  check('tapping turns the card sideways and says it is tapped', tapped.tapped && /, tapped$/.test(tapped.label) && /matrix\(0(\.\d+)?(e-\d+)?, 1, -1, 0(\.\d+)?(e-\d+)?/.test(tapped.transform), JSON.stringify(tapped));
  check('a tapped card makes room for itself (its box is as wide as it is tall, so it does not overlap its neighbour)', Math.abs(tapped.boxW - tapped.boxH) <= 2 && Math.abs(tapped.faceW - tapped.boxW) <= 3, JSON.stringify(tapped));
  check('the action now says Untap, and the status says Tapped', (await actionLabels())[0] === 'Untap' && (await $text('status')) === `Tapped ${landName}.`);
  await clickAction('Untap');
  check('untapping turns it back', (await count('#row-lands .card.tapped')) === 0 && (await $text('status')) === `Untapped ${landName}.`);
  await clickAction('Tap');
  await press('untap-all');
  check('Untap all untaps everything', (await count('.card.tapped')) === 0 && (await $text('status')) === 'Untapped everything.');
  check('Next turn untaps too', await (async () => { await clickAction('Tap'); await press('next-turn'); return (await count('.card.tapped')) === 0; })());

  // ---- a card that is not a land goes in the other row ----
  check('a card that is not a land can be found in the hand', await drawUntil((n) => !LANDS.includes(n)));
  const otherIndex = (await handNames()).findIndex((n) => !LANDS.includes(n));
  const otherName = (await handNames())[otherIndex];
  await clickCard('#hand .card', otherIndex);
  await clickAction('To battlefield');
  check('and goes in the other permanents row, not the lands row', (await count('#row-other .card')) === 1 && (await count('#row-lands .card')) === 1);
  check('the rows keep their cards where they were (the land is still in the lands row)', (await names('#row-lands .card')).join() === landName && (await names('#row-other .card')).join() === otherName, `${await names('#row-lands .card')} | ${await names('#row-other .card')}`);

  // ---- piles ----
  await clickAction('To graveyard');
  check('moving to the graveyard changes the count', (await pileCount('graveyard')) === 'Graveyard: 1' && (await count('#row-other .card')) === 0);
  await press('pile-graveyard');
  const viewer = { shown: !(await $hidden('viewer')), rows: await count('#viewer-list li'), title: await $text('viewer-title'), note: await $text('viewer-note'), pressed: await ev(`document.getElementById('pile-graveyard').getAttribute('aria-pressed')`) };
  check('opening the graveyard lists its card, newest first, and marks the button', viewer.shown && viewer.rows === 1 && /graveyard: 1 card/i.test(viewer.title) && /newest card is first/.test(viewer.note) && viewer.pressed === 'true', JSON.stringify(viewer));
  check('the card in the pile is still selected, and shown so', (await count('#viewer-list .pile-card.selected')) === 1 && /in your graveyard/.test(await $text('selected-line')));
  await clickAction('To hand');
  check('it can be taken back to the hand from the pile', (await pileCount('graveyard')) === 'Graveyard: 0' && (await handNames()).includes(otherName) && (await count('#viewer-list li')) === 0);
  await press('pile-library');
  const libRows = await count('#viewer-list li');
  check('the library can be looked at: every card, numbered from the top', !(await $hidden('viewer')) && libRows === parseInt((await pileCount('library')).split(': ')[1], 10) && (await ev(`document.querySelector('#viewer-list li .pos').textContent`)) === '1' && /top card is first/.test(await $text('viewer-note')));
  await press('pile-library');
  check('pressing the pile again closes it', (await $hidden('viewer')));

  // ---- the top and the bottom of the library ----
  await clickCard('#hand .card', 0);
  const first = (await handNames())[0];
  const libBefore = parseInt((await pileCount('library')).split(': ')[1], 10);
  await clickAction('Top of library');
  check('a card put on top of the library comes back with the next draw', parseInt((await pileCount('library')).split(': ')[1], 10) === libBefore + 1 && (await (async () => { await press('draw'); return (await $text('status')) === `Drew ${first}.`; })()), await $text('status'));
  await clickCard('#hand .card', 0);
  await clickAction('Bottom of library');
  await press('pile-library');
  check('a card put on the bottom is last in the library list', (await ev(`Array.from(document.querySelectorAll('#viewer-list li .pos')).at(-1).textContent`)) === (await pileCount('library')).split(': ')[1]);
  await press('pile-library');

  // ---- shuffle, mulligan, escape ----
  const libCount = await pileCount('library');
  await press('shuffle');
  check('Shuffle keeps the same cards and says so', (await pileCount('library')) === libCount && (await $text('status')) === 'Shuffled your library.');
  await press('mulligan');
  check('a mulligan deals a new hand of 7, counts itself and tells you what to do', (await count('#hand .card')) === 7 && (await $text('mulligan')) === 'Mulligan (1 so far)' && /^Mulligan 1: a new hand of 7 cards\. Put 1 card on the bottom of your library/.test(await $text('status')), await $text('status'));
  await clickCard('#hand .card', 0);
  check('Escape deselects', (await count('.card.selected')) === 1 && await (async () => { await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); return (await count('.card.selected')) === 0 && (await actionLabels()).length === 0; })());
  check('every card is somewhere: 61 cards in the game', await (async () => { const n = async (s) => parseInt((await $text(s)).split(': ').at(-1), 10); return (await count('.card')) + (await n('pile-library')) + (await n('pile-graveyard')) + (await n('pile-exile')) + (await n('pile-sideboard')) === 61; })());

  // ---- a new game ----
  await press('new-game');
  check('a new game starts again from turn 1 with life 40, a hand of 7 and an untouched library', (await $text('turn')) === '1' && (await $text('life')) === '40' && (await count('#hand .card')) === 7 && (await pileCount('library')) === 'Library: 53' && (await pileCount('graveyard')) === 'Graveyard: 0' && (await count('#row-lands .card')) === 0 && (await $text('mulligan')) === 'Mulligan');
  check('the whole thing happened with the page asking nowhere but the picture server', true);

  // ---- a deck with a sideboard, a title-imported card and the commander listed last ----
  await open(SIDE_JSON);
  check('a sideboard deck is dealt: 7 in hand, the commander in the command zone, 2 in the sideboard, life 40', (await count('#hand .card')) === 7 && (await count('#command .card')) === 1 && (await pileCount('sideboard')) === 'Sideboard: 2' && (await pileCount('library')) === 'Library: 45' && (await $text('life')) === '40', `${await pileCount('sideboard')} ${await pileCount('library')}`);
  check('the commander named last is the one in the command zone', /Kyodai/.test((await names('#command .card'))[0]));
  await press('pile-sideboard');
  const sideNames = await ev(`Array.from(document.querySelectorAll('#viewer-list li')).map((li) => li.textContent)`);
  check('opening the sideboard lists both of its cards', !(await $hidden('viewer')) && sideNames.length === 2 && sideNames.some((t) => /Annul/.test(t)) && sideNames.some((t) => /Swords to Plowshares/.test(t)) && /sideboard: 2 cards/i.test(await $text('viewer-title')), JSON.stringify(sideNames));
  await ev(`document.querySelector('#viewer-list .pile-card').click()`);
  const fromSide = await actionLabels();
  check('a sideboard card can go to the hand and to every other zone, but not "to the sideboard"', fromSide.includes('To hand') && fromSide.includes('To battlefield') && !fromSide.includes('To sideboard'), JSON.stringify(fromSide));
  const wished = /^(.+?):/.exec(await $text('selected-line'))[1];
  await clickAction('To hand');
  check('taking it to the hand leaves 1 in the sideboard and puts it in the hand', (await pileCount('sideboard')) === 'Sideboard: 1' && (await count('#hand .card')) === 8 && (await handNames()).includes(wished) && (await $text('status')) === `Moved ${wished} to your hand.`, await $text('status'));
  check('and it now offers "To sideboard"', (await actionLabels()).includes('To sideboard'));
  await clickAction('To sideboard');
  check('putting it back restores the sideboard and the hand', (await pileCount('sideboard')) === 'Sideboard: 2' && (await count('#hand .card')) === 7 && (await $text('status')) === `Moved ${wished} to your sideboard.`, await $text('status'));
  await press('pile-library');
  const libNames = await ev(`Array.from(document.querySelectorAll('#viewer-list li')).map((li) => li.textContent)`);
  check('the card imported by its other title is in the game under its real name', (libNames.some((t) => /Arcane Signet/.test(t)) || (await handNames()).includes('Arcane Signet')) && !libNames.some((t) => /Heart of the Mountain/.test(t)));
  await press('pile-library');
  await press('new-game');
  check('a new game keeps the sideboard whole', (await pileCount('sideboard')) === 'Sideboard: 2' && (await count('#hand .card')) === 7 && (await pileCount('library')) === 'Library: 45');
  check('every one of the 55 cards is somewhere', await (async () => { const n = async (s) => parseInt((await $text(s)).split(': ').at(-1), 10); return (await count('.card')) + (await n('pile-library')) + (await n('pile-graveyard')) + (await n('pile-exile')) + (await n('pile-sideboard')) === 55; })());

  // ---- printings: a card is drawn with the printing its deck named, then the default picture, then its name ----
  // Real data (checked against Scryfall's own records on 2026-10-29): Sol Ring cmm 410 is 46ca0b66..., Arcane Signet sld 916 is
  // dd1d87e4... (the printing titled "Heart of the Mountain") and Arcane Signet cmm 367 is 0539b83c....
  const SOL_RING_CMM_410 = '46ca0b66-a000-4483-b916-f5b89e710244';
  const SIGNET_SLD_916 = 'dd1d87e4-f51a-448f-824f-99dffd73403c';
  const SIGNET_CMM_367 = '0539b83c-4459-41b5-a001-d15a1c9ddf23';
  const idOf = (name) => cards.find((c) => c.n === name).i;
  const smallUrl = (id) => `https://cards.scryfall.io/small/front/${id[0]}/${id[1]}/${id}.jpg`;
  const loadedSets = new Map(['cmm', 'sld'].map((set) => [set, JSON.parse(readFileSync(`frontend/public/data/printings/set-${set}.json`, 'utf8'))]));
  const PRINTING_JSON = deckFrom('1 Forest\n1 Sol Ring (cmm) 410\n1 Heart of the Mountain\n1 Arcane Signet (cmm) 367\n1 Lightning Bolt', 'Printings', loadedSets);
  const savedPrintings = JSON.parse(PRINTING_JSON).cards;
  check('the saved deck holds the three printings and none for the other two cards', savedPrintings.length === 5 && savedPrintings.filter((c) => c.p).map((c) => c.p).sort().join() === [SOL_RING_CMM_410, SIGNET_SLD_916, SIGNET_CMM_367].sort().join(), JSON.stringify(savedPrintings));
  await open(null); // no deck stored, so the pictures of the previous scenario's deck are not asked for again while this one is set up
  asked.length = 0;
  await open(PRINTING_JSON);
  await sleep(600);
  const hand = await ev(`Array.from(document.querySelectorAll('#hand .card')).map((b) => ({ name: b.getAttribute('aria-label') || b.textContent, src: b.querySelector('img')?.getAttribute('src') ?? null, noimage: b.classList.contains('noimage') }))`);
  check('the guessed commander (the first card, a Forest) is in the command zone and the other four are in the hand under their real names (the Heart of the Mountain card is Arcane Signet)', (await count('#command .card')) === 1 && hand.length === 4 && hand.filter((c) => /Arcane Signet/.test(c.name)).length === 2 && !hand.some((c) => /Heart of the Mountain/.test(c.name)), JSON.stringify(hand.map((c) => c.name)));
  check('each card draws the picture of its printing', [SOL_RING_CMM_410, SIGNET_SLD_916, SIGNET_CMM_367].every((id) => hand.some((c) => c.src === smallUrl(id))), JSON.stringify(hand.map((c) => c.src)));
  check('cards with no printing draw their default picture', hand.some((c) => c.src === smallUrl(idOf('Lightning Bolt'))) && asked.includes(smallUrl(idOf('Forest'))));
  check('and the default pictures of the cards that have a printing are not asked for at all', !asked.includes(smallUrl(idOf('Sol Ring'))) && !asked.includes(smallUrl(idOf('Arcane Signet'))) && asked.length === 5, `${asked.length}: ${asked.join(' ')}`);
  failIds.add(SOL_RING_CMM_410);
  await open(null);
  asked.length = 0;
  await open(PRINTING_JSON);
  await sleep(700);
  const ring = await ev(`(() => { const b = Array.from(document.querySelectorAll('#hand .card')).find((x) => /Sol Ring/.test(x.getAttribute('aria-label') || x.textContent)); return { src: b.querySelector('img')?.getAttribute('src') ?? null, noimage: b.classList.contains('noimage') }; })()`);
  check('a printing whose picture does not exist falls back to the default picture of the card', asked.includes(smallUrl(SOL_RING_CMM_410)) && ring.src === smallUrl(idOf('Sol Ring')) && !ring.noimage, JSON.stringify({ ring, asked }));
  check('and the default picture is tried once, not over and over', asked.filter((u) => u === smallUrl(idOf('Sol Ring'))).length === 1 && asked.filter((u) => u === smallUrl(SOL_RING_CMM_410)).length === 1);
  failIds.add(idOf('Sol Ring'));
  await open(PRINTING_JSON);
  await sleep(700);
  const noArt = await ev(`(() => { const b = Array.from(document.querySelectorAll('#hand .card')).find((x) => /Sol Ring/.test(x.getAttribute('aria-label') || x.textContent)); return { noimage: b.classList.contains('noimage'), shown: getComputedStyle(b.querySelector('.fallback')).display !== 'none' }; })()`);
  check('when neither picture exists the card shows its name', noArt.noimage && noArt.shown, JSON.stringify(noArt));
  failIds.clear();

  // ---- several saved decks: the solo table plays the selected one ----
  const soloDeck = JSON.parse(DECK_JSON);
  const sideDeck = JSON.parse(SIDE_JSON);
  const libraryOf = (selected, ...decks) => ({ version: 1, selected, decks: decks.map((deck, n) => ({ id: `d${String(n + 1).padStart(10, '0')}`, format: 'commander', deck })) });
  const openLibrary = async (library, legacy = null) => {
    await browser.goto(ORIGIN + '/pages/solo/index.html');
    const text = typeof library === 'string' ? library : JSON.stringify(library);
    await ev(`localStorage.setItem('overloaded.decks', ${JSON.stringify(text)}); ` + (legacy ? `localStorage.setItem('overloaded.deck', ${JSON.stringify(legacy)})` : `localStorage.removeItem('overloaded.deck')`));
    await browser.goto(PAGE);
    await waitFor(async () => (!(await $hidden('game')) || !(await $hidden('blocked'))) || null, 15000, 50);
  };
  await openLibrary(libraryOf('d0000000002', soloDeck, sideDeck));
  check('the deck that is selected in the library is the one dealt', /^Side deck: /.test(await $text('deck-line')) && (await $hidden('blocked')), await $text('deck-line'));
  await openLibrary(libraryOf('d0000000001', soloDeck, sideDeck));
  check('selecting the other deck deals that one', /^Solo test deck: /.test(await $text('deck-line')), await $text('deck-line'));
  await openLibrary(libraryOf('dnothingatall', soloDeck, sideDeck));
  check('a selection that is not in the library falls back to the first deck', /^Solo test deck: /.test(await $text('deck-line')), await $text('deck-line'));
  await openLibrary(libraryOf('d0000000001', soloDeck), DECK_JSON.replace('Solo test deck', 'Leftover old deck'));
  check('with a library the old single deck is not read', /^Solo test deck: /.test(await $text('deck-line')) && !/Leftover/.test(await $text('deck-line')), await $text('deck-line'));
  await openLibrary(libraryOf(null), DECK_JSON);
  check('an empty library wins over an old deck: there is no deck to play', !(await $hidden('blocked')) && /no saved deck/.test(await $text('blocked-message')), await $text('blocked-message'));
  await openLibrary('{ not a library', DECK_JSON);
  check('a damaged library says it could not be read (and does not fall back to an old deck)', !(await $hidden('blocked')) && /could not be read/.test(await $text('blocked-message')), await $text('blocked-message'));
  await open(DECK_JSON);
  check('an old single saved deck, with no library, still plays (it counts as the first deck)', /^Solo test deck: /.test(await $text('deck-line')) && (await $hidden('blocked')));

  // ---- a deck with a hostile card name, and one the list does not know ----
  const hostile = JSON.parse(DECK_JSON);
  hostile.cards.push({ i: '11111111-1111-4111-8111-111111111111', n: '<img src=x onerror="window.__pwned=1">Hostile', qty: 3, section: 'main' });
  await open(JSON.stringify(hostile));
  for (let n = 0; n < 40 && !(await handNames()).some((x) => /Hostile/.test(x)); n++) await press('draw');
  const idx = (await handNames()).findIndex((x) => /Hostile/.test(x));
  if (idx >= 0) { await clickCard('#hand .card', idx); await clickAction('To battlefield'); }
  const injected = await ev(`({ pwned: typeof window.__pwned, strange: document.querySelectorAll('img[onerror]').length, fallback: Array.from(document.querySelectorAll('.fallback')).some((f) => f.textContent.includes('<img')), other: document.querySelectorAll('#row-other .card').length })`);
  check('a card whose name is markup is shown as text and never runs', idx >= 0 && injected.pwned === 'undefined' && injected.strange === 0 && injected.fallback, JSON.stringify(injected));
  check('a card the list does not know still plays, in the other permanents row', injected.other === 1);

  // ---- the card list cannot be loaded ----
  await browser.send('Network.setBlockedURLs', { urls: ['*cards.json'] });
  await open();
  check('with the card list unreachable the table says why and offers to try again', !(await $hidden('blocked')) && !(await $hidden('retry')) && /card list could not be loaded/.test(await $text('blocked-message')) && (await $hidden('blocked-link')) && (await $hidden('game')));
  await browser.send('Network.setBlockedURLs', { urls: [] });
  await press('retry');
  await waitFor(async () => !(await $hidden('game')) || null, 10000, 50);
  check('and Try again deals the game once it can', !(await $hidden('game')) && (await count('#hand .card')) === 7 && (await $hidden('blocked')));

  // ---- storage blocked ----
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });` });
  await browser.goto(PAGE);
  await waitFor(async () => !(await $hidden('blocked')) || null, 10000, 50);
  check('with storage blocked the page does not crash: it says there is no deck', !(await $hidden('blocked')) && /no saved deck/.test(await $text('blocked-message')));

  // ---- the whole session ----
  const errors = browser.logs.filter((l) => /^exception:|^console\.error|^error:/.test(l) && !/Failed to load resource|ERR_BLOCKED|net::/.test(l));
  check('no script errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  const foreign = browser.events.filter((e) => e.method === 'Network.requestWillBeSent' && !e.params.request.url.startsWith(ORIGIN) && !e.params.request.url.startsWith('data:') && !e.params.request.url.startsWith('https://cards.scryfall.io/'));
  check('nothing was requested from any site but this one and the picture server', foreign.length === 0, foreign.slice(0, 2).map((e) => e.params.request.url).join(' | '));

  if (realPictures) {
    // A few looks at desktop width with the REAL pictures: the page with a hand and a battlefield, dark and light.
    await browser.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: '1' }).catch(() => {});
    await browser.send('Fetch.disable').catch(() => {});
    const scheme = (value) => browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
    await scheme('dark');
    await open();
    await drawUntil((n) => n === 'Sol Ring' || n === 'Llanowar Elves');
    for (let n = 0; n < 3; n++) { const i = (await handNames()).findIndex((x) => LANDS.includes(x)); if (i >= 0) { await clickCard('#hand .card', i); await clickAction('To battlefield'); } }
    const e = (await handNames()).findIndex((x) => !LANDS.includes(x));
    if (e >= 0) { await clickCard('#hand .card', e); await clickAction('To battlefield'); }
    await clickCard('#row-lands .card', 0); await clickAction('Tap');
    await clickCard('#row-other .card', 0);
    await sleep(2500);
    await browser.screenshot('scratch-solo-dark.png');
    await scheme('light'); await sleep(400);
    await browser.screenshot('scratch-solo-light.png');
    await press('pile-library'); await ev(`document.getElementById('viewer').scrollIntoView()`); await sleep(400);
    await browser.screenshot('scratch-solo-piles.png');
    console.log('saved scratch-solo-dark.png, -light.png and -piles.png (delete them afterward)');
  }
} finally {
  await closeAllBrowsers();
  if (server) await server.close();
}

if (failures.length) { console.log(`\n${failures.length} of ${checks} solo table checks FAILED.`); process.exit(1); }
console.log(`All ${checks} solo table checks passed.`);
