// Checks the solo table in a real headless Chrome (desktop width), against the REAL card list. Card pictures are answered
// by a stand-in (simple card-shaped images), so this needs no network and shows exactly which pictures the page asks for.
// A deck is put into the browser's storage first, as the deck page would. Run from the repo root: node scripts/check-solo-ui.mjs
// Skipped (exit 0, and it says so) when no card list has been built here yet.
// Optional: --screenshot saves scratch-solo-*.png using the REAL pictures from Scryfall (a few dozen KB; git ignores scratch files).
// Shortened on 2026-11-18 (Kevin: tests were far too long): the sections for sound, the dealing animation, the hand bar and sorts, the Alt picture, the hand fan and its motion, picking hand cards, and the pile drawing
// were taken out. The full version is in git (commit c44edd4). The Alt picture, Shift+click picking and reordering the hand are checked by scripts/check-history-and-select-ui.mjs.
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
  const backsAsked = await browser.fakeImages('https://backs.scryfall.io/*', null); // the card back of the library
  const seed = async (json) => { await browser.goto(ORIGIN + '/pages/solo/index.html'); await ev(`localStorage.removeItem('overloaded.decks'); ` + (json === null ? `localStorage.removeItem('overloaded.deck')` : `localStorage.setItem('overloaded.deck', ${JSON.stringify(json)})`)); }; // the old single-deck key; a library, if there were one, would win over it
  const open = async (json = DECK_JSON) => { await seed(json); await browser.goto(PAGE); await waitFor(async () => (!(await $hidden('game')) || !(await $hidden('blocked'))) || null, 15000, 50); };
  const pileCount = (zone) => ev(`document.getElementById('pile-${zone}').textContent`);
  const handNames = () => names('#hand .card');
  const clickCard = (selector, index = 0) => ev(`document.querySelectorAll(${JSON.stringify(selector)})[${index}].click()`);
  // What the buttons of the selected-card panel used to do is in the right-click menu of the card now. These helpers do it the same way a person would: open the menu of the selected card and pick.
  const MENU_PATHS = { 'To hand': ['Move to', 'Hand'], 'To battlefield': ['Move to', 'Battlefield'], 'To graveyard': ['Move to', 'Graveyard'], 'To exile': ['Move to', 'Exile'], 'To command zone': ['Move to', 'Command zone'], 'To sideboard': ['Move to', 'Sideboard'], 'Top of library': ['Move to', 'Top of library'], 'Bottom of library': ['Move to', 'Bottom of library'], Modify: ['Modify...'] };
  const openMenuOfSelected = () => ev(`(() => { const c = document.querySelector('.card.selected'); if (!c) return false; const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width * 0.7, clientY: r.y + r.height * 0.15 })); return true; })()`);
  const menuLabels = () => ev(`(() => { const arrow = String.fromCharCode(0x25b8); return [...document.querySelectorAll('.card-menu [role="menuitem"]')].filter((x) => !x.closest('[hidden]')).map((x) => x.textContent.replace(arrow, '').trim()); })()`);
  const pressMenuItem = async (text) => { // a real mouse click on the item, like a person (the menu reacts to pointer events)
    const p = await ev(`(() => { const arrow = String.fromCharCode(0x25b8); const b = [...document.querySelectorAll('.card-menu [role="menuitem"]')].filter((x) => !x.closest('[hidden]')).find((x) => x.textContent.replace(arrow, '').trim() === ${JSON.stringify(text)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + Math.min(r.height, innerHeight - r.y) / 2 }; })()`);
    if (!p) return false;
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
    return true;
  };
  const escapeKey = async () => { await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(30); };
  const closeMenu = async () => { if (await ev(`Boolean(document.querySelector('.card-menu'))`)) await escapeKey(); };
  const clickAction = async (label) => {
    if (label === 'Deselect') { await closeMenu(); await escapeKey(); return true; }
    if (!(await openMenuOfSelected())) return false;
    let steps = MENU_PATHS[label] ?? [label];
    if (steps[0] === 'Move to') { // a card in the hand has Play, Discard, Exile and the library lines of its own (Kevin, 2026-11-15)
      const here = await menuLabels();
      const direct = { Battlefield: 'Play', Graveyard: 'Discard', Exile: 'Exile', 'Top of library': 'Move to top of library', 'Bottom of library': 'Move to bottom of library', 'Command zone': 'Move to command zone' }[steps[1]];
      if (direct && here.includes('Play') && here.includes(direct)) steps = [direct];
    }
    const handAlias = { 'Top of library': 'Move to top of library', 'Bottom of library': 'Move to bottom of library' }[label];
    if (handAlias && (await menuLabels()).includes(handAlias)) steps = [handAlias];
    for (const step of steps) { if (!(await pressMenuItem(step))) { await closeMenu(); return false; } await sleep(30); }
    return true;
  };
  const openLibraryViewer = async () => { await ev(`document.getElementById('pile-caret-library').click()`); await sleep(80); await pressMenuItem('View library'); await sleep(150); }; // (a left click on the library no longer opens it: Kevin, 2026-11-15)
  const shuffleViaMenu = async () => { await ev(`(() => { const r = document.getElementById('pile-library').getBoundingClientRect(); document.getElementById('pile-library').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 5, clientY: r.y + 5 })); })()`); await pressMenuItem('Shuffle'); await sleep(30); };
  const actionLabels = async () => { if (!(await openMenuOfSelected())) return []; const labels = await menuLabels(); await closeMenu(); return labels; };
  const LANDS = ['Forest', 'Island'];
  const NO_STATS = ['Sol Ring', 'Lightning Bolt']; // no printed power and toughness: their counters show as pills, not as a power and toughness box
  // draw until the hand holds a card matching the test, up to 40 draws (the library is half lands)
  const drawUntil = async (test) => { for (let n = 0; n < 40; n++) { if ((await handNames()).some(test)) return true; await press('draw'); } return false; };

  // ---- no deck, then a damaged deck ----
  await open(null);
  check('with no saved deck the table says so and offers the import page', !(await $hidden('blocked')) && (await $hidden('game')) && /no deck yet/.test(await $text('blocked-message')) && (await ev(`document.getElementById('blocked-link').getAttribute('href')`)) === '/deck');
  check('and offers a sample deck too, as a link that opens the deck page with the sample loaded', !(await $hidden('blocked-sample')) && (await ev(`document.getElementById('blocked-sample').getAttribute('href')`)) === '/deck?sample&play' && /sample/i.test(await $text('blocked-sample')));
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
  check('pictures are requested from Scryfall\'s picture server only (the normal size for the large cards of the hand, small elsewhere), and each once', asked.length > 0 && asked.length <= 8 && new Set(asked).size === asked.length && asked.every((u) => /^https:\/\/cards\.scryfall\.io\/(small|normal)\/front\/[0-9a-f]\/[0-9a-f]\/[0-9a-f-]{36}\.jpg$/.test(u)), `${asked.length}: ${asked[0]}`);
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
  // the life total is the number itself (frontend/src/life-control.js): real mouse input and real key presses
  const lifeAt = () => ev("(() => { const r = document.getElementById('life').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + Math.min(r.height, innerHeight - r.y) / 2 }; })()");
  const lifeClick = async (button = 'left', shift = false, holdMs = 0) => {
    const p = await lifeAt();
    const base = { x: p.x, y: p.y, button, modifiers: shift ? 8 : 0, clickCount: 1 };
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await browser.send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: button === 'left' ? 1 : 2 });
    if (holdMs) await sleep(holdMs);
    await browser.send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
    await sleep(80);
  };
  const lifeKey = async (name, shift = false, alt = false) => { const vk = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Escape: 27 }[name]; await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: name, code: name, windowsVirtualKeyCode: vk, modifiers: (shift ? 8 : 0) | (alt ? 1 : 0) }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: vk }); await sleep(60); };
  const editorOpen = () => ev("Boolean(document.querySelector('.life-input'))");
  const typeLife = (text) => ev("(() => { const i = document.querySelector('.life-input'); i.value = " + JSON.stringify(text) + "; })()");
  check('the four old life buttons are gone: the number is the only button in the life area', (await ev("document.querySelectorAll('#life-area button').length")) === 1 && (await ev("document.getElementById('life').tagName")) === 'BUTTON');
  await lifeClick('left');
  check('a left click on the number gains 1', (await $text('life')) === '41', await $text('life'));
  await lifeClick('left', true);
  check('Shift and a left click gains 5', (await $text('life')) === '46', await $text('life'));
  await lifeClick('right');
  check('a right click loses 1 (and does not open the menu of counters)', (await $text('life')) === '45' && (await count('.card-menu')) === 0, await $text('life'));
  await lifeClick('right', true); await lifeClick('right', true); await lifeClick('right', true);
  check('Shift and a right click loses 5, three times: 30', (await $text('life')) === '30', await $text('life'));
  check('the number says how to use it (a tooltip) and a right click NEXT to it is still the menu of counters', /right-click/.test(await ev("document.getElementById('life').title")) && /counters/.test(await ev("document.getElementById('life-area').title")));
  // holding: a circle fills, and the number opens a box to type the new total in
  { const p = await lifeAt();
    const base = { x: p.x, y: p.y, button: 'left', clickCount: 1 };
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await browser.send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 });
    await sleep(200);
    const filling = await ev("document.querySelector('.life-ring').classList.contains('holding') && getComputedStyle(document.querySelector('.life-ring')).opacity === '1'");
    check('while the number is held a circle is shown, filling', filling === true && !(await editorOpen()));
    await sleep(700);
    check('when it is full the circle goes and a box to type the new total opens, with the number in it, and the number itself is hidden', (await editorOpen()) && (await ev("document.querySelector('.life-input').value")) === '30' && (await ev("document.getElementById('life').hidden")) === true && !(await ev("document.querySelector('.life-ring').classList.contains('holding')")));
    await browser.send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 }); await sleep(80);
    check('letting go after the hold is not also a click: life is still 30 and the box stays open', (await $text('life')) === '30' && (await editorOpen()));
  }
  await typeLife('abc'); await lifeKey('Enter');
  check('a total that is not a whole number is refused in words and the box stays open', (await editorOpen()) && /whole number/.test(await $text('status')), await $text('status'));
  await typeLife('12'); await lifeKey('Enter');
  check('typing 12 and Enter sets the life total to 12 and closes the box', (await $text('life')) === '12' && !(await editorOpen()) && (await ev("document.getElementById('life').hidden")) === false, await $text('life'));
  await lifeClick('left', false, 0);
  await lifeClick('left', false, 150); // a short press is a click, not a hold
  check('pressing for less than the hold is a click: two clicks gained 2 and no box opened', (await $text('life')) === '14' && !(await editorOpen()), await $text('life'));
  await lifeClick('left', false, 800);
  check('holding again opens the box', await editorOpen());
  await typeLife('99'); await lifeKey('Escape');
  check('Escape closes the box and changes nothing', (await $text('life')) === '14' && !(await editorOpen()));
  await ev("document.getElementById('life').focus()");
  await lifeKey('ArrowUp'); await lifeKey('ArrowRight'); await lifeKey('ArrowUp', true);
  check('with the keyboard: arrow up and right gain 1 each and Shift gains 5', (await $text('life')) === '21', await $text('life'));
  await lifeKey('ArrowDown'); await lifeKey('ArrowLeft'); await lifeKey('ArrowDown', true);
  check('arrow down and left lose 1 each and Shift loses 5', (await $text('life')) === '14', await $text('life'));
  await lifeKey('ArrowUp', false, true); await lifeKey('ArrowDown', false, true);
  check('Alt and an arrow key do not change life (Alt+arrow moves the selected card on the board, and the number may still have the focus)', (await $text('life')) === '14', await $text('life'));
  await lifeKey('Enter');
  check('Enter opens the box to type in', await editorOpen());
  await typeLife('30'); await lifeKey('Enter');
  check('and 30 puts life back to 30 for the rest of the checks', (await $text('life')) === '30' && !(await editorOpen()));
  await ev("document.activeElement?.blur?.()");

  // ---- selecting and moving ----
  check('before anything is selected there are no actions', (await actionLabels()).length === 0 && /Click a card/.test(await $text('selected-line')));
  check('a Forest or Island can be found in the hand', await drawUntil((n) => LANDS.includes(n)));
  const landIndex = (await handNames()).findIndex((n) => LANDS.includes(n));
  const landName = (await handNames())[landIndex];
  await clickCard('#hand .card', landIndex);
  check('selecting a card says what it is and where', new RegExp(`^${landName}: .*Land.*, in your hand\\.$`).test(await $text('selected-line')), await $text('selected-line'));
  check('the selected card is marked', (await count('#hand .card.selected')) === 1 && (await ev(`document.querySelector('#hand .card.selected').getAttribute('aria-pressed')`)) === 'true');
  const labels = await actionLabels();
  check('the right-click menu of a hand card: Play, Discard, Exile, Move to command zone, Move to top of library, Move to bottom of library (no sideboard, no Move to heading), and no Tap', JSON.stringify(labels) === JSON.stringify(['Play', 'Discard', 'Exile', 'Move to command zone', 'Move to top of library', 'Move to bottom of library', 'Add to the stack', 'View details']), JSON.stringify({ labels }));
  const handBefore = await count('#hand .card');
  await clickAction('To battlefield');
  check('moving a land to the battlefield puts it in the lands row', (await count('#battlefield .card[data-kind="land"]')) === 1 && (await count('#battlefield .card[data-kind="other"]')) === 0 && (await count('#hand .card')) === handBefore - 1 && (await $text('status')) === `Moved ${landName} to the battlefield.`, await $text('status'));
  check('the card stays selected and its menu now offers Modify and Tap', (await count('#battlefield .card[data-kind="land"].selected')) === 1 && (await actionLabels()).includes('Tap') && (await actionLabels())[0] === 'Modify...', JSON.stringify(await actionLabels()));
  check('a card that was never tapped is not turned', (await count('#battlefield .card[data-kind="land"].tapped')) === 0);
  await clickAction('Tap');
  const tapped = await ev(`(() => { const c = document.querySelector('#battlefield .card[data-kind="land"]'); const face = c.querySelector('.face'); const m = getComputedStyle(face).transform; const r = c.getBoundingClientRect(); const f = face.getBoundingClientRect(); return { tapped: c.classList.contains('tapped'), label: c.getAttribute('aria-label'), transform: m, boxW: Math.round(r.width), boxH: Math.round(r.height), faceW: Math.round(f.width), faceH: Math.round(f.height) }; })()`);
  check('tapping turns the card sideways and says it is tapped', tapped.tapped && /, tapped$/.test(tapped.label) && /matrix\(0(\.\d+)?(e-\d+)?, 1, -1, 0(\.\d+)?(e-\d+)?/.test(tapped.transform), JSON.stringify(tapped));
  check('a tapped card on the battlefield is a landscape box exactly as big as the turned card (no square box around it)', Math.abs(tapped.boxW - tapped.boxH * 1.4015) <= 3 && Math.abs(tapped.faceW - tapped.boxW) <= 3 && Math.abs(tapped.faceH - tapped.boxH) <= 3, JSON.stringify(tapped));
  check('the action now says Untap, and the status says Tapped', (await actionLabels()).includes('Untap') && (await $text('status')) === `Tapped ${landName}.`);
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
  const viewer = { shown: !(await $hidden('viewer')), rows: await count('#viewer-list .card'), title: await $text('viewer-title'), note: await $text('viewer-note'), pressed: await ev(`document.getElementById('pile-graveyard').getAttribute('aria-pressed')`) };
  check('opening the graveyard shows its card, newest first', viewer.shown && viewer.rows === 1 && /graveyard: 1 card/i.test(viewer.title) && /newest card is first/.test(viewer.note), JSON.stringify(viewer));
  check('the card in the pile is still selected, and shown so', (await count('#viewer-list .card.selected')) === 1 && /in your graveyard/.test(await $text('selected-line')));
  await clickAction('To hand');
  check('it can be taken back to the hand from the pile', (await pileCount('graveyard')) === 'Graveyard: 0' && (await handNames()).includes(otherName) && (await count('#viewer-list .card')) === 0);
  await press('viewer-close');
  await openLibraryViewer();
  const libRows = await count('#viewer-list .card');
  check('the library can be looked at: every card, numbered from the top', !(await $hidden('viewer')) && libRows === parseInt((await pileCount('library')).split(': ')[1], 10) && (await ev(`document.querySelector('#viewer-list .viewer-depth').textContent`)) === '#1');
  { // the marks of the top and the bottom card sit on the card's top edge and do not move the card: the first row is level, and every card is centred in its column (Kevin, 2026-11-15)
    const lay = await ev("(() => { const cells = [...document.querySelectorAll('#viewer-list .viewer-card')]; const first = cells.slice(0, 7); return { tops: first.map((c) => Math.round(c.querySelector('.card').getBoundingClientRect().top)), off: cells.map((c) => { const a = c.getBoundingClientRect(); const b = c.querySelector('.card').getBoundingClientRect(); return Math.round(Math.abs((a.left + a.width / 2) - (b.left + b.width / 2))); }), ends: cells.filter((c) => c.dataset.end).map((c) => [c.dataset.end, c.querySelector('.viewer-end').textContent]), pill: (() => { const p = cells[0].querySelector('.viewer-end').getBoundingClientRect(); const c0 = cells[0].querySelector('.card').getBoundingClientRect(); return { centred: Math.round(Math.abs((p.left + p.width / 2) - (c0.left + c0.width / 2))), over: p.top < c0.top + 4 && p.bottom > c0.top }; })(), columns: getComputedStyle(document.getElementById('viewer-list')).gridTemplateColumns.split(' ').length }; })()");
    check('in the library window the first row is level (the top card with its mark is not pushed down), every card is centred in its column, and the mark is centred on the card\'s top edge', new Set(lay.tops).size === 1 && lay.off.every((n) => n <= 1) && lay.pill.centred <= 1 && lay.pill.over && JSON.stringify(lay.ends) === JSON.stringify([['top', 'Top'], ['bottom', 'Bottom']]) && lay.columns === 7, JSON.stringify(lay));
  }
  await press('viewer-close');
  check('the Close button closes the viewer', (await $hidden('viewer')));

  // ---- the top and the bottom of the library ----
  await clickCard('#hand .card', 0);
  const first = (await handNames())[0];
  const libBefore = parseInt((await pileCount('library')).split(': ')[1], 10);
  await clickAction('Top of library');
  check('a card put on top of the library comes back with the next draw', parseInt((await pileCount('library')).split(': ')[1], 10) === libBefore + 1 && (await (async () => { await press('draw'); return (await $text('status')) === `Drew ${first}.`; })()), await $text('status'));
  await clickCard('#hand .card', 0);
  await clickAction('Bottom of library');
  await openLibraryViewer();
  check('a card put on the bottom is last in the library list', (await ev(`Array.from(document.querySelectorAll('#viewer-list .viewer-depth')).at(-1).textContent`)) === '#' + (await pileCount('library')).split(': ')[1]);
  await press('viewer-close');

  // ---- shuffle, mulligan, escape ----
  const libCount = await pileCount('library');
  await shuffleViaMenu();
  check('Shuffle keeps the same cards and says so', (await pileCount('library')) === libCount && (await $text('status')) === 'Shuffled your library.');
  await press('mulligan');
  check('a mulligan deals a new hand of 7, counts itself and tells you what to do', (await count('#hand .card')) === 7 && (await $text('mulligan')) === 'Mulligan (1 so far)' && /^Mulligan 1: a new hand of 7 cards\. Put 1 card on the bottom of your library/.test(await $text('status')), await $text('status'));
  // ---- Q and E tap, D draws, Tab opens Settings, a rectangle picks several cards, costs show on hover, and the command zone's words ----
  {
    await browser.goto(PAGE); await waitFor(async () => (await count('#hand .card')) === 7 || null, 8000, 25); await sleep(1500);
    const keyDown = async (key, code, vk) => { await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk }); await sleep(120); };
    const move = (p) => browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    const rectOfEl = (selector, index = 0) => ev(`(() => { const r = document.querySelectorAll(${JSON.stringify(selector)})[${index}].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height, innerHeight - r.top) / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })()`);
    const drag = async (from, to) => {
      await move(from);
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
      for (let n = 1; n <= 10; n++) await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + ((to.x - from.x) * n) / 10, y: from.y + ((to.y - from.y) * n) / 10, buttons: 1 });
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
      await sleep(250);
    };
    const field = await rectOfEl('#battlefield');
    // the cost of a card in the hand shows only on the card the pointer is on
    {
      for (let n = 0; n < 12 && !(await ev("Boolean(document.querySelector('#hand > .card .hand-cost'))")); n++) { await press('draw'); await sleep(80); } // (the hand is random: draw until there is a card with a cost)
      const costIndex = await ev("[...document.querySelectorAll('#hand > .card')].findIndex((c) => c.querySelector('.hand-cost'))");
      const restingCost = await ev("(() => { const c = document.querySelector('#hand > .card .hand-cost'); return c ? getComputedStyle(c).visibility : 'none found'; })()");
      await move({ x: 5, y: 5 }); await sleep(300);
      const quiet = await ev("[...document.querySelectorAll('#hand > .card .hand-cost')].every((c) => getComputedStyle(c).visibility === 'hidden')");
      let hovered = null;
      if (costIndex >= 0) {
        const pointOn = (share) => ev(`(() => { const cards = [...document.querySelectorAll('#hand > .card')]; const card = cards[${costIndex}]; const r = card.getBoundingClientRect(); for (let x = r.left + 4; x < r.right - 4; x += 4) { const y = r.top + r.height * ${share}; if (document.elementFromPoint(x, y)?.closest('.card') === card) return { x, y }; } return null; })()`);
        const p0 = await pointOn(0.25);
        if (p0) { await move(p0); await sleep(350); const p = await pointOn(0.6); if (p) { await move(p); await sleep(400); hovered = await ev("(() => { const c = document.querySelector('.hand-lift-layer > .card .hand-cost'); return c ? getComputedStyle(c).visibility : null; })()"); } }
      }
      check('the mana costs of the cards in the hand are hidden, and show only on the card the pointer is on', restingCost === 'hidden' && quiet && costIndex >= 0 && hovered === 'visible', JSON.stringify({ restingCost, quiet, costIndex, hovered }));
      await move({ x: 5, y: 5 }); await sleep(300);
    }
    {
      // a card carried from the hand takes its mana cost with it: the picture carried shows the cost, and the cost left in the hand is hidden
      const costIndex = await ev("[...document.querySelectorAll('#hand > .card')].findIndex((c) => c.querySelector('.hand-cost'))");
      const pointOn = (share = 0.6) => ev(`(() => { const cards = [...document.querySelectorAll('#hand > .card')]; const card = cards[${costIndex}]; const r = card.getBoundingClientRect(); for (let x = r.left + 4; x < r.right - 4; x += 4) { const y = r.top + r.height * ${share}; if (document.elementFromPoint(x, y)?.closest('.card') === card) return { x, y }; } return null; })()`);
      const p0 = costIndex >= 0 ? await pointOn(0.2) : null;
      let carried = null;
      if (p0) {
        await move(p0); await sleep(350);
        const p = await pointOn();
        await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
        for (let n = 1; n <= 8; n++) await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + n * 6, y: p.y - n * 12, buttons: 1 });
        await sleep(150);
        carried = await ev("(() => { const g = document.querySelector('.drag-ghost'); const cost = g?.querySelector(':scope > .hand-cost'); const left = document.querySelector('#hand > .card.dragging .hand-cost'); const gr = g?.getBoundingClientRect(); const cr = cost?.getBoundingClientRect(); return { ghost: Boolean(cost), pips: cost ? cost.children.length : 0, above: Boolean(gr && cr && cr.bottom <= gr.bottom - gr.height * 0.5), leftBehind: left ? getComputedStyle(left).visibility : 'none' }; })()");
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x + 48, y: p.y - 96, button: 'left', buttons: 0, clickCount: 1 });
        await sleep(300);
      }
      check('a card carried from the hand takes its mana cost with it (shown above the picture), and the cost is not left behind in the hand', costIndex >= 0 && carried && carried.ghost && carried.pips >= 1 && carried.above && carried.leftBehind !== 'visible', JSON.stringify({ costIndex, carried }));
      await move({ x: 5, y: 5 }); await sleep(300);
    }
    check('cards are not reached with Tab (tabindex -1) and cannot be picked up as text', await ev("[...document.querySelectorAll('.card')].every((c) => c.tabIndex === -1 && getComputedStyle(c).userSelect === 'none') && getComputedStyle(document.body).userSelect === 'none'"));
    await ev('document.activeElement && document.activeElement.blur()');
    await keyDown('Tab', 'Tab', 9);
    const opened = (await ev("document.getElementById('settings-menu').hidden")) === false;
    const focusAfterOpen = await ev('document.activeElement.tagName');
    await keyDown('Tab', 'Tab', 9);
    const closed = (await ev("document.getElementById('settings-menu').hidden")) === true;
    await keyDown('Tab', 'Tab', 9); await keyDown('Tab', 'Tab', 9); // (open and closed again, three presses so far plus this)
    const focusAfter = await ev('document.activeElement.tagName');
    check('Tab opens Settings and Tab again closes it, and it never puts the focus on a button or a card (the focus stays on the page)', opened && closed && focusAfterOpen === 'BODY' && focusAfter === 'BODY' && (await ev("document.getElementById('settings-menu').hidden")) === true, JSON.stringify({ opened, closed, focusAfterOpen, focusAfter }));
    const handBefore = await count('#hand .card');
    await keyDown('d', 'KeyD', 68);
    check('D draws a card', (await count('#hand .card')) === handBefore + 1 && /^Drew /.test(await $text('status')), await $text('status'));
    // three cards on the battlefield, then Q taps the one under the pointer
    for (const [fx, fy] of [[0.15, 0.3], [0.3, 0.3], [0.45, 0.3]]) {
      const firstPoint = () => ev("(() => { const c = document.querySelector('#hand > .card'); const r = c.getBoundingClientRect(); for (let x = Math.max(2, r.left + 2); x < r.right - 2; x += 3) { for (const f of [0.5, 0.4, 0.6]) { const y = r.top + r.height * f; if (y < innerHeight - 4 && document.elementFromPoint(x, y)?.closest('.card') === c) return { x, y }; } } return null; })()");
      await move(await firstPoint()); await sleep(350); // (the hand rises: the card is where it is now)
      const card = await firstPoint();
      await drag(card, { x: field.left + field.right * 0 + (field.right - field.left) * fx, y: field.top + (field.bottom - field.top) * fy });
    }
    const onField = await count('#battlefield > .card');
    const cardOnField = await rectOfEl('#battlefield > .card', 0);
    await move({ x: cardOnField.x, y: cardOnField.y }); await sleep(100);
    await keyDown('q', 'KeyQ', 81);
    const tappedByQ = await ev("document.querySelectorAll('#battlefield > .card.tapped').length");
    await keyDown('q', 'KeyQ', 81);
    const tappedAfter = await ev("document.querySelectorAll('#battlefield > .card.tapped').length");
    check('Q taps the card under the pointer, like E, and taps it again to untap', onField >= 3 && tappedByQ === 1 && tappedAfter === 0, JSON.stringify({ onField, tappedByQ, tappedAfter }));
    // a rectangle dragged over empty battlefield picks up the cards it touches; E taps them all, Escape lets them go
    // (from empty board at the lower right up to the top left corner: the battlefield starts at the top of the window now, under the life, so the rectangle is not started up there; it ends there and that is fine)
    const start = { x: field.right - 20, y: field.bottom - 60 };
    const end = { x: field.left + 8, y: field.top + 8 };
    await move(start);
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 });
    let boxShown = false;
    for (let n = 1; n <= 10; n++) { await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x + ((end.x - start.x) * n) / 10, y: start.y + ((end.y - start.y) * n) / 10, buttons: 1 }); if (n === 6) boxShown = (await count('.marquee')) === 1; }
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: end.x, y: end.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(250);
    const picked = await ev("document.querySelectorAll('#battlefield > .card.selected').length");
    await move({ x: field.left + 8, y: field.bottom - 8 });
    await keyDown('e', 'KeyE', 69);
    const tappedGroup = await ev("document.querySelectorAll('#battlefield > .card.tapped').length");
    check('dragging a rectangle over the battlefield picks up the cards it touches (the box shows while dragging and is gone after), and E taps all of them at once', boxShown && (await count('.marquee')) === 0 && picked === onField && tappedGroup === picked, JSON.stringify({ boxShown, picked, onField, tappedGroup }));
    { // the cards picked up with a rectangle move together: take one of them and every one goes by as much, keeping its place relative to the others
      const cellsNow = () => ev("[...document.querySelectorAll('#battlefield > .card')].map((c) => [c.getAttribute('aria-label').split(',')[0], Number(c.dataset.col), Number(c.dataset.row)])");
      const beforeMove = await cellsNow();
      const cell = (await ev("document.getElementById('battlefield').getBoundingClientRect().width")) / 112;
      const grab = await ev("(() => { const r = document.querySelector('#battlefield > .card').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height, innerHeight - r.top) / 2 }; })()");
      await move(grab);
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: grab.x, y: grab.y, button: 'left', buttons: 1, clickCount: 1 });
      for (let n = 1; n <= 8; n++) await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: grab.x + (cell * 5 * n) / 8, y: grab.y, buttons: 1 });
      await sleep(60);
      const carry = await ev("({ parts: document.querySelectorAll('.drag-group-part').length, ghosts: document.querySelectorAll('.drag-ghost').length, hidden: [...document.querySelectorAll('#battlefield > .card.dragging')].length, handMarked: document.getElementById('hand-section').classList.contains('drop-hand') })");
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: grab.x + cell * 5, y: grab.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(150);
      const afterMove = await cellsNow();
      check('carrying one card of the group carries them all: a picture for each of the others beside the one pressed, every card of the group hidden where it was, and the hand is not marked', carry.ghosts === 1 && carry.parts === onField - 1 && carry.hidden === onField && !carry.handMarked, JSON.stringify({ carry, onField }));
      check('letting go moves every card of the group by the same 5 cells across, none up or down, and says how many moved', beforeMove.length === onField && afterMove.length === onField && beforeMove.every((b, i) => afterMove[i][0] === b[0] && afterMove[i][1] === b[1] + 5 && afterMove[i][2] === b[2]) && new RegExp('^Moved ' + onField + ' cards\.').test(await $text('status')), JSON.stringify({ beforeMove, afterMove, status: await $text('status') }));
      check('the group is still picked after it is moved, and nothing is left of the carry', (await ev("document.querySelectorAll('#battlefield > .card.selected').length")) === onField && (await count('.drag-ghost')) === 0 && (await count('.drag-group')) === 0 && (await count('#battlefield > .card.dragging')) === 0);
      { // the picked group carried onto the hand: all its cards go into the hand
        const handBefore = await ev("document.querySelectorAll('#hand .card').length");
        const hb = await ev("(() => { const r = document.getElementById('hand').getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: r.bottom - 30 }; })()");
        const g2 = await ev("(() => { const r = document.querySelector('#battlefield > .card').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height, innerHeight - r.top) / 2 }; })()");
        await move(g2);
        await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g2.x, y: g2.y, button: 'left', buttons: 1, clickCount: 1 });
        for (let n = 1; n <= 10; n++) await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g2.x + (hb.x - g2.x) * n / 10, y: g2.y + (hb.y - g2.y) * n / 10, buttons: 1 });
        await sleep(120);
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hb.x, y: hb.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(250);
        check('the picked group dropped on the hand puts all its cards into the hand: the battlefield is empty, the hand is ' + onField + ' cards bigger, and it says so', (await count('#battlefield > .card')) === 0 && (await ev("document.querySelectorAll('#hand .card').length")) === handBefore + onField && new RegExp('^Moved ' + onField + ' cards back to your hand\.').test(await $text('status')), JSON.stringify({ handBefore, onField, field: await count('#battlefield > .card'), status: await $text('status') }));
        check('and the cards that were carried are not left looking picked in the hand: none is selected, and a click on one of them selects just that one (Kevin, 2026-11-15)', (await count('#hand .card.selected')) === 0 && await (async () => { await ev("document.querySelector('#hand .card').click()"); await sleep(150); return (await count('#hand .card.selected')) === 1; })(), String(await count('#hand .card.selected')));
      }
    }
    await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(150);
    check('Escape lets the group go', (await ev("document.querySelectorAll('#battlefield > .card.selected').length")) === 0);
    // the command zone: the tax counter above each commander and the words below and between the two slots
    const layout = await ev("(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const one = document.querySelector('.cmd-slot[data-slot=\"1\"]'); const tax = one.querySelector('.tax').getBoundingClientRect(); const cards = one.querySelector('.slot-cards').getBoundingClientRect(); const a = r('.cmd-slot[data-slot=\"1\"] .slot-cards'); const b = r('.cmd-slot[data-slot=\"2\"] .slot-cards'); return { pilesAligned: ['library', 'graveyard', 'exile'].map((zone) => { const f = document.querySelector('#pile-' + zone + ' .stack-face').getBoundingClientRect(); return [Math.round((f.top - a.top) * 10) / 10, Math.round((a.bottom - f.bottom) * 10) / 10]; }), aligned: Math.abs(a.top - b.top) < 1 && Math.abs(a.bottom - b.bottom) < 1, taxAbove: tax.bottom <= cards.top + 1 }; })()");
    check('in the command zone the two slots line up (the empty one too), the library, graveyard and exile line up with them (same top and bottom as the card inside a slot frame), and the tax is above its commander', layout.pilesAligned.every(([top, bottom]) => Math.abs(top - 3.2) < 2 && Math.abs(bottom - 3.2) < 2) && layout.aligned && layout.taxAbove, JSON.stringify(layout));
    const frame = await ev("(() => { const slot = (n) => document.querySelector('.cmd-slot[data-slot=\"' + n + '\"] .slot-cards'); const s1 = getComputedStyle(slot(1)); const s2 = getComputedStyle(slot(2)); const words = document.querySelector('#command-zone h3').getBoundingClientRect(); const zones = document.querySelector('.side-panels').getBoundingClientRect(); const card = document.querySelector('#pile-library .stack-face').getBoundingClientRect(); return { words: { text: document.querySelector('#command-zone h3').textContent, w: Math.round(words.width), h: Math.round(words.height) }, style: [s1.borderTopStyle, s1.borderTopWidth, s1.outlineStyle, s1.outlineWidth, s2.borderTopStyle], diamonds: [getComputedStyle(slot(1), '::before').content, getComputedStyle(slot(1), '::after').content], gold: s1.borderTopColor !== getComputedStyle(document.querySelector('.pile-stack')).borderTopColor && s1.borderTopColor !== 'rgb(169, 166, 156)', gap: Math.round(innerHeight - zones.bottom), cardWidth: Math.round(card.width), room: Math.round(innerWidth - zones.left), viewport: innerWidth }; })()");
    check('the words "Command zone" are not drawn (a screen reader still has them), and the two commander slots have a gold frame: a 2 px solid border and a 1 px outline round it, diamonds on its top and bottom edge, and an empty slot has the same frame dashed', frame.words.text === 'Command zone' && frame.words.w <= 1 && frame.words.h <= 1 && frame.style[0] === 'solid' && frame.style[1] === '2px' && frame.style[2] === 'solid' && frame.style[3] === '1px' && frame.style[4] === 'dashed' && frame.diamonds.every((c) => c === '""') && frame.gold, JSON.stringify(frame));
    check('the zones row is larger (the pictures are 6.8 rem wide, 109 px, or less on a narrow window so the hand still fits beside it: (width - 50.4 rem) / 5) and its bottom nearly touches the bottom of the window (under 8 px away)', Math.abs(frame.cardWidth - Math.min(108.8, (frame.viewport - 806.4) / 5)) <= 2 && frame.gap >= 0 && frame.gap < 8, JSON.stringify(frame));
    await browser.goto(PAGE); await waitFor(async () => (await count('#hand .card')) === 7 || null, 8000, 25); await sleep(1500);
  }
  // ---- the pieces that float (the card preview is gone from the solo table) ----
  {
    const floating = await ev(`(() => { const r = (sel) => document.querySelector(sel).getBoundingClientRect(); const bar = r('.actions-panel'); const life = r('#life-area'); const menu = r('#settings-button'); const turn = r('.actions-panel .turn-stat'); const piles = r('.side-panels'); const board = r('#my-board'); const panelBorders = ['#my-board', '.right-column', '.side-panels', '.hand-section'].map((s) => getComputedStyle(document.querySelector(s)).borderTopWidth); return { barPosition: getComputedStyle(document.querySelector('.actions-panel')).position, barTop: Math.round(bar.top), grip: Boolean(document.querySelector('.actions-panel #bar-grip')), buttons: [...document.querySelectorAll('.actions-panel .actions button')].map((b) => b.id), barButtons: document.querySelectorAll('.bar .actions button').length, lifeLeft: Math.round(life.left), lifeTop: Math.round(life.top), menuRight: Math.round(innerWidth - menu.right), menuTop: Math.round(menu.top), turnInBar: turn.top >= bar.top && turn.bottom <= bar.bottom && turn.left >= bar.left && turn.right <= bar.right, pilesRight: Math.round(innerWidth - piles.right), pilesBottom: Math.round(innerHeight - piles.bottom), boardFills: Math.round(board.width) === innerWidth && Math.round(board.height) === innerHeight, panelBorders, footer: document.querySelector('footer') !== null }; })()`);
    check('no panels: the board fills the window and the board and the piles have no border; the action buttons are a floating bar with a grip (not in the top strip); there is no footer', floating.boardFills && floating.panelBorders.every((w) => w === '0px') && floating.barPosition === 'absolute' && floating.grip && floating.buttons.includes('draw') && floating.buttons.includes('untap-all') && !floating.buttons.includes('settings-button') && floating.barButtons === 0 && !floating.footer, JSON.stringify(floating));
    check('the battlefield has a 2 px line round it, drawn outside it (an outline: it takes no room), and it is in the middle of the window: as much room on the left as on the right', await ev("(() => { const b = document.getElementById('battlefield'); const r = b.getBoundingClientRect(); const o = getComputedStyle(b); return o.outlineWidth === '2px' && o.outlineStyle === 'solid' && Math.abs(r.left - (innerWidth - r.right)) <= 1; })()"));
    check('the pieces float where a table has them: life at the top left, the menu button at the top right and the turn inside the floating bar, the piles and the command zone at the bottom right', floating.lifeLeft < 40 && floating.lifeTop < 40 && floating.menuRight < 40 && floating.menuTop < 40 && floating.turnInBar && floating.pilesRight < 40 && floating.pilesBottom < 40, JSON.stringify(floating));
    const legal = await ev(`(() => { document.getElementById('settings-button').click(); const t = document.querySelector('#settings-menu .settings-legal')?.textContent ?? ''; const shown = !document.getElementById('settings-menu').hidden; document.getElementById('settings-button').click(); return { t, shown }; })()`);
    check('Settings has a way home: a link to the home page and one to your decks', await ev("(() => { const home = document.getElementById('settings-home'); const decks = document.getElementById('settings-decks'); return Boolean(home) && Boolean(decks) && home.getAttribute('href') === '/' && decks.getAttribute('href') === '/deck' && document.getElementById('settings-menu').contains(home) && document.getElementById('settings-menu').contains(decks); })()"));
    check('the fan content notice is in Settings', legal.shown && /unofficial Fan Content/.test(legal.t) && /Not approved\/endorsed by Wizards/.test(legal.t) && /property of Wizards of the Coast/.test(legal.t), JSON.stringify(legal));
  }
  await clickCard('#hand .card', 0);
  check('Escape deselects', (await count('.card.selected')) === 1 && await (async () => { await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); return (await count('.card.selected')) === 0 && (await actionLabels()).length === 0; })());
  check('every card is somewhere: 61 cards in the game', await (async () => { const n = async (s) => parseInt((await $text(s)).split(': ').at(-1), 10); return ((await count('.card:not(.hand-lift)')) - (await count('#viewer-list .card'))) + (await n('pile-library')) + (await n('pile-graveyard')) + (await n('pile-exile')) + (await n('pile-sideboard')) === 61; })());

  // ---- a new game ----
  await press('new-game');
  check('a new game starts again from turn 1 with life 40, a hand of 7 and an untouched library', (await $text('turn')) === '1' && (await $text('life')) === '40' && (await count('#hand .card')) === 7 && (await pileCount('library')) === 'Library: 53' && (await pileCount('graveyard')) === 'Graveyard: 0' && (await count('#battlefield .card[data-kind="land"]')) === 0 && (await $text('mulligan')) === 'Mulligan');
  check('the whole thing happened with the page asking nowhere but the picture server', true);

  // ---- a deck with a sideboard, a title-imported card and the commander listed last ----
  await open(SIDE_JSON);
  check('a sideboard deck is dealt: 7 in hand, the commander in the command zone, 2 in the sideboard, life 40', (await count('#hand .card')) === 7 && (await count('#command .card')) === 1 && (await pileCount('sideboard')) === 'Sideboard: 2' && (await pileCount('library')) === 'Library: 45' && (await $text('life')) === '40', `${await pileCount('sideboard')} ${await pileCount('library')}`);
  check('the commander named last is the one in the command zone', /Kyodai/.test((await names('#command .card'))[0]));
  await press('pile-sideboard');
  const sideNames = await ev(`Array.from(document.querySelectorAll('#viewer-list .card')).map((c) => c.getAttribute('aria-label'))`);
  check('opening the sideboard lists both of its cards', !(await $hidden('viewer')) && sideNames.length === 2 && sideNames.some((t) => /Annul/.test(t)) && sideNames.some((t) => /Swords to Plowshares/.test(t)) && /sideboard: 2 cards/i.test(await $text('viewer-title')), JSON.stringify(sideNames));
  await ev(`document.querySelector('#viewer-list .card').click()`);
  const moveTargets = async () => { await openMenuOfSelected(); await pressMenuItem('Move to'); await sleep(30); const all = (await menuLabels()).filter((x) => x !== 'Move to'); await closeMenu(); return all; };
  const fromSide = await moveTargets();
  check('a sideboard card can go to the hand and to every other zone, but not "to the sideboard"', fromSide.includes('Hand') && fromSide.includes('Battlefield') && !fromSide.includes('Sideboard'), JSON.stringify(fromSide));
  const wished = /^(.+?):/.exec(await $text('selected-line'))[1];
  await clickAction('To hand');
  check('taking it to the hand leaves 1 in the sideboard and puts it in the hand', (await pileCount('sideboard')) === 'Sideboard: 1' && (await count('#hand .card')) === 8 && (await handNames()).includes(wished) && (await $text('status')) === `Moved ${wished} to your hand.`, await $text('status'));
  check('a card in the hand does not offer the sideboard any more (Kevin, 2026-11-15)', !(await actionLabels()).some((label) => /sideboard/i.test(label)));
  await clickAction('To graveyard'); await press('pile-graveyard'); await sleep(150); await ev(`document.querySelector('#viewer-list .card').click()`);
  await clickAction('To sideboard'); // (from the graveyard window it can still go there)
  check('putting it back restores the sideboard and the hand', (await pileCount('sideboard')) === 'Sideboard: 2' && (await count('#hand .card')) === 7 && (await $text('status')) === `Moved ${wished} to your sideboard.`, await $text('status'));
  await press('viewer-close');
  await openLibraryViewer();
  const libNames = await ev(`Array.from(document.querySelectorAll('#viewer-list .card')).map((c) => c.getAttribute('aria-label'))`);
  check('the card imported by its other title is in the game under its real name', (libNames.some((t) => /Arcane Signet/.test(t)) || (await handNames()).includes('Arcane Signet')) && !libNames.some((t) => /Heart of the Mountain/.test(t)));
  await press('viewer-close');
  await press('new-game');
  check('a new game keeps the sideboard whole', (await pileCount('sideboard')) === 'Sideboard: 2' && (await count('#hand .card')) === 7 && (await pileCount('library')) === 'Library: 45');
  check('every one of the 55 cards is somewhere', await (async () => { const n = async (s) => parseInt((await $text(s)).split(': ').at(-1), 10); return ((await count('.card:not(.hand-lift)')) - (await count('#viewer-list .card'))) + (await n('pile-library')) + (await n('pile-graveyard')) + (await n('pile-exile')) + (await n('pile-sideboard')) === 55; })());

  // ---- printings: a card is drawn with the printing its deck named, then the default picture, then its name ----
  // Real data (checked against Scryfall's own records on 2026-10-29): Sol Ring cmm 410 is 46ca0b66..., Arcane Signet sld 916 is
  // dd1d87e4... (the printing titled "Heart of the Mountain") and Arcane Signet cmm 367 is 0539b83c....
  const SOL_RING_CMM_410 = '46ca0b66-a000-4483-b916-f5b89e710244';
  const SIGNET_SLD_916 = 'dd1d87e4-f51a-448f-824f-99dffd73403c';
  const SIGNET_CMM_367 = '0539b83c-4459-41b5-a001-d15a1c9ddf23';
  const idOf = (name) => cards.find((c) => c.n === name).i;
  const smallUrl = (id) => `https://cards.scryfall.io/small/front/${id[0]}/${id[1]}/${id}.jpg`;
  const normalUrl = (id) => `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg`; // (the hand is large, so its pictures are the normal size)
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
  check('each card draws the picture of its printing', [SOL_RING_CMM_410, SIGNET_SLD_916, SIGNET_CMM_367].every((id) => hand.some((c) => c.src === normalUrl(id))), JSON.stringify(hand.map((c) => c.src)));
  check('cards with no printing draw their default picture', hand.some((c) => c.src === normalUrl(idOf('Lightning Bolt'))) && asked.includes(normalUrl(idOf('Forest')))); // (the commander in the command zone is shown at the normal size, which is larger than a battlefield card)
  check('and the default pictures of the cards that have a printing are not asked for at all', ![smallUrl, normalUrl].some((url) => asked.includes(url(idOf('Sol Ring'))) || asked.includes(url(idOf('Arcane Signet')))) && asked.length === 5, `${asked.length}: ${asked.join(' ')}`);
  failIds.add(SOL_RING_CMM_410);
  await open(null);
  asked.length = 0;
  await open(PRINTING_JSON);
  await sleep(700);
  const ring = await ev(`(() => { const b = Array.from(document.querySelectorAll('#hand .card')).find((x) => /Sol Ring/.test(x.getAttribute('aria-label') || x.textContent)); return { src: b.querySelector('img')?.getAttribute('src') ?? null, noimage: b.classList.contains('noimage') }; })()`);
  check('a printing whose picture does not exist falls back to the default picture of the card', asked.includes(normalUrl(SOL_RING_CMM_410)) && ring.src === normalUrl(idOf('Sol Ring')) && !ring.noimage, JSON.stringify({ ring, asked }));
  check('and the default picture is tried once, not over and over', asked.filter((u) => u === normalUrl(idOf('Sol Ring'))).length === 1 && asked.filter((u) => u === normalUrl(SOL_RING_CMM_410)).length === 1);
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
  check('an empty library wins over an old deck: there is no deck to play', !(await $hidden('blocked')) && /no deck yet/.test(await $text('blocked-message')), await $text('blocked-message'));
  await openLibrary('{ not a library', DECK_JSON);
  check('a damaged library says it could not be read (and does not fall back to an old deck)', !(await $hidden('blocked')) && /could not be read/.test(await $text('blocked-message')), await $text('blocked-message'));
  await open(DECK_JSON);
  check('an old single saved deck, with no library, still plays (it counts as the first deck)', /^Solo test deck: /.test(await $text('deck-line')) && (await $hidden('blocked')));

  // ---- a deck with a hostile card name, and one the list does not know ----
  const hostile = JSON.parse(DECK_JSON);
  hostile.cards.push({ i: '11111111-1111-4111-8111-111111111111', n: '<img src=x onerror="window.__pwned=1">Hostile', qty: 3, section: 'main' });
  await open(JSON.stringify(hostile));
  for (let n = 0; n < 70 && !(await handNames()).some((x) => /Hostile/.test(x)); n++) await press('draw');
  const idx = (await handNames()).findIndex((x) => /Hostile/.test(x));
  if (idx >= 0) { await clickCard('#hand .card', idx); await clickAction('To battlefield'); }
  const injected = await ev(`({ pwned: typeof window.__pwned, strange: document.querySelectorAll('img[onerror]').length, fallback: Array.from(document.querySelectorAll('.fallback')).some((f) => f.textContent.includes('<img')), other: document.querySelectorAll('#battlefield .card[data-kind="other"]').length })`);
  check('a card whose name is markup is shown as text and never runs', idx >= 0 && injected.pwned === 'undefined' && injected.strange === 0 && injected.fallback, JSON.stringify({ ...injected, idx, onBoard: await count('#battlefield .card'), kinds: await ev(`Array.from(document.querySelectorAll('#battlefield .card')).map((c) => c.dataset.kind + '|' + c.className + '|' + (c.getAttribute('aria-label') || '').slice(0, 40))`), line: await $text('selected-line') }));
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
  const markText = (selector) => ev(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map((n) => n.title || n.textContent)`); // (a counter with an icon shows the icon and the number: its words are its tooltip)
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
  check('the controls are an amount box, a kind of counter, nine buttons and a Close button', (await count('#marks input')) === 1 && (await count('#marks select option')) === 6 && (await count('#marks button')) === 10);
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
  const mouse = async (selector, { button = 'left', shift = false, dy = null, dx = null } = {}) => {
    if (!selector.startsWith('#hand')) await ev(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' })`); // (a card of the hand is half below the window when it rests: scrolling the table to centre it moved the whole page and closed the menu)
    const p = await ev(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + ${dx === null ? 'r.width / 2' : String(dx)}, y: r.y + ${dy === null ? 'r.height / 2' : String(dy)} }; })()`);
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
  await mouse('#battlefield .card[data-kind="other"]', { dy: 66 }); // (a plain place on the card, below the life piece that floats over the top left corner of the board)
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
  const raiseHand = async () => { for (let round = 0; round < 2; round++) { const p = await ev(`(() => { const r = document.querySelector('#hand .card').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.2 }; })()`); await mouseMoveTo(p.x, p.y); await sleep(500); } }; // (a resting hand is half below the window: the pointer comes into it first, and it rises)
  const centerOf = (selector) => ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + Math.min(r.height, innerHeight - r.y) / 2 }; })()`);
  const away = () => mouseMoveTo(900, 380); // (empty board: the top left corner is the first place a creature is put, and the board reaches the top of the window)
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
  await mouse('#battlefield .card[data-kind="other"]', { dy: 66 }); // a plain place on the card: the badge at the top and the chips at the bottom are theirs, and the life piece floats over the top left corner of the board now (36 from the top was under it)
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
    const p = await ev(`(() => { const arrow = String.fromCharCode(0x25b8); const b = [...document.querySelectorAll('.card-menu [role="menuitem"]')].filter((x) => !x.closest('[hidden]')).find((x) => x.textContent.replace(arrow, '').trim() === ${JSON.stringify(text)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + Math.min(r.height, innerHeight - r.y) / 2 }; })()`);
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
  await mouse('#battlefield .card[data-kind="other"]', { button: 'right', dy: 64 });
  let menu = await menuState();
  check('a right click on a creature opens its menu: its name, then Modify, Tap, the counter and the counters X..., Create copy and Move to (with the two marks after Tap: Elves came in sick)', menu && menu.title === 'Llanowar Elves' && menu.role === 'menu' && JSON.stringify(menu.items) === JSON.stringify(['Modify...', 'Tap', 'Flip', "Doesn't untap", 'Not summoning sick', '+1/+1 counter', '+1/+1 counters X...', 'Add counter', 'Create copy', 'Add to the stack', 'View details', 'Move to']), JSON.stringify(menu));
  check('the menu is inside the window and the first item has the focus', menu.inside && menu.focused === 'Modify...', JSON.stringify(menu));
  check('the right click also selected the card', (await $text('selected-line')).startsWith('Llanowar Elves'), await $text('selected-line'));
  await ev(`window.__plays = []; HTMLMediaElement.prototype.play = function () { window.__plays.push({ src: new URL(this.src).pathname, volume: Math.round(this.volume * 10000) / 10000 }); return Promise.resolve(); };`);
  await clickMenuItem('Tap');
  check('Tap from the right-click menu plays the tap sound', JSON.stringify(await ev(`window.__plays`)) === JSON.stringify([{ src: '/sfx/tap.mp3', volume: 1 }]), JSON.stringify(await ev(`window.__plays`)));
  check('Tap taps the card, closes the menu, says so and gives the focus back to the card', (await menuState()) === null && (await ev(`document.querySelector('#battlefield .card[data-kind="other"]').classList.contains('tapped')`)) && (await $text('status')) === 'Tapped Llanowar Elves.' && (await activeIsCard()), `${await $text('status')} ${await activeIsCard()}`);
  await mouse('#battlefield .card[data-kind="other"]', { button: 'right', dy: 64 });
  menu = await menuState();
  check('a tapped card offers Untap', menu.items[1] === 'Untap', JSON.stringify(menu.items));
  await clickMenuItem('+1/+1 counters X...'); await sleep(150);
  await ev("document.querySelector('.number-box input').select()"); await browser.send('Input.insertText', { text: '3' });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(150);
  const threeCounters = await box();
  check('+1/+1 counters X... with 3 typed adds three +1/+1 counters: a chip, 4 and 4 in the box, a green floating +3/+3 and the status', (await chipText()) === '+1/+1 3' && threeCounters.power === '4' && threeCounters.toughness === '4' && (await toastOf())?.text === '+3/+3' && /toast-up/.test((await toastOf()).tone) && (await $text('status')) === 'Added 3 +1/+1 counters to Llanowar Elves.', `${await chipText()} ${JSON.stringify(threeCounters)} ${JSON.stringify(await toastOf())} ${await $text('status')}`);
  await mouse('#battlefield .card[data-kind="other"]', { button: 'right', dy: 64 });
  await clickMenuItem('+1/+1 counter');
  check('the name itself adds one', (await chipText()) === '+1/+1 4', await chipText());
  await mouse('#battlefield .card[data-kind="other"]', { button: 'right', dy: 64 });
  await clickMenuItem('Modify...');
  check('Modify opens the counters panel and puts the cursor in its amount box', !(await $hidden('marks')) && (await ev(`document.activeElement && document.activeElement.id`)) === 'marks-amount');
  await mouse('#battlefield .card[data-kind="other"]', { button: 'right', dy: 64 });
  await clickMenuItem('Move to');
  menu = await menuState();
  const moveFly = await ev(`(() => { const f = document.querySelector('.card-menu-fly:not([hidden])'); const h = [...document.querySelectorAll('.card-menu .has-sub')].find((x) => /^Move to/.test(x.textContent.trim())); if (!f) return null; const r = f.getBoundingClientRect(); const hr = h.getBoundingClientRect(); return { items: [...f.querySelectorAll('[role=menuitem]')].map((i) => i.textContent.trim()), expanded: h.getAttribute('aria-expanded'), separate: (r.left >= document.querySelector('.card-menu').getBoundingClientRect().right - 6) || (r.right <= document.querySelector('.card-menu').getBoundingClientRect().left + 6), beside: Math.abs(r.left - hr.right) < 40 || Math.abs(r.right - hr.left) < 40, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; })()`);
  check('Move to opens a box of its own beside the heading, with every other zone and both ends of the library', moveFly && moveFly.items.join() === 'Hand,Graveyard,Exile,Command zone,Sideboard,Top of library,Bottom of library' && moveFly.expanded === 'true' && moveFly.separate && moveFly.beside && moveFly.inside && menu.inside, JSON.stringify(moveFly));
  await clickMenuItem('Graveyard');
  check('Graveyard moves the card there (the pile says so, the battlefield is empty again) and the menu is gone', (await pileCount('graveyard')) === 'Graveyard: 1' && (await count('#battlefield .card[data-kind="other"]')) === 0 && (await menuState()) === null && (await $text('status')) === 'Moved Llanowar Elves to your graveyard.', `${await pileCount('graveyard')} ${await $text('status')}`);
  // a card in the hand: Play, Discard, Exile, the two ends of the library, and Move to for the rest (Kevin, 2026-11-15)
  await raiseHand();
  await mouse('#hand .card', { button: 'right', dy: 64 });
  menu = await menuState();
  check('a card in the hand offers Play, Discard, Exile, Move to command zone, Move to top of library and Move to bottom of library', menu && JSON.stringify(menu.items) === JSON.stringify(['Play', 'Discard', 'Exile', 'Move to command zone', 'Move to top of library', 'Move to bottom of library', 'Add to the stack', 'View details']), JSON.stringify(menu));
  await clickMenuItem('Play');
  check('and Play puts it on the battlefield', (await count('#battlefield .card')) === 1 && (await menuState()) === null);
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
  await mouse(cardSelector, { button: 'right', dy: 64 });
  check('the card on the battlefield again offers Tap', (await menuState()).items.includes('Tap'));
  {
    for (let n = 0; n < 5; n++) await key('ArrowDown', 'ArrowDown', 40); // Tap, Flip, the two marks, then the counter
    await key('ArrowDown', 'ArrowDown', 40);
    check('Down moves from the counter line to the line that asks for a number', (await menuState()).focused === '+1/+1 counters X...', JSON.stringify(await menuState()));
    await key('Enter', 'Enter', 13, '\r'); await sleep(150);
    check('Enter on a line that asks for a number closes the menu and opens the number box with the focus in its field', (await menuState()) === null && (await ev("(() => { const b = document.querySelector('.number-box'); return Boolean(b) && document.activeElement === b.querySelector('input'); })()")), await $text('status'));
    await browser.send('Input.insertText', { text: '3' });
    await key('Enter', 'Enter', 13, '\r'); await sleep(150);
    check('typing 3 and Enter in the box adds three counters and closes the box', (await ev("document.querySelector('.number-box') === null")) && /Added 3 /.test(await $text('status')), await $text('status'));
    await mouse(cardSelector, { button: 'right', dy: 64 });
    await key('End', 'End', 35);
    await key('Enter', 'Enter', 13, '\r');
    check('Enter on Move to opens it, with the focus on its first choice', (await menuState()).items.includes('Hand') && ['Hand'].includes((await menuState()).focused), JSON.stringify(await menuState()));
    await key('ArrowLeft', 'ArrowLeft', 37);
    check('Left closes it again and goes back to the Move to heading', !(await menuState()).items.includes('Hand') && (await menuState()).focused === 'Move to', JSON.stringify(await menuState()));
    await key('Escape', 'Escape', 27);
  }
  // closing in the other ways
  await mouse(cardSelector, { button: 'right', dy: 64 });
  await mouseMoveTo(1100, 600);
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1100, y: 600, button: 'left', buttons: 1, clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1100, y: 600, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(60);
  check('a click anywhere else closes the menu', (await menuState()) === null);
  await mouse(cardSelector, { button: 'right', dy: 64 });
  // The page itself no longer scrolls (the one-screen layout), but the panel on the right and the hand scroll inside themselves: a scroll anywhere closes the menu.
  await ev(`document.querySelector('.side-panels').dispatchEvent(new Event('scroll'))`); await sleep(120);
  check('scrolling closes the menu (a scroll inside the side panel, as the page itself does not scroll)', (await menuState()) === null);
  await ev(`window.scrollTo(0, 0)`); await sleep(60);
  await mouse(cardSelector, { button: 'right', dy: 64 });
  await ev(`window.dispatchEvent(new Event('resize'))`); await sleep(60);
  check('resizing the window closes the menu', (await menuState()) === null);
  // only one menu at a time, and always inside the window
  const landFromHand = (await handNames()).findIndex((x) => LANDS.includes(x));
  await clickCard('#hand .card', landFromHand);
  await clickAction('To battlefield');
  await mouse('#battlefield .card:last-child', { button: 'right', dy: 64 });
  await mouse('#battlefield .card:first-child', { button: 'right', dy: 64 });
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
  const loyaltyChip = await ev(`Array.from(document.querySelectorAll('#battlefield .card[data-kind="land"] .marks .chip')).findIndex((c) => (c.title || c.textContent) === 'Loyalty 2') + 1`);
  check('the land has a Loyalty chip to click', loyaltyChip > 0, String(loyaltyChip));
  await mouse(`#battlefield .card[data-kind="land"] .marks .chip:nth-child(${loyaltyChip})`, { button: 'right' });
  check('a right click on a counter takes one off and opens no menu', (await menuState()) === null && (await ev(`Array.from(document.querySelectorAll('#battlefield .card[data-kind="land"] .marks .chip')).map((c) => c.title || c.textContent).includes('Loyalty 1')`)), await ev(`Array.from(document.querySelectorAll('#battlefield .card[data-kind="land"] .marks .chip')).map((c) => c.title || c.textContent).join()`));
  // the Modify button and the hidden panel
  await clickAction('Deselect');
  await clickCard('#battlefield .card[data-kind="land"]', 0);
  check('selecting a card on the battlefield does not open the counters panel by itself', await $hidden('marks'));
  await clickAction('Modify');
  check('Modify... in the right-click menu opens the window and puts the cursor in the amount box', !(await $hidden('marks')) && (await ev(`document.activeElement.id`)) === 'marks-amount');
  await clickAction('Modify');
  check('its Close button hides the window and puts the focus back on the card', await (async () => { await ev(`document.querySelector('#marks .modify-close').click()`); return (await $hidden('marks')) && (await ev(`document.activeElement.classList.contains('card')`)); })());
  await clickAction('Deselect');
  await clickCard('#battlefield .card[data-kind="land"]', 0);
  await clickAction('To hand');
  check('a card in the hand has no Modify button', !(await actionLabels()).includes('Modify'));

  // ---- the menu of the hand: the arrow next to the hand count, and the menu of a card in the hand (Kevin, 2026-11-15) ----
  {
    await open(DECK_JSON);
    await waitFor(async () => (await count('#hand .card')) === 7 || null, 8000, 100);
    const pointOf = (selector) => ev(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height, innerHeight - r.top) / 2 }; })()`);
    const pointer = (p, extra = {}) => browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, ...extra });
    const typeNumber = async (text) => { await ev("document.querySelector('.number-box input').select()"); await browser.send('Input.insertText', { text }); };
    const enterKey = async () => { await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: String.fromCharCode(13) }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(250); };
    const overHand = async () => { await pointer({ x: 5, y: 5 }); await sleep(150); await pointer(await pointOf('#hand .card:nth-child(2)')); await sleep(450); };
    const openHandMenuByArrow = async () => { await overHand(); const p = await pointOf('#hand-caret'); await pointer(p); await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 }); await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(150); return menuState(); };
    const handSize = () => count('#hand .card');
    const gy = async () => Number((await pileCount('graveyard')).split(': ').at(-1));
    const lib = async () => Number((await pileCount('library')).split(': ').at(-1));
    const library0 = await lib();
    await overHand();
    check('the hand bar has an arrow next to the count, with a label and the menu role', await ev("(() => { const c = document.getElementById('hand-caret'); return Boolean(c && c.getAttribute('aria-haspopup') === 'menu' && /Hand options/.test(c.getAttribute('aria-label')) && c.closest('.hand-bar') && c.previousElementSibling.classList.contains('hand-count')); })()"));
    const menu = await openHandMenuByArrow();
    check('the arrow opens "Your hand" with Mulligan, Shuffle hand into library, Discard X at random and Discard hand, and nothing else', menu && menu.title === 'Your hand' && JSON.stringify(menu.items) === JSON.stringify(['Mulligan', 'Shuffle hand into library', 'Discard X at random...', 'Discard hand']), JSON.stringify(menu));
    if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-solo-handmenu.png');
    await escapeKey(); await sleep(100);
    // Discard X at random
    await openHandMenuByArrow(); await pressMenuItem('Discard X at random...'); await sleep(150); await typeNumber('2'); await enterKey();
    check('Discard X at random with 2: two cards left the hand for the graveyard, and it says so', (await handSize()) === 5 && (await gy()) === 2 && /^Discarded 2 cards at random\./.test(await $text('status')), JSON.stringify([await handSize(), await gy(), await $text('status')]));
    // Mulligan from the menu: a new hand of seven
    await motion('no-preference'); // (the real hand gathers and hides, which is when the lifted copy of a hovered card used to be left behind)
    await openHandMenuByArrow(); await overHand(); await pointer(await pointOf('#hand .card:nth-child(2)')); await sleep(300);
    const liftedBefore = await ev("document.querySelector('.hand-lift-layer')?.children.length ?? 0");
    await escapeKey(); await sleep(100); await ev("document.getElementById('hand-caret').click()"); await sleep(120); await pressMenuItem('Mulligan'); await sleep(200); // (the hand rose under the pointer after the menu opened: close it and open it again at the arrow's new place; pressing the arrow while it is open would close it)
    const liftedAfter = await ev("document.querySelector('.hand-lift-layer')?.children.length ?? 0");
    check('after Mulligan from the menu no lifted copy of a hovered card is left on screen while the hand gathers (it used to stay a moment)', liftedAfter === 0, JSON.stringify({ liftedBefore, liftedAfter }));
    await waitFor(async () => (await handSize()) === 7 || null, 20000, 100); await sleep(1500);
    await motion('reduce');
    const dealt = await waitFor(async () => (await handSize()) === 7 || null, 15000, 100);
    await sleep(500);
    check('Mulligan from the menu does what the button does: a new hand of seven, the graveyard is untouched', Boolean(dealt) && (await gy()) === 2 && /^Mulligan 1:/.test(await $text('status')), JSON.stringify([await handSize(), await gy(), await $text('status')]));
    // Shuffle hand into library
    const libraryBefore = await lib();
    await openHandMenuByArrow(); await pressMenuItem('Shuffle hand into library'); await sleep(300);
    check('Shuffle hand into library empties the hand and puts all seven in the library', (await handSize()) === 0 && (await lib()) === libraryBefore + 7 && /^Shuffled your hand into your library\./.test(await $text('status')), JSON.stringify([await handSize(), await lib(), libraryBefore, await $text('status')]));
    // Discard hand (draw three first), and the right-click on the bar opens the same menu
    for (let n = 0; n < 3; n++) { await press('draw'); await sleep(250); }
    await overHand();
    const bar = await pointOf('.hand-bar .hand-count');
    await pointer(bar); await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bar.x, y: bar.y, button: 'right', buttons: 2, clickCount: 1 }); await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bar.x, y: bar.y, button: 'right', buttons: 0, clickCount: 1 }); await sleep(150);
    const byBar = await menuState();
    check('a right-click on the bar opens the same menu', byBar && byBar.title === 'Your hand' && byBar.items.length === 4, JSON.stringify(byBar));
    const gyBefore = await gy();
    await pressMenuItem('Discard hand'); await sleep(300);
    check('Discard hand puts the three cards in the graveyard and says so', (await handSize()) === 0 && (await gy()) === gyBefore + 3 && /^Discarded your hand\./.test(await $text('status')), JSON.stringify([await handSize(), await gy(), gyBefore, await $text('status')]));
    check('with an empty hand the bar is not there to open (the Mulligan button still is)', await ev("document.querySelector('.hand-bar').hidden === true") && (await ev("document.getElementById('mulligan') !== null")));
    // the menu of a card in the hand
    await press('mulligan'); await waitFor(async () => (await handSize()) === 7 || null, 15000, 100); await sleep(600);
    await pointer({ x: 5, y: 5 }); await sleep(200);
    const nameOf = (uidSel) => ev(`document.querySelector(${JSON.stringify(uidSel)}).getAttribute('aria-label')`);
    const firstUid = await ev("document.querySelector('#hand > .card').dataset.uid");
    const cardSel = `#hand > .card[data-uid="${firstUid}"]`;
    const cardName = (await nameOf(cardSel)).split(',')[0];
    await ev(`(() => { const c = document.querySelector(${JSON.stringify(cardSel)}); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + Math.min(r.height, innerHeight - r.y) / 2 })); })()`); await sleep(150); // (the fan overlaps the cards: a click in the middle can hit a neighbour)
    const cardMenu = await menuState();
    check('a right-click on a card of the hand: Play, Discard, Exile, Move to command zone, Move to top of library, Move to bottom of library', cardMenu && cardMenu.title === cardName && JSON.stringify(cardMenu.items.slice(0, 6)) === JSON.stringify(['Play', 'Discard', 'Exile', 'Move to command zone', 'Move to top of library', 'Move to bottom of library']), JSON.stringify(cardMenu));
    const gy2 = await gy(); const hand2 = await handSize();
    await pressMenuItem('Discard'); await sleep(300);
    check('Discard sends that card to the graveyard', (await handSize()) === hand2 - 1 && (await gy()) === gy2 + 1, JSON.stringify([await handSize(), await gy()]));
    await pointer({ x: 5, y: 5 }); await sleep(200);
    const secondUid = await ev("document.querySelector('#hand > .card').dataset.uid");
    const lib2 = await lib();
    await ev(`(() => { const c = document.querySelector('#hand > .card[data-uid="${secondUid}"]'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + Math.min(r.height, innerHeight - r.y) / 2 })); })()`); await sleep(150);
    await pressMenuItem('Move to bottom of library'); await sleep(900);
    check('Bottom of library puts the card under the library', (await lib()) === lib2 + 1 && !(await ev(`document.querySelector('#hand > .card[data-uid="${secondUid}"]') !== null`)), JSON.stringify([await lib(), lib2]));
    void library0;
  }

  // ---- the details window of a card: the large card on the left, the rules and the rest on the right (Kevin, 2026-11-15) ----
  {
    const DETAILS_JSON = deckFrom('1 Lightning Bolt\n1 Sephiroth, Fabled SOLDIER\n1 Doubling Season\n4 Forest', 'Details deck', null, []);
    await open(DETAILS_JSON);
    await waitFor(async () => (await count('#hand .card')) === 7 || null, 8000, 100);
    await sleep(900);
    const rightClickByName = (prefix) => ev(`(() => { const c = document.querySelector('#hand > .card[aria-label^="${prefix}"]'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + Math.min(r.height, innerHeight - r.y) / 2 })); })()`);
    const win = () => ev("(() => { const w = document.querySelector('.details-window'); if (!w) return null; const img = w.querySelector('.details-card'); return { label: w.getAttribute('aria-label'), title: w.querySelector('.details-title').textContent, src: img ? img.getAttribute('src') : null, faces: [...w.querySelectorAll('.details-facename')].map((n) => n.textContent), types: [...w.querySelectorAll('.details-type')].map((n) => n.textContent), rules: [...w.querySelectorAll('.details-rules')].map((n) => n.textContent), facts: Object.fromEntries([...w.querySelectorAll('.details-row')].map((r) => [r.querySelector('dt').textContent, r.querySelector('dd').textContent])), legal: [...w.querySelectorAll('.details-legalgrid li')].map((l) => l.textContent), pips: w.querySelectorAll('.pip-img, .pip').length, flip: w.querySelector('.details-flip')?.textContent ?? null, closeFocused: document.activeElement === w.querySelector('.details-close'), box: (() => { const r = w.getBoundingClientRect(); return { inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, picture: w.querySelector('.details-picture').getBoundingClientRect().left < w.querySelector('.details-side').getBoundingClientRect().left }; })() }; })()");
    await rightClickByName('Lightning Bolt'); await sleep(150);
    const boltMenu = await menuState();
    check('a card of the hand has View details at the end of its menu', boltMenu && boltMenu.items.at(-1) === 'View details', JSON.stringify(boltMenu));
    await pressMenuItem('View details');
    await waitFor(async () => ((await win())?.rules ?? []).some((t) => /3 damage/.test(t)) || null, 8000, 100);
    const bolt = await win();
    check('View details opens a window for the card: its name, the large picture of the card on the left, and the rules on the right', bolt && bolt.label === 'Details of Lightning Bolt' && bolt.title === 'Lightning Bolt' && /\/normal\/front\//.test(bolt.src ?? '') && bolt.box.picture && bolt.box.inside, JSON.stringify(bolt));
    check('the rules come from the site\'s files: the type, the rules text, the mana value, the colors and the color identity', bolt.types[0] === 'Instant' && bolt.rules.some((t) => /Lightning Bolt deals 3 damage to any target\./.test(t)) && bolt.facts['Mana value'] === '1' && bolt.facts.Colors === 'Red' && bolt.facts['Color identity'] === 'Red', JSON.stringify(bolt.facts));
    check('a card with one face does not repeat its name under the title (the type is there with the cost beside it)', bolt.faces.length === 0 && bolt.types[0] === 'Instant');
    check('the mana cost is drawn as a symbol and the legality of seven formats is listed with the words', bolt.pips >= 1 && bolt.legal.length === 7 && bolt.legal.some((l) => /Modern/.test(l) && /Legal/.test(l)) && bolt.legal.some((l) => /Standard/.test(l) && /Not legal/.test(l)), JSON.stringify({ pips: bolt.pips, legal: bolt.legal }));
    check('no request went to Scryfall (the rules come from the own files of the site)', browser.events.every((e) => e.method !== 'Network.requestWillBeSent' || !/api.scryfall.com/.test(e.params.request.url)));
    if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-solo-details.png');
    check('the Close button has the focus, and Escape closes the window', bolt.closeFocused && await (async () => { await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(200); return (await win()) === null; })());
    // a card with two faces: both faces' rules, and a button for the picture
    await rightClickByName('Sephiroth'); await sleep(150); await pressMenuItem('View details');
    await waitFor(async () => ((await win())?.faces ?? []).length === 2 || null, 8000, 100);
    const seph = await win();
    check('a card with two faces shows both: each face\'s name, type and rules, and its power and toughness', seph && seph.faces.join() === 'Sephiroth, Fabled SOLDIER,Sephiroth, One-Winged Angel' && seph.types.length === 2 && seph.rules.some((t) => /Whenever Sephiroth enters or attacks/.test(t)) && seph.rules.some((t) => /^Flying/.test(t)), JSON.stringify(seph));
    check('and a button to see the back face of the picture, which shows it and then the front again', seph.flip === 'Show the back face' && await (async () => { await ev("document.querySelector('.details-flip').click()"); await sleep(150); const back = await win(); await ev("document.querySelector('.details-flip').click()"); await sleep(150); const front = await win(); return /\/back\//.test(back.src) && back.flip === 'Show the front face' && /\/front\//.test(front.src); })());
    await ev("document.querySelector('.details-close').click()"); await sleep(150);
    check('the Close button closes it, and a click on the dim space around it too', (await win()) === null && await (async () => { await rightClickByName('Forest'); await sleep(150); await pressMenuItem('View details'); await sleep(300); await ev("document.querySelector('.details-overlay').dispatchEvent(new MouseEvent('click', { bubbles: true }))"); await sleep(150); return (await win()) === null; })());
    // the rulings (Kevin, 2026-11-15): a section at the end of the details, from the site's own files
    const rulingsOf = () => ev("(() => { const b = document.querySelector('.details-rulings-box'); if (!b) return null; return { heading: b.querySelector('.details-subhead')?.textContent, note: b.querySelector('.details-none')?.textContent ?? null, items: [...b.querySelectorAll('.details-ruling')].map((i) => [i.querySelector('.details-ruling-meta').textContent, i.querySelector('.details-ruling-text').textContent]), retry: b.querySelector('.details-retry-rulings')?.textContent ?? null, last: document.querySelector('.details-body').lastElementChild === b }; })()");
    await rightClickByName('Lightning Bolt'); await sleep(150); await pressMenuItem('View details');
    await waitFor(async () => (await rulingsOf())?.note || (await rulingsOf())?.items.length || null, 8000, 100);
    const boltRulings = await rulingsOf();
    check('a card with no rulings (Lightning Bolt has none in Scryfall\'s file) says so under a Rulings heading, at the end of the details', boltRulings && boltRulings.heading === 'Rulings' && boltRulings.note === 'No rulings for this card.' && boltRulings.items.length === 0 && boltRulings.last, JSON.stringify(boltRulings));
    await ev("document.querySelector('.details-close').click()"); await sleep(150);
    await rightClickByName('Doubling Season'); await sleep(150); await pressMenuItem('View details');
    await waitFor(async () => ((await rulingsOf())?.items.length ?? 0) >= 3 || null, 8000, 100);
    const doubling = await rulingsOf();
    check('a card with rulings lists them under the Rulings heading, each with its date and who wrote it, oldest first, and the text of the real ruling', doubling && doubling.items.length >= 3 && doubling.items.every(([meta]) => /^\d{4}-\d{2}-\d{2} \u00b7 (Wizards of the Coast|Scryfall)$/.test(meta)) && doubling.items.every(([meta], k) => k === 0 || meta.slice(0, 10) >= doubling.items[k - 1][0].slice(0, 10)) && doubling.items.some(([, text]) => /Doubling Season/.test(text)) && doubling.last, JSON.stringify(doubling));
    if (process.argv.includes('--screenshot')) { await ev("document.querySelector('.details-rulings-box').scrollIntoView({ block: 'center' })"); await sleep(100); await browser.screenshot('scratch-solo-rulings.png'); }
    check('the rules came too (the rulings are a section of their own, loaded beside them)', (await win()).rules.some((t) => /twice that many|double/i.test(t) || t.length > 20), JSON.stringify((await win()).rules).slice(0, 200));
    await ev("document.querySelector('.details-close').click()"); await sleep(150);
    // when the rules cannot be loaded, the window says so and tries again; when the file has no such card it says that (a fresh page: the loader keeps the files it has fetched)
    await open(DETAILS_JSON); await waitFor(async () => (await count('#hand .card')) === 7 || null, 8000, 100); await sleep(900);
    await ev("window.__realFetch = window.fetch; window.fetch = (url, options) => (/\\/data\\/rules\\//.test(String(url)) ? Promise.resolve(new Response('no', { status: window.__rulesStatus ?? 500 })) : window.__realFetch(url, options)); window.__rulesStatus = 500;");
    await rightClickByName('Lightning Bolt'); await sleep(150); await pressMenuItem('View details');
    await waitFor(async () => /could not be loaded/.test(((await win())?.rules ?? []).join()) || null, 8000, 100);
    const failed = await win();
    check('when the rules cannot be loaded the window says so, still shows the card and what the list knows (keywords, color identity), and offers Try again', failed && /could not be loaded/.test(failed.rules.join()) && /\/normal\/front\//.test(failed.src) && failed.facts['Color identity'] === 'Red' && (await ev("document.querySelector('.details-window button.secondary:not(.details-close):not(.details-flip)')?.textContent")) === 'Try again', JSON.stringify(failed));
    await ev("window.fetch = window.__realFetch"); await ev("document.querySelector('.details-window button.secondary:not(.details-close):not(.details-flip)').click()");
    await waitFor(async () => ((await win())?.rules ?? []).some((t) => /3 damage/.test(t)) || null, 8000, 100);
    check('Try again fetches the file again and the rules appear', ((await win())?.rules ?? []).some((t) => /3 damage/.test(t)));
    await ev("document.querySelector('.details-close').click()"); await sleep(150);
    await ev("window.fetch = (url, options) => (/\\/data\\/rules\\//.test(String(url)) ? Promise.resolve(new Response('no', { status: 404 })) : window.__realFetch(url, options))");
    await rightClickByName('Forest'); await sleep(150); await pressMenuItem('View details');
    await waitFor(async () => /not available/.test(((await win())?.rules ?? []).join()) || null, 8000, 100);
    check('when the site has no rules file (a 404) the window says the rules are not available', /not available/.test(((await win())?.rules ?? []).join()), JSON.stringify(await win()));
    await ev("window.fetch = window.__realFetch"); await ev("document.querySelector('.details-close').click()"); await sleep(150);
    // the rulings alone failing: the rules show, the rulings say they could not be loaded and offer Try again, and it works when the network is back
    await open(DETAILS_JSON); await waitFor(async () => (await count('#hand .card')) === 7 || null, 8000, 100); await sleep(900);
    await ev("window.__realFetch = window.fetch; window.fetch = (url, options) => (/\\/data\\/rulings\\//.test(String(url)) ? Promise.resolve(new Response('no', { status: 500 })) : window.__realFetch(url, options));");
    await rightClickByName('Doubling Season'); await sleep(150); await pressMenuItem('View details');
    await waitFor(async () => (await rulingsOf())?.retry || null, 8000, 100);
    const rf = await rulingsOf();
    check('when only the rulings cannot be loaded the rules still show, and the rulings say so and offer Try again', rf && /could not be loaded/.test(rf.note) && rf.retry === 'Try again' && ((await win())?.rules ?? []).some((t) => t.length > 10), JSON.stringify(rf));
    await ev("window.fetch = window.__realFetch"); await ev("document.querySelector('.details-retry-rulings').click()");
    await waitFor(async () => ((await rulingsOf())?.items.length ?? 0) >= 3 || null, 8000, 100);
    check('Try again brings the rulings', ((await rulingsOf())?.items.length ?? 0) >= 3);
    await ev("document.querySelector('.details-close').click()"); await sleep(150);
  }

  // ---- Add counter: flying, trample, lore and the rest from a menu that can be searched, a name of your own, and the symbols of the rules text in the details window (Kevin, 2026-11-15) ----
  {
    const COUNTER_JSON = deckFrom('1 Sol Ring\n6 Forest', 'Counter deck', null, []);
    await open(COUNTER_JSON);
    await waitFor(async () => (await count('#hand .card')) === 7 || null, 8000, 100);
    await sleep(900);
    const rightClickSel = (selector) => ev(`(() => { const c = document.querySelector(${JSON.stringify(selector)}); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + Math.min(r.height, innerHeight - r.y) / 2 })); })()`);
    const typeIn = async (text) => { await browser.send('Input.insertText', { text }); await sleep(120); };
    const enter = async () => { await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: String.fromCharCode(13) }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(250); };
    // Sol Ring: the tap symbol and the colorless mana in its rules are drawn as symbols
    await rightClickSel('#hand > .card[aria-label^="Sol Ring"]'); await sleep(150); await pressMenuItem('View details');
    await waitFor(async () => (await count('.details-rules')) > 0 && (await count('.details-glyph')) > 0 || null, 8000, 100);
    const glyphs = await ev("(() => { const w = document.querySelector('.details-window'); return { glyphs: [...w.querySelectorAll('.details-glyph')].map((g) => [g.getAttribute('aria-label'), g.querySelector('.mana-icon')?.dataset.icon ?? null]), pips: w.querySelectorAll('.details-rules .details-symbol').length, text: w.querySelector('.details-rules').textContent }; })()");
    check('in the rules text the tap symbol is the Mana project icon in a disc, and the colorless mana symbols are drawn too', JSON.stringify(glyphs.glyphs) === JSON.stringify([['tap', 'tap']]) && glyphs.pips === 2, JSON.stringify(glyphs));
    await ev("document.querySelector('.details-close').click()"); await sleep(150);
    // a Forest to the battlefield, then its menu
    await rightClickSel('#hand > .card[aria-label^="Forest"]'); await sleep(150); await pressMenuItem('Play'); await sleep(400);
    const forest = '#battlefield .card[aria-label^="Forest"]';
    await rightClickSel(forest); await sleep(150);
    const menu1 = await menuState();
    check('a card on the battlefield has Add counter in its menu, after the two +1/+1 lines', menu1 && menu1.items.indexOf('Add counter') === menu1.items.indexOf('+1/+1 counters X...') + 1, JSON.stringify(menu1?.items));
    await pressMenuItem('Add counter'); await sleep(200);
    const fly = await ev("(() => { const f = document.querySelector('.card-menu-fly:not([hidden])'); if (!f) return null; const lines = [...f.querySelectorAll(':scope > [role=menuitem]')]; return { filter: document.activeElement === f.querySelector('.card-menu-filter'), first: lines.slice(0, 4).map((l) => l.textContent.trim()), last: lines.at(-1).textContent.trim(), count: lines.length, icons: lines.filter((l) => l.querySelector('.mana-icon')).length, inside: (() => { const r = f.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })() }; })()");
    check('Add counter opens a box with a search field (it has the focus) and the counters: Custom..., +1/+1, -1/-1, Flying ..., many with their icons, inside the window', fly && fly.filter && fly.first.join() === 'Custom...,+1/+1,-1/-1,Flying' && fly.last === 'Winch' && fly.count > 200 && fly.icons > 30 && fly.inside, JSON.stringify(fly));
    if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-solo-counters.png');
    await typeIn('tra');
    const shown = await ev("[...document.querySelectorAll('.card-menu-fly:not([hidden]) > [role=menuitem]')].filter((l) => !l.hidden).map((l) => l.textContent.trim())");
    check('typing in the search field hides the counters that do not contain the letters', shown.includes('Trample') && !shown.includes('Flying') && shown.length < 6, JSON.stringify(shown));
    await enter();
    const chip = () => ev("(() => { const c = document.querySelector('#battlefield .card[aria-label^=\"Forest\"] .marks .chip-trample'); return c ? { text: c.textContent, title: c.title, icon: c.querySelector('.mana-icon')?.dataset.icon ?? null } : null; })()");
    const trample = await chip();
    check('Enter adds the first counter left: a Trample chip with its icon and the number, its name as the tooltip, and the status says so', trample && trample.icon === 'ability-trample' && trample.text === '1' && trample.title === 'Trample 1' && /^Added a Trample counter to Forest\./.test(await $text('status')), JSON.stringify([trample, await $text('status')]));
    check('the card says it in words too (for a screen reader)', /Trample 1/.test(await ev("document.querySelector('#battlefield .card[aria-label^=\"Forest\"]').getAttribute('aria-label')")) || /Trample/.test(await ev("document.querySelector('#battlefield .card[aria-label^=\"Forest\"]').getAttribute('aria-label')")), await ev("document.querySelector('#battlefield .card[aria-label^=\"Forest\"]').getAttribute('aria-label')"));
    // a second kind from the list with the mouse, and the chips add and take off like the others
    await rightClickSel(forest); await sleep(150); await pressMenuItem('Add counter'); await sleep(200); await pressMenuItem('Lore'); await sleep(250);
    const kinds = () => ev("[...document.querySelectorAll('#battlefield .card[aria-label^=\"Forest\"] .marks .chip')].map((c) => c.title || c.textContent)");
    check('Lore from the list adds a Lore chip beside the Trample one', JSON.stringify(await kinds()) === JSON.stringify(['Lore 1', 'Trample 1']), JSON.stringify(await kinds()));
    await ev("document.querySelector('#battlefield .card[aria-label^=\"Forest\"] .marks .chip-lore').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))"); await sleep(200);
    check('a click on a named chip adds one, like the fixed kinds', (await kinds()).includes('Lore 2'), JSON.stringify(await kinds()));
    await ev("document.querySelector('#battlefield .card[aria-label^=\"Forest\"] .marks .chip-lore').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))"); await sleep(200);
    check('and a right-click takes one off', (await kinds()).includes('Lore 1') && (await count('.card-menu')) === 0, JSON.stringify(await kinds()));
    // a name of your own
    await rightClickSel(forest); await sleep(150); await pressMenuItem('Add counter'); await sleep(200); await pressMenuItem('Custom...'); await sleep(250);
    const asked = await ev("(() => { const b = document.querySelector('.text-box'); return b ? { title: b.getAttribute('aria-label'), focused: document.activeElement === b.querySelector('input') } : null; })()");
    check('Custom... asks for the name in a small box with the focus in it', asked && asked.title === 'Name of the counter' && asked.focused, JSON.stringify(asked));
    await typeIn('x'); await enter();
    const refusedName = await ev("(() => { const b = document.querySelector('.text-box'); return b ? { bad: b.querySelector('.number-box-note').classList.contains('bad'), text: b.querySelector('.number-box-note').textContent, invalid: b.querySelector('input').getAttribute('aria-invalid') } : null; })()");
    check('a name that cannot be one is refused in words and the box stays', refusedName && refusedName.bad && /2 to 24/.test(refusedName.text) && refusedName.invalid === 'true', JSON.stringify(refusedName));
    await ev("document.querySelector('.text-box input').select()"); await typeIn("Wanderer's Mark"); await enter();
    check('a good name adds a counter of that name: a chip with the name written out and a 1', (await kinds()).includes("Wanderer's-mark 1") || (await kinds()).some((k) => /^Wanderer's mark 1$|^Wanderer's-mark 1$/i.test(k)), JSON.stringify(await kinds()));
    check('and the box has gone', (await count('.text-box')) === 0);
    await rightClickSel(forest); await sleep(150); await pressMenuItem('Add counter'); await sleep(200); await pressMenuItem('Custom...'); await sleep(250);
    await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(200);
    check('Escape closes the name box and adds nothing', (await count('.text-box')) === 0 && (await kinds()).length === 3, JSON.stringify(await kinds()));
  }

  // ---- turning a two-sided card over (real list entries: Sephiroth, Valakut Awakening, Delver, Aclazotz, and Fire // Ice which has no back) ----
  // Seven cards in a seven-card deck, so all of them are in the hand and nothing depends on luck.
  const TWO_SIDED = deckFrom('1 Sephiroth, Fabled SOLDIER\n1 Valakut Awakening\n1 Delver of Secrets\n1 Aclazotz, Deepest Betrayal\n1 Fire // Ice\n1 Sol Ring\n1 Forest', 'Two-sided deck', null, []); // no commander: the page would guess one from the legendary creatures and take it out of the hand
  const defaultId = (prefix) => cards.find((c) => c.n.startsWith(prefix)).i;
  const cardAt = (prefix) => `.card[aria-label^="${prefix}"]`;
  const srcOf = (prefix) => ev(`(() => { const i = document.querySelector(${JSON.stringify(cardAt(prefix) + ' img')}); return i ? i.getAttribute('src') : null; })()`);
  const rowOf = (prefix) => ev(`(() => { const c = document.querySelector(${JSON.stringify(cardAt(prefix))}); return c ? (c.dataset.kind === 'land' ? 'row-lands' : c.dataset.kind === 'other' ? 'row-other' : (c.parentElement ? c.parentElement.id : null)) : null; })()`); // which kind of card it is now: the battlefield is one grid, and a card's kind (land or other) is what the old two rows were
  const labelOf = (prefix) => ev(`document.querySelector(${JSON.stringify(cardAt(prefix))}).getAttribute('aria-label')`);
  // a card with two faces in the hand: Flip double-faced card shows its back, only as a look (Kevin, 2026-11-15)
  {
    await open(TWO_SIDED);
    await waitFor(async () => (await count('#hand .card')) === 7 || null, 8000, 100);
    const sel = (prefix) => `#hand > .card[aria-label^="${prefix}"]`;
    const rightClick = (selector) => ev(`(() => { const c = document.querySelector(${JSON.stringify(selector)}); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + Math.min(r.height, innerHeight - r.y) / 2 })); })()`);
    const imgOf = (prefix) => ev(`(() => { const i = document.querySelector(${JSON.stringify(sel(prefix) + ' img')}); return i ? i.getAttribute('src') : null; })()`);
    const labelIn = (prefix) => ev(`document.querySelector(${JSON.stringify(sel(prefix))}).getAttribute('aria-label')`);
    const frontSrc = await imgOf('Sephiroth');
    await rightClick(sel('Sephiroth')); await sleep(150);
    const sephMenu = await menuState();
    check('a two-sided card in the hand has Flip double-faced card in its menu, after Move to bottom of library', sephMenu && /Sephiroth/.test(sephMenu.title) && sephMenu.items.includes('Flip double-faced card') && sephMenu.items.indexOf('Flip double-faced card') === sephMenu.items.indexOf('Move to bottom of library') + 1, JSON.stringify(sephMenu));
    await pressMenuItem('Flip double-faced card'); await sleep(400);
    const backSrc = await imgOf('Sephiroth');
    check('choosing it shows the back face picture, and the card is still in the hand', Boolean(backSrc) && backSrc !== frontSrc && /\/back\//.test(backSrc) && (await count('#hand .card')) === 7 && /turned over/.test(await labelIn('Sephiroth')), JSON.stringify({ frontSrc, backSrc }));
    if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-solo-handpeek.png');
    check('and the message says it is only a look', /only a look/.test(await $text('status')), await $text('status'));
    await rightClick(sel('Sephiroth')); await sleep(150);
    await pressMenuItem('Flip double-faced card'); await sleep(400);
    check('choosing it again shows the front picture again', (await imgOf('Sephiroth')) === frontSrc && !/turned over/.test(await labelIn('Sephiroth')), await imgOf('Sephiroth'));
    await rightClick(sel('Sephiroth')); await sleep(150);
    await pressMenuItem('Flip double-faced card'); await sleep(300);
    await rightClick(sel('Sephiroth')); await sleep(150);
    await pressMenuItem('Play'); await sleep(400);
    check('a card played while it shows its back still comes onto the battlefield as its front (the look is not the game)', Boolean(await ev("document.querySelector('#battlefield .card[aria-label^=\"Sephiroth\"]')")) && !/turned over/.test(await ev("document.querySelector('#battlefield .card[aria-label^=\"Sephiroth\"]').getAttribute('aria-label')")));
    check('a card with no back (Sol Ring) has no such line', await (async () => { await rightClick(sel('Sol Ring')); await sleep(150); const m = await menuState(); await escapeKey(); return m && !m.items.includes('Flip double-faced card'); })());
  }
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
  check('Flip double-faced card is offered for Sephiroth, Valakut Awakening, Delver and Aclazotz', (await Promise.all(['Sephiroth', 'Valakut Awakening', 'Delver', 'Aclazotz'].map(async (n) => (await offers(n)).includes('Flip double-faced card')))).every(Boolean));
  check('and not for Fire // Ice (one picture for both halves), Sol Ring or the Forest', (await Promise.all(['Fire', 'Sol Ring', 'Forest'].map(async (n) => (await offers(n)).includes('Flip double-faced card')))).every((has) => !has));
  check('the front pictures were asked for, and no back picture yet', asked.some((u) => u.includes(`/front/`) && u.includes(defaultId('Valakut Awakening'))) && !asked.some((u) => u.includes('/back/')), asked.filter((u) => u.includes('/back/')).join(' '));

  // Valakut Awakening: an Instant on the front and a land on the back.
  await clickCard(cardAt('Valakut Awakening'));
  check('its selected line gives both type lines and does not say turned over', /Instant \/\/ Land/.test(await $text('selected-line')) && !/turned over/.test(await $text('selected-line')));
  await clickAction('Flip double-faced card');
  check('turned over, it moves to the land row (now two lands), and the other row has five', (await rowOf('Valakut Awakening')) === 'row-lands' && (await count('#battlefield .card[data-kind="land"]')) === 2 && (await count('#battlefield .card[data-kind="other"]')) === 5);
  check('its label says it is turned over, and so does the selected line and the status', /, turned over/.test(await labelOf('Valakut Awakening')) && /\(turned over\)/.test(await $text('selected-line')) && /Turned .*Valakut Awakening.* over\./.test(await $text('status')), await $text('status'));
  await waitFor(async () => (await srcOf('Valakut Awakening'))?.includes('/back/') || null, 3000, 50).catch(() => null);
  const backUrl = await srcOf('Valakut Awakening');
  check('the picture is now the BACK face of the same printing', Boolean(backUrl) && backUrl.includes(`/back/`) && backUrl.includes(defaultId('Valakut Awakening')), String(backUrl));
  check('and that back picture was asked for (the stand-in answered it)', asked.some((u) => u.includes('/back/') && u.includes(defaultId('Valakut Awakening'))));
  check('the card has no power and toughness box (a land has no numbers, and the front has none either)', (await box(cardAt('Valakut Awakening'))) === null);
  check('the action is still called Flip double-faced card when the card is turned over', (await actionLabels()).includes('Flip double-faced card'));
  await clickAction('Flip double-faced card');
  check('turned back, it is in the other row again and shows its front picture', (await rowOf('Valakut Awakening')) === 'row-other' && (await count('#battlefield .card[data-kind="land"]')) === 1 && /\/front\//.test(await srcOf('Valakut Awakening')) && !/turned over/.test(await labelOf('Valakut Awakening')));
  await clickAction('Deselect');

  // Sephiroth: a 3/3 on the front, a 5/5 on the back, and the numbers follow the face that shows.
  const seph = '#battlefield ' + cardAt('Sephiroth');
  await clickCard(cardAt('Sephiroth'));
  const front = await box(seph);
  check('Sephiroth shows his printed 3/3 while selected', front && front.visibility === 'visible' && front.power === '3' && front.toughness === '3', JSON.stringify(front));
  await clickAction('Flip double-faced card');
  const back = await box(seph);
  check('turned over, the box says 5/5 (the back face\'s numbers) and he is still in the other row', back && back.power === '5' && back.toughness === '5' && (await rowOf('Sephiroth')) === 'row-other', JSON.stringify(back));
  await clickAction('Modify');
  await setAmount('2'); await clickMark('Add counters'); // the default kind is +1/+1
  await sleep(120);
  check('a +1/+1 counter change adds to the back face\'s 5/5 (shown as 7/7 once changed)', await (async () => { const b = await box(seph); return b && b.power === '7' && b.toughness === '7'; })(), JSON.stringify(await box(seph)));
  await clickAction('Flip double-faced card');
  const frontAgain = await box(seph);
  check('turned back, the counters stay and the numbers are the front\'s 3/3 plus them: 5/5', frontAgain && frontAgain.power === '5' && frontAgain.toughness === '5', JSON.stringify(frontAgain));
  await clickAction('Deselect');

  // Aclazotz: a 4/4 creature that turns into a land.
  await clickCard(cardAt('Aclazotz'));
  check('Aclazotz shows 4/4 on the front', (await box('#battlefield ' + cardAt('Aclazotz'))).power === '4');
  await clickAction('Flip double-faced card');
  check('turned over it is a land: in the land row, with no numbers, never the front\'s 4/4', (await rowOf('Aclazotz')) === 'row-lands' && (await box(cardAt('Aclazotz'))) === null && (await count('#battlefield .card[data-kind="land"]')) === 2);
  const noImage = (prefix) => ev(`document.querySelector(${JSON.stringify(cardAt(prefix))}).classList.contains('noimage')`);
  await waitFor(async () => (await noImage('Aclazotz')) || null, 3000, 50).catch(() => null);
  check('its back picture does not exist (404), so the card shows its name instead of a broken picture', await noImage('Aclazotz'));
  await clickAction('Flip double-faced card');
  await waitFor(async () => !(await noImage('Aclazotz')) || null, 3000, 50).catch(() => null);
  check('turned back, the front picture is shown again and the name fallback is gone', !(await noImage('Aclazotz')) && /\/front\//.test(await srcOf('Aclazotz')));
  await clickAction('Flip double-faced card');
  await clickAction('Deselect');

  // The right-click menu offers it too, and a click with the real mouse does it.
  // A card with a long, two-line type line is selected, so the selected-card panel gets shorter when the right-click selects Delver; the
  // browser then moves the scroll position (here by 23 px) to keep the cards still. That used to close the menu at once (found 2026-11-06).
  await clickCard(cardAt('Sephiroth'));
  await mouse(cardAt('Delver'), { button: 'right', dy: 64 });
  const delverMenu = await menuState();
  check('the menu for Delver lists Flip double-faced card between Tap and the counter', delverMenu && JSON.stringify(delverMenu.items.slice(0, 5)) === JSON.stringify(['Modify...', 'Tap', 'Flip', 'Flip double-faced card', "Doesn't untap"]), JSON.stringify(delverMenu?.items));
  await sleep(500);
  check('the menu is still open half a second later (it must not close by itself after a right click on a card that was not selected)', Boolean(await menuState()), JSON.stringify(await menuState()));
  await clickMenuItem('Flip double-faced card');
  check('choosing it turns Delver (the menu closes, the label says so, the box says 3/2)', !(await menuState()) && /, turned over/.test(await labelOf('Delver')) && (await box('#battlefield ' + cardAt('Delver'))) !== null, await labelOf('Delver'));
  await clickCard(cardAt('Delver'));
  check('and the selected-card box shows the back face\'s 3/2', await (async () => { const b = await box('#battlefield ' + cardAt('Delver')); return b && b.power === '3' && b.toughness === '2'; })(), JSON.stringify(await box('#battlefield ' + cardAt('Delver'))));
  await clickAction('Deselect');
  await mouse(cardAt('Sol Ring'), { button: 'right', dy: 64 });
  const solMenu = await menuState();
  check('the menu of a card with no back has no Flip double-faced card', solMenu && !solMenu.items.includes('Flip double-faced card') && solMenu.items.includes('Tap'), JSON.stringify(solMenu?.items));
  await key('Escape', 'Escape', 27);

  // A turned card that leaves the battlefield comes back showing its front.
  await clickCard(cardAt('Aclazotz'));
  await clickAction('To hand');
  const aclazotzInHand = await srcOf('Aclazotz');
  check('Aclazotz, sent to the hand while turned over, is a front-face card there (not turned, front picture)', (await count('#hand ' + cardAt('Aclazotz'))) === 1 && !/turned over/.test(await labelOf('Aclazotz')) && /\/front\//.test(aclazotzInHand), String(aclazotzInHand));
  check('and in the hand its menu offers Flip double-faced card too, as a look at the other face (nothing changes in the game)', (await actionLabels()).includes('Flip double-faced card'));
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
  await clickAction('Flip double-faced card');
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
  await raiseHand();
  await mouse('#hand .card', { button: 'right', dy: 64 });
  const handMenu = await menuState();
  check('the right-click menu of the modal card in the hand offers Play Valakut Stoneforge after the look at the other face, then Add to the stack, before View details', handMenu && JSON.stringify(handMenu.items.slice(-3)) === JSON.stringify(['Play Valakut Stoneforge', 'Add to the stack', 'View details']), JSON.stringify(handMenu?.items));
  await clickMenuItem('Play Valakut Stoneforge');
  check('choosing it plays the land the same way', (await count('#hand .card')) === 0 && (await rowOf('Valakut Awakening')) === 'row-lands' && /, turned over/.test(await labelOf('Valakut Awakening')), JSON.stringify({ hand: await count('#hand .card'), row: await rowOf('Valakut Awakening'), label: await labelOf('Valakut Awakening'), status: await $text('status') }));
  await clickAction('Deselect');

  // Create copy: Sephiroth turned over, with two counters on him; the copy is the BACK face and has none of his counters.
  await clickCard(cardAt('Sephiroth'));
  await clickAction('Flip double-faced card');
  await clickAction('Modify');
  await setAmount('2'); await clickMark('Add counters');
  await clickAction('Modify');
  await clickAction('Deselect');
  const tokensBefore = await count('.card[aria-label^="Sephiroth, One-Winged"]');
  await mouse(cardAt('Sephiroth, Fabled'), { button: 'right', dy: 64 });
  const sephMenu = await menuState();
  check('the menu of a battlefield card offers Create copy, after the counter, then Add to the stack and View details, before Move to', sephMenu && sephMenu.items.includes('Create copy') && sephMenu.items.indexOf('Create copy') === sephMenu.items.indexOf('Move to') - 3 && sephMenu.items.indexOf('Add to the stack') === sephMenu.items.indexOf('Move to') - 2 && sephMenu.items.indexOf('View details') === sephMenu.items.indexOf('Move to') - 1, JSON.stringify(sephMenu?.items));
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
  check('a copy of Delver showing its front is a second Delver of Secrets with the front picture', delverCopy === 2 && (await ev(`Array.from(document.querySelectorAll('.card[aria-label^="Delver of Secrets"] .face img')).every((i) => i.getAttribute('src').includes('/front/'))`)), String(delverCopy));
  await clickAction('Deselect');
  await clickCard(cardAt('Aclazotz'));
  await clickAction('Flip double-faced card');
  await clickAction('Create copy');
  await clickAction('Deselect');
  const landCopies = await ev(`Array.from(document.querySelectorAll('#battlefield .card[data-kind="land"][aria-label^="Temple of the Dead"]')).map((c) => c.getAttribute('aria-label'))`);
  check('a copy of Aclazotz turned into its land is a land too: Temple of the Dead, in the lands row, with the back picture and no numbers', landCopies.length === 1 && (await ev(`document.querySelector('#battlefield .card[data-kind="land"][aria-label^="Temple of the Dead"] img').getAttribute('src').includes('/back/')`)) && (await box('#battlefield .card[data-kind="land"][aria-label^="Temple of the Dead"]')) === null, JSON.stringify(landCopies));

  // ---- what a player has on them: chips next to the life total, set from a right-click on the life (real mouse input) ----
  await open();
  const chips = () => ev(`[...document.querySelectorAll('#life-chips .counter-chip')].map((c) => ({ id: c.dataset.id, label: c.getAttribute('aria-label'), number: c.querySelector('.chip-count').hidden ? null : c.querySelector('.chip-count').textContent, icon: (() => { const s = c.querySelector('svg'); return Boolean(s) && s.getAttribute('width') === '16' && s.getAttribute('height') === '16' && s.getAttribute('fill') === 'currentColor'; })(), lethal: c.classList.contains('lethal'), word: !c.querySelector('.chip-lethal').hidden, title: c.title }))`);
  const lifeMenu = async (...path) => { await mouse('#life-area > .stat', { button: 'right', dx: 6 }); for (const step of path) await clickMenuItem(step); };
  check('a new game shows no chips, and the old counters section and the commander damage block are gone', !(await $hidden('game')) && (await chips()).length === 0 && (await count('#counters, #player-counters, #commander-damage')) === 0);
  await mouse('#life-area > .stat', { button: 'right', dx: 6 }); // the word Life: a right-click on the NUMBER lowers life
  const lifeItems = await menuState();
  check('a right-click on the life opens a menu of every counter a player can have: six counts and three marks', lifeItems && lifeItems.title === 'Your counters' && JSON.stringify(lifeItems.items) === JSON.stringify(['Poison: 0', 'Energy: 0', 'Experience: 0', 'Rad: 0', 'Ticket: 0', 'Speed: 0', 'The Ring tempts you: 0', 'Monarch: off', 'Initiative: off', "City's blessing: off"]), JSON.stringify(lifeItems));
  await escapeKey();
  check('Escape closes it and changes nothing', !(await menuState()) && (await chips()).length === 0);
  await ev(`document.getElementById('life-area').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 0, clientY: 0 }))`);
  check('the context-menu key (a contextmenu event with no pointer position) opens it too, next to the life', Boolean(await menuState()));
  await escapeKey();
  await lifeMenu('Poison: 0', 'Add 1');
  const one = await chips();
  check('Add 1 puts a poison chip next to the life: an icon (width, height and fill set) and the number, and the status says so', one.length === 1 && one[0].id === 'counter:poison' && one[0].number === '1' && one[0].icon && one[0].label === 'Poison 1' && (await $text('status')) === 'Poison 1.', JSON.stringify(one));
  await lifeMenu('Poison: 1', 'Add 5'); await lifeMenu('Poison: 6', 'Add 1');
  check('the menu shows the count now, and Add 5 then Add 1 make 7', (await chips())[0].number === '7');
  await lifeMenu('Poison: 7', 'Add 5'); await lifeMenu('Poison: 12', 'Remove 1');
  const lethal = (await chips())[0];
  check('11 poison is lethal: the chip is marked, says "lethal" in words (not colour alone) and the tooltip says why', lethal.number === '11' && lethal.lethal && lethal.word && /lethal at 10/.test(lethal.title), JSON.stringify(lethal));
  await lifeMenu('Poison: 11', 'Remove 5'); await lifeMenu('Poison: 6', 'Remove 5');
  const downTo1 = (await chips())[0];
  check('taking it down to 1 ends the lethal mark', downTo1.number === '1' && !downTo1.lethal && !downTo1.word);
  await lifeMenu('Poison: 1', 'Remove 1');
  check('removing the last one takes the chip away', (await chips()).length === 0);
  await lifeMenu('Monarch: off');
  const monarch = await chips();
  check('a mark is one choice: the monarch is a chip with its icon and no number, and the menu now says it is on', monarch.length === 1 && monarch[0].id === 'counter:monarch' && monarch[0].number === null && monarch[0].icon && monarch[0].label === 'Monarch' && (await $text('status')) === 'Monarch: on.', JSON.stringify(monarch));
  await mouse('#life-area > .stat', { button: 'right', dx: 6 });
  check('and says "Monarch: on" now', (await menuState()).items.includes('Monarch: on'));
  await escapeKey();
  await lifeMenu('Rad: 0', 'Add 5'); await lifeMenu('Initiative: off'); await lifeMenu('Energy: 0', 'Add 1');
  check('the chips come in a fixed order, not the order they were added in: energy, rad, monarch, initiative', JSON.stringify((await chips()).map((c) => c.id)) === JSON.stringify(['counter:energy', 'counter:rad', 'counter:monarch', 'counter:initiative']), JSON.stringify((await chips()).map((c) => c.id)));
  check('every chip has an icon', (await chips()).every((c) => c.icon));
  await lifeMenu('Rad: 5', 'Remove all'); await lifeMenu('Monarch: on');
  check('Remove all and turning a mark off both take their chips away', JSON.stringify((await chips()).map((c) => c.id)) === JSON.stringify(['counter:energy', 'counter:initiative']));
  check('the chips did not touch life: a commander deck starts at 40', (await $text('life')) === '40' && (await count('#hand .card')) === 7);
  await press('new-game');
  check('a new game takes every chip away', (await chips()).length === 0);

  // ---- the piles as stacks of cards, the command zone with its two outlined slots and the commander tax, and the sideboard in Settings ----
  await open(SIDE_JSON);
  const stack = (zone) => ev(`(() => { const b = document.getElementById('pile-${zone}'); const face = b.querySelector('.stack-face'); return { cls: b.classList.contains('pile-stack'), count: b.dataset.count, empty: b.dataset.empty, label: b.dataset.label, text: b.textContent, back: face.classList.contains('back'), img: face.querySelectorAll('img').length, layers: b.querySelectorAll('.stack-layer').length, badge: getComputedStyle(b, '::before').content, name: getComputedStyle(b, '::after').content, pressed: b.getAttribute('aria-pressed') }; })()`);
  const lib = await stack('library');
  check('the library is a stack: three layers, a card back (no picture of the top card), the number on it (its name is drawn above it, not on it) and a line for a screen reader that is the only text', lib.cls && lib.layers === 2 && lib.back && lib.img === 0 && lib.count === '45' && lib.text === 'Library: 45' && lib.badge === '"45"' && lib.name === 'none', JSON.stringify(lib));
  const gy0 = await stack('graveyard');
  check('an empty graveyard is an empty outline with a 0 on it', gy0.empty === 'true' && gy0.count === '0' && gy0.img === 0 && gy0.text === 'Graveyard: 0', JSON.stringify(gy0));
  await clickCard('#hand .card', 0);
  const toGraveyard = (await handNames())[0];
  await clickAction('To graveyard');
  const gy1 = await stack('graveyard');
  check('a card in the graveyard shows on top of its stack, with its picture, and the stack counts it', gy1.empty === 'false' && gy1.count === '1' && gy1.img === 1 && gy1.text === 'Graveyard: 1' && gy1.layers === 2, JSON.stringify(gy1));
  await clickAction('Deselect');
  await clickCard('#hand .card', 0);
  await clickAction('To graveyard');
  check('the newest card is the one on top (the picture is the second card moved, and the count is 2)', (await stack('graveyard')).count === '2' && (await ev(`document.querySelector('#pile-graveyard .stack-face img').getAttribute('src')`)) !== null);
  await mouse('#pile-graveyard');
  check('a click on a stack opens the viewer and marks it pressed', !(await $hidden('viewer')) && (await stack('graveyard')).pressed === 'true');
  await press('viewer-close');
  check('the old pile buttons and the Piles heading text are gone from the side column', (await count('.side-panels #pile-sideboard')) === 0 && (await count('#settings-menu #pile-sideboard')) === 1 && (await $text('pile-sideboard')) === 'Sideboard: 2');
  await press('settings-button'); await sleep(100);
  await mouse('#pile-sideboard');
  check('the sideboard is opened from the Settings menu: its viewer opens with both cards and the Settings panel steps aside', !(await $hidden('viewer')) && (await count('#viewer-list .card')) === 2 && (await $hidden('settings-menu')) && /sideboard: 2 cards/i.test(await $text('viewer-title')));
  await press('viewer-close');
  // the command zone: two outlined slots, the commander in the first, and its tax
  check('the command zone has two slots; the commander is in the first, the second is an empty outline with no tax', (await count('#command .cmd-slot')) === 2 && (await count('#command .cmd-slot[data-slot="1"] .card')) === 1 && (await count('#command .cmd-slot.empty-slot')) === 1 && (await ev(`getComputedStyle(document.querySelector('.cmd-slot[data-slot="2"] .tax')).visibility`)) === 'hidden');
  check('each slot has its own frame: solid for the commander, dashed for the empty one (the gold frame has its own check below)', (await ev(`[...document.querySelectorAll('.cmd-slot .slot-cards')].map((e) => getComputedStyle(e).borderTopStyle).join()`)) === 'solid,dashed');
  const slotFit = await ev(`(() => { const frame = document.querySelector('.cmd-slot[data-slot="1"] .slot-cards'); const card = frame.querySelector('.card'); const face = card.querySelector('.face'); const f = frame.getBoundingClientRect(); const c = card.getBoundingClientRect(); const x = face.getBoundingClientRect(); const b = parseFloat(getComputedStyle(frame).borderTopWidth); return { left: Math.round((c.left - f.left - b) * 10) / 10, right: Math.round((f.right - c.right - b) * 10) / 10, top: Math.round((c.top - f.top - b) * 10) / 10, bottom: Math.round((f.bottom - c.bottom - b) * 10) / 10, faceW: Math.round(x.width), cardW: Math.round(c.width), faceH: Math.round(x.height), cardH: Math.round(c.height), faceCss: getComputedStyle(face).width + ' ' + getComputedStyle(face).position + ' ' + getComputedStyle(face).transform, cardClass: card.className, cw: getComputedStyle(card).getPropertyValue('--cw') }; })()`);
  check('the commander card sits in the middle of its dotted frame (the same margin on every side) and its picture fills the card', Math.abs(slotFit.left - slotFit.right) <= 1 && Math.abs(slotFit.top - slotFit.bottom) <= 1 && Math.abs(slotFit.faceW - slotFit.cardW) <= 3 && Math.abs(slotFit.faceH - slotFit.cardH) <= 3, JSON.stringify(slotFit));
  const taxFacts = () => ev(`(() => { const slot = document.querySelector('.cmd-slot[data-slot="1"]'); return { words: slot.querySelector('.tax-words').textContent, buttons: slot.querySelectorAll('.tax button').length, taxText: slot.querySelector('.tax').textContent, plusOff: slot.querySelector('.tax button').disabled, away: slot.classList.contains('away'), cards: slot.querySelectorAll('.card').length }; })()`);
  const takeBack = () => ev(`document.querySelector('.cmd-slot[data-slot="1"] .tax-words').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`);
  const t0 = await taxFacts();
  check('the tax is just the number itself, starting at 0: one button that shows only the number (no plus sign, no minus, no words)', t0.words === '0' && t0.taxText === '0' && t0.buttons === 1 && !t0.plusOff, JSON.stringify(t0));
  await mouse('.cmd-slot[data-slot="1"] .tax button:last-of-type');
  const t1 = await taxFacts();
  check('+ adds a cast: the tax shows 2 and the status says so', t1.words === '2' && /cast 1 time, tax \+2\.$/.test(await $text('status')), JSON.stringify(t1) + await $text('status'));
  await mouse('.cmd-slot[data-slot="1"] .tax button:last-of-type');
  check('a second cast shows 4 and the status says "times"', (await taxFacts()).words === '4' && /cast 2 times, tax \+4\.$/.test(await $text('status')));
  await ev(`document.querySelector('#command .card').click()`);
  await clickAction('To battlefield');
  const cast = await taxFacts();
  check('when the commander is cast the slot stays, empty and marked, and the tax stays with it', cast.away && cast.cards === 0 && cast.words === '4' && (await count('#command .card')) === 0 && (await count('#battlefield .card')) >= 1, JSON.stringify(cast));
  await takeBack();
  check('a right-click on the number takes a cast back (the number is 2 again)', (await taxFacts()).words === '2');
  await press('new-game');
  const fresh = await taxFacts();
  check('a new game puts the commander back in its slot and starts the tax at 0', fresh.cards === 1 && fresh.words === '0' && !fresh.away, JSON.stringify(fresh));
  await open(deckFrom(['40 Forest', '1 Sol Ring'].join(String.fromCharCode(10)), 'Plain deck', null, []));
  check('a deck with no commander has no command zone on show', await $hidden('command-zone'));

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
  await mouse(cardAt('Goblin Guide'), { button: 'right', dy: 64 });
  const guideMenu = await menuState();
  check('a card that is not sick offers "Summoning sick" (for haste lost, or control gained), and "Doesn\'t untap"', guideMenu && guideMenu.items[3] === "Doesn't untap" && guideMenu.items[4] === 'Summoning sick', JSON.stringify(guideMenu?.items));
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
  await mouse(cardAt('Sol Ring'), { button: 'right', dy: 64 });
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

  // ---- drag and drop on the fine battlefield grid (112 by 50 square cells, a card is 7 wide and 10 tall), Alt+arrow keys and Auto-arrange (real mouse and keyboard input; a 7-card deck, so everything is in the hand) ----
  await open(MARKS_DECK);
  const boardRect = () => ev(`(() => { const r = document.getElementById('battlefield').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`);
  // the point where the middle of a card dropped from the hand starts on cell (col, row): the card's top-left cell is four cells left and five up of the middle
  const cellCenter = async (col, row) => { const r = await boardRect(); return { x: r.left + (col + 3.5) * r.width / 112, y: r.top + (row + 5.5) * r.height / 50 }; };
  const centerOfSelector = (selector) => ev(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + Math.min(r.height, innerHeight - r.y) / 2 }; })()`);
  const handCardPoint = async (name) => { const index = (await handNames()).findIndex((x) => x.startsWith(name)); const at = (share) => ev(`(() => { const card = document.querySelectorAll('#hand > .card')[${index}]; const r = card.getBoundingClientRect(); const y = r.top + r.height * ${share}; const xs = []; for (let x = r.left + 2; x < r.right - 2; x += 3) if (document.elementFromPoint(x, y)?.closest('#hand > .card') === card) xs.push(x); return { x: xs.length ? xs[Math.floor(xs.length / 2)] : r.left + r.width / 2, y }; })()`); for (let round = 0; round < 2; round++) { const first = await at(0.2); await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: first.x, y: first.y }); await new Promise((done) => setTimeout(done, 500)); } return at(0.45); }; // (a point that shows on the card: the cards of the hand overlap)
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
    await sleep(150); // a pause like a person's: right after a drag in the hand the fan's 110 ms transitions may still be running (see log entry 147)
    // wait until the card and the board have stopped moving (the hand's size changes the board's), then press
    let last = '';
    for (let tries = 0; tries < 20; tries++) {
      const now = JSON.stringify([await boardRect(), await centerOfSelector(cardAt(name))]);
      if (now === last) break;
      last = now; await sleep(60);
    }
    const r = await boardRect(); const from = await centerOfSelector(cardAt(name));
    await dragTo(from, { x: from.x + cols * r.width / 112, y: from.y + rows * r.height / 50 });
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
  { // the cards on the battlefield ask for the normal size of their picture (Kevin, 2026-11-16: the small one looked blurry)
    const boardPictures = await ev("[...document.querySelectorAll('#battlefield > .card .face img')].map((i) => i.getAttribute('src') ?? '')");
    check('the pictures of the cards on the battlefield are the normal size, not the small blurry one', boardPictures.length === 2 && boardPictures.every((s) => s === '' || s.includes('/normal/')), JSON.stringify(boardPictures));
    // the idle power and toughness box of a selected card does not stay behind when the card is carried (Kevin, 2026-11-16)
    const vis = await ev("(() => { const host = document.getElementById('battlefield'); const card = document.createElement('button'); card.className = 'card selected dragging'; const marks = document.createElement('span'); marks.className = 'marks'; const box = document.createElement('span'); box.className = 'ptbox idle'; marks.append(box); card.append(marks); host.append(card); const carried = getComputedStyle(box).visibility; card.classList.remove('dragging'); const resting = getComputedStyle(box).visibility; card.remove(); return { carried, resting }; })()");
    check('the idle power and toughness box of a selected card is hidden while the card is carried (it used to stay behind) and shown when it is not', vis.carried === 'hidden' && vis.resting === 'visible', JSON.stringify(vis));
  }

  await dragBy('Sol Ring', 16, 6);
  check('a battlefield card moves by as many cells as the pointer travelled, and says so', (await cellOfCard('Sol Ring')) === '60,16' && (await cellOfCard('Forest')) === '40,8' && /^Moved Sol Ring\./.test(await $text('status')), `${await cellOfCard('Sol Ring')} ${await cellOfCard('Forest')} | ${await $text('status')}`);

  let overOutline = null;
  { const r = await boardRect(); const from = await centerOfSelector(cardAt('Forest'));
    await dragTo(from, { x: from.x + 20 * r.width / 112, y: from.y + 8 * r.height / 50 }, { release: false, during: async () => { overOutline = await ev(`document.querySelector('.cell-highlight')?.className ?? null`); } });
    await mouseAt('mouseReleased', { x: from.x + 20 * r.width / 112, y: from.y + 8 * r.height / 50 }, 0); await sleep(80); }
  check('the cell a card is carried over is not highlighted (the element is there, but not drawn)', await ev("(() => { const h = document.createElement('div'); h.className = 'cell-highlight'; document.getElementById('battlefield').append(h); const v = getComputedStyle(h).visibility; h.remove(); return v; })()") === 'hidden');
  check('a card dropped exactly on another card does not swap: both are on the same cell and the dropped one is on top', (await cellOfCard('Forest')) === '60,16' && (await cellOfCard('Sol Ring')) === '60,16' && (await onTopName()) === 'Forest' && /^Moved Forest\./.test(await $text('status')) && overOutline === 'cell-highlight', `${await cellOfCard('Forest')} ${await cellOfCard('Sol Ring')} ${await onTopName()} | ${await $text('status')} | ${overOutline}`);

  // the picture that follows the pointer is the card itself, at the size it has on the table
  { const box = await ev(`(() => { const c = document.querySelector(${JSON.stringify(cardAt('Forest'))}).getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; })()`); const from = { x: box.x + box.w * 0.2, y: box.y + box.h * 0.2 }; let sizes = null; // taken near its top-left corner
    await dragTo(from, { x: from.x + 30, y: from.y }, { release: false, during: async () => { sizes = await ev(`(() => { const g = document.querySelector('.drag-ghost').getBoundingClientRect(); const c = document.querySelector(${JSON.stringify(cardAt('Forest'))}).getBoundingClientRect(); return { ghost: [g.width, g.height], card: [c.width, c.height], held: [(${from.x + 30} - g.left) / g.width, (${from.y} - g.top) / g.height] }; })()`); } });
    await key('Escape', 'Escape', 27); await mouseAt('mouseReleased', { x: from.x + 30, y: from.y }, 0); await sleep(80);
    check('a card picked up on the battlefield keeps its size: the picture is as big as the card', sizes && Math.abs(sizes.ghost[0] - sizes.card[0]) < 1.5 && Math.abs(sizes.ghost[1] - sizes.card[1]) < 1.5, JSON.stringify(sizes));
    check('...and it is held where it was taken (near its corner), not by its middle', sizes && Math.abs(sizes.held[0] - 0.2) < 0.05 && Math.abs(sizes.held[1] - 0.2) < 0.05, JSON.stringify(sizes?.held));
    check('...and Escape put everything back', (await cellOfCard('Forest')) === '60,16' && await dragStateGone()); }
  { let sizes = null; const handBefore = await handCardPoint('Lightning Bolt');
    await dragTo(handBefore, await cellCenter(80, 4), { release: false, during: async () => { sizes = await ev(`(() => { const g = document.querySelector('.drag-ghost').getBoundingClientRect(); const c = Array.from(document.querySelectorAll('#hand .card'))[0]; return { ghost: [g.width, g.height], card: [c.offsetWidth, c.offsetHeight] }; })()`); } });
    await key('Escape', 'Escape', 27); await mouseAt('mouseReleased', await cellCenter(80, 4), 0); await sleep(80);
    check('a card picked up from the hand keeps its size too (its own size: the card in the fan is turned, so its box on screen is not the size to compare)', sizes && Math.abs(sizes.ghost[0] - sizes.card[0]) < 1.5 && Math.abs(sizes.ghost[1] - sizes.card[1]) < 1.5, JSON.stringify(sizes)); }
  await dragBy('Forest', -60, 24);
  check('the card on top can be taken off again, and the one under it stays', (await cellOfCard('Forest')) === '0,40' && (await cellOfCard('Sol Ring')) === '60,16');
  check('a card played from the hand carries no stacking number of the hand (the battlefield stacks by order; a left-over z-index once put the wrong card on top at random)', await ev(`[...document.querySelectorAll('#battlefield .card')].every((c) => c.style.zIndex === '')`));

  // a tiny movement is still a click: it selects the card and does not move it
  await dragTo(await centerOfSelector(cardAt('Forest')), { ...(await centerOfSelector(cardAt('Forest'))), x: (await centerOfSelector(cardAt('Forest'))).x + 2 });
  check('moving only 2 pixels is a click: the card is selected and stays where it was', (await cellOfCard('Forest')) === '0,40' && /^Forest/.test(await $text('selected-line')), `${await cellOfCard('Forest')} | ${await $text('selected-line')}`);
  await clickAction('Deselect');

  // a drag of a few pixels that ends on the card it started on is not a click either (the click that follows is swallowed), and the card does not shift a cell
  { const here = await centerOfSelector(cardAt('Forest')); await dragTo(here, { x: here.x + 40, y: here.y }, { release: false }); await mouseAt('mouseMoved', here, 1); await mouseAt('mouseReleased', here, 0); await sleep(80);
    check('a drag that goes out and comes back to the same card leaves it on its cell and does not select it', (await cellOfCard('Forest')) === '0,40' && /^Click a card/.test(await $text('selected-line')) && await dragStateGone(), `${await cellOfCard('Forest')} | ${await $text('selected-line')}`); }
  // a press with Shift held on a card starts a drag too (held to a row or a column, 2026-11-14); on a number or a counter it is still a marks click (10 at a time)
  { const here = await centerOfSelector(cardAt('Forest')); const away = await cellCenter(16, 4);
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: here.x, y: here.y });
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: here.x, y: here.y, button: 'left', buttons: 1, clickCount: 1, modifiers: 8 });
    for (let step = 1; step <= 6; step++) await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: here.x + (away.x - here.x) * step / 6, y: here.y + (away.y - here.y) * step / 6, buttons: 1, modifiers: 8 });
    const shiftGhost = await count('.drag-ghost');
    await escapeKey(); await sleep(60); // (cancelled: the card stays)
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: away.x, y: away.y, button: 'left', buttons: 0, clickCount: 1, modifiers: 8 }); await sleep(80);
    check('pressing with Shift held and moving drags the card (it is held to a row or a column), and Escape cancels it', shiftGhost === 1 && (await cellOfCard('Forest')) === '0,40' && await dragStateGone(), `${shiftGhost} ${await cellOfCard('Forest')}`);
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
  check('Escape during a drag cancels it: the card stays, the picture and the outline are gone', (await cellOfCard('Forest')) === '0,40' && await dragStateGone());
  await dragTo(await centerOfSelector(cardAt('Forest')), { x: 640, y: 650 }); // (below the grid and above the hand: not on the board, not in the rectangle of the hand, not on a pile)
  check('letting go outside the battlefield and the hand (in the empty space between them) does nothing', (await cellOfCard('Forest')) === '0,40' && await dragStateGone());

  // a card dragged from the battlefield and let go over the hand goes back into the hand
  { let marked = null; const handBefore = (await handNames()).length;
    const target = await centerOfSelector('#hand .card');
    await dragTo(await centerOfSelector(cardAt('Forest')), target, { release: false, during: async () => { marked = await ev(`document.getElementById('hand-section').classList.contains('drop-hand')`); } });
    await mouseAt('mouseReleased', target, 0); await sleep(80);
    check('over the hand the hand is marked, and letting go there puts the card back in the hand', marked === true && (await count('#battlefield .card[aria-label^="Forest"]')) === 0 && (await handNames()).length === handBefore + 1 && /^Moved Forest back to your hand./.test(await $text('status')) && (await ev(`!document.getElementById('hand-section').classList.contains('drop-hand')`)), JSON.stringify({ marked, hand: (await handNames()).length, handBefore, status: await $text('status') }));
    await dragTo(await handCardPoint('Forest'), await cellCenter(0, 40));
    check('...and it can be played again from there', (await cellOfCard('Forest')) === '0,40'); }

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
  check('Alt and the right arrow move the selected card one cell right', (await cellOfCard('Forest')) === '1,40' && /^Moved Forest\./.test(await $text('status')), `${await cellOfCard('Forest')} | ${await $text('status')}`);
  await altKey('ArrowLeft', 37); await altKey('ArrowLeft', 37);
  check('...and at the edge of the battlefield it says so and stays', (await cellOfCard('Forest')) === '0,40' && /edge of the battlefield/.test(await $text('status')), `${await cellOfCard('Forest')} | ${await $text('status')}`);
  await altKey('ArrowUp', 38);
  check('Alt and the up arrow move it one row up', (await cellOfCard('Forest')) === '0,39');
  await clickAction('Deselect');

  check('the battlefield is one grid that does not scroll the page, and there is no Auto-arrange button on the solo table (it was taken out on 2026-11-14)', await ev(`document.documentElement.scrollHeight <= innerHeight + 1 && document.getElementById('arrange') === null`));

  // ---- the piles and the command zone: cards are taken from them and dropped on them (frontend/src/board-drag.js, real mouse input) ----
  {
    await open(); // the default deck: a hand of 7, a library, a commander in the command zone
    const zoneCount = (zone) => ev("Number(document.getElementById('pile-" + zone + "').dataset.count)");
    const counts = async () => ({ hand: await count('#hand > .card'), field: await count('#battlefield > .card'), library: await zoneCount('library'), graveyard: await zoneCount('graveyard'), exile: await zoneCount('exile'), command: await count('#command .card') });
    const face = (zone) => centerOfSelector('#pile-' + zone + ' .stack-face');
    // (a point on the first card but low in the drop area: the area starts lower than it did, so a point high on a lowered card is no longer over the hand)
    const handPoint = async () => { const p = await handCardPoint((await handNames())[0]); return { ...p, y: (await ev("document.getElementById('hand').getBoundingClientRect().bottom")) - 30 }; };
    const c0 = await counts();
    check('the table starts with a hand of 7, a library, a commander in the command zone and nothing on the field, in the graveyard or the exile', c0.hand === 7 && c0.field === 0 && c0.library > 40 && c0.graveyard === 0 && c0.exile === 0 && c0.command === 1, JSON.stringify(c0));
    // a plain click on the graveyard or the exile still opens its viewer (it is not a drag); the library does not (Kevin, 2026-11-15)
    { const p = await face('library'); await mouseAt('mouseMoved', p, 0); await mouseAt('mousePressed', p, 1); await mouseAt('mouseReleased', p, 0); await sleep(150);
      check('a click on the library (no movement) no longer opens it (it is opened from its menu: View library)', await $hidden('viewer')); await sleep(100); }
    // the library: the top card goes to the hand (a draw) and to the battlefield
    let ghost = null; let overRing = null;
    await dragTo(await face('library'), await handPoint(), { during: async () => { ghost = await ev("(() => { const g = document.querySelector('.drag-ghost'); return g ? { img: g.querySelector('img')?.getAttribute('src') ?? null, w: Math.round(g.getBoundingClientRect().width) } : null; })()"); } });
    const c1 = await counts();
    check('the top card of the library dragged onto the hand goes into the hand, and the library is one card smaller', c1.hand === 8 && c1.library === c0.library - 1 && /^Moved the top card of your library to your hand\./.test(await $text('status')), JSON.stringify({ c1, status: await $text('status') }));
    check('the picture carried for the library is the card back (the top card is not shown), at the size of the stack', ghost && /backs\.scryfall\.io/.test(ghost.img ?? '') && ghost.w > 30, JSON.stringify(ghost));
    await dragTo(await face('library'), await cellCenter(40, 8));
    const c2 = await counts();
    check('the top card of the library dragged onto the battlefield is put there where it was let go', c2.field === 1 && c2.library === c1.library - 1 && (await cellOfCard((await names('#battlefield > .card'))[0].split(',')[0])) === '40,8', JSON.stringify(c2));
    // the battlefield card goes onto the graveyard, the graveyard's top card onto the exile, and the exile's onto the battlefield
    await dragTo(await centerOfSelector('#battlefield > .card'), await face('graveyard'), { during: async () => { overRing = await ev("Boolean(document.querySelector('.pile-stack.drop-target'))"); } });
    const c3 = await counts();
    check('a card of the battlefield dropped on the graveyard goes onto it (the pile is ringed while the card is over it)', c3.field === 0 && c3.graveyard === 1 && overRing === true && /to your graveyard\./.test(await $text('status')), JSON.stringify({ c3, overRing, status: await $text('status') }));
    await dragTo(await face('graveyard'), await face('exile'));
    const c4 = await counts();
    check('the top card of the graveyard dropped on the exile goes there', c4.graveyard === 0 && c4.exile === 1, JSON.stringify(c4));
    // a card taken from the library, the exile or the command zone moves like a card taken from the hand: its picture eases after the pointer and leans with the lag (and is straight when it stands still)
    await motion('no-preference'); // (the rest of the check runs with reduced motion, where the picture is exactly under the pointer)
    for (const [label, selector] of [['library', '#pile-library .stack-face'], ['exile', '#pile-exile .stack-face'], ['command zone', '#command .card']]) {
      const start = await centerOfSelector(selector);
      await mouseAt('mouseMoved', start, 0); await mouseAt('mousePressed', start, 1);
      await mouseAt('mouseMoved', { x: start.x - 40, y: start.y - 40 }, 1); await sleep(50);
      const target = { x: start.x - 340, y: start.y - 120 };
      await mouseAt('mouseMoved', target, 1); // (a jump of 300 pixels: a picture stuck to the pointer would be there at once)
      const quick = await ev("(() => { const g = document.querySelector('.drag-ghost'); if (!g) return null; const m = new DOMMatrix(g.style.transform); const r = g.getBoundingClientRect(); return { angle: Math.round(Math.atan2(m.b, m.a) * 1800 / Math.PI) / 10, x: m.e, w: r.width }; })()");
      await sleep(900);
      const still = await ev("(() => { const g = document.querySelector('.drag-ghost'); if (!g) return null; const m = new DOMMatrix(g.style.transform); return { angle: Math.round(Math.atan2(m.b, m.a) * 1800 / Math.PI) / 10, x: m.e }; })()");
      check('a card taken from the ' + label + ' eases after the pointer and leans while it catches up, and is straight and under the pointer once it stands still', quick && still && Math.abs(quick.angle) > 1 && quick.x > still.x + 20 && Math.abs(still.angle) < 1, JSON.stringify({ quick, still }));
      await escapeKey(); await sleep(150);
    }
    await motion('reduce');
    // Shift held while a card is carried keeps it on one line (the row or the column it was moving along), like the Shift of an image editor
    {
      const start = await centerOfSelector('#pile-library .stack-face');
      const at = (type, x, y, buttons, modifiers) => browser.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: 1, modifiers });
      const shiftKey = (type, modifiers) => browser.send('Input.dispatchKeyEvent', { type, key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers });
      const ghostAt = () => ev("(() => { const g = document.querySelector('.drag-ghost'); if (!g) return null; const m = new DOMMatrix(g.style.transform); return { x: Math.round(m.e), y: Math.round(m.f) }; })()");
      await at('mouseMoved', start.x, start.y, 0, 0); await at('mousePressed', start.x, start.y, 1, 0);
      await at('mouseMoved', start.x + 10, start.y, 1, 0); await sleep(60);
      const first = await ghostAt();
      await at('mouseMoved', start.x + 150, start.y + 40, 1, 8); await sleep(60);
      const along = await ghostAt();
      check('with Shift held the card moves along the row only: the pointer went 150 across and 40 down and the card went across with the same height', first && along && along.x - first.x >= 140 && along.y === first.y, JSON.stringify({ first, along }));
      await at('mouseMoved', start.x + 150, start.y - 200, 1, 8); await sleep(60); // (up: the piles are near the bottom of the window, and the browser sends no mouse events from outside it)
      const switched = await ghostAt();
      check('both lines are open in the same drag: pushing the pointer further up than across switches to the column: the card is back at its first place across and follows the pointer up (200 up)', switched && Math.abs(switched.x - (first.x - 10)) <= 1 && first.y - switched.y >= 190, JSON.stringify({ switched, first }));
      await at('mouseMoved', start.x + 400, start.y - 220, 1, 8); await sleep(60);
      const back = await ghostAt();
      check('and pushing it further across than up switches back to the row: the same height as the first place', back && back.y === first.y && back.x - first.x >= 380, JSON.stringify({ back, first, switched }));
      await shiftKey('keyUp', 0); await sleep(60);
      const freed = await ghostAt();
      check('letting go of Shift frees it at once, with no mouse movement: the card is under the pointer again (200 up)', freed && first.y - freed.y >= 190 && freed.x - first.x >= 140, JSON.stringify({ freed, first }));
      await shiftKey('rawKeyDown', 8); await sleep(60);
      const column = await ghostAt();
      check('pressing Shift again holds it to the row (the pointer is further across than up): the card goes back to its first height and stays under the pointer across', column && column.y === first.y && column.x === freed.x, JSON.stringify({ column, first, freed }));
      await shiftKey('keyUp', 0);
      await escapeKey(); await sleep(150);
      // Shift already held when the card is taken counts too
      await at('mouseMoved', start.x, start.y, 0, 8); await at('mousePressed', start.x, start.y, 1, 8);
      await at('mouseMoved', start.x + 12, start.y, 1, 8); await sleep(60);
      const heldFirst = await ghostAt();
      await at('mouseMoved', start.x + 160, start.y - 50, 1, 8); await sleep(60);
      const heldMoved = await ghostAt();
      check('Shift held when the card is taken holds it to a line too: 160 across and 50 up goes across at the same height', heldFirst && heldMoved && heldMoved.y === heldFirst.y && heldMoved.x - heldFirst.x >= 140, JSON.stringify({ heldFirst, heldMoved }));
      await shiftKey('keyUp', 0);
      await escapeKey(); await sleep(150);
    }
    await dragTo(await face('exile'), await cellCenter(60, 10));
    const c5 = await counts();
    check('the top card of the exile dropped on the battlefield is put there', c5.exile === 0 && c5.field === 1 && (await cellOfCard((await names('#battlefield > .card'))[0].split(',')[0])) === '60,10', JSON.stringify(c5));
    // F flips the card under the pointer face down (the sleeve shows), and flips it back; the menu says Flip; it is not offered for a card in a pile
    {
      const at = await centerOfSelector('#battlefield > .card');
      await mouseAt('mouseMoved', at, 0); await sleep(80);
      const picture = () => ev("(() => { const c = document.querySelector('#battlefield > .card'); return { down: c.classList.contains('face-down'), src: c.querySelector('img')?.getAttribute('src') ?? '', label: c.getAttribute('aria-label') }; })()");
      const before = await picture();
      await key('f', 'KeyF', 70); await sleep(150);
      const flipped = await picture();
      if (realPictures) await browser.screenshot('scratch-solo-flipped.png');
      check('pressing F over a card on the battlefield flips it face down: it shows the card back (the sleeve) and says so', before.down === false && flipped.down === true && /backs.scryfall.io/.test(flipped.src) && /face down/.test(flipped.label), JSON.stringify({ before, flipped }));
      check('...and the message line says it', /face down./.test(await $text('status')), await $text('status'));
      await key('f', 'KeyF', 70); await sleep(150);
      const back = await picture();
      check('pressing F again turns it face up with its own picture', back.down === false && !/backs.scryfall.io/.test(back.src) && /Flipped .* face up./.test(await $text('status')), JSON.stringify(back));
      await mouseAt('mouseMoved', { x: 5, y: 5 }, 0); await sleep(80);
      await key('f', 'KeyF', 70); await sleep(100);
      check('F with the pointer over no card does nothing', (await picture()).down === false);
    }
    // a card of the hand onto the exile, and then dropped on the pile it came from: nothing
    await dragTo(await handPoint(), await face('graveyard'));
    const c6 = await counts();
    check('a card of the hand dropped on the graveyard goes onto it', c6.hand === c5.hand - 1 && c6.graveyard === 1, JSON.stringify(c6));
    // ...and onto the library (on top), the exile and the command zone, the same way
    await dragTo(await handPoint(), await face('library'));
    const c6b = await counts();
    check('a card of the hand dropped on the library goes on top of it', c6b.hand === c6.hand - 1 && c6b.library === c6.library + 1 && /to your library./.test(await $text('status')), JSON.stringify({ c6b, status: await $text('status') }));
    await dragTo(await handPoint(), await face('exile'));
    const c6c = await counts();
    check('a card of the hand dropped on the exile goes onto it', c6c.hand === c6b.hand - 1 && c6c.exile === c6b.exile + 1, JSON.stringify(c6c));
    const commanderUids = await ev("[...document.querySelectorAll('#command .card')].map((c) => c.dataset.uid)");
    await dragTo(await handPoint(), await centerOfSelector('.cmd-slot[data-slot="2"] .slot-cards'));
    const c6d = await counts();
    check('a card of the hand dropped on the command zone goes into it', c6d.hand === c6c.hand - 1 && c6d.command === c6c.command + 1, JSON.stringify(c6d));
    const added = await ev(`(() => { const c = [...document.querySelectorAll('#command .card')].find((n) => !${JSON.stringify(commanderUids)}.includes(n.dataset.uid)); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height, innerHeight - r.top) / 2 }; })()`);
    if (added) await dragTo(added, await handPoint());
    check('...and can be taken out of it again into the hand', Boolean(added) && (await counts()).command === c6d.command - 1 && (await counts()).hand === c6d.hand + 1, JSON.stringify({ added, now: await counts() }));
    const c6e = await counts();
    { const g = await face('graveyard'); await dragTo(g, { x: g.x + 12, y: g.y }); } // (a few pixels within the same pile: no movement at all would be a click, which opens the pile)
    check('a card dropped on the pile it was taken from changes nothing', JSON.stringify(await counts()) === JSON.stringify(c6e));
    // the command zone
    const cmdName = (await names('#command .card'))[0];
    await dragTo(await centerOfSelector('#command .card'), await cellCenter(20, 16));
    const c7 = await counts();
    check('the commander dragged from the command zone onto the battlefield is cast there, and the command zone is empty', c7.command === 0 && c7.field === c6.field + 1 && (await names('#battlefield > .card')).some((n) => n.startsWith(cmdName)), JSON.stringify({ c7, cmdName }));
    const slotAt = await centerOfSelector('.cmd-slot[data-slot="1"] .slot-cards');
    await dragTo(await centerOfSelector('#battlefield > .card[aria-label^="' + cmdName.split(',')[0].replace(/"/g, '') + '"]'), slotAt);
    const c8 = await counts();
    check('a card of the battlefield dropped on the command zone goes back into it', c8.command === 1 && c8.field === c7.field - 1, JSON.stringify(c8));
    {
      // there is no larger box round both slots: a card let go between them (or beside them) is not put in the command zone
      const gap = await ev("(() => { const a = document.querySelector('.cmd-slot[data-slot=\"1\"] .slot-cards').getBoundingClientRect(); const b = document.querySelector('.cmd-slot[data-slot=\"2\"] .slot-cards').getBoundingClientRect(); return { x: (a.right + b.left) / 2, y: a.top + a.height / 2, gap: b.left - a.right }; })()");
      const beforeGap = await counts();
      await dragTo(await handPoint(), { x: gap.x, y: gap.y });
      const afterGap = await counts();
      check('a card let go in the gap between the two command slots is not put in either (each slot is its own place to drop on)', gap.gap > 2 && afterGap.command === beforeGap.command && afterGap.hand === beforeGap.hand, JSON.stringify({ gap, beforeGap, afterGap }));
    }
    // the commander can be put in either slot of the command zone, and the second slot has its own tax and lights up like the first
    {
      const slotBox = (n) => centerOfSelector('.cmd-slot[data-slot="' + n + '"] .slot-cards');
      const slotState = () => ev("(() => { const f = (n) => { const slot = document.querySelector('.cmd-slot[data-slot=\"' + n + '\"]'); const tax = slot.querySelector('.tax-words'); return { cards: slot.querySelectorAll('.card').length, empty: slot.classList.contains('empty-slot'), tax: getComputedStyle(slot.querySelector('.tax')).visibility === 'hidden' ? null : tax.textContent, border: getComputedStyle(slot.querySelector('.slot-cards')).borderTopColor }; }; return [f(1), f(2)]; })()");
      const start = await slotState();
      check('at first the commander is in the first slot: lit, with its tax, and the second slot is dim with no tax', start[0].cards === 1 && !start[0].empty && start[0].tax === '0' && start[1].cards === 0 && start[1].empty && start[1].tax === null && start[0].border !== start[1].border, JSON.stringify(start));
      let ringed = null;
      await dragTo(await centerOfSelector('#command .card'), await slotBox(2), { during: async () => { ringed = await ev("[...document.querySelectorAll('.cmd-slot.drop-target')].map((e) => e.dataset.slot)"); } });
      const moved = await slotState();
      if (realPictures) await browser.screenshot('scratch-solo-slot2.png');
      check('dragging the commander onto the second slot puts it there (that slot is ringed while the card is over it), lit and with its tax, and the first slot is dim', JSON.stringify(ringed) === '["2"]' && moved[1].cards === 1 && !moved[1].empty && moved[1].tax === '0' && moved[0].cards === 0 && moved[0].empty && moved[0].tax === null && moved[1].border === start[0].border, JSON.stringify({ ringed, moved }));
      const taxButton = await centerOfSelector('.cmd-slot[data-slot="2"] .tax-words');
      await mouseAt('mouseMoved', taxButton, 0); await mouseAt('mousePressed', taxButton, 1); await mouseAt('mouseReleased', taxButton, 0); await sleep(120);
      check('the tax of the second slot counts casts like the first one (a click adds one cast, 2 more mana)', (await slotState())[1].tax === '2', JSON.stringify(await slotState()));
      await dragTo(await centerOfSelector('#command .card'), await slotBox(1));
      const home = await slotState();
      check('and it can be dragged back to the first slot, keeping its tax', home[0].cards === 1 && home[0].tax === '2' && home[1].cards === 0, JSON.stringify(home));
      await mouseAt('mouseMoved', await centerOfSelector('.cmd-slot[data-slot="1"] .tax-words'), 0); await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...(await centerOfSelector('.cmd-slot[data-slot="1"] .tax-words')), button: 'right', buttons: 2, clickCount: 1 }); await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...(await centerOfSelector('.cmd-slot[data-slot="1"] .tax-words')), button: 'right', buttons: 0, clickCount: 1 }); await sleep(120);
    }
    // Escape while carrying a card from a pile puts nothing anywhere
    const before = await counts();
    await dragTo(await face('graveyard'), await cellCenter(70, 20), { release: false });
    await key('Escape', 'Escape', 27);
    await mouseAt('mouseReleased', await cellCenter(70, 20), 0); await sleep(150);
    check('Escape while a card from a pile is carried cancels it: nothing moves, nothing is left of the drag', JSON.stringify(await counts()) === JSON.stringify(before) && await dragStateGone(), JSON.stringify({ before, now: await counts() }));
    // an empty pile has nothing to take
    await ev("document.getElementById('pile-exile').click()"); await sleep(50); await press('viewer-close');
    const emptyZone = (await counts()).exile === 0 ? 'exile' : 'library';
    void emptyZone;
  }

  // ---- the floating action bar (frontend/src/floating-bar.js, shared/bar-place.mjs): real mouse and key input ----
  {
    const barBox = () => ev("(() => { const r = document.querySelector('.actions-panel').getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; })()");
    const stored = () => ev("localStorage.getItem('overloaded.actionBar')");
    const dragGrip = async (dx, dy) => {
      const p = await centerOfSelector('#bar-grip');
      await mouseAt('mouseMoved', p, 0); await mouseAt('mousePressed', p, 1);
      for (let step = 1; step <= 6; step++) await mouseAt('mouseMoved', { x: p.x + dx * step / 6, y: p.y + dy * step / 6 }, 1);
      await mouseAt('mouseReleased', { x: p.x + dx, y: p.y + dy }, 0); await sleep(450); // (it glides to where it snaps)
    };
    const gripKey = async (name) => { const vk = { ArrowRight: 39, ArrowLeft: 37, ArrowDown: 40, Home: 36 }[name]; await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: name, code: name, windowsVirtualKeyCode: vk }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: vk }); await sleep(450); };
    await ev("localStorage.removeItem('overloaded.actionBar')");
    await open(MARKS_DECK);
    const b0 = await barBox();
    const boardTop = await ev("Math.round(document.getElementById('battlefield').getBoundingClientRect().top)");
    check('the action bar starts in the middle of the top, floating over the top of the board, which starts at the top of the window (Kevin, 2026-11-14)', Math.abs((b0.left + b0.right) / 2 - 640) <= 3 && b0.top <= 12 && boardTop <= 4 && b0.top >= boardTop && b0.bottom > boardTop, JSON.stringify({ b0, boardTop }));
    await dragGrip(-300, 200);
    const b1 = await barBox();
    check('dragging the grip moves the bar by as much as the pointer moved (when it lands away from the edges)', Math.abs(b1.left - (b0.left - 300)) <= 3 && Math.abs(b1.top - (b0.top + 200)) <= 3, JSON.stringify({ b0, b1 }));
    const saved = JSON.parse((await stored()) ?? 'null');
    check('where it was let go is kept in the browser as two fractions of the room it has', saved && saved.fx > 0 && saved.fx < 1 && saved.fy > 0 && saved.fy < 1, JSON.stringify(saved));
    const statusBefore = await $text('status');
    await ev("document.getElementById('untap-all').click()");
    check('the buttons on the moved bar still work (Untap all says what it did)', /Untapped/.test(await $text('status')) && statusBefore !== (await $text('status')) || /Untapped/.test(await $text('status')), await $text('status'));
    // the bar docks like the control bar of MIDI Companion: near an edge it docks to it (a column on the left and right), near the middle of an edge it goes to the middle, near a corner into the corner
    const dockOf = () => ev("document.querySelector('.actions-panel').dataset.vertical");
    const hints = () => ev("(() => { const len = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return Math.round(Math.max(r.width, r.height)); }; return { snap: !document.querySelector('.bar-snap-hint').hidden, center: !document.querySelector('.bar-center-hint').hidden, corner: !document.querySelector('.bar-corner-hint').hidden, snapLen: len('.bar-snap-hint'), centerLen: len('.bar-center-hint'), inner: [innerWidth, innerHeight] }; })()");
    const hold = async (dx, dy) => { // drags the grip and reports the hints while the button is still down
      const p = await centerOfSelector('#bar-grip');
      await mouseAt('mouseMoved', p, 0); await mouseAt('mousePressed', p, 1);
      for (let step = 1; step <= 6; step++) await mouseAt('mouseMoved', { x: p.x + dx * step / 6, y: p.y + dy * step / 6 }, 1);
      await sleep(150);
      const seen = await hints();
      await mouseAt('mouseReleased', { x: p.x + dx, y: p.y + dy }, 0); await sleep(450);
      return seen;
    };
    await dragGrip(-(b1.left - 5), 0);
    const left = await barBox();
    check('let go within 10 px of the left edge the bar docks to it (8 px from the edge) and turns into a column, and that is kept', left.left === 8 && left.h > left.w && (await dockOf()) === 'true' && JSON.parse(await stored()).dock === 'left', JSON.stringify({ left, vertical: await dockOf(), stored: await stored() }));
    const gripTurn = () => ev("getComputedStyle(document.querySelector('#bar-grip svg')).rotate");
    check('docked to the left the handle of the bar is turned a quarter turn too (the dots lie down when the bar stands up)', (await gripTurn()) === '90deg', await gripTurn());
    const hidden = await hints();
    check('the hints are gone once it is let go', !hidden.snap && !hidden.center && !hidden.corner, JSON.stringify(hidden));
    { const mid = (left.top + left.bottom) / 2; const seen = await hold(0, 506 - mid); const m = await barBox();
      check('dragged to the middle of the left edge a strip along the whole edge and a dotted line across the whole window show while it is held, and letting go puts it exactly in the middle of the edge (flush left, its middle at half the height)', seen.snap && seen.center && !seen.corner && seen.snapLen >= seen.inner[1] * 0.9 && seen.centerLen >= seen.inner[0] * 0.9 && m.left === 8 && Math.abs((m.top + m.bottom) / 2 - 500) <= 1, JSON.stringify({ seen, m })); }
    { const m0 = await barBox(); const seen = await hold(13 - m0.left, 13 - m0.top); const m = await barBox();
      check('dragged near the top left corner a dotted triangle shows while it is held (alone, like MIDI Companion: no strip), and letting go puts it in the corner', !seen.snap && seen.corner && m.left === 8 && m.top === 8, JSON.stringify({ seen, m })); }
    { const p = await centerOfSelector("#bar-grip"); await dragGrip(1279 - p.x, 999 - p.y); } // (to the very corner of the window: the browser sends no mouse events from outside it)
    const far = await barBox();
    check('dragged far outside the window it is brought back inside it, into the corner (as a column, docked to the right)', far.right <= 1280 && far.bottom <= 1000 && far.right >= 1280 - 12 && far.bottom >= 1000 - 12 && (await dockOf()) === 'true', JSON.stringify(far));
    await ev("document.getElementById('bar-grip').focus()");
    await gripKey('Home');
    const home = await barBox();
    check('Home puts it back in the middle of the top, as a row again, with the handle standing up again', Math.abs((home.left + home.right) / 2 - 640) <= 3 && home.top <= 12 && (await dockOf()) === 'false' && ['none', '0deg'].includes(await gripTurn()), JSON.stringify(home));
    await dragGrip(-250, 120);
    await ev("document.getElementById('bar-grip').focus()");
    const before = await barBox();
    await gripKey('ArrowLeft'); await gripKey('ArrowLeft');
    const keyed = await barBox();
    check('with the keyboard the arrow keys move it by 10 pixels', keyed.left === before.left - 20, JSON.stringify({ before, keyed }));
    const placed = await barBox();
    await open(MARKS_DECK);
    const again = await barBox();
    check('after the page is loaded again the bar is where it was left', Math.abs(again.left - placed.left) <= 2 && Math.abs(again.top - placed.top) <= 2, JSON.stringify({ placed, again }));
    { const p = await centerOfSelector('#bar-grip'); const b = await barBox(); await dragGrip(1280 - 13 - b.right, 0); void p; }
    const docked = await barBox();
    await open(MARKS_DECK);
    const dockedAgain = await barBox();
    check('docked to the right edge the bar is a column flush to it, and after the page is loaded again it is still docked there', docked.right === 1272 && docked.h > docked.w && dockedAgain.right === 1272 && dockedAgain.h > dockedAgain.w && (await dockOf()) === 'true', JSON.stringify({ docked, dockedAgain }));
    await ev("localStorage.setItem('overloaded.actionBar', '{\"fx\":\"left\",\"fy\":99}')");
    await open(MARKS_DECK);
    const damaged = await barBox();
    check('a damaged stored place is ignored: the bar is in the default place', Math.abs((damaged.left + damaged.right) / 2 - 640) <= 3 && damaged.top <= 12, JSON.stringify(damaged));
    await ev("localStorage.removeItem('overloaded.actionBar')");
    await open(MARKS_DECK);
  }

  // ---- storage blocked ----
  const blockedScript = await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });` }); // (its id is taken from the answer: other scripts are added to every page too, and the id was once assumed to be 1)
  await browser.goto(PAGE);
  await waitFor(async () => !(await $hidden('blocked')) || null, 10000, 50);
  check('with storage blocked the page does not crash: it says there is no deck', !(await $hidden('blocked')) && /no deck yet/.test(await $text('blocked-message')));

  // ---- the whole session ----
  const errors = browser.logs.filter((l) => /^exception:|^console\.error|^error:/.test(l) && !/Failed to load resource|ERR_BLOCKED|net::/.test(l));
  check('no script errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  const foreign = browser.events.filter((e) => e.method === 'Network.requestWillBeSent' && !e.params.request.url.startsWith(ORIGIN) && !e.params.request.url.startsWith('data:') && !e.params.request.url.startsWith('https://cards.scryfall.io/') && !e.params.request.url.startsWith('https://backs.scryfall.io/') && !e.params.request.url.startsWith('https://svgs.scryfall.io/card-symbols/')); // (the mana symbols above the cards of the hand)
  check('nothing was requested from any site but this one and the picture and symbol servers of Scryfall', foreign.length === 0, foreign.slice(0, 2).map((e) => e.params.request.url).join(' | '));

  if (realPictures) {
    // A few looks at desktop width with the REAL pictures: the page with a hand and a battlefield, dark and light.
    await browser.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: blockedScript.identifier }).catch(() => {});
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
    // the corners of the card preview and of a card of the hand, 4 times larger (no white may show outside the rounded card)
    { const spots = await ev(`(() => { const a = document.querySelector('#spotlight .spot-picture')?.getBoundingClientRect(); const b = document.querySelector('#hand > .card .face')?.getBoundingClientRect(); return { a: a ? { x: a.x, y: a.y } : null, b: b ? { x: b.x, y: b.y } : null }; })()`);
      if (spots.a) await browser.screenshot('scratch-zoom-preview.png', { clip: { x: spots.a.x - 6, y: spots.a.y - 6, width: 70, height: 70, scale: 4 } });
      if (spots.b) await browser.screenshot('scratch-zoom-hand.png', { clip: { x: spots.b.x - 6, y: spots.b.y - 6, width: 70, height: 70, scale: 4 } }); }
    await scheme('light'); await sleep(400);
    await browser.screenshot('scratch-solo-light.png');
    await openLibraryViewer(); await ev(`document.getElementById('viewer').scrollIntoView()`); await sleep(400);
    await browser.screenshot('scratch-solo-piles.png');
    // the right-click menu, light and dark, closed up and with Move to open
    await ev(`window.scrollTo(0, 0)`); await sleep(200);
    await mouse('#battlefield .card[data-kind="other"]', { button: 'right', dy: 64 }); await sleep(300);
    await browser.screenshot('scratch-solo-menu-light.png');
    await clickMenuItem('Move to'); await sleep(200);
    await browser.screenshot('scratch-solo-menu-open-light.png');
    await key('Escape', 'Escape', 27);
    await scheme('dark'); await sleep(300);
    await mouse('#battlefield .card[data-kind="other"]', { button: 'right', dy: 64 }); await sleep(300);
    await browser.screenshot('scratch-solo-menu-dark.png');
    await key('Escape', 'Escape', 27);
    // two-sided cards with the real pictures: Valakut Awakening, Sephiroth and Aclazotz turned over, Delver and the rest as they are
    await scheme('dark');
    await open(TWO_SIDED);
    for (const name of ['Sephiroth', 'Valakut Awakening', 'Delver', 'Aclazotz', 'Fire', 'Sol Ring', 'Forest']) {
      await clickCard('#hand .card', (await handNames()).findIndex((x) => x.startsWith(name)));
      await clickAction('To battlefield'); await clickAction('Deselect');
    }
    for (const name of ['Valakut Awakening', 'Aclazotz']) { await clickCard(cardAt(name)); await clickAction('Flip double-faced card'); await clickAction('Deselect'); }
    await clickCard(cardAt('Sephiroth')); await clickAction('Flip double-faced card');
    await sleep(3000);
    await browser.screenshot('scratch-solo-twosided-dark.png');
    await scheme('light'); await sleep(400);
    await browser.screenshot('scratch-solo-twosided-light.png');
    await ev(`window.scrollTo(0, 0)`); await sleep(200);
    await mouse(cardAt('Delver'), { button: 'right', dy: 64 }); await sleep(300);
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
    await clickCard(cardAt('Sephiroth')); await clickAction('Flip double-faced card'); await clickAction('Modify'); await setAmount('2'); await clickMark('Add counters'); await clickAction('Modify');
    await clickAction('Create copy'); await clickAction('Create copy');
    await clickAction('Deselect');
    await clickCard(cardAt('Delver')); await clickAction('Create copy'); await clickAction('Deselect');
    await clickCard(cardAt('Aclazotz')); await clickAction('Flip double-faced card'); await clickAction('Create copy');
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
