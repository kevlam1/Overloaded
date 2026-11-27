// Short browser check of the effects (frontend/src/vfx.js, anime.js) on the solo table: casting the commander draws the burst and plays a commander sound, then leaves nothing
// behind; under reduced motion only the sound; with Effects off neither; sorting the hand makes the cards hop. Real headless Chrome, the real card list.
// Run from the repo root: node scripts/check-effects-ui.mjs [--screenshot] (skipped without a card list: `npm run cards`).
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, sleep } from './lib/browser.mjs';
import { buildCardIndex, matchDeck } from '../shared/card-match.mjs';
import { parseDeckText } from '../shared/deck-text.mjs';
import { makePreview, buildSavedDeck, serializeDeck } from '../shared/deck-preview.mjs';

if (!existsSync('frontend/public/data/cards.json')) { console.log('Effects checks skipped: no card list here yet. Run `npm run cards`.'); process.exit(0); }

const PORT = 5196;
const PAGE = `http://127.0.0.1:${PORT}/pages/solo/index.html`;
let checks = 0;
const failures = [];
const check = (label, pass, detail = '') => { checks++; if (!pass) { failures.push(label); console.log(`FAIL  ${label}${detail ? '  (' + detail + ')' : ''}`); } };

const TEXT = 'COMMANDER:\n1 Krenko, Mob Boss\n\nDECK:\n30 Mountain\n4 Lightning Bolt\n4 Goblin Guide\n4 Shock\n4 Sol Ring\n4 Goblin Matron';
const cards = JSON.parse(readFileSync('frontend/public/data/cards.json', 'utf8'));
const parsed = parseDeckText(TEXT);
const preview = makePreview(parsed, matchDeck(buildCardIndex(cards), parsed.entries));
const built = buildSavedDeck(preview, { name: 'Effects deck', text: TEXT, commanderIds: preview.commander.ids });
if (preview.counts.problem !== 0 || !built.ok) { console.log('The test deck could not be built.'); process.exit(1); }
const art = (url) => ({ type: 'image/svg+xml', text: `<svg xmlns="http://www.w3.org/2000/svg" width="146" height="204"><rect width="146" height="204" fill="hsl(${parseInt(url.split('/').pop().slice(0, 4), 16) % 360},45%,38%)"/></svg>` });

let server = null;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const browser = await openBrowser('effects-ui', { width: 1366, height: 800 });
  const ev = (expression) => browser.eval(expression);
  const motion = (value) => browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
  await browser.fakeImages('https://cards.scryfall.io/*', art);
  await browser.fakeImages('https://backs.scryfall.io/*', null);
  await browser.goto(PAGE);
  await ev(`localStorage.clear(); localStorage.setItem('overloaded.deck', ${JSON.stringify(serializeDeck(built.deck))});`);
  await browser.goto(PAGE);
  await waitFor(async () => (await ev("!document.getElementById('game').hidden")) || null, 15000, 50);
  await ev(`window.__plays = []; HTMLMediaElement.prototype.play = function () { window.__plays.push(new URL(this.src).pathname); return Promise.resolve(); };`); // (records which file plays; nothing is heard)

  // the commander from the command zone to the battlefield, and back, through its right-click menu
  const menuTo = async (selector, words) => {
    await ev(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 600, clientY: 400 }))`);
    await sleep(80);
    const labels = await ev(`[...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent.trim())`);
    const hit = await ev(`(() => { const b = [...document.querySelectorAll('[role="menuitem"]')].find((b) => ${JSON.stringify(words)}.includes(b.textContent.trim())); if (!b) return false; b.click(); return true; })()`);
    await sleep(60);
    return hit ? true : labels;
  };
  const pieces = () => ev(`({ rings: document.querySelectorAll('.vfx-ring').length, sparks: document.querySelectorAll('.vfx-spark').length, name: document.querySelector('.vfx-name')?.textContent ?? '', all: document.querySelector('.vfx-layer')?.children.length ?? 0 })`);
  const plays = () => ev(`window.__plays.splice(0)`);

  await motion('no-preference');
  const cast = await menuTo('#command .card', ['Play', 'Battlefield', 'Cast']);
  await sleep(250);
  const during = await pieces();
  if (process.argv.includes('--screenshot')) await browser.screenshot('scratch-effects.png');
  const heard = await plays();
  check('casting the commander draws the burst (rings, sparks, its name) and plays one commander sound', cast === true && during.rings === 2 && during.sparks === 18 && during.name === 'Krenko, Mob Boss' && heard.length === 1 && /^\/sfx\/commander-play-/.test(heard[0]), JSON.stringify({ cast, during, heard }));
  await sleep(1800);
  check('the effect leaves nothing behind: the layer is empty and the card keeps no size of its own', (await pieces()).all === 0 && (await ev(`document.querySelector('#battlefield > .card').style.scale`)) === '');

  await menuTo('#battlefield > .card', ['Command zone', 'Move to command zone']);
  await motion('reduce');
  await menuTo('#command .card', ['Play', 'Battlefield', 'Cast']);
  await sleep(200);
  check('under reduced motion only the sound plays: nothing moves', (await pieces()).all === 0 && (await plays()).length === 1);

  await menuTo('#battlefield > .card', ['Command zone', 'Move to command zone']);
  await motion('no-preference');
  await ev(`(() => { const c = document.getElementById('effects-on'); c.checked = false; c.dispatchEvent(new Event('change')); })()`);
  await menuTo('#command .card', ['Play', 'Battlefield', 'Cast']);
  await sleep(200);
  check('with Effects off in Settings: no burst and no sound', (await pieces()).all === 0 && (await plays()).length === 0 && (await ev(`JSON.parse(localStorage.getItem('overloaded.effects')).on`)) === false);
  await ev(`(() => { const c = document.getElementById('effects-on'); c.checked = true; c.dispatchEvent(new Event('change')); })()`);

  // sorting the hand: A-Z, then Sort once
  const sorted = await ev(`(() => { const az = [...document.querySelectorAll('.hand-bar button')].find((b) => b.textContent.startsWith('A-Z')); if (!az) return 'no A-Z'; az.click(); const once = [...document.querySelectorAll('.hand-bar button')].find((b) => /^Sort the hand once/.test(b.title ?? '')); if (!once || once.hidden) return 'auto'; once.click(); return 'once'; })()`);
  await sleep(120);
  const hopping = await ev(`[...document.querySelectorAll('#hand > .card > .face')].filter((f) => f.style.translate && f.style.translate !== '0px 0px' && f.style.translate !== 'none').length`);
  await sleep(1200);
  const after = await ev(`[...document.querySelectorAll('#hand > .card > .face')].filter((f) => f.style.translate).length`);
  check('sorting the hand makes the cards hop, and they settle with no style left on them', hopping > 0 && after === 0, JSON.stringify({ sorted, hopping, after }));
  const errors = browser.logs.filter((line) => /exception|uncaught|error/i.test(line));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await closeAllBrowsers();
  await server?.close();
}
if (failures.length) { console.log(`${failures.length} of ${checks} effects checks FAILED.`); process.exit(1); }
console.log(`All ${checks} effects checks passed.`);
