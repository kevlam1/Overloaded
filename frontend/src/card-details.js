// The details window of a card (Kevin, 2026-11-15): the large card on the left, and on the right its rules, mana value, type and the rest. The rules come from the site's own files (frontend/src/card-rules.js);
// what the card list already knows (keywords, color identity, printed power and toughness) is shown at once, and the rest follows when the file has come. Card names and rules go in as text, never as markup.
//   openCardDetails({ card, info, loader, rulingsLoader, returnFocus }): card, the card of the game (n, i, p?, b?); info, its entry in the card list (or null); loader, makeRulesLoader(); rulingsLoader, makeRulingsLoader()
//   (the rulings are a section at the end, loaded on their own so the rules show first); returnFocus, where the focus goes back to.
import { imageUrl } from '../../shared/card-image.mjs';
import { legalitiesOf } from '../../shared/card-rules.mjs';
import { manaNode } from './mana-pips.js';
import { manaIcon } from './mana-icon.js';
import { makeFoilLayer } from './foil-layer.js';
import { cardLookGroup } from '../../shared/foil-looks.mjs';

const make = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };
const COLOR_WORDS = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
const words = (letters) => (letters ? [...letters].map((c) => COLOR_WORDS[c]).join(', ') : 'Colorless');
let current = null;

// The symbols Scryfall's pictures do not have, drawn from the Mana project's icons (frontend/public/icons/mana): tap, untap, energy, chaos, planeswalker, acorn, ticket.
const GLYPHS = { T: ['tap', 'tap'], Q: ['untap', 'untap'], E: ['e', 'energy'], CHAOS: ['chaos', 'chaos'], PW: ['planeswalker', 'planeswalker'], A: ['acorn', 'acorn'], TK: ['ticket', 'ticket'] };

// A line of rules text with the symbols drawn ({T}, {2}{G}) like the ones on a card: the text between them stays text.
export function richText(text) {
  const fragment = document.createDocumentFragment();
  for (const part of String(text).split(/(\{[^}]+\})/)) {
    if (!part) continue;
    const glyph = /^\{([A-Z]+)\}$/.exec(part) && Object.hasOwn(GLYPHS, /^\{([A-Z]+)\}$/.exec(part)[1]) ? GLYPHS[/^\{([A-Z]+)\}$/.exec(part)[1]] : null;
    if (glyph) { const disc = document.createElement('span'); disc.className = 'details-glyph'; disc.setAttribute('role', 'img'); disc.setAttribute('aria-label', glyph[1]); disc.title = glyph[1]; const icon = manaIcon(glyph[0]); if (icon) disc.append(icon); else disc.textContent = part.slice(1, -1); fragment.append(disc); }
    else if (/^\{[^}]+\}$/.test(part)) { const symbol = manaNode(part); symbol.classList.add('details-symbol'); fragment.append(symbol); } else fragment.append(document.createTextNode(part));
  }
  return fragment;
}

export function openCardDetails({ card, info = null, loader, rulingsLoader = null, returnFocus = null }) {
  current?.close();
  const name = String(card?.n ?? '');
  const hasBack = card?.b === 1 || info?.b === 1;
  const id = card?.p ?? card?.i ?? info?.i ?? null;
  let showing = 'front';

  const overlay = make('div', 'details-overlay');
  const panel = make('div', 'details-window');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', `Details of ${name}`);
  const picture = make('div', 'details-picture');
  const side = make('div', 'details-side');
  const close = make('button', 'details-close secondary', 'Close'); close.type = 'button';
  const heading = make('h2', 'details-title', name);
  const body = make('div', 'details-body');
  side.append(heading, body);
  panel.append(picture, side, close);
  overlay.append(panel);
  document.body.append(overlay);

  function drawPicture() {
    picture.replaceChildren();
    const url = id ? imageUrl(id, 'normal', showing) : null;
    if (url) {
      const image = new Image();
      image.className = 'details-card';
      image.alt = `${name}${showing === 'back' ? ', back face' : ''}`;
      image.decoding = 'async';
      image.draggable = false;
      image.addEventListener('error', () => { image.replaceWith(make('p', 'details-nopicture', name)); });
      image.src = url;
      const group = cardLookGroup(card);
      if (group) { // a foil card: the foil over the picture (it holds still)
        const frame = make('span', 'foil-frame');
        const layer = makeFoilLayer(group);
        frame.append(image, layer);
        picture.append(frame);
      } else picture.append(image);
    } else picture.append(make('p', 'details-nopicture', name));
    if (hasBack) {
      const flip = make('button', 'secondary details-flip', showing === 'front' ? 'Show the back face' : 'Show the front face'); flip.type = 'button';
      flip.addEventListener('click', () => { showing = showing === 'front' ? 'back' : 'front'; drawPicture(); flip.focus({ preventScroll: true }); });
      picture.append(flip);
    }
  }

  // single: a card with one face has its name in the title above, so the line under it is the type with the cost beside it; a card with several faces names each one.
  function face(data, index, single) {
    const section = make('section', 'details-face');
    const top = make('div', 'details-facehead');
    if (single) top.append(make('p', 'details-type', data.t)); else top.append(make('h3', 'details-facename', data.n || name));
    if (data.m) top.append(manaNode(data.m));
    section.append(top);
    if (!single) section.append(make('p', 'details-type', data.t));
    if (data.x) for (const line of data.x.split('\n')) { const p = make('p', 'details-rules'); p.append(richText(line)); section.append(p); }
    else section.append(make('p', 'details-rules details-none', 'No rules text.'));
    const stats = [data.pt ? `Power and toughness: ${data.pt}` : null, data.l ? `Loyalty: ${data.l}` : null, data.d ? `Defense: ${data.d}` : null].filter(Boolean);
    if (stats.length) section.append(make('p', 'details-stats', stats.join('   ')));
    if (index > 0) section.classList.add('details-second');
    return section;
  }

  // The rulings (Kevin, 2026-11-15: "rulings are found in card details"): a section at the end of the right side, newest last as Scryfall lists them, each with its date and who wrote it.
  const rulingsBox = make('section', 'details-rulings-box');
  function drawRulings(state, rows) {
    rulingsBox.replaceChildren(make('h3', 'details-subhead', 'Rulings'));
    if (state === 'ready') {
      const list = make('ul', 'details-rulings');
      for (const ruling of rows) {
        const item = make('li', 'details-ruling');
        item.append(make('span', 'details-ruling-meta', `${ruling.date} \u00b7 ${ruling.words}`));
        const text = make('p', 'details-ruling-text');
        text.append(richText(ruling.text));
        item.append(text);
        list.append(item);
      }
      rulingsBox.append(list);
    } else {
      const note = make('p', 'details-none', state === 'loading' ? 'Loading the rulings...' : state === 'failed' ? 'The rulings could not be loaded. Check your connection.' : 'No rulings for this card.');
      rulingsBox.append(note);
      if (state === 'failed') { const retry = make('button', 'secondary details-retry-rulings', 'Try again'); retry.type = 'button'; retry.addEventListener('click', () => startRulings()); rulingsBox.append(retry); }
    }
  }
  async function startRulings() {
    if (!rulingsLoader) return;
    drawRulings('loading', []);
    const result = await rulingsLoader.load(name);
    if (!overlay.isConnected) return;
    drawRulings(result.state, result.rows);
  }

  const row = (label, value) => { const r = make('div', 'details-row'); r.append(make('dt', '', label), make('dd', '', value)); return r; };

  function drawBody(state, entry) {
    body.replaceChildren();
    if (entry) {
      entry.f.forEach((data, index) => body.append(face(data, index, entry.f.length === 1)));
    } else {
      // the card list's own words, until the rules come (or when they cannot)
      const section = make('section', 'details-face');
      const top = make('div', 'details-facehead');
      if (info?.m) top.append(manaNode(info.m));
      section.append(top, make('p', 'details-type', info?.t ?? ''));
      section.append(make('p', 'details-rules details-none', state === 'loading' ? 'Loading the rules...' : state === 'failed' ? 'The rules could not be loaded. Check your connection.' : 'The rules of this card are not available.'));
      if (state === 'failed') { const retry = make('button', 'secondary', 'Try again'); retry.type = 'button'; retry.addEventListener('click', () => start()); section.append(retry); }
      body.append(section);
    }
    const list = make('dl', 'details-facts');
    if (entry) list.append(row('Mana value', String(Number.isInteger(entry.v) ? entry.v : entry.v)), row('Colors', words(entry.c ?? '')));
    else if (info?.m) list.append(row('Mana cost', info.m));
    list.append(row('Color identity', words(info?.ci ?? '')));
    if (info?.k?.length) list.append(row('Keywords', info.k.join(', ')));
    if (!entry && info?.pt) list.append(row('Power and toughness', info.pt));
    body.append(list);
    if (entry) {
      const legal = make('div', 'details-legal');
      legal.append(make('h3', 'details-subhead', 'Legality'));
      const grid = make('ul', 'details-legalgrid');
      for (const { format, word } of legalitiesOf(entry)) { const li = make('li', word === 'Legal' ? 'is-legal' : word === 'Not legal' ? 'is-not' : 'is-banned'); li.append(make('span', 'details-format', format[0].toUpperCase() + format.slice(1)), make('span', 'details-word', word)); grid.append(li); }
      legal.append(grid);
      body.append(legal);
    }
    if (rulingsLoader) body.append(rulingsBox); // (kept between redraws: it is drawn on its own when its file has come)
  }

  async function start() {
    drawBody('loading', null);
    const result = await loader.load(name);
    if (!overlay.isConnected) return;
    drawBody(result.state, result.entry);
  }

  function closeWindow() {
    if (!overlay.isConnected) return;
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    current = null;
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  }
  const onKey = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation(); // the page's own Escape (it lets go of a card) must not also run
    closeWindow();
  };
  close.addEventListener('click', closeWindow);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeWindow(); });
  document.addEventListener('keydown', onKey, true);
  current = { close: closeWindow };
  drawPicture();
  start();
  startRulings();
  close.focus({ preventScroll: true });
  requestAnimationFrame(() => { if (overlay.isConnected) close.focus({ preventScroll: true }); }); // (the menu that opened this window gives the focus back to its own button as it closes: take it again)
  return { close: closeWindow };
}
