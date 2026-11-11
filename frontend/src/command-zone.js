// The command zone: two slots, each with its own dotted outline, for a commander and its partner (or a second commander). A slot holds its commander's card while it is in the command
// zone and stays empty (with the outline) while the commander is out, so you can see where it goes back to; under each slot is the commander tax counter. What each slot shows is decided
// in shared/commander-zone.mjs; this only draws it. Text only, and the elements are kept and updated in place so a pressed button keeps its keyboard focus.
import { taxEntries, TAX_PER_CAST } from '../../shared/commander-zone.mjs';

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

// root: the element that holds the two slots (it is emptied and filled once). place(container, cards): the page's way of drawing card buttons. onTax(uid, delta): one cast more or less.
// showTax: whether the tax counter is shown at all (the live table hides it until the database accepts it).
export function mountCommandZone({ root, place, onTax, showTax = true }) {
  const slots = [1, 2].map((slot) => {
    const element = make('div', 'cmd-slot');
    element.dataset.slot = String(slot);
    const cards = make('div', 'slot-cards');
    const tax = make('div', 'tax');
    // The tax is just its number, and the number is the button: a click adds a cast, a right-click takes one back.
    const words = make('button', 'tax-words');
    words.type = 'button';
    tax.append(words);
    tax.hidden = !showTax;
    element.append(cards, tax);
    let uid = null;
    words.addEventListener('click', () => { if (uid) onTax(uid, 1); });
    words.addEventListener('contextmenu', (event) => { event.preventDefault(); if (uid) onTax(uid, -1); });
    return { element, cards, tax, words, setUid: (next) => { uid = next; } };
  });
  root.replaceChildren(...slots.map((slot) => slot.element));

  // game: the player's game (or null). The command zone is hidden when there is no commander and nothing in it (a Standard game).
  function update(game) {
    const entries = game ? taxEntries(game) : [];
    const inZone = game ? game.zones.command : [];
    const extras = inZone.filter((card) => !entries.some((entry) => entry.uid === card.uid)); // anything else a player put in the command zone (an emblem, say) stays visible
    root.parentElement.hidden = entries.length === 0 && extras.length === 0;
    slots.forEach((slot, index) => {
      const entry = entries[index] ?? null;
      slot.setUid(entry ? entry.uid : null);
      slot.element.classList.toggle('empty-slot', !entry);
      slot.element.classList.toggle('away', Boolean(entry) && !entry.inZone);
      slot.element.dataset.commander = entry ? entry.name : '';
      const cards = [...(entry && entry.inZone ? inZone.filter((card) => card.uid === entry.uid) : []), ...(index === 0 ? extras : [])];
      place(slot.cards, cards);
      slot.element.title = entry && !entry.inZone ? `${entry.name} is on the ${entry.zone === 'battlefield' ? 'battlefield' : entry.zone}.` : '';
      slot.words.textContent = entry ? String(entry.tax) : '';
      slot.words.disabled = !entry;
      slot.words.title = entry ? `${entry.name}: commander tax ${entry.tax}, cast ${entry.casts} ${entry.casts === 1 ? 'time' : 'times'} from the command zone. Click to add a cast (each makes the next one cost ${TAX_PER_CAST} more); right-click to take one back.` : '';
      slot.words.setAttribute('aria-label', entry ? `${entry.name}: commander tax ${entry.tax}. Click to add a cast, right-click to take one back.` : 'No commander');
      slot.tax.hidden = !showTax || !entry;
    });
  }
  return { update };
}
