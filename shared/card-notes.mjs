// The notes the Alt picture shows beside a card (Kevin, 2026-11-25): what its keywords mean (shared/keyword-glossary.mjs), what its counters are and do, and its state
// on the table (summoning sick, doesn't untap). A face-down card shows nothing: its face is hidden. Plain data, no browser code.
import { keywordNotes, keywordNote } from './keyword-glossary.mjs';
import { COUNTER_WORDS } from './zones.mjs';

const COUNTER_ICONS = { l: 'counter-loyalty', c: 'counter-charge', t: 'counter-time' };

// card: a game card ({ k, ct, sick, nu, faceDown, tok, ... }). Returns [{ name, text, icon }] (text may be null: a keyword we have no words for).
export function cardNotes(card) {
  if (!card || typeof card !== 'object' || card.faceDown === true) return [];
  const notes = [];
  if (card.sick === true) notes.push({ name: 'Summoning sick', text: "Can't attack or use its tap abilities until your next turn.", icon: 'ability-summoning-sickness', state: true });
  if (card.nu === true || card.noUntap === true) notes.push({ name: "Doesn't untap", text: 'Stays tapped when you untap all.', icon: 'untap', state: true });
  for (const [kind, count] of Object.entries(card.ct && typeof card.ct === 'object' ? card.ct : {})) {
    if (!Number.isInteger(count) || count <= 0) continue;
    const words = Object.hasOwn(COUNTER_WORDS, kind) ? COUNTER_WORDS[kind] : kind;
    const keyword = keywordNote(kind); // a keyword counter (flying, trample...) gives the card that keyword
    const text = kind === 'p' ? `+${count}/+${count} in all.` : kind === 'm' ? `-${count}/-${count} in all.` : keyword ? `Gives it ${keyword.name.toLowerCase()}: ${keyword.text.charAt(0).toLowerCase()}${keyword.text.slice(1)}` : null;
    notes.push({ name: `${words.charAt(0).toUpperCase()}${words.slice(1)} counter${count === 1 ? '' : 's'} ×${count}`, text, icon: keyword?.icon ? `ability-${keyword.icon}` : COUNTER_ICONS[kind] ?? (kind.length > 1 ? `counter-${kind}` : null), counter: true });
  }
  for (const note of keywordNotes(card.k)) notes.push({ ...note, icon: note.icon ? `ability-${note.icon}` : null });
  return notes;
}
