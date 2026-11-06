// The elements for the player counters (poison, energy, experience) and for commander damage. What they show and do is in
// shared/player-counters.mjs; this file only draws it. Plain DOM, no dependencies, text only (a player's name is another person's text and
// is never put in as markup).
//
// THE UNIT IS ONE ENTRY. commanderDamageNode(entry) is the controls of ONE player's commander damage, and mountCommanderDamage() only
// puts a list of them in a block. To show the damage from one player inside THAT player's panel instead, make the node for that
// player's entry and put it in the panel:
//     const node = commanderDamageNode(commanderDamageEntry(cd, seat, name), { onChange });   // shared/player-counters.mjs
//     panel.append(node.element);  ...later:  node.update(commanderDamageEntry(cd, seat, name));
// Nothing else changes: the data is already one number per player (game.cd[seat]).
import { COUNTER_STEPS, DAMAGE_STEPS } from '../../shared/player-counters.mjs';

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

const signed = (step) => (step > 0 ? `+${step}` : String(step));

// One counter or one player's commander damage: a name, buttons to take off and add, the count, and a word when it is lethal.
// kind is 'counter' or 'damage'. In readOnly mode (another player's panel) there are no buttons, and the node hides itself while its
// count is 0, so a panel shows only what has happened. Returns { element, update(entry) }.
function stepperNode(entry, { kind, steps, readOnly = false, onChange = () => {} }) {
  const element = make('div', `stepper ${kind === 'damage' ? 'cd-entry' : 'counter-entry'}`);
  element.dataset.id = entry.id;
  if (!readOnly) element.setAttribute('role', 'group');
  const name = make('span', 'stepper-name');
  const count = make('strong', 'stepper-count');
  const lethal = make('span', 'stepper-lethal', 'lethal');
  let current = entry;
  const buttons = readOnly ? [] : steps.map((step) => {
    const button = make('button', 'secondary', signed(step));
    button.type = 'button';
    button.dataset.step = String(step);
    button.addEventListener('click', () => onChange(current, step));
    return button;
  });
  // minus buttons, then the count, then plus buttons: -5 -1 [7] +1 +5
  element.append(name, ...buttons.filter((b) => Number(b.dataset.step) < 0), count, ...buttons.filter((b) => Number(b.dataset.step) > 0), lethal);

  function update(next) {
    current = next;
    element.dataset.id = next.id;
    // On its own (another player's panel, or one day inside the panel of the player it came from) an entry has to say what it is.
    name.textContent = readOnly && kind === 'damage' ? `Commander damage from ${next.label}` : next.label;
    count.textContent = next.count.toLocaleString('en-US');
    element.classList.toggle('lethal', next.lethal);
    lethal.hidden = !next.lethal;
    element.title = next.lethal ? `${next.label}: ${next.lethalAt} or more is lethal` : '';
    if (readOnly) {
      element.hidden = next.count === 0;
    } else {
      element.setAttribute('aria-label', kind === 'damage' ? `Commander damage from ${next.label}` : next.label);
      for (const button of buttons) {
        const step = Number(button.dataset.step);
        const word = kind === 'damage' ? `commander damage from ${next.label}` : `${next.label.toLowerCase()} ${Math.abs(step) === 1 ? 'counter' : 'counters'}`;
        button.setAttribute('aria-label', `${step > 0 ? 'Add' : 'Remove'} ${Math.abs(step)} ${word}`);
        button.disabled = step < 0 && next.count === 0; // nothing to take off
      }
    }
  }
  update(entry);
  return { element, update };
}

// ONE counter (poison, energy or experience): entry from counterEntry() in shared/player-counters.mjs.
export const counterNode = (entry, options = {}) => stepperNode(entry, { kind: 'counter', steps: COUNTER_STEPS, ...options });
// ONE player's commander damage: entry from commanderDamageEntry(). The unit to put anywhere (see the top of this file).
export const commanderDamageNode = (entry, options = {}) => stepperNode(entry, { kind: 'damage', steps: DAMAGE_STEPS, ...options });

// A block that holds a list of entries, each as its own node, kept and updated in place (a node is only made the first time an entry is
// seen, so a button that was pressed keeps its keyboard focus while the numbers change). Returns { update(entries) -> whether anything is
// showing, element }.
function mountList(container, makeNode, options) {
  const nodes = new Map();
  return {
    element: container,
    update(entries) {
      const wanted = entries.map((entry) => {
        let node = nodes.get(entry.id);
        if (!node) { node = makeNode(entry, options); nodes.set(entry.id, node); }
        node.update(entry);
        return node.element;
      });
      const ids = new Set(entries.map((entry) => entry.id));
      for (const id of [...nodes.keys()]) if (!ids.has(id)) nodes.delete(id); // a player who left
      const same = wanted.length === container.children.length && wanted.every((element, index) => container.children[index] === element);
      if (!same) container.replaceChildren(...wanted);
      return wanted.some((element) => !element.hidden);
    },
  };
}

// The three player counters in a block. options: { readOnly, onChange(entry, step) }.
export const mountPlayerCounters = (container, options = {}) => mountList(container, counterNode, options);
// The commander damage of every player in a block, one node per player. options: { readOnly, onChange(entry, step) }.
export const mountCommanderDamage = (container, options = {}) => mountList(container, commanderDamageNode, options);
