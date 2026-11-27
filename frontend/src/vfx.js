// Visual effects, drawn with anime.js (MIT, added 2026-11-26 at Kevin's request): the commander burst and the hop of a sorted hand. The settings (on or off, which commander
// sound) are kept in this browser (shared/effects.mjs). Under prefers-reduced-motion nothing moves: the commander sound still plays, the card simply appears.
// Every effect is drawn on its own layer over the page or on the separate `scale` and `translate` properties of a card's parts, never on a card's `transform`
// (the hand fan and a tapped card's turn live there) and never on a battlefield card's `translate` (a pile's offsets live there), and every style it sets is removed after.
import { animate } from 'animejs';
import { makeSafeStore } from './safe-store.js';
import { play } from './sound.js';
import { EFFECTS_KEY, COMMANDER_SOUNDS, readEffects, writeEffects, commanderSoundFor } from '../../shared/effects.mjs';

const store = makeSafeStore();
let settings = readEffects(store.get(EFFECTS_KEY));
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
const moving = () => settings.on && !reducedMotion();

let layer = null;
function effectLayer() {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.className = 'vfx-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.append(layer);
  }
  return layer;
}
// (a style key that starts with -- is a CSS variable: setProperty, since assigning it as a field does nothing)
const piece = (className, style = {}) => {
  const node = document.createElement('div');
  node.className = className;
  for (const [key, value] of Object.entries(style)) { if (key.startsWith('--')) node.style.setProperty(key, value); else node.style[key] = value; }
  effectLayer().append(node);
  return node;
};

// A commander came onto the battlefield (mine or another player's): its sound, and around its card two rings, a glow the shape of the card, sparks and its name.
// `card` is the card's element (or null when it cannot be seen: then only the sound), `color` the player's color, `name` the card's name.
export function commanderBurst(card, { color = 'var(--gold)', name = '' } = {}) {
  const sound = settings.on ? commanderSoundFor(settings) : null;
  if (sound) play(sound);
  if (!moving() || !card?.isConnected) return;
  const box = card.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) return;
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const size = Math.max(box.width, box.height);
  const made = [];
  const keep = (node) => { made.push(node); return node; };

  // the card lands: a little larger, then its size (the `scale` property only)
  animate(card, { scale: [1.28, 1], duration: 620, ease: 'outBack(2.2)', onComplete: () => { card.style.removeProperty('scale'); } });
  // the glow: a frame the shape of the card that flares and fades
  const glow = keep(piece('vfx-glow', { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, '--vfx-color': color }));
  animate(glow, { opacity: [0, 1, 0], scale: [1.35, 1, 1.06], duration: 900, ease: 'outQuad' });
  // two rings that spread out from the middle
  for (const [delay, grow] of [[0, 3.2], [140, 2.4]]) {
    const ring = keep(piece('vfx-ring', { left: `${x - size / 2}px`, top: `${y - size / 2}px`, width: `${size}px`, height: `${size}px`, '--vfx-color': color }));
    animate(ring, { scale: [0.3, grow], opacity: [0.95, 0], borderWidth: ['6px', '1px'], duration: 820, delay, ease: 'outExpo' });
  }
  // sparks: thin streaks that fly out in every direction
  const count = 18;
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * 360 + Math.random() * 12;
    const spark = keep(piece('vfx-spark', { left: `${x}px`, top: `${y}px`, rotate: `${angle}deg`, '--vfx-color': color }));
    const reach = size * (0.55 + Math.random() * 0.45);
    // (the CSS `translate` property moves on the screen, not along the turned piece, so the end point is worked out from the angle)
    const to = `${Math.round(Math.cos(angle * Math.PI / 180) * reach)}px ${Math.round(Math.sin(angle * Math.PI / 180) * reach)}px`;
    animate(spark, { translate: ['0px 0px', to], scale: [1, 0.2], opacity: [1, 0], duration: 520 + Math.random() * 260, delay: Math.random() * 120, ease: 'outCubic' });
  }
  // the name, rising above the card
  if (name) {
    const label = keep(piece('vfx-name', { left: `${x}px`, top: `${box.top}px`, '--vfx-color': color }));
    label.textContent = name;
    // kept inside the window: never past the left or right edge, and under the card when the card is at the very top
    const half = label.offsetWidth / 2;
    label.style.left = `${Math.max(half + 8, Math.min(x, window.innerWidth - half - 8))}px`;
    const below = box.top < 56;
    if (below) label.style.top = `${box.bottom + 6}px`;
    animate(label, { opacity: [0, 1, 1, 0], translate: below ? ['-50% 0px', '-50% 14px'] : ['-50% 0px', '-50% -34px'], duration: 1500, ease: 'outQuad' });
  }
  setTimeout(() => { for (const node of made) node.remove(); }, 1700); // (one timer for all of it: an effect cut short by a page change leaves nothing behind)
}

// The hand was sorted: each card's picture and cost hop up and back, one card after another from the left, while the cards glide to their new places.
export function sortHop(cards) {
  if (!moving()) return;
  const parts = [];
  const order = new Map();
  cards.forEach((card, index) => { for (const part of card.querySelectorAll(':scope > .face, :scope > .hand-cost')) { parts.push(part); order.set(part, index); } });
  if (!parts.length) return;
  animate(parts, {
    translate: [{ to: '0px -14px', duration: 150, ease: 'outQuad' }, { to: '0px 0px', duration: 260, ease: 'outBounce' }],
    delay: (part) => order.get(part) * 35,
    onComplete: () => { for (const part of parts) part.style.removeProperty('translate'); },
  });
}

// Settings: an Effects switch and the commander sound, added to the end of `host` (Settings > General). Changing them makes no sound and no effect.
export function mountEffectSettings(host) {
  if (!host) return;
  const save = () => store.set(EFFECTS_KEY, writeEffects(settings));
  const onLabel = document.createElement('label');
  const on = Object.assign(document.createElement('input'), { type: 'checkbox', id: 'effects-on', checked: settings.on });
  onLabel.append(on, ' Effects');
  const soundLabel = document.createElement('label');
  const sound = Object.assign(document.createElement('select'), { id: 'commander-sound' });
  for (const [value, words] of Object.entries(COMMANDER_SOUNDS)) sound.append(Object.assign(document.createElement('option'), { value, textContent: words, selected: value === settings.commanderSound }));
  sound.disabled = !settings.on;
  soundLabel.append('Commander sound ', sound);
  on.addEventListener('change', () => { settings = { ...settings, on: on.checked }; sound.disabled = !on.checked; save(); });
  sound.addEventListener('change', () => { settings = { ...settings, commanderSound: sound.value }; save(); });
  host.append(onLabel, soundLabel);
}
