// What the deck import page shows and saves. Plain JavaScript with no browser or network code, so Node tests can load it.
// It sits between the parser (shared/deck-text.mjs, text to entries) and the matcher (shared/card-match.mjs, entries to
// cards): it merges repeated lines, groups them by section, finds the problems, guesses the commander, and builds the
// deck that is saved in the browser (and reads it back safely). The rules come from docs/deck-import.md.
import { normalizeName } from './card-match.mjs';
import { scrubText, hasVisibleCharacter } from './player-name.mjs';
import { MAX_CARDS, MAX_CHARS } from './deck-text.mjs';

export const SECTIONS = ['commander', 'companion', 'main', 'sideboard', 'maybeboard', 'unlabeled'];
export const SECTION_TITLES = {
  commander: 'Commander',
  companion: 'Companion',
  main: 'Main deck',
  sideboard: 'Sideboard',
  maybeboard: 'Maybeboard (not counted)',
  unlabeled: 'Cards after a blank line (no label)',
};
export const SAVED_SECTIONS = ['commander', 'companion', 'main', 'sideboard']; // what a saved deck holds
export const DECK_NAME_MAX = 60;
export const MAX_COMMANDERS = 2; // a commander and a partner
export const SAVED_VERSION = 1;
export const MAX_NOTICES = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EM_DASH = ' ' + String.fromCharCode(0x2014) + ' ';

// "Legendary Creature - Human Noble", "Legendary Artifact Creature - ...", and for a two-faced card the front face counts.
export function isLegendaryCreature(card) {
  const front = String(card?.t ?? '').split(' // ')[0].split(EM_DASH)[0];
  return /\bLegendary\b/.test(front) && /\bCreature\b/.test(front);
}

// The words for what the parser reported, for people. Typed text (a skipped line) is passed through for the page to show as text.
export function describeNotices(parsed) {
  const notices = [];
  for (const error of parsed.errors ?? []) {
    if (error.code === 'not_text') notices.push('That is not text.');
    else if (error.code === 'too_long') notices.push(`That is too long. The limit is ${error.limit.toLocaleString('en-US')} characters.`);
    else if (error.code === 'too_many_lines') notices.push(`That has too many lines. The limit is ${error.limit.toLocaleString('en-US')}.`);
    else if (error.code === 'too_many_cards') notices.push(`That is ${error.total} cards. The limit is ${error.limit} (main deck, sideboard, commander and companion together).`);
    else notices.push('That could not be read.');
  }
  const warnings = parsed.warnings ?? [];
  for (const warning of warnings.slice(0, MAX_NOTICES)) {
    if (warning.reason === 'not_a_card_line') notices.push(`Line ${warning.line} was skipped: "${warning.text}" is not a card line.`);
    else if (warning.reason === 'zero_quantity') notices.push(`Line ${warning.line} was skipped: the quantity is 0.`);
    else if (warning.reason === 'header_without_card') notices.push(`Line ${warning.line} says "${warning.text}" but no card follows it.`);
    else notices.push(`Line ${warning.line} was skipped.`);
  }
  if (warnings.length > MAX_NOTICES) notices.push(`...and ${warnings.length - MAX_NOTICES} more skipped lines.`);
  return notices;
}

// The commander, guessed in the order of trust from docs/deck-import.md: a typed or exported Commander header (certain);
// else the cards after the blank line in Moxfield plain text; else the first legendary creature in the main deck; else the
// first main deck card. Only the first is certain; the page says so. Returns { certainty, ids }.
export function guessCommander(lines) {
  const matched = lines.filter((line) => line.status === 'matched');
  const marked = matched.filter((line) => line.section === 'commander');
  if (marked.length) return { certainty: 'marked', ids: marked.map((line) => line.card.i) };
  const unlabeled = matched.filter((line) => line.section === 'unlabeled');
  if (unlabeled.length) return { certainty: 'unlabeled', ids: unlabeled.map((line) => line.card.i) };
  const main = matched.filter((line) => line.section === 'main');
  const legend = main.find((line) => isLegendaryCreature(line.card));
  if (legend) return { certainty: 'legendary', ids: [legend.card.i] };
  if (main.length) return { certainty: 'first', ids: [main[0].card.i] };
  return { certainty: null, ids: [] };
}

// parsed: the result of parseDeckText. matched: the result of matchDeck for the same entries.
// choices: { [normalized typed name]: card id } for names the player settled (an ambiguous name, or a "did you mean").
// Returns the preview: { sections, problems, counts, commander, notices, canSave, lines }.
export function makePreview(parsed, matched, choices = {}) {
  if (!parsed || !matched || parsed.entries.length !== matched.results.length) throw new Error('The parsed deck and its matches do not line up.');
  const groups = new Map();
  matched.results.forEach((result, order) => {
    const { entry } = result;
    const typedKey = normalizeName(entry.name);
    let status = result.status;
    let card = result.card;
    const chosen = (status === 'ambiguous' || status === 'suggestion') ? result.candidates.find((candidate) => candidate.i === choices[typedKey]) : null;
    if (chosen) { status = 'matched'; card = chosen; }
    const key = `${entry.section}|${card ? `c:${card.i}` : `n:${typedKey}`}`;
    const existing = groups.get(key);
    if (existing) { existing.qty += entry.qty; return; }
    // viaTitle: the name as typed, when the card was found by another title it was printed under (not by its own name)
    groups.set(key, { key, section: entry.section, qty: entry.qty, status, card: card ?? null, candidates: card ? [] : result.candidates, typed: entry.name, typedKey, name: card ? card.n : entry.name, viaTitle: card && result.method === 'alt' ? entry.name : null, firstLine: entry.line, order });
  });
  const lines = [...groups.values()];

  const sections = SECTIONS.map((key) => {
    const own = lines.filter((line) => line.section === key);
    return { key, title: SECTION_TITLES[key], lines: own, count: own.reduce((sum, line) => sum + line.qty, 0) };
  }).filter((section) => section.lines.length);

  const counted = lines.filter((line) => line.section !== 'maybeboard');
  const sum = (list) => list.reduce((total, line) => total + line.qty, 0);
  const problems = {
    not_found: lines.filter((line) => line.status === 'not_found'),
    ambiguous: lines.filter((line) => line.status === 'ambiguous'),
    suggestion: lines.filter((line) => line.status === 'suggestion'),
  };
  const commander = guessCommander(lines);
  const sizeOf = (...names) => sum(lines.filter((line) => names.includes(line.section)));
  // The deck size a Commander game counts: the main deck and the commander, not the sideboard or the companion.
  const deckSize = sizeOf('main', 'commander', 'unlabeled');
  const counts = {
    cards: sum(counted),
    unique: counted.length,
    matched: sum(counted.filter((line) => line.status === 'matched')),
    problem: sum(counted.filter((line) => line.status !== 'matched')),
    deckSize,
  };
  // Does this look like a Commander deck? Certain when a commander was marked; otherwise by size (100 with the commander).
  const looksLikeCommander = commander.certainty === 'marked' || commander.certainty === 'unlabeled' || (deckSize >= 98 && deckSize <= 102);
  const notices = describeNotices(parsed);
  const canSave = !parsed.errors.length && lines.some((line) => line.status === 'matched');
  return { sections, problems, counts, commander: { ...commander, looksLikeCommander }, notices, canSave, lines };
}

// A deck name: invisible characters removed, spaces collapsed, 1 to 60 characters. Throws a message for people.
export function cleanDeckName(text) {
  const name = scrubText(text);
  if (!hasVisibleCharacter(name)) throw new Error('Give the deck a name first.');
  if ([...name].length > DECK_NAME_MAX) throw new Error(`Deck names can be up to ${DECK_NAME_MAX} characters.`);
  return name;
}

// Builds the deck to save. Options:
//   name, text (what was pasted), now (a time in ms)
//   commanderIds: the cards to save as the commander (up to 2, each in the deck), or [] for a deck with none
//   allowMissing: save even though some lines are not matched (they are left out and counted)
// Returns { ok: true, deck } or { ok: false, error }.
export function buildSavedDeck(preview, { name, text = '', commanderIds = [], allowMissing = false, now = Date.now() } = {}) {
  let cleanName;
  try { cleanName = cleanDeckName(name); } catch (error) { return { ok: false, error: error.message }; }
  if (!preview.canSave) return { ok: false, error: 'There is nothing to save yet: no card was matched.' };
  const unmatched = preview.lines.filter((line) => line.status !== 'matched' && line.section !== 'maybeboard');
  if (unmatched.length && !allowMissing) return { ok: false, error: `${unmatched.length} line${unmatched.length === 1 ? ' is' : 's are'} not matched to a card yet. Fix them, or choose to save without them.` };
  if (new Set(commanderIds).size !== commanderIds.length) return { ok: false, error: 'Choose two different cards for the commander and the partner, or leave the partner empty.' };
  if (commanderIds.length > MAX_COMMANDERS) return { ok: false, error: `A deck has at most ${MAX_COMMANDERS} commanders (a commander and a partner).` };
  const saved = preview.lines.filter((line) => line.status === 'matched' && SAVED_SECTIONS.concat('unlabeled').includes(line.section));
  const cards = new Map();
  const put = (card, qty, section) => {
    if (qty <= 0) return;
    const key = `${section}|${card.i}`;
    const existing = cards.get(key);
    if (existing) existing.qty += qty;
    else cards.set(key, { i: card.i, n: card.n, qty, section });
  };
  for (const line of saved) put(line.card, line.qty, line.section === 'unlabeled' ? 'main' : line.section);
  // The player's choice decides who the commander is. A card the list marked as a commander but the player did not choose
  // goes back to the main deck, so the saved deck never disagrees with itself.
  for (const card of [...cards.values()]) {
    if (card.section === 'commander' && !commanderIds.includes(card.i)) { cards.delete(`commander|${card.i}`); put(card, card.qty, 'main'); }
  }
  for (const id of commanderIds) {
    // One copy of the chosen card becomes the commander, taken from wherever it was listed (not the maybeboard).
    const from = [...cards.values()].find((card) => card.i === id && card.section !== 'commander');
    const already = cards.get(`commander|${id}`);
    if (already) continue;
    if (!from) return { ok: false, error: 'The commander you chose is not in the deck.' };
    from.qty -= 1;
    if (from.qty === 0) cards.delete(`${from.section}|${id}`);
    put({ i: from.i, n: from.n }, 1, 'commander');
  }
  // A fixed order (commander, companion, main, sideboard, then by name), so the same deck is always saved the same way.
  const list = [...cards.values()].sort((a, b) => SAVED_SECTIONS.indexOf(a.section) - SAVED_SECTIONS.indexOf(b.section) || (a.n < b.n ? -1 : a.n > b.n ? 1 : a.i < b.i ? -1 : 1));
  const total = list.reduce((sum, card) => sum + card.qty, 0);
  if (total > MAX_CARDS) return { ok: false, error: `That is ${total} cards. The limit is ${MAX_CARDS}.` };
  return { ok: true, deck: { version: SAVED_VERSION, name: cleanName, savedAt: new Date(now).toISOString(), commander: commanderIds.slice(), cards: list, skipped: unmatched.length, text: String(text).slice(0, MAX_CHARS) } };
}

export const serializeDeck = (deck) => JSON.stringify(deck);

// Reads a saved deck back from the browser's storage. The text there may be old, damaged or edited by hand, so every
// field is checked; anything wrong gives null (nothing is trusted or repaired).
export function readSavedDeck(raw) {
  let deck;
  try { deck = JSON.parse(raw); } catch { return null; }
  if (!deck || typeof deck !== 'object' || Array.isArray(deck) || deck.version !== SAVED_VERSION) return null;
  if (typeof deck.name !== 'string' || scrubText(deck.name) !== deck.name || !hasVisibleCharacter(deck.name) || [...deck.name].length > DECK_NAME_MAX) return null;
  if (typeof deck.savedAt !== 'string' || Number.isNaN(Date.parse(deck.savedAt))) return null;
  if (!Array.isArray(deck.cards) || deck.cards.length === 0 || deck.cards.length > MAX_CARDS) return null;
  let total = 0;
  const seen = new Set();
  for (const card of deck.cards) {
    if (!card || typeof card !== 'object' || typeof card.i !== 'string' || !UUID.test(card.i)) return null;
    if (typeof card.n !== 'string' || card.n.length === 0 || card.n.length > 200) return null;
    if (!Number.isInteger(card.qty) || card.qty < 1 || card.qty > MAX_CARDS) return null;
    if (!SAVED_SECTIONS.includes(card.section)) return null;
    const key = `${card.section}|${card.i}`;
    if (seen.has(key)) return null;
    seen.add(key);
    total += card.qty;
  }
  if (total > MAX_CARDS) return null;
  if (!Array.isArray(deck.commander) || deck.commander.length > MAX_COMMANDERS) return null;
  for (const id of deck.commander) if (typeof id !== 'string' || !seen.has(`commander|${id}`)) return null;
  if (!Number.isInteger(deck.skipped) || deck.skipped < 0) return null;
  if (typeof deck.text !== 'string' || deck.text.length > MAX_CHARS) return null;
  // A clean copy with only the checked fields: anything extra that was added by hand is dropped, not passed on.
  return {
    version: SAVED_VERSION,
    name: deck.name,
    savedAt: deck.savedAt,
    commander: deck.commander.slice(),
    cards: deck.cards.map((card) => ({ i: card.i, n: card.n, qty: card.qty, section: card.section })),
    skipped: deck.skipped,
    text: deck.text,
  };
}
