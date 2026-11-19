// The deck picker of the lobby (Kevin, 2026-11-19): your saved decks as cards you click, instead of a drop-down list. Each is the deck card of the deck page (frontend/src/deck-face.js: the commander's art, its colors,
// the bracket and the number of cards), pressed in to show which one you are bringing. The page keeps a hidden <select> as the thing it reads and writes (so nothing else about choosing a deck changes);
// this module only draws the cards and says which one was clicked. Everything shown comes from this browser's own saved decks.
import { makeDeckFace } from './deck-face.js';
import { deckChoiceLabel } from '../../shared/lobby-deck.mjs';

// host: the element to draw in. decks: saved library entries ({ id, format, bracket?, deck }). selectedId: the one chosen now, or null. byName: the card list by name, for the colors (null until it has loaded).
// onPick(id): called when a card is clicked or chosen with the keyboard (Tab to a card, Enter or Space).
export function drawDeckTiles(host, decks, selectedId, { byName = null, onPick }) {
  host.replaceChildren();
  for (const entry of decks) {
    const face = makeDeckFace(entry, byName, { action: 'pick', label: deckChoiceLabel(entry) });
    face.classList.add('deck-choice');
    face.dataset.id = entry.id;
    const chosen = entry.id === selectedId;
    face.setAttribute('aria-pressed', String(chosen));
    face.classList.toggle('chosen', chosen);
    const badge = document.createElement('span');
    badge.className = 'choice-badge';
    badge.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [name, value] of [['viewBox', '0 0 16 16'], ['width', '14'], ['height', '14'], ['fill', 'currentColor'], ['aria-hidden', 'true'], ['focusable', 'false']]) svg.setAttribute(name, value);
    const check = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    check.setAttribute('d', 'M6.4 11.6 2.9 8.1l1.1-1.1 2.4 2.4L12 3.8l1.1 1.1z');
    check.setAttribute('fill', 'currentColor');
    svg.append(check);
    badge.append(svg, document.createTextNode(chosen ? 'Bringing' : 'Bring'));
    face.append(badge);
    face.addEventListener('click', () => onPick(entry.id));
    host.append(face);
  }
}
