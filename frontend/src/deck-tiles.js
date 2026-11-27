// The deck picker of the lobby (Kevin, 2026-11-19): your saved decks as cards you click, instead of a drop-down list. Each is the deck card of the deck page (frontend/src/deck-face.js: the commander's art, its colors,
// the bracket and the number of cards); the one you will play has a tick and the word Selected, the others carry nothing. The first card is "Import a deck". The page keeps a hidden <select> as the thing it reads and
// writes (so nothing else about choosing a deck changes); this module only draws the cards and says which one was clicked. Everything shown comes from this browser's own saved decks.
import { makeDeckFace } from './deck-face.js';
import { deckChoiceLabel, deckFieldsOf } from '../../shared/lobby-deck.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
function icon(path, size = 14) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [name, value] of [['viewBox', '0 0 16 16'], ['width', String(size)], ['height', String(size)], ['fill', 'currentColor'], ['aria-hidden', 'true'], ['focusable', 'false']]) svg.setAttribute(name, value);
  const shape = document.createElementNS(SVG_NS, 'path');
  shape.setAttribute('d', path);
  shape.setAttribute('fill', 'currentColor');
  svg.append(shape);
  return svg;
}
const CHECK = 'M6.4 11.6 2.9 8.1l1.1-1.1 2.4 2.4L12 3.8l1.1 1.1z';
const PLUS = 'M7 2h2v5h5v2H9v5H7V9H2V7h5z';

// Does a deck match what was typed? Every word must be in the deck's name or its commander(s); capitals do not matter.
export function deckMatches(entry, query) {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = `${entry.deck.name} ${deckFieldsOf(entry).commander}`.toLowerCase();
  return words.every((word) => hay.includes(word));
}

// host: the element to draw in. decks: saved library entries ({ id, format, bracket?, deck }). selectedId: the one chosen now, or null. byName: the card list by name, for the colors (null until it has loaded).
// onPick(id): a card was clicked or chosen with the keyboard (Tab to a card, Enter or Space). onImport: when given, the first card is "Import a deck" and this is called when it is pressed. query: only decks that match it
// are drawn (see deckMatches). Returns how many decks are drawn.
// onEdit(id) and onDelete(id), when given: an Edit and a Delete button beside each card (Kevin's friends, 2026-11-26: edit and remove decks from the lobby). The card is a
// button itself, so they sit beside it in a wrapper, not inside it.
export function drawDeckTiles(host, decks, selectedId, { byName = null, onPick, onImport = null, onEdit = null, onDelete = null, query = '' }) {
  host.replaceChildren();
  if (onImport) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'deck-import-tile';
    add.id = host.id ? `${host.id}-import` : '';
    add.append(icon(PLUS, 22));
    const words = document.createElement('span');
    words.className = 'import-words';
    const strong = document.createElement('strong');
    strong.textContent = 'Import a deck';
    const hint = document.createElement('span');
    hint.textContent = 'Paste a list';
    words.append(strong, hint);
    add.append(words);
    add.addEventListener('click', onImport);
    host.append(add);
  }
  let shown = 0;
  for (const entry of decks) {
    if (!deckMatches(entry, query)) continue;
    shown++;
    const face = makeDeckFace(entry, byName, { action: 'pick', label: deckChoiceLabel(entry) });
    face.classList.add('deck-choice');
    face.dataset.id = entry.id;
    const chosen = entry.id === selectedId;
    face.setAttribute('aria-pressed', String(chosen));
    face.classList.toggle('chosen', chosen);
    if (chosen) {
      const badge = document.createElement('span');
      badge.className = 'choice-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.append(icon(CHECK), document.createTextNode('Selected'));
      face.append(badge);
    }
    face.addEventListener('click', () => onPick(entry.id));
    if (onEdit || onDelete) {
      const wrap = document.createElement('div');
      wrap.className = 'deck-choice-wrap';
      const tools = document.createElement('div');
      tools.className = 'deck-choice-tools';
      const tool = (label, action, run) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `deck-tool secondary deck-tool-${action}`;
        button.dataset.action = action;
        button.textContent = label;
        button.setAttribute('aria-label', `${label}: ${entry.deck.name}`);
        button.addEventListener('click', (event) => { event.stopPropagation(); run(entry.id, button); });
        return button;
      };
      if (onEdit) tools.append(tool('Edit', 'edit', onEdit));
      if (onDelete) tools.append(tool('Delete', 'delete', onDelete));
      wrap.append(face, tools);
      host.append(wrap);
    } else host.append(face);
  }
  if (decks.length > 0 && shown === 0) {
    const none = document.createElement('p');
    none.className = 'deck-none hint';
    none.textContent = 'No deck matches.';
    host.append(none);
  }
  return shown;
}
