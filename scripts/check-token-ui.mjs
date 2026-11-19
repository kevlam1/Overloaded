// Short browser check of "Create token" on the solo table (real headless Chrome, real card list and tokens file, stand-in pictures): the right-click menu on empty battlefield, the window with the tokens of the deck
// and the common ones, making a token, choosing its art, and the search. Run from the repo root: node scripts/check-token-ui.mjs (skipped without a card list: `npm run cards`).
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, sleep } from './lib/browser.mjs';
import { buildCardIndex, matchDeck } from '../shared/card-match.mjs';
import { parseDeckText } from '../shared/deck-text.mjs';
import { makePreview, buildSavedDeck, serializeDeck } from '../shared/deck-preview.mjs';

if (!existsSync('frontend/public/data/cards.json') || !existsSync('frontend/public/data/tokens.json')) { console.log('Token checks skipped: no card list or tokens file here yet. Run `npm run cards`.'); process.exit(0); }

const PORT = 5197;
const PAGE = `http://127.0.0.1:${PORT}/solo`;
let checks = 0;
const failures = [];
const check = (label, pass, detail = '') => { checks++; if (!pass) { failures.push(label); console.log(`FAIL  ${label}${detail ? '  (' + detail + ')' : ''}`); } };

const TEXT = 'COMMANDER:\n1 Krenko, Mob Boss\n\nDECK:\n30 Mountain\n4 Sol Ring\n4 Lightning Bolt\n4 Llanowar Elves';
const cards = JSON.parse(readFileSync('frontend/public/data/cards.json', 'utf8'));
const parsed = parseDeckText(TEXT);
const preview = makePreview(parsed, matchDeck(buildCardIndex(cards), parsed.entries));
const built = buildSavedDeck(preview, { name: 'Token deck', text: TEXT, commanderIds: preview.commander.ids });
if (!built.ok) { console.log('The test deck could not be built.'); process.exit(1); }
const DECK = serializeDeck(built.deck);

let server = null;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const browser = await openBrowser('token-ui', { width: 1280, height: 800 });
  const ev = (expression) => browser.eval(expression);
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await browser.fakeImages('https://cards.scryfall.io/*', () => ({ type: 'image/svg+xml', text: '<svg xmlns="http://www.w3.org/2000/svg" width="146" height="204"><rect width="146" height="204" fill="#456"/></svg>' }));
  await browser.goto(PAGE);
  await ev(`localStorage.setItem('overloaded.deck', ${JSON.stringify(DECK)})`);
  await browser.goto(PAGE);
  await waitFor(async () => (await ev("!document.getElementById('game').hidden")) || null, 15000, 50);
  await sleep(300);

  const tokensOnBoard = () => ev("[...document.querySelectorAll('#battlefield > .card')].filter((c) => c.querySelector('img') || true).map((c) => c.dataset.uid)");
  const before = (await tokensOnBoard()).length;
  const [x, y] = await ev("(() => { const b = document.getElementById('battlefield').getBoundingClientRect(); return [Math.round(b.left + b.width * 0.5), Math.round(b.top + b.height * 0.3)]; })()");
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', clickCount: 1 });
  await sleep(300);
  check('a right click on empty battlefield offers Create token', JSON.stringify(await ev("[...document.querySelectorAll('.card-menu [role=menuitem]')].map((x) => x.textContent)")) === '["Create token..."]');
  await ev("document.querySelector('.card-menu [role=menuitem]').click()");
  await waitFor(async () => (await ev("document.querySelectorAll('.token-tile').length")) > 0 || null, 8000, 50);
  const sections = await ev("[...document.querySelectorAll('.token-section-title')].map((h) => h.textContent)");
  check('the window has a section for the deck\'s tokens and one for the common tokens, with a search bar', JSON.stringify(sections) === '["Tokens from your deck","Common tokens"]' && (await ev("Boolean(document.querySelector('.token-picker input[type=search]'))")), JSON.stringify(sections));
  const names = (n) => ev(`[...document.querySelectorAll('.token-section')[${n}].querySelectorAll('.token-tile strong')].map((s) => s.textContent)`);
  const deckNames = await names(0);
  const commonNames = await names(1);
  check('the deck section holds Krenko\'s Goblin, and the common section 16 tokens starting with Treasure', deckNames.includes('Goblin') && commonNames.length === 16 && commonNames[0] === 'Treasure', JSON.stringify([deckNames, commonNames]));

  await ev("[...document.querySelectorAll('.token-section')[0].querySelectorAll('.token-tile')].find((t) => t.querySelector('strong').textContent === 'Goblin').click()");
  await sleep(300);
  const after = await tokensOnBoard();
  check('pressing the Goblin makes a card on the battlefield and the window stays open', after.length === before + 1 && (await ev("Boolean(document.querySelector('.token-picker'))")) && /Goblin/.test(await ev("document.querySelector('.token-picker .picker-message').textContent")));

  const goblinArt = await ev("[...document.querySelectorAll('.token-section')[0].querySelectorAll('li')].find((li) => li.querySelector('strong').textContent === 'Goblin').querySelector('.token-art').click()");
  await sleep(200);
  const printings = await ev("[...document.querySelectorAll('.token-grid .token-tile')].map((t) => t.dataset.printing)");
  check('the Art button lists the printings of that token (more than one), with a Back button', printings.length > 1 && (await ev("document.querySelector('.picker-back').hidden")) === false, String(printings.length));
  await ev("document.querySelectorAll('.token-grid .token-tile')[1].click()");
  await sleep(300);
  const second = printings[1];
  const pictures = await ev("[...document.querySelectorAll('#battlefield > .card img')].map((i) => i.src)");
  check('a token made from the second printing uses that printing\'s picture', pictures.some((src) => src.includes(second)), second);

  await ev("document.querySelector('.picker-back').click()");
  await ev("(() => { const f = document.querySelector('.token-picker input[type=search]'); f.value = 'treas'; f.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await sleep(200);
  check('typing in the search bar lists every token that matches instead of the sections', JSON.stringify(await ev("[...document.querySelectorAll('.token-section-title')].map((h) => h.textContent)")) === '["Results for \\"treas\\""]' && (await ev("document.querySelector('.token-tile strong').textContent")) === 'Treasure');

  await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(200);
  check('Escape closes the window', (await ev("Boolean(document.querySelector('.token-picker'))")) === false);
  check('no page errors', (await ev('window.__errors || []')).length === 0);
  if (process.argv.includes('--screenshot')) { /* (the window is closed here; screenshots are taken in the open window below) */ }
  await closeAllBrowsers();
} finally {
  await closeAllBrowsers().catch(() => {});
  if (server) await server.close();
}
if (failures.length) { console.log(`\n${failures.length} of ${checks} token checks FAILED.`); process.exit(1); }
console.log(`All ${checks} token checks passed.`);
