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
    const p = await ev(`(() => { const arrow = String.fromCharCode(0x25b8); const b = [...document.querySelectorAll('.card-menu [role="menuitem"]')].filter((x) => !x.closest('[hidden]')).find((x) => x.textContent.replace(arrow, '').trim() === ${JSON.stringify(text)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
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
    for (const step of MENU_PATHS[label] ?? [label]) { if (!(await pressMenuItem(step))) { await closeMenu(); return false; } await sleep(30); }
    return true;
  };
  const shuffleViaMenu = async () => { await ev(`(() => { const r = document.getElementById('pile-library').getBoundingClientRect(); document.getElementById('pile-library').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 5, clientY: r.y + 5 })); })()`); await pressMenuItem('Shuffle'); await sleep(30); };
  const actionLabels = async () => { if (!(await openMenuOfSelected())) return []; const labels = await menuLabels(); await closeMenu(); return labels; };
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
  const lifeAt = () => ev("(() => { const r = document.getElementById('life').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
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
  const inner = await (async () => { await openMenuOfSelected(); await pressMenuItem('Move to'); await sleep(30); const all = await menuLabels(); await closeMenu(); return all.filter((x) => x !== 'Move to'); })();
  check('the right-click menu of a hand card is one entry, Move to, with every other zone and the library top and bottom inside it, and no Tap', JSON.stringify(labels) === JSON.stringify(['Move to']) && JSON.stringify(inner) === JSON.stringify(['Battlefield', 'Graveyard', 'Exile', 'Command zone', 'Sideboard', 'Top of library', 'Bottom of library']), JSON.stringify({ labels, inner }));
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
  await press('pile-library');
  const libRows = await count('#viewer-list .card');
  check('the library can be looked at: every card, numbered from the top', !(await $hidden('viewer')) && libRows === parseInt((await pileCount('library')).split(': ')[1], 10) && (await ev(`document.querySelector('#viewer-list .viewer-depth').textContent`)) === '#1');
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
  await press('pile-library');
  check('a card put on the bottom is last in the library list', (await ev(`Array.from(document.querySelectorAll('#viewer-list .viewer-depth')).at(-1).textContent`)) === '#' + (await pileCount('library')).split(': ')[1]);
  await press('viewer-close');

  // ---- shuffle, mulligan, escape ----
  const libCount = await pileCount('library');
  await shuffleViaMenu();
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
    await shuffleViaMenu();
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
    await press('draw'); await shuffleViaMenu();
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
    await press('settings-button'); // the slider lives in the Settings menu, which has to be open to be measured and dragged
    await sleep(100);
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
      await sleep(900); await browser.screenshot('scratch-solo-gather.png'); // the stack of cards turning over
      await waitFor(async () => (await count('.shuffle-card')) === 14 || null, 4000, 10);
      await ev("document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('shuffle-card')).forEach((a) => { a.pause(); a.currentTime = 330; })");
      await browser.screenshot('scratch-solo-riffle.png'); // the riffle, halfway through (the animation held at 330 ms for the picture)
      await ev("document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('shuffle-card')).forEach((a) => a.play())");
      await sleep(0);
      await sleep(1400); // the hand gathers (about 1 s), the library is shuffled (1.15 s), and a card comes every 120 ms: about three cards are in
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

    // a mulligan: the hand gathers and goes into the library (no sound yet, the hand is hidden while its pictures fly), then the shuffle sound and the riffle, then the new hand one card at a time
    await reset();
    await press('mulligan');
    await sleep(150);
    const early = await state();
    same('a mulligan plays no sound while the hand is gathering', summary(early).sounds, []);
    check('...and the real hand is hidden while its pictures fly (the copies are on top of the page)', (await ev(`getComputedStyle(document.getElementById('hand')).visibility`)) === 'hidden' && (await count('.shuffle-card, .fly-copy')) >= 1);
    await sleep(90); // (the cards are already together: the hand comes together in 190 ms, so about 0.25 s after the click it is done; it took 380 ms before)
    const together = await ev("(() => { const rows = [...document.querySelectorAll('.fly-copy')].map((c) => { const r = c.getBoundingClientRect(); const m = new DOMMatrixReadOnly(getComputedStyle(c).transform); return { x: r.left + r.width / 2, y: r.top + r.height / 2, angle: Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI * 10) / 10 }; }); return rows; })()");
    check('the hand has come together by 0.25 s after the click (twice as fast as it was): the cards form one neat upright stack: all on the same spot (within 2 px) and none turned or slanted', together.length >= 5 && together.every((c) => Math.abs(c.x - together[0].x) < 2 && Math.abs(c.y - together[0].y) < 2 && c.angle === 0), JSON.stringify(together.slice(0, 3)));
    await sleep(330); // (the turn-over is under way)
    const turning = await ev("[...document.querySelectorAll('.fly-copy > .fly-back')].map((b) => getComputedStyle(b).transform)");
    check('the stack turns over as one: every card is at the same point of the turn at the same moment, and the turn has started', turning.length >= 5 && new Set(turning).size === 1 && turning[0] !== 'none', JSON.stringify([...new Set(turning)]));
    check('a mulligan riffles 14 card backs over the library after the hand has flown into it', (await waitFor(async () => (await count('.shuffle-card')) === 14 || null, 4000, 20)) === true);
    await waitFor(async () => (await state()).plays.length >= 8 || null, 9000, 25);
    await sleep(300);
    seen = await state();
    sum = summary(seen);
    same('then the shuffle sound and the 7 cards dealt with a draw sound each', sum.sounds, ['shuffle', ...Array(7).fill('draw')]);
    const wait = seen.plays[1].t - seen.plays[0].t;
    check('the first card comes about 0.9 seconds after the shuffle sound, when the riffle is over (between 0.7 and 1.5)', wait >= 700 && wait <= 1500, `${Math.round(wait)} ms`);
    await sleep(800); // (the last card is still flying out of the library)
    check('the hand shows again and no flying picture is left behind', (await ev(`getComputedStyle(document.getElementById('hand')).visibility`)) === 'visible' && (await count('.shuffle-card, .fly-copy, .fly-ghost')) === 0);
    check('the new hand also fills one card at a time with the library count staying right', new Set(sum.counts).size >= 6 && sum.totals.length === 1, JSON.stringify(sum));
    check('the mulligan is counted once and the hand is 7', (await $text('mulligan')) === 'Mulligan (1 so far)' && (await count('#hand .card')) === 7);

    // a second mulligan in the middle of the first deal starts over: still exactly 7 cards in the end, nothing dealt twice
    await reset();
    await press('mulligan');
    await sleep(3300); // the gathering, the turning over and the riffle are over and a few cards are dealt
    await press('mulligan');
    await sleep(150);
    check('pressing Mulligan again in the middle of a deal gathers the hand again (hidden while it flies)', (await ev(`getComputedStyle(document.getElementById('hand')).visibility`)) === 'hidden');
    await waitFor(async () => (await state()).plays.filter((p) => p.src.includes('shuffle')).length >= 2 || null, 12000, 25);
    await sleep(2400); // (the second riffle is over: the new hand is dealt)
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

    // a card drawn comes out of the library: it starts over the library and eases into the hand
    await handIs(7);
    await sleep(500);
    const libraryAt = () => ev("(() => { const r = (document.querySelector('#pile-library .stack-face') || document.getElementById('pile-library')).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
    const uidsBefore = await ev("[...document.querySelectorAll('#hand > .card')].map((c) => c.dataset.uid)");
    const lib = await libraryAt();
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const flightAt = () => ev("(() => { const c = document.querySelector('.fly-copy'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, back: getComputedStyle(c.querySelector('.fly-back')).transform }; })()");
    const handNodeHidden = () => ev("(() => { const n = [...document.querySelectorAll('#hand > .card')].find((c) => !" + JSON.stringify(uidsBefore) + ".includes(c.dataset.uid)); return n ? getComputedStyle(n).visibility : null; })()");
    await press('draw');
    await sleep(25);
    const early1 = await flightAt();
    const hiddenWhileFlying = await handNodeHidden();
    await sleep(120);
    const mid1 = await flightAt();
    await sleep(900);
    const late1 = await flightAt();
    const landed = await handNodeHidden();
    check('a card drawn comes out of the library as a small picture of the card back (a flying copy that starts at the pile size, over the library), with the real card hidden meanwhile', early1 && hiddenWhileFlying === 'hidden' && distance(early1, lib) < 90 && early1.w < 150, JSON.stringify({ early1, hiddenWhileFlying, lib }));
    check('it grows and moves toward the hand on the way, and turns over (the back is squeezed to nothing and the face is seen)', mid1 && mid1.w > early1.w && distance(mid1, lib) > distance(early1, lib), JSON.stringify({ early1, mid1 }));
    check('when it lands the flying copy is gone and the real card is shown', late1 === null && landed === 'visible', JSON.stringify({ late1, landed }));
    // the library shuffle riffle: card backs over the pile in a menu shuffle, gone afterwards
    { const p = lib; await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'right', buttons: 2, clickCount: 1 }); await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'right', buttons: 0, clickCount: 1 }); await sleep(150); }
    await ev("[...document.querySelectorAll('#card-menu [role=menuitem], .card-menu button')].find((b) => /^Shuffle/.test(b.textContent.trim()))?.click()");
    await sleep(150);
    const riffling = await count('.shuffle-card');
    await sleep(1000);
    check('shuffling the library from its menu riffles 14 card backs over it, and they are gone when it is over', riffling === 14 && (await count('.shuffle-card')) === 0, String(riffling));
    // a card dropped on a pile flies INTO that pile (it once flew to the middle of the screen)
    {
      const centreOfBox = (selector) => ev("(() => { const r = document.querySelector(" + JSON.stringify(selector) + ").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
      const send = (type, p, buttons = 1) => browser.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: 1 });
      const grave = await centreOfBox('#pile-graveyard .stack-face');
      const handCards = await count('#hand .card');
      const cardAt = await centreOfBox('#hand > .card:last-child');
      await send('mouseMoved', cardAt, 0); await send('mousePressed', cardAt);
      for (let step = 1; step <= 8; step++) await send('mouseMoved', { x: cardAt.x + (grave.x - cardAt.x) * step / 8, y: cardAt.y + (grave.y - cardAt.y) * step / 8 });
      await send('mouseReleased', { x: grave.x - 20, y: grave.y }, 0);
      await sleep(130);
      const flying = await ev("(() => { const g = document.querySelector('.fly-ghost'); if (!g) return null; const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
      await sleep(700);
      check('a card dropped on the graveyard flies into the graveyard: partway through, its picture is still near the pile (within 200 px), not on its way to the middle of the screen', flying && Math.hypot(flying.x - grave.x, flying.y - grave.y) < 200, JSON.stringify({ flying, grave }));
      check('...it is gone afterwards, and the card is in the graveyard', (await count('.fly-ghost')) === 0 && (await count('#hand .card')) === handCards - 1 && /to your graveyard/.test(await $text('status')));
    }
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
  // ---- the larger picture of a card while Alt is held over it (frontend/src/card-hover.js): real mouse movement and real Alt key events ----
  {
    const rectOf = (selector, index = 0) => ev(`(() => { const r = document.querySelectorAll(${JSON.stringify(selector)})[${index}].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })()`);
    let alt = false;
    const moveTo = (x, y) => browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers: alt ? 1 : 0 });
    const altDown = async () => { alt = true; await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 1 }); await sleep(60); };
    const altUp = async () => { alt = false; await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 0 }); await sleep(60); };
    const hoverState = () => ev(`(() => { const b = document.getElementById('card-hover'); if (!b) return null; const r = b.getBoundingClientRect(); return { hidden: b.hidden, src: b.querySelector('img').getAttribute('src'), left: r.left, right: r.right, top: r.top, bottom: r.bottom, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; })()`);
    const c = await rectOf('#hand .card', 0);
    const smallSrc = await ev(`document.querySelector('#hand .card img').getAttribute('src')`);
    await moveTo(5, 5); await sleep(60);
    check('the hover box exists and starts hidden', (await hoverState())?.hidden === true);
    await moveTo(c.x, c.y);
    await sleep(700);
    check('with the pointer resting on a card and no Alt held, no larger picture shows (however long it rests)', (await hoverState()).hidden === true);
    await altDown();
    let h = await hoverState();
    check('holding Alt shows the NORMAL size of the same card at once', h.hidden === false && h.src === smallSrc.replace('/small/', '/normal/'), JSON.stringify(h));
    check('...inside the window and not covering the card', h.inside && (h.left >= c.right || h.right <= c.left), JSON.stringify([h, c]));
    const frame = await ev(`(() => { const b = document.getElementById('card-hover'); const c = getComputedStyle(b); const i = b.querySelector('img').getBoundingClientRect(); const r = b.getBoundingClientRect(); return { padding: c.paddingTop, border: c.borderTopWidth, background: c.backgroundColor, gap: Math.round(Math.abs(r.width - i.width) + Math.abs(r.height - i.height)) }; })()`);
    check('the Alt picture is just the card: no padding, no border, no background, the box is the picture\'s size', frame.padding === '0px' && frame.border === '0px' && frame.background === 'rgba(0, 0, 0, 0)' && frame.gap <= 2, JSON.stringify(frame));
    await altUp();
    check('letting go of Alt hides it', (await hoverState()).hidden === true);
    const altKeys = await ev(`(() => { const down = new KeyboardEvent('keydown', { key: 'Alt', altKey: true, bubbles: true, cancelable: true }); const up = new KeyboardEvent('keyup', { key: 'Alt', bubbles: true, cancelable: true }); document.dispatchEvent(down); document.dispatchEvent(up); return { down: down.defaultPrevented, up: up.defaultPrevented }; })()`);
    check('the page cancels Alt on its own (keydown and keyup), so the browser does not open its menu', altKeys.down && altKeys.up, JSON.stringify(altKeys));
    await ev(`document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', bubbles: true }))`);
    check('a plain keystroke is left alone (not cancelled)', await ev(`(() => { const e = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }); document.dispatchEvent(e); return !e.defaultPrevented; })()`));
    await altDown(); await moveTo(5, 5); await sleep(80);
    check('with Alt held, moving off the card hides it', (await hoverState()).hidden === true);
    await moveTo(c.x, c.y); await sleep(80);
    check('and moving back on shows it again at once', (await hoverState()).hidden === false);
    // a point on a visible part of a card whose picture differs from the first card's (the cards overlap, and which are in front depends on the random hand)
    const c3 = await ev(`(() => { const cards = [...document.querySelectorAll('#hand .card')]; const imgs = cards.map((c) => c.querySelector('img').getAttribute('src')); for (let n = cards.length - 1; n > 0; n--) { if (imgs[n] === imgs[0]) continue; const r = cards[n].getBoundingClientRect(); for (let x = r.left + 4; x < r.right - 4; x += 4) { const y = r.top + r.height * 0.6; if (document.elementFromPoint(x, y)?.closest('.card') === cards[n]) return { x, y }; } } return null; })()`);
    await moveTo(c3.x, c3.y); await sleep(100);
    const other = await hoverState();
    check('with Alt held, moving to another card shows that card', other.hidden === false && other.src !== h.src, JSON.stringify(other));
    await moveTo(c.x, c.y); await sleep(80);
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', buttons: 1, clickCount: 1, modifiers: 1 });
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', buttons: 0, clickCount: 1, modifiers: 1 });
    await sleep(150);
    check('a click hides it, and it stays hidden while the pointer stays on that card with Alt still held', (await hoverState()).hidden === true);
    // (the click selected the card: a card of the hand that is selected comes up and the cards beside it move aside, so go back to where the card is now)
    await moveTo(5, 5); await sleep(80);
    const nowAt = await ev("(() => { const r = (document.querySelector('#hand > .card.selected') ?? document.querySelector('#battlefield > .card.selected')).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()");
    await moveTo(nowAt.x, nowAt.y); await sleep(100);
    check('after leaving and coming back it shows again', (await hoverState()).hidden === false);
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, modifiers: 1 });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, modifiers: 1 });
    await sleep(100);
    check('Escape hides it', (await hoverState()).hidden === true);
    await altUp(); await moveTo(5, 5); await sleep(80);
    await ev(`document.querySelector('#hand .card').dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'touch', altKey: true }))`);
    await altDown(); await sleep(100);
    check('a touch never shows it (a phone has no Alt or hover)', (await hoverState()).hidden === true);
    await altUp(); await moveTo(5, 5); await sleep(60);
    const lastIndex = (await count('#hand .card')) - 1; // (the last card is the one on top where the cards overlap)
    await ev(`document.querySelectorAll('#hand .card')[${lastIndex}].classList.add('noimage')`);
    const c2 = await rectOf('#hand .card', lastIndex); await moveTo(c2.x, c2.y); await altDown(); await sleep(100);
    check('a card that shows only its name has no larger picture', (await hoverState()).hidden === true);
    await altUp();
    await ev(`document.querySelectorAll('#hand .card')[1].classList.remove('noimage')`);
    await moveTo(5, 5); await sleep(60);
    await moveTo(c.x, c.y); await altDown(); await sleep(100);
    await ev(`document.querySelector('.side-panels').dispatchEvent(new Event('scroll'))`); await sleep(80);
    check('a scroll hides it', (await hoverState()).hidden === true);
    await altUp(); await moveTo(5, 5); await sleep(80);
    // a card on the battlefield, and a tapped one
    await clickCard('#hand .card', 0);
    await clickAction('To battlefield');
    await clickAction('Tap');
    await moveTo(5, 5); await sleep(80);
    const b = await rectOf('#battlefield .card', 0);
    const bSmall = await ev(`document.querySelector('#battlefield .card img').getAttribute('src')`);
    await moveTo(b.x, b.y); await altDown(); await sleep(100);
    h = await hoverState();
    check('a tapped card on the battlefield shows its larger picture too, beside it', h.hidden === false && h.src === bSmall.replace('/small/', '/normal/') && h.inside && (h.left >= b.right || h.right <= b.left), JSON.stringify([h, b]));
    await altUp(); await moveTo(5, 5); await sleep(80);
    check('the hover box is never in the way of the pointer (it does not take mouse events)', (await ev(`getComputedStyle(document.getElementById('card-hover')).pointerEvents`)) === 'none');
  }
  const moveAwayFromHand = async () => { await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 }); await sleep(250); };
  // ---- the hand as a fan, with mana costs, and rearranging it by dragging (frontend/src/hand-view.js, shared/hand-layout.mjs) ----
  {
    const handFacts = () => ev(`(() => { const cards = [...document.querySelectorAll('#hand > .card')]; const box = document.getElementById('hand').getBoundingClientRect(); return { uids: cards.map((c) => c.dataset.uid), names: cards.map((c) => c.getAttribute('aria-label').split(',')[0]), angles: cards.map((c) => parseFloat(c.style.getPropertyValue('--ha'))), xs: cards.map((c) => parseFloat(c.style.getPropertyValue('--hx'))), ys: cards.map((c) => parseFloat(c.style.getPropertyValue('--hy'))), costs: cards.map((c) => c.querySelector(':scope > .hand-cost')?.querySelectorAll('img, .pip').length ?? 0), hidden: cards.filter((c) => getComputedStyle(c).visibility === 'hidden').length, inside: cards.every((c) => { const r = c.getBoundingClientRect(); return r.left >= box.left - 20 && r.right <= box.right + 20 && r.bottom <= innerHeight + r.height * 0.42; }), position: cards.map((c) => getComputedStyle(c).position)[0], width: cards[0]?.offsetWidth ?? 0 }; })()`);
    const mouse = (type, x, y, buttons = 0) => browser.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
    const handBox = () => ev(`(() => { const r = document.getElementById('hand').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })()`);
    const cardPoint = (index) => ev(`(() => { const card = document.querySelectorAll('#hand > .card')[${index}]; const r = card.getBoundingClientRect(); const y = r.top + r.height * 0.45; const xs = []; for (let x = r.left + 2; x < r.right - 2; x += 3) if (document.elementFromPoint(x, y)?.closest('#hand > .card') === card) xs.push(x); return { x: xs.length ? xs[Math.floor(xs.length / 2)] : r.left + r.width / 2, y }; })()`);
    if ((await handNames()).length > 10) { await press('mulligan'); await sleep(100); } // (the draws of the checks before this one are random: a hand of 25 cards would be strips 20 pixels wide, which these checks are not about)
    await moveAwayFromHand();
    await drawUntil((n) => /Lightning Bolt|Sol Ring|Llanowar Elves/.test(n)); await drawUntil((n) => /^(Forest|Island)$/.test(n)); await moveAwayFromHand(); // the deal is random: make sure the hand has a spell and a land
    if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-hand-lowered.png');
    const fan = await handFacts();
    check('the hand is a fan: the cards are placed by the page (absolute), the first leans left and the last right, the middle is straighter, the ends sit lower', fan.names.length >= 5 && fan.position === 'absolute' && fan.angles[0] < 0 && fan.angles.at(-1) > 0 && Math.abs(fan.angles[Math.floor(fan.angles.length / 2)]) < Math.abs(fan.angles[0]) + 0.01 && fan.ys[0] >= fan.ys[Math.floor(fan.ys.length / 2)], JSON.stringify(fan));
    check('the pictures of the cards in the hand are the NORMAL size (the hand is large; the small picture was blurry)', await ev("[...document.querySelectorAll('#hand > .card .face img')].every((i) => i.getAttribute('src').includes('/normal/')) && document.querySelectorAll('#hand > .card .face img').length > 0") && asked.some((url) => url.includes('/normal/front/')), JSON.stringify(asked.slice(-3)));
    check('the card preview\'s picture box has the shape of a card (not a taller box with the card letterboxed in it, which left the white corners unclipped)', await ev("(() => { const i = document.querySelector('#spotlight .spot-picture'); if (!i || i.hidden) return true; const r = i.getBoundingClientRect(); return Math.abs(r.width / r.height - 488 / 680) < 0.01; })()"));
    check('a card picture is clipped with the corners of a real card (4.8% by 3.4%), so no white corner shows', await ev("(() => { const face = document.querySelector('#hand > .card .face'); const img = face.querySelector('img'); return getComputedStyle(face).borderTopLeftRadius.includes('%') && getComputedStyle(img).borderTopLeftRadius.includes('%'); })()"));
    check('the library is the real Magic card back from Scryfall (the picture was asked for), not a drawn pattern', backsAsked.some((url) => url === 'https://backs.scryfall.io/normal/0/a/0aeebaf5-8c7d-4636-9e82-8c27447861f7.jpg') && (await ev("getComputedStyle(document.querySelector('#pile-library .stack-face')).backgroundImage")).includes('backs.scryfall.io'), JSON.stringify(backsAsked.slice(0, 2)));
    check('the cards sit in order from left to right, edge to edge when they fit', fan.xs.every((x, i) => i === 0 || x > fan.xs[i - 1]) && fan.xs.length < 2 || Math.abs((fan.xs[1] - fan.xs[0]) - fan.width) < 2 || (fan.xs[1] - fan.xs[0]) < fan.width, JSON.stringify([fan.xs.slice(0, 3), fan.width]));
    check('every card is inside the hand\'s box and sideways in the window, and none is lower than about a third of its height below the bottom edge (the ends of the fan sit lower)', fan.inside, JSON.stringify(fan));
    const lowered = await ev(`(() => { const cs = [...document.querySelectorAll('#hand > .card')]; const c = cs[Math.floor(cs.length / 2)]; const r = c.getBoundingClientRect(); return { hidden: Math.round((r.bottom - innerHeight) / r.height * 100) / 100, raised: document.getElementById('hand').classList.contains('raised'), count: cs.length, step: parseFloat(cs[1].style.getPropertyValue('--hx')) - parseFloat(cs[0].style.getPropertyValue('--hx')), width: cs[0].offsetWidth }; })()`);
    check('with the pointer away the hand is lowered: about a quarter of the cards is below the bottom edge of the window', !lowered.raised && lowered.hidden >= 0.2 && lowered.hidden <= 0.3, JSON.stringify(lowered));
    check('the cards never sit further apart than a card is wide (edge to edge at most) and from 7 cards on they overlap', lowered.step <= lowered.width + 1 && (lowered.count < 7 || lowered.step < lowered.width - 2), JSON.stringify(lowered)); // (up to 6 cards they are edge to edge only when the window is wide enough: the cards are large)
    const withCost = fan.names.findIndex((name) => /Lightning Bolt|Sol Ring|Llanowar Elves/.test(name));
    const land = fan.names.findIndex((name) => /^(Forest|Island)$/.test(name));
    check('a spell shows its mana cost as symbols above it, and a land shows none', withCost >= 0 && fan.costs[withCost] >= 1 && (land < 0 || fan.costs[land] === 0), JSON.stringify({ names: fan.names, costs: fan.costs }));
    // hovering lifts and straightens a card
    const p = await cardPoint(1);
    const restingBoxes = await ev(`(() => { const cs = [...document.querySelectorAll('#hand > .card')]; return cs.map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; }); })()`);
    const faceTopBefore = await ev(`document.querySelectorAll('#hand > .card')[1].querySelector('.face').getBoundingClientRect().top`);
    await mouse('mouseMoved', p.x, p.y); await sleep(250);
    // the lift is drawn on the picture (the card's own box is what answers to the pointer): the card's turn and the picture's turn cancel, so the picture is straight and bigger, and higher than before
    const zBefore = await ev(`[...document.querySelectorAll('#hand > .card')].map((c) => getComputedStyle(c).zIndex)`);
    const lifted = await ev(`(() => { const copy = document.querySelector('.hand-lift-layer > .card.up'); if (!copy) return null; const real = document.querySelector('#hand > .card.lifted'); const m = new DOMMatrix(getComputedStyle(copy).transform); return { scale: Math.round(Math.hypot(m.a, m.b) * 100) / 100, copyAngle: Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI * 10) / 10, realAngle: parseFloat(real.style.getPropertyValue('--ha')), rose: Math.round(real.getBoundingClientRect().top - copy.getBoundingClientRect().top), original: [...document.querySelectorAll('#hand > .card')].filter((c) => c.classList.contains('lifted')).length, layerMouse: getComputedStyle(document.querySelector('.hand-lift-layer')).pointerEvents, copyMouse: getComputedStyle(copy).pointerEvents }; })()`);
    check('the card under the pointer comes up a little, bigger by 5%, and KEEPS its turn on the arc; the real card is hidden under the copy (not removed) and the copy takes no mouse', lifted && lifted.scale >= 1.03 && Math.abs(lifted.copyAngle - lifted.realAngle) < 0.6 && lifted.rose >= 6 && lifted.original === 1 && lifted.layerMouse === 'none' && lifted.copyMouse === 'none', JSON.stringify(lifted));
    check('the cards of the hand have a stacking context of their own, so their stacking numbers (1 to the size of the hand) never put a card over the lifted copy, however many cards there are', await ev("(() => { const hand = getComputedStyle(document.getElementById('hand')); const layer = getComputedStyle(document.querySelector('.hand-lift-layer')); return hand.position === 'relative' && hand.zIndex === '0' && Number(layer.zIndex) > 0; })()"));
    check('lifting a card does not change the stacking of any real card (a card that grabbed a higher number kept the pointer over its neighbours)', JSON.stringify(await ev(`[...document.querySelectorAll('#hand > .card')].map((c) => getComputedStyle(c).zIndex)`)) === JSON.stringify(zBefore), JSON.stringify(zBefore));
    const hoveredBoxes = await ev(`(() => { const cs = [...document.querySelectorAll('#hand > .card')]; return cs.map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; }); })()`);
    // the pointer is in the area of the hand, so the hand has risen: ALL the cards moved up by the same distance (a quarter of a card), none moved sideways or grew, so the hovered card did not move relative to the others
    const rise = restingBoxes.map((b, i) => b[1] - hoveredBoxes[i][1]);
    check('the pointer in the area of the hand raises the whole hand: every card moves up by the same distance and none moves sideways or grows (the hovered card has no bigger place of its own)', hoveredBoxes.every((b, i) => Math.abs(b[0] - restingBoxes[i][0]) < 1 && Math.abs(b[2] - restingBoxes[i][2]) < 1 && Math.abs(b[3] - restingBoxes[i][3]) < 1 && Math.abs(rise[i] - rise[0]) < 1.5) && rise[0] > 20 && (await ev("document.getElementById('hand').classList.contains('raised')")), JSON.stringify([rise.slice(0, 3), restingBoxes.slice(0, 2), hoveredBoxes.slice(0, 2)]));
    check('...and a raised hand has all its cards inside the window', await ev("[...document.querySelectorAll('#hand > .card')].every((c) => c.getBoundingClientRect().bottom <= innerHeight + 1)"));
    if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-hand-raised.png');
    { const uidOfLifted = () => ev("document.querySelector('.hand-lift-layer > .card.up') ? [...document.querySelectorAll('#hand > .card.lifted')].map((c) => c.dataset.uid)[0] : null");
      const first = await uidOfLifted(); const next = await cardPoint(2);
      await mouse('mouseMoved', next.x, next.y); await sleep(250);
      const second = await uidOfLifted();
      const uidAt = (i) => ev(`document.querySelectorAll('#hand > .card')[${i}].dataset.uid`);
      check('moving the pointer from one card to the next lifts the next one: the first does not hold on to the pointer over its neighbour', first === (await uidAt(1)) && second === (await uidAt(2)), JSON.stringify([first, second]));
      const back = await cardPoint(1); await mouse('mouseMoved', back.x, back.y); await sleep(250); }
    const neighbour = await cardPoint(2);
    check('...and the lifted card does not cover the next one: a point that shows on the next card belongs to that card', (await ev(`document.elementFromPoint(${neighbour.x}, ${neighbour.y})?.closest('#hand > .card')?.dataset.uid`)) === (await ev(`document.querySelectorAll('#hand > .card')[2].dataset.uid`)));
    const pressable = await ev(`(() => [...document.querySelectorAll('#hand > .card')].map((card, i) => { const r = card.getBoundingClientRect(); const y = r.top + r.height * 0.45; let n = 0; for (let x = r.left + 2; x < r.right - 2; x += 3) if (document.elementFromPoint(x, y)?.closest('#hand > .card') === card) n++; return n > 0 ? 'ok' : i + ' is covered'; }))()`);
    check('every card of the hand has a part that shows and answers to the pointer (overlapping cards: the part not covered by the next one)', pressable.every((c) => c === 'ok'), JSON.stringify(pressable));
    // a click brings a card of the hand fully up and the cards beside it move aside (this is how a card in a large hand is read); a click elsewhere puts it back
    {
      const idx = 3;
      const mouseBtn = async (type, p, button, buttons) => browser.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button, buttons, clickCount: 1 });
      const base = await handFacts();
      const cardH = base.width * 1.4015;
      const p = await cardPoint(idx);
      await mouse('mouseMoved', p.x, p.y); await sleep(100);
      await mouseBtn('mousePressed', p, 'left', 1); await mouseBtn('mouseReleased', p, 'left', 0); await sleep(300);
      const up = await handFacts();
      const selectedUid = await ev("document.querySelector('#hand > .card.selected')?.dataset.uid ?? null");
      const zs = await ev("[...document.querySelectorAll('#hand > .card')].map((c) => Number(c.style.getPropertyValue('--hz')))");
      check('a click on a card of the hand selects it and brings it up by almost half its height', selectedUid === base.uids[idx] && base.ys[idx] - up.ys[idx] > cardH * 0.4, JSON.stringify({ selectedUid, was: base.ys[idx], now: up.ys[idx], cardH }));
      // The whole of each side moves aside, separately: nothing on its left moves right and nothing on its right moves left (the cards at the ends of a hand that fills its width cannot go further, so the side closes up
      // toward its end), and the cards next to it open up to at least 3/4 of a card from it.
      const sideLeft = base.xs.slice(0, idx).every((x, k) => up.xs[k] <= x + 1);
      const sideRight = base.xs.slice(idx + 1).every((x, k) => up.xs[idx + 1 + k] >= x - 1);
      const nearer = (base.xs[idx] - base.xs[idx - 1]) + 20 < up.xs[idx] - up.xs[idx - 1] && (base.xs[idx + 1] - base.xs[idx]) + 20 < up.xs[idx + 1] - up.xs[idx];
      check('the whole of each side moves aside, separately: nothing to its left moves right, nothing to its right moves left, and each neighbour opens up to at least 3/4 of a card from it', sideLeft && sideRight && nearer && up.xs[idx] - up.xs[idx - 1] >= base.width * 0.75 && up.xs[idx + 1] - up.xs[idx] >= base.width * 0.75, JSON.stringify({ before: base.xs, after: up.xs, sideLeft, sideRight, nearer }));
      check('the brought-up card is in front of all the others, and it has no lifted copy (it is up by itself)', zs[idx] === Math.max(...zs) && zs.filter((z) => z === zs[idx]).length === 1 && (await count('.hand-lift-layer > .card')) === 0, JSON.stringify(zs));
      await mouse('mouseMoved', 5, 5); await sleep(500);
      const lowered = await handFacts();
      check('a lowered hand does not take the brought-up card down with it: it stays up', up.ys[idx] - lowered.ys[idx] < 8 && lowered.ys[idx + 1] - lowered.ys[idx] > cardH * 0.4, JSON.stringify({ up: up.ys[idx], lowered: lowered.ys[idx], next: lowered.ys[idx + 1] }));
      const empty = await ev("(() => { const r = document.getElementById('battlefield').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()");
      const away = { x: empty.left + empty.width * 0.6, y: empty.top + empty.height * 0.3 };
      await mouseBtn('mousePressed', away, 'left', 1); await mouseBtn('mouseReleased', away, 'left', 0); await sleep(300);
      const down = await handFacts();
      check('a click on empty space puts it back: nothing is selected and the cards are where they were', (await count('#hand > .card.selected')) === 0 && down.xs.every((x, i) => Math.abs(x - base.xs[i]) < 1) && Math.abs(down.ys[idx] - lowered.ys[idx + 1]) < 20, JSON.stringify({ xs: down.xs.slice(0, 5), was: base.xs.slice(0, 5) }));
      // a right click on a card comes up too (it used to drop straight back into the hand): it opens the card's menu and the card is brought up like a clicked card, with its neighbours aside
      const q = await cardPoint(5);
      const beforeRight = await handFacts();
      await mouse('mouseMoved', q.x, q.y); await sleep(200);
      const liftedBefore = await count('.hand-lift-layer > .card');
      await mouseBtn('mousePressed', q, 'right', 2); await mouseBtn('mouseReleased', q, 'right', 0); await sleep(300);
      const afterRight = await handFacts();
      const rightSelected = await ev("document.querySelector('#hand > .card.selected')?.dataset.uid ?? null");
      check('a right click on a card of the hand opens its menu and the card comes up (it does not drop back into the hand): it is the selected card and is brought up like a clicked one', liftedBefore === 1 && (await count('.card-menu')) === 1 && rightSelected === beforeRight.uids[5] && beforeRight.ys[5] - afterRight.ys[5] > cardH * 0.4, JSON.stringify({ liftedBefore, menu: await count('.card-menu'), rightSelected, was: beforeRight.ys[5], now: afterRight.ys[5] }));
      await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(200);
      await mouseBtn('mousePressed', away, 'left', 1); await mouseBtn('mouseReleased', away, 'left', 0); await sleep(300); // (nothing stays selected for the checks that follow)
      check('...and a click on empty space puts it back', (await count('#hand > .card.selected')) === 0 && (await count('.card-menu')) === 0);
    }
    await mouse('mouseMoved', 5, 5); await sleep(250);
    check('when the pointer leaves the area the hand goes down again', !(await ev("document.getElementById('hand').classList.contains('raised')")) && JSON.stringify(await ev(`(() => { const cs = [...document.querySelectorAll('#hand > .card')]; return cs.map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.left * 10) / 10, Math.round(r.top * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; }); })()`)) === JSON.stringify(restingBoxes));
    // dragging a card within the hand
    const before = await handFacts();
    const box = await handBox();
    const from = await cardPoint(0);
    await mouse('mouseMoved', from.x, from.y); await mouse('mousePressed', from.x, from.y, 1);
    const target = { x: (box.left + box.right) / 2, y: from.y }; // the middle of the hand, so the gap opens between two cards
    for (let step = 1; step <= 10; step++) await mouse('mouseMoved', from.x + (target.x - from.x) * step / 10, from.y + (target.y - from.y) * step / 10, 1);
    await sleep(250);
    const during = await handFacts();
    const others = during.xs.filter((_, i) => during.uids[i] !== before.uids[0]); // (the dragged card keeps its old numbers while it is hidden)
    const diffs = others.map((x, i) => (i === 0 ? null : x - others[i - 1])).filter((d) => d !== null);
    check('while a card of the hand is dragged it is lifted out and a gap opens at the place it would go back (one step is twice as wide as the others)', during.hidden === 1 && Math.max(...diffs) >= 1.6 * Math.min(...diffs) && during.names.length === before.names.length, JSON.stringify({ hidden: during.hidden, diffs }));
    if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-hand-drag.png');
    check('while a card is carried no card is shown lifted (only the gap and the lean change the picture)', (await count('.hand-lift-layer > .card')) === 0 && (await count('#hand > .card.lifted')) === 0);
    check('the cards next to the gap lean away from it', during.angles.length > 3 && during.angles.some((angle, i) => Math.abs(angle - (before.angles[i] ?? 0)) > 2), JSON.stringify([before.angles, during.angles]));
    await mouse('mouseReleased', target.x, target.y, 0); await sleep(250);
    const after = await handFacts();
    check('letting go puts the card in the middle of the hand, and the others keep their order', after.uids[0] !== before.uids[0] && after.uids.indexOf(before.uids[0]) >= 1 && after.uids.indexOf(before.uids[0]) <= after.uids.length - 2 && after.uids.filter((u) => u !== before.uids[0]).join() === before.uids.slice(1).join(), JSON.stringify([before.uids, after.uids]));
    check('no gap is left and nothing is hidden afterwards', after.hidden === 0 && Math.abs((after.xs[1] - after.xs[0]) - (before.xs[1] - before.xs[0])) < 1.5, JSON.stringify([before.xs.slice(0, 3), after.xs.slice(0, 3)]));
    const again = await cardPoint(2);
    await mouse('mouseMoved', again.x, again.y); await mouse('mousePressed', again.x, again.y, 1);
    for (let step = 1; step <= 8; step++) await mouse('mouseMoved', again.x + step * 1.5, again.y, 1); // 12 px: past the start of a drag, well under half a card
    await mouse('mouseReleased', again.x + 12, again.y, 0); await sleep(250);
    const same = await handFacts();
    check('dropping a card back in about the same place changes nothing', same.uids.join() === after.uids.join(), JSON.stringify([after.uids, same.uids]));
    // carrying a card out of the area (up, to the battlefield) lowers the hand so the board is easier to see; back in raises it; letting go where it began changes nothing
    { const start = await cardPoint(3); const handTop = (await handBox()).top;
      await mouse('mouseMoved', start.x, start.y); await mouse('mousePressed', start.x, start.y, 1);
      for (let step = 1; step <= 8; step++) await mouse('mouseMoved', start.x, start.y - (start.y - handTop + 80) * step / 8, 1);
      await sleep(300);
      const out = await ev("document.getElementById('hand').classList.contains('raised')");
      for (let step = 1; step <= 8; step++) await mouse('mouseMoved', start.x, handTop - 80 + (start.y - handTop + 80) * step / 8, 1);
      await sleep(300);
      const back = await ev("document.getElementById('hand').classList.contains('raised')");
      await mouse('mouseReleased', start.x, start.y, 0); await sleep(250);
      check('carrying a card out of the hand lowers it, bringing it back raises it, and letting go in the place it came from changes nothing', out === false && back === true && (await handFacts()).uids.join() === same.uids.join(), JSON.stringify({ out, back }));
    }
    // ---- how the hand MOVES (frontend/src/hand-view.js: every card eases toward its place, one frame at a time; board-drag.js: the carried picture follows with a lag and leans) ----
    // These run with the normal animation (the rest of the check runs with reduced motion, where cards go straight to their places).
    await motion('no-preference');
    await mouse('mouseMoved', 5, 5); await sleep(500);
    const xsOf = "[...document.querySelectorAll('#hand > .card')].map((c) => parseFloat(c.style.getPropertyValue('--hx')))";
    const sampleFrames = (script, ms) => ev("new Promise((resolve) => { const out = []; const t0 = performance.now(); " + script + " const step = () => { out.push({ t: Math.round(performance.now() - t0), xs: " + xsOf + ", ys: [...document.querySelectorAll('#hand > .card')].map((c) => parseFloat(c.style.getPropertyValue('--hy'))), as: [...document.querySelectorAll('#hand > .card')].map((c) => parseFloat(c.style.getPropertyValue('--ha'))) }); if (performance.now() - t0 < " + ms + ") requestAnimationFrame(step); else resolve(out); }; requestAnimationFrame(step); })");
    const reversals = (series) => { let count = 0; let last = 0; for (let i = 1; i < series.length; i++) { const d = series[i] - series[i - 1]; if (Math.abs(d) < 0.05) continue; const sign = Math.sign(d); if (last !== 0 && sign !== last) count++; last = sign; } return count; };
    // 1. raising and lowering the hand: gradual, one way, no overshoot
    const risePoint = await cardPoint(2);
    const riseFrames = await sampleFrames("document.dispatchEvent(new PointerEvent('pointermove', { clientX: " + risePoint.x + ", clientY: " + risePoint.y + ", bubbles: true }));", 700);
    const hy = riseFrames.map((frame) => frame.ys[2]);
    check('the hand rises gradually, over several frames, in one direction, and ends at its place without overshooting', new Set(hy.map((v) => Math.round(v))).size >= 5 && reversals(hy) === 0 && hy[0] - hy.at(-1) > 20 && Math.abs(hy.at(-1) - Math.min(...hy)) < 0.1, JSON.stringify(hy.slice(0, 14)));
    const fall = await sampleFrames("document.dispatchEvent(new PointerEvent('pointermove', { clientX: 5, clientY: 5, bubbles: true }));", 700);
    const hyFall = fall.map((frame) => frame.ys[2]);
    check('and goes down the same way', new Set(hyFall.map((v) => Math.round(v))).size >= 5 && reversals(hyFall) === 0 && hyFall.at(-1) - hyFall[0] > 20, JSON.stringify(hyFall.slice(0, 14)));
    // 2. carrying a card toward the end of the hand with a shaky hand: no card moves back and forth (the jitter of an earlier version)
    await mouse('mouseMoved', 5, 5); await sleep(300);
    const beforeCarry = await handFacts();
    const startAt = await cardPoint(0);
    const area = await handBox();
    await mouse('mouseMoved', startAt.x, startAt.y); await sleep(700); // (let the hand finish rising before recording: the tail of an ease is not a movement)
    const startAt2 = await cardPoint(0);
    await ev("window.__frames = []; window.__recording = true; (function loop() { if (!window.__recording) return; window.__frames.push(Object.fromEntries([...document.querySelectorAll('#hand > .card')].map((c) => [c.dataset.uid, [parseFloat(c.style.getPropertyValue('--hx')), parseFloat(c.style.getPropertyValue('--hy'))]]))); requestAnimationFrame(loop); })(); window.__release = null; window.addEventListener('pointerup', () => { window.__releaseFrame = window.__frames.length; const g = document.querySelector('.drag-ghost')?.getBoundingClientRect(); window.__release = g ? { x: g.left + g.width / 2, y: g.top + g.height / 2 } : null; requestAnimationFrame(() => { const card = document.querySelector('#hand > .card[data-uid=" + JSON.stringify(beforeCarry.uids[0]).slice(1, -1) + "]'); const r = card?.getBoundingClientRect(); window.__releaseCard = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }); }, { capture: true, once: true });");
    await mouse('mouseMoved', startAt2.x, startAt2.y); await mouse('mousePressed', startAt2.x, startAt2.y, 1);
    const grabShift = (area.left + beforeCarry.xs[0] + beforeCarry.width / 2) - startAt2.x; // how far the middle of the card is from where it was taken
    const zoneRight = area.left + Math.max(...beforeCarry.xs) + beforeCarry.width * 1.5; // the area of the hand ends half a card past its last card
    let endX = area.left + Math.max(...beforeCarry.xs) + beforeCarry.width * 0.5 - grabShift; // where the pointer is when the middle of the picture is on the middle of the last place
    await ev("window.__angles = []; (function loop() { if (!window.__recording) return; const g = document.querySelector('.drag-ghost'); if (g) window.__angles.push(parseFloat((g.style.transform.match(/rotate\\((-?[\\d.]+)deg/) || [0, 0])[1])); requestAnimationFrame(loop); })();");
    // first, hold the pointer ON the line between the first two places and wobble it 4 pixels either way, slowly (24 ms a step, the pace of a hand): the hole must not flip back and forth
    // (the place is decided from the MIDDLE of the picture carried, which starts on the card's own place: the hole leaves place 0 when the picture has moved 0.75 of a step, wherever on the card it was taken)
    const stepPx = beforeCarry.xs[1] - beforeCarry.xs[0];
    const lineX = startAt2.x + stepPx * 0.75;
    await mouse('mouseMoved', lineX - 20, startAt2.y, 1); await sleep(100);
    for (let i = 0; i < 30; i++) { await mouse('mouseMoved', lineX + (i % 2 ? 4 : -4), startAt2.y, 1); await sleep(24); }
    let wiggle = 0;
    for (let x = startAt2.x; x < endX; x += 2) { wiggle = wiggle === 3 ? -3 : 3; await mouse('mouseMoved', x + wiggle, startAt2.y, 1); }
    await mouse('mouseMoved', endX, startAt2.y, 1); await sleep(300);
    // (the geometry above is an estimate: a fanned, tilted card is not where its layout box says, so walk the pointer on until the hole IS the last place, and use that spot as the end)
    for (let n = 0; n < 60 && Number(await ev("document.getElementById('hand').dataset.hole ?? -1")) < beforeCarry.uids.length - 1; n++) { endX += 4; await mouse('mouseMoved', endX, startAt2.y, 1); await sleep(30); }
    await sleep(300);
    // then wobble across the edge of the area of the hand, at the end of it: a few pixels in and out, 60 times
    for (let i = 0; i < 60; i++) await mouse('mouseMoved', zoneRight + (i % 2 ? 14 : -14), startAt2.y, 1);
    const stillRaised = await ev("document.getElementById('hand').classList.contains('raised')");
    await mouse('mouseMoved', endX, startAt2.y, 1); await sleep(500);
    const holeAtEnd = await ev("document.getElementById('hand').dataset.hole ?? null");
    const leanStill = await ev("parseFloat((document.querySelector('.drag-ghost').style.transform.match(/rotate\\((-?[\\d.]+)deg/) || [0, 0])[1])");
    const angles = await ev("window.__angles");
    const leanMax = Math.max(...angles.map(Math.abs));
    await mouse('mouseReleased', endX, startAt2.y, 0);
    await sleep(700);
    await ev("window.__recording = false");
    const frames = await ev("window.__frames");
    const releaseFrame = await ev("window.__releaseFrame");
    const carriedUid = beforeCarry.uids[0];
    // every card but the carried one, across and up and down, from the start of the recording to the moment of the let-go (by card: the let-go puts the card in the document in its new place)
    const reversalCounts = beforeCarry.uids.filter((uid) => uid !== carriedUid).flatMap((uid) => [0, 1].map((axis) => reversals(frames.slice(0, releaseFrame).map((frame) => frame[uid][axis]))));
    check('carrying a card to the end of the hand with a shaky hand (3 pixels either way), and wobbling in and out over the edge of the area of the hand 60 times, makes no card move back and forth, across or up and down: every card moves one way only, and the hand stays up', Math.max(...reversalCounts) === 0 && stillRaised, JSON.stringify({ reversalCounts, stillRaised }));
    const settle = [0, 1].map((axis) => reversals(frames.slice(releaseFrame + 1).map((frame) => frame[carriedUid][axis])));
    check('the card that was let go eases into its place in one direction (no bounce), and the others do not move at all after it', Math.max(...settle) === 0 && beforeCarry.uids.filter((uid) => uid !== carriedUid).every((uid) => reversals(frames.slice(releaseFrame).map((frame) => frame[uid][0])) === 0), JSON.stringify(settle));
    const afterCarry = await handFacts();
    check('...and the card is put at the end where it was carried, the others keep their order', afterCarry.uids.at(-1) === beforeCarry.uids[0] && afterCarry.uids.slice(0, -1).join() === beforeCarry.uids.slice(1).join(), JSON.stringify({ holeAtEnd, cards: beforeCarry.uids.length, before: beforeCarry.uids, after: afterCarry.uids }));
    // 3. a card let go starts where its picture was, not where it was picked up
    const release = await ev("window.__release");
    const releaseCard = await ev("window.__releaseCard");
    check('a card let go starts exactly where its picture was let go (within 8 pixels), and eases into its place from there', release && releaseCard && Math.abs(release.x - releaseCard.x) < 8 && Math.abs(release.y - releaseCard.y) < 8, JSON.stringify({ release, releaseCard }));
    // 4. the carried picture leans while it is moved and straightens when it is still
    check('the carried picture leans while it is moved quickly (more than 4 degrees at some frame) and is nearly straight when the pointer is still', leanMax > 4 && Math.abs(leanStill) < 2, JSON.stringify({ leanMax: Math.round(leanMax * 10) / 10, leanStill }));
    // 5. under reduced motion the cards go straight to their places and the picture is exactly under the pointer
    await motion('reduce');
    await mouse('mouseMoved', 5, 5); await sleep(300);
    const snapStart = await handFacts();
    const snapPoint = await cardPoint(1);
    const snap = await sampleFrames("document.dispatchEvent(new PointerEvent('pointermove', { clientX: " + snapPoint.x + ", clientY: " + snapPoint.y + ", bubbles: true }));", 120);
    const snapHy = snap.map((frame) => frame.ys[1]);
    check('with reduced motion the hand is raised at once: every frame has the final numbers', new Set(snapHy.map((v) => Math.round(v * 10))).size <= 2, JSON.stringify(snapHy.slice(0, 8)));
    await mouse('mouseMoved', 5, 5); await sleep(200);
    void snapStart;
    await mouse('mouseMoved', 5, 5);
    // the order is the game's: a refresh would deal a new game on the solo table, so what is checked here is that the page's own list changed (the hand count and the cards are the same)
    check('the same cards are in the hand afterwards (only the order changed)', [...after.uids].sort().join() === [...before.uids].sort().join());
  }
  // ---- the card corner (frontend/src/spotlight.js) and the right column ----
  {
    const corner = () => ev(`(() => { const c = document.getElementById('spotlight'); const img = c.querySelector('.spot-picture'); const r = c.getBoundingClientRect(); return { empty: c.classList.contains('is-empty'), name: c.querySelector('.spot-name').textContent, src: img.hidden ? null : img.getAttribute('src'), closeShown: !c.querySelector('.spot-close').hidden, bottomGap: Math.round(innerHeight - r.bottom), right: Math.round(innerWidth - r.right), width: Math.round(r.width) }; })()`);
    const sel = await ev(`document.querySelector('.card.selected')?.querySelector('img')?.getAttribute('src') ?? null`);
    await ev(`document.querySelector('#battlefield').click()`); await sleep(100);
    const first = await corner();
    check('the card preview floats at the right of the window; it shows the selected card (the normal size) and keeps it after you click away', first.right <= 24 && first.width > 150 && !first.empty && /\/normal\//.test(first.src ?? '') && !first.closeShown, JSON.stringify(first));
    await clickCard('#hand .card', (await ev(`(() => { const imgs = [...document.querySelectorAll('#hand .card img')].map((i) => i.getAttribute('src')); return Math.max(1, imgs.findIndex((s) => s !== imgs[0])); })()`))); // (a card that is not the same picture as the first: the hand is shuffled, and two Islands would look alike)
    const second = await corner();
    check('selecting another card keeps the corner on a card (the hand is shuffled and can hold two Islands, so only the selection is checked)', !second.empty && (await count('.card.selected')) === 1, JSON.stringify([first, second]));
    const floating = await ev(`(() => { const r = (sel) => document.querySelector(sel).getBoundingClientRect(); const bar = r('.actions-panel'); const life = r('#life-area'); const menu = r('#settings-button'); const turn = r('.actions-panel .turn-stat'); const piles = r('.side-panels'); const preview = r('#spotlight'); const board = r('#my-board'); const panelBorders = ['#my-board', '.right-column', '.side-panels', '#spotlight', '.hand-section'].map((s) => getComputedStyle(document.querySelector(s)).borderTopWidth); return { barPosition: getComputedStyle(document.querySelector('.actions-panel')).position, barTop: Math.round(bar.top), grip: Boolean(document.querySelector('.actions-panel #bar-grip')), buttons: [...document.querySelectorAll('.actions-panel .actions button')].map((b) => b.id), barButtons: document.querySelectorAll('.bar .actions button').length, lifeLeft: Math.round(life.left), lifeTop: Math.round(life.top), menuRight: Math.round(innerWidth - menu.right), menuTop: Math.round(menu.top), turnInBar: turn.top >= bar.top && turn.bottom <= bar.bottom && turn.left >= bar.left && turn.right <= bar.right, pilesRight: Math.round(innerWidth - piles.right), pilesBottom: Math.round(innerHeight - piles.bottom), previewRight: Math.round(innerWidth - preview.right), previewAbovePiles: preview.bottom <= piles.top + 2, boardFills: Math.round(board.width) === innerWidth && Math.round(board.height) === innerHeight, panelBorders, footer: document.querySelector('footer') !== null }; })()`);
    check('no panels: the board fills the window and the board, the card preview and the piles have no border; the action buttons are a floating bar with a grip (not in the top strip); there is no footer', floating.boardFills && floating.panelBorders.every((w) => w === '0px') && floating.barPosition === 'absolute' && floating.grip && floating.buttons.includes('draw') && floating.buttons.includes('untap-all') && !floating.buttons.includes('settings-button') && floating.barButtons === 0 && !floating.footer, JSON.stringify(floating));
    check('the pieces float where a table has them: life at the top left, the menu button at the top right and the turn inside the floating bar, the piles and the command zone at the bottom right, the card preview at the right above them', floating.lifeLeft < 40 && floating.lifeTop < 40 && floating.menuRight < 40 && floating.menuTop < 40 && floating.turnInBar && floating.pilesRight < 40 && floating.pilesBottom < 40 && floating.previewRight < 40 && floating.previewAbovePiles, JSON.stringify(floating));
    const legal = await ev(`(() => { document.getElementById('settings-button').click(); const t = document.querySelector('#settings-menu .settings-legal')?.textContent ?? ''; const shown = !document.getElementById('settings-menu').hidden; document.getElementById('settings-button').click(); return { t, shown }; })()`);
    check('Settings has a way home: a link to the home page and one to your decks', await ev("(() => { const home = document.getElementById('settings-home'); const decks = document.getElementById('settings-decks'); return Boolean(home) && Boolean(decks) && home.getAttribute('href') === '/' && decks.getAttribute('href') === '/deck' && document.getElementById('settings-menu').contains(home) && document.getElementById('settings-menu').contains(decks); })()"));
    check('the fan content notice is in Settings', legal.shown && /unofficial Fan Content/.test(legal.t) && /Not approved\/endorsed by Wizards/.test(legal.t) && /property of Wizards of the Coast/.test(legal.t), JSON.stringify(legal));
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); await sleep(60);
    const kept = await corner();
    check('Escape deselects the card but the corner still shows it', (await count('.card.selected')) === 0 && !kept.empty && kept.name === second.name, JSON.stringify(kept));
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
  check('and it now offers "To sideboard"', (await moveTargets()).includes('Sideboard'));
  await clickAction('To sideboard');
  check('putting it back restores the sideboard and the hand', (await pileCount('sideboard')) === 'Sideboard: 2' && (await count('#hand .card')) === 7 && (await $text('status')) === `Moved ${wished} to your sideboard.`, await $text('status'));
  await press('viewer-close');
  await press('pile-library');
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
  check('an empty library wins over an old deck: there is no deck to play', !(await $hidden('blocked')) && /no saved deck/.test(await $text('blocked-message')), await $text('blocked-message'));
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
    await ev(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' })`);
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
    const p = await ev(`(() => { const arrow = String.fromCharCode(0x25b8); const b = [...document.querySelectorAll('.card-menu [role="menuitem"]')].filter((x) => !x.closest('[hidden]')).find((x) => x.textContent.replace(arrow, '').trim() === ${JSON.stringify(text)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
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
  check('a right click on a creature opens its menu: its name, then Modify, Tap, the counter with 2 3 5, Create copy and Move to (with the two marks after Tap: Elves came in sick)', menu && menu.title === 'Llanowar Elves' && menu.role === 'menu' && JSON.stringify(menu.items) === JSON.stringify(['Modify...', 'Tap', 'Flip', "Doesn't untap", 'Not summoning sick', '+1/+1 counter', '2', '3', '5', 'Create copy', 'Move to']), JSON.stringify(menu));
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
    for (let n = 0; n < 5; n++) await key('ArrowDown', 'ArrowDown', 40); // Tap, Flip, the two marks, then the counter
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
  await mouseMoveTo(1100, 600);
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1100, y: 600, button: 'left', buttons: 1, clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1100, y: 600, button: 'left', buttons: 0, clickCount: 1 });
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
  check('Modify... in the right-click menu opens the window and puts the cursor in the amount box', !(await $hidden('marks')) && (await ev(`document.activeElement.id`)) === 'marks-amount');
  await clickAction('Modify');
  check('its Close button hides the window and puts the focus back on the card', await (async () => { await ev(`document.querySelector('#marks .modify-close').click()`); return (await $hidden('marks')) && (await ev(`document.activeElement.classList.contains('card')`)); })());
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
  await mouse(cardAt('Delver'), { button: 'right', dy: 30 });
  const delverMenu = await menuState();
  check('the menu for Delver lists Flip double-faced card between Tap and the counter', delverMenu && JSON.stringify(delverMenu.items.slice(0, 5)) === JSON.stringify(['Modify...', 'Tap', 'Flip', 'Flip double-faced card', "Doesn't untap"]), JSON.stringify(delverMenu?.items));
  await sleep(500);
  check('the menu is still open half a second later (it must not close by itself after a right click on a card that was not selected)', Boolean(await menuState()), JSON.stringify(await menuState()));
  await clickMenuItem('Flip double-faced card');
  check('choosing it turns Delver (the menu closes, the label says so, the box says 3/2)', !(await menuState()) && /, turned over/.test(await labelOf('Delver')) && (await box('#battlefield ' + cardAt('Delver'))) !== null, await labelOf('Delver'));
  await clickCard(cardAt('Delver'));
  check('and the selected-card box shows the back face\'s 3/2', await (async () => { const b = await box('#battlefield ' + cardAt('Delver')); return b && b.power === '3' && b.toughness === '2'; })(), JSON.stringify(await box('#battlefield ' + cardAt('Delver'))));
  await clickAction('Deselect');
  await mouse(cardAt('Sol Ring'), { button: 'right', dy: 30 });
  const solMenu = await menuState();
  check('the menu of a card with no back has no Flip double-faced card', solMenu && !solMenu.items.includes('Flip double-faced card') && solMenu.items.includes('Tap'), JSON.stringify(solMenu?.items));
  await key('Escape', 'Escape', 27);

  // A turned card that leaves the battlefield comes back showing its front.
  await clickCard(cardAt('Aclazotz'));
  await clickAction('To hand');
  const aclazotzInHand = await srcOf('Aclazotz');
  check('Aclazotz, sent to the hand while turned over, is a front-face card there (not turned, front picture)', (await count('#hand ' + cardAt('Aclazotz'))) === 1 && !/turned over/.test(await labelOf('Aclazotz')) && /\/front\//.test(aclazotzInHand), String(aclazotzInHand));
  check('and in the hand it has no Flip double-faced card button', !(await actionLabels()).includes('Flip double-faced card') && !(await actionLabels()).includes('Flip double-faced card'));
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
  await mouse('#hand .card', { button: 'right', dy: 30 });
  const handMenu = await menuState();
  check('the right-click menu of the modal card in the hand offers it first, before Move to', handMenu && JSON.stringify(handMenu.items.slice(0, 2)) === JSON.stringify(['Play Valakut Stoneforge', 'Move to']), JSON.stringify(handMenu?.items));
  await clickMenuItem('Play Valakut Stoneforge');
  check('choosing it plays the land the same way', (await count('#hand .card')) === 0 && (await rowOf('Valakut Awakening')) === 'row-lands' && /, turned over/.test(await labelOf('Valakut Awakening')));
  await clickAction('Deselect');

  // Create copy: Sephiroth turned over, with two counters on him; the copy is the BACK face and has none of his counters.
  await clickCard(cardAt('Sephiroth'));
  await clickAction('Flip double-faced card');
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
  check('the library is a stack: three layers, a card back (no picture of the top card), the number on it and a line for a screen reader that is the only text', lib.cls && lib.layers === 2 && lib.back && lib.img === 0 && lib.count === '45' && lib.text === 'Library: 45' && lib.badge === '"45"' && lib.name === '"Library"', JSON.stringify(lib));
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
  check('the command zone has two slots; the commander is in the first, the second is an empty outline with no tax', (await count('#command .cmd-slot')) === 2 && (await count('#command .cmd-slot[data-slot="1"] .card')) === 1 && (await count('#command .cmd-slot.empty-slot')) === 1 && (await ev(`document.querySelector('.cmd-slot[data-slot="2"] .tax').hidden`)) === true);
  check('each slot has its own dotted outline', (await ev(`[...document.querySelectorAll('.cmd-slot .slot-cards')].map((e) => getComputedStyle(e).borderTopStyle).join()`)) === 'dotted,dotted');
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
  await mouse(cardAt('Goblin Guide'), { button: 'right', dy: 30 });
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
  const handCardPoint = async (name) => { const index = (await handNames()).findIndex((x) => x.startsWith(name)); return ev(`(() => { const card = document.querySelectorAll('#hand > .card')[${index}]; const r = card.getBoundingClientRect(); const y = r.top + r.height * 0.45; const xs = []; for (let x = r.left + 2; x < r.right - 2; x += 3) if (document.elementFromPoint(x, y)?.closest('#hand > .card') === card) xs.push(x); return { x: xs.length ? xs[Math.floor(xs.length / 2)] : r.left + r.width / 2, y }; })()`); }; // (a point that shows on the card: the cards of the hand overlap)
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
  await dragBy('Forest', -60, 17);
  check('the card on top can be taken off again, and the one under it stays', (await cellOfCard('Forest')) === '0,33' && (await cellOfCard('Sol Ring')) === '60,16');
  check('a card played from the hand carries no stacking number of the hand (the battlefield stacks by order; a left-over z-index once put the wrong card on top at random)', await ev(`[...document.querySelectorAll('#battlefield .card')].every((c) => c.style.zIndex === '')`));

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
  await dragTo(await centerOfSelector(cardAt('Forest')), { x: 640, y: 650 }); // (below the grid and above the hand: not on the board, not in the rectangle of the hand, not on a pile)
  check('letting go outside the battlefield and the hand (in the empty space between them) does nothing', (await cellOfCard('Forest')) === '0,33' && await dragStateGone());

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
  const forestState = () => ev(`(() => { const cs = Array.from(document.querySelectorAll('#battlefield .card')).filter((c) => c.getAttribute('aria-label').startsWith('Forest')); const visible = cs.filter((c) => getComputedStyle(c).display !== 'none'); const top = cs.find((c) => c.dataset.stackDepth === '0'); return { all: cs.length, visible: visible.length, cells: [...new Set(cs.map((c) => c.dataset.col + ',' + c.dataset.row))], badge: top && top.querySelector('.stack-count') ? top.querySelector('.stack-count').textContent : null, badges: document.querySelectorAll('#battlefield .stack-count').length, depths: cs.map((c) => c.dataset.stackDepth).join(), topLabel: top ? top.getAttribute('aria-label') : null, shifted: cs.filter((c) => c.dataset.stackDepth === '1' || c.dataset.stackDepth === '2').every((c) => getComputedStyle(c).translate !== 'none'), hiddenFlag: cs.filter((c) => c.dataset.stackHidden === '1').length }; })()`);
  let pile = await forestState();
  check('six Forests played one after another are one pile on the first land block', pile.all === 6 && pile.cells.length === 1 && pile.cells[0] === '0,33', JSON.stringify(pile));
  check('the pile shows 3 copies, the other 3 are hidden', pile.visible === 3 && pile.hiddenFlag === 3, JSON.stringify(pile));
  check('the top card says "6x" and nothing else carries a count', pile.badge === '6x' && pile.badges === 1, JSON.stringify(pile));
  check('the copies under the top one are shifted so the pile can be seen', pile.shifted === true && pile.depths.split(',').sort().join() === '0,1,2,3,4,5', JSON.stringify(pile));
  check('a screen reader is told it is the top of a stack of 6', /top of a stack of 6/.test(pile.topLabel ?? ''), String(pile.topLabel));

  if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-solo-stack.png');
  // moving a whole pile: Shift and drag any card of it, or hold it down until the circle is full; a plain drag still takes one card
  { const r = await boardRect(); const topCard = '#battlefield .card[data-stack-depth="0"]';
    const shiftDrag = async (from, to, modifiers, during = null) => { await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y }); await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1, modifiers }); for (let n = 1; n <= 8; n++) await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + (to.x - from.x) * n / 8, y: from.y + (to.y - from.y) * n / 8, buttons: 1, modifiers }); if (during) await during(); await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1, modifiers }); await sleep(100); };
    const from = await centerOfSelector(topCard);
    let carried = null;
    let ghostInfo = null;
    await shiftDrag(from, { x: from.x + 30 * r.width / 112, y: from.y - 11 * r.height / 44 }, 8, async () => { if (process.argv.includes('--screenshot')) { await sleep(80); await browser.screenshot('scratch-pile-ghost.png'); } ghostInfo = await ev("(() => { const g = document.querySelector('.drag-ghost'); if (!g) return null; const own = g.querySelector(':scope > img')?.getBoundingClientRect(); if (!own) return null; const round = (v) => Math.round(v * 10) / 10; const copies = [...g.querySelectorAll('.drag-ghost-copy')].map((c) => { const r = c.getBoundingClientRect(); return [round(r.left - own.left), round(r.top - own.top)]; }).sort((a, b) => a[0] - b[0] || a[1] - b[1]); const top = [...document.querySelectorAll('#battlefield .card')].find((c) => c.dataset.stackDepth === '0' && c.classList.contains('dragging')); const tr = top ? top.getBoundingClientRect() : null; const pile = [...document.querySelectorAll('#battlefield .card.dragging')].filter((c) => c.dataset.stackDepth !== '0' && !c.dataset.stackHidden).map((c) => { const r = c.getBoundingClientRect(); return [round(r.left - tr.left), round(r.top - tr.top)]; }).sort((a, b) => a[0] - b[0] || a[1] - b[1]); return { stack: g.classList.contains('stack'), count: g.dataset.count, copies, pile, layers: [...g.querySelectorAll('.drag-ghost-copy')].map((c) => c.style.zIndex) }; })()"); carried = await ev(`(() => ({ hidden: document.querySelectorAll('#battlefield .card.dragging').length, visible: Array.from(document.querySelectorAll('#battlefield .card')).filter((c) => getComputedStyle(c).visibility !== 'hidden' && getComputedStyle(c).display !== 'none').length }))()`); });
    check('the picture carried with a whole pile IS the pile: the top card and a layer for each of the other drawn copies (2 under it) in the same offsets the pile has on the board, behind the top card, and the count 6 in its corner', ghostInfo && ghostInfo.stack === true && ghostInfo.count === '6' && ghostInfo.copies.length === 2 && JSON.stringify(ghostInfo.copies) === JSON.stringify(ghostInfo.pile) && ghostInfo.copies.every(([x, y]) => x < 0 && y < 0) && ghostInfo.layers.every((z) => z === '-1'), JSON.stringify(ghostInfo));
    check('while a whole pile is carried every card of it is hidden at the old place (not only the one that was pressed)', carried && carried.hidden === 6 && carried.visible === 0, JSON.stringify(carried));
    pile = await forestState();
    check('Shift and drag on a pile moves the whole pile: all six Forests on the new cell, still 6x', pile.cells.length === 1 && pile.cells[0] === '30,22' && pile.badge === '6x' && /^Moved the pile of 6 Forest./.test(await $text('status')), JSON.stringify({ pile, status: await $text('status') }));
    check('...and there is no triangle in the corner of a pile any more', (await count('#battlefield .stack-handle')) === 0 && (await count('#battlefield [data-stack-handle]')) === 0);
    // holding the pile down: a circle fills over it; when it is full the whole pile is ready and moving carries all of it
    const holdAt = await centerOfSelector(topCard);
    const holdState = () => ev("(() => { const r = document.querySelector('#battlefield > .stack-hold-ring'); if (!r) return null; const c = getComputedStyle(r); return { cls: r.getAttribute('class'), opacity: c.opacity, w: r.getAttribute('width'), h: r.getAttribute('height'), fill: r.getAttribute('fill'), parent: r.parentElement.id }; })()");
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: holdAt.x, y: holdAt.y });
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: holdAt.x, y: holdAt.y, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(150);
    const filling = await holdState();
    check('holding a pile down shows a circle over it, still filling (not ready yet); it is an inline picture with its size and fill set', filling && /holding/.test(filling.cls) && !/ready/.test(filling.cls) && filling.w === '44' && filling.h === '44' && filling.fill === 'none' && filling.parent === 'battlefield', JSON.stringify(filling));
    await sleep(650);
    const ready = await holdState();
    if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-stack-hold.png');
    check('after half a second the circle is full: the pile is ready to be moved, and the circle is shown', ready && /ready/.test(ready.cls) && ready.opacity === '1', JSON.stringify(ready));
    for (let n = 1; n <= 8; n++) await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: holdAt.x - 30 * r.width / 112 * n / 8, y: holdAt.y + 11 * r.height / 44 * n / 8, buttons: 1 });
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: holdAt.x - 30 * r.width / 112, y: holdAt.y + 11 * r.height / 44, button: 'left', buttons: 0, clickCount: 1 }); await sleep(120);
    pile = await forestState();
    check('holding a pile until the circle is full and then moving carries the whole pile: back on the first land block, 6x, and the circle is gone', pile.cells.length === 1 && pile.cells[0] === '0,33' && pile.badge === '6x' && (await holdState()) === null, JSON.stringify(pile));
    // let go before the circle is full: nothing is carried, the circle goes
    { const p2 = await centerOfSelector(topCard);
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p2.x, y: p2.y });
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p2.x, y: p2.y, button: 'left', buttons: 1, clickCount: 1 });
      await sleep(200);
      const early = await holdState();
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p2.x, y: p2.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(100);
      check('letting go before the circle is full changes nothing and the circle goes away at once', early && /holding/.test(early.cls) && (await holdState()) === null && (await forestState()).cells.join() === '0,33'); }
    // moving before the circle is full takes ONE card off (the plain drag), and no circle is left
    { const p3 = await centerOfSelector(topCard);
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p3.x, y: p3.y });
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p3.x, y: p3.y, button: 'left', buttons: 1, clickCount: 1 });
      await sleep(120);
      for (let n = 1; n <= 8; n++) await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p3.x + 14 * r.width / 112 * n / 8, y: p3.y, buttons: 1 });
      const midDrag = await holdState();
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p3.x + 14 * r.width / 112, y: p3.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(120);
      const after = await forestState();
      check('moving the pile before the circle is full takes ONE card off the top (5x and one on its own) and the circle is gone as soon as the drag starts', midDrag === null && after.badge === '5x' && after.cells.length === 2, JSON.stringify({ midDrag, after }));
      await press('arrange'); await sleep(60); }
    const lone = await ev(`(() => { const c = document.querySelector('#battlefield .card[data-stack-depth="0"]').getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; })()`);
    await shiftDrag(lone, { x: lone.x + 12 * r.width / 112, y: lone.y }, 0);
    pile = await forestState();
    check('a plain drag of a card of a pile still takes ONE card off (5x here and one on its own)', pile.badge === '5x' && pile.cells.length === 2, JSON.stringify(pile));
    await press('arrange'); await sleep(60);
    check('(Auto-arrange puts the six together again)', (await forestState()).badge === '6x'); }

  // the dashed border around a pile, a card being dragged is not shown where it was, and the highlight of a selected card is thin
  { const border = await ev(`(() => { const c = document.querySelector('#battlefield .card[data-stack-depth="0"]'); const cs = getComputedStyle(c, '::before'); return { ext: c.dataset.stackExt, style: cs.borderTopStyle, width: cs.borderTopWidth, top: cs.top, left: cs.left, event: cs.pointerEvents }; })()`);
    check('a pile has a dashed border around it that reaches up and left over the copies under the top card and takes no clicks', border.ext === '2' && border.style === 'dashed' && border.width === '1px' && parseFloat(border.top) < -3 && parseFloat(border.left) < -3 && border.event === 'none', JSON.stringify(border));
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
  check('...and in horizontal the top card is still on its cell, the others to its left in a row (depth 1 is nearer than depth 2)', await ev(`(() => { const x = (d) => document.querySelector('#battlefield .card[data-stack-depth="' + d + '"]').getBoundingClientRect().left; return x(0) > x(1) && x(1) > x(2); })()`));
  // in the horizontal style a card tapped out of the pile goes to the side, like in the diagonal style (not up)
  await clickCard('#battlefield .card[data-stack-depth="0"]'); await clickAction('Tap');
  { const tappedCell = await ev(`(() => { const c = document.querySelector('#battlefield .card.tapped'); return c ? c.dataset.col + ',' + c.dataset.row : null; })()`);
    check('with Horizontal piles a Forest tapped out of the pile goes to the side, like with Diagonal piles (not up)', tappedCell === '9,33', String(tappedCell)); }
  if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-solo-stack-horizontal.png');
  await clickAction('Untap'); await clickAction('Deselect');
  check('...and untapping puts it back on the pile', (await forestState()).badge === '6x');
  await ev(`(() => { const s = document.getElementById('pile-style'); s.value = 'diagonal'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  check('choosing Diagonal again brings the diagonal back', (await pileShift()) === diagonalShift && (await ev(`document.body.dataset.pileStyle`)) === 'diagonal');
  // the style of piles of TAPPED cards is a choice of its own (Settings, "Piles of tapped cards"), and the other choice does not touch it
  {
    const selects = await ev("(() => { const a = document.getElementById('pile-style'); const b = document.getElementById('pile-style-tapped'); const words = (el) => el ? el.parentElement.textContent.replace(/\\s+/g, ' ').trim() : null; return { a: words(a), b: words(b), inMenu: Boolean(a && b && document.getElementById('settings-menu').contains(a) && document.getElementById('settings-menu').contains(b)), options: b ? [...b.options].map((o) => o.value) : null, tapped: document.body.dataset.tappedPileStyle ?? null, untapped: document.body.dataset.pileStyle }; })()");
    check('Settings has two choices, one for piles of untapped cards and one for piles of tapped cards, each Diagonal or Horizontal; both start diagonal', selects.inMenu && /untapped/.test(selects.a) && /tapped cards/.test(selects.b) && selects.options.join() === 'diagonal,horizontal,horizontal-top,vertical' && selects.tapped === 'diagonal' && selects.untapped === 'diagonal', JSON.stringify(selects));
    await clickCard('#battlefield .card[data-stack-depth="0"]:not(.tapped)'); await clickAction('Tap');
    await clickCard('#battlefield .card[data-stack-depth="0"]:not(.tapped)'); await clickAction('Tap'); await clickAction('Deselect');
    const tappedShift = () => ev("(() => { const c = document.querySelector('#battlefield .card.tapped[data-stack-depth=\"1\"]'); return c ? getComputedStyle(c).translate : null; })()");
    const untappedShift = () => ev("(() => { const c = document.querySelector('#battlefield .card:not(.tapped)[data-stack-depth=\"1\"]'); return c ? getComputedStyle(c).translate : null; })()");
    const setStyle = (id, value) => ev("(() => { const s = document.getElementById(" + JSON.stringify(id) + "); s.value = " + JSON.stringify(value) + "; s.dispatchEvent(new Event('change', { bubbles: true })); })()");
    const diagT = await tappedShift(); const diagU = await untappedShift();
    check('with both diagonal the copy under the top tapped card and the copy under the top untapped card are both shifted up and to the left', /^-?[\d.]+px -[\d.]+px$/.test(diagT ?? '') && /^-[\d.]+px -[\d.]+px$/.test(diagU ?? ''), JSON.stringify({ diagT, diagU }));
    await setStyle('pile-style-tapped', 'horizontal');
    const horT = await tappedShift(); const stillU = await untappedShift();
    check('choosing Horizontal for piles of TAPPED cards moves only the tapped pile (no vertical shift); the untapped pile stays diagonal; the choice is kept under its own key', /^-?[\d.]+px( 0px)?$/.test(horT ?? '') && stillU === diagU && (await ev("document.body.dataset.tappedPileStyle")) === 'horizontal' && (await ev("document.body.dataset.pileStyle")) === 'diagonal' && (await ev("localStorage.getItem('overloaded.tappedPileStyle')")) === 'horizontal' && (await ev("localStorage.getItem('overloaded.pileStyle')")) !== 'horizontal', JSON.stringify({ horT, stillU, diagU }));
    await setStyle('pile-style', 'horizontal'); await setStyle('pile-style-tapped', 'diagonal');
    const swappedT = await tappedShift(); const swappedU = await untappedShift();
    check('and the other way round: untapped horizontal and tapped diagonal, each by its own choice', /^-?[\d.]+px -[\d.]+px$/.test(swappedT ?? '') && /^-[\d.]+px( 0px)?$/.test(swappedU ?? ''), JSON.stringify({ swappedT, swappedU }));
    // Vertical (the copies go straight up) for both kinds of pile, and where the pile of tapped cards sits: one cell to the right when diagonal, two when horizontal, none when vertical (a cell is an eighth of a card)
    {
      const cardWidth = await ev("[...document.querySelectorAll('#battlefield .card:not(.tapped)')].find((c) => c.offsetWidth > 0).getBoundingClientRect().width");
      const cell = cardWidth / 8;
      const topShift = () => ev("(() => { const c = document.querySelector('#battlefield .card.tapped[data-stack-ext]'); return c ? getComputedStyle(c).translate : null; })()");
      const xOf = (text) => (text === 'none' || text === null ? 0 : parseFloat(text));
      await setStyle('pile-style-tapped', 'diagonal');
      const diagTop = await topShift();
      await setStyle('pile-style-tapped', 'horizontal');
      const horTop = await topShift();
      await setStyle('pile-style-tapped', 'vertical');
      const verTop = await topShift(); const verT = await tappedShift();
      check('a pile of tapped cards is moved to the right: one cell when diagonal, two cells when horizontal, not at all when vertical', Math.abs(xOf(diagTop) - cell) < 0.6 && Math.abs(xOf(horTop) - 2 * cell) < 0.6 && xOf(verTop) === 0 && cell > 4, JSON.stringify({ cell, diagTop, horTop, verTop }));
      check('vertical piles of tapped cards go straight up (no sideways shift, the copy under the top one is higher)', /^0px -[\d.]+px$/.test(verT ?? ''), String(verT));
      await setStyle('pile-style', 'vertical');
      const verU = await untappedShift();
      if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-solo-vertical.png');
      const rows = await ev("(() => { const y = (d) => document.querySelector('#battlefield .card:not(.tapped)[data-stack-depth=\"' + d + '\"]')?.getBoundingClientRect(); const a = y(0); const b = y(1); return a && b ? { sameLeft: Math.abs(a.left - b.left) < 0.5, higher: b.top < a.top } : null; })()");
      check('vertical piles of untapped cards go straight up too, and the page and storage remember the choice', /^0px -[\d.]+px$/.test(verU ?? '') && rows?.sameLeft === true && rows?.higher === true && (await ev("document.body.dataset.pileStyle")) === 'vertical' && (await ev("localStorage.getItem('overloaded.pileStyle')")) === 'vertical', JSON.stringify({ verU, rows }));
      check('each choice lists Vertical besides Diagonal and Horizontal', JSON.stringify(await ev("[...document.getElementById('pile-style').options].map((o) => o.value)")) === '["diagonal","horizontal","vertical"]' && JSON.stringify(await ev("[...document.getElementById('pile-style-tapped').options].map((o) => o.value)")) === '["diagonal","horizontal","horizontal-top","vertical"]' && JSON.stringify(await ev("[...document.getElementById('pile-style-tapped').options].map((o) => o.textContent)")) === '["Diagonal","(B) Horizontal","(T) Horizontal","Vertical"]');
      await setStyle('pile-style-tapped', 'horizontal-top');
      if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-solo-top.png');
      const topT = await tappedShift(); const topTop = await topShift();
      // the dashed border of the pile hugs the cards: 3 px outside the top card at the top, left and bottom (it used to start a step higher, and so ended past the card), and reaches past the right edge by the copies
      const border = await ev("(() => { const c = document.querySelector('#battlefield .card.tapped[data-stack-ext]'); const b = getComputedStyle(c, '::before'); const r = c.getBoundingClientRect(); return { top: b.top, left: b.left, bottom: b.bottom, height: b.height, cardHeight: r.height, right: parseFloat(b.right) }; })()");
      check('(T) Horizontal: the dashed border of the pile is 3 px outside the card at the top, left and bottom (it does not go past the bottom), and goes out to the right to take in the copies', border.top === '-3px' && border.left === '-3px' && border.bottom === '-3px' && border.right < -3, JSON.stringify(border));
      const strips = await ev("(() => { const r = (d) => document.querySelector('#battlefield .card.tapped[data-stack-depth=\"' + d + '\"]')?.getBoundingClientRect(); const a = r(0); const b = r(1); return a && b ? { toRight: b.left > a.left, sameTop: Math.abs(a.top - b.top) < 0.5 } : null; })()");
      check('(T) Horizontal: the copy under the top tapped card goes to the RIGHT (the top of the card shows), at the same height, and the pile is not moved over', /^[\d.]+px( 0px)?$/.test(topT ?? '') && xOf(topTop) === 0 && strips?.toRight === true && strips?.sameTop === true && (await ev('document.body.dataset.tappedPileStyle')) === 'horizontal-top' && (await ev("localStorage.getItem('overloaded.tappedPileStyle')")) === 'horizontal-top', JSON.stringify({ topT, topTop, strips }));
      await setStyle('pile-style', 'horizontal'); await setStyle('pile-style-tapped', 'diagonal');
    }
    await setStyle('pile-style', 'diagonal');
    await press('untap-all'); await sleep(80);
    check('(the two tapped Forests are untapped and back on the pile of six)', (await forestState()).badge === '6x' && (await count('#battlefield .card.tapped')) === 0);
    // E twice over a pile with the pointer still: each press is the card that is on top NOW (it used to tap and then untap the same card, which it still thought was under the pointer)
    { const eKey = async () => { await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69, text: 'e' }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69 }); await sleep(120); };
      const p = await centerOfSelector('#battlefield .card[data-stack-depth="0"]:not(.tapped)');
      await mouseAt('mouseMoved', p, 0); await sleep(80);
      await eKey();
      const afterOne = await ev("(() => ({ tapped: document.querySelectorAll('#battlefield .card.tapped').length, badge: document.querySelector('#battlefield .card:not(.tapped)[data-stack-depth=\"0\"] .stack-count')?.textContent ?? null }))()");
      await eKey();
      const afterTwo = await ev("(() => ({ tapped: document.querySelectorAll('#battlefield .card.tapped').length, badge: document.querySelector('#battlefield .card:not(.tapped)[data-stack-depth=\"0\"] .stack-count')?.textContent ?? null }))()");
      check('E over a pile once taps the top card out of it (5x left); E again WITHOUT moving the pointer taps the next card (4x left, two tapped), not the same card again', afterOne.tapped === 1 && afterOne.badge === '5x' && afterTwo.tapped === 2 && afterTwo.badge === '4x', JSON.stringify({ afterOne, afterTwo }));
      await press('untap-all'); await sleep(80); }
    // the picture carried with a whole pile of TAPPED cards is the pile on its side: its copies are in the offsets the tapped pile has on the board
    { await clickCard('#battlefield .card[data-stack-depth="0"]:not(.tapped)'); await clickAction('Tap');
      await clickCard('#battlefield .card[data-stack-depth="0"]:not(.tapped)'); await clickAction('Tap'); await clickAction('Deselect');
      const tp = await centerOfSelector('#battlefield .card.tapped[data-stack-depth="0"]');
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tp.x, y: tp.y });
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tp.x, y: tp.y, button: 'left', buttons: 1, clickCount: 1, modifiers: 8 });
      for (let n = 1; n <= 6; n++) await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tp.x + 20 * n, y: tp.y - 4 * n, buttons: 1 });
      const tg = await ev("(() => { const g = document.querySelector('.drag-ghost'); if (!g) return null; const own = g.querySelector(':scope > img')?.getBoundingClientRect(); if (!own) return null; const round = (v) => Math.round(v * 10) / 10; const copies = [...g.querySelectorAll('.drag-ghost-copy')].map((c) => { const r = c.getBoundingClientRect(); return [round(r.left - own.left), round(r.top - own.top)]; }).sort((a, b) => a[0] - b[0] || a[1] - b[1]); const top = [...document.querySelectorAll('#battlefield .card')].find((c) => c.dataset.stackDepth === '0' && c.classList.contains('dragging')); const tr = top ? top.getBoundingClientRect() : null; const pile = [...document.querySelectorAll('#battlefield .card.dragging')].filter((c) => c.dataset.stackDepth !== '0' && !c.dataset.stackHidden).map((c) => { const r = c.getBoundingClientRect(); return [round(r.left - tr.left), round(r.top - tr.top)]; }).sort((a, b) => a[0] - b[0] || a[1] - b[1]); return { stack: g.classList.contains('stack'), count: g.dataset.count, copies, pile, layers: [...g.querySelectorAll('.drag-ghost-copy')].map((c) => c.style.zIndex) }; })()");
      await key('Escape', 'Escape', 27); await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tp.x + 120, y: tp.y - 24, button: 'left', buttons: 0, clickCount: 1 }); await sleep(120);
      check('the picture carried with a whole pile of two TAPPED Forests shows the second one in the same offset the tapped pile has on the board (up and to the left, whichever way the picture is turned)', tg && tg.stack === true && tg.copies.length === 1 && tg.pile.length === 1 && Math.abs(tg.copies[0][0] - tg.pile[0][0]) <= 1.5 && Math.abs(tg.copies[0][1] - tg.pile[0][1]) <= 1.5 && tg.copies[0][0] < 0 && tg.copies[0][1] < 0, JSON.stringify(tg));
      await press('untap-all'); await sleep(80); }
  }

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
  await clickAction('Modify');
  { const p = await centerOfSelector('#marks-amount'); await mouseAt('mouseMoved', p, 0); await mouseAt('mousePressed', p, 1); await mouseAt('mouseReleased', p, 0); await sleep(80); }
  check('a click inside the Modify window does not deselect the card (it is how the card is used)', (await count('#battlefield .card.selected')) === 1 && !(await $hidden('marks')), await $text('selected-line'));
  await ev(`document.querySelector('#marks .modify-close').click()`);
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
  // E over a card of the battlefield taps or untaps it
  { const eKey = async (modifiers = 0, shift = false) => { await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: shift ? 'E' : 'e', code: 'KeyE', windowsVirtualKeyCode: 69, text: shift ? 'E' : 'e', modifiers }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: shift ? 'E' : 'e', code: 'KeyE', windowsVirtualKeyCode: 69, modifiers }); await sleep(100); };
    const p = await centerOfSelector('#battlefield .card[data-stack-depth="0"]');
    const empty = await boardRect();
    const onEmpty = { x: empty.left + empty.width * 0.6, y: empty.top + empty.height * 0.3 };
    await mouseAt('mouseMoved', onEmpty, 0); await sleep(60);
    const t0 = await count('#battlefield .card.tapped');
    await eKey();
    check('E with the pointer over empty space does nothing', (await count('#battlefield .card.tapped')) === t0);
    await mouseAt('mouseMoved', p, 0); await sleep(60);
    await eKey(2);
    check('Ctrl+E does nothing (only a plain E is the shortcut)', (await count('#battlefield .card.tapped')) === t0);
    await eKey(8, true);
    check('Shift+E does nothing', (await count('#battlefield .card.tapped')) === t0);
    await eKey();
    check('E with the pointer over a card of the battlefield taps it and says so', (await count('#battlefield .card.tapped')) === t0 + 1 && /^Tapped /.test(await $text('status')), await $text('status'));
    const q = await centerOfSelector('#battlefield .card.tapped');
    await mouseAt('mouseMoved', q, 0); await sleep(60);
    await eKey();
    check('E again untaps it', (await count('#battlefield .card.tapped')) === t0 && /^Untapped /.test(await $text('status')), await $text('status'));
    await mouseAt('mouseMoved', { x: 4, y: 4 }, 0); await sleep(60);
    await eKey();
    check('E with the pointer away from the battlefield does nothing', (await count('#battlefield .card.tapped')) === t0); }
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
    check('a Forest tapped out of the pile of six steps to the right by a whole card and one more cell, and the pile is 5x', tappedCell === '9,33' && pile.badge === '5x' && pile.cells.includes('0,33'), JSON.stringify({ tappedCell, pile })); }
  await clickAction('Untap');
  pile = await forestState();
  check('untapping it sends it back onto the pile: 6x again', pile.badge === '6x' && pile.cells.length === 1 && pile.cells[0] === '0,33', JSON.stringify(pile));
  // a stack of tapped cards is drawn straight up (the lower copy above the top one), and an untapped card leaves it on the left
  await clickCard('#battlefield .card[data-stack-depth="0"]:not(.tapped)'); await clickAction('Tap');
  await clickCard('#battlefield .card[data-stack-depth="0"]:not(.tapped)'); await clickAction('Tap');
  { const fan = await ev(`(() => { const t = Array.from(document.querySelectorAll('#battlefield .card.tapped')); const under = t.find((c) => c.dataset.stackDepth === '1'); const top = t.find((c) => c.dataset.stackDepth === '0'); return { n: t.length, translate: under ? getComputedStyle(under).translate : null, cells: [...new Set(t.map((c) => c.dataset.col + ',' + c.dataset.row))], topBottom: top ? Math.round(top.getBoundingClientRect().bottom) : null, underBottom: under ? Math.round(under.getBoundingClientRect().bottom) : null }; })()`);
    check('two tapped Forests are one stack of 2 on one cell, and the lower copy is shifted diagonally, up and (a little) to the left of the pile, which itself sits a cell to the right (the default style of tapped piles)', fan.n === 2 && fan.cells.length === 1 && /^-?[0-9.]+px -[0-9.]+px$/.test(fan.translate ?? '') && fan.underBottom < fan.topBottom, JSON.stringify(fan)); }
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

  // ---- a TAPPED card carried on the battlefield: its picture is visible, on its side, as big as the tapped card (frontend/src/board-drag.js) ----
  {
    await open(MARKS_DECK);
    const names0 = await handNames();
    await dragTo(await handCardPoint(names0[2]), await cellCenter(40, 8));
    const cardSel = '#battlefield > .card';
    const eTap = async () => { await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69, text: 'e' }); await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'e', code: 'KeyE', windowsVirtualKeyCode: 69 }); await sleep(120); };
    await mouseAt('mouseMoved', await centerOfSelector(cardSel), 0); await sleep(80); await eTap();
    const tappedBox = await ev("(() => { const c = document.querySelector('#battlefield > .card'); const r = c.getBoundingClientRect(); return { tapped: c.classList.contains('tapped'), w: Math.round(r.width), h: Math.round(r.height) }; })()");
    check('the card is tapped (E over it) and its box is landscape', tappedBox.tapped && tappedBox.w > tappedBox.h, JSON.stringify(tappedBox));
    let ghost = null;
    await dragTo(await centerOfSelector(cardSel), await cellCenter(70, 14), { release: false, during: async () => {
      ghost = await ev("(() => { const g = document.querySelector('.drag-ghost'); if (!g) return null; const r = g.getBoundingClientRect(); const cs = getComputedStyle(g); const img = g.querySelector('img'); const ir = img ? img.getBoundingClientRect() : null; return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), top: Math.round(r.top), opacity: cs.opacity, display: cs.display, visibility: cs.visibility, hasImg: Boolean(img), imgW: ir ? Math.round(ir.width) : 0, imgH: ir ? Math.round(ir.height) : 0, tapped: g.classList.contains('tapped'), inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; })()");
      if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-tapped-drag.png');
    } });
    check('the picture carried for a tapped card is there and visible (it is not hidden or empty)', ghost && ghost.hasImg && ghost.display !== 'none' && ghost.visibility === 'visible' && Number(ghost.opacity) > 0.3 && ghost.w > 20 && ghost.h > 20 && ghost.inside, JSON.stringify(ghost));
    check('...it is on its side like the tapped card, and as big as it (within 4 pixels), and its picture fills it', ghost && Math.abs(ghost.w - tappedBox.w) <= 4 && Math.abs(ghost.h - tappedBox.h) <= 4 && Math.abs(ghost.imgW - ghost.w) <= 4 && Math.abs(ghost.imgH - ghost.h) <= 4, JSON.stringify({ ghost, tappedBox }));
    await mouseAt('mouseReleased', await cellCenter(70, 14), 0); await sleep(150);
    check('letting go puts the tapped card down where it was let go and it is still tapped', (await ev("document.querySelector('#battlefield > .card').classList.contains('tapped')")) === true && (await ev("document.querySelector('#battlefield > .card').dataset.col")) !== '40', JSON.stringify(await ev("(() => { const c = document.querySelector('#battlefield > .card'); return [c.dataset.col, c.dataset.row]; })()")));
  }

  // ---- the hand does not grow past 7 cards: more cards overlap more, and the dashed box stays the same width (shared/hand-layout.mjs) ----
  {
    await open(); // a hand of 7, a library
    const span = () => ev("(() => { const h = document.getElementById('hand'); const cs = [...h.querySelectorAll(':scope > .card')]; const xs = cs.map((c) => parseFloat(c.style.getPropertyValue('--hx'))); return { n: cs.length, row: Math.round(Math.max(...xs) + cs[0].offsetWidth - Math.min(...xs)), box: Math.round(parseFloat(h.style.getPropertyValue('--zw'))), step: Math.round((xs[1] - xs[0]) * 10) / 10 }; })()");
    const s7 = await span();
    for (let n = 0; n < 3; n++) await press('draw');
    await sleep(100);
    const s10 = await span();
    for (let n = 0; n < 3; n++) await press('draw');
    await sleep(100);
    const s13 = await span();
    check('the hand is not wider with more than 7 cards: 7, 10 and 13 cards cover the same width (within 2 pixels), and the dashed box is the same width too', s7.n === 7 && s10.n === 10 && s13.n === 13 && Math.abs(s10.row - s7.row) <= 2 && Math.abs(s13.row - s7.row) <= 2 && Math.abs(s10.box - s7.box) <= 2 && Math.abs(s13.box - s7.box) <= 2, JSON.stringify({ s7, s10, s13 }));
    check('...the cards overlap more instead: the step between cards is smaller with 10 cards than with 7, and smaller again with 13', s10.step < s7.step && s13.step < s10.step, JSON.stringify({ s7, s10, s13 }));
  }

  // ---- a card carried from the battlefield over the hand: one rectangle round the whole hand, a place opens in it, and the card is put there (frontend/src/hand-view.js, board-drag.js) ----
  {
    await open(MARKS_DECK); // a hand of 7
    const handUids = () => ev("[...document.querySelectorAll('#hand > .card')].map((c) => c.dataset.uid)");
    const handXs = () => ev("[...document.querySelectorAll('#hand > .card')].map((c) => Math.round(parseFloat(c.style.getPropertyValue('--hx'))))");
    // play the card in the middle of the hand onto the board, and then carry it back to a place in the middle
    const names7 = await handNames();
    const playedUid = (await handUids())[3];
    await dragTo(await handCardPoint(names7[3]), await cellCenter(40, 8));
    check('a card of the hand played to the battlefield (the setup of the checks that follow)', (await count('#battlefield > .card')) === 1 && (await count('#hand > .card')) === 6);
    const before = await handXs();
    const uidsBefore = await handUids();
    const box = await ev("(() => { const r = document.getElementById('hand').getBoundingClientRect(); return { left: r.left, right: r.right, bottom: r.bottom }; })()");
    const mid = { x: (box.left + box.right) / 2, y: box.bottom - 60 }; // (in the bottom half of the box of the hand: that is the area a card is dropped on)
    let seen = null; let away = null;
    await dragTo(await centerOfSelector('#battlefield > .card'), mid, { release: false, during: async () => {
      await sleep(250);
      if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-hand-outline.png');
      seen = await ev("(() => { const h = document.getElementById('hand'); const after = getComputedStyle(h, '::after'); return { outline: after.opacity, style: after.borderTopStyle, wide: Math.round(parseFloat(after.width)), cardOutlines: [...h.querySelectorAll(':scope > .card')].map((c) => getComputedStyle(c).outlineStyle), hole: h.dataset.hole ?? null, marked: document.getElementById('hand-section').classList.contains('drop-hand'), xs: [...h.querySelectorAll(':scope > .card')].map((c) => Math.round(parseFloat(c.style.getPropertyValue('--hx')))) }; })()");
    } });
    const holeShown = Number(seen?.hole);
    const rectBox = await ev("(() => { const h = document.getElementById('hand'); const a = getComputedStyle(h, '::after'); const r = h.getBoundingClientRect(); return { handH: Math.round(r.height), top: Math.round(parseFloat(a.top)), height: Math.round(parseFloat(a.height)), bottomGap: Math.round(parseFloat(a.bottom)) }; })()");
    check('the rectangle is inside the box of the hand, below its top, with its bottom edge on the bottom of the box (where it starts is checked below, by where the hand rises)', rectBox.top > 20 && rectBox.top < rectBox.handH / 2 + 1 && rectBox.bottomGap === 0, JSON.stringify(rectBox));
    check('carried over the hand a card from the battlefield is shown by ONE rectangle round the whole hand (a dashed outline, as wide as the hand), and no card of the hand has an outline of its own', seen && seen.marked === true && seen.outline === '1' && seen.style === 'dashed' && seen.wide > 300 && seen.cardOutlines.every((o) => o === 'none'), JSON.stringify(seen));
    check('the hand opens a place for it: one place is open among the cards (a hole between two of them) and the cards have moved', Number.isInteger(holeShown) && holeShown >= 0 && holeShown <= 6 && JSON.stringify(seen.xs) !== JSON.stringify(before), JSON.stringify({ hole: seen?.hole, before, now: seen?.xs }));
    // away from the hand the place closes again
    await mouseAt('mouseMoved', { x: mid.x, y: mid.y - 420 }, 1); await sleep(450);
    away = await handXs();
    check('carried away from the hand the place closes: the cards close up again', away.length === 6 && away.join() === before.join(), JSON.stringify({ before, away, shown: seen?.xs }));
    await mouseAt('mouseMoved', mid, 1); await sleep(300);
    const holeBack = Number(await ev("document.getElementById('hand').dataset.hole ?? -1"));
    await mouseAt('mouseReleased', mid, 0); await sleep(500);
    const uidsAfter = await handUids();
    check('letting go puts the card at the place that was open: it is in the hand at that place and the other cards keep their order', uidsAfter.length === 7 && uidsAfter[holeBack] === playedUid && uidsAfter.filter((u) => u !== playedUid).join() === uidsBefore.join(), JSON.stringify({ holeBack, uidsBefore, uidsAfter, playedUid }));
    { // the dashed rectangle starts where the hand starts to rise when the pointer comes near it: just above its top edge the hand stays down, just inside it the hand rises
      const geo = await ev("(() => { const h = document.getElementById('hand'); const r = h.getBoundingClientRect(); const a = getComputedStyle(h, '::after'); return { top: r.top + parseFloat(a.top), left: r.left + parseFloat(a.left), width: parseFloat(a.width) }; })()");
      const xMid = geo.left + geo.width / 2;
      const raisedNow = () => ev("document.getElementById('hand').classList.contains('raised')");
      await mouseAt('mouseMoved', { x: 5, y: 5 }, 0); await sleep(500);
      await mouseAt('mouseMoved', { x: xMid, y: geo.top - 10 }, 0); await sleep(300);
      const above = await raisedNow();
      await mouseAt('mouseMoved', { x: xMid, y: geo.top + 10 }, 0); await sleep(300);
      const inside = await raisedNow();
      check('the dashed rectangle starts exactly where the hand starts to rise: 10 pixels above its top edge the hand stays down, 10 pixels inside it the hand rises', above === false && inside === true, JSON.stringify({ above, inside, top: geo.top }));
      await mouseAt('mouseMoved', { x: 5, y: 5 }, 0); await sleep(300);
    }
    check('nothing is left of the outline or the carry afterwards', await dragStateGone() && (await ev("document.getElementById('hand').dataset.hole === undefined")) && (await ev("getComputedStyle(document.getElementById('hand'), '::after').opacity")) === '0');
  }

  // ---- the piles and the command zone: cards are taken from them and dropped on them (frontend/src/board-drag.js, real mouse input) ----
  {
    await open(); // the default deck: a hand of 7, a library, a commander in the command zone
    const zoneCount = (zone) => ev("Number(document.getElementById('pile-" + zone + "').dataset.count)");
    const counts = async () => ({ hand: await count('#hand > .card'), field: await count('#battlefield > .card'), library: await zoneCount('library'), graveyard: await zoneCount('graveyard'), exile: await zoneCount('exile'), command: await count('#command .card') });
    const face = (zone) => centerOfSelector('#pile-' + zone + ' .stack-face');
    const handPoint = async () => handCardPoint((await handNames())[0]);
    const c0 = await counts();
    check('the table starts with a hand of 7, a library, a commander in the command zone and nothing on the field, in the graveyard or the exile', c0.hand === 7 && c0.field === 0 && c0.library > 40 && c0.graveyard === 0 && c0.exile === 0 && c0.command === 1, JSON.stringify(c0));
    // a plain click on a pile still opens its viewer (it is not a drag)
    { const p = await face('library'); await mouseAt('mouseMoved', p, 0); await mouseAt('mousePressed', p, 1); await mouseAt('mouseReleased', p, 0); await sleep(150);
      check('a click on the library (no movement) still opens it, as before', !(await $hidden('viewer'))); await press('viewer-close'); await sleep(100); }
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
    await dragTo(await handPoint(), await centerOfSelector('#command'));
    const c6d = await counts();
    check('a card of the hand dropped on the command zone goes into it', c6d.hand === c6c.hand - 1 && c6d.command === c6c.command + 1, JSON.stringify(c6d));
    const added = await ev(`(() => { const c = [...document.querySelectorAll('#command .card')].find((n) => !${JSON.stringify(commanderUids)}.includes(n.dataset.uid)); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
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
    const slotAt = await centerOfSelector('#command');
    await dragTo(await centerOfSelector('#battlefield > .card[aria-label^="' + cmdName.split(',')[0].replace(/"/g, '') + '"]'), slotAt);
    const c8 = await counts();
    check('a card of the battlefield dropped on the command zone goes back into it', c8.command === 1 && c8.field === c7.field - 1, JSON.stringify(c8));
    // the commander can be put in either slot of the command zone, and the second slot has its own tax and lights up like the first
    {
      const slotBox = (n) => centerOfSelector('.cmd-slot[data-slot="' + n + '"] .slot-cards');
      const slotState = () => ev("(() => { const f = (n) => { const slot = document.querySelector('.cmd-slot[data-slot=\"' + n + '\"]'); const tax = slot.querySelector('.tax-words'); return { cards: slot.querySelectorAll('.card').length, empty: slot.classList.contains('empty-slot'), tax: slot.querySelector('.tax').hidden ? null : tax.textContent, border: getComputedStyle(slot.querySelector('.slot-cards')).borderTopColor }; }; return [f(1), f(2)]; })()");
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
    check('the action bar starts in the middle of the top, and the board starts under it (a card in the first cell is not covered)', Math.abs((b0.left + b0.right) / 2 - 640) <= 3 && b0.top <= 12 && boardTop >= b0.bottom, JSON.stringify({ b0, boardTop }));
    await dragGrip(-300, 200);
    const b1 = await barBox();
    check('dragging the grip moves the bar by as much as the pointer moved (when it lands away from the edges)', Math.abs(b1.left - (b0.left - 300)) <= 3 && Math.abs(b1.top - (b0.top + 200)) <= 3, JSON.stringify({ b0, b1 }));
    const saved = JSON.parse((await stored()) ?? 'null');
    check('where it was let go is kept in the browser as two fractions of the room it has', saved && saved.fx > 0 && saved.fx < 1 && saved.fy > 0 && saved.fy < 1, JSON.stringify(saved));
    const statusBefore = await $text('status');
    await ev("document.getElementById('untap-all').click()");
    check('the buttons on the moved bar still work (Untap all says what it did)', /Untapped/.test(await $text('status')) && statusBefore !== (await $text('status')) || /Untapped/.test(await $text('status')), await $text('status'));
    await dragGrip(-(b1.left - 5), 0);
    check('let go within 12 px of the left edge it snaps flush to it (8 px from the edge)', (await barBox()).left === 8, JSON.stringify(await barBox()));
    { const p = await centerOfSelector("#bar-grip"); await dragGrip(1279 - p.x, 999 - p.y); } // (to the very corner of the window: the browser sends no mouse events from outside it)
    const far = await barBox();
    check('dragged far outside the window it is brought back inside it, into the corner', far.right <= 1280 && far.bottom <= 1000 && far.right >= 1280 - 12 && far.bottom >= 1000 - 12, JSON.stringify(far));
    await ev("document.getElementById('bar-grip').focus()");
    await gripKey('ArrowLeft'); await gripKey('ArrowLeft');
    const keyed = await barBox();
    check('with the keyboard the arrow keys move it by 10 pixels', keyed.left === far.left - 20, JSON.stringify({ far, keyed }));
    await gripKey('Home');
    const home = await barBox();
    check('Home puts it back in the middle of the top', Math.abs((home.left + home.right) / 2 - 640) <= 3 && home.top <= 12, JSON.stringify(home));
    await dragGrip(-250, 120);
    const placed = await barBox();
    await open(MARKS_DECK);
    const again = await barBox();
    check('after the page is loaded again the bar is where it was left', Math.abs(again.left - placed.left) <= 2 && Math.abs(again.top - placed.top) <= 2, JSON.stringify({ placed, again }));
    await ev("localStorage.setItem('overloaded.actionBar', '{\"fx\":\"left\",\"fy\":99}')");
    await open(MARKS_DECK);
    const damaged = await barBox();
    check('a damaged stored place is ignored: the bar is in the default place', Math.abs((damaged.left + damaged.right) / 2 - 640) <= 3 && damaged.top <= 12, JSON.stringify(damaged));
    await ev("localStorage.removeItem('overloaded.actionBar')");
    await open(MARKS_DECK);
  }

  // ---- storage blocked ----
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });` });
  await browser.goto(PAGE);
  await waitFor(async () => !(await $hidden('blocked')) || null, 10000, 50);
  check('with storage blocked the page does not crash: it says there is no deck', !(await $hidden('blocked')) && /no saved deck/.test(await $text('blocked-message')));

  // ---- the whole session ----
  const errors = browser.logs.filter((l) => /^exception:|^console\.error|^error:/.test(l) && !/Failed to load resource|ERR_BLOCKED|net::/.test(l));
  check('no script errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  const foreign = browser.events.filter((e) => e.method === 'Network.requestWillBeSent' && !e.params.request.url.startsWith(ORIGIN) && !e.params.request.url.startsWith('data:') && !e.params.request.url.startsWith('https://cards.scryfall.io/') && !e.params.request.url.startsWith('https://backs.scryfall.io/') && !e.params.request.url.startsWith('https://svgs.scryfall.io/card-symbols/')); // (the mana symbols above the cards of the hand)
  check('nothing was requested from any site but this one and the picture and symbol servers of Scryfall', foreign.length === 0, foreign.slice(0, 2).map((e) => e.params.request.url).join(' | '));

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
    // the corners of the card preview and of a card of the hand, 4 times larger (no white may show outside the rounded card)
    { const spots = await ev(`(() => { const a = document.querySelector('#spotlight .spot-picture')?.getBoundingClientRect(); const b = document.querySelector('#hand > .card .face')?.getBoundingClientRect(); return { a: a ? { x: a.x, y: a.y } : null, b: b ? { x: b.x, y: b.y } : null }; })()`);
      if (spots.a) await browser.screenshot('scratch-zoom-preview.png', { clip: { x: spots.a.x - 6, y: spots.a.y - 6, width: 70, height: 70, scale: 4 } });
      if (spots.b) await browser.screenshot('scratch-zoom-hand.png', { clip: { x: spots.b.x - 6, y: spots.b.y - 6, width: 70, height: 70, scale: 4 } }); }
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
    for (const name of ['Valakut Awakening', 'Aclazotz']) { await clickCard(cardAt(name)); await clickAction('Flip double-faced card'); await clickAction('Deselect'); }
    await clickCard(cardAt('Sephiroth')); await clickAction('Flip double-faced card');
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
