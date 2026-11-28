// The Players section of the rail (the redesign, Kevin 2026-11-24, direction B): one "seat card" per player in turn order from you.
// A card shows the player's seat color, name, state (Away, Conceded), whether it is their turn or they are next, their life, their commander(s) with the tax,
// how many cards they hold, their counters, and a readable summary of their battlefield (shared/board-summary.mjs).
// Sidebar view (the Focus Table): a click on a card shows that player's board large (onFocus); your own card appears only while someone else is shown large,
// as the way back. Grid view: the cards are a compact turn-order list (the style sheet hides the summaries) and yours is in it.
// It is a tool of the rail (src/tool-dock.js): its header is the grip that drags it out to float and back.
import { inkOn } from '../../shared/player-colors.mjs';
import { mountFloatingBar } from './floating-bar.js';
import { mountCounterChips } from './counter-chips.js';
import { rowName, rowDetail } from '../../shared/board-summary.mjs';

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

const MAX_ROWS = 6; // summary rows per card before "+N more" (lands are always one line)

export function mountPlayersPanel({ root, store, key = 'overloaded.playersBar', room = null, docking = null, onFocus = () => {} }) {
  const head = make('div', 'players-head');
  head.setAttribute('role', 'button');
  head.tabIndex = 0;
  head.setAttribute('aria-label', 'Players: drag to move');
  head.append(make('span', 'players-title', 'Players'));
  const list = make('ul', 'players-list');
  root.replaceChildren(head, list);
  const rows = new Map(); // uid -> the elements of that player's card

  function rowFor(uid) {
    let row = rows.get(uid);
    if (row) return row;
    const item = make('li', 'pp-row');
    item.dataset.uid = uid;
    const top = make('div', 'pp-top');
    const name = make('span', 'pp-name');
    const status = make('span', 'pp-status'); status.hidden = true; // (Reconnecting..., Away N min, Conceded)
    const tag = make('span', 'pp-tag'); tag.hidden = true; // (Their turn, Next)
    const life = make('strong', 'pp-life');
    top.append(name, status, tag, life);
    const sub = make('div', 'pp-sub');
    const chipsBox = make('div', 'pp-chips counter-chips');
    const summary = make('ul', 'pp-summary');
    item.append(top, sub, chipsBox, summary);
    item.addEventListener('click', () => { if (item.dataset.clickable === 'true') onFocus(item.dataset.focused === 'true' ? null : uid); });
    item.addEventListener('keydown', (event) => { if ((event.key === 'Enter' || event.key === ' ') && item.dataset.clickable === 'true') { event.preventDefault(); item.click(); } });
    row = { item, name, status, tag, life, sub, chipsBox, summary, chips: mountCounterChips(chipsBox) };
    rows.set(uid, row);
    return row;
  }

  function drawSummary(row, kinds) {
    const lines = [];
    let shown = 0;
    let more = 0;
    for (const kind of kinds ?? []) {
      if (kind.id === 'lands') { lines.push([`Lands ${kind.total}`, kind.tapped ? `${kind.tapped} tapped` : '', 'pp-sum-lands']); continue; }
      for (const entry of kind.rows) {
        if (shown < MAX_ROWS) { lines.push([rowName(entry), rowDetail(entry), '']); shown += 1; } else more += entry.count;
      }
    }
    if (more) lines.push([`+${more} more`, '', 'pp-sum-more']);
    row.summary.replaceChildren(...lines.map(([words, detail, extra]) => {
      const li = make('li', `pp-sum-row ${extra}`.trim());
      li.append(make('span', 'pp-sum-name', words), make('span', 'pp-sum-detail', detail));
      return li;
    }));
    row.summary.hidden = lines.length === 0;
  }

  const floating = mountFloatingBar({ bar: root, grip: head, store, key, defaultPlace: { dock: 'right', fx: 1, fy: 0.5 }, flush: true, room, docking });

  return {
    relayout: floating.relayout,
    // players: [{ uid, seat, color (a CSS value), name, mine, life, active, next, focused, clickable, status: { short, long }, commanders: [{ name, tax }], hand, library, chips, summary }], in turn order
    update(players) {
      players.forEach((player, index) => {
        const row = rowFor(player.uid);
        const { item } = row;
        item.classList.toggle('mine', Boolean(player.mine));
        item.classList.toggle('active', Boolean(player.active));
        item.dataset.focused = String(Boolean(player.focused));
        item.dataset.clickable = String(Boolean(player.clickable));
        item.style.setProperty('--seat-color', player.color ?? `var(--seat-${/^[1-4]$/.test(String(player.seat)) ? player.seat : 1})`); // (the player's color, picked in the lobby)
        if (/^#[0-9a-f]{6}$/i.test(player.color ?? '')) item.style.setProperty('--seat-ink', inkOn(player.color)); // (text on their color, dark or light)
        if (player.clickable) { item.tabIndex = 0; item.setAttribute('role', 'button'); item.setAttribute('aria-pressed', String(Boolean(player.focused))); item.title = player.focused ? 'Back to your board' : `Show ${player.name}'s board`; }
        else { item.removeAttribute('tabindex'); item.removeAttribute('role'); item.removeAttribute('aria-pressed'); item.removeAttribute('title'); }
        row.name.textContent = player.name; // (other people's text: as text, never markup; your own name glows instead of saying "(you)", Kevin 2026-11-28)
        row.name.classList.toggle('me', Boolean(player.mine));
        row.status.textContent = player.status?.short ?? ''; row.status.title = player.status?.long ?? ''; row.status.hidden = !player.status?.short;
        row.tag.textContent = player.active ? 'Their turn' : player.next ? 'Next' : '';
        if (player.mine && player.active) row.tag.textContent = 'Your turn';
        row.tag.hidden = !row.tag.textContent;
        row.life.textContent = String(player.life ?? '');
        row.life.setAttribute('aria-label', `Life ${player.life}`);
        const commanders = (player.commanders ?? []).map((c) => (c.tax ? `${c.name} (tax +${c.tax})` : c.name)).join(' · ');
        const counts = player.hand === undefined ? '' : `Hand ${player.hand} · Library ${player.library}`;
        row.sub.replaceChildren(...[[commanders, 'pp-cmd'], [counts, 'pp-counts']].filter(([words]) => words).map(([words, kind]) => make('span', kind, words))); // (a line each)
        row.sub.hidden = !commanders && !counts;
        row.chipsBox.hidden = !row.chips.update(player.chips ?? []);
        drawSummary(row, player.summary);
        if (list.children[index] !== item) list.insertBefore(item, list.children[index] ?? null);
      });
      const keep = new Set(players.map((player) => player.uid));
      for (const [uid, row] of rows) if (!keep.has(uid)) { row.item.remove(); rows.delete(uid); }
    },
  };
}
