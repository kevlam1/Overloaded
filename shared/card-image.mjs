// Where a card's picture lives. Plain JavaScript with no browser or network code. Scryfall serves every printing's picture
// at an address built from its id, with no lookup and no timestamp needed (checked 2026-10-29: HTTP 200, image/jpeg,
// about 12 KB for `small`, cached for a year, CORS open; an unknown id is HTTP 404, so the page needs a fallback).
// Sizes (docs/scryfall.md): small 146x204 (12 KB), normal 488x680 (71 KB), large 672x936 (105 KB).
export const IMAGE_HOST = 'https://cards.scryfall.io';
export const IMAGE_SIZES = ['small', 'normal', 'large'];
export const IMAGE_FACES = ['front', 'back'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// The picture's address, or null if the id or the size is not valid (so a damaged id can never build a strange address).
export function imageUrl(id, size = 'small', face = 'front') {
  if (typeof id !== 'string' || !UUID.test(id) || !IMAGE_SIZES.includes(size) || !IMAGE_FACES.includes(face)) return null;
  return `${IMAGE_HOST}/${size}/${face}/${id[0]}/${id[1]}/${id}.jpg`;
}
