// The window for making a token (and, with kind "emblem", an emblem) (Kevin, 2026-11-19): a search bar on top, then the tokens that the cards of your deck make, then the common tokens; typing in the bar searches every
// token instead. Pressing a token makes it with its art (the newest, or the one picked last under "Art"); the "Art" button under it lists its printings to make it with another. The window stays open so several can be made; Escape or Close ends it.
// Everything shown comes from our own tokens file and goes in as text; the pictures are Scryfall's, fetched only when they scroll into view.
import { commonTokens, searchTokens, tokensForCards } from '../../shared/card-tokens.mjs';
import { imageUrl } from '../../shared/card-image.mjs';
import { makeSafeStore } from './safe-store.js';

// The art of each token (2026-11-26 feedback): an art picked under "Art" becomes that token's art (its tile shows it and makes it), kept in this browser by the token's name, type and size;
// "Random art" makes each token with any of its arts instead.
const store = makeSafeStore();
const ART_KEY = 'overloaded.tokenArt';
const RANDOM_KEY = 'overloaded.tokenRandomArt';
const artKey = (token) => [token.name, token.type, token.pt ?? '', token.colors ?? ''].join('|');
const readArts = () => { try { const all = JSON.parse(store.get(ART_KEY) ?? '{}'); return all && typeof all === 'object' && !Array.isArray(all) ? all : {}; } catch { return {}; } };
const chosenArt = (token) => token.printings.find((printing) => printing.id === readArts()[artKey(token)]) ?? token.printings[0];
function keepArt(token, printing) { const all = readArts(); if (printing === token.printings[0]) delete all[artKey(token)]; else all[artKey(token)] = printing.id; store.set(ART_KEY, JSON.stringify(all)); }

const make = (tag, className, text) => { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; };

function picture(id, name) {
  const art = make('span', 'tile-art');
  art.setAttribute('aria-hidden', 'true');
  const fallback = () => { art.replaceChildren(make('span', 'tile-name', name)); art.classList.add('noimage'); };
  const url = imageUrl(id, 'small');
  if (!url) { fallback(); return art; }
  const image = new Image();
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.draggable = false;
  image.addEventListener('error', fallback);
  image.src = url;
  art.append(image);
  return art;
}

const COLOR_WORDS = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green' };
const describe = (token) => [token.pt, token.colors ? token.colors.split('').map((letter) => COLOR_WORDS[letter]).join(' and ') : (token.emblem ? '' : 'colorless')].filter(Boolean).join(', ');

// data: { tokens, links } (shared/card-tokens.mjs readTokens). deckNames: the names of the cards of the deck. kind: 'token' or 'emblem'. onCreate({ token, printing }) makes it and returns a few words to say, or throws.
export function openTokenPicker({ root = document.body, data, deckNames = [], kind = 'token', onCreate, returnFocus = null }) {
  root.querySelector('.token-overlay')?.remove();
  const emblem = kind === 'emblem';
  const noun = emblem ? 'emblem' : 'token';
  const overlay = make('div', 'picker-overlay token-overlay');
  const dialog = make('div', 'picker token-picker');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', `Create ${noun}`);
  const head = make('div', 'picker-head');
  const title = make('h2', '', `Create ${noun}`);
  const back = make('button', 'secondary picker-back', 'Back');
  back.type = 'button';
  back.hidden = true;
  const close = make('button', 'secondary picker-close', 'Close');
  close.type = 'button';
  const actions = make('div', 'picker-actions');
  const randomLabel = make('label', 'token-random');
  const random = make('input');
  random.type = 'checkbox';
  random.id = 'token-random-art';
  random.checked = store.get(RANDOM_KEY) === '1';
  random.addEventListener('change', () => store.set(RANDOM_KEY, random.checked ? '1' : '0'));
  randomLabel.append(random, ' Random art');
  actions.append(randomLabel, back, close);
  head.append(title, actions);
  const filter = make('input', 'picker-filter');
  filter.type = 'search';
  filter.placeholder = `Search every ${noun}`;
  filter.setAttribute('aria-label', `Search every ${noun} by name or type`);
  filter.autocomplete = 'off';
  filter.spellcheck = false;
  const message = make('p', 'hint picker-message');
  message.setAttribute('role', 'status');
  const body = make('div', 'token-body');
  dialog.append(head, filter, message, body);
  overlay.append(dialog);
  root.append(overlay);

  let printingsOf = null; // the token whose printings are listed
  function closeIt() {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function onKey(event) { if (event.key === 'Escape') { event.stopImmediatePropagation(); event.preventDefault(); if (printingsOf) showList(); else closeIt(); } }
  document.addEventListener('keydown', onKey, true);
  close.addEventListener('click', closeIt);
  overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) closeIt(); });

  function create(token, printing) {
    try { message.textContent = onCreate({ token, printing }) || `Made ${token.name}.`; message.dataset.error = ''; } catch (error) { message.textContent = error.message; message.dataset.error = '1'; }
  }

  function tile(token) {
    const item = make('li');
    const make_ = make('button', 'picker-tile token-tile');
    make_.type = 'button';
    make_.dataset.token = String(token.index);
    make_.title = `${token.name}: ${token.type}${token.text ? '. ' + token.text : ''}`;
    make_.setAttribute('aria-label', `Make ${token.name}${describe(token) ? ', ' + describe(token) : ''}`);
    const caption = make('span', 'tile-caption');
    caption.append(make('strong', '', token.name), make('span', '', describe(token) || token.type));
    make_.append(picture(chosenArt(token).id, token.name), caption);
    make_.addEventListener('click', () => create(token, random.checked ? token.printings[Math.floor(Math.random() * token.printings.length)] : chosenArt(token)));
    const art = make('button', 'secondary token-art', `Art (${token.printings.length})`);
    art.type = 'button';
    art.dataset.art = String(token.index);
    art.setAttribute('aria-label', `Choose the art of ${token.name}`);
    art.addEventListener('click', () => showPrintings(token));
    item.append(make_, art);
    return item;
  }

  function section(titleText, tokens, emptyText) {
    const block = make('section', 'token-section');
    block.append(make('h3', 'token-section-title', titleText));
    if (tokens.length === 0) { block.append(make('p', 'hint', emptyText)); return block; }
    const grid = make('ul', 'picker-grid token-grid');
    for (const token of tokens) grid.append(tile(token));
    block.append(grid);
    return block;
  }

  function showList() {
    printingsOf = null;
    back.hidden = true;
    title.textContent = `Create ${noun}`;
    filter.hidden = false;
    const words = filter.value.trim();
    if (words) {
      const found = searchTokens(data, words, { emblem, limit: 80 });
      body.replaceChildren(section(`Results for "${words}"`, found, `No ${noun} matches that.`));
      return;
    }
    const sections = [];
    const own = tokensForCards(data, deckNames, emblem);
    sections.push(section(emblem ? 'Emblems from your deck' : 'Tokens from your deck', own, emblem ? 'None of your cards make an emblem.' : 'None of your cards make a token.'));
    if (!emblem) sections.push(section('Common tokens', commonTokens(data), ''));
    else sections.push(section('Every emblem', searchTokens(data, '', { emblem: true, limit: 120 }), ''));
    body.replaceChildren(...sections);
  }

  function showPrintings(token) {
    printingsOf = token;
    back.hidden = false;
    title.textContent = `${token.name}: art`;
    filter.hidden = true;
    const grid = make('ul', 'picker-grid token-grid');
    for (const printing of token.printings) {
      const item = make('li');
      const button = make('button', 'picker-tile token-tile');
      button.type = 'button';
      button.dataset.printing = printing.id;
      const code = `${printing.set.toUpperCase()} ${printing.number}`;
      button.setAttribute('aria-label', `Make ${token.name} with the art of ${code}, ${printing.year}`);
      const caption = make('span', 'tile-caption');
      caption.append(make('strong', '', code), make('span', '', printing.year));
      button.append(picture(printing.id, token.name), caption);
      if (printing === chosenArt(token)) button.setAttribute('aria-pressed', 'true');
      button.addEventListener('click', () => { keepArt(token, printing); for (const other of grid.querySelectorAll('[aria-pressed]')) other.removeAttribute('aria-pressed'); button.setAttribute('aria-pressed', 'true'); create(token, printing); });
      item.append(button);
      grid.append(item);
    }
    body.replaceChildren(grid);
    body.scrollTop = 0;
  }

  back.addEventListener('click', showList);
  filter.addEventListener('input', showList);
  showList();
  filter.focus();
  return { close: closeIt };
}
