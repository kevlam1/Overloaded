// The slot-machine reveal of who goes first (2026-11-26 feedback): a window that runs through the players' names, slowing down, and stops on the one who opens the match
// (meta/opener, chosen at Start: shared/first-player.mjs). Every page shows it once per match. Under prefers-reduced-motion it shows the result at once.
// A click, Escape or Enter closes it; it also closes by itself a moment after it stops.
import { revealSequence } from '../../shared/first-player.mjs';

const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// players: [{ seat, name, color? }] in seat order. opener: the seat that goes first. mine: that seat is yours.
export function showFirstReveal({ players, opener, mine = false }) {
  if (window.__overloadedNoHelp) return null; // (the browser checks: it covers the page for a few seconds; scripts/lib/browser.mjs, openBrowser({ help: true }) shows it)
  const steps = revealSequence(players, opener);
  if (!steps.length) return null;
  document.querySelector('.first-reveal')?.remove();
  const overlay = make('div', 'first-reveal');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Who goes first');
  const box = make('div', 'first-box');
  const title = make('p', 'first-title', 'Who goes first?');
  const window_ = make('div', 'first-window');
  const name = make('p', 'first-name');
  window_.append(name);
  const result = make('p', 'first-result');
  result.setAttribute('role', 'status');
  box.append(title, window_, result);
  overlay.append(box);
  document.body.append(overlay);
  const timers = [];
  const close = () => { for (const timer of timers) clearTimeout(timer); overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (event) => { if (event.key === 'Escape' || event.key === 'Enter') { event.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('click', close);
  const showName = (player, settled) => {
    name.textContent = player.name || `Seat ${player.seat}`;
    name.style.color = player.color ?? '';
    name.classList.toggle('settled', settled);
    if (!settled) { name.classList.remove('tick'); void name.offsetWidth; name.classList.add('tick'); }
  };
  const finish = () => {
    const winner = steps.at(-1);
    showName(winner, true);
    result.textContent = mine ? 'You go first!' : `${winner.name || `Seat ${winner.seat}`} goes first.`;
    timers.push(setTimeout(close, 2600));
  };
  if (still()) { finish(); return { close }; }
  // the names go by quickly, then slow down: each step waits a little longer than the one before
  let at = 0;
  let delay = 60;
  const total = steps.length;
  steps.forEach((player, index) => {
    if (index === total - 1) return;
    timers.push(setTimeout(() => showName(player, false), at));
    at += delay;
    delay = Math.min(360, delay * (index > total - 8 ? 1.35 : 1.06));
  });
  timers.push(setTimeout(finish, at));
  return { close };
}
