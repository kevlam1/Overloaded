// Checks the spotlight (frontend/src/spotlight.js) and the glow of a pinged card (frontend/src/style.css) in a real headless Chrome, with the page's real style sheet.
// No database: the module is loaded into a page of the dev server and driven directly. Card pictures are answered by a stand-in, so this shows exactly which addresses
// are asked for. Run from the repo root: node scripts/check-spotlight-ui.mjs   Optional: --screenshot saves scratch-spotlight-*.png (git ignores scratch files).
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, waitFor, sleep } from './lib/browser.mjs';

const PORT = 5199;
const ORIGIN = `http://127.0.0.1:${PORT}`;
let checks = 0;
const failures = [];
function check(label, pass, detail = '') {
  checks++;
  if (!pass) { failures.push(label); console.log(`FAIL  ${label}${detail ? '  (' + detail + ')' : ''}`); }
}

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const failIds = new Set([id(2), id(3), id(5)]); // pictures that are "missing": id 2 only as a printing, 3 and 5 everywhere
const cardArt = (url) => {
  const name = url.split('/').pop().replace('.jpg', '');
  if (failIds.has(name)) return { status: 404, type: 'text/plain', text: '' };
  const hue = parseInt(name.slice(-4), 16) % 360;
  return { type: 'image/svg+xml', text: `<svg xmlns="http://www.w3.org/2000/svg" width="488" height="680" viewBox="0 0 488 680"><rect width="488" height="680" rx="30" fill="hsl(${hue},45%,38%)"/><text x="244" y="340" font-size="48" fill="white" text-anchor="middle">${name.slice(-4)}</text></svg>` };
};

let server = null;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  const browser = await openBrowser('spotlight-ui', { width: 1280, height: 900 });
  const ev = (expression) => browser.eval(expression);
  const motion = (value) => browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
  const asked = await browser.fakeImages('https://cards.scryfall.io/*', cardArt);
  await motion('no-preference');
  await browser.goto(`${ORIGIN}/pages/solo/index.html`); // any page that carries the shared style sheet
  await ev(`(async () => {
    const section = document.createElement('section'); section.id = 'spot'; document.body.prepend(section);
    window.__closed = 0;
    const { createSpotlight } = await import('/src/spotlight.js');
    window.__spot = createSpotlight(section, { onClose: () => { window.__closed++; } });
    return true;
  })()`);
  const state = () => ev(`(() => { const r = document.getElementById('spot'); const img = r.querySelector('.spot-picture'); return {
    hidden: r.hidden, src: img.getAttribute('src'), pictureHidden: img.hidden, alt: img.alt, line: r.querySelector('.spot-line').textContent, name: r.querySelector('.spot-name').textContent,
    type: r.querySelector('.spot-type').textContent, typeHidden: r.querySelector('.spot-type').hidden, detail: r.querySelector('.spot-detail').textContent, detailHidden: r.querySelector('.spot-detail').hidden,
    images: r.querySelectorAll('img').length, enter: r.classList.contains('enter') }; })()`);
  const show = (card, sentence = 'Seat 2: Bob pinged it.', detail = '') => ev(`window.__spot.show(${JSON.stringify({ card, sentence, detail })})`);
  const url = (n, size = 'normal', face = 'front') => `https://cards.scryfall.io/${size}/${face}/0/0/${id(n)}.jpg`;

  // closed to start with
  let s = await state();
  check('the spotlight starts hidden, with no picture asked for', s.hidden === true && s.src === null && asked.length === 0, JSON.stringify(s));

  // a ping
  await show({ uid: 'c1', i: id(1), n: 'Llanowar Elves', t: 'Creature - Elf Druid' }, 'Seat 2: Bob pinged Llanowar Elves.', 'Counters: +1/+1 3. Now 4/4.');
  await sleep(250);
  s = await state();
  check('a ping shows the sentence, the card name, its type and the details', s.hidden === false && s.line === 'Seat 2: Bob pinged Llanowar Elves.' && s.name === 'Llanowar Elves' && s.type === 'Creature - Elf Druid' && s.detail === 'Counters: +1/+1 3. Now 4/4.' && !s.typeHidden && !s.detailHidden, JSON.stringify(s));
  check('the picture is the NORMAL size of the front of that card, built from its id', s.src === url(1) && asked.includes(url(1)) && s.alt === 'Llanowar Elves', JSON.stringify([s.src, asked]));
  check('the picture is there and no bigger than 15 rem (240 px)', await ev(`(() => { const img = document.querySelector('#spot .spot-picture'); return img.naturalWidth > 0 && img.getBoundingClientRect().width <= 240.5; })()`));
  check('only one image is on the spotlight (nothing else became an element)', s.images === 1);

  // the printing the card shows, and a printing that does not exist
  await show({ uid: 'c1', i: id(1), p: id(4), n: 'Sol Ring', t: 'Artifact' });
  await sleep(250);
  s = await state();
  check('a card with a chosen printing shows that printing', s.src === url(4), s.src);
  await show({ uid: 'c1', i: id(1), p: id(2), n: 'Sol Ring', t: 'Artifact' }); // the printing 404s
  await waitFor(async () => (await state()).src === url(1) ? true : null, 4000, 50);
  s = await state();
  check('when the printing has no picture the default printing of the card is tried', s.src === url(1) && asked.includes(url(2)) && s.pictureHidden === false, JSON.stringify([s.src, s.pictureHidden]));
  await show({ uid: 'c1', i: id(3), p: id(2), n: 'Mystery', t: '' }); // neither exists
  await waitFor(async () => (await state()).pictureHidden === true ? true : null, 4000, 50);
  s = await state();
  check('when no picture exists the picture goes away and the name and words stay', s.pictureHidden === true && s.name === 'Mystery' && s.hidden === false && s.line.length > 0, JSON.stringify(s));
  check('a card with no type line shows no type line', s.typeHidden === true && s.type === '');
  await show({ uid: 'c1', i: id(1), n: 'Plain' }, 'x');
  s = await state();
  check('no details shows no details line', s.detailHidden === true);

  // two-sided cards and tokens
  await show({ uid: 'c1', i: id(1), n: 'Delver of Secrets // Insectile Aberration', t: 'Creature - Human Wizard', turned: true });
  await sleep(200);
  s = await state();
  check('a card that is turned over shows its back face', s.src === url(1, 'normal', 'back'), s.src);
  await show({ uid: 'c2', i: id(70), n: 'Goblin', t: 'Token Creature - Goblin', tok: true });
  s = await state();
  check('a token is shown by the picture id it carries', s.src === url(70) && s.name === 'Goblin');

  // what another player wrote is only ever text
  await show({ uid: 'c1', i: id(1), n: '<img src=x onerror="window.__pwned=1">', t: '<b>bold</b>' }, 'Seat 3: <script>window.__pwned=2</script> pinged it.', '<i>x</i>');
  await sleep(250);
  s = await state();
  check('markup in a name, a type, a sentence or the details is text, never an element', s.images === 1 && s.name === '<img src=x onerror="window.__pwned=1">' && s.type === '<b>bold</b>' && s.line.includes('<script>') && s.detail === '<i>x</i>' && (await ev('window.__pwned === undefined')) === true && (await ev(`document.querySelectorAll('#spot script, #spot b, #spot i').length`)) === 0);
  await show({ uid: 'c1', i: 'not an id', n: 'Broken id' });
  s = await state();
  check('a damaged card id builds no picture address (no request to a strange address) and the name stays', s.pictureHidden === true && s.name === 'Broken id' && !asked.some((a) => a.includes('not an id')));

  // a very long name does not break the layout
  await show({ uid: 'c1', i: id(1), n: 'W'.repeat(200), t: 'T'.repeat(120) }, 'x');
  await sleep(200);
  check('a 200-character name stays inside the spotlight (no sideways scroll)', await ev(`(() => { const r = document.getElementById('spot'); return r.scrollWidth <= r.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1; })()`));

  // closing
  await show({ uid: 'c1', i: id(1), n: 'Closing', t: '' });
  await ev(`document.querySelector('#spot .spot-close').click()`);
  s = await state();
  check('Close hides the spotlight, drops the picture and tells the page once', s.hidden === true && s.src === null && (await ev('window.__closed')) === 1, JSON.stringify(s));
  await show({ uid: 'c1', i: id(1), n: 'Again', t: '' });
  check('the next ping opens it again', (await state()).hidden === false && (await state()).name === 'Again');
  check('the close button has a name for a screen reader, and the sentence is a polite live region', await ev(`(() => { const r = document.getElementById('spot'); return r.querySelector('.spot-close').getAttribute('aria-label').length > 0 && r.querySelector('.spot-line').getAttribute('aria-live') === 'polite'; })()`));
  check('hidden really hides it (the display rule does not override the hidden attribute)', await ev(`(() => { const r = document.getElementById('spot'); r.hidden = true; const none = getComputedStyle(r).display === 'none'; r.hidden = false; return none; })()`));

  // motion
  await show({ uid: 'c1', i: id(1), n: 'Motion', t: '' });
  check('with normal motion the spotlight comes in with a short animation', (await ev(`getComputedStyle(document.getElementById('spot')).animationName`)) === 'spot-in');
  await ev(`(() => { const d = document.createElement('div'); d.className = 'card'; d.id = 'glow'; document.body.append(d); d.classList.add('pinged'); })()`);
  const glow = () => ev(`(() => { const s = getComputedStyle(document.getElementById('glow')); return { animation: s.animationName, outline: s.outlineStyle, width: s.outlineWidth }; })()`);
  let g = await glow();
  check('a pinged card has a ring and pulses with normal motion', g.outline === 'solid' && g.width === '3px' && g.animation === 'ping-pulse', JSON.stringify(g));
  await motion('reduce');
  await sleep(100);
  g = await glow();
  check('with reduced motion the ring stays and the pulse is off', g.outline === 'solid' && g.animation === 'none', JSON.stringify(g));
  check('with reduced motion the spotlight does not animate', (await ev(`getComputedStyle(document.getElementById('spot')).animationName`)) === 'none');
  await ev(`document.getElementById('glow').classList.remove('pinged')`);
  check('without the class the card has no ring', (await glow()).outline !== 'solid' || (await glow()).width === '0px');

  if (process.argv.includes('--screenshot')) {
    await motion('no-preference');
    await show({ uid: 'c1', i: id(1), n: 'Llanowar Elves', t: 'Creature - Elf Druid' }, 'Seat 2: Bob pinged Llanowar Elves.', 'Counters: +1/+1 3. Change: +2/+0. Now 6/4.');
    await sleep(500);
    await browser.screenshot('scratch-spotlight.png');
    console.log('saved scratch-spotlight.png (delete it afterward)');
  }
  // ---- the corner mode: always there, shows the selected card, a ping replaces it, closing a ping goes back ----
  await ev(`(async () => {
    const section = document.createElement('section'); section.id = 'corner'; document.body.prepend(section);
    window.__cornerClosed = 0;
    const { createSpotlight } = await import('/src/spotlight.js');
    window.__corner = createSpotlight(section, { persistent: true, emptyText: 'Select a card to see it here.', onClose: () => { window.__cornerClosed++; } });
    return true;
  })()`);
  const cs = () => ev(`(() => { const r = document.getElementById('corner'); const img = r.querySelector('.spot-picture'); return { hidden: r.hidden, empty: r.classList.contains('is-empty'), emptyText: r.querySelector('.spot-empty').hidden ? '' : r.querySelector('.spot-empty').textContent, src: img.hidden ? null : img.getAttribute('src'), name: r.querySelector('.spot-name').textContent, closeHidden: r.querySelector('.spot-close').hidden, lineHidden: r.querySelector('.spot-line').hidden }; })()`);
  const cshow = (card, extra = {}) => ev(`window.__corner.show(${JSON.stringify({ card, ...extra })})`);
  let c = await cs();
  check('a corner is never hidden: with nothing to show it says so', !c.hidden && c.empty && c.emptyText === 'Select a card to see it here.' && c.src === null, JSON.stringify(c));
  const before = asked.length;
  await cshow({ i: id(11), n: 'Selected One', t: 'Instant' }, { closable: false, key: 'a' });
  await sleep(200);
  c = await cs();
  check('a selected card shows its normal picture and name, with no Close button and no ping sentence', !c.empty && c.src === url(11) && c.name === 'Selected One' && c.closeHidden && c.lineHidden && asked.length === before + 1, JSON.stringify(c));
  await cshow({ i: id(11), n: 'Selected One', t: 'Instant' }, { closable: false, key: 'a' });
  await sleep(100);
  check('showing the same card again with the same key asks for nothing more (the page draws it again after every change)', asked.length === before + 1);
  await cshow({ i: id(12), n: 'Pinged', t: 'Creature' }, { sentence: 'Seat 2: Bob pinged it.', closable: true });
  await sleep(200);
  c = await cs();
  check('a ping replaces it, with the sentence and a Close button', c.name === 'Pinged' && c.src === url(12) && !c.closeHidden && !c.lineHidden, JSON.stringify(c));
  await ev(`document.querySelector('#corner .spot-close').click()`);
  c = await cs();
  check('closing the ping empties the corner and tells the page (which shows the selected card again)', c.empty && (await ev('window.__cornerClosed')) === 1, JSON.stringify(c));
  await cshow({ i: id(11), n: 'Selected One', t: 'Instant' }, { closable: false, key: 'a' });
  await sleep(100);
  check('after it was emptied the same key shows the card again (the key is forgotten)', (await cs()).name === 'Selected One');
  await ev('window.__corner.hide()');
  check('hide() empties it; isOpen says so', (await cs()).empty && (await ev('window.__corner.isOpen()')) === false);
} finally {
  await closeAllBrowsers();
  if (server) await server.close();
}

if (failures.length) { console.log(`\n${failures.length} of ${checks} spotlight checks FAILED.`); process.exit(1); }
console.log(`All ${checks} spotlight checks passed.`);
