// Browser check of the first-time help of a table view (2026-11-26 feedback, step 5; frontend/src/view-help.js), on the solo table: shown the first time,
// put away by Don't show again, and brought back by its switch in Settings > About. Run from the repo root: node scripts/check-view-help-ui.mjs
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, sleep } from './lib/browser.mjs';
import { buildCardIndex, matchDeck } from '../shared/card-match.mjs';
import { parseDeckText } from '../shared/deck-text.mjs';
import { makePreview, buildSavedDeck, serializeDeck } from '../shared/deck-preview.mjs';

if (!existsSync('frontend/public/data/cards.json')) { console.log('View help checks skipped: no card list here yet. Run `npm run cards`.'); process.exit(0); }

const PORT = 5195;
const PAGE = `http://127.0.0.1:${PORT}/pages/solo/index.html`;
let checks = 0;
const failures = [];
const check = (label, pass, detail = '') => { checks++; if (!pass) { failures.push(label); console.log(`FAIL  ${label}${detail ? '  (' + detail + ')' : ''}`); } };

const TEXT = 'COMMANDER:\n1 Eowyn, Lady of Rohan\n\nDECK:\n24 Forest *F*\n4 Sol Ring\n4 Lightning Bolt\n4 Llanowar Elves\n4 Serra Angel\n24 Island';
const cards = JSON.parse(readFileSync('frontend/public/data/cards.json', 'utf8'));
const parsed = parseDeckText(TEXT);
const preview = makePreview(parsed, matchDeck(buildCardIndex(cards), parsed.entries));
const built = buildSavedDeck(preview, { name: 'Test deck', text: TEXT, commanderIds: preview.commander.ids });
if (preview.counts.problem !== 0 || !built.ok) { console.log('The test deck could not be built.'); process.exit(1); }
const DECK_JSON = serializeDeck(built.deck);
const art = (url) => ({ type: 'image/svg+xml', text: `<svg xmlns="http://www.w3.org/2000/svg" width="146" height="204"><rect width="146" height="204" fill="hsl(${parseInt(url.split('/').pop().slice(0, 4), 16) % 360},45%,38%)"/></svg>` });

let server = null;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const browser = await openBrowser('view-help', { width: 1280, height: 900, help: true });
  const ev = (expression) => browser.eval(expression);
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await browser.fakeImages('https://cards.scryfall.io/*', art);
  await browser.fakeImages('https://backs.scryfall.io/*', null);
  const start = async () => { await browser.goto(PAGE); await waitFor(async () => (await ev("!document.getElementById('game').hidden")) || null, 15000, 50); await sleep(400); };
  await browser.goto(PAGE);
  await ev(`localStorage.clear(); localStorage.setItem('overloaded.deck', ${JSON.stringify(DECK_JSON)});`);
  await start();
  const help = () => ev("(() => { const t = document.querySelector('.view-help-overlay .view-help-title'); return t ? t.textContent : null; })()");
  check('the first time, the solo table shows its help', (await help()) === 'The solo table', String(await help()));
  await ev("document.getElementById('view-help-never').click()"); await sleep(100);
  await start();
  check('after Don’t show again it stays away, and its switch in About is off', (await help()) === null && (await ev("document.getElementById('help-solo').checked")) === false);
  await ev("(() => { const s = document.getElementById('help-solo'); s.checked = true; s.dispatchEvent(new Event('change')); })()");
  await start();
  check('turning the switch on shows it again the next time', (await help()) === 'The solo table');
  await ev("document.getElementById('view-help-ok').click()"); await sleep(100);
  check('Got it closes it', (await help()) === null);
  check('no page errors', (await ev('window.__errors || []')).length === 0);
  await closeAllBrowsers();
} finally {
  await closeAllBrowsers().catch(() => {});
  if (server) await server.close();
}
if (failures.length) { console.log(`\n${failures.length} of ${checks} view help checks FAILED.`); process.exit(1); }
console.log(`All ${checks} view help checks passed.`);
