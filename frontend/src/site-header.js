// The header at the top of the lobby and the deck pages: the logo and name on the left, the places to go on the right. The table pages have their own top bar (the game needs the room).
// The logo is the wordmark /brand/logo.png (frontend/public/brand/logo.png, 432 by 96, made from frontend/assets/overloaded-logo-source.png); it already says the name, so the written name is kept only for screen readers and shows alone if the picture cannot be loaded.
// "Lobby" goes to the table this browser is at (the lobby remembers it under overloaded.lastTable), else to the start page. Plain DOM, no dependencies.
import { isValidCode } from '../../shared/table-code.mjs';
import { makeSafeStore } from './safe-store.js';

export const LOGO_URL = '/brand/logo.png';
const PLACES = [['lobby', 'Lobby'], ['deck', 'Decks'], ['solo', 'Solo table']];

function make(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

// current: 'lobby', 'deck' or 'solo' (the page that is open; its link is marked as the current page). Puts the header first in the body. Returns the element.
export function mountSiteHeader({ current } = {}) {
  const header = make('header', 'site-header');
  const inner = make('div', 'site-header-inner');
  const brand = make('a', 'brand');
  brand.href = '/';
  brand.setAttribute('aria-label', 'Overloaded, home');
  const logo = new Image();
  logo.className = 'brand-logo';
  logo.alt = '';
  logo.width = 432;
  logo.height = 96;
  logo.decoding = 'async';
  logo.addEventListener('load', () => brand.classList.add('has-logo')); // the wordmark says the name, so the written one is hidden (it stays for screen readers)
  logo.addEventListener('error', () => logo.remove()); // the name stands alone
  logo.src = LOGO_URL;
  brand.append(logo, make('span', 'brand-name', 'Overloaded'), make('span', 'brand-beta', 'BETA'));

  const nav = make('nav', 'site-nav');
  nav.setAttribute('aria-label', 'Main');
  const lastTable = makeSafeStore().get('overloaded.lastTable');
  for (const [id, label] of PLACES) {
    const link = make('a', 'site-link', label);
    link.href = id === 'lobby' ? (typeof lastTable === 'string' && isValidCode(lastTable) ? `/lobby/${lastTable}` : '/') : `/${id}`;
    if (id === current) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
  inner.append(brand, nav);
  header.append(inner);
  document.body.prepend(header);
  return header;
}
