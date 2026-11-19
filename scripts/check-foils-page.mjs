// Short browser check of the foil test page at /foils (real headless Chrome, stand-in pictures): every look and a card that is not foil are listed, each drawn four ways, the list by kind has every kind,
// and the big picture's shine follows the pointer. Run from the repo root: node scripts/check-foils-page.mjs   (--screenshot saves scratch-foils-*.png with the REAL pictures; delete them afterward)
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, sleep } from './lib/browser.mjs';
import { LOOK_GROUPS } from '../shared/foil-looks.mjs';
import { KINDS } from '../shared/foil-kinds.mjs';

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
  check('the page is at /foils and lists "Not foil" first, then every look in order', byLook.titles.length === LOOK_GROUPS.length + 1 && byLook.titles[0] === 'Not foil' && JSON.stringify(byLook.looks) === JSON.stringify([null, ...LOOK_GROUPS]), JSON.stringify(byLook));
  check('each entry is drawn four ways, and only the foil ones have a foil layer on the big picture', byLook.fourWays && JSON.stringify(byLook.layers) === JSON.stringify([0, ...LOOK_GROUPS.map(() => 1)]));
  const cards = await ev(`(() => { const entries = [...document.querySelectorAll('.foil-lab-entry')]; return { names: entries.map((e) => e.querySelector('.foil-lab-card').textContent), pictures: new Set(entries.map((e) => e.querySelector('.foil-lab-big img').getAttribute('src'))).size }; })()`);
  check('each entry shows a real card that has that foil (Surge is Beast Within), so the pictures differ', cards.names[byLook.titles.indexOf('surge')] === 'Beast Within (WHO 819)' && cards.pictures === byLook.titles.length - 1, JSON.stringify(cards));
  const rect = await ev(`(() => { const f = document.querySelectorAll('.foil-lab-big')[3]; f.scrollIntoView({ block: 'center' }); const r = f.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const look = () => ev(`(() => { const l = document.querySelectorAll('.foil-lab-big .foil-full')[2]; const s = getComputedStyle(l); return [l.style.getPropertyValue('--mx'), l.style.getPropertyValue('--my'), s.backgroundPosition].join('|'); })()`);
  const before = await look();
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x + 10, y: rect.y + 10 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x + rect.w - 10, y: rect.y + rect.h - 10 });
  await sleep(700);
  check('the foil does not move when the pointer is over the big picture', before === (await look()), before + ' -> ' + (await look()));
  check('the canvas patterns are made and given to the style sheet (surge, galaxy, confetti, etched, halo, fracture, mana, compleat, scales)', await ev(`['streaks', 'glitter', 'confetti', 'grain', 'strands', 'shards', 'pips', 'glints', 'scales'].every((name) => getComputedStyle(document.documentElement).getPropertyValue('--tex-' + name).trim().startsWith('url('))`));
  if (real) { await ev(`window.scrollTo(0, 0)`); await browser.screenshot('scratch-foils-looks.png'); }
  await ev(`(() => { const s = document.getElementById('lab-view'); s.value = 'kinds'; s.dispatchEvent(new Event('change')); })()`);
  await sleep(300);
  const byKind = await facts();
  check('the list by kind has Not foil, Plain foil, Etched foil and every one of the kinds', byKind.titles.length === KINDS.length + 3 && byKind.titles.slice(0, 3).join('|') === 'Not foil|Plain foil|Etched foil' && byKind.titles.includes('Surge foil') && byKind.fourWays, JSON.stringify(byKind.titles));
  if (real) { await ev(`window.scrollTo(0, 0)`); await browser.screenshot('scratch-foils-kinds.png'); }
  check('no page errors', (await ev('window.__errors || []')).length === 0);
  await closeAllBrowsers();
} finally {
  await closeAllBrowsers().catch(() => {});
  if (server) await server.close();
}
if (failures.length) { console.log(`\n${failures.length} of ${checks} foil page checks FAILED.`); process.exit(1); }
console.log(`All ${checks} foil page checks passed.`);
