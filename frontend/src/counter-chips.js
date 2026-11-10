// The chips next to a player's life total: one small chip for each counter or mark the player has (an icon and a number; a mark such as the monarch is only
// the icon) and for each commander damage taken. What to show comes from chipEntries() in shared/player-counters.mjs; this only draws it. A chip is made once and
// then updated in place, so nothing flickers when a number changes. Text only: a player's name is another person's text and is never put in as markup.
import { counterIcon } from './counter-icons.js';

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// entry: from counterEntry() or commanderDamageEntry(). Returns { element, update(entry) }.
function chipNode(entry) {
  const element = make('span', 'counter-chip');
  element.setAttribute('role', 'img');
  const icon = make('span', 'chip-icon');
  const count = make('strong', 'chip-count');
  const seat = make('span', 'chip-seat');
  const lethal = make('span', 'chip-lethal', 'lethal');
  element.append(icon, count, seat, lethal);
  let drawnKind = null;
  function update(next) {
    const damage = next.id.startsWith('damage:');
    const kind = damage ? 'damage' : next.kind;
    if (kind !== drawnKind) { icon.replaceChildren(counterIcon(kind) ?? ''); drawnKind = kind; }
    element.dataset.id = next.id;
    element.dataset.kind = kind;
    count.textContent = next.count.toLocaleString('en-US');
    count.hidden = Boolean(next.flag); // a mark is on or off: the icon is all there is
    seat.textContent = damage ? next.seat : '';
    seat.hidden = !damage;
    lethal.hidden = !next.lethal;
    element.classList.toggle('lethal', next.lethal);
    const words = damage ? `Commander damage from ${next.label}: ${next.count}` : next.flag ? next.label : `${next.label} ${next.count}`;
    element.title = next.lethal ? `${words} (lethal at ${next.lethalAt})` : words;
    element.setAttribute('aria-label', next.lethal ? `${words} (lethal)` : words);
  }
  update(entry);
  return { element, update };
}

// A block of chips. update(entries) draws exactly those entries (an entry that is gone loses its chip) and returns whether any chip is showing.
export function mountCounterChips(container) {
  const nodes = new Map();
  return {
    element: container,
    update(entries) {
      const wanted = entries.map((entry) => {
        let node = nodes.get(entry.id);
        if (!node) { node = chipNode(entry); nodes.set(entry.id, node); }
        node.update(entry);
        return node.element;
      });
      const ids = new Set(entries.map((entry) => entry.id));
      for (const id of [...nodes.keys()]) if (!ids.has(id)) nodes.delete(id);
      const same = wanted.length === container.children.length && wanted.every((element, index) => container.children[index] === element);
      if (!same) container.replaceChildren(...wanted);
      return wanted.length > 0;
    },
  };
}
