// Checks the Seats table's layout (frontend/src/style.css, "body.playing.seats"; Kevin, 2026-11-20) in a real headless Chrome at several window sizes with 1 to 3 other players. The real page and style
// sheet are loaded; the game itself is not (that needs a database), so the page is put into the playing state and filled with busy content built like the page's own: a long hand, full battlefields,
// counters on every other player. Short on purpose: per size and count, the page does not scroll, the other players' areas are across the top side by side and hold their boards, your own area is below
// with the life piece and the action bar in it, and the cards are big enough to see. Run from the repo root: node scripts/check-table-layout.mjs [--screenshot]
// (The old 2x2 layout of the table page, checked here until 2026-11-20, is gone.)
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

// The page's own structure for one other player (frontend/pages/table/table.js opponentPanel), with busy content.
const FILL = (opponents) => `(() => {
  const make = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
  const card = (n, tapped) => { const b = make('button', 'card' + (tapped ? ' tapped' : '')); b.type = 'button'; const face = make('span', 'face'); face.append(make('span', 'fallback', 'Card ' + n)); b.append(face); const marks = make('span', 'marks'); const chips = make('span', 'chips'); chips.append(make('span', 'chip', '+1/+1 3')); marks.append(chips); b.append(marks); return b; };
  const fill = (row, count) => { for (let i = 0; i < count; i++) row.append(card(i, false)); };
  // a battlefield is a 112 by 50 grid, a card 7 by 10 (shared/board-grid.mjs): lands from the bottom-left, the rest from the top-left
  const board = (grid, lands, others, tappedEvery) => { grid.replaceChildren(); const put = (n, col, row, kind) => { const b = card(n, tappedEvery && n % tappedEvery === 0); b.dataset.col = String(col); b.dataset.row = String(row); b.dataset.kind = kind; grid.append(b); }; for (let i = 0; i < lands; i++) put(i, (i % 16) * 7, 40 - 10 * Math.floor(i / 16), 'land'); for (let i = 0; i < others; i++) put(100 + i, (i % 16) * 7, 10 * Math.floor(i / 16), 'other'); };
  document.body.classList.add('playing', 'seats');
  document.body.dataset.seats = String(${opponents} + 1);
  document.getElementById('game').hidden = false;
  document.getElementById('opponents').hidden = false;
  document.getElementById('blocked').hidden = true;
  document.getElementById('opponents').style.setProperty('--opp-n', String(${opponents}));
  const list = document.getElementById('opponent-list');
  list.replaceChildren();
  // a pile as src/pile-stack.js draws it
  const pile = (zone, label, count) => { const b = make('button', 'opp-pile pile-stack'); b.type = 'button'; b.dataset.zone = zone; b.dataset.label = label; b.dataset.count = String(count); b.dataset.empty = 'false'; const layers = make('span', 'stack-layers'); layers.append(make('span', 'stack-layer'), make('span', 'stack-layer'), make('span', 'stack-face' + (zone === 'library' ? ' back' : ''))); b.append(layers); return b; };
  for (let n = 1; n <= ${opponents}; n++) {
    const section = make('section', 'opponent' + (n === 1 ? ' active' : ''));
    const title = make('h3', '', 'Seat ' + (n + 1) + ': Opponent number ' + n); if (n === 1) title.append(make('span', 'turn-mark', 'their turn'));
    const counters = make('div', 'opponent-counters counter-chips'); for (const text of ['3', '2', '21']) { const chip = make('span', 'counter-chip'); chip.append(make('strong', 'chip-count', text)); counters.append(chip); }
    const info = make('div', 'opp-info'); info.append(title, make('strong', 'opp-life', '40'), make('p', 'hint', 'Hand 7 · Library 61'), counters);
    const waiting = make('p', 'hint', 'Has not been dealt a game yet.'); waiting.hidden = true;
    const grid = make('div', 'battlefield'); board(grid, 12, 14, 4);
    const field = make('div', 'opp-field'); field.append(grid);
    const command = make('div', 'row opp-command'); fill(command, 2);
    const commandBox = make('div', 'opp-command-zone'); commandBox.append(command, make('span', 'opp-zone-label', 'Command'));
    const zones = make('div', 'opp-zones'); zones.append(pile('library', 'Library', 61), pile('graveyard', 'Graveyard', 12), pile('exile', 'Exile', 3), commandBox);
    const body = make('div', 'opp-body'); body.append(field, zones);
    section.append(info, waiting, body);
    list.append(section);
  }
  board(document.getElementById('battlefield'), 12, 20, 5);
  fill(document.getElementById('hand'), 10); document.getElementById('hand-count').textContent = '10';
  document.getElementById('turn-banner').hidden = false; document.getElementById('turn-banner').textContent = 'It is your turn (turn 3).';
  document.getElementById('status').textContent = 'Back at your game.';
  window.dispatchEvent(new Event('resize'));
  return true;
})()`;

const RECTS = `(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
  const tall = (sel) => [...document.querySelectorAll(sel)].map((c) => { const b = c.getBoundingClientRect(); return Math.max(b.width, b.height); });
  return {
    win: { w: innerWidth, h: innerHeight },
    scroll: { docH: document.documentElement.scrollHeight, docW: document.documentElement.scrollWidth },
    opponentsBox: r(document.getElementById('opponents')),
    areas: [...document.querySelectorAll('.opponent')].map(r),
    fields: [...document.querySelectorAll('.opp-field')].map((f) => ({ field: r(f), grid: r(f.querySelector('.battlefield')) })),
    areaOverflow: [...document.querySelectorAll('.opponent')].map((p) => Math.max(p.scrollHeight - p.clientHeight, p.scrollWidth - p.clientWidth)),
    oppPiles: [...document.querySelectorAll('.opponent')].map((p) => ({ area: r(p), piles: [...p.querySelectorAll('.opp-pile, .opp-command-zone')].map(r) })),
    mine: r(document.getElementById('battlefield')), life: r(document.getElementById('life-area')), bar: r(document.querySelector('.actions-panel .actions')), turnLine: r(document.querySelector('.turn-line')), menu: r(document.getElementById('settings-button')),
    panel: r(document.getElementById('right-column')), piles: r(document.querySelector('.side-panels')),
    myPiles: [...document.querySelectorAll('#piles-section .pile-stack, #command .cmd-slot')].map(r),
    hand: r(document.getElementById('hand-section')),
    handCardH: tall('#hand > .card'), mineCardH: tall('#battlefield > .card'), oppCardH: tall('.opponent .battlefield > .card'), pileW: [...document.querySelectorAll('#piles-section .pile-stack .stack-layers')].map((e) => e.getBoundingClientRect().width),
  };
})()`;

const inside = (a, b, slack = 1) => a.left >= b.left - slack && a.top >= b.top - slack && a.right <= b.right + slack && a.bottom <= b.bottom + slack;
const apart = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;

let server = null;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  for (const [w, h] of SIZES) {
    const browser = await openBrowser('table-layout', { width: w, height: h });
    await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    for (const opponents of [1, 2, 3]) {
      const label = `${w}x${h}, ${opponents} other player${opponents === 1 ? '' : 's'}`;
      await browser.goto(`${ORIGIN}/table/ABCDEF`);
      await browser.eval(FILL(opponents));
      await sleep(200);
      const m = await browser.eval(RECTS);
      const win = { left: 0, top: 0, right: m.win.w, bottom: m.win.h };
      check(`${label}: the page does not scroll`, m.scroll.docH <= m.win.h + 1 && m.scroll.docW <= m.win.w + 1, JSON.stringify(m.scroll));
      check(`${label}: the other players' areas are across the top, side by side, the same size, and nothing in them is cut off`, m.areas.length === opponents && m.areas.every((a) => inside(a, m.opponentsBox) && Math.abs(a.width - m.areas[0].width) <= 2 && Math.abs(a.top - m.areas[0].top) <= 1) && m.areas.every((a, n) => n === 0 || a.left >= m.areas[n - 1].right - 1) && m.areaOverflow.every((o) => o <= 1), JSON.stringify(m.areas));
      check(`${label}: each other player's battlefield fits inside its area`, m.fields.every(({ field, grid }) => inside(grid, field, 1.5) && grid.width > 60), JSON.stringify(m.fields));
      check(`${label}: each other player's piles are inside their area and apart from their battlefield`, m.oppPiles.every(({ area, piles }, n) => piles.length === 4 && piles.every((p) => inside(p, area, 1) && apart(p, m.fields[n].grid))), JSON.stringify(m.oppPiles[0]));
      check(`${label}: your battlefield is below them, in the window`, m.mine.top >= m.opponentsBox.bottom - 1 && inside(m.mine, win) && m.mine.height > 150, JSON.stringify(m.mine));
      check(`${label}: your panel is beside your battlefield, with the life piece, the turn, the buttons (one row) and the menu button in it, apart`, m.panel.left >= m.mine.right && [m.life, m.turnLine, m.bar, m.menu].every((b) => inside(b, m.panel, 1)) && [m.life, m.turnLine, m.bar, m.menu].every((a, i, all) => all.every((b, j) => i === j || apart(a, b))) && m.bar.height < 45, JSON.stringify({ panel: m.panel, life: m.life, turn: m.turnLine, bar: m.bar, menu: m.menu }));
      check(`${label}: your piles and command slots are whole, in the panel, below the actions and apart from each other`, m.myPiles.length === 5 && m.myPiles.every((p) => inside(p, m.piles, 1) && p.top >= m.bar.bottom - 1) && m.myPiles.every((p, i) => m.myPiles.every((q, j) => i === j || apart(p, q))), JSON.stringify(m.myPiles));
      check(`${label}: the hand is a strip along the bottom, the width of the window, under your battlefield`, Math.abs(m.hand.bottom - m.win.h) <= 2 && m.hand.width >= m.win.w - 2 && m.hand.top >= m.mine.bottom, JSON.stringify(m.hand));
      const minHand = Math.min(...m.handCardH); const minMine = Math.min(...m.mineCardH); const minOpp = Math.min(...m.oppCardH); const minPile = Math.min(...m.pileW);
      check(`${label}: cards are big enough to see: hand ${Math.round(minHand)} px, yours ${Math.round(minMine)} px, theirs ${Math.round(minOpp)} px, your piles ${Math.round(minPile)} px wide (at least 110, 36, 20 and 55)`, minHand >= 110 && minMine >= 36 && minOpp >= 20 && minPile >= 55);
      if (process.argv.includes('--screenshot') && (w === 1366 || w === 1920)) await browser.screenshot(`scratch-layout-${w}x${h}-${opponents}.png`);
    }
    await closeAllBrowsers();
  }
  console.log(`checked ${SIZES.length} window sizes with 1 to 3 other players each`);
} finally {
  await closeAllBrowsers();
  if (server) await server.close();
}

if (failures.length) { console.log(`\n${failures.length} of ${checks} table layout checks FAILED.`); process.exit(1); }
console.log(`All ${checks} table layout checks passed.`);
