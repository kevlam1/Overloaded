// The Players tool (Kevin, 2026-11-23): every player in one panel, in turn order: name, life, their commander(s) with the tax, and their counters and marks (poison, monarch, commander damage, ...).
// It is a tool like the game history (src/floating-bar.js): it sits in a dock in Grid view (src/tool-dock.js) and floats when dragged out by its header. Your own row holds your real life controls
// (the page moves #life-area into mineSlot), so the life boxes leave the seats while this panel is on the table.
import { mountFloatingBar } from './floating-bar.js';
import { mountCounterChips } from './counter-chips.js';

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function mountPlayersPanel({ root, store, key = 'overloaded.playersBar', room = null, docking = null }) {
  const head = make('div', 'players-head');
  head.setAttribute('role', 'button');
  head.tabIndex = 0;
  head.setAttribute('aria-label', 'Players: drag to move');
  head.append(make('span', 'players-title', 'Players'));
  const list = make('ul', 'players-list');
  root.replaceChildren(head, list);
  const mineSlot = make('div', 'pp-life-slot'); // (your #life-area goes here)
  const rows = new Map(); // uid -> { item, name, life, cmd, chips }

  function rowFor(uid, mine) {
    let row = rows.get(uid);
    if (row) return row;
    const item = make('li', 'pp-row');
    item.dataset.uid = uid;
    const top = make('div', 'pp-top');
    const name = make('span', 'pp-name');
    const status = make('span', 'pp-status'); status.hidden = true; // (Reconnecting..., Away N min, Conceded)
    const life = make('strong', 'pp-life');
    top.append(name, status, mine ? mineSlot : life);
    const cmd = make('div', 'pp-cmd');
    const chipsBox = make('div', 'pp-chips counter-chips');
    item.append(top, cmd, chipsBox);
    row = { item, name, status, life, cmd, chips: mountCounterChips(chipsBox), chipsBox };
    rows.set(uid, row);
    return row;
  }

  const floating = mountFloatingBar({ bar: root, grip: head, store, key, defaultPlace: { dock: 'right', fx: 1, fy: 0.5 }, flush: true, room, docking });

  return {
    relayout: floating.relayout,
    mineSlot,
    // players: [{ uid, name, mine, life, active, commanders: [{ name, tax }], chips: entries for mountCounterChips }], in the order to show them
    update(players) {
      players.forEach((player, index) => {
        const row = rowFor(player.uid, player.mine);
        row.item.classList.toggle('mine', Boolean(player.mine));
        row.item.classList.toggle('active', Boolean(player.active));
        row.name.textContent = player.name; // (other people's text: as text, never markup)
        row.status.textContent = player.status?.short ?? ''; row.status.title = player.status?.long ?? ''; row.status.hidden = !player.status?.short;
        if (!player.mine) { row.life.textContent = String(player.life); row.life.setAttribute('aria-label', `Life ${player.life}`); }
        const commanders = player.commanders ?? [];
        row.cmd.textContent = commanders.map((c) => (c.tax ? `${c.name} (tax +${c.tax})` : c.name)).join(' · ');
        row.cmd.hidden = commanders.length === 0;
        row.chipsBox.hidden = player.mine || !row.chips.update(player.chips ?? []); // (your own chips are in your life controls)
        if (list.children[index] !== row.item) list.insertBefore(row.item, list.children[index] ?? null);
      });
      const keep = new Set(players.map((player) => player.uid));
      for (const [uid, row] of rows) if (!keep.has(uid)) { row.item.remove(); rows.delete(uid); }
    },
  };
}
