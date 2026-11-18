// The "resting hand" setting (Kevin, 2026-11-17): how much of a card shows when the hand is lowered and the pointer is away. A slider in Settings, from 20% to 100% of a card showing (50% to start),
// kept in this browser. The rules are in shared/hand-rest.mjs. restHidden() is what the hand asks for each time it is laid out: the share of a card's height that is below the bottom edge of the window.
import { makeSafeStore } from './safe-store.js';
import { REST_KEY, MIN_REST_VISIBLE, MAX_REST_VISIBLE, REST_STEP, readRestVisible, writeRestVisible, restHiddenShare, restWords } from '../../shared/hand-rest.mjs';

const store = makeSafeStore();
let visible = readRestVisible(store.get(REST_KEY));

export const restHidden = () => restHiddenShare(visible);

// Draws the slider into `host` (an empty element). onChange() is called after each change, so the hand can be laid out again at once. The slider is drawn like the Sound one (the style sheet
// gives .sound-settings sliders explicit colours, because the browser's own slider looked different in every browser).
export function mountHandRestSetting(host, { onChange = () => {} } = {}) {
  if (!host) return;
  const group = document.createElement('div');
  group.className = 'sound-settings hand-rest-settings';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Resting hand');

  const label = document.createElement('label');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'hand-rest';
  slider.min = String(MIN_REST_VISIBLE);
  slider.max = String(MAX_REST_VISIBLE);
  slider.step = String(REST_STEP);
  slider.value = String(visible);
  slider.setAttribute('aria-label', 'How much of a card shows when the hand is resting');
  const words = document.createElement('output');
  words.id = 'hand-rest-words';
  words.htmlFor = 'hand-rest';
  words.textContent = restWords(visible);
  label.append('Resting hand ', slider, ' ', words);

  slider.addEventListener('input', () => {
    visible = readRestVisible(slider.value);
    words.textContent = restWords(visible);
    store.set(REST_KEY, writeRestVisible(visible));
    onChange();
  });
  group.append(label);
  host.replaceChildren(group);
}
