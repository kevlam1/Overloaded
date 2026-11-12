// The "Piles" choices (diagonal or horizontal, shared/pile-style.mjs) for the table pages: one for piles of UNTAPPED cards and one, separately, for piles of TAPPED cards (Kevin, 2026-11-12). They put the
// saved styles on the body (the style sheet draws the copies of a pile by them) and draw a small select each, remembered in this browser. Changing them changes only how piles look.
import { makeSafeStore } from './safe-store.js';
import { PILE_STYLE_KEY, PILE_STYLES, PILE_STYLE_LABELS, readPileStyle, TAPPED_PILE_STYLE_KEY, TAPPED_PILE_STYLES, TAPPED_PILE_STYLE_LABELS, readTappedPileStyle, stepOutFor } from '../../shared/pile-style.mjs';
import { setTapStepOut } from '../../shared/zones.mjs';

const store = makeSafeStore();

export function applyPileStyle(style = readPileStyle(store.get(PILE_STYLE_KEY)), tappedStyle = readTappedPileStyle(store.get(TAPPED_PILE_STYLE_KEY))) {
  document.body.dataset.pileStyle = style;
  document.body.dataset.tappedPileStyle = tappedStyle;
  setTapStepOut(stepOutFor(style)); // tapped cards step out of a pile to the right
  return { style, tappedStyle };
}

function choice({ id, label, current, onChange, styles = PILE_STYLES, labels = PILE_STYLE_LABELS }) {
  const wrap = document.createElement('label');
  const select = document.createElement('select');
  select.id = id;
  for (const name of styles) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = labels[name];
    option.selected = name === current;
    select.append(option);
  }
  select.addEventListener('change', () => onChange(select.value));
  wrap.append(`${label} `, select);
  return wrap;
}

// Draws the two selects into `host` (an empty element) and applies the saved styles now.
export function mountPileStyle(host) {
  const { style, tappedStyle } = applyPileStyle();
  if (!host) return;
  host.replaceChildren(
    choice({ id: 'pile-style', label: 'Piles of untapped cards', current: style, onChange: (value) => { const chosen = readPileStyle(value); store.set(PILE_STYLE_KEY, chosen); applyPileStyle(chosen, readTappedPileStyle(store.get(TAPPED_PILE_STYLE_KEY))); } }),
    choice({ id: 'pile-style-tapped', label: 'Piles of tapped cards', current: tappedStyle, styles: TAPPED_PILE_STYLES, labels: TAPPED_PILE_STYLE_LABELS, onChange: (value) => { const chosen = readTappedPileStyle(value); store.set(TAPPED_PILE_STYLE_KEY, chosen); applyPileStyle(readPileStyle(store.get(PILE_STYLE_KEY)), chosen); } }),
  );
}
