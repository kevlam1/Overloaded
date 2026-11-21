// Checks the Seats table's layout (frontend/src/style.css, "the Seats table, version 3"; Kevin, 2026-11-20) in a real headless Chrome at several window sizes with 1 to 3 other players, in Grid view.
// The real page and style sheet are loaded; the game itself is not (that needs a database), so the page is put into the playing state and filled with busy content built like the page's own:
// full battlefields, a hand of 7, card backs for the others' hands, counters. Short on purpose: per size and count, the page does not scroll, every player has an area of their own in the window,
// in each area the battlefield is under the head and nothing of the area rests on it (piles, the resting hand), and the cards are big enough to see.
// Run from the repo root: node scripts/check-table-layout.mjs [--screenshot]
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

// The page's own structure for the other players (frontend/pages/table/table.js opponentPanel), with busy content, and cards in your own battlefield and hand.
const FILL = (opponents) => `(() => {
  const make = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
  const card = (n, tapped) => { const b = make('button', 'card' + (tapped ? ' tapped' : '')); b.type = 'button'; const face = make('span', 'face'); face.append(make('span', 'fallback', 'Card ' + n)); b.append(face); return b; };
  // a battlefield is a 112 by 50 grid, a card 7 by 10 (shared/board-grid.mjs): lands from the bottom-left, the rest from the top-left
  const board = (grid, lands, others) => { grid.replaceChildren(); const put = (n, col, row, kind) => { const b = card(n, false); b.dataset.col = String(col); b.dataset.row = String(row); b.dataset.kind = kind; grid.append(b); }; for (let i = 0; i < lands; i++) put(i, (i % 16) * 7, 40 - 10 * Math.floor(i / 16), 'land'); for (let i = 0; i < others; i++) put(100 + i, (i % 16) * 7, 10 * Math.floor(i / 16), 'other'); };
  const pile = (zone, label, count) => { const b = make('button', 'opp-pile pile-stack'); b.type = 'button'; b.dataset.zone = zone; b.dataset.label = label; b.dataset.count = String(count); b.dataset.empty = 'false'; const layers = make('span', 'stack-layers'); layers.append(make('span', 'stack-layer'), make('span', 'stack-layer'), make('span', 'stack-face' + (zone === 'library' ? ' back' : ''))); b.append(layers); return b; };
  document.body.classList.add('playing', 'seats');
  document.body.dataset.seats = String(${opponents} + 1);
  document.body.dataset.view = 'grid';
  document.getElementById('game').hidden = false;
  document.getElementById('opponents').hidden = false;
  document.getElementById('blocked').hidden = true;
  const list = document.getElementById('opponent-list');
  list.replaceChildren();
  for (let n = 1; n <= ${opponents}; n++) {
    const section = make('section', 'opponent seat-area' + (n === 1 ? ' active' : ''));
    section.dataset.slot = 'o' + n;
    const title = make('h3', 'seat-name', 'Seat ' + (n + 1) + ': Opponent number ' + n);
    const life = make('strong', 'opp-life', '40');
    const counters = make('div', 'opponent-counters counter-chips'); for (const text of ['3', '21']) { const chip = make('span', 'counter-chip'); chip.append(make('strong', 'chip-count', text)); counters.append(chip); }
    const lifeBox = make('div', 'opp-life-box'); lifeBox.append(life, counters);
    const head = make('div', 'seat-head opp-info'); head.append(lifeBox, title);
    const grid = make('div', 'battlefield'); board(grid, 12, 14);
    const field = make('div', 'opp-field'); field.append(grid);
    const backs = make('div', 'opp-backs'); for (let i = 0; i < 7; i++) { const b = make('span', 'opp-back'); b.style.setProperty('--i', String(i - 3)); backs.append(b); }
    const hand = make('div', 'opp-hand'); hand.append(backs);
    const command = make('div', 'row opp-command'); command.append(card(900, false));
    const commandBox = make('div', 'opp-command-zone'); commandBox.append(command, make('span', 'opp-zone-label', 'CMD'));
    const zones = make('div', 'opp-zones'); zones.append(pile('library', 'Library', 61), pile('graveyard', 'Graveyard', 12), pile('exile', 'Exile', 3), commandBox);
    const body = make('div', 'opp-body'); body.append(field, hand, make('span', 'hand-pill opp-hand-pill', 'Hand 7'), zones);
    section.append(head, make('p', 'hint opp-stats', 'Hand 7 · Library 61'), body);
    list.append(section);
  }
  board(document.getElementById('battlefield'), 12, 20);
  const myHand = document.getElementById('hand'); for (let i = 0; i < 7; i++) myHand.append(card(500 + i, false)); document.getElementById('hand-count').textContent = '7';
  document.getElementById('status').textContent = 'Back at your game.';
  window.dispatchEvent(new Event('resize'));
  return true;
})()`;

const RECTS = `(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
  const tall = (sel) => [...document.querySelectorAll(sel)].map((c) => { const b = c.getBoundingClientRect(); return Math.max(b.width, b.height); });
  const areas = [...document.querySelectorAll('.seat-area')].map((a) => ({
    mine: a.id === 'seat-me', area: r(a), overflow: Math.max(a.scrollHeight - a.clientHeight, a.scrollWidth - a.clientWidth),
    board: r(a.querySelector('.battlefield')), head: r(a.querySelector('.seat-head')),
    piles: [...a.querySelectorAll('.opp-pile, .opp-command-zone, #piles-section .pile-stack, #command .cmd-slot')].map(r),
    resting: [...a.querySelectorAll('#hand > .card, .opp-back')].map(r),
  }));
  return {
    myCols: Number(getComputedStyle(document.getElementById('battlefield')).getPropertyValue('--cols')) || null,
    // the spacing of the drawn cell lines, in px: the first two numbers of the computed background-size (percentages of the board)
    lines: (() => { const b = document.getElementById('battlefield'); const parts = (getComputedStyle(b).backgroundSize.match(/-?[0-9.]+(?:e-?[0-9]+)?%/g) ?? []).slice(0, 2).map(parseFloat); return parts.length === 2 ? { x: parts[0] / 100 * b.clientWidth, y: parts[1] / 100 * b.clientHeight, raw: getComputedStyle(b).backgroundSize.slice(0, 80) } : { raw: getComputedStyle(b).backgroundSize.slice(0, 80) }; })(),
    win: { w: innerWidth, h: innerHeight }, scroll: { docH: document.documentElement.scrollHeight, docW: document.documentElement.scrollWidth },
    areas, life: r(document.getElementById('life-area')), bar: r(document.querySelector('.actions-panel')), hud: r(document.querySelector('.seats-hud')),
    handCardH: tall('#hand > .card'), mineCardH: tall('#battlefield > .card'), oppCardH: tall('.opponent .battlefield > .card'), pileW: [...document.querySelectorAll('#piles-section .pile-stack .stack-layers, .opp-pile .stack-layers')].map((e) => e.getBoundingClientRect().width),
  };
})()`;

const inside = (a, b, slack = 1) => a.left >= b.left - slack && a.top >= b.top - slack && a.right <= b.right + slack && a.bottom <= b.bottom + slack;
const apart = (a, b, slack = 0) => a.right <= b.left + slack || b.right <= a.left + slack || a.bottom <= b.top + slack || b.bottom <= a.top + slack;

let server = null;
try {
  server = await createServer({ configFile: 'vite.config.js', logLevel: 'error', server: { port: PORT, strictPort: true, host: '127.0.0.1' } });
  await server.listen();
  for (const [w, h] of SIZES) {
    const browser = await openBrowser('table-layout', { width: w, height: h });
    await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    for (const opponents of [1, 2, 3]) {
      const label = `${w}x${h}, ${opponents + 1} players`;
      await browser.goto(`${ORIGIN}/table/ABCDEF`);
      await browser.eval(FILL(opponents));
      await sleep(250);
      const m = await browser.eval(RECTS);
      const win = { left: 0, top: 0, right: m.win.w, bottom: m.win.h };
      const mine = m.areas.find((a) => a.mine);
      check(`${label}: the page does not scroll`, m.scroll.docH <= m.win.h + 1 && m.scroll.docW <= m.win.w + 1, JSON.stringify(m.scroll));
      check(`${label}: every player has an area in the window, none overlapping, yours at the bottom`, m.areas.length === opponents + 1 && m.areas.every((a) => inside(a.area, win)) && m.areas.every((a, i) => m.areas.every((b, j) => i === j || apart(a.area, b.area, 1))) && Math.abs(mine.area.bottom - m.win.h) <= 6, JSON.stringify(m.areas.map((a) => a.area)));
      check(`${label}: my battlefield's cells are square: 40 rows and as many columns as its width holds (${m.myCols} columns)`, Number.isInteger(m.myCols) && Math.abs(m.myCols - mine.board.width / (mine.board.height / 40)) < 1, JSON.stringify({ cols: m.myCols, board: mine.board }));
      check(`${label}: ...and the cell LINES drawn on it are square too (${m.lines.x?.toFixed(2)} by ${m.lines.y?.toFixed(2)} px)`, Number.isFinite(m.lines.x) && Number.isFinite(m.lines.y) && Math.abs(m.lines.x - m.lines.y) / m.lines.y < 0.02, JSON.stringify(m.lines));
      check(`${label}: in every area the battlefield fills it from the top left corner, and its right edge is just before the piles`, m.areas.every((a) => inside(a.board, a.area, 1) && a.board.top - a.area.top <= 10 && a.board.left - a.area.left <= 10 && a.board.width > 150 && Math.min(...a.piles.map((p) => p.left)) - a.board.right >= 0 && Math.min(...a.piles.map((p) => p.left)) - a.board.right <= 24), JSON.stringify(m.areas.map((a) => [a.board, Math.min(...a.piles.map((p) => p.left))])));
      check(`${label}: in every area the piles are whole, inside it and off the battlefield`, m.areas.every((a) => a.piles.length >= 4 && a.piles.every((p) => inside(p, a.area, 1) && apart(p, a.board, 1))), JSON.stringify(m.areas.map((a) => a.piles.filter((p) => !apart(p, a.board, 1)))));
      check(`${label}: no resting hand card (yours or a back of theirs) covers more than 3 px of a battlefield`, m.areas.every((a) => a.resting.every((c) => apart(c, a.board, 3))), JSON.stringify(m.areas.map((a) => [a.board.bottom, Math.min(...a.resting.map((c) => c.top))])));
      check(`${label}: your life is in your area's head; the action bar starts as a row in the bottom left corner, under your battlefield, apart from the view and menu buttons`, inside(m.life, mine.head, 1) && inside(m.bar, win, 1) && apart(m.bar, m.hud) && apart(m.life, m.hud) && m.bar.left < 20 && m.bar.top >= mine.board.bottom - 1 && m.bar.height < 50, JSON.stringify({ life: m.life, bar: m.bar, board: mine.board, hud: m.hud }));
      const minHand = Math.min(...m.handCardH); const minMine = Math.min(...m.mineCardH); const minOpp = Math.min(...m.oppCardH); const minPile = Math.min(...m.pileW);
      check(`${label}: cards are big enough to see: hand ${Math.round(minHand)} px, yours ${Math.round(minMine)} px, theirs ${Math.round(minOpp)} px, piles ${Math.round(minPile)} px wide (at least 60, 28, 28 and 28)`, minHand >= 60 && minMine >= 28 && minOpp >= 28 && minPile >= 28);
      if (process.argv.includes('--screenshot') && (w === 1366 || w === 1920) && h !== 650) await browser.screenshot(`scratch-layout-${w}x${h}-${opponents + 1}.png`);
    }
    await closeAllBrowsers();
  }
  console.log(`checked ${SIZES.length} window sizes with 2 to 4 players each`);
} finally {
  await closeAllBrowsers();
  if (server) await server.close();
}

if (failures.length) { console.log(`\n${failures.length} of ${checks} table layout checks FAILED.`); process.exit(1); }
console.log(`All ${checks} table layout checks passed.`);
