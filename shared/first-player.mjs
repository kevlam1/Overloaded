// Who goes first (2026-11-26 feedback): the host picks Random or a seat in the lobby (meta/first), and at Start the seat that opens the match is written once (meta/opener),
// so every page agrees. The table opens with a short slot-machine reveal of it (frontend/src/first-reveal.js). Plain logic (scripts/test-first-player.mjs).
export const FIRST_CHOICES = ['random', '1', '2', '3', '4'];
export const readFirst = (value) => (FIRST_CHOICES.includes(value) ? value : 'random');
export const firstWords = (value) => (readFirst(value) === 'random' ? 'Random' : `Seat ${value}`);

// The opening seat: the chosen seat when someone sits there, else a random one of the seats taken. seats: the seats taken ('1' to '4'). random: () => [0, 1).
export function pickOpener(first, seats, random = Math.random) {
  const taken = [...new Set((Array.isArray(seats) ? seats : []).map(String))].filter((seat) => ['1', '2', '3', '4'].includes(seat)).sort();
  if (!taken.length) return null;
  const chosen = readFirst(first);
  if (chosen !== 'random' && taken.includes(chosen)) return chosen;
  return taken[Math.min(taken.length - 1, Math.floor(random() * taken.length))];
}

// The names the reveal flashes through before it stops on the opener: a few rounds of the players in seat order, ending on the opener. players: [{ seat, name }] in seat order.
export function revealSequence(players, opener, rounds = 3) {
  if (!Array.isArray(players) || !players.length) return [];
  const end = players.findIndex((player) => player.seat === opener);
  if (end < 0) return [];
  const steps = [];
  for (let round = 0; round < rounds; round++) steps.push(...players);
  steps.push(...players.slice(0, end + 1));
  return steps;
}
