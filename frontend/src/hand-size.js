// The "Hand card size" slider in Settings (2026-11-26 feedback): 70% to 150%, kept in this browser. The rules are in shared/hand-size.mjs.
// It sets --hand-scale on <body>; the style sheet multiplies a hand card's height by it, and the hand is laid out again through onChange().
import { makeSafeStore } from './safe-store.js';
import { SIZE_KEY, MIN_SIZE, MAX_SIZE, SIZE_STEP, readSize, writeSize, sizeScale, sizeWords } from '../../shared/hand-size.mjs';

const store = makeSafeStore();
let size = readSize(store.get(SIZE_KEY));
const apply = () => document.body.style.setProperty('--hand-scale', String(sizeScale(size)));
apply();

// Appends the slider to `host` (after anything already there, such as the Resting hand slider).
export function mountHandSizeSetting(host, { onChange = () => {} } = {}) {
  if (!host) return;
  const group = document.createElement('div');
  group.className = 'sound-settings hand-size-settings';
  const label = document.createElement('label');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'hand-size';
  slider.min = String(MIN_SIZE);
  slider.max = String(MAX_SIZE);
  slider.step = String(SIZE_STEP);
  slider.value = String(size);
  slider.setAttribute('aria-label', 'Hand card size');
  const words = document.createElement('output');
  words.id = 'hand-size-words';
  words.htmlFor = 'hand-size';
  words.textContent = sizeWords(size);
  label.append('Card size ', slider, ' ', words);
  slider.addEventListener('input', () => {
    size = readSize(slider.value);
    words.textContent = sizeWords(size);
    store.set(SIZE_KEY, writeSize(size));
    apply();
    onChange();
  });
  group.append(label);
  host.append(group);
}
