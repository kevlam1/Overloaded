// Where a card's picture lives. Plain JavaScript with no browser or network code. Scryfall serves every printing's picture
// at an address built from its id, with no lookup and no timestamp needed (checked 2026-10-29: HTTP 200, image/jpeg,
// about 12 KB for `small`, cached for a year, CORS open; an unknown id is HTTP 404, so the page needs a fallback).
// Sizes (docs/scryfall.md): small 146x204 (12 KB), normal 488x680 (71 KB), large 672x936 (105 KB).
export const IMAGE_HOST = 'https://cards.scryfall.io';
export const IMAGE_SIZES = ['small', 'normal', 'large', 'art_crop']; // art_crop: just the art, about 626 by 457 px and 40 KB (checked 2026-11-10: HTTP 200, image/jpeg, cached for a year)
export const IMAGE_FACES = ['front', 'back'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The picture's address, or null if the id or the size is not valid (so a damaged id can never build a strange address).
export function imageUrl(id, size = 'small', face = 'front') {
  if (typeof id !== 'string' || !UUID.test(id) || !IMAGE_SIZES.includes(size) || !IMAGE_FACES.includes(face)) return null;
  return `${IMAGE_HOST}/${size}/${face}/${id[0]}/${id[1]}/${id}.jpg`;
}

// The back of a Magic card, for the library and for cards turned face down (Kevin, 2026-11-06 and 2026-11-12). Scryfall serves the back of a standard card from its own picture server, at an
// address built from the back's id (checked 2026-11-12: HTTP 200, image/jpeg, small 9,222 bytes and normal 79,774 bytes, cached for a year, CORS open; the picture is the classic Magic card back).
export const BACK_HOST = 'https://backs.scryfall.io';
export const BACK_ID = '0aeebaf5-8c7d-4636-9e82-8c27447861f7';
export const BACK_SIZES = ['small', 'normal', 'large'];
export function cardBackUrl(size = 'small') {
  if (!BACK_SIZES.includes(size)) return null;
  return `${BACK_HOST}/${size}/${BACK_ID[0]}/${BACK_ID[1]}/${BACK_ID}.jpg`;
}
