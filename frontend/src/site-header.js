// The header at the top of the lobby and the deck pages is written in the page itself (so it is there at once and does not flicker when the page changes). This only finishes it:
// "Home" always goes to the start page; "Lobby" (the page where you are with other people) is shown only when this browser is at a table (the lobby remembers it under overloaded.lastTable) and goes to it. A logo that cannot be loaded is taken away so the written name shows.
import { isValidCode } from '../../shared/table-code.mjs';
import { makeSafeStore } from './safe-store.js';

export function mountSiteHeader() {
  const header = document.querySelector('header.site-header');
  if (!header) return null;
  const lastTable = makeSafeStore().get('overloaded.lastTable');
  const lobby = header.querySelector('#site-lobby');
  if (lobby && typeof lastTable === 'string' && isValidCode(lastTable)) { lobby.href = `/lobby/${lastTable}`; lobby.hidden = false; }
  const logo = header.querySelector('img.brand-logo');
  const dropLogo = () => { logo.remove(); header.querySelector('.brand')?.classList.remove('has-logo'); };
  if (logo) {
    if (logo.complete && logo.naturalWidth === 0) dropLogo();
    else logo.addEventListener('error', dropLogo);
  }
  return header;
}
