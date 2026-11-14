// Puts your hand in a fan (shared/hand-layout.mjs works out where each card goes): the cards sit next to each other, turned a little like an arc, and each shows its mana cost in a
// row of symbols above it. The buttons are the page's own card buttons (src/card-nodes.js).
//
// MOVEMENT (Kevin, 2026-11-11, after studying how a well known card game's hand feels): a card does not jump or slide by a style sheet transition. Each card has a PLACE it should be at (from
// the layout) and a position it IS at, and a small loop (one requestAnimationFrame per frame while anything moves) closes the distance by the same fraction of what is left every
// instant, whatever the speed of the screen, so everything eases out the same way and a change of target in the middle of a move just bends the path (nothing restarts, so nothing jerks).
// The numbers are put on the card as three style variables (--hx across, --hy down, --ha turned) that style.css turns into its transform. Under prefers-reduced-motion cards go straight to
// their places.
// While a card of the hand is carried the places do NOT change (shared/hand-layout.mjs): the carried card is over one of them (the hole), the other cards take the rest in order, and the
// ones beside the hole lean away. A card let go starts from where the carried picture was (noteDrop) and eases into its place, so it does not fly in from where it was picked up.
//
// The hand sits LOWERED: a quarter of the cards' height is below the bottom edge of the window, so the board is easier to see. When the pointer is in the area of the hand (inside the width
// the cards cover, from the top of the visible cards down) the cards rise by that quarter, and when the pointer leaves, also while a card is being carried out of it, they go down again.
// The card under the pointer is shown lifted and straight by a COPY of it drawn on top in a layer of its own (.hand-lift-layer) that never takes the mouse; the real cards keep their places and
// their stacking, so the card that answers to the pointer is always the one you can see there (a lifted card that kept a higher stacking number kept the pointer over its neighbours).
// Plain DOM, no dependencies besides the layout and the mana symbols.
import { handLayout, handLayoutSelected, layoutAround, holeAt } from '../../shared/hand-layout.mjs';
import { manaNode } from './mana-pips.js';

export const LEAVE_DELAY = 150; // ms the pointer must stay out of the hand before it lowers, or before a carried card is taken to be away from it (coming back is at once): the edge of the area does not flicker
export const EASE_RATE = 24; // per second: every instant the card closes this share of the distance (about 90% in 100 ms)
const REST = { distance: 0.05, angle: 0.02, scale: 0.002 };
const LIFT_OUT = 0.45; // a clicked card comes up by this fraction of its height
const SELECTED_SCALE = 1.1; // closer than this to its place a card is at it

const round2 = (value) => Math.round(value * 100) / 100;
const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// container: the #hand element. costOf(uid): the mana cost text of the hand card with this uid ('' for none, a land has none).
// Returns { arrange(), carry(info | null), holeFor(uid, x, external), noteDrop(uid, from), zone(), over(x, y), isRaised() }.
export function mountHand({ container, costOf = () => '' }) {
  // px kept free at each side for the turn of the outer cards: they swing out by about a fifth of a card's height, so it grows with the cards (a fixed 14 px clipped the first card once the hand was 50% larger)
  const margin = () => Math.max(14, Math.round((container.querySelector(':scope > .card')?.offsetHeight ?? 0) * 0.2));
  let carried = null; // the uid of the card being carried (it is over `hole` and is left out of the places of the others)
  let carriedExternal = false; // the carried card is not one of the hand (it comes from the battlefield or a pile): the hand opens a place for it, and nothing is left out
  let hole = null; // the place (0 to the number of cards - 1) the carried card is over
  let lastCarry = null; // { uid, hole } of the carry that has just ended, so a let-go lands where it was last shown
  let raised = false; // the pointer is in the area of the hand: the cards are up
  let away = false; // the carried card has been away from the hand for a moment: the others close up
  let lowerTimer = null;
  let awayTimer = null;
  let lift = null; // { uid, card, node }: the card shown lifted under the pointer and its copy
  let generation = 0; // counts the layouts, to see which cards were not in the last one (a card that has been away is placed without sliding)
  let pointer = null; // where the pointer last was ({ x, y }), to lift the card under it again after the cards have been laid out anew
  const motion = new WeakMap(); // card button -> { x, y, a, s, tx, ty, ta, ts, gen }: where it is and where it should be (s: its size, 1 for a card as it lies in the hand)
  const pending = new Map(); // uid -> { x, y, angle }: where the picture of a card just let go was (viewport pixels of its top left corner, degrees)
  let frame = 0;
  let lastTime = 0;
  const section = container.parentElement;
  const layer = document.createElement('div');
  layer.className = 'hand-lift-layer';
  layer.setAttribute('aria-hidden', 'true');
  section.append(layer);

  const buttons = () => [...container.querySelectorAll(':scope > .card')];

  // Under the middle of the hand, while the cards are up: how many cards there are ("Hand: 7", nothing for an empty hand), and room for the sort buttons the page puts in it (Kevin, 2026-11-13).
  const bar = document.createElement('div');
  bar.className = 'hand-bar';
  bar.hidden = true;
  const countNote = document.createElement('span');
  countNote.className = 'hand-count';
  bar.append(countNote);
  section.append(bar);
  function updateBar() {
    const total = buttons().length;
    const show = raised && total > 0;
    bar.hidden = !show;
    if (!show) return;
    countNote.textContent = `Hand: ${total}`;
    const z = zone();
    bar.style.left = `${(z.left + z.right) / 2 - section.getBoundingClientRect().left}px`;
  }

  // An empty hand has no cards to start the drop area at, so it starts under the battlefield (the area would otherwise reach up over it): never higher than the bottom of the battlefield.
  function emptyFloor() {
    if (buttons().length > 0) return 0;
    const field = document.getElementById('battlefield');
    return field ? field.getBoundingClientRect().bottom : 0;
  }

  function showCost(button) {
    const cost = String(costOf(button.dataset.uid) ?? '');
    let holder = button.querySelector(':scope > .hand-cost');
    if (!cost) { holder?.remove(); return; }
    if (holder && holder.dataset.cost === cost) return;
    holder?.remove();
    holder = document.createElement('span');
    holder.className = 'hand-cost';
    holder.dataset.cost = cost;
    holder.setAttribute('aria-hidden', 'true'); // the card's own label is what a screen reader says
    holder.append(manaNode(cost));
    button.append(holder);
  }

  // A card of the hand is drawn large, and the small picture (146 by 204 pixels) is blurry at that size: the picture of a card in the hand is the NORMAL size (488 by 680, about 70 KB, the same
  // address with normal in place of small). The card keeps it when it is played (it has been loaded, and is sharper). A picture that cannot be loaded falls back as before (card-nodes.js).
  function sharpen(button) {
    const picture = button.querySelector(':scope > .face img');
    if (!picture || picture.dataset.sharp === '1') return;
    const src = picture.getAttribute('src') ?? '';
    if (!src.includes('/small/')) return;
    picture.dataset.sharp = '1';
    picture.src = src.replace('/small/', '/normal/');
  }

  // ---- movement ----
  function paint(button, m) {
    button.style.setProperty('--hx', `${round2(m.x)}px`);
    button.style.setProperty('--hy', `${round2(m.y)}px`);
    button.style.setProperty('--ha', `${round2(m.a)}deg`);
    button.style.setProperty('--hs', String(Math.round(m.s * 1000) / 1000));
  }
  function tick(now) {
    frame = 0;
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    const share = 1 - Math.exp(-EASE_RATE * dt);
    let moving = false;
    for (const button of buttons()) {
      const m = motion.get(button);
      if (!m) continue;
      if (Math.abs(m.tx - m.x) < REST.distance && Math.abs(m.ty - m.y) < REST.distance && Math.abs(m.ta - m.a) < REST.angle && Math.abs(m.ts - m.s) < REST.scale) {
        if (m.x !== m.tx || m.y !== m.ty || m.a !== m.ta || m.s !== m.ts) { m.x = m.tx; m.y = m.ty; m.a = m.ta; m.s = m.ts; paint(button, m); }
        continue;
      }
      m.x += (m.tx - m.x) * share;
      m.y += (m.ty - m.y) * share;
      m.a += (m.ta - m.a) * share;
      m.s += (m.ts - m.s) * share;
      paint(button, m);
      moving = true;
    }
    if (moving) frame = requestAnimationFrame(tick);
  }
  function startMoving() {
    if (frame || typeof requestAnimationFrame !== 'function') return;
    lastTime = typeof performance !== 'undefined' ? performance.now() : 0;
    frame = requestAnimationFrame(tick);
  }

  // How far a lowered hand is below its raised place: a quarter of the height of a card.
  // (plus the gap the cards keep above the bottom of the box, so that exactly a quarter of a card is below the bottom edge of the window)
  const dropDistance = () => {
    const card = container.querySelector(':scope > .card');
    if (!card) return 0;
    const inset = parseFloat(getComputedStyle(card).bottom) || 0;
    return Math.round(card.offsetHeight * 0.25 + inset);
  };

  // Where the card picture let go at `from` (its top left corner in viewport pixels, its turn in degrees) is, as the numbers of a card of the hand: so that the card starts where the picture was.
  function startFromPicture(button, from) {
    const box = container.getBoundingClientRect();
    const height = button.offsetHeight;
    const inset = parseFloat(getComputedStyle(button).bottom) || 0;
    const baseY = container.clientHeight - inset - height; // where the card sits with no numbers on it, from the top of the box
    const angle = (from.angle * Math.PI) / 180;
    // the card turns about a point 1.4 heights down from its top, so its middle moves by 0.9 height times sin and cos of the turn
    return { x: from.x - box.left - 0.9 * height * Math.sin(angle), y: from.y - box.top - baseY - 0.9 * height + 0.9 * height * Math.cos(angle), a: from.angle };
  }

  function arrange() {
    const all = buttons();
    if (all.length === 0) { clearLift(); setZoneVars(); return; }
    generation += 1;
    const sample = all[0];
    const cardWidth = sample.offsetWidth;
    const cardHeight = sample.offsetHeight;
    const width = Math.max(0, container.clientWidth - 2 * margin());
    const shiftX = margin(); // the layout works in the width left after the margins
    const drop = raised ? 0 : dropDistance();
    const carriedIndex = carried ? all.findIndex((button) => button.dataset.uid === carried) : -1;
    let row = all;
    let spots;
    if (carriedIndex >= 0 && away) {
      row = all.filter((_, index) => index !== carriedIndex);
      spots = handLayout({ count: all.length - 1, width, cardWidth, cardHeight }).slots; // the card is out of the hand: the others close up
    } else if (carriedIndex >= 0) {
      row = all.filter((_, index) => index !== carriedIndex);
      spots = layoutAround({ total: all.length, width, cardWidth, cardHeight, hole: hole ?? carriedIndex }).slots;
    } else if (carried && carriedExternal && !away && hole !== null) {
      spots = layoutAround({ total: all.length + 1, width, cardWidth, cardHeight, hole }).slots; // a place is open for the card that is carried over the hand
    } else {
      spots = handLayout({ count: all.length, width, cardWidth, cardHeight }).slots;
    }
    // A card of the hand that has been clicked (it is the selected card) comes up to be read and each side moves aside to make room. It does not go down with a lowered hand.
    const selectedIndex = carried ? -1 : row.findIndex((button) => button.classList.contains('selected'));
    if (selectedIndex >= 0) spots = handLayoutSelected({ count: row.length, width, cardWidth, cardHeight, index: selectedIndex }).slots; // the whole of each side moves aside
    const snap = prefersReducedMotion();
    let moving = false;
    row.forEach((button, index) => {
      const spot = spots[index];
      let m = motion.get(button);
      const fresh = !m || m.gen !== generation - 1; // never placed, or it has been away from the hand: it goes straight to its place, with no slide in from the corner
      if (!m) { m = { x: 0, y: 0, a: 0, s: 1, tx: 0, ty: 0, ta: 0, ts: 1, gen: 0 }; motion.set(button, m); }
      const comesUp = index === selectedIndex;
      m.tx = spot.x + shiftX;
      m.ty = comesUp ? spot.y - Math.round(cardHeight * LIFT_OUT) : spot.y + drop;
      m.ta = spot.angle;
      m.ts = comesUp ? SELECTED_SCALE : 1;
      const from = pending.get(button.dataset.uid);
      if (from) {
        Object.assign(m, startFromPicture(button, from)); // a card let go starts where its picture was
        pending.delete(button.dataset.uid);
      } else if (fresh) {
        m.x = m.tx; m.y = m.ty; m.a = m.ta; m.s = m.ts;
      }
      if (snap) { m.x = m.tx; m.y = m.ty; m.a = m.ta; m.s = m.ts; }
      m.gen = generation;
      if (m.x !== m.tx || m.y !== m.ty || m.a !== m.ta || m.s !== m.ts) moving = true;
      paint(button, m);
      button.style.setProperty('--hz', String(comesUp ? row.length + 5 : index + 1)); // a variable, not z-index: the same button is reused on the battlefield, where an inline z-index would override its stacking
    });
    if (carriedIndex >= 0) { const m = motion.get(all[carriedIndex]); if (m) m.gen = generation; } // (it is left out of the places while it is carried, but it has not been away)
    for (const button of all) { showCost(button); sharpen(button); }
    // the dashed outline shown while a card is carried over the hand (style.css) covers the same width as the zone
    setZoneVars();
    updateBar();
    syncLift();
    if (moving) startMoving();
  }

  // ---- the card under the pointer, lifted ----
  // The card under the pointer: of the cards at that point, the one that is on top as they were placed (the highest --hz), not the one that is lifted.
  function cardAt(x, y) {
    let best = null;
    let bestZ = -1;
    for (const el of document.elementsFromPoint(x, y)) {
      const card = el.closest?.('.card');
      if (!card || card.parentElement !== container) continue;
      const z = Number(card.style.getPropertyValue('--hz')) || 0;
      if (z > bestZ) { best = card; bestZ = z; }
    }
    return best;
  }
  function clearLift() {
    if (!lift) return;
    lift.card.classList.remove('lifted');
    lift.node.remove();
    lift = null;
  }
  function showLift(card) {
    if (lift && lift.card === card) return;
    clearLift();
    if (!card || card.classList.contains('dragging')) return;
    const node = card.cloneNode(true);
    node.removeAttribute('data-uid');
    node.removeAttribute('aria-label');
    node.removeAttribute('id');
    node.setAttribute('tabindex', '-1');
    node.setAttribute('aria-hidden', 'true');
    node.classList.remove('selected', 'lifted');
    node.classList.add('hand-lift');
    // the card's place, not where it is on the way to it (the copy rises from there)
    const m = motion.get(card);
    node.style.setProperty('--hx', m ? `${round2(m.tx)}px` : card.style.getPropertyValue('--hx'));
    node.style.setProperty('--hy', m ? `${round2(m.ty)}px` : card.style.getPropertyValue('--hy'));
    node.style.setProperty('--ha', m ? `${round2(m.ta)}deg` : card.style.getPropertyValue('--ha'));
    node.style.removeProperty('transition');
    layer.append(node);
    void node.offsetWidth; // start from the card's own place, then rise
    node.classList.add('up');
    card.classList.add('lifted');
    lift = { uid: card.dataset.uid, card, node };
  }
  // The hand rises at once when the pointer comes into its area and goes down only after the pointer has been out of it for LEAVE_DELAY (so wobbling over the edge does not make it bob).
  // After the cards are laid out again (a click, a right-click, a card drawn, a menu closing) the card still under the pointer stays lifted, instead of dropping back into the hand until the pointer
  // moves; a card that is selected (it has come up by itself), a carried card, or a lowered hand has no lifted copy.
  function syncLift() {
    if (!raised || !pointer || document.body.classList.contains('dragging-card')) { clearLift(); return; }
    const target = cardAt(pointer.x, pointer.y);
    if (!target || target.classList.contains('selected') || target.classList.contains('dragging')) { clearLift(); return; }
    if (lift && lift.card === target) {
      const m = motion.get(target);
      if (m) { lift.node.style.setProperty('--hx', `${round2(m.tx)}px`); lift.node.style.setProperty('--hy', `${round2(m.ty)}px`); lift.node.style.setProperty('--ha', `${round2(m.ta)}deg`); }
      return;
    }
    showLift(target);
  }
  function setRaised(value) {
    if (value) {
      if (lowerTimer !== null) { clearTimeout(lowerTimer); lowerTimer = null; }
      if (raised) return;
      raised = true;
    } else {
      if (!raised || lowerTimer !== null) return;
      lowerTimer = setTimeout(() => { lowerTimer = null; raised = false; container.classList.remove('raised'); arrange(); updateBar(); }, LEAVE_DELAY);
      return;
    }
    container.classList.add('raised');
    arrange(); // the places move by the quarter (and the lifted copy is dropped)
    updateBar();
  }
  // Is the point (x, y) in the area of the hand? The width the cards cover; from the top of the box down while raised, from the top of the cards that show while lowered.
  function inArea(x, y) {
    const z = zone();
    const top = z.top + (raised ? 0 : dropDistance());
    return x >= z.left && x < z.right && y >= top && y <= z.bottom + 1;
  }
  const onPointerMove = (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    setRaised(buttons().length > 0 && inArea(event.clientX, event.clientY));
    // no card lifts while a card is being carried (the hole and the lean are what show), nor while the hand is down
    syncLift();
  };
  document.addEventListener('pointermove', onPointerMove);
  document.documentElement.addEventListener('pointerleave', () => { pointer = null; setRaised(false); });

  function setZoneVars() {
    const z = zone();
    container.style.setProperty('--zl', `${z.left - container.getBoundingClientRect().left}px`);
    container.style.setProperty('--zw', `${z.right - z.left}px`);
    container.style.setProperty('--zt', `${Math.max(dropDistance(), emptyFloor() - container.getBoundingClientRect().top)}px`); // where the dashed rectangle starts: where the visible cards of a lowered hand start, which is where the hand rises when the pointer comes near it
  }

  // ---- carrying a card of the hand ----
  // info: { uid, x, over, external } while the card with this uid is carried (x: the middle of the picture carried, over: whether it is over the hand, external: it is not a card of the hand: it comes from the
  // battlefield or a pile), or null when the carry is over (let go, or cancelled). The hole moves only when it must (a dead zone). A card of the hand carried away from it makes the others close up, only
  // after it has been away for LEAVE_DELAY; over the hand again, the hole opens at once. A card from outside opens a place in the hand while it is over it (one more place than there are cards) and closes it
  // again when it is away.
  function carry(info) {
    if (!info) {
      if (awayTimer !== null) { clearTimeout(awayTimer); awayTimer = null; }
      if (carried === null) return;
      lastCarry = { uid: carried, hole, external: carriedExternal };
      carried = null;
      carriedExternal = false;
      hole = null;
      away = false;
      delete container.dataset.hole;
      arrange();
      return;
    }
    const all = buttons();
    const external = info.external === true;
    const index = external ? -1 : all.findIndex((button) => button.dataset.uid === info.uid);
    if (!external && index < 0) return;
    const total = all.length + (external ? 1 : 0);
    let changed = false;
    if (carried !== info.uid) { carried = info.uid; carriedExternal = external; hole = external ? null : index; away = false; lastCarry = null; changed = true; } // a card of the hand starts over its own place: nothing moves
    if (info.over === false) {
      if (!away && awayTimer === null && (!external || hole !== null)) awayTimer = setTimeout(() => { awayTimer = null; if (carried === info.uid) { away = true; arrange(); } }, LEAVE_DELAY);
      if (changed) arrange();
      return;
    }
    if (awayTimer !== null) { clearTimeout(awayTimer); awayTimer = null; }
    if (away) { away = false; changed = true; }
    const next = holeAt({ total, width: Math.max(0, container.clientWidth - 2 * margin()), cardWidth: all[0] ? all[0].offsetWidth : 0, x: info.x - container.getBoundingClientRect().left - margin(), previous: hole });
    if (next !== hole) { hole = next; changed = true; }
    container.dataset.hole = String(hole); // (the place the carried card is over: shown for the checks and for anyone looking at the page)
    if (changed) arrange();
  }

  // The place the card with this uid takes when let go with the pointer at x: the hole as it was last shown (so the card lands where it was shown), else worked out from x.
  function holeFor(uid, x, external = false) {
    if (carried === uid && hole !== null) return hole;
    if (lastCarry && lastCarry.uid === uid && lastCarry.hole !== null) return lastCarry.hole;
    const all = buttons();
    if (all.length === 0) return 0;
    return holeAt({ total: all.length + (external ? 1 : 0), width: Math.max(0, container.clientWidth - 2 * margin()), cardWidth: all[0].offsetWidth, x: x - container.getBoundingClientRect().left - margin() });
  }

  // The picture of the card with this uid was let go at `from` ({ x, y, angle }: its top left corner in viewport pixels and its turn in degrees): its card starts there and eases into its place.
  function noteDrop(uid, from) {
    if (from && Number.isFinite(from.x) && Number.isFinite(from.y)) pending.set(uid, { x: from.x, y: from.y, angle: Number.isFinite(from.angle) ? from.angle : 0 });
  }

  // Where the hand is on screen, for a card let go over it: the width the cards cover (with half a card of slack at each end, so a card can be put at either end) and the height of the box.
  // With no cards it is a few cards wide in the middle, so a card can still be put back into an empty hand.
  function zone() {
    const box = container.getBoundingClientRect();
    const all = buttons();
    const cardWidth = all[0] ? all[0].offsetWidth : box.height * 0.6;
    const slack = cardWidth / 2;
    let left = box.left + box.width / 2 - cardWidth * 1.5;
    let right = box.left + box.width / 2 + cardWidth * 1.5;
    if (all.length) {
      // from the layout of the WHOLE hand, not from where the cards are going now: while a card is carried the others make room or close up, and an area that followed them would shrink and grow under the
      // pointer (the kind of feedback that made the old hand jitter)
      const whole = handLayout({ count: all.length, width: Math.max(0, container.clientWidth - 2 * margin()), cardWidth, cardHeight: all[0].offsetHeight }).slots;
      const xs = whole.map((spot) => spot.x + margin());
      left = box.left + Math.min(...xs) - slack;
      right = box.left + Math.max(...xs) + cardWidth + slack;
    }
    return { left, right, top: box.top, bottom: box.bottom };
  }

  // Is the point (x, y) on screen over the hand, to drop a card on it? It is the rectangle from where the hand starts to rise when the pointer comes near it (the top of the cards that show while it is
  // lowered) down to the bottom of the box, the width the cards cover and half a card more at each end (Kevin, 2026-11-12): the same rectangle that is outlined while a card is carried over it. A hand with
  // no cards is a few cards wide in the middle, where one would go.
  function over(x, y) {
    const z = zone();
    const top = Math.max(z.top + dropDistance(), emptyFloor());
    return x >= z.left && x < z.right && y >= top && y <= z.bottom + 1;
  }

  if (typeof ResizeObserver === 'function') new ResizeObserver(() => arrange()).observe(container);
  return { arrange, carry, holeFor, noteDrop, zone, over, bar, isRaised: () => raised };
}
