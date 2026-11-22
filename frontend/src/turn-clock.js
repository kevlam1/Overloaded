// The turn clock on the table page (Kevin, 2026-11-20): "Turn time 1:23", counting up from 0 each time the turn is passed. The rules of it are in shared/turn-clock.mjs. It shows only when the player has it
// switched on (Settings > General, kept in this browser, on until turned off) and only draws text. Nothing is enforced and nothing is sent anywhere.
import { TURN_CLOCK_KEY, readTurnClockSetting, clockText, turnElapsed, observeTurn } from '../../shared/turn-clock.mjs';

// element: where the time is shown. store: the safe store. serverOffset(): the database's clock minus this computer's, or null until it is known.
export function mountTurnClock({ element, store, serverOffset }) {
  let enabled = readTurnClockSetting(store.get(TURN_CLOCK_KEY));
  let state = null;
  let timer = null;
  let active = false; // a match is on and a turn is known

  function draw() {
    element.hidden = !(enabled && active && state);
    if (element.hidden) return;
    const ms = turnElapsed({ at: state.at, serverOffset: serverOffset(), seenAt: state.seenAt, now: Date.now() });
    const words = clockText(ms);
    if (element.dataset.text !== words) { element.dataset.text = words; element.textContent = words; element.setAttribute('aria-label', `Turn time ${words}`); element.title = 'Turn time'; }
  }
  function tick() {
    if (!active || !enabled) { if (timer !== null) { clearInterval(timer); timer = null; } draw(); return; }
    if (timer === null) timer = setInterval(draw, 1000);
    draw();
  }
  return {
    // The turn that is on now: key (the match and the turn number) and at (the database time of the pass that began it, or null).
    update({ key, at = null }) { state = observeTurn(state, { key, at }, Date.now()); active = true; tick(); },
    stop() { active = false; tick(); },
    // The Settings checkbox for it (a plain label with a checkbox, like the sound ones).
    mountSetting(host) {
      if (!host) return;
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.id = 'turn-clock-on';
      box.checked = enabled;
      box.addEventListener('change', () => { enabled = box.checked; store.set(TURN_CLOCK_KEY, enabled ? '1' : '0'); tick(); });
      label.append(box, ' Show the turn clock');
      host.append(label);
    },
  };
}
