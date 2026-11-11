// The header at the top of the lobby and the deck pages is written in the page itself (so it is there at once and does not flicker when the page changes). This only finishes it:
// "Lobby" goes to the table this browser is at (the lobby remembers it under overloaded.lastTable), else to the start page, and a logo that cannot be loaded is taken away so the written name shows.
import { isValidCode } from '../../shared/table-code.mjs';
import { makeSafeStore } from './safe-store.js';

export function mountSiteHeader() {
  const header = document.querySelector('header.site-header');
  if (!header) return null;
  const lastTable = makeSafeStore().get('overloaded.lastTable');
  const lobby = header.querySelector('.site-nav a');
  if (lobby && typeof lastTable === 'string' && isValidCode(lastTable)) lobby.href = `/lobby/${lastTable}`;
  const logo = header.querySelector('img.brand-logo');
  const dropLogo = () => { logo.remove(); header.querySelector('.brand')?.classList.remove('has-logo'); };
  if (logo) {
    if (logo.complete && logo.naturalWidth === 0) dropLogo();
    else logo.addEventListener('error', dropLogo);
  }
  return header;
}
