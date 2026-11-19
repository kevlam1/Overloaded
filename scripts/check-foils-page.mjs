// Short browser check of the foil test page at /foils (real headless Chrome, stand-in pictures): every look and a card that is not foil are listed, each drawn four ways, the list by kind has every kind,
// and the big picture's shine follows the pointer. Run from the repo root: node scripts/check-foils-page.mjs   (--screenshot saves scratch-foils-*.png with the REAL pictures; delete them afterward)
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, sleep } from './lib/browser.mjs';

const PORT = 5198;
const real = process.argv.includes('--screenshot');
let checks = 0;
const failures = [];
const check = (label, pass, detail = '') => { checks++; if (!pass) { failures.push(label); console.log(`FAIL  ${label}${detail ? '  (' + detail + ')' : ''}`); } };
const art = () => ({ type: 'image/svg+xml', text: '<svg xmlns="http://www.w3.org/2000/svg" width="488" height="680"><rect width="488" height="680" fill="#567"/></svg>' });

let server = null;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const browser = await openBrowser('foils-page', { width: 1280, height: 900 });
  const ev = (expression) => browser.eval(expression);
  if (!real) await browser.fakeImages('https://cards.scryfall.io/*', art);
  await browser.goto(`http://127.0.0.1:${PORT}/foils`);
  await sleep(400);
  const facts = () => ev(`(() => { const entries = [...document.querySelectorAll('.foil-lab-entry')]; return { titles: entries.map((e) => e.querySelector('h2').textContent), looks: entries.map((e) => e.querySelector('.foil-lab-small .card').dataset.foil ?? null), fourWays: entries.every((e) => e.querySelectorAll('.foil-lab-small .card, .foil-lab-hand .card, .foil-lab-tile .deck-tile, .foil-lab-big img').length === 4), layers: entries.map((e) => e.querySelectorAll('.foil-full').length) }; })()`);
  const byLook = await facts();
  check('the page is at /foils and lists "Not foil", then the traditional foil and the etched foil', JSON.stringify(byLook.titles) === JSON.stringify(['Not foil', 'Traditional', 'Etched']) && JSON.stringify(byLook.looks) === JSON.stringify([null, 'traditional', 'etched']), JSON.stringify(byLook));
  check('each entry is drawn four ways, and only the foil ones have a foil layer on the big picture', byLook.fourWays && JSON.stringify(byLook.layers) === JSON.stringify([0, 1, 1]));
  const cards = await ev(`(() => { const entries = [...document.querySelectorAll('.foil-lab-entry')]; return entries.map((e) => e.querySelector('.foil-lab-card').textContent); })()`);
  check('the etched entry shows a real etched printing (Jin-Gitaxias) and the foil ones a real card', cards[2] === 'Jin-Gitaxias, Core Augur (MUL 76)' && cards[1] === 'Sol Ring (CMM 410)', JSON.stringify(cards));
  const rect = await ev(`(() => { const f = document.querySelectorAll('.foil-lab-big')[1]; f.scrollIntoView({ block: 'center' }); const r = f.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const look = () => ev(`(() => { const l = document.querySelectorAll('.foil-lab-big .foil-full')[0]; const s = getComputedStyle(l); return [l.style.getPropertyValue('--mx'), l.style.getPropertyValue('--my'), s.backgroundPosition].join('|'); })()`);
  const before = await look();
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x + 10, y: rect.y + 10 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x + rect.w - 10, y: rect.y + rect.h - 10 });
  await sleep(700);
  check('the foil does not move when the pointer is over the big picture', before === (await look()), before + ' -> ' + (await look()));
  if (real) { await ev(`window.scrollTo(0, 0)`); await browser.screenshot('scratch-foils-looks.png'); }
  check('no page errors', (await ev('window.__errors || []')).length === 0);
  await closeAllBrowsers();
} finally {
  await closeAllBrowsers().catch(() => {});
  if (server) await server.close();
}
if (failures.length) { console.log(`\n${failures.length} of ${checks} foil page checks FAILED.`); process.exit(1); }
console.log(`All ${checks} foil page checks passed.`);
