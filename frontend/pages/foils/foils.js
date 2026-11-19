// The foil test page at /foils (Kevin, 2026-11-18): every foil look, and every kind of foil, next to a card that is not foil, drawn the four ways the game draws a card: small (the battlefield),
// in the hand, as a deck tile, and big (the Alt picture and the details window). For debugging the looks and for trying them on another card. It uses the real pieces: shared/foil-looks.mjs,
// frontend/src/foil-layer.js, the style sheet and the Alt picture (hold Alt over a small card).
import { mountSiteHeader } from '../../src/site-header.js';
import { KINDS, lookOf, foilLabel } from '../../../shared/foil-kinds.mjs';
import { LOOK_GROUPS, lookGroup } from '../../../shared/foil-looks.mjs';
import { imageUrl } from '../../../shared/card-image.mjs';
import { setFoilLook, makeFoilLayer, setFoilSource } from '../../src/foil-layer.js';
import { mountCardHover } from '../../src/card-hover.js';
import { FOIL_EXAMPLES } from '../../../shared/foil-examples.mjs';

mountSiteHeader();
mountCardHover();

const CARDS = [
  ['Lightning Bolt', '7673784e-db4b-43a1-8d55-1bb9fc1e284f'],
  ['Sol Ring', 'fc817e07-c1f3-469f-9cf7-0945dea7400f'],
  ['Counterspell', '4f616706-ec97-4923-bb1e-11a69fbaa1f8'],
  ['Jin-Gitaxias, Core Augur', '14a360b6-c7b4-4b25-8288-b3bb8d527bda'],
  ['Llanowar Elves', '6a0b230b-d391-4998-a3f7-7b158a0ec2cd'],
  ['Forest', '2e781bfd-f8cb-4d20-b977-4359f3a21311'],
];

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

// What the page lists. group is the look to draw, or null for a card that is not foil; example is the kind whose real card shows it (shared/foil-examples.mjs).
const LOOK_EXAMPLE = { traditional: 'traditional', rainbow: 'rainbow', etched: 'etched', silver: 'silver', surge: 'surge', galaxy: 'galaxy', halo: 'halo', fracture: 'fracture', ripple: 'ripple', confetti: 'confetti', textured: 'textured', oilslick: 'oilslick', neon: 'neonink', compleat: 'stepandcompleat', mana: 'mana', singularity: 'singularity', gold: 'gilded', scales: 'dragonscale', retro: 'retro', vault: 'fromthevault' };
function entries(view) {
  const list = [{ title: 'Not foil', note: 'no foil', group: null, example: 'traditional' }];
  if (view === 'looks') {
    const kindsOf = (group) => KINDS.filter((kind) => lookGroup(lookOf(kind[0], kind[0] === 'silveretched' ? 'etched' : 'foil')) === group).map((kind) => kind[0]);
    for (const group of LOOK_GROUPS) {
      const kinds = group === 'traditional' ? ['plain foil', ...kindsOf(group)] : kindsOf(group);
      list.push({ title: group, note: group === 'etched' ? 'every etched foil' : kinds.join(', '), group, example: LOOK_EXAMPLE[group] });
    }
  } else {
    list.push({ title: 'Plain foil', note: 'no special kind', group: lookGroup('traditional'), example: 'traditional' });
    list.push({ title: foilLabel('etched'), note: 'every etched foil but the Moonlit Lands', group: lookGroup(lookOf('traditional', 'etched')), example: 'etched' });
    for (const [id, code, label, tag] of KINDS) {
      const group = lookGroup(lookOf(id, id === 'silveretched' ? 'etched' : 'foil'));
      list.push({ title: label, note: `${tag ?? 'from the set'} · ${code} · ${group}`, group, example: id });
    }
  }
  return list;
}

function picture(id, size) {
  const image = new Image();
  image.alt = '';
  image.decoding = 'async';
  image.draggable = false;
  image.referrerPolicy = 'no-referrer';
  image.src = imageUrl(id, size);
  return image;
}

// A card button as the game draws one (small, or the hand's normal size).
function smallCard(id, group, size) {
  const button = make('button', 'card');
  button.type = 'button';
  button.setAttribute('aria-label', group ? `Foil, ${group}` : 'Not foil');
  const face = make('span', 'face');
  face.append(picture(id, size));
  button.append(face);
  if (group) { button.classList.add('foil'); setFoilLook(button, group); setFoilSource(button, imageUrl(id, 'normal')); }
  return button;
}

function deckTile(id, group) {
  const item = make('li', 'deck-tile');
  const art = make('span', 'tile-picture');
  art.append(picture(id, 'small'));
  item.append(art);
  if (group) { item.classList.add('foil'); setFoilLook(item, group); setFoilSource(item, imageUrl(id, 'small')); }
  return item;
}

// The big picture: the foil layer over it (it holds still).
function bigCard(id, group) {
  const frame = make('span', 'foil-frame foil-lab-big');
  frame.append(picture(id, 'normal'));
  if (group) {
    const layer = makeFoilLayer(group);
    setFoilSource(layer, imageUrl(id, 'normal'));
    frame.append(layer);
  }
  return frame;
}

function draw() {
  const grid = $('lab-grid');
  const chosen = $('lab-card').value; // 'real' (the default): each entry shows a real card that has that foil
  grid.replaceChildren(...entries($('lab-view').value).map((entry) => {
    const real = FOIL_EXAMPLES[entry.example];
    const id = chosen === 'real' ? real.id : chosen;
    const box = make('div', 'foil-lab-entry');
    const title = make('h2', '', entry.title);
    const note = make('p', 'hint', entry.note);
    const cardLine = make('p', 'hint foil-lab-card', chosen === 'real' ? `${real.name} (${real.set.toUpperCase()} ${real.number})` : '');
    const row = make('div', 'foil-lab-row');
    const small = make('div', 'foil-lab-small'); small.append(smallCard(id, entry.group, 'small'));
    const hand = make('div', 'foil-lab-hand'); hand.append(smallCard(id, entry.group, 'normal'));
    const tile = make('ul', 'foil-lab-tile'); tile.append(deckTile(id, entry.group));
    row.append(small, hand, tile);
    box.append(title, note, cardLine, row, bigCard(id, entry.group));
    return box;
  }));
}

const realOption = make('option', '', 'Real card for each foil'); realOption.value = 'real'; $('lab-card').append(realOption);
for (const [name, cardId] of CARDS) { const option = make('option', '', name); option.value = cardId; $('lab-card').append(option); }
const params = new URLSearchParams(location.search);
if (CARDS.some(([, cardId]) => cardId === params.get('card'))) $('lab-card').value = params.get('card');
if (params.get('view') === 'kinds') $('lab-view').value = 'kinds';
$('lab-still').checked = params.get('still') === '1';
const applyStill = () => $('foil-lab').classList.toggle('still', $('lab-still').checked);
$('lab-card').addEventListener('change', draw);
$('lab-view').addEventListener('change', draw);
$('lab-still').addEventListener('change', applyStill);
applyStill();
draw();
