// Checks the one-screen layout of the table page (frontend/src/style.css, "body.playing") in a real headless Chrome at several window sizes and with 0 to 3 other players
// (Kevin, 2026-11-06: in a Commander game nobody should scroll the page to see the other battlefields). The real page and style sheet are loaded; the game itself is
// not (that needs a database), so the page is put into the playing state and filled with worst-case content built exactly like the page's own: a long hand, full rows,
// counters and commander damage on every opponent, a long list of actions for the selected card. Run from the repo root: node scripts/check-table-layout.mjs
// Optional: --screenshot saves scratch-layout-*.png for 1366x650, 1366x768 and 1920x950 with 3 opponents (git ignores scratch files).
import { createServer } from 'vite';
import { openBrowser, closeAllBrowsers, sleep } from './lib/browser.mjs';

const PORT = 5203;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SIZES = [[1366, 650], [1366, 768], [1280, 720], [1600, 900], [1920, 950]];
let checks = 0;
const failures = [];
function check(label, pass, detail = '') {
  checks++;
  if (!pass) { failures.push(label); console.log(`FAIL  ${label}${detail ? '  (' + detail + ')' : ''}`); }
}

// The page's own structure for one other player (frontend/pages/table/table.js opponentPanel), with the content that makes it tallest.
const FILL = (opponents) => `(() => {
  const make = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
  const card = (n, tapped) => { const b = make('button', 'card' + (tapped ? ' tapped' : '')); b.type = 'button'; const face = make('span', 'face'); face.append(make('span', 'fallback', 'Card ' + n)); b.append(face); const badges = make('span', 'badges'); badges.append(make('span', 'badge badge-sick', 'SICK')); b.append(badges); const marks = make('span', 'marks'); const chips = make('span', 'chips'); chips.append(make('span', 'chip', '+1/+1 3')); marks.append(chips, make('span', 'change', '+2/+0')); b.append(marks); return b; };
  const fill = (row, count, tappedEvery) => { for (let i = 0; i < count; i++) row.append(card(i, tappedEvery && i % tappedEvery === 0)); };
  // a battlefield is a 112 by 44 grid of square cells, a card 8 by 11 (shared/board-grid.mjs): lands fill the bottom row of blocks from the left, the rest the top rows from the left (the busiest board that is likely: 12 lands and 20 other cards)
  const board = (grid, lands, others, tappedEvery) => { grid.replaceChildren(); const put = (n, col, row, kind) => { const b = card(n, tappedEvery && n % tappedEvery === 0); b.dataset.col = String(col); b.dataset.row = String(row); b.dataset.kind = kind; grid.append(b); }; for (let i = 0; i < lands; i++) put(i, (i % 14) * 8, 33 - 11 * Math.floor(i / 14), 'land'); for (let i = 0; i < others; i++) put(100 + i, (i % 14) * 8, 11 * Math.floor(i / 14), 'other'); };
  document.body.classList.add('playing');
  document.getElementById('game').hidden = false;
  document.getElementById('opponents').hidden = false;
  document.getElementById('blocked').hidden = true;
  document.querySelector('main').dataset.opponents = String(${opponents});
  if (${opponents} === 0) document.querySelector('main').removeAttribute('data-opponents');
  const list = document.getElementById('opponent-list');
  list.replaceChildren();
  for (let n = 1; n <= ${opponents}; n++) {
    const section = make('section', 'opponent' + (n === 1 ? ' active' : ''));
    const title = make('h3', '', 'Seat ' + (n + 1) + ': Opponent number ' + n); if (n === 1) title.append(make('span', 'turn-mark', 'their turn'));
    const stats = make('p', 'hint', 'Life 40. Hand: 7 cards. Library: 61 cards.');
    const counters = make('div', 'opponent-counters counter-chips'); for (const text of ['3', '2', '21']) { const chip = make('span', 'counter-chip'); chip.append(make('strong', 'chip-count', text)); counters.append(chip); }
    const waiting = make('p', 'hint', 'Has not been dealt a game yet.'); waiting.hidden = true;
    const body = make('div');
    const grid = make('div', 'battlefield'); const command = make('div', 'row');
    board(grid, 10, 14, 4); fill(command, 2, 0);
    const pile = (label) => { const details = make('details'); const summary = make('summary', '', label + ': 12'); const ul = make('ul', 'pile-list'); details.append(summary, ul); return details; };
    body.append(grid, make('h4', '', 'Command zone'), command, pile('Graveyard'), pile('Exile'));
    section.append(title, stats, counters, waiting, body);
    list.append(section);
  }
  board(document.getElementById('battlefield'), 12, 20, 5);
  fill(document.getElementById('hand'), 10, 0); document.getElementById('hand-count').textContent = '10';
  fill(document.getElementById('command'), 2, 0);
  document.getElementById('selected-line').textContent = 'Llanowar Elves: Creature - Elf Druid, in the battlefield. Counters: +1/+1 3. Change: +2/+0. Now 6/4.';
  document.getElementById('turn-banner').hidden = false; document.getElementById('turn-banner').textContent = 'It is your turn (turn 3).';
  document.getElementById('status').textContent = 'Back at your game.';
  document.getElementById('players').replaceChildren(...['Seat 1: Alice (host), Tymna the Weaver & Thrasios, Triton Hero', 'Seat 2: Bob, Ezuri, Renegade Leader, bracket 2', 'Seat 3: Cy, Krenko, Mob Boss', 'Seat 4: Di, Atraxa, Praetors Voice'].map((text) => make('li', '', text)));
  document.getElementById('match-state').textContent = 'The match is on.';
  document.getElementById('match-actions').hidden = false; document.getElementById('end-match').hidden = false;
  return true;
})()`;

const RECTS = `(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
  const cards = (sel) => [...document.querySelectorAll(sel)].map((c) => { const b = c.getBoundingClientRect(); return Math.max(b.width, b.height); }); // a tapped card is a landscape box: its long side is the card's height
  return {
    win: { w: innerWidth, h: innerHeight },
    scroll: { docH: document.documentElement.scrollHeight, docW: document.documentElement.scrollWidth, bodyH: document.body.scrollHeight },
    topbar: r(document.querySelector('.topbar')), bar: r(document.querySelector('.bar')), mine: r(document.getElementById('my-board')), hand: r(document.getElementById('hand-section')),
    side: r(document.querySelector('.side-panels')), players: r(document.getElementById('players-section')), footer: r(document.querySelector('footer')),
    opponents: [...document.querySelectorAll('.opponent')].map(r),
    opponentOverflow: [...document.querySelectorAll('.opponent')].map((p) => p.scrollHeight - p.clientHeight),
    mineOverflow: document.getElementById('my-board').scrollHeight - document.getElementById('my-board').clientHeight,
    topbarOverflow: document.querySelector('.topbar').scrollWidth - document.querySelector('.topbar').clientWidth,
    barOverflow: document.querySelector('.bar').scrollHeight - document.querySelector('.bar').clientHeight,
    handCardH: cards('#hand > .card'), mineCardH: cards('#battlefield > .card'), oppCardH: cards('.opponent .battlefield > .card'), mineCardW: [...document.querySelectorAll('#battlefield > .card')].map((c) => c.getBoundingClientRect().width), // the battlefield grid of each other player (not the small command zone)
    mineRowH: [...document.querySelectorAll('#my-board .row')].map((e) => e.clientHeight),
  };
})()`;

const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
const near = (a, b, tolerance = 2) => Math.abs(a - b) <= tolerance;

let server = null;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  for (const [w, h] of SIZES) {
    const browser = await openBrowser('table-layout', { width: w, height: h });
    await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    for (const opponents of [0, 1, 2, 3]) {
      const label = `${w}x${h}, ${opponents} other player${opponents === 1 ? '' : 's'}`;
      await browser.goto(`${ORIGIN}/table/ABCDEF`);
      await browser.eval(FILL(opponents));
      await sleep(150);
      const m = await browser.eval(RECTS);
      // nothing scrolls the page
      check(`${label}: the page does not scroll (height ${m.scroll.docH} of ${m.win.h}, width ${m.scroll.docW} of ${m.win.w})`, m.scroll.docH <= m.win.h + 1 && m.scroll.bodyH <= m.win.h + 1 && m.scroll.docW <= m.win.w + 1);
      // everything is inside the window
      const named = { topbar: m.topbar, bar: m.bar, 'your board': m.mine, 'your hand': m.hand, 'the side column': m.side, footer: m.footer, ...(opponents ? { players: m.players } : { players: m.players }) };
      m.opponents.forEach((o, i) => { named[`opponent ${i + 1}`] = o; });
      for (const [name, rect] of Object.entries(named)) {
        check(`${label}: the ${name} is inside the window and has a size`, rect && rect.width > 20 && rect.height > 10 && rect.left >= -0.5 && rect.top >= -0.5 && rect.right <= m.win.w + 0.5 && rect.bottom <= m.win.h + 0.5, JSON.stringify(rect));
      }
      // nothing overlaps anything else
      const boxes = Object.entries(named).filter(([name]) => name !== 'topbar');
      const clashes = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlap(boxes[i][1], boxes[j][1]) > 4) clashes.push(`${boxes[i][0]} and ${boxes[j][0]}`);
      check(`${label}: no two parts overlap`, clashes.length === 0, clashes.join('; '));
      // the boards: yours at the bottom-left, the same size as the others where they share a row
      if (opponents === 3) {
        const [a, b, c] = m.opponents;
        check(`${label}: the four boards are one equal 2x2 grid, yours at the bottom-left`, near(a.width, b.width) && near(a.width, c.width) && near(a.width, m.mine.width) && near(a.height, b.height) && near(a.height, c.height) && near(a.height, m.mine.height)
          && near(a.left, m.mine.left) && near(b.left, c.left) && b.left > a.left && near(m.mine.top, c.top) && m.mine.top > a.top && near(a.top, b.top), JSON.stringify([a, b, c, m.mine]));
      }
      if (opponents === 2) {
        const [a, b] = m.opponents;
        check(`${label}: two boards on top of the same size, yours across the bottom`, near(a.width, b.width) && near(a.height, b.height) && near(a.top, b.top) && m.mine.top > a.top && m.mine.width > a.width * 1.9 && near(m.mine.left, a.left), JSON.stringify([a, b, m.mine]));
      }
      if (opponents === 1) {
        const [a] = m.opponents;
        check(`${label}: one board across the top and yours across the bottom, the same height`, near(a.width, m.mine.width) && near(a.height, m.mine.height) && a.top < m.mine.top, JSON.stringify([a, m.mine]));
      }
      if (opponents === 0) check(`${label}: with nobody else your board fills the middle`, m.mine.height > (m.win.h - 200) * 0.6 && m.mine.width > m.win.w * 0.6, JSON.stringify(m.mine));
      // your hand runs along the whole bottom under the boards, and the controls under the top bar run across the same width
      const boardsRight = Math.max(m.mine.right, ...m.opponents.map((o) => o.right));
      check(`${label}: your hand runs under all the boards (it ends where they end) and the controls start at the same left edge`, near(m.hand.left, m.mine.left) && near(m.hand.right, boardsRight, 3) && near(m.bar.left, m.mine.left), JSON.stringify([m.hand, boardsRight, m.bar.left, m.mine.left]));
      check(`${label}: the side column is to the right of the boards, from below the top bar to the footer`, m.side.left >= boardsRight - 1 && m.players.left >= boardsRight - 1 && m.side.bottom <= m.footer.top + 1 && m.players.top <= m.bar.bottom + 1, JSON.stringify([m.side, m.players, boardsRight]));
      // the boards, the bar and the top show everything they hold
      check(`${label}: no board clips its content (the other players' panels and yours)`, m.opponentOverflow.every((o) => o <= 1) && m.mineOverflow <= 1, JSON.stringify([m.opponentOverflow, m.mineOverflow]));
      check(`${label}: the top bar and the controls are not cut off`, m.topbarOverflow <= 1 && m.barOverflow <= 1, JSON.stringify([m.topbarOverflow, m.barOverflow]));
      // cards big enough to see: the hand and the boards
      const minHand = Math.min(...m.handCardH); const minMine = Math.min(...m.mineCardH);
      check(`${label}: the cards in your hand are at least 60 px tall (${Math.round(minHand)})`, minHand >= 60);
      check(`${label}: the cards on your battlefield are at least 36 px tall (${Math.round(minMine)})`, minMine >= 36); // measured 2026-11-06 on the 12 by 4 grid: 37 px at 1280x720 with three opponents, 40 at 1366x650; the larger picture on hover is for reading them
      if (opponents) { const minOpp = Math.min(...m.oppCardH); const needed = Math.max(24, Math.round(h * 0.035)); check(`${label}: the cards on the other players' battlefields are at least 24 px and 3.5% of the window height (${needed} px) tall (${Math.round(minOpp)})`, minOpp >= needed); } // measured 2026-11-06 with three opponents: 26 px at 1366x650, 31 at 1366x768, 55 at 1920x950; small on purpose (48 cells in each panel), and the hover picture is how they are read
      if (process.argv.includes('--screenshot') && opponents === 3 && (w === 1366 && (h === 650 || h === 768) || w === 1920)) await browser.screenshot(`scratch-layout-${w}x${h}.png`);
    }
    // a width where the controls need the most room
    await closeAllBrowsers();
  }
  console.log(`checked ${SIZES.length} window sizes with 0 to 3 other players each`);
} finally {
  await closeAllBrowsers();
  if (server) await server.close();
}

if (failures.length) { console.log(`\n${failures.length} of ${checks} table layout checks FAILED.`); process.exit(1); }
console.log(`All ${checks} table layout checks passed.`);
