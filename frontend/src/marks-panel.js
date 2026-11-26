// The controls for counters and the power/toughness change of one card on the battlefield: a typed amount, a kind of counter
// with Add and Remove, and the change for power, toughness or both. Used by the solo table and the live table.
// The panel is built once and kept (so the typed amount and the keyboard focus stay put after a click); `target()` is asked at
// click time for the selected card, { uid, name }, and `onChange(change, message)` runs change(game) -> game on the page's game.
// The rules for counters are in shared/zones.mjs; a refused change comes back as the page's own error message.
import { COUNTER_KINDS, COUNTER_WORDS, NUMBER_LIMIT, changeCounter, changeModifier, resetModifier } from '../../shared/zones.mjs';
import { parseAmount } from '../../shared/marks.mjs';

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

export function mountMarksPanel(container, { target, onChange, say }) {
  const amountInput = make('input');
  amountInput.id = 'marks-amount';
  amountInput.type = 'text';
  amountInput.inputMode = 'numeric';
  amountInput.autocomplete = 'off';
  amountInput.maxLength = 20;
  amountInput.value = '1';
  const amountLabel = make('label', 'marks-amount', 'Amount ');
  amountLabel.htmlFor = 'marks-amount';
  amountLabel.append(amountInput);

  const kindSelect = make('select');
  kindSelect.setAttribute('aria-label', 'Kind of counter');
  for (const kind of COUNTER_KINDS) kindSelect.append(Object.assign(make('option', '', COUNTER_WORDS[kind]), { value: kind }));

  // Reads the amount and the selected card; says why and returns null when either is no good.
  function read() {
    const card = target();
    if (!card) { say('Select a card on the battlefield first.', true); return null; }
    const amount = parseAmount(amountInput.value);
    if (amount === null) { say(`The amount must be a whole number from 1 to ${NUMBER_LIMIT.toLocaleString('en-US')}.`, true); return null; }
    return { card, amount };
  }
  const number = (value) => value.toLocaleString('en-US');

  // A button whose words for a screen reader (and the tests) are `label`, showing `shown` (a short "+" or "Add") when given.
  function button(label, className, run, shown = label) {
    const element = make('button', className, shown);
    element.type = 'button';
    if (shown !== label) element.setAttribute('aria-label', label);
    element.addEventListener('click', run);
    return element;
  }
  const counterButton = (label, sign, shown) => button(label, sign > 0 ? 'marks-add' : 'secondary', () => {
    const got = read();
    if (!got) return;
    const kind = kindSelect.value;
    const word = COUNTER_WORDS[kind];
    onChange((game) => changeCounter(game, got.card.uid, kind, sign * got.amount), `${sign > 0 ? 'Added' : 'Removed'} ${number(got.amount)} ${word} counter${got.amount === 1 ? '' : 's'} ${sign > 0 ? 'to' : 'from'} ${got.card.name}.`);
  }, shown);
  const changeButton = (label, parts, sign) => button(label, 'secondary marks-step', () => {
    const got = read();
    if (!got) return;
    onChange((game) => parts.reduce((next, part) => changeModifier(next, got.card.uid, part, sign * got.amount), game), `${got.card.name}: ${parts.length === 2 ? 'power and toughness' : parts[0]} ${sign > 0 ? 'up' : 'down'} by ${number(got.amount)}.`);
  }, sign > 0 ? '+' : '−');

  // (the redesign, step 5: labeled sections instead of a loose row of buttons)
  const head = make('div', 'marks-head');
  head.append(make('span', 'marks-title', 'Modify'));
  const label = (words) => make('p', 'marks-label', words);

  const counters = make('div', 'marks-line');
  counters.setAttribute('role', 'group');
  counters.setAttribute('aria-label', 'Counters on the selected card');
  counters.append(kindSelect, counterButton('Add counters', 1, 'Add'), counterButton('Remove counters', -1, 'Remove'));

  const changes = make('div', 'marks-pt');
  changes.setAttribute('role', 'group');
  changes.setAttribute('aria-label', 'Power and toughness change of the selected card (not counters)');
  for (const [words, parts] of [['Power', ['power']], ['Toughness', ['toughness']], ['Both', ['power', 'toughness']]]) {
    changes.append(make('span', 'marks-pt-name', words), changeButton(`${words} -`, parts, -1), changeButton(`${words} +`, parts, 1));
  }
  const reset = button('Reset change', 'secondary marks-reset', () => {
    const card = target();
    if (!card) { say('Select a card on the battlefield first.', true); return; }
    onChange((game) => resetModifier(game, card.uid), `Reset the power and toughness change of ${card.name} (counters stay).`);
  }, 'Reset');

  const counterPart = make('div', 'marks-section'); counterPart.append(label('Counters'), counters);
  const ptPart = make('div', 'marks-section'); ptPart.append(label('Power and toughness'), changes, reset);
  container.replaceChildren(head, amountLabel, counterPart, ptPart);
}
