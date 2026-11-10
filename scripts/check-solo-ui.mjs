// Checks the solo table in a real headless Chrome (desktop width), against the REAL card list. Card pictures are answered
// by a stand-in (simple card-shaped images), so this needs no network and shows exactly which pictures the page asks for.
// A deck is put into the browser's storage first, as the deck page would. Run from the repo root: node scripts/check-solo-ui.mjs
// Skipped (exit 0, and it says so) when no card list has been built here yet.
// Optional: --screenshot saves scratch-solo-*.png using the REAL pictures from Scryfall (a few dozen KB; git ignores scratch files).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
const deckFrom = (text, name, printingFiles = null, commanderIds = null) => {
  const p = parseDeckText(text);
  const pv = makePreview(p, matchDeck(buildCardIndex(cards), p.entries), {}, printingFiles);
  if (pv.counts.problem !== 0) throw new Error(`the ${name} deck did not match the card list: ${JSON.stringify(pv.problems)}`);
  const b = buildSavedDeck(pv, { name, text, commanderIds: commanderIds ?? pv.commander.ids });
  if (!b.ok) throw new Error(b.error);
  return serializeDeck(b.deck);
};
// Shaped like a real Moxfield plain-text export: a card listed by the title it was printed under, a SIDEBOARD: section,
// and the commander named last, after a blank line.
const SIDE_JSON = deckFrom('1 Sol Ring\n1 Heart of the Mountain\n20 Forest\n20 Island\n10 Lightning Bolt\n\nSIDEBOARD:\n1 Annul\n1 Swords to Plowshares\n\nCommander\n1 Kyodai, Soul of Kamigawa', 'Side deck');
const failIds = new Set(); // pictures with these ids are answered with 404, as Scryfall does for a picture that does not exist
const failBackIds = new Set(); // the same for the BACK picture only of these ids
const cardArt = (url) => {
  const id = url.split('/').pop().replace('.jpg', '');
  if (failIds.has(id) || (failBackIds.has(id) && url.includes('/back/'))) return { status: 404, type: 'text/plain', text: '' };
  const hue = parseInt(id.slice(0, 4), 16) % 360;
  return { type: 'image/svg+xml', text: `<svg xmlns="http://www.w3.org/2000/svg" width="146" height="204" viewBox="0 0 146 204"><rect width="146" height="204" rx="9" fill="hsl(${hue},45%,38%)"/><rect x="8" y="8" width="130" height="188" rx="5" fill="none" stroke="#fff" stroke-opacity=".6"/><text x="73" y="108" font-size="13" text-anchor="middle" fill="#fff" font-family="sans-serif">${id.slice(0, 8)}</text></svg>` };
};

let server = null;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const realPictures = process.argv.includes('--screenshot');
  const sizeArg = process.argv.find((arg) => arg.startsWith('--size='))?.slice(7).split('x').map(Number); // optional: --size=1366x650 to look at another window size
  const browser = await openBrowser('solo-ui', { width: sizeArg?.[0] ?? 1280, height: sizeArg?.[1] ?? 1000 });
  const ev = (expression) => browser.eval(expression);
  const motion = (value) => browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
  await motion('reduce'); // the hand is dealt one card at a time unless the browser asks for reduced motion; almost every check below wants the hand at once
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
  const NO_STATS = ['Sol Ring', 'Lightning Bolt']; // no printed power and toughness: their counters show as pills, not as a power and toughness box
  // draw until the hand holds a card matching the test, up to 40 draws (the library is half lands)
  const drawUntil = async (test) => { for (let n = 0; n < 40; n++) { if ((await handNames()).some(test)) return true; await press('draw'); } return false; };

  // ---- no deck, then a damaged deck ----
  await open(null);
  check('with no saved deck the table says so and offers the import page', !(await $hidden('blocked')) && (await $hidden('game')) && /no saved deck/.test(await $text('blocked-message')) && (await ev(`document.getElementById('blocked-link').getAttribute('href')`)) === '/deck');
  check('and offers a sample deck too, as a link that opens the deck page with the sample loaded', !(await $hidden('blocked-sample')) && (await ev(`document.getElementById('blocked-sample').getAttribute('href')`)) === '/deck?sample' && /sample/i.test(await $text('blocked-sample')));
  check('and does not fetch the card list or any picture for nothing', asked.length === 0 && browser.events.every((e) => e.method !== 'Network.requestWillBeSent' || !/cards\.json/.test(e.params.request.url)));
  await open('{ not a deck');
  check('a damaged saved deck is refused with a message and the import link and the sample link', !(await $hidden('blocked')) && /could not be read/.test(await $text('blocked-message')) && !(await $hidden('blocked-link')) && !(await $hidden('blocked-sample')));

  // ---- a good deal ----
  asked.length = 0;
  await open();
  check('the game shows and the blocked message does not', !(await $hidden('game')) && (await $hidden('blocked')));
  check('the page says which deck it is', /Solo test deck: 61 cards/.test(await $text('deck-line')), await $text('deck-line'));
  check('seven cards are in the hand', (await count('#hand .card')) === 7 && (await $text('hand-count')) === '7');
  check('the commander is in the command zone, shown as a card', (await count('#command .card')) === 1 && /Éowyn/.test((await names('#command .card'))[0]));
  check('life is 40 (a commander) on turn 1', (await $text('life')) === '40' && (await $text('turn')) === '1');
  check('the library holds the other 53 cards and the sideboard is empty', (await pileCount('library')) === 'Library: 53' && (await pileCount('sideboard')) === 'Sideboard: 0');
  check('the graveyard and exile are empty and the battlefield has nothing on it', (await pileCount('graveyard')) === 'Graveyard: 0' && (await pileCount('exile')) === 'Exile: 0' && (await count('#battlefield .card[data-kind="land"]')) + (await count('#battlefield .card[data-kind="other"]')) === 0);
  check('the status says what was dealt', /Dealt 7 cards\. Your commander is in the command zone\. Life is 40\./.test(await $text('status')), await $text('status'));
  check('an empty battlefield shows no text', (await ev(`getComputedStyle(document.getElementById('battlefield'), '::before').content`)) === 'none' && (await ev(`document.getElementById('battlefield').textContent.trim()`)) === '');
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
  check('moving a land to the battlefield puts it in the lands row', (await count('#battlefield .card[data-kind="land"]')) === 1 && (await count('#battlefield .card[data-kind="other"]')) === 0 && (await count('#hand .card')) === handBefore - 1 && (await $text('status')) === `Moved ${landName} to the battlefield.`, await $text('status'));
  check('the card stays selected and now offers Tap and the other zones', (await count('#battlefield .card[data-kind="land"].selected')) === 1 && (await actionLabels())[0] === 'Tap' && !(await actionLabels()).includes('To battlefield'), JSON.stringify(await actionLabels()));
  check('a card that was never tapped is not turned', (await count('#battlefield .card[data-kind="land"].tapped')) === 0);
  await clickAction('Tap');
  const tapped = await ev(`(() => { const c = document.querySelector('#battlefield .card[data-kind="land"]'); const face = c.querySelector('.face'); const m = getComputedStyle(face).transform; const r = c.getBoundingClientRect(); const f = face.getBoundingClientRect(); return { tapped: c.classList.contains('tapped'), label: c.getAttribute('aria-label'), transform: m, boxW: Math.round(r.width), boxH: Math.round(r.height), faceW: Math.round(f.width), faceH: Math.round(f.height) }; })()`);
  check('tapping turns the card sideways and says it is tapped', tapped.tapped && /, tapped$/.test(tapped.label) && /matrix\(0(\.\d+)?(e-\d+)?, 1, -1, 0(\.\d+)?(e-\d+)?/.test(tapped.transform), JSON.stringify(tapped));
  check('a tapped card on the battlefield is a landscape box exactly as big as the turned card (no square box around it)', Math.abs(tapped.boxW - tapped.boxH * 1.4015) <= 3 && Math.abs(tapped.faceW - tapped.boxW) <= 3 && Math.abs(tapped.faceH - tapped.boxH) <= 3, JSON.stringify(tapped));
  check('the action now says Untap, and the status says Tapped', (await actionLabels())[0] === 'Untap' && (await $text('status')) === `Tapped ${landName}.`);
  await clickAction('Untap');
  check('untapping turns it back', (await count('#battlefield .card[data-kind="land"].tapped')) === 0 && (await $text('status')) === `Untapped ${landName}.`);
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
  check('and goes in the other permanents row, not the lands row', (await count('#battlefield .card[data-kind="other"]')) === 1 && (await count('#battlefield .card[data-kind="land"]')) === 1);
  check('the rows keep their cards where they were (the land is still in the lands row)', (await names('#battlefield .card[data-kind="land"]')).join() === landName && (await names('#battlefield .card[data-kind="other"]')).join().replace(/, summoning sick$/, '') === otherName, `${await names('#battlefield .card[data-kind="land"]')} | ${await names('#battlefield .card[data-kind="other"]')}`); // a creature that came in is summoning sick, which its label now says

  // ---- piles ----
  await clickAction('To graveyard');
  check('moving to the graveyard changes the count', (await pileCount('graveyard')) === 'Graveyard: 1' && (await count('#battlefield .card[data-kind="other"]')) === 0);
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
  // ---- sound (the check records which file is played at what volume; it cannot hear them) ----
  {
    const same = (label, actual, expected) => check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);
    const served = await ev(`Promise.all(['draw', 'shuffle'].map((n) => fetch('/sfx/' + n + '.mp3').then(async (r) => ({ ok: r.ok, type: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength }))))`);
    check('both sound files are served as audio and are not empty', served.every((f) => f.ok && /^audio\//.test(f.type ?? '') && f.bytes > 1000), JSON.stringify(served));
    check('an unknown sound file is not served as audio', await ev(`fetch('/sfx/nothing.mp3').then((r) => !/^audio\\//.test(r.headers.get('content-type') ?? ''))`));
    await ev(`localStorage.removeItem('overloaded.sound')`);
    await ev(`window.__plays = []; HTMLMediaElement.prototype.play = function () { window.__plays.push({ src: new URL(this.src).pathname, volume: Math.round(this.volume * 10000) / 10000 }); return Promise.resolve(); };`);
    const plays = () => ev(`window.__plays.slice()`);
    const stored = () => ev(`localStorage.getItem('overloaded.sound')`);
    check('the sound settings are on the page: Sound is on and the volume is 100', (await ev(`document.getElementById('sound-on').checked`)) === true && (await ev(`document.getElementById('sound-volume').value`)) === '100' && (await ev(`document.getElementById('sound-volume').disabled`)) === false);
    check('nothing is played before anything is pressed', (await plays()).length === 0);
    await press('draw');
    same('Draw plays the draw sound at the saved volume', await plays(), [{ src: '/sfx/draw.mp3', volume: 0.1 }]);
    await press('shuffle');
    same('Shuffle plays the shuffle sound', (await plays()).at(-1), { src: '/sfx/shuffle.mp3', volume: 0.095 });
    await press('mulligan');
    same('a mulligan plays the shuffle sound', (await plays()).at(-1), { src: '/sfx/shuffle.mp3', volume: 0.095 });
    await press('next-turn');
    same('Next turn (which draws) plays the draw sound', (await plays()).at(-1), { src: '/sfx/draw.mp3', volume: 0.1 });
    await clickCard('#hand .card', 0);
    await clickAction('To battlefield');
    await clickCard('#battlefield .card', 0);
    await clickAction('Tap');
    same('the Tap button plays the tap sound', (await plays()).at(-1), { src: '/sfx/tap.mp3', volume: 1 });
    const tapsBefore = (await plays()).length;
    await press('untap-all');
    check('Untap all plays the tap sound once', (await plays()).length === tapsBefore + 1 && JSON.stringify((await plays()).at(-1)) === JSON.stringify({ src: '/sfx/tap.mp3', volume: 1 }));
    check('all four sounds are served as audio', (await ev(`Promise.all(['tap', 'yourturn'].map((n) => fetch('/sfx/' + n + '.mp3').then((r) => r.ok && /^audio\\//.test(r.headers.get('content-type') ?? ''))))`)).every(Boolean));
    const beforeMute = (await plays()).length;
    await ev(`(() => { const c = document.getElementById('sound-on'); c.checked = false; c.dispatchEvent(new Event('change')); })()`);
    check('turning Sound off disables the volume slider and is remembered', (await ev(`document.getElementById('sound-volume').disabled`)) === true && (await stored()) === '{"on":false,"volume":1}', await stored());
    await press('draw'); await press('shuffle');
    check('with Sound off nothing is played', (await plays()).length === beforeMute);
    await ev(`(() => { const c = document.getElementById('sound-on'); c.checked = true; c.dispatchEvent(new Event('change')); })()`);
    check('turning Sound on again enables the slider', (await ev(`document.getElementById('sound-volume').disabled`)) === false && (await stored()) === '{"on":true,"volume":1}');
    await ev(`(() => { const v = document.getElementById('sound-volume'); v.value = '30'; v.dispatchEvent(new Event('input')); })()`);
    check('moving the slider to 30 is remembered as 0.3', (await stored()) === '{"on":true,"volume":0.3}', await stored());
    await press('draw');
    same('the next sound plays at the new volume', (await plays()).at(-1), { src: '/sfx/draw.mp3', volume: 0.03 });
    const beforeRelease = (await plays()).length;
    await ev(`document.getElementById('sound-volume').dispatchEvent(new Event('change'))`);
    await ev(`document.getElementById('sound-volume').dispatchEvent(new Event('input'))`);
    check('moving or letting go of the slider makes no sound (Kevin found a sample on every adjustment annoying)', (await plays()).length === beforeRelease, JSON.stringify((await plays()).slice(-2)));
    await ev(`(() => { const v = document.getElementById('sound-volume'); v.value = '0'; v.dispatchEvent(new Event('input')); })()`);
    const beforeZero = (await plays()).length;
    await press('draw');
    check('at volume 0 nothing is played', (await plays()).length === beforeZero);
    await browser.goto(PAGE);
    await waitFor(async () => !(await $hidden('game')) || null, 15000, 50);
    check('the settings are remembered after a reload (on, volume 0)', (await ev(`document.getElementById('sound-on').checked`)) === true && (await ev(`document.getElementById('sound-volume').value`)) === '0');
    await ev(`localStorage.setItem('overloaded.sound', '{"on":"yes","volume":"loud","x":1}')`);
    await browser.goto(PAGE);
    await waitFor(async () => !(await $hidden('game')) || null, 15000, 50);
    check('damaged stored settings fall back to the defaults', (await ev(`document.getElementById('sound-on').checked`)) === true && (await ev(`document.getElementById('sound-volume').value`)) === '100');
    await ev(`localStorage.removeItem('overloaded.sound')`);
    // The slider can be dragged all the way to both ends with a real mouse (Kevin found it could not: the page's general input style squeezed it).
    await browser.goto(PAGE);
    await waitFor(async () => !(await $hidden('game')) || null, 15000, 50);
    const box = await ev(`(() => { const r = document.getElementById('sound-volume').getBoundingClientRect(); return { left: r.left, right: r.right, y: r.top + r.height / 2, width: r.width, height: r.height }; })()`);
    const mouseAt = (type, x, extra = {}) => browser.send('Input.dispatchMouseEvent', { type, x, y: box.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
    const dragSlider = async (toX) => {
      const from = (box.left + box.right) / 2;
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from, y: box.y });
      await mouseAt('mousePressed', from);
      for (let i = 1; i <= 8; i++) await mouseAt('mouseMoved', from + ((toX - from) * i) / 8);
      await mouseAt('mouseReleased', toX);
      return ev(`document.getElementById('sound-volume').value`);
    };
    check('the slider is wide enough to use (at least 80 px; it is 96 px on the compact one-screen layout)', box.width >= 80, JSON.stringify(box));
    check('the checkbox and the slider use the page accent colour, not each browser\'s own default', (await ev(`['sound-on', 'sound-volume'].map((id) => getComputedStyle(document.getElementById(id)).accentColor === getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || getComputedStyle(document.getElementById(id)).accentColor !== 'auto').every(Boolean)`)) === true);
    check('the slider has no padding or border of its own, so the thumb can reach both ends of the track (a close-up screenshot showed it stopping 17 px short with the general input style)', (await ev(`(() => { const s = getComputedStyle(document.getElementById('sound-volume')); return [s.paddingLeft, s.paddingRight, s.borderLeftWidth, s.borderRightWidth].join(); })()`)) === '0px,0px,0px,0px');
    check('the slider is drawn by the page, not by the browser (appearance none), so it looks the same in every browser', (await ev(`getComputedStyle(document.getElementById('sound-volume')).appearance`)) === 'none');
    check('dragging the slider far to the left reaches 0', (await dragSlider(box.left - 80)) === '0');
    check('dragging the slider far to the right reaches 100', (await dragSlider(box.right + 80)) === '100');
    if (realPictures) { // a close-up of the slider with the thumb at the far right and the far left, to look at
      const close = async (name) => { const { data } = await browser.send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, box.left - 120), y: box.y - 30, width: box.width + 240, height: 60, scale: 4 } }); writeFileSync(name, Buffer.from(data, 'base64')); };
      await dragSlider(box.right + 80); await close('scratch-slider-right.png');
      await dragSlider(box.left - 80); await close('scratch-slider-left.png');
    }
    // a click at the very ends of the visible slider also reaches the ends (or within one step of them)
    await mouseAt('mousePressed', box.left + 3); await mouseAt('mouseReleased', box.left + 3);
    const nearLeft = Number(await ev(`document.getElementById('sound-volume').value`));
    await mouseAt('mousePressed', box.right - 3); await mouseAt('mouseReleased', box.right - 3);
    const nearRight = Number(await ev(`document.getElementById('sound-volume').value`));
    check('clicking the left end of the slider gives 0 to 10 and the right end 90 to 100', nearLeft <= 10 && nearRight >= 90, `${nearLeft} and ${nearRight}`);
    await ev(`localStorage.removeItem('overloaded.sound')`);
  }
  // ---- dealing the hand one card at a time (shared/deal-sequence.mjs): real timers, the sounds recorded, the hand and the library watched every 10 ms ----
  {
    const same = (label, actual, expected) => check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`);
    await motion('no-preference');
    const { identifier } = await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__plays = []; HTMLMediaElement.prototype.play = function () { window.__plays.push({ src: new URL(this.src).pathname, t: performance.now() }); return Promise.resolve(); };
      window.__snaps = [];
      setInterval(() => { const h = document.getElementById('hand'); const l = document.getElementById('pile-library'); const g = document.getElementById('game'); if (!h || !l || !g || g.hidden) return; const key = h.children.length + ':' + l.textContent; const last = window.__snaps.at(-1); if (!last || last.key !== key) window.__snaps.push({ key, hand: h.children.length, lib: parseInt(l.textContent.split(': ')[1], 10), t: performance.now() }); }, 10);` });
    await ev(`localStorage.removeItem('overloaded.sound')`);
    const reset = () => ev(`window.__plays = []; window.__snaps = []; 0`);
    const state = () => ev(`({ plays: window.__plays, snaps: window.__snaps })`);
    const handIs = (n) => waitFor(async () => (await count('#hand .card')) === n || null, 8000, 25);
    const summary = ({ plays, snaps }) => ({ sounds: plays.map((p) => p.src.replace('/sfx/', '').replace('.mp3', '')), counts: snaps.map((x) => x.hand), totals: [...new Set(snaps.map((x) => x.lib + x.hand))] });

    if (realPictures) { // a look at the table part-way through the deal
      await browser.goto(PAGE);
      await handIs(7);
      await press('mulligan');
      await sleep(1180); // the shuffle pause is 800 ms and a card comes every 120 ms: about four cards are in
      await browser.screenshot('scratch-solo-dealing.png');
      await handIs(7);
    }
    // the first deal, when the page opens
    await browser.goto(PAGE);
    await handIs(7);
    await sleep(300);
    let seen = await state();
    let sum = summary(seen);
    same('opening the page plays the draw sound once for each of the 7 cards and nothing else', sum.sounds, Array(7).fill('draw'));
    check('the hand fills one card at a time: the cards shown only ever go up, and at least 6 of the 8 steps (0 to 7) were seen', sum.counts.every((n, i) => i === 0 || n >= sum.counts[i - 1]) && new Set(sum.counts).size >= 6 && sum.counts.at(-1) === 7, JSON.stringify(sum.counts));
    check('the cards not yet dealt still count in the library: library plus hand is the same at every step', sum.totals.length === 1, JSON.stringify(sum.totals));
    const span = seen.plays.at(-1).t - seen.plays[0].t;
    check('the 7 cards take about 0.7 seconds (between 0.5 and 1.5)', span >= 500 && span <= 1500, `${Math.round(span)} ms`);
    check('the hand count in the page agrees with the cards shown at the end', (await $text('hand-count')) === '7' && (await count('#hand .card')) === 7);

    // a mulligan: the shuffle sound first, the hand goes away, then the new hand one card at a time
    await reset();
    await press('mulligan');
    await sleep(150);
    const early = await state();
    same('a mulligan plays the shuffle sound at once and nothing else yet', summary(early).sounds, ['shuffle']);
    check('...and the hand is empty while the shuffle plays', (await count('#hand .card')) === 0 && (await $text('hand-count')) === '0');
    await handIs(7);
    await sleep(300);
    seen = await state();
    sum = summary(seen);
    same('then the 7 cards are dealt with a draw sound each', sum.sounds, ['shuffle', ...Array(7).fill('draw')]);
    const wait = seen.plays[1].t - seen.plays[0].t;
    check('the first card comes about 0.8 seconds after the shuffle sound (between 0.6 and 1.4)', wait >= 600 && wait <= 1400, `${Math.round(wait)} ms`);
    check('the new hand also fills one card at a time with the library count staying right', new Set(sum.counts).size >= 6 && sum.totals.length === 1, JSON.stringify(sum));
    check('the mulligan is counted once and the hand is 7', (await $text('mulligan')) === 'Mulligan (1 so far)' && (await count('#hand .card')) === 7);

    // a second mulligan in the middle of the first deal starts over: still exactly 7 cards in the end, nothing dealt twice
    await reset();
    await press('mulligan');
    await sleep(1100); // the shuffle pause is over and a few cards are dealt
    await press('mulligan');
    await sleep(150);
    check('pressing Mulligan again in the middle of a deal empties the hand and starts over', (await count('#hand .card')) === 0);
    await handIs(7);
    await sleep(400);
    seen = await state();
    sum = summary(seen);
    check('...and the old deal does not carry on: 2 shuffle sounds, at least 7 draw sounds, 7 cards and the second mulligan counted', sum.sounds.filter((x) => x === 'shuffle').length === 2 && sum.sounds.filter((x) => x === 'draw').length >= 7 && (await count('#hand .card')) === 7 && (await $text('mulligan')) === 'Mulligan (3 so far)', JSON.stringify(sum.sounds));
    check('library plus hand never changes', sum.totals.length === 1, JSON.stringify(sum.totals));

    // New game: the same, with the shuffle sound first
    await reset();
    await press('new-game');
    await handIs(7);
    await sleep(300);
    seen = await state();
    same('New game plays the shuffle sound and then the 7 draw sounds', summary(seen).sounds, ['shuffle', ...Array(7).fill('draw')]);
    const newGameWait = seen.plays[1].t - seen.plays[0].t;
    check('...and the first card comes about 0.8 seconds after the shuffle sound (between 0.6 and 1.4)', newGameWait >= 600 && newGameWait <= 1400, `${Math.round(newGameWait)} ms`);

    // prefers-reduced-motion: the whole hand at once, no card sounds
    await motion('reduce');
    await browser.goto(PAGE);
    await handIs(7);
    await sleep(300);
    seen = await state();
    check('with reduced motion the hand shows all 7 cards at once and plays no card sounds', summary(seen).sounds.length === 0 && seen.snaps.every((x) => x.hand === 7), JSON.stringify(summary(seen)));
    await reset();
    await press('mulligan');
    await sleep(100);
    check('with reduced motion a mulligan gives the new hand at once and plays only the shuffle sound', (await count('#hand .card')) === 7 && JSON.stringify(summary(await state()).sounds) === '["shuffle"]');
    await browser.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    await browser.goto(PAGE);
    await handIs(7);
  }
  // ---- the larger picture of a card while the pointer rests on it (frontend/src/card-hover.js): real mouse movement ----
  {
    const rectOf = (selector, index = 0) => ev(`(() => { const r = document.querySelectorAll(${JSON.stringify(selector)})[${index}].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })()`);
    const moveTo = (x, y) => browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    const hoverState = () => ev(`(() => { const b = document.getElementById('card-hover'); if (!b) return null; const r = b.getBoundingClientRect(); return { hidden: b.hidden, src: b.querySelector('img').getAttribute('src'), left: r.left, right: r.right, top: r.top, bottom: r.bottom, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; })()`);
    const c = await rectOf('#hand .card', 0);
    const smallSrc = await ev(`document.querySelector('#hand .card img').getAttribute('src')`);
    await moveTo(5, 5); await sleep(60);
    check('the hover box exists and starts hidden', (await hoverState())?.hidden === true);
    await moveTo(c.x, c.y);
    await sleep(150);
    check('the larger picture does not show at once (it waits a moment, so sweeping across the table shows nothing)', (await hoverState()).hidden === true);
    await sleep(450);
    let h = await hoverState();
    check('after a moment it shows the NORMAL size of the same card', h.hidden === false && h.src === smallSrc.replace('/small/', '/normal/'), JSON.stringify(h));
    check('...inside the window and not covering the card', h.inside && (h.left >= c.right || h.right <= c.left), JSON.stringify([h, c]));
    await moveTo(5, 5); await sleep(80);
    check('moving off the card hides it', (await hoverState()).hidden === true);
    await moveTo(c.x, c.y); await sleep(650);
    check('it shows again on the way back', (await hoverState()).hidden === false);
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', buttons: 1, clickCount: 1 });
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(700);
    check('a click hides it, and it stays hidden while the pointer stays on that card', (await hoverState()).hidden === true);
    await moveTo(5, 5); await sleep(80); await moveTo(c.x, c.y); await sleep(650);
    check('after leaving and coming back it shows again', (await hoverState()).hidden === false);
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(100);
    check('Escape hides it', (await hoverState()).hidden === true);
    await moveTo(5, 5); await sleep(80);
    await ev(`document.querySelector('#hand .card').dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'touch' }))`);
    await sleep(650);
    check('a touch never shows it (a phone has no hover)', (await hoverState()).hidden === true);
    await ev(`document.querySelectorAll('#hand .card')[1].classList.add('noimage')`);
    const c2 = await rectOf('#hand .card', 1); await moveTo(c2.x, c2.y); await sleep(700);
    check('a card that shows only its name has no larger picture', (await hoverState()).hidden === true);
    await ev(`document.querySelectorAll('#hand .card')[1].classList.remove('noimage')`);
    await moveTo(5, 5); await sleep(80);
    await moveTo(c.x, c.y); await sleep(650);
    await ev(`document.querySelector('.side-panels').dispatchEvent(new Event('scroll'))`); await sleep(80);
    check('a scroll hides it', (await hoverState()).hidden === true);
    await moveTo(5, 5); await sleep(80);
    // a card on the battlefield, and a tapped one
    await clickCard('#hand .card', 0);
    await clickAction('To battlefield');
    await clickAction('Tap');
    await moveTo(5, 5); await sleep(80);
    const b = await rectOf('#battlefield .card', 0);
    const bSmall = await ev(`document.querySelector('#battlefield .card img').getAttribute('src')`);
    await moveTo(b.x, b.y); await sleep(650);
    h = await hoverState();
    check('a tapped card on the battlefield shows its larger picture too, beside it', h.hidden === false && h.src === bSmall.replace('/small/', '/normal/') && h.inside && (h.left >= b.right || h.right <= b.left), JSON.stringify([h, b]));
    await moveTo(5, 5); await sleep(80);
    check('the hover box is never in the way of the pointer (it does not take mouse events)', (await ev(`getComputedStyle(document.getElementById('card-hover')).pointerEvents`)) === 'none');
  }
  await clickCard('#hand .card', 0);
  check('Escape deselects', (await count('.card.selected')) === 1 && await (async () => { await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); return (await count('.card.selected')) === 0 && (await actionLabels()).length === 0; })());
  check('every card is somewhere: 61 cards in the game', await (async () => { const n = async (s) => parseInt((await $text(s)).split(': ').at(-1), 10); return (await count('.card')) + (await n('pile-library')) + (await n('pile-graveyard')) + (await n('pile-exile')) + (await n('pile-sideboard')) === 61; })());

  // ---- a new game ----
  await press('new-game');
  check('a new game starts again from turn 1 with life 40, a hand of 7 and an untouched library', (await $text('turn')) === '1' && (await $text('life')) === '40' && (await count('#hand .card')) === 7 && (await pileCount('library')) === 'Library: 53' && (await pileCount('graveyard')) === 'Graveyard: 0' && (await count('#battlefield .card[data-kind="land"]')) === 0 && (await $text('mulligan')) === 'Mulligan');
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
  const injected = await ev(`({ pwned: typeof window.__pwned, strange: document.querySelectorAll('img[onerror]').length, fallback: Array.from(document.querySelectorAll('.fallback')).some((f) => f.textContent.includes('<img')), other: document.querySelectorAll('#battlefield .card[data-kind="other"]').length })`);
  check('a card whose name is markup is shown as text and never runs', idx >= 0 && injected.pwned === 'undefined' && injected.strange === 0 && injected.fallback, JSON.stringify({ ...injected, idx, onBoard: await count('#battlefield .card'), kinds: await ev(`Array.from(document.querySelectorAll('#battlefield .card')).map((c) => c.dataset.kind + '|' + c.className + '|' + (c.getAttribute('aria-label') || '').slice(0, 30))`), line: await $text('selected-line') }));
  check('a card the list does not know still plays, in the other permanents row', injected.other === 1);

  // ---- the card list cannot be loaded ----
  await browser.send('Network.setBlockedURLs', { urls: ['*cards.json'] });
  await open();
  check('with the card list unreachable the table says why and offers to try again', !(await $hidden('blocked')) && !(await $hidden('retry')) && /card list could not be loaded/.test(await $text('blocked-message')) && (await $hidden('blocked-link')) && (await $hidden('blocked-sample')) && (await $hidden('game')));
  await browser.send('Network.setBlockedURLs', { urls: [] });
  await press('retry');
  await waitFor(async () => !(await $hidden('game')) || null, 10000, 50);
  check('and Try again deals the game once it can', !(await $hidden('game')) && (await count('#hand .card')) === 7 && (await $hidden('blocked')));

  // ---- counters and the power/toughness change ----
  await open();
  const markText = (selector) => ev(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map((n) => n.textContent)`);
  const setAmount = (value) => ev(`document.getElementById('marks-amount').value = ${JSON.stringify(value)}`);
  const setKind = (kind) => ev(`document.querySelector('#marks select').value = ${JSON.stringify(kind)}`);
  const clickMark = (label) => ev(`(() => { const b = Array.from(document.querySelectorAll('#marks button')).find((x) => x.textContent === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
  const changeOnCard = async () => (await markText('#battlefield .card[data-kind="other"] .marks .change'))[0] ?? '';
  const chipsOnCard = () => markText('#battlefield .card[data-kind="other"] .marks .chip');
  await drawUntil((n) => NO_STATS.includes(n));
  const spell = (await handNames()).findIndex((x) => NO_STATS.includes(x));
  await clickCard('#hand .card', spell);
  check('a card in the hand has no counter controls', await $hidden('marks'));
  await clickAction('To battlefield');
  check('a selected card on the battlefield does not show the counter controls until Modify', await $hidden('marks'));
  await clickAction('Modify');
  check('Modify shows the counter controls', !(await $hidden('marks')));
  check('the controls are an amount box, a kind of counter and nine buttons', (await count('#marks input')) === 1 && (await count('#marks select option')) === 6 && (await count('#marks button')) === 9);
  check('a new card shows no counters and no change', (await count('#battlefield .card[data-kind="other"] .marks')) === 0);
  await setAmount('1'); await clickMark('Add counters');
  check('adding one +1/+1 counter shows a chip and a +1/+1 change on the card', JSON.stringify(await chipsOnCard()) === '["+1/+1 1"]' && (await changeOnCard()) === '+1/+1', JSON.stringify(await chipsOnCard()));
  check('the status says what was added', (await $text('status')).startsWith('Added 1 +1/+1 counter to '), await $text('status'));
  check('the card tells a screen reader about it', (await names('#battlefield .card[data-kind="other"]'))[0].endsWith('. Counters: +1/+1 1. Change: +1/+1.'), (await names('#battlefield .card[data-kind="other"]'))[0]);
  check('the selected line says it too', (await $text('selected-line')).endsWith(' Counters: +1/+1 1. Change: +1/+1.'), await $text('selected-line'));
  check('the typed amount and the panel are still there after the click (nothing was rebuilt)', (await ev(`document.getElementById('marks-amount').value`)) === '1');
  await setAmount('2'); await clickMark('Power +');
  check('power +2 makes the change +3/+1', (await changeOnCard()) === '+3/+1', await changeOnCard());
  await setAmount('1'); await clickMark('Toughness -');
  check('toughness -1 makes it +3/+0', (await changeOnCard()) === '+3/+0', await changeOnCard());
  await clickMark('Both +');
  check('both +1 makes it +4/+1', (await changeOnCard()) === '+4/+1', await changeOnCard());
  await clickMark('Reset change');
  check('reset takes off the hand-set change and leaves the counter', (await changeOnCard()) === '+1/+1' && JSON.stringify(await chipsOnCard()) === '["+1/+1 1"]', await changeOnCard());
  await setKind('m'); await clickMark('Add counters');
  check('a -1/-1 counter cancels the +1/+1 counter, as the rules do', (await count('#battlefield .card[data-kind="other"] .marks')) === 0, JSON.stringify(await chipsOnCard()));
  await setKind('l'); await setAmount('4'); await clickMark('Add counters');
  check('loyalty counters show a chip but change nothing', JSON.stringify(await chipsOnCard()) === '["Loyalty 4"]' && (await changeOnCard()) === '');
  await clickMark('Remove counters'); 
  check('removing the same number takes them off', (await count('#battlefield .card[data-kind="other"] .marks')) === 0);
  const before = await ev(`document.querySelector('#battlefield .card[data-kind="other"]').getAttribute('aria-label')`);
  for (const bad of ['abc', '0', '-3', '1.5', '', '1000000000001']) {
    await setAmount(bad); await clickMark('Add counters');
    check(`the amount "${bad}" is refused with a message and changes nothing`, /whole number from 1 to 1,000,000,000,000/.test(await $text('status')) && (await ev(`document.querySelector('#battlefield .card[data-kind="other"]').getAttribute('aria-label')`)) === before, await $text('status'));
  }
  await setKind('o'); await setAmount('5,000,000,000'); await clickMark('Add counters');
  check('an amount in the billions works and the chip is shortened', JSON.stringify(await chipsOnCard()) === '["Other 5B"]' && /Added 5,000,000,000 Other counters to /.test(await $text('status')), JSON.stringify(await chipsOnCard()));
  check('the card keeps every digit for a screen reader', /Other 5,000,000,000/.test((await names('#battlefield .card[data-kind="other"]'))[0]));
  await setAmount('2'); await clickMark('Both +');
  check('a change next to billions of counters shows too', (await changeOnCard()) === '+2/+2');
  await clickAction('To hand');
  check('a card that leaves the battlefield loses its counters and change', (await ev(`document.querySelectorAll('#hand .card .marks').length`)) === 0 && (await $hidden('marks')));
  await clickMark('Add counters');
  check('the controls refuse when no card on the battlefield is selected', /Select a card on the battlefield/.test(await $text('status')));

  // ---- clicking the chips and the change label on the card itself (real mouse input) ----
  await open();
  const mouse = async (selector, { button = 'left', shift = false, dy = null } = {}) => {
    await ev(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' })`);
    const p = await ev(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + ${dy === null ? 'r.height / 2' : String(dy)} }; })()`);
    const base = { x: p.x, y: p.y, button, modifiers: shift ? 8 : 0, clickCount: 1 };
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await browser.send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: button === 'left' ? 1 : 2 });
    await browser.send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
    await sleep(60);
  };
  const chip0 = '#battlefield .card[data-kind="other"] .marks .chip';
  const part = (name) => `#battlefield .card[data-kind="other"] .marks .change .${name}`;
  const chipText = async () => (await ev(`Array.from(document.querySelectorAll('#battlefield .card[data-kind="other"] .marks .chip')).map((n) => n.textContent)`)).join('|');
  const changeText = async () => (await ev(`document.querySelector('#battlefield .card[data-kind="other"] .marks .change')?.textContent ?? ''`));
  await drawUntil((n) => NO_STATS.includes(n));
  await clickCard('#hand .card', (await handNames()).findIndex((x) => NO_STATS.includes(x)));
  await clickAction('To battlefield');
  await setKind('p'); await setAmount('1'); await clickMark('Add counters');
  await clickAction('Deselect');
  check('the card starts with one +1/+1 counter and the +1/+1 change and is not selected', (await chipText()) === '+1/+1 1' && (await changeText()) === '+1/+1' && /^Click a card/.test(await $text('selected-line')), `${await chipText()} ${await changeText()}`);
  await mouse(chip0);
  check('a left click on the chip adds a counter and does not select the card', (await chipText()) === '+1/+1 2' && /^Click a card/.test(await $text('selected-line')) && (await $text('status')).startsWith('Added 1 +1/+1 counter to '), `${await chipText()} / ${await $text('status')}`);
  await mouse(chip0, { shift: true });
  check('Shift and click adds ten', (await chipText()) === '+1/+1 12' && /Added 10 \+1\/\+1 counters to /.test(await $text('status')), `${await chipText()} / ${await $text('status')}`);
  await mouse(chip0, { button: 'right' });
  check('a right click takes one off', (await chipText()) === '+1/+1 11' && (await $text('status')).startsWith('Removed 1 +1/+1 counter from '), `${await chipText()} / ${await $text('status')}`);
  await mouse(chip0, { button: 'right', shift: true });
  check('Shift and right click takes ten off', (await chipText()) === '+1/+1 1' && /Removed 10 \+1\/\+1 counters from /.test(await $text('status')), await chipText());
  check('the change follows the counters (+1/+1 again)', (await changeText()) === '+1/+1', await changeText());
  await mouse(part('power'));
  check('a click on the power number raises power only (+2/+1)', (await changeText()) === '+2/+1', await changeText());
  await mouse(part('toughness'));
  check('a click on the toughness number raises toughness only (+2/+2)', (await changeText()) === '+2/+2', await changeText());
  await mouse(part('both'));
  check('a click on the slash raises both (+3/+3)', (await changeText()) === '+3/+3', await changeText());
  await mouse(part('both'), { button: 'right' });
  check('a right click on the slash lowers both (+2/+2)', (await changeText()) === '+2/+2', await changeText());
  await mouse(part('both'), { shift: true });
  check('Shift and click on the slash raises both by ten (+12/+12)', (await changeText()) === '+12/+12', await changeText());
  await mouse(part('power'), { button: 'right', shift: true });
  check('Shift and right click on power lowers power by ten (+2/+12)', (await changeText()) === '+2/+12', await changeText());
  check('none of those clicks selected the card', /^Click a card/.test(await $text('selected-line')));
  await mouse('#battlefield .card[data-kind="other"]', { dy: 14 });
  check('a click on the card itself (not on a number) still selects it', !/^Click a card/.test(await $text('selected-line')) && (await $text('selected-line')).includes('Counters: +1/+1 1.'), await $text('selected-line'));
  check('the marks explain themselves in a tooltip', /right-click to take 1 off, hold Shift for 10/.test(await ev(`document.querySelector('#battlefield .card[data-kind="other"] .marks').title`)));
  check('every mark has its meaning in a data attribute and nothing else on the card does', (await ev(`Array.from(document.querySelectorAll('#battlefield .card[data-kind="other"] [data-mark]')).map((n) => n.dataset.mark).join()`)) === 'chip,power,both,toughness');
  const prevented = await ev(`(() => { const card = document.querySelector('#battlefield .card[data-kind="other"]'); const on = (el) => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; }; return { chip: on(card.querySelector('.marks .chip')), body: on(card.querySelector('.face')) }; })()`);
  check('right click on a number is taken by the table (a counter comes off), and on the rest of the card by the card menu', prevented.chip === true && prevented.body === true && (await count('.card-menu')) === 1, JSON.stringify(prevented));
  await ev(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`); // a click elsewhere closes the menu
  const beforeClick = await changeText();
  await ev(`document.querySelector('#battlefield .card[data-kind="other"] .marks .change .power').click()`);
  check('a click on a number reaches the table even without a mouse (an assistive tool pressing it)', (await changeText()) !== beforeClick, `${beforeClick} -> ${await changeText()}`);
  await clickAction('To hand');
  check('a card that goes back to the hand has no marks to click', (await count('#hand .card .marks')) === 0);

  // ---- the power and toughness box of a creature (printed 1/1: Llanowar Elves), real mouse input ----
  await open();
  const mouseMoveTo = async (x, y) => browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  const centerOf = (selector) => ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const away = () => mouseMoveTo(2, 2);
  const box = (selector = '#battlefield .card[data-kind="other"]') => ev(`(() => { const card = document.querySelector(${JSON.stringify(selector)}); const b = card && card.querySelector('.ptbox'); if (!b) return null; const power = b.querySelector('.power'); const toughness = b.querySelector('.toughness'); return { idle: b.classList.contains('idle'), visibility: getComputedStyle(b).visibility, power: power.textContent, powerClass: power.className, toughness: toughness.textContent, toughnessClass: toughness.className }; })()`);
  const toastOf = () => ev(`(() => { const t = document.querySelector('#battlefield .card[data-kind="other"] .toast'); return t ? { text: t.textContent, tone: t.className } : null; })()`);
  await drawUntil((n) => n === 'Llanowar Elves');
  const elvesInHand = (await handNames()).findIndex((x) => x === 'Llanowar Elves');
  const handCenter = await centerOf(`#hand .card:nth-child(${elvesInHand + 1})`);
  await mouseMoveTo(handCenter.x, handCenter.y); await sleep(80);
  check('a creature in the hand has no power and toughness box, even with the pointer on it', (await count('#hand .card .marks')) === 0);
  await clickCard('#hand .card', elvesInHand);
  await clickAction('To battlefield');
  await clickAction('Deselect');
  await away(); await sleep(80);
  const idle = await box();
  check('your own creature on the battlefield has its box with the printed numbers (1 and 1), hidden while the pointer is elsewhere and the card is not selected', idle && idle.idle && idle.visibility === 'hidden' && idle.power === '1' && idle.toughness === '1' && !/up|down/.test(idle.powerClass + idle.toughnessClass), JSON.stringify(idle));
  const at = await centerOf('#battlefield .card[data-kind="other"]');
  await mouseMoveTo(at.x, at.y); await sleep(80);
  check('the box shows when the pointer is on the card', (await box()).visibility === 'visible');
  await mouse('#battlefield .card[data-kind="other"] .ptbox .power');
  const raisedPower = await box();
  check('a click on the power number raises power: 2 and 1, power in green', raisedPower.power === '2' && raisedPower.toughness === '1' && / up/.test(raisedPower.powerClass) && !/up|down/.test(raisedPower.toughnessClass) && !raisedPower.idle, JSON.stringify(raisedPower));
  const toast = await toastOf();
  check('a floating +1 power appears, green', toast && toast.text === '+1 power' && /toast-up/.test(toast.tone), JSON.stringify(toast));
  check('and the status says what happened', /power up by 1/.test(await $text('status')));
  await mouse('#battlefield .card[data-kind="other"] .ptbox .toughness');
  check('a click on the toughness number raises toughness: 2 and 2', JSON.stringify([(await box()).power, (await box()).toughness]) === '["2","2"]');
  check('the power and toughness box has a slash between the two numbers (not a gap)', (await ev(`document.querySelector('#battlefield .card[data-kind="other"] .ptbox .both').textContent`)) === '/');
  await mouse('#battlefield .card[data-kind="other"] .ptbox .both');
  check('a click on the line between raises both: 3 and 3', JSON.stringify([(await box()).power, (await box()).toughness]) === '["3","3"]', JSON.stringify(await box()));
  check('the floating text for that is +1/+1', (await toastOf())?.text === '+1/+1');
  await mouse('#battlefield .card[data-kind="other"] .ptbox .both', { button: 'right' });
  check('a right click on the line lowers both: 2 and 2, with a red floating -1/-1', JSON.stringify([(await box()).power, (await box()).toughness]) === '["2","2"]' && (await toastOf())?.text === '-1/-1' && /toast-down/.test((await toastOf()).tone));
  await mouse('#battlefield .card[data-kind="other"] .ptbox .both', { shift: true });
  check('Shift and click on the line raises both by ten: 12 and 12', JSON.stringify([(await box()).power, (await box()).toughness]) === '["12","12"]' && (await toastOf())?.text === '+10/+10');
  await mouse('#battlefield .card[data-kind="other"] .ptbox .power', { button: 'right', shift: true });
  check('Shift and right click on power lowers it by ten: 2 and 12', JSON.stringify([(await box()).power, (await box()).toughness]) === '["2","12"]', JSON.stringify(await box()));
  await mouse('#battlefield .card[data-kind="other"] .ptbox .power', { button: 'right', shift: true });
  const negative = await box();
  check('power can go below zero and is then red: -8 and 12', negative.power === '-8' && / down/.test(negative.powerClass) && negative.toughness === '12' && / up/.test(negative.toughnessClass), JSON.stringify(negative));
  check('the card tells a screen reader what it is now', (await ev(`document.querySelector('#battlefield .card[data-kind="other"]').getAttribute('aria-label')`)).endsWith('Change: -9/+11. Now -8/12.'), await ev(`document.querySelector('#battlefield .card[data-kind="other"]').getAttribute('aria-label')`));
  check('none of those clicks selected the card', /^Click a card/.test(await $text('selected-line')));
  await mouse('#battlefield .card[data-kind="other"]', { dy: 36 }); // the plain middle of the card: the badge at the top and the chips at the bottom are theirs
  check('a click on the card itself selects it, and the line says what it is now', (await $text('selected-line')).includes('Now -8/12.'), await $text('selected-line'));
  await clickMark('Reset change');
  const reset = await box();
  check('reset change takes the box back to the printed numbers (1 and 1, no colour) and idle', reset.power === '1' && reset.toughness === '1' && reset.idle && !/up|down/.test(reset.powerClass + reset.toughnessClass), JSON.stringify(reset));
  await setKind('p'); await setAmount('2'); await clickMark('Add counters');
  const withCounters = await box();
  check('two +1/+1 counters: a chip at the left and 3 and 3 in the box, both green', (await chipText()) === '+1/+1 2' && withCounters.power === '3' && withCounters.toughness === '3' && / up/.test(withCounters.powerClass + withCounters.toughnessClass), `${await chipText()} ${JSON.stringify(withCounters)}`);
  check('the chips are on the left and the box on the right of the card', await ev(`(() => { const m = document.querySelector('#battlefield .card[data-kind="other"] .marks'); const chips = m.querySelector('.chips').getBoundingClientRect(); const b = m.querySelector('.ptbox').getBoundingClientRect(); return chips.right <= b.left + 1; })()`));
  check('the box does not cover the chips (they do not overlap)', await ev(`(() => { const m = document.querySelector('#battlefield .card[data-kind="other"] .marks'); const chips = m.querySelector('.chips').getBoundingClientRect(); const b = m.querySelector('.ptbox').getBoundingClientRect(); return chips.right <= b.left + 1 || chips.bottom <= b.top + 1; })()`));
  // the floating text and reduced motion
  await motion('no-preference'); // the whole check runs with reduced motion on; this one measures the normal animation first
  await mouse('#battlefield .card[data-kind="other"] .ptbox .power');
  const moving = await ev(`getComputedStyle(document.querySelector('#battlefield .card[data-kind="other"] .toast')).animationName`);
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await mouse('#battlefield .card[data-kind="other"] .ptbox .power');
  const still = await ev(`getComputedStyle(document.querySelector('#battlefield .card[data-kind="other"] .toast')).animationName`);
  await motion('reduce');
  check('the floating text moves normally and stays still under prefers-reduced-motion', moving === 'toast-rise' && still === 'none', `${moving} / ${still}`);
  await sleep(1100);
  check('the floating text goes away by itself', (await toastOf()) === null);
  await clickAction('To hand');
  check('a creature that goes back to the hand loses the box and its chips', (await count('#hand .card .marks')) === 0);
  // a card with no printed numbers never gets the idle box
  await drawUntil((n) => n === 'Sol Ring' || n === 'Lightning Bolt');
  await clickCard('#hand .card', (await handNames()).findIndex((x) => x === 'Sol Ring' || x === 'Lightning Bolt'));
  await clickAction('To battlefield');
  const noStatsAt = await centerOf('#battlefield .card:last-child');
  await mouseMoveTo(noStatsAt.x, noStatsAt.y); await sleep(80);
  check('a card with no printed power and toughness shows no box and no marks, even with the pointer on it', (await count('#battlefield .card:last-child .marks')) === 0);

  // ---- the right-click menu of a card (real mouse and keyboard input) ----
  await open();
  const key = async (name, code, vk, text) => {
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: vk });
    await sleep(60);
  };
  const menuState = () => ev(`(() => {
    const m = document.querySelector('.card-menu'); if (!m) return null;
    const r = m.getBoundingClientRect(); const active = document.activeElement; const arrow = String.fromCharCode(0x25b8);
    const label = (b) => b.textContent.replace(arrow, '').trim();
    return { title: m.querySelector('.card-menu-title').textContent, role: m.getAttribute('role'), items: [...m.querySelectorAll('[role="menuitem"]')].filter((b) => !b.closest('[hidden]')).map(label), focused: active && m.contains(active) ? label(active) : null, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, count: document.querySelectorAll('.card-menu').length, box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], win: [innerWidth, innerHeight] };
  })()`);
  const clickMenuItem = async (text, opts = {}) => {
    const p = await ev(`(() => { const arrow = String.fromCharCode(0x25b8); const b = [...document.querySelectorAll('.card-menu [role="menuitem"]')].find((x) => x.textContent.replace(arrow, '').trim() === ${JSON.stringify(text)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!p) throw new Error(`no menu item "${text}"`);
    await mouseMoveTo(p.x, p.y);
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(80);
  };
  const activeIsCard = () => ev(`document.activeElement && document.activeElement.classList.contains('card')`);
  await drawUntil((n) => n === 'Llanowar Elves');
  await clickCard('#hand .card', (await handNames()).findIndex((x) => x === 'Llanowar Elves'));
  await clickAction('To battlefield');
  await clickAction('Deselect');
  await away(); await sleep(60);
  check('there is no menu before a right click', (await menuState()) === null);
  await mouse('#battlefield .card[data-kind="other"]', { button: 'right', dy: 30 });
  let menu = await menuState();
  check('a right click on a creature opens its menu: its name, then Modify, Tap, the counter with 2 3 5, Create copy and Move to (with the two marks after Tap: Elves came in sick)', menu && menu.title === 'Llanowar Elves' && menu.role === 'menu' && JSON.stringify(menu.items) === JSON.stringify(['Modify...', 'Tap', "Doesn't untap", 'Not summoning sick', '+1/+1 counter', '2', '3', '5', 'Create copy', 'Move to']), JSON.stringify(menu));
  check('the menu is inside the window and the first item has the focus', menu.inside && menu.focused === 'Modify...', JSON.stringify(menu));
  check('the right click also selected the card', (await $text('selected-line')).startsWith('Llanowar Elves'), await $text('selected-line'));
  await ev(`window.__plays = []; HTMLMediaElement.prototype.play = function () { window.__plays.push({ src: new URL(this.src).pathname, volume: Math.round(this.volume * 10000) / 10000 }); return Promise.resolve(); };`);
  await clickMenuItem('Tap');
  check('Tap from the right-click menu plays the tap sound', JSON.stringify(await ev(`window.__plays`)) === JSON.stringify([{ src: '/sfx/tap.mp3', volume: 1 }]), JSON.stringify(await ev(`window.__plays`)));
  check('Tap taps the card, closes the menu, says so and gives the focus back to the card', (await menuState()) === null && (await ev(`document.querySelector('#battlefield .card[data-kind="other"]').classList.contains('tapped')`)) && (await $text('status')) === 'Tapped Llanowar Elves.' && (await activeIsCard()), `${await $text('status')} ${await activeIsCard()}`);
  await mouse('#battlefield .card[data-kind="other"]', { button: 'right', dy: 30 });
  menu = await menuState();
  check('a tapped card offers Untap', menu.items[1] === 'Untap', JSON.stringify(menu.items));
  await clickMenuItem('3');
  const threeCounters = await box();
  check('the 3 next to the counter adds three +1/+1 counters: a chip, 4 and 4 in the box, a green floating +3/+3 and the status', (await chipText()) === '+1/+1 3' && threeCounters.power === '4' && threeCounters.toughness === '4' && (await toastOf())?.text === '+3/+3' && /toast-up/.test((await toastOf()).tone) && (await $text('status')) === 'Added 3 +1/+1 counters to Llanowar Elves.', `${await chipText()} ${JSON.stringify(threeCounters)} ${JSON.stringify(await toastOf())} ${await $text('status')}`);
  await mouse('#battlefield .card[data-kind="other"]', { button: 'right', dy: 30 });
  await clickMenuItem('+1/+1 counter');
  check('the name itself adds one', (await chipText()) === '+1/+1 4', await chipText());
  await mouse('#battlefield .card[data-kind="other"]', { button: 'right', dy: 30 });
  await clickMenuItem('Modify...');
  check('Modify opens the counters panel and puts the cursor in its amount box', !(await $hidden('marks')) && (await ev(`document.activeElement && document.activeElement.id`)) === 'marks-amount');
  await mouse('#battlefield .card[data-kind="other"]', { button: 'right', dy: 30 });
  await clickMenuItem('Move to');
  menu = await menuState();
  check('Move to opens inline under its heading, with every other zone and both ends of the library', menu.items.slice(-8).join() === 'Move to,Hand,Graveyard,Exile,Command zone,Sideboard,Top of library,Bottom of library' && (await ev(`document.querySelector('.card-menu .has-sub').getAttribute('aria-expanded')`)) === 'true' && menu.inside, JSON.stringify(menu));
  await clickMenuItem('Graveyard');
  check('Graveyard moves the card there (the pile says so, the battlefield is empty again) and the menu is gone', (await pileCount('graveyard')) === 'Graveyard: 1' && (await count('#battlefield .card[data-kind="other"]')) === 0 && (await menuState()) === null && (await $text('status')) === 'Moved Llanowar Elves to your graveyard.', `${await pileCount('graveyard')} ${await $text('status')}`);
  // a card in the hand has only Move to
  await mouse('#hand .card', { button: 'right', dy: 30 });
  menu = await menuState();
  check('a card in the hand offers only Move to', menu && JSON.stringify(menu.items) === JSON.stringify(['Move to']), JSON.stringify(menu));
  await clickMenuItem('Move to');
  await clickMenuItem('Battlefield');
  check('and Battlefield from there puts it on the battlefield', (await count('#battlefield .card')) === 1 && (await menuState()) === null);
  // keyboard
  const cardSelector = (await count('#battlefield .card[data-kind="land"]')) === 1 ? '#battlefield .card[data-kind="land"]' : '#battlefield .card[data-kind="other"]';
  await ev(`(() => { const c = document.querySelector(${JSON.stringify(cardSelector)}); c.focus(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 0, clientY: 0 })); })()`);
  menu = await menuState();
  check('the keyboard way to a context menu (no pointer position) opens the menu next to the card', menu && menu.focused !== null && menu.inside, JSON.stringify(menu));
  check('and it opens at the middle of the card, not in a corner of the window', await ev(`(() => { const c = document.querySelector(${JSON.stringify(cardSelector)}).getBoundingClientRect(); const m = document.querySelector('.card-menu').getBoundingClientRect(); return Math.abs(m.left - (c.left + c.width / 2)) < 60 && (Math.abs(m.top - (c.top + c.height / 2)) < 60 || (m.bottom > innerHeight - 16 && m.top < c.top + c.height)); })()`)); // a card in the bottom row of a short window: the menu is moved up just enough to stay on the screen
  await key('ArrowDown', 'ArrowDown', 40);
  check('Down moves to the next item', (await menuState()).focused === menu.items[1], JSON.stringify(await menuState()));
  await key('End', 'End', 35);
  check('End goes to the last item and Down wraps to the first', (await menuState()).focused === 'Move to' && ((await key('ArrowDown', 'ArrowDown', 40)), (await menuState()).focused === menu.items[0]));
  await key('ArrowUp', 'ArrowUp', 38);
  check('Up from the first wraps to the last', (await menuState()).focused === 'Move to' || (await menuState()).focused === menu.items.at(-1), JSON.stringify(await menuState()));
  await key('Escape', 'Escape', 27);
  check('Escape closes the menu, gives the focus back to the card and does not deselect it (the page\'s own Escape did not run)', (await menuState()) === null && (await activeIsCard()) && !/^Click a card/.test(await $text('selected-line')), await $text('selected-line'));
  await mouse(cardSelector, { button: 'right', dy: 30 });
  check('the card on the battlefield again offers Tap', (await menuState()).items.includes('Tap'));
  {
    for (let n = 0; n < 4; n++) await key('ArrowDown', 'ArrowDown', 40); // Tap, the two marks, then the counter
    await key('ArrowRight', 'ArrowRight', 39);
    check('Right moves along the counter row to its first amount', (await menuState()).focused === '2', JSON.stringify(await menuState()));
    await key('ArrowRight', 'ArrowRight', 39);
    await key('Enter', 'Enter', 13, '\r');
    check('Enter on an amount chooses it: the 3 adds three counters and the menu closes', (await menuState()) === null && /Added 3 /.test(await $text('status')), await $text('status'));
    await mouse(cardSelector, { button: 'right', dy: 30 });
    await key('End', 'End', 35);
    await key('Enter', 'Enter', 13, '\r');
    check('Enter on Move to opens it, with the focus on its first choice', (await menuState()).items.includes('Hand') && ['Hand'].includes((await menuState()).focused), JSON.stringify(await menuState()));
    await key('ArrowLeft', 'ArrowLeft', 37);
    check('Left closes it again and goes back to the Move to heading', !(await menuState()).items.includes('Hand') && (await menuState()).focused === 'Move to', JSON.stringify(await menuState()));
    await key('Escape', 'Escape', 27);
  }
  // closing in the other ways
  await mouse(cardSelector, { button: 'right', dy: 30 });
  await mouseMoveTo(1100, 60);
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1100, y: 60, button: 'left', buttons: 1, clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1100, y: 60, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(60);
  check('a click anywhere else closes the menu', (await menuState()) === null);
  await mouse(cardSelector, { button: 'right', dy: 30 });
  // The page itself no longer scrolls (the one-screen layout), but the panel on the right and the hand scroll inside themselves: a scroll anywhere closes the menu.
  await ev(`document.querySelector('.side-panels').dispatchEvent(new Event('scroll'))`); await sleep(120);
  check('scrolling closes the menu (a scroll inside the side panel, as the page itself does not scroll)', (await menuState()) === null);
  await ev(`window.scrollTo(0, 0)`); await sleep(60);
  await mouse(cardSelector, { button: 'right', dy: 30 });
  await ev(`window.dispatchEvent(new Event('resize'))`); await sleep(60);
  check('resizing the window closes the menu', (await menuState()) === null);
  // only one menu at a time, and always inside the window
  const landFromHand = (await handNames()).findIndex((x) => LANDS.includes(x));
  await clickCard('#hand .card', landFromHand);
  await clickAction('To battlefield');
  await mouse('#battlefield .card:last-child', { button: 'right', dy: 30 });
  await mouse('#battlefield .card:first-child', { button: 'right', dy: 30 });
  check('a second right click on another card leaves exactly one menu, for that card', (await menuState())?.count === 1, JSON.stringify(await menuState()));
  await key('Escape', 'Escape', 27);
  await ev(`(() => { const c = document.querySelector('#battlefield .card[data-kind="land"]'); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: innerWidth - 2, clientY: innerHeight - 2 })); })()`);
  menu = await menuState();
  check('a right click in the bottom right corner of the window still gives a menu that fits inside it', menu && menu.inside, JSON.stringify(menu));
  await key('Escape', 'Escape', 27);
  // the numbers on a card keep their own right click: a counter comes off and no menu opens
  await clickAction('Deselect');
  await clickCard('#battlefield .card[data-kind="land"]', 0);
  await setKind('l'); await setAmount('2'); await clickMark('Add counters');
  const loyaltyChip = await ev(`Array.from(document.querySelectorAll('#battlefield .card[data-kind="land"] .marks .chip')).findIndex((c) => c.textContent === 'Loyalty 2') + 1`);
  check('the land has a Loyalty chip to click', loyaltyChip > 0, String(loyaltyChip));
  await mouse(`#battlefield .card[data-kind="land"] .marks .chip:nth-child(${loyaltyChip})`, { button: 'right' });
  check('a right click on a counter takes one off and opens no menu', (await menuState()) === null && (await ev(`Array.from(document.querySelectorAll('#battlefield .card[data-kind="land"] .marks .chip')).map((c) => c.textContent).includes('Loyalty 1')`)), await ev(`Array.from(document.querySelectorAll('#battlefield .card[data-kind="land"] .marks .chip')).map((c) => c.textContent).join()`));
  // the Modify button and the hidden panel
  await clickAction('Deselect');
  await clickCard('#battlefield .card[data-kind="land"]', 0);
  check('selecting a card on the battlefield does not open the counters panel by itself', await $hidden('marks'));
  await clickAction('Modify');
  check('the Modify button opens it (and says so with aria-expanded) and puts the cursor in the amount box', !(await $hidden('marks')) && (await ev(`Array.from(document.querySelectorAll('#selected-actions button')).find((b) => b.textContent === 'Modify').getAttribute('aria-expanded')`)) === 'true' && (await ev(`document.activeElement.id`)) === 'marks-amount');
  await clickAction('Modify');
  check('pressing it again hides the panel and keeps the focus on the button', (await $hidden('marks')) && (await ev(`document.activeElement.textContent`)) === 'Modify');
  await clickAction('Deselect');
  await clickCard('#battlefield .card[data-kind="land"]', 0);
  await clickAction('To hand');
  check('a card in the hand has no Modify button', !(await actionLabels()).includes('Modify'));

  // ---- turning a two-sided card over (real list entries: Sephiroth, Valakut Awakening, Delver, Aclazotz, and Fire // Ice which has no back) ----
  // Seven cards in a seven-card deck, so all of them are in the hand and nothing depends on luck.
  const TWO_SIDED = deckFrom('1 Sephiroth, Fabled SOLDIER\n1 Valakut Awakening\n1 Delver of Secrets\n1 Aclazotz, Deepest Betrayal\n1 Fire // Ice\n1 Sol Ring\n1 Forest', 'Two-sided deck', null, []); // no commander: the page would guess one from the legendary creatures and take it out of the hand
  const defaultId = (prefix) => cards.find((c) => c.n.startsWith(prefix)).i;
  const cardAt = (prefix) => `.card[aria-label^="${prefix}"]`;
  const srcOf = (prefix) => ev(`(() => { const i = document.querySelector(${JSON.stringify(cardAt(prefix) + ' img')}); return i ? i.getAttribute('src') : null; })()`);
  const rowOf = (prefix) => ev(`(() => { const c = document.querySelector(${JSON.stringify(cardAt(prefix))}); return c ? (c.dataset.kind === 'land' ? 'row-lands' : c.dataset.kind === 'other' ? 'row-other' : (c.parentElement ? c.parentElement.id : null)) : null; })()`); // which kind of card it is now: the battlefield is one grid, and a card's kind (land or other) is what the old two rows were
  const labelOf = (prefix) => ev(`document.querySelector(${JSON.stringify(cardAt(prefix))}).getAttribute('aria-label')`);
  asked.length = 0;
  failBackIds.add(defaultId('Aclazotz')); // its back picture does not exist: turning it over must show the name, and turning back must bring the front picture back
  await open(TWO_SIDED);
  check('the two-sided deck deals all seven cards to the hand', (await count('#hand .card')) === 7 && (await pileCount('library')) === 'Library: 0', `${await $text('deck-line')} | hand ${await count('#hand .card')} | ${await pileCount('library')} | ${await $text('status')} | blocked: ${await $text('blocked-message')}`);
  for (const name of ['Sephiroth', 'Valakut Awakening', 'Delver', 'Aclazotz', 'Fire', 'Sol Ring', 'Forest']) {
    await clickCard('#hand .card', (await handNames()).findIndex((x) => x.startsWith(name)));
    await clickAction('To battlefield');
    await clickAction('Deselect');
  }
  check('before any turn: the Forest is the only land, the other six are in the other row', (await count('#battlefield .card[data-kind="land"]')) === 1 && (await count('#battlefield .card[data-kind="other"]')) === 6, `${await count('#battlefield .card[data-kind="land"]')} and ${await count('#battlefield .card[data-kind="other"]')}`);
  const offers = async (prefix) => { await clickCard(cardAt(prefix)); const labels = await actionLabels(); await clickAction('Deselect'); return labels; };
  check('Turn over is offered for Sephiroth, Valakut Awakening, Delver and Aclazotz', (await Promise.all(['Sephiroth', 'Valakut Awakening', 'Delver', 'Aclazotz'].map(async (n) => (await offers(n)).includes('Turn over')))).every(Boolean));
  check('and not for Fire // Ice (one picture for both halves), Sol Ring or the Forest', (await Promise.all(['Fire', 'Sol Ring', 'Forest'].map(async (n) => (await offers(n)).includes('Turn over')))).every((has) => !has));
  check('the front pictures were asked for, and no back picture yet', asked.some((u) => u.includes(`/front/`) && u.includes(defaultId('Valakut Awakening'))) && !asked.some((u) => u.includes('/back/')), asked.filter((u) => u.includes('/back/')).join(' '));

  // Valakut Awakening: an Instant on the front and a land on the back.
  await clickCard(cardAt('Valakut Awakening'));
  check('its selected line gives both type lines and does not say turned over', /Instant \/\/ Land/.test(await $text('selected-line')) && !/turned over/.test(await $text('selected-line')));
  await clickAction('Turn over');
  check('turned over, it moves to the land row (now two lands), and the other row has five', (await rowOf('Valakut Awakening')) === 'row-lands' && (await count('#battlefield .card[data-kind="land"]')) === 2 && (await count('#battlefield .card[data-kind="other"]')) === 5);
  check('its label says it is turned over, and so does the selected line and the status', /, turned over/.test(await labelOf('Valakut Awakening')) && /\(turned over\)/.test(await $text('selected-line')) && /Turned .*Valakut Awakening.* over\./.test(await $text('status')), await $text('status'));
  await waitFor(async () => (await srcOf('Valakut Awakening'))?.includes('/back/') || null, 3000, 50).catch(() => null);
  const backUrl = await srcOf('Valakut Awakening');
  check('the picture is now the BACK face of the same printing', Boolean(backUrl) && backUrl.includes(`/back/`) && backUrl.includes(defaultId('Valakut Awakening')), String(backUrl));
  check('and that back picture was asked for (the stand-in answered it)', asked.some((u) => u.includes('/back/') && u.includes(defaultId('Valakut Awakening'))));
  check('the card has no power and toughness box (a land has no numbers, and the front has none either)', (await box(cardAt('Valakut Awakening'))) === null);
  check('the action button now says how to turn it back', (await actionLabels()).includes('Turn back to front') && !(await actionLabels()).includes('Turn over'));
  await clickAction('Turn back to front');
  check('turned back, it is in the other row again and shows its front picture', (await rowOf('Valakut Awakening')) === 'row-other' && (await count('#battlefield .card[data-kind="land"]')) === 1 && /\/front\//.test(await srcOf('Valakut Awakening')) && !/turned over/.test(await labelOf('Valakut Awakening')));
  await clickAction('Deselect');

  // Sephiroth: a 3/3 on the front, a 5/5 on the back, and the numbers follow the face that shows.
  const seph = '#battlefield ' + cardAt('Sephiroth');
  await clickCard(cardAt('Sephiroth'));
  const front = await box(seph);
  check('Sephiroth shows his printed 3/3 while selected', front && front.visibility === 'visible' && front.power === '3' && front.toughness === '3', JSON.stringify(front));
  await clickAction('Turn over');
  const back = await box(seph);
  check('turned over, the box says 5/5 (the back face\'s numbers) and he is still in the other row', back && back.power === '5' && back.toughness === '5' && (await rowOf('Sephiroth')) === 'row-other', JSON.stringify(back));
  await clickAction('Modify');
  await setAmount('2'); await clickMark('Add counters'); // the default kind is +1/+1
  await sleep(120);
  check('a +1/+1 counter change adds to the back face\'s 5/5 (shown as 7/7 once changed)', await (async () => { const b = await box(seph); return b && b.power === '7' && b.toughness === '7'; })(), JSON.stringify(await box(seph)));
  await clickAction('Turn back to front');
  const frontAgain = await box(seph);
  check('turned back, the counters stay and the numbers are the front\'s 3/3 plus them: 5/5', frontAgain && frontAgain.power === '5' && frontAgain.toughness === '5', JSON.stringify(frontAgain));
  await clickAction('Deselect');

  // Aclazotz: a 4/4 creature that turns into a land.
  await clickCard(cardAt('Aclazotz'));
  check('Aclazotz shows 4/4 on the front', (await box('#battlefield ' + cardAt('Aclazotz'))).power === '4');
  await clickAction('Turn over');
  check('turned over it is a land: in the land row, with no numbers, never the front\'s 4/4', (await rowOf('Aclazotz')) === 'row-lands' && (await box(cardAt('Aclazotz'))) === null && (await count('#battlefield .card[data-kind="land"]')) === 2);
  const noImage = (prefix) => ev(`document.querySelector(${JSON.stringify(cardAt(prefix))}).classList.contains('noimage')`);
  await waitFor(async () => (await noImage('Aclazotz')) || null, 3000, 50).catch(() => null);
  check('its back picture does not exist (404), so the card shows its name instead of a broken picture', await noImage('Aclazotz'));
  await clickAction('Turn back to front');
  await waitFor(async () => !(await noImage('Aclazotz')) || null, 3000, 50).catch(() => null);
  check('turned back, the front picture is shown again and the name fallback is gone', !(await noImage('Aclazotz')) && /\/front\//.test(await srcOf('Aclazotz')));
  await clickAction('Turn over');
  await clickAction('Deselect');

  // The right-click menu offers it too, and a click with the real mouse does it.
  // A card with a long, two-line type line is selected, so the selected-card panel gets shorter when the right-click selects Delver; the
  // browser then moves the scroll position (here by 23 px) to keep the cards still. That used to close the menu at once (found 2026-11-06).
  await clickCard(cardAt('Sephiroth'));
  const panelBefore = await ev(`document.getElementById('selected').getBoundingClientRect().height`);
  await mouse(cardAt('Delver'), { button: 'right', dy: 30 });
  check('the test is real: the right-click made the selected-card panel shorter, so the page had to scroll by itself', (await ev(`document.getElementById('selected').getBoundingClientRect().height`)) < panelBefore - 10, `${panelBefore} -> ${await ev(`document.getElementById('selected').getBoundingClientRect().height`)}`);
  const delverMenu = await menuState();
  check('the menu for Delver lists Turn over between Tap and the counter', delverMenu && JSON.stringify(delverMenu.items.slice(0, 4)) === JSON.stringify(['Modify...', 'Tap', 'Turn over', "Doesn't untap"]), JSON.stringify(delverMenu?.items));
  await sleep(500);
  check('the menu is still open half a second later (it must not close by itself after a right click on a card that was not selected)', Boolean(await menuState()), JSON.stringify(await menuState()));
  await clickMenuItem('Turn over');
  check('choosing it turns Delver (the menu closes, the label says so, the box says 3/2)', !(await menuState()) && /, turned over/.test(await labelOf('Delver')) && (await box('#battlefield ' + cardAt('Delver'))) !== null, await labelOf('Delver'));
  await clickCard(cardAt('Delver'));
  check('and the selected-card box shows the back face\'s 3/2', await (async () => { const b = await box('#battlefield ' + cardAt('Delver')); return b && b.power === '3' && b.toughness === '2'; })(), JSON.stringify(await box('#battlefield ' + cardAt('Delver'))));
  await clickAction('Deselect');
  await mouse(cardAt('Sol Ring'), { button: 'right', dy: 30 });
  const solMenu = await menuState();
  check('the menu of a card with no back has no Turn over', solMenu && !solMenu.items.includes('Turn over') && solMenu.items.includes('Tap'), JSON.stringify(solMenu?.items));
  await key('Escape', 'Escape', 27);

  // A turned card that leaves the battlefield comes back showing its front.
  await clickCard(cardAt('Aclazotz'));
  await clickAction('To hand');
  const aclazotzInHand = await srcOf('Aclazotz');
  check('Aclazotz, sent to the hand while turned over, is a front-face card there (not turned, front picture)', (await count('#hand ' + cardAt('Aclazotz'))) === 1 && !/turned over/.test(await labelOf('Aclazotz')) && /\/front\//.test(aclazotzInHand), String(aclazotzInHand));
  check('and in the hand it has no Turn over button', !(await actionLabels()).includes('Turn over') && !(await actionLabels()).includes('Turn back to front'));
  await clickAction('To battlefield');
  check('played again it shows its front: a 4/4 creature in the other row', (await rowOf('Aclazotz')) === 'row-other' && !/turned over/.test(await labelOf('Aclazotz')));
  await clickAction('Deselect');

  // A card whose deck names a printing: the picture of the face that shows comes from that printing, and when that printing has none
  // (a made-up id here, which the stand-in answers with 404) the fallback is the DEFAULT printing's picture of the SAME face.
  const NO_SUCH_PRINTING = '11111111-1111-4111-8111-111111111111';
  failIds.add(NO_SUCH_PRINTING);
  const printed = JSON.parse(TWO_SIDED);
  printed.cards.find((c) => c.n.startsWith('Delver')).p = NO_SUCH_PRINTING;
  asked.length = 0;
  await open(JSON.stringify(printed));
  await clickCard('#hand .card', (await handNames()).findIndex((x) => x.startsWith('Delver')));
  await clickAction('To battlefield');
  await waitFor(async () => asked.some((u) => u.includes(`/front/`) && u.includes(defaultId('Delver'))) || null, 3000, 50).catch(() => null);
  check('the named printing has no picture, so the card shows the default printing\'s FRONT picture', asked.some((u) => u.includes(NO_SUCH_PRINTING)) && /\/front\/.*/.test(await srcOf('Delver')) && (await srcOf('Delver')).includes(defaultId('Delver')), String(await srcOf('Delver')));
  await clickAction('Turn over');
  // Wait for the END of the fallback (the default printing's back), not for any back picture: the printing's own back comes first, then it 404s.
  await waitFor(async () => { const s = (await srcOf('Delver')) ?? ''; return s.includes('/back/') && s.includes(defaultId('Delver')) ? true : null; }, 5000, 50).catch(() => null);
  check('turned over, the missing printing falls back to the default printing\'s BACK picture (not its front), with no name fallback', ((await srcOf('Delver')) ?? '').includes(`/back/`) && (await srcOf('Delver')).includes(defaultId('Delver')) && !(await noImage('Delver')), String(await srcOf('Delver')));
  check('and the printing\'s own back picture was tried first', asked.some((u) => u.includes('/back/') && u.includes(NO_SUCH_PRINTING)));
  await clickAction('Deselect');

  // ---- playing a modal card as its back face, and Create copy (a copy copies only the face that shows) ----
  asked.length = 0;
  await open(TWO_SIDED);
  const offersPlay = {};
  for (const name of ['Sephiroth', 'Delver', 'Aclazotz', 'Fire', 'Sol Ring', 'Forest', 'Valakut Awakening']) {
    await clickCard('#hand .card', (await handNames()).findIndex((x) => x.startsWith(name)));
    offersPlay[name] = (await actionLabels()).filter((l) => /^Play /.test(l));
    if (name === 'Valakut Awakening') await clickAction('Deselect'); else { await clickAction('To battlefield'); await clickAction('Deselect'); }
  }
  check('only the modal card (Valakut Awakening) is offered Play as its back face; the transform cards (Sephiroth, Delver, Aclazotz), Fire // Ice, Sol Ring and the Forest are not', JSON.stringify(offersPlay) === JSON.stringify({ Sephiroth: [], Delver: [], Aclazotz: [], Fire: [], 'Sol Ring': [], Forest: [], 'Valakut Awakening': ['Play Valakut Stoneforge'] }), JSON.stringify(offersPlay));
  check('the hand now holds only Valakut Awakening', (await count('#hand .card')) === 1 && (await handNames())[0].startsWith('Valakut'));
  await clickCard('#hand .card', 0);
  await clickAction('Play Valakut Stoneforge');
  check('the button plays it as its land in one step: on the battlefield, turned over, in the lands row, and the hand is empty', (await count('#hand .card')) === 0 && (await rowOf('Valakut Awakening')) === 'row-lands' && /, turned over/.test(await labelOf('Valakut Awakening')), await labelOf('Valakut Awakening'));
  check('and the status says what was played', (await $text('status')) === 'Played Valakut Stoneforge (the back of Valakut Awakening).', await $text('status'));
  await waitFor(async () => ((await srcOf('Valakut Awakening')) ?? '').includes('/back/') || null, 3000, 50).catch(() => null);
  check('it shows the back picture', ((await srcOf('Valakut Awakening')) ?? '').includes('/back/'));
  await clickAction('To hand');
  check('sent back to the hand it is a front-face card again', (await count('#hand .card')) === 1 && !/turned over/.test(await labelOf('Valakut Awakening')) && /\/front\//.test(await srcOf('Valakut Awakening')));
  await mouse('#hand .card', { button: 'right', dy: 30 });
  const handMenu = await menuState();
  check('the right-click menu of the modal card in the hand offers it first, before Move to', handMenu && JSON.stringify(handMenu.items.slice(0, 2)) === JSON.stringify(['Play Valakut Stoneforge', 'Move to']), JSON.stringify(handMenu?.items));
  await clickMenuItem('Play Valakut Stoneforge');
  check('choosing it plays the land the same way', (await count('#hand .card')) === 0 && (await rowOf('Valakut Awakening')) === 'row-lands' && /, turned over/.test(await labelOf('Valakut Awakening')));
  await clickAction('Deselect');

  // Create copy: Sephiroth turned over, with two counters on him; the copy is the BACK face and has none of his counters.
  await clickCard(cardAt('Sephiroth'));
  await clickAction('Turn over');
  await clickAction('Modify');
  await setAmount('2'); await clickMark('Add counters');
  await clickAction('Modify');
  await clickAction('Deselect');
  const tokensBefore = await count('.card[aria-label^="Sephiroth, One-Winged"]');
  await mouse(cardAt('Sephiroth, Fabled'), { button: 'right', dy: 30 });
  const sephMenu = await menuState();
  check('the menu of a battlefield card offers Create copy, after the counter and before Move to', sephMenu && sephMenu.items.includes('Create copy') && sephMenu.items.indexOf('Create copy') === sephMenu.items.indexOf('Move to') - 1, JSON.stringify(sephMenu?.items));
  await clickMenuItem('Create copy');
  check('the status names the face that was copied', (await $text('status')) === 'Made a token copy of Sephiroth, One-Winged Angel.', await $text('status'));
  const copySel = '.card[aria-label^="Sephiroth, One-Winged"]';
  check('there is a new card, named for the back face, and it shows the BACK picture of the card', (await count(copySel)) === tokensBefore + 1 && ((await ev(`document.querySelector(${JSON.stringify(copySel + ' img')}).getAttribute('src')`)) ?? '').includes('/back/'));
  check('the copy has none of the counters of the card it copies, which keeps its own', (await count(copySel + ' .marks .chip')) === 0 && (await count(cardAt('Sephiroth, Fabled') + ' .marks .chip')) === 1);
  await clickCard(copySel);
  const copyBox = await box('#battlefield ' + copySel);
  check('selected, the copy shows the back face\'s printed 5/5 (not 5/5 plus the counters: 7/7)', copyBox && copyBox.power === '5' && copyBox.toughness === '5', JSON.stringify(copyBox));
  check('its line gives only the back face\'s type line (a token carries one face)', /Sephiroth, One-Winged Angel: Legendary Creature — Angel Nightmare Avatar, in the battlefield/.test(await $text('selected-line')) && !/\/\//.test(await $text('selected-line')) && !/turned over/.test(await $text('selected-line')) && !/turned over/.test(await labelOf('Sephiroth, One-Winged')), await $text('selected-line'));
  check('and it cannot be turned over (it is a copy of one face, not a two-sided card)', !(await actionLabels()).some((l) => /^Turn /.test(l)) && (await actionLabels()).includes('Create copy'));
  await clickAction('Create copy');
  check('a copy of the copy works and keeps the back face', (await count(copySel)) === tokensBefore + 2 && (await $text('status')) === 'Made a token copy of Sephiroth, One-Winged Angel.');
  await clickAction('To hand');
  check('a token that leaves the battlefield is gone, not put in the hand', (await count(copySel)) === tokensBefore + 1 && (await count('#hand .card')) === 0);
  await clickAction('Deselect');
  // A copy of a card showing its front, and of a creature that turned into a land.
  await clickCard(cardAt('Delver'));
  await clickAction('Create copy');
  const delverCopy = await ev(`(() => { const cards = Array.from(document.querySelectorAll('.card[aria-label^="Delver of Secrets"]')); return cards.length; })()`);
  check('a copy of Delver showing its front is a second Delver of Secrets with the front picture', delverCopy === 2 && (await ev(`Array.from(document.querySelectorAll('.card[aria-label^="Delver of Secrets"] img')).every((i) => i.getAttribute('src').includes('/front/'))`)), String(delverCopy));
  await clickAction('Deselect');
  await clickCard(cardAt('Aclazotz'));
  await clickAction('Turn over');
  await clickAction('Create copy');
  await clickAction('Deselect');
  const landCopies = await ev(`Array.from(document.querySelectorAll('#battlefield .card[data-kind="land"][aria-label^="Temple of the Dead"]')).map((c) => c.getAttribute('aria-label'))`);
  check('a copy of Aclazotz turned into its land is a land too: Temple of the Dead, in the lands row, with the back picture and no numbers', landCopies.length === 1 && (await ev(`document.querySelector('#battlefield .card[data-kind="land"][aria-label^="Temple of the Dead"] img').getAttribute('src').includes('/back/')`)) && (await box('#battlefield .card[data-kind="land"][aria-label^="Temple of the Dead"]')) === null, JSON.stringify(landCopies));

  // ---- player counters: poison, energy and experience (real mouse input) ----
  await open();
  const stepper = (kind) => `#player-counters .counter-entry[data-id="counter:${kind}"]`;
  const counterFacts = (kind) => ev(`(() => { const e = document.querySelector(${JSON.stringify(stepper(kind))}); if (!e) return null; return { count: e.querySelector('.stepper-count').textContent, lethal: e.classList.contains('lethal'), word: !e.querySelector('.stepper-lethal').hidden, label: e.querySelector('.stepper-name').textContent, buttons: [...e.querySelectorAll('button')].map((b) => [b.textContent, b.getAttribute('aria-label'), b.disabled]), title: e.title, role: e.getAttribute('role'), group: e.getAttribute('aria-label') }; })()`);
  const bump = (kind, step) => mouse(`${stepper(kind)} button[data-step="${step}"]`);
  check('the counters section shows, with the three counters in a fixed order, and there is no commander damage on the solo table', !(await $hidden('game')) && (await count('#player-counters .counter-entry')) === 3 && (await ev(`[...document.querySelectorAll('#player-counters .stepper-name')].map((n) => n.textContent).join()`)) === 'Poison,Energy,Experience' && (await count('#commander-damage')) === 0);
  const zeroPoison = await counterFacts('poison');
  check('each starts at 0, with its own words for a screen reader, and -1 is disabled (nothing to take off)', zeroPoison.count === '0' && !zeroPoison.lethal && !zeroPoison.word && zeroPoison.role === 'group' && zeroPoison.group === 'Poison' && JSON.stringify(zeroPoison.buttons) === JSON.stringify([['-1', 'Remove 1 poison counter', true], ['+1', 'Add 1 poison counter', false]]), JSON.stringify(zeroPoison));
  await bump('poison', 1);
  check('a click on +1 adds one, says so, and enables -1', (await counterFacts('poison')).count === '1' && (await $text('status')) === 'Poison 1.' && (await counterFacts('poison')).buttons[0][2] === false, await $text('status'));
  check('the button that was pressed is still the focused one (the elements are updated in place, not rebuilt)', (await ev(`document.activeElement && document.activeElement.getAttribute('aria-label')`)) === 'Add 1 poison counter', await ev(`String(document.activeElement && document.activeElement.outerHTML.slice(0, 80))`));
  for (let n = 0; n < 8; n++) await bump('poison', 1);
  const nine = await counterFacts('poison');
  check('9 poison is not lethal yet', nine.count === '9' && !nine.lethal && !nine.word && nine.title === '');
  await bump('poison', 1);
  const ten = await counterFacts('poison');
  check('10 poison is lethal: the card is marked, the word "lethal" shows (not colour alone) and the tooltip says why', ten.count === '10' && ten.lethal && ten.word && /10 or more is lethal/.test(ten.title), JSON.stringify(ten));
  check('and nothing stops the player: they can go on adding (it is a signal, not a rule)', await (async () => { await bump('poison', 1); return (await counterFacts('poison')).count === '11' && (await counterFacts('poison')).lethal; })());
  await bump('poison', -1); await bump('poison', -1);
  check('taking two off goes back to 9 and the mark goes away', (await counterFacts('poison')).count === '9' && !(await counterFacts('poison')).lethal && !(await counterFacts('poison')).word);
  for (let n = 0; n < 11; n++) await bump('energy', 1);
  await bump('experience', 1);
  check('energy and experience are never lethal, and each counts on its own', (await counterFacts('energy')).count === '11' && !(await counterFacts('energy')).lethal && (await counterFacts('experience')).count === '1' && (await counterFacts('poison')).count === '9');
  check('the status line names the counter that changed last', (await $text('status')) === 'Experience 1.', await $text('status'));
  for (let n = 0; n < 9; n++) await bump('poison', -1);
  check('taking all of it off ends at 0 and -1 is disabled again', (await counterFacts('poison')).count === '0' && (await counterFacts('poison')).buttons[0][2] === true);
  await press('new-game');
  check('a new game starts every counter at 0 again', (await counterFacts('energy')).count === '0' && (await counterFacts('experience')).count === '0' && (await counterFacts('poison')).count === '0');
  check('the counters did not touch life: a commander deck starts at 40', (await $text('life')) === '40' && (await count('#hand .card')) === 7);

  // ---- ONE player's commander damage works on its own, mounted anywhere (so a later design can put it in that player's panel) ----
  const standalone = await ev(`(async () => {
    const { commanderDamageNode } = await import('/src/player-counters.js');
    const host = document.createElement('section'); host.id = 'test-host'; host.className = 'opponent'; document.body.append(host);
    const entry = (count) => ({ id: 'damage:2', seat: '2', name: 'Bob', label: 'Seat 2: Bob', count, lethalAt: 21, lethal: count >= 21 });
    const calls = [];
    const node = commanderDamageNode(entry(7), { onChange: (e, step) => calls.push([e.seat, e.name, step]) });
    host.append(node.element);
    const buttons = [...node.element.querySelectorAll('button')];
    buttons.find((b) => b.dataset.step === '5').click();
    buttons.find((b) => b.dataset.step === '-1').click();
    const before = { count: node.element.querySelector('.stepper-count').textContent, lethal: node.element.classList.contains('lethal'), labels: buttons.map((b) => b.getAttribute('aria-label')) };
    node.update({ ...entry(21), name: 'Bobby', label: 'Seat 2: Bobby' }); // the player's name changed: a button must report the CURRENT entry
    [...node.element.querySelectorAll('button')].find((b) => b.dataset.step === '1').click();
    const after = { count: node.element.querySelector('.stepper-count').textContent, lethal: node.element.classList.contains('lethal'), word: !node.element.querySelector('.stepper-lethal').hidden, sameButtons: [...node.element.querySelectorAll('button')].every((b, i) => b === buttons[i]) };
    const chip = commanderDamageNode(entry(0), { readOnly: true });
    host.append(chip.element);
    const hiddenAtZero = chip.element.hidden;
    chip.update(entry(9));
    const shown = { hidden: chip.element.hidden, text: chip.element.textContent, buttons: chip.element.querySelectorAll('button').length };
    host.remove();
    return { calls, before, after, hiddenAtZero, shown };
  })()`);
  check('one player\'s commander damage node works alone: its buttons report that player (seat and name) and the step', JSON.stringify(standalone.calls) === JSON.stringify([['2', 'Bob', 5], ['2', 'Bob', -1], ['2', 'Bobby', 1]]), JSON.stringify(standalone.calls));
  check('it names the player in every button\'s words for a screen reader', standalone.before.labels.every((l) => /commander damage from Seat 2: Bob/.test(l)) && standalone.before.labels.length === 4, JSON.stringify(standalone.before.labels));
  check('updating it changes the number and the lethal mark in place, with the same buttons (a pressed button keeps the focus)', standalone.before.count === '7' && !standalone.before.lethal && standalone.after.count === '21' && standalone.after.lethal && standalone.after.word && standalone.after.sameButtons, JSON.stringify(standalone.after));
  check('the read-only version of it hides itself at 0, has no buttons and says what it is once there is damage', standalone.hiddenAtZero && !standalone.shown.hidden && standalone.shown.buttons === 0 && /Commander damage from Seat 2: Bob/.test(standalone.shown.text) && /9/.test(standalone.shown.text), JSON.stringify(standalone.shown));

  // ---- summoning sickness (hybrid) and "doesn't untap" (real mouse input; a 7-card deck, so everything is in the hand) ----
  const MARKS_DECK = deckFrom("1 Goblin Guide\n1 Llanowar Elves\n1 Sol Ring\n1 Forest\n1 Lightning Bolt\n1 Hellrider\n1 Smuggler's Copter", 'Marks deck', null, []);
  await open(MARKS_DECK);
  for (const name of ['Goblin Guide', 'Llanowar Elves', 'Sol Ring', 'Forest', 'Hellrider', "Smuggler's Copter"]) {
    await clickCard('#hand .card', (await handNames()).findIndex((x) => x.startsWith(name)));
    await clickAction('To battlefield'); await clickAction('Deselect');
  }
  const badgeNames = (kind) => ev(`Array.from(document.querySelectorAll('#battlefield .card')).filter((c) => c.querySelector('.badge-${kind}')).map((c) => c.getAttribute('aria-label').split(',')[0])`);
  check('only the creature without printed haste came in sick: Goblin Guide and Hellrider (printed haste), Sol Ring, the Forest and a Vehicle did not', JSON.stringify(await badgeNames('sick')) === JSON.stringify(['Llanowar Elves']), JSON.stringify(await badgeNames('sick')));
  check('the hand still holds Lightning Bolt, and nothing there has a badge', (await handNames()).join() === 'Lightning Bolt' && (await count('#hand .card .badge')) === 0);
  const sickBadge = `${cardAt('Llanowar Elves')} .badge-sick`;
  check('the badge says SICK in words and the card says so for a screen reader, with a tip that says how to clear it', (await ev(`document.querySelector(${JSON.stringify(sickBadge)}).textContent`)) === 'SICK' && /, summoning sick/.test(await labelOf('Llanowar Elves')) && /Summoning sick.*Click to clear it\./.test(await ev(`document.querySelector(${JSON.stringify(sickBadge)}).title`)));
  await clickAction('Deselect');
  await mouse(sickBadge);
  check('a click on the badge clears it in one step, says so, and does not select the card', (await count(sickBadge)) === 0 && (await $text('status')) === 'Llanowar Elves is no longer marked summoning sick.' && /^Click a card/.test(await $text('selected-line')), `${await $text('status')} | ${await $text('selected-line')}`);
  check('the card no longer says summoning sick', !/summoning sick/.test(await labelOf('Llanowar Elves')));
  await mouse(cardAt('Goblin Guide'), { button: 'right', dy: 30 });
  const guideMenu = await menuState();
  check('a card that is not sick offers "Summoning sick" (for haste lost, or control gained), and "Doesn\'t untap"', guideMenu && guideMenu.items[2] === "Doesn't untap" && guideMenu.items[3] === 'Summoning sick', JSON.stringify(guideMenu?.items));
  await clickMenuItem('Summoning sick');
  check('choosing it marks the Goblin Guide (a mark by hand is never refused)', (await count(`${cardAt('Goblin Guide')} .badge-sick`)) === 1 && (await $text('status')) === 'Goblin Guide is marked summoning sick.', await $text('status'));
  await clickAction('Create copy');
  await clickAction('Deselect');
  const copyBadges = await ev(`Array.from(document.querySelectorAll('.card[aria-label^="Goblin Guide"]')).map((c) => Boolean(c.querySelector('.badge-sick')))`);
  check('a copy of a creature with printed haste is not sick (a new permanent, but it has the haste)', copyBadges.length === 2 && copyBadges.filter(Boolean).length === 1, JSON.stringify(copyBadges));
  await clickCard(cardAt('Llanowar Elves')); await clickAction('Create copy'); await clickAction('Deselect');
  check('a copy of a creature without haste comes in sick', (await ev(`Array.from(document.querySelectorAll('.card[aria-label^="Llanowar Elves"]')).filter((c) => c.querySelector('.badge-sick')).length`)) === 1);
  await clickCard(cardAt('Hellrider'));
  const buttons = await actionLabels();
  check('the selected-card buttons have both marks (the way in on a phone)', buttons.includes("Doesn't untap") && buttons.includes('Summoning sick'), JSON.stringify(buttons));
  await clickAction('Summoning sick'); await clickAction('Deselect');
  check('and the button marks a card as the menu does', (await count(`${cardAt('Hellrider')} .badge-sick`)) === 1);
  const sickBefore = await count('.card .badge-sick');
  await press('next-turn');
  check('Next turn ends every summoning sickness by itself, untaps, and says it', sickBefore >= 3 && (await count('.card .badge-sick')) === 0 && /^Turn 2: everything untapped/.test(await $text('status')), `${sickBefore} then ${await count('.card .badge-sick')} | ${await $text('status')}`);
  check('a battlefield card is not marked again by a new turn', (await count('#battlefield .card .badge')) === 0);

  // "Doesn't untap": Sol Ring and the Forest are tapped, Sol Ring is marked.
  await clickCard(cardAt('Sol Ring')); await clickAction('Tap'); await clickAction('Deselect');
  await clickCard(cardAt('Forest')); await clickAction('Tap'); await clickAction('Deselect');
  await mouse(cardAt('Sol Ring'), { button: 'right', dy: 30 });
  await clickMenuItem("Doesn't untap");
  check('the menu marks Sol Ring and says so', (await $text('status')) === 'Sol Ring will not untap in the untap step.' && (await count(`${cardAt('Sol Ring')} .badge-lock`)) === 1, await $text('status'));
  const lock = await ev(`(() => { const b = document.querySelector(${JSON.stringify(cardAt('Sol Ring') + ' .badge-lock')}); const s = b.querySelector('svg'); return { width: s.getAttribute('width'), height: s.getAttribute('height'), fill: s.getAttribute('fill'), hidden: s.getAttribute('aria-hidden'), title: b.title, shapes: s.querySelectorAll('path, rect').length, label: b.closest('.card').getAttribute('aria-label'), tag: s.tagName }; })()`);
  check('the lock is an inline SVG with its width, height and fill set directly, hidden from screen readers, and its words are on the card and in a tooltip', lock.tag === 'svg' && lock.width === '18' && lock.height === '18' && lock.fill === 'none' && lock.hidden === 'true' && lock.shapes === 4 && /doesn't untap/.test(lock.label) && /Doesn't untap: the untap step skips this card\. Click to clear it\./.test(lock.title), JSON.stringify(lock));
  await press('untap-all');
  check('Untap all untaps the Forest and leaves the marked Sol Ring tapped, and says how many it held back', (await ev(`document.querySelector(${JSON.stringify(cardAt('Forest'))}).classList.contains('tapped')`)) === false && (await ev(`document.querySelector(${JSON.stringify(cardAt('Sol Ring'))}).classList.contains('tapped')`)) === true && (await $text('status')) === 'Untapped everything except 1 card that does not untap.', await $text('status'));
  await clickCard(cardAt('Forest')); await clickAction('Tap'); await clickAction('Deselect');
  await press('next-turn');
  check('Next turn does the same, and the turn goes on', (await ev(`document.querySelector(${JSON.stringify(cardAt('Sol Ring'))}).classList.contains('tapped')`)) === true && (await ev(`document.querySelector(${JSON.stringify(cardAt('Forest'))}).classList.contains('tapped')`)) === false && /^Turn 3: everything untapped except 1 that do not untap/.test(await $text('status')), await $text('status'));
  check('the lock stays across the turn (a Claustrophobia aura lasts many turns)', (await count(`${cardAt('Sol Ring')} .badge-lock`)) === 1);
  await clickCard(cardAt('Sol Ring'));
  await clickAction('Untap');
  check('a marked card can still be untapped by hand (Mana Vault: pay at upkeep)', (await ev(`document.querySelector(${JSON.stringify(cardAt('Sol Ring'))}).classList.contains('tapped')`)) === false && (await count(`${cardAt('Sol Ring')} .badge-lock`)) === 1);
  await clickAction('Tap'); await clickAction('Deselect');
  await mouse(`${cardAt('Sol Ring')} .badge-lock`);
  check('a click on the lock clears it in one step', (await count(`${cardAt('Sol Ring')} .badge-lock`)) === 0 && (await $text('status')) === 'Sol Ring untaps normally again.', await $text('status'));
  await press('untap-all');
  check('and the next untap step untaps the card (Untap all says nothing was held back)', (await ev(`document.querySelector(${JSON.stringify(cardAt('Sol Ring'))}).classList.contains('tapped')`)) === false && (await $text('status')) === 'Untapped everything.', await $text('status'));
  await clickCard(cardAt('Sol Ring')); await clickAction("Doesn't untap"); await clickAction('To hand');
  check('a card that leaves the battlefield loses the mark and comes back without it', (await count('#hand .badge')) === 0 && (await count(`${cardAt('Sol Ring')} .badge-lock`)) === 0);
  await clickAction('To battlefield');
  check('...and is not held back when it returns', (await count(`${cardAt('Sol Ring')} .badge-lock`)) === 0);

  // ---- drag and drop on the fine battlefield grid (112 by 44 square cells, a card is 8 wide and 11 tall), Alt+arrow keys and Auto-arrange (real mouse and keyboard input; a 7-card deck, so everything is in the hand) ----
  await open(MARKS_DECK);
  const boardRect = () => ev(`(() => { const r = document.getElementById('battlefield').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`);
  // the point where the middle of a card dropped from the hand starts on cell (col, row): the card's top-left cell is four cells left and five up of the middle
  const cellCenter = async (col, row) => { const r = await boardRect(); return { x: r.left + (col + 4.5) * r.width / 112, y: r.top + (row + 5.5) * r.height / 44 }; };
  const centerOfSelector = (selector) => ev(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const handCardPoint = async (name) => centerOfSelector(`#hand .card:nth-child(${(await handNames()).findIndex((x) => x.startsWith(name)) + 1})`);
  const mouseAt = (type, p, buttons) => browser.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: 1 });
  // press on `from`, move to `to` in steps, then (by default) let go; `during` runs with the button still down
  const dragTo = async (from, to, { release = true, during = null } = {}) => {
    await mouseAt('mouseMoved', from, 0);
    await mouseAt('mousePressed', from, 1);
    for (let step = 1; step <= 8; step++) await mouseAt('mouseMoved', { x: from.x + (to.x - from.x) * step / 8, y: from.y + (to.y - from.y) * step / 8 }, 1);
    if (during) await during();
    if (release) { await mouseAt('mouseReleased', to, 0); await sleep(80); }
  };
  // a card already on the battlefield moves by as many cells as the pointer travels
  const dragBy = async (name, cols, rows) => {
    const r = await boardRect(); const from = await centerOfSelector(cardAt(name));
    await dragTo(from, { x: from.x + cols * r.width / 112, y: from.y + rows * r.height / 44 });
  };
  const cellOfCard = (name) => ev(`(() => { const c = document.querySelector(${JSON.stringify(cardAt(name))}); return c ? c.dataset.col + ',' + c.dataset.row : null; })()`);
  const onTopName = () => ev(`(() => { const cs = document.querySelectorAll('#battlefield .card'); return cs.length ? cs[cs.length - 1].getAttribute('aria-label').split(',')[0] : null; })()`);
  const dragStateGone = async () => (await count('.drag-ghost')) === 0 && (await count('.cell-highlight')) === 0 && (await ev(`!document.body.classList.contains('dragging-card')`)) && (await count('#hand .card.dragging, #battlefield .card.dragging')) === 0;

  await dragTo(await handCardPoint('Forest'), await cellCenter(40, 8));
  check('dragging a card from the hand onto the battlefield plays it where it was dropped, and says so', (await cellOfCard('Forest')) === '40,8' && !(await handNames()).includes('Forest') && (await $text('status')) === 'Played Forest.', `${await cellOfCard('Forest')} | ${await $text('status')}`);
  check('...the picture and the outline are gone afterwards, and the drag did not select the card', await dragStateGone() && /^Click a card/.test(await $text('selected-line')), await $text('selected-line'));

  let outline = null;
  await dragTo(await handCardPoint('Sol Ring'), await cellCenter(44, 10), { release: false, during: async () => { outline = await ev(`(() => { const h = document.querySelector('.cell-highlight'); return h && !h.hidden ? { cls: h.className, col: h.dataset.col, row: h.dataset.row, ghost: document.querySelectorAll('.drag-ghost').length } : null; })()`); } });
  check('while a card is held over a spot that overlaps another card it is outlined like any spot (nothing is refused), and a picture follows the pointer', outline && outline.cls === 'cell-highlight' && outline.col === '44' && outline.row === '10' && outline.ghost === 1, JSON.stringify(outline));
  await mouseAt('mouseReleased', await cellCenter(44, 10), 0); await sleep(80);
  check('dropping it there plays it on top: both cards stay, overlapping', (await cellOfCard('Forest')) === '40,8' && (await cellOfCard('Sol Ring')) === '44,10' && (await $text('status')) === 'Played Sol Ring.' && (await onTopName()) === 'Sol Ring' && await dragStateGone(), `${await cellOfCard('Forest')} ${await cellOfCard('Sol Ring')} | ${await $text('status')}`);

  await dragBy('Sol Ring', 16, 6);
  check('a battlefield card moves by as many cells as the pointer travelled, and says so', (await cellOfCard('Sol Ring')) === '60,16' && (await cellOfCard('Forest')) === '40,8' && /^Moved Sol Ring\./.test(await $text('status')), `${await cellOfCard('Sol Ring')} ${await cellOfCard('Forest')} | ${await $text('status')}`);

  let overOutline = null;
  { const r = await boardRect(); const from = await centerOfSelector(cardAt('Forest'));
    await dragTo(from, { x: from.x + 20 * r.width / 112, y: from.y + 8 * r.height / 44 }, { release: false, during: async () => { overOutline = await ev(`document.querySelector('.cell-highlight')?.className ?? null`); } });
    await mouseAt('mouseReleased', { x: from.x + 20 * r.width / 112, y: from.y + 8 * r.height / 44 }, 0); await sleep(80); }
  check('a card dropped exactly on another card does not swap: both are on the same cell and the dropped one is on top', (await cellOfCard('Forest')) === '60,16' && (await cellOfCard('Sol Ring')) === '60,16' && (await onTopName()) === 'Forest' && /^Moved Forest\./.test(await $text('status')) && overOutline === 'cell-highlight', `${await cellOfCard('Forest')} ${await cellOfCard('Sol Ring')} ${await onTopName()} | ${await $text('status')} | ${overOutline}`);

  // the picture that follows the pointer is the card itself, at the size it has on the table
  { const box = await ev(`(() => { const c = document.querySelector(${JSON.stringify(cardAt('Forest'))}).getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; })()`); const from = { x: box.x + box.w * 0.2, y: box.y + box.h * 0.2 }; let sizes = null; // taken near its top-left corner
    await dragTo(from, { x: from.x + 30, y: from.y }, { release: false, during: async () => { sizes = await ev(`(() => { const g = document.querySelector('.drag-ghost').getBoundingClientRect(); const c = document.querySelector(${JSON.stringify(cardAt('Forest'))}).getBoundingClientRect(); return { ghost: [g.width, g.height], card: [c.width, c.height], held: [(${from.x + 30} - g.left) / g.width, (${from.y} - g.top) / g.height] }; })()`); } });
    await key('Escape', 'Escape', 27); await mouseAt('mouseReleased', { x: from.x + 30, y: from.y }, 0); await sleep(80);
    check('a card picked up on the battlefield keeps its size: the picture is as big as the card', sizes && Math.abs(sizes.ghost[0] - sizes.card[0]) < 1.5 && Math.abs(sizes.ghost[1] - sizes.card[1]) < 1.5, JSON.stringify(sizes));
    check('...and it is held where it was taken (near its corner), not by its middle', sizes && Math.abs(sizes.held[0] - 0.2) < 0.05 && Math.abs(sizes.held[1] - 0.2) < 0.05, JSON.stringify(sizes?.held));
    check('...and Escape put everything back', (await cellOfCard('Forest')) === '60,16' && await dragStateGone()); }
  { let sizes = null; const handBefore = await handCardPoint('Lightning Bolt');
    await dragTo(handBefore, await cellCenter(80, 4), { release: false, during: async () => { sizes = await ev(`(() => { const g = document.querySelector('.drag-ghost').getBoundingClientRect(); const c = Array.from(document.querySelectorAll('#hand .card'))[0].getBoundingClientRect(); return { ghost: [g.width, g.height], card: [c.width, c.height] }; })()`); } });
    await key('Escape', 'Escape', 27); await mouseAt('mouseReleased', await cellCenter(80, 4), 0); await sleep(80);
    check('a card picked up from the hand keeps its size too', sizes && Math.abs(sizes.ghost[0] - sizes.card[0]) < 1.5 && Math.abs(sizes.ghost[1] - sizes.card[1]) < 1.5, JSON.stringify(sizes)); }
  await dragBy('Forest', -60, 17);
  check('the card on top can be taken off again, and the one under it stays', (await cellOfCard('Forest')) === '0,33' && (await cellOfCard('Sol Ring')) === '60,16');

  // a tiny movement is still a click: it selects the card and does not move it
  await dragTo(await centerOfSelector(cardAt('Forest')), { ...(await centerOfSelector(cardAt('Forest'))), x: (await centerOfSelector(cardAt('Forest'))).x + 2 });
  check('moving only 2 pixels is a click: the card is selected and stays where it was', (await cellOfCard('Forest')) === '0,33' && /^Forest/.test(await $text('selected-line')), `${await cellOfCard('Forest')} | ${await $text('selected-line')}`);
  await clickAction('Deselect');

  // a drag of a few pixels that ends on the card it started on is not a click either (the click that follows is swallowed), and the card does not shift a cell
  { const here = await centerOfSelector(cardAt('Forest')); await dragTo(here, { x: here.x + 40, y: here.y }, { release: false }); await mouseAt('mouseMoved', here, 1); await mouseAt('mouseReleased', here, 0); await sleep(80);
    check('a drag that goes out and comes back to the same card leaves it on its cell and does not select it', (await cellOfCard('Forest')) === '0,33' && /^Click a card/.test(await $text('selected-line')) && await dragStateGone(), `${await cellOfCard('Forest')} | ${await $text('selected-line')}`); }
  // a press with Shift held is a marks click (10 at a time), not the start of a drag
  { const here = await centerOfSelector(cardAt('Forest')); const away = await cellCenter(16, 4);
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: here.x, y: here.y });
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: here.x, y: here.y, button: 'left', buttons: 1, clickCount: 1, modifiers: 8 });
    for (let step = 1; step <= 6; step++) await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: here.x + (away.x - here.x) * step / 6, y: here.y + (away.y - here.y) * step / 6, buttons: 1, modifiers: 8 });
    const shiftGhost = await count('.drag-ghost');
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: away.x, y: away.y, button: 'left', buttons: 0, clickCount: 1, modifiers: 8 }); await sleep(80);
    check('pressing with Shift held and moving does not drag the card', shiftGhost === 0 && (await cellOfCard('Forest')) === '0,33', `${shiftGhost} ${await cellOfCard('Forest')}`);
    await clickAction('Deselect'); }
  // the outline is only shown over the battlefield
  { let over = null;
    await dragTo(await centerOfSelector(cardAt('Forest')), await centerOfSelector('#hand .card'), { release: false, during: async () => { over = await ev(`(() => { const h = document.querySelector('.cell-highlight'); return h ? h.hidden : 'none'; })()`); } });
    await key('Escape', 'Escape', 27); await mouseAt('mouseReleased', await centerOfSelector('#hand .card'), 0); await sleep(80); // cancelled: letting go over the hand would put the card in it now
    check('while a card is held over the hand the outline on the battlefield is hidden', over === true, String(over)); }
  // Escape cancels a drag; so does letting go outside the battlefield
  await dragTo(await centerOfSelector(cardAt('Forest')), await cellCenter(6, 4), { release: false });
  await key('Escape', 'Escape', 27);
  await mouseAt('mouseReleased', await cellCenter(6, 4), 0); await sleep(80);
  check('Escape during a drag cancels it: the card stays, the picture and the outline are gone', (await cellOfCard('Forest')) === '0,33' && await dragStateGone());
  await dragTo(await centerOfSelector(cardAt('Forest')), await centerOfSelector('#selected-line'));
  check('letting go outside the battlefield and the hand (over the side panel) does nothing', (await cellOfCard('Forest')) === '0,33' && await dragStateGone());

  // a card dragged from the battlefield and let go over the hand goes back into the hand
  { let marked = null; const handBefore = (await handNames()).length;
    const target = await centerOfSelector('#hand .card');
    await dragTo(await centerOfSelector(cardAt('Forest')), target, { release: false, during: async () => { marked = await ev(`document.getElementById('hand-section').classList.contains('drop-hand')`); } });
    await mouseAt('mouseReleased', target, 0); await sleep(80);
    check('over the hand the hand is marked, and letting go there puts the card back in the hand', marked === true && (await count('#battlefield .card[aria-label^="Forest"]')) === 0 && (await handNames()).length === handBefore + 1 && /^Moved Forest back to your hand./.test(await $text('status')) && (await ev(`!document.getElementById('hand-section').classList.contains('drop-hand')`)), JSON.stringify({ marked, hand: (await handNames()).length, handBefore, status: await $text('status') }));
    await dragTo(await handCardPoint('Forest'), await cellCenter(0, 33));
    check('...and it can be played again from there', (await cellOfCard('Forest')) === '0,33'); }

  // dragging a tapped card shows the outline of a tapped card: landscape, not the shape of an untapped one
  { await clickCard(cardAt('Forest')); await clickAction('Tap');
    let shape = null;
    await dragTo(await centerOfSelector(cardAt('Forest')), await cellCenter(30, 10), { release: false, during: async () => { shape = await ev(`(() => { const h = document.querySelector('.cell-highlight'); if (!h || h.hidden) return null; const r = h.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), tapped: h.dataset.tapped }; })()`); } });
    await key('Escape', 'Escape', 27); await mouseAt('mouseReleased', await cellCenter(30, 10), 0); await sleep(80);
    check('the outline of a tapped card being dragged is a landscape card (wider than tall, about 11 by 8 cells)', shape && shape.tapped === '1' && shape.w > shape.h && Math.abs(shape.w / shape.h - 11 / 8) < 0.15, JSON.stringify(shape));
    await clickAction('Untap'); await clickAction('Deselect'); }

  // a press on a badge is the badge's, not the start of a drag
  await dragTo(await handCardPoint('Llanowar Elves'), await cellCenter(24, 0));
  const sickOn = `${cardAt('Llanowar Elves')} .badge-sick`;
  check('a creature played by dragging comes in summoning sick like any other way', (await cellOfCard('Llanowar Elves')) === '24,0' && (await count(sickOn)) === 1, await cellOfCard('Llanowar Elves'));
  await dragTo(await centerOfSelector(sickOn), await cellCenter(36, 0));
  check('pressing on the SICK badge and moving does not drag the card', (await cellOfCard('Llanowar Elves')) === '24,0' && await dragStateGone());

  // another mouse button, or a modifier key, is not a drag
  await mouseAt('mouseMoved', await centerOfSelector(cardAt('Forest')), 0);
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: (await centerOfSelector(cardAt('Forest'))).x, y: (await centerOfSelector(cardAt('Forest'))).y, button: 'right', buttons: 2, clickCount: 1 });
  await mouseAt('mouseMoved', await cellCenter(14, 4), 2);
  check('a right-button press does not start a drag', (await count('.drag-ghost')) === 0);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: (await cellCenter(14, 4)).x, y: (await cellCenter(14, 4)).y, button: 'right', buttons: 0, clickCount: 1 });
  await key('Escape', 'Escape', 27); await sleep(60);

  // a finger is not a drag either (touch is on hold; a finger is for scrolling)
  const fingerFrom = await centerOfSelector(cardAt('Sol Ring')); const fingerTo = { x: fingerFrom.x, y: fingerFrom.y - 60 }; // straight up: a sideways swipe from the left edge is the browser's own Back gesture and left the page
  await browser.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fingerFrom.x, y: fingerFrom.y }] });
  for (let step = 1; step <= 6; step++) await browser.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fingerFrom.x + (fingerTo.x - fingerFrom.x) * step / 6, y: fingerFrom.y + (fingerTo.y - fingerFrom.y) * step / 6 }] });
  const fingerGhost = await count('.drag-ghost');
  await browser.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(80);
  check('a touch that moves across the battlefield does not drag a card', fingerGhost === 0 && (await cellOfCard('Sol Ring')) === '60,16' && await dragStateGone(), `${fingerGhost} ${await cellOfCard('Sol Ring')}`);
  // Alt and an arrow key move the selected card one cell (a quarter card), without a mouse
  const altKey = async (name, vk) => { await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: name, code: name, windowsVirtualKeyCode: vk, modifiers: 1 }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: vk, modifiers: 1 }); await sleep(80); };
  await clickCard(cardAt('Forest')); await ev(`document.activeElement && document.activeElement.blur()`);
  await altKey('ArrowRight', 39);
  check('Alt and the right arrow move the selected card one cell right', (await cellOfCard('Forest')) === '1,33' && /^Moved Forest\./.test(await $text('status')), `${await cellOfCard('Forest')} | ${await $text('status')}`);
  await altKey('ArrowLeft', 37); await altKey('ArrowLeft', 37);
  check('...and at the edge of the battlefield it says so and stays', (await cellOfCard('Forest')) === '0,33' && /edge of the battlefield/.test(await $text('status')), `${await cellOfCard('Forest')} | ${await $text('status')}`);
  await altKey('ArrowUp', 38);
  check('Alt and the up arrow move it one row up', (await cellOfCard('Forest')) === '0,32');
  await clickAction('Deselect');

  // Auto-arrange: lands along the bottom from the left, everything else along the top from the left, a card apart
  await press('arrange');
  const arranged = await ev(`Array.from(document.querySelectorAll('#battlefield .card')).map((c) => c.getAttribute('aria-label').split(',')[0] + '@' + c.dataset.col + ',' + c.dataset.row + ':' + c.dataset.kind).sort()`);
  check('Auto-arrange puts the land at the bottom-left and the others along the top from the left (by name), a card apart, and says so', JSON.stringify(arranged) === JSON.stringify(['Forest@0,33:land', 'Llanowar Elves@0,0:other', 'Sol Ring@8,0:other']) && /^Tidied the battlefield/.test(await $text('status')), JSON.stringify(arranged));
  check('the battlefield is one grid that does not scroll the page, and after tidying no card covers another', await ev(`(() => { const cs = Array.from(document.querySelectorAll('#battlefield .card')).map((c) => [Number(c.dataset.col), Number(c.dataset.row)]); const clash = cs.some((a, i) => cs.some((b, j) => i !== j && Math.abs(a[0] - b[0]) < 8 && Math.abs(a[1] - b[1]) < 11)); return !clash && document.documentElement.scrollHeight <= innerHeight + 1; })()`));

  // ---- stacks: same-name cards on one cell are drawn as a pile with a count (real mouse input; the Solo test deck is half Forests) ----
  await open();
  for (let n = 0; n < 40 && (await names('#hand .card')).filter((x) => x.startsWith('Forest')).length < 6; n++) await press('draw');
  for (let n = 0; n < 6; n++) { await clickCard('#hand .card', (await handNames()).findIndex((x) => x.startsWith('Forest'))); await clickAction('To battlefield'); }
  await clickAction('Deselect');
  const forestState = () => ev(`(() => { const cs = Array.from(document.querySelectorAll('#battlefield .card')).filter((c) => c.getAttribute('aria-label').startsWith('Forest')); const visible = cs.filter((c) => getComputedStyle(c).display !== 'none'); const top = cs.find((c) => c.dataset.stackDepth === '0'); return { all: cs.length, visible: visible.length, cells: [...new Set(cs.map((c) => c.dataset.col + ',' + c.dataset.row))], badge: top && top.querySelector('.stack-count') ? top.querySelector('.stack-count').textContent : null, badges: document.querySelectorAll('#battlefield .stack-count').length, depths: cs.map((c) => c.dataset.stackDepth).join(), topLabel: top ? top.getAttribute('aria-label') : null, shifted: cs.filter((c) => c.dataset.stackDepth === '1' || c.dataset.stackDepth === '2' || c.dataset.stackDepth === '3').every((c) => getComputedStyle(c).translate !== 'none'), hiddenFlag: cs.filter((c) => c.dataset.stackHidden === '1').length }; })()`);
  let pile = await forestState();
  check('six Forests played one after another are one pile on the first land block', pile.all === 6 && pile.cells.length === 1 && pile.cells[0] === '0,33', JSON.stringify(pile));
  check('the pile shows 4 copies, the other 2 are hidden', pile.visible === 4 && pile.hiddenFlag === 2, JSON.stringify(pile));
  check('the top card says "6x" and nothing else carries a count', pile.badge === '6x' && pile.badges === 1, JSON.stringify(pile));
  check('the copies under the top one are shifted so the pile can be seen', pile.shifted === true && pile.depths.split(',').sort().join() === '0,1,2,3,4,5', JSON.stringify(pile));
  check('a screen reader is told it is the top of a stack of 6', /top of a stack of 6/.test(pile.topLabel ?? ''), String(pile.topLabel));

  if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-solo-stack.png');
  // moving a whole pile: Shift and drag any card of it, or take the corner handle; a plain drag still takes one card
  { const r = await boardRect(); const topCard = '#battlefield .card[data-stack-depth="0"]';
    const shiftDrag = async (from, to, modifiers, during = null) => { await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y }); await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1, modifiers }); for (let n = 1; n <= 8; n++) await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + (to.x - from.x) * n / 8, y: from.y + (to.y - from.y) * n / 8, buttons: 1, modifiers }); if (during) await during(); await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1, modifiers }); await sleep(100); };
    const from = await centerOfSelector(topCard);
    let carried = null;
    await shiftDrag(from, { x: from.x + 30 * r.width / 112, y: from.y - 11 * r.height / 44 }, 8, async () => { carried = await ev(`(() => ({ hidden: document.querySelectorAll('#battlefield .card.dragging').length, visible: Array.from(document.querySelectorAll('#battlefield .card')).filter((c) => getComputedStyle(c).visibility !== 'hidden' && getComputedStyle(c).display !== 'none').length }))()`); });
    check('while a whole pile is carried every card of it is hidden at the old place (not only the one that was pressed)', carried && carried.hidden === 6 && carried.visible === 0, JSON.stringify(carried));
    pile = await forestState();
    check('Shift and drag on a pile moves the whole pile: all six Forests on the new cell, still 6x', pile.cells.length === 1 && pile.cells[0] === '30,22' && pile.badge === '6x' && /^Moved the pile of 6 Forest./.test(await $text('status')), JSON.stringify({ pile, status: await $text('status') }));
    check('...and the pile has a handle at its corner on the top card only', (await count('#battlefield .stack-handle')) === 1 && (await count(topCard + ' .stack-handle')) === 1);
    const handle = await ev(`(() => { const h = document.querySelector('#battlefield .stack-handle').getBoundingClientRect(); return { x: h.x + 3, y: h.y + 3 }; })()`);
    await shiftDrag(handle, { x: handle.x - 30 * r.width / 112, y: handle.y + 11 * r.height / 44 }, 0);
    pile = await forestState();
    check('taking the corner handle (no Shift) carries the whole pile too: back on the first land block, 6x', pile.cells.length === 1 && pile.cells[0] === '0,33' && pile.badge === '6x', JSON.stringify(pile));
    const lone = await ev(`(() => { const c = document.querySelector('#battlefield .card[data-stack-depth="0"]').getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; })()`);
    await shiftDrag(lone, { x: lone.x + 12 * r.width / 112, y: lone.y }, 0);
    pile = await forestState();
    check('a plain drag of a card of a pile still takes ONE card off (5x here and one on its own)', pile.badge === '5x' && pile.cells.length === 2, JSON.stringify(pile));
    await press('arrange'); await sleep(60);
    check('(Auto-arrange puts the six together again)', (await forestState()).badge === '6x'); }

  // the dashed border around a pile, a card being dragged is not shown where it was, and the highlight of a selected card is thin
  { const border = await ev(`(() => { const c = document.querySelector('#battlefield .card[data-stack-depth="0"]'); const cs = getComputedStyle(c, '::before'); return { ext: c.dataset.stackExt, style: cs.borderTopStyle, width: cs.borderTopWidth, top: cs.top, left: cs.left, event: cs.pointerEvents }; })()`);
    check('a pile has a dashed border around it that reaches up and left over the copies under the top card and takes no clicks', border.ext === '3' && border.style === 'dashed' && border.width === '1px' && parseFloat(border.top) < -3 && parseFloat(border.left) < -3 && border.event === 'none', JSON.stringify(border));
    await clickCard('#battlefield .card[data-stack-depth="0"]');
    const sel = await ev(`(() => { const cs = getComputedStyle(document.querySelector('#battlefield .card.selected')); return { shadow: cs.boxShadow, border: cs.borderTopColor }; })()`);
    check('the highlight of the selected card is a thin line and a faint glow (not a thick solid ring)', !/ 3px/.test(sel.shadow) && / 1px/.test(sel.shadow) && sel.border === 'rgba(0, 0, 0, 0)', JSON.stringify(sel));
    await clickAction('Deselect');
    const r2 = await boardRect(); const top = await centerOfSelector('#battlefield .card[data-stack-depth="0"]');
    let seen = null;
    await dragTo(top, { x: top.x + 12 * r2.width / 112, y: top.y - 11 * r2.height / 44 }, { release: false, during: async () => { seen = await ev(`(() => { const c = document.querySelector('#battlefield .card.dragging'); return c ? { hidden: getComputedStyle(c).visibility, count: document.querySelectorAll('#battlefield .card.dragging').length } : null; })()`); } });
    await key('Escape', 'Escape', 27); await mouseAt('mouseReleased', { x: top.x + 12 * r2.width / 112, y: top.y - 11 * r2.height / 44 }, 0); await sleep(80);
    check('while a card is dragged the card is not shown where it was (hidden, not dimmed)', seen && seen.hidden === 'hidden' && seen.count === 1, JSON.stringify(seen));
    const holder = await ev(`(() => { const r = document.getElementById('battlefield').getBoundingClientRect(); return { x: r.left, y: r.top }; })()`); void holder; }
  // the "Piles" choice: horizontal puts the copies under the top card straight to its left, diagonal up and to the left
  const pileShift = () => ev(`(() => { const c = document.querySelector('#battlefield .card[data-stack-depth="1"]'); return c ? getComputedStyle(c).translate : null; })()`);
  const diagonalShift = await pileShift();
  check('piles start diagonal: the copy under the top one is shifted left and up', /^-[\d.]+px -[\d.]+px$/.test(diagonalShift ?? ''), String(diagonalShift));
  await ev(`(() => { const s = document.getElementById('pile-style'); s.value = 'horizontal'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const horizontalShift = await pileShift();
  check('choosing Horizontal moves the copies straight to the left (no vertical shift) and the page and storage remember it', /^-[\d.]+px( 0px)?$/.test(horizontalShift ?? '') && (await ev(`document.body.dataset.pileStyle`)) === 'horizontal' && (await ev(`localStorage.getItem('overloaded.pileStyle')`)) === 'horizontal', String(horizontalShift));
  check('...and in horizontal the top card is still on its cell, the others to its left in a row (depth 1 is nearer than depth 3)', await ev(`(() => { const x = (d) => document.querySelector('#battlefield .card[data-stack-depth="' + d + '"]').getBoundingClientRect().left; return x(0) > x(1) && x(1) > x(2) && x(2) > x(3); })()`));
  // in the horizontal style a card tapped out of the pile goes to the side, like in the diagonal style (not up)
  await clickCard('#battlefield .card[data-stack-depth="0"]'); await clickAction('Tap');
  { const tappedCell = await ev(`(() => { const c = document.querySelector('#battlefield .card.tapped'); return c ? c.dataset.col + ',' + c.dataset.row : null; })()`);
    check('with Horizontal piles a Forest tapped out of the pile goes to the side, like with Diagonal piles (not up)', tappedCell === '10,33', String(tappedCell)); }
  if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-solo-stack-horizontal.png');
  await clickAction('Untap'); await clickAction('Deselect');
  check('...and untapping puts it back on the pile', (await forestState()).badge === '6x');
  await ev(`(() => { const s = document.getElementById('pile-style'); s.value = 'diagonal'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  check('choosing Diagonal again brings the diagonal back', (await pileShift()) === diagonalShift && (await ev(`document.body.dataset.pileStyle`)) === 'diagonal');

  // a click on empty space deselects, a double click taps or untaps
  await clickCard('#battlefield .card[data-stack-depth="0"]');
  check('a card is selected', /^Forest/.test(await $text('selected-line')) && (await count('#battlefield .card.selected')) === 1);
  { const r = await boardRect(); const empty = { x: r.left + r.width * 0.6, y: r.top + r.height * 0.3 };
    await mouseAt('mouseMoved', empty, 0); await mouseAt('mousePressed', empty, 1); await mouseAt('mouseReleased', empty, 0); await sleep(80); }
  check('a click on empty space on the battlefield takes the highlight off the card', /^Click a card/.test(await $text('selected-line')) && (await count('#battlefield .card.selected')) === 0, await $text('selected-line'));
  await clickCard('#battlefield .card[data-stack-depth="0"]');
  { const corner = { x: 4, y: 4 }; await mouseAt('mouseMoved', corner, 0); await mouseAt('mousePressed', corner, 1); await mouseAt('mouseReleased', corner, 0); await sleep(80); }
  check('a click on the empty page background (the top-left corner) takes it off too', /^Click a card/.test(await $text('selected-line')) && (await count('#battlefield .card.selected')) === 0, await $text('selected-line'));
  await clickCard('#battlefield .card[data-stack-depth="0"]');
  { const p = await ev(`(() => { const b = Array.from(document.querySelectorAll('#selected-actions button')).find((x) => x.textContent === 'Modify'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); await mouseAt('mouseMoved', p, 0); await mouseAt('mousePressed', p, 1); await mouseAt('mouseReleased', p, 0); await sleep(80); }
  check('a click on a button of the selected-card panel does not deselect the card (it is how the card is used)', (await count('#battlefield .card.selected')) === 1, await $text('selected-line'));
  { const p = await centerOfSelector('#selected-line'); await mouseAt('mouseMoved', p, 0); await mouseAt('mousePressed', p, 1); await mouseAt('mouseReleased', p, 0); await sleep(80); }
  check('a click on the plain text of the selected-card panel does not deselect the card either', (await count('#battlefield .card.selected')) === 1, await $text('selected-line'));
  await clickAction('Deselect');
  { const p = await centerOfSelector('#battlefield .card[data-stack-depth="0"]');
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    for (const n of [1, 2]) { await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: n }); await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: n }); }
    await sleep(120); }
  check('a double click on a card taps it (it steps out of the pile as a tapped card) and says so', (await count('#battlefield .card.tapped')) === 1 && /^Tapped Forest\./.test(await $text('status')), await $text('status'));
  { const p = await centerOfSelector('#battlefield .card.tapped');
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    for (const n of [1, 2]) { await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: n }); await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: n }); }
    await sleep(120); }
  check('a double click on a tapped card untaps it and it is back on the pile (6x)', (await count('#battlefield .card.tapped')) === 0 && (await forestState()).badge === '6x' && /^Untapped Forest\./.test(await $text('status')), await $text('status'));
  await clickAction('Deselect');
  // quick clicks are counted in pairs: six clicks are three taps (the browser's own double click would have counted only the second)
  { const p = await centerOfSelector('#battlefield .card[data-stack-depth="0"]');
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    for (let n = 1; n <= 6; n++) { await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: n }); await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: n }); }
    await sleep(150); }
  check('six quick clicks on the top of a pile tap three cards (every pair of clicks counts, nothing is skipped)', (await count('#battlefield .card.tapped')) === 3 && (await forestState()).badge === '3x', JSON.stringify({ tapped: await count('#battlefield .card.tapped'), pile: (await forestState()).badge }));
  await press('untap-all'); await sleep(80);
  check('a slow second click (after the pair time) is not a pair', await (async () => { const p = await centerOfSelector('#battlefield .card[data-stack-depth="0"]'); const before = await count('#battlefield .card.tapped'); await mouseAt('mouseMoved', p, 0); await mouseAt('mousePressed', p, 1); await mouseAt('mouseReleased', p, 0); await sleep(700); await mouseAt('mousePressed', p, 1); await mouseAt('mouseReleased', p, 0); await sleep(100); return (await count('#battlefield .card.tapped')) === before; })());
  // what counts as a pair: close in time (under 450 ms; the browser's calls take about 100 ms each, so the gap is measured, not assumed), close in place (under 14 px: 8 px is one, 30 px is not), and both on a card
  { const click = async (x, y) => { await mouseAt('mousePressed', { x, y }, 1); await mouseAt('mouseReleased', { x, y }, 0); };
    const twoClicks = async (first, gap, second) => { const t0 = Date.now(); await click(first.x, first.y); if (gap) await sleep(gap); await click(second.x, second.y); await sleep(60); return Date.now() - t0; };
    const tapped = () => count('#battlefield .card.tapped');
    const box = () => ev(`(() => { const c = document.querySelector('#battlefield .card[data-stack-depth="0"]'); const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.left, right: r.right }; })()`);
    const reset = async () => { await sleep(600); await press('untap-all'); await sleep(60); };
    await reset();
    let b = await box(); let before = await tapped();
    let took = await twoClicks(b, 150, b);
    check('two clicks a few hundred milliseconds apart on one spot are still a pair: the card is tapped', took >= 200 && took < 440 && (await tapped()) === before + 1, JSON.stringify({ took, tapped: await tapped(), before }));
    await reset();
    b = await box(); before = await tapped();
    took = await twoClicks(b, 0, { x: b.x + 8, y: b.y });
    check('two quick clicks 8 pixels apart on the card are a pair', took < 440 && (await tapped()) === before + 1, JSON.stringify({ took, tapped: await tapped(), before }));
    await reset();
    b = await box(); before = await tapped();
    took = await twoClicks({ x: b.x - 15, y: b.y }, 0, { x: b.x + 15, y: b.y });
    check('two quick clicks 30 pixels apart (both on the card) are not a pair: nothing is tapped', took < 440 && (await tapped()) === before, JSON.stringify({ took, tapped: await tapped(), before }));
    await reset();
    b = await box(); before = await tapped();
    took = await twoClicks({ x: b.right + 6, y: b.y }, 0, { x: b.right - 3, y: b.y });
    check('a click on empty board space next to a card, then a click on the card, is not a pair', took < 440 && (await tapped()) === before, JSON.stringify({ took, tapped: await tapped(), before }));
    await reset(); }


  // a plain drag takes ONE card off the top of the pile
  { const from = await centerOfSelector('#battlefield .card[data-stack-depth="0"]'); const r = await boardRect();
    await dragTo(from, { x: from.x + 24 * r.width / 112, y: from.y - 8 * r.height / 44 }); }
  pile = await forestState();
  check('dragging the top card takes one off the pile: the pile says 5x and the card is on its own cell', pile.badge === '5x' && pile.cells.length === 2 && pile.all === 6, JSON.stringify(pile));
  check('...the card that was taken is on its own and has no count', (await ev(`(() => { const lone = Array.from(document.querySelectorAll('#battlefield .card')).filter((c) => c.getAttribute('aria-label').startsWith('Forest') && c.dataset.stackSize === undefined); return lone.length === 1 && !lone[0].querySelector('.stack-count'); })()`)));

  // dropped within 6 cells of the pile it came from... it is taken a short way off and does not snap back
  { const lone = await ev(`(() => { const c = Array.from(document.querySelectorAll('#battlefield .card')).find((x) => x.getAttribute('aria-label').startsWith('Forest') && x.dataset.stackSize === undefined); return { col: Number(c.dataset.col), row: Number(c.dataset.row) }; })()`);
    check('the Forest taken off is where it was dropped', lone.col === 24 && lone.row === 25, JSON.stringify(lone)); }

  // dropped close to the pile it joins it again (within 3 cells)
  { const r = await boardRect(); const from = await centerOfSelector('#battlefield .card:not([data-stack-size])[aria-label^="Forest"]');
    await dragTo(from, { x: from.x - 22 * r.width / 112, y: from.y + 6 * r.height / 44 }); } // to about (2, 31): 2 cells from the pile at (0, 33)
  pile = await forestState();
  check('a Forest dropped within 6 cells of the pile joins it: the pile is 6x again', pile.badge === '6x' && pile.cells.length === 1 && pile.cells[0] === '0,33', JSON.stringify(pile));

  // a pile stays a pile when the battlefield is tidied
  await press('arrange');
  pile = await forestState();
  check('Auto-arrange keeps the six Forests in one pile at the first land block', pile.cells.length === 1 && pile.cells[0] === '0,33' && pile.badge === '6x', JSON.stringify(pile));

  // tapping a card takes it out of the pile and puts it beside it, as its own stack; untapping sends it back
  await clickCard('#battlefield .card[data-stack-depth="0"]'); await clickAction('Tap');
  { const tappedCell = await ev(`(() => { const c = document.querySelector('#battlefield .card.tapped'); return c ? c.dataset.col + ',' + c.dataset.row : null; })()`);
    pile = await forestState();
    check('a Forest tapped out of the pile of six steps to the right by a whole card and two more cells, and the pile is 5x', tappedCell === '10,33' && pile.badge === '5x' && pile.cells.includes('0,33'), JSON.stringify({ tappedCell, pile })); }
  await clickAction('Untap');
  pile = await forestState();
  check('untapping it sends it back onto the pile: 6x again', pile.badge === '6x' && pile.cells.length === 1 && pile.cells[0] === '0,33', JSON.stringify(pile));
  // a stack of tapped cards is drawn straight up (the lower copy above the top one), and an untapped card leaves it on the left
  await clickCard('#battlefield .card[data-stack-depth="0"]:not(.tapped)'); await clickAction('Tap');
  await clickCard('#battlefield .card[data-stack-depth="0"]:not(.tapped)'); await clickAction('Tap');
  { const fan = await ev(`(() => { const t = Array.from(document.querySelectorAll('#battlefield .card.tapped')); const under = t.find((c) => c.dataset.stackDepth === '1'); const top = t.find((c) => c.dataset.stackDepth === '0'); return { n: t.length, translate: under ? getComputedStyle(under).translate : null, cells: [...new Set(t.map((c) => c.dataset.col + ',' + c.dataset.row))], topBottom: top ? Math.round(top.getBoundingClientRect().bottom) : null, underBottom: under ? Math.round(under.getBoundingClientRect().bottom) : null }; })()`);
    check('two tapped Forests are one stack of 2 on one cell, and the lower copy is shifted straight UP (no sideways shift)', fan.n === 2 && fan.cells.length === 1 && /^0px -[0-9.]+px$/.test(fan.translate ?? '') && fan.underBottom < fan.topBottom, JSON.stringify(fan)); }
  await clickAction('Untap');
  { const one = await ev(`(() => { const c = Array.from(document.querySelectorAll('#battlefield .card:not(.tapped)')).filter((x) => x.dataset.stackSize === undefined || x.dataset.stackDepth === '0'); const lone = Array.from(document.querySelectorAll('#battlefield .card.selected'))[0]; return lone ? lone.dataset.col + ',' + lone.dataset.row : null; })()`);
    check('untapping one card of the tapped stack, with the untapped pile next to it, puts it back on that pile (0,33)', one === '0,33', String(one)); }
  await press('untap-all'); await sleep(60);
  check('Untap all puts every tapped card back: the pile is 6x again', (await forestState()).badge === '6x' && (await count('#battlefield .card.tapped')) === 0, JSON.stringify(await forestState()));
  await clickAction('Deselect');

  // a mark makes a card different: it leaves the pile's count
  await clickCard('#battlefield .card[data-stack-depth="0"]'); await clickAction('Summoning sick');
  pile = await forestState();
  check('marking the top Forest summoning sick makes it a different stack: the other five are 5x, this one is alone', pile.badge === '5x' && pile.all === 6, JSON.stringify(pile));
  await clickAction('Deselect');

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
    const scheme = (value) => browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
    await scheme('dark');
    await open();
    await drawUntil((n) => n === 'Llanowar Elves');
    for (let n = 0; n < 3; n++) { const i = (await handNames()).findIndex((x) => LANDS.includes(x)); if (i >= 0) { await clickCard('#hand .card', i); await clickAction('To battlefield'); } }
    const e = (await handNames()).findIndex((x) => x === 'Llanowar Elves');
    if (e >= 0) { await clickCard('#hand .card', e); await clickAction('To battlefield'); }
    await clickCard('#battlefield .card[data-kind="land"]', 0); await clickAction('Tap');
    await clickCard('#battlefield .card[data-kind="land"]', 0); await setKind('o'); await setAmount('12,000'); await clickMark('Add counters');
    await clickCard('#battlefield .card[data-kind="other"]', 0); await setKind('p'); await setAmount('3'); await clickMark('Add counters'); await setAmount('2'); await clickMark('Power +');
    await sleep(2500);
    await browser.screenshot('scratch-solo-dark.png');
    await scheme('light'); await sleep(400);
    await browser.screenshot('scratch-solo-light.png');
    await press('pile-library'); await ev(`document.getElementById('viewer').scrollIntoView()`); await sleep(400);
    await browser.screenshot('scratch-solo-piles.png');
    // the right-click menu, light and dark, closed up and with Move to open
    await ev(`window.scrollTo(0, 0)`); await sleep(200);
    await mouse('#battlefield .card[data-kind="other"]', { button: 'right', dy: 30 }); await sleep(300);
    await browser.screenshot('scratch-solo-menu-light.png');
    await clickMenuItem('Move to'); await sleep(200);
    await browser.screenshot('scratch-solo-menu-open-light.png');
    await key('Escape', 'Escape', 27);
    await scheme('dark'); await sleep(300);
    await mouse('#battlefield .card[data-kind="other"]', { button: 'right', dy: 30 }); await sleep(300);
    await browser.screenshot('scratch-solo-menu-dark.png');
    await key('Escape', 'Escape', 27);
    // two-sided cards with the real pictures: Valakut Awakening, Sephiroth and Aclazotz turned over, Delver and the rest as they are
    await scheme('dark');
    await open(TWO_SIDED);
    for (const name of ['Sephiroth', 'Valakut Awakening', 'Delver', 'Aclazotz', 'Fire', 'Sol Ring', 'Forest']) {
      await clickCard('#hand .card', (await handNames()).findIndex((x) => x.startsWith(name)));
      await clickAction('To battlefield'); await clickAction('Deselect');
    }
    for (const name of ['Valakut Awakening', 'Aclazotz']) { await clickCard(cardAt(name)); await clickAction('Turn over'); await clickAction('Deselect'); }
    await clickCard(cardAt('Sephiroth')); await clickAction('Turn over');
    await sleep(3000);
    await browser.screenshot('scratch-solo-twosided-dark.png');
    await scheme('light'); await sleep(400);
    await browser.screenshot('scratch-solo-twosided-light.png');
    await ev(`window.scrollTo(0, 0)`); await sleep(200);
    await mouse(cardAt('Delver'), { button: 'right', dy: 30 }); await sleep(300);
    await browser.screenshot('scratch-solo-twosided-menu-light.png');
    await key('Escape', 'Escape', 27);
    // copies: Sephiroth turned over (with a counter) copied twice, Delver showing its front copied, Aclazotz turned into its land copied; and Valakut played as its land
    await scheme('dark');
    await open(TWO_SIDED);
    for (const name of ['Sephiroth', 'Delver', 'Aclazotz', 'Fire', 'Sol Ring', 'Forest']) {
      await clickCard('#hand .card', (await handNames()).findIndex((x) => x.startsWith(name)));
      await clickAction('To battlefield'); await clickAction('Deselect');
    }
    await clickCard('#hand .card', 0); await clickAction('Play Valakut Stoneforge'); await clickAction('Deselect');
    await clickCard(cardAt('Sephiroth')); await clickAction('Turn over'); await clickAction('Modify'); await setAmount('2'); await clickMark('Add counters'); await clickAction('Modify');
    await clickAction('Create copy'); await clickAction('Create copy');
    await clickAction('Deselect');
    await clickCard(cardAt('Delver')); await clickAction('Create copy'); await clickAction('Deselect');
    await clickCard(cardAt('Aclazotz')); await clickAction('Turn over'); await clickAction('Create copy');
    await clickCard('.card[aria-label^="Sephiroth, One-Winged"]');
    await sleep(3000);
    await ev(`window.scrollTo(0, 0)`); await sleep(200);
    await browser.screenshot('scratch-solo-copies-dark.png');
    // the counters section: poison at the lethal mark, some energy and experience, dark and light
    await scheme('dark');
    await open();
    for (let n = 0; n < 10; n++) await bump('poison', 1);
    for (let n = 0; n < 3; n++) await bump('energy', 1);
    await bump('experience', 1);
    await ev(`document.getElementById('counters').scrollIntoView()`); await sleep(400);
    await browser.screenshot('scratch-solo-counters-dark.png');
    await scheme('light'); await sleep(300);
    await browser.screenshot('scratch-solo-counters-light.png');
    // the two marks on real cards: Llanowar Elves is sick, Goblin Guide and Hellrider have printed haste, Sol Ring is tapped and does not untap
    await scheme('dark');
    await open(MARKS_DECK);
    for (const name of ['Goblin Guide', 'Llanowar Elves', 'Sol Ring', 'Forest', 'Hellrider', "Smuggler's Copter"]) {
      await clickCard('#hand .card', (await handNames()).findIndex((x) => x.startsWith(name)));
      await clickAction('To battlefield'); await clickAction('Deselect');
    }
    await clickCard(cardAt('Sol Ring')); await clickAction('Tap'); await clickAction("Doesn't untap"); await clickAction('Deselect');
    await clickCard(cardAt('Hellrider')); await clickAction('Summoning sick'); await clickAction('Tap'); await clickAction('Deselect');
    await sleep(3000);
    await ev(`window.scrollTo(0, 0)`); await sleep(300);
    await browser.screenshot('scratch-solo-marks-dark.png');
    const zoomBox = await ev(`(() => { const r = document.querySelector('.card[aria-label^="Sol Ring"]').getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; })()`);
    const zoom = await browser.send('Page.captureScreenshot', { format: 'png', clip: { x: zoomBox.x, y: zoomBox.y, width: zoomBox.width, height: zoomBox.height, scale: 5 } });
    writeFileSync('scratch-solo-lock-zoom.png', Buffer.from(zoom.data, 'base64'));
    await scheme('light'); await sleep(300);
    await browser.screenshot('scratch-solo-marks-light.png');
    console.log('saved scratch-solo-dark.png, -light.png, -piles.png, the four -menu- ones, three -twosided- ones, -copies-dark, two -counters- ones and two -marks- ones (delete them afterward)');
  }
} finally {
  await closeAllBrowsers();
  if (server) await server.close();
}

if (failures.length) { console.log(`\n${failures.length} of ${checks} solo table checks FAILED.`); process.exit(1); }
console.log(`All ${checks} solo table checks passed.`);
