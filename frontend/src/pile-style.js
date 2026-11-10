// The "Piles" choice (diagonal or horizontal, shared/pile-style.mjs) for the table pages: puts the saved style on the body (the style sheet draws the copies of a pile by it) and draws a
// small select, remembered in this browser. Changing it changes only how piles look.
import { makeSafeStore } from './safe-store.js';
import { PILE_STYLE_KEY, PILE_STYLES, PILE_STYLE_LABELS, readPileStyle, stepOutFor } from '../../shared/pile-style.mjs';
import { setTapStepOut } from '../../shared/zones.mjs';

const store = makeSafeStore();

export function applyPileStyle(style = readPileStyle(store.get(PILE_STYLE_KEY))) {
  document.body.dataset.pileStyle = style;
  setTapStepOut(stepOutFor(style)); // tapped cards step out of a pile to the right (diagonal) or up (horizontal)
  return style;
}

// Draws the select into `host` (an empty element) and applies the saved style now.
export function mountPileStyle(host) {
  const style = applyPileStyle();
  if (!host) return;
  const label = document.createElement('label');
  const select = document.createElement('select');
  select.id = 'pile-style';
  for (const name of PILE_STYLES) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = PILE_STYLE_LABELS[name];
    option.selected = name === style;
    select.append(option);
  }
  select.addEventListener('change', () => {
    const chosen = readPileStyle(select.value);
    store.set(PILE_STYLE_KEY, chosen);
    applyPileStyle(chosen);
  });
  label.append('Piles ', select);
  host.replaceChildren(label);
}
