// Loads the per-set printing files (/data/printings/set-CODE.json, built by scripts/build-card-list.mjs) that a deck names, so
// a card can show the printing the player meant. Only the sets a deck names are fetched, each once per page visit, and they
// are static files on our own site: no request goes to Scryfall. The browser keeps them and revalidates with the ETag.
// A set that has no file (HTTP 404) is a known "no data" and is remembered; any other failure is not remembered, so the next
// check tries again. Plain browser code; the fetch function is passed in so it can be tested.
import { setFileUrl } from '../../shared/printings.mjs';

export function makePrintingLoader(fetchImpl = fetch) {
  const cache = new Map(); // set code -> a promise of its file, null (no such set) or undefined (it could not be loaded)

  async function fetchOne(set) {
    const url = setFileUrl(set);
    if (!url) return null; // not a set code: nothing is requested for it
    try {
      const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
      if (response.status === 404) return null;
      if (!response.ok) return undefined;
      const body = await response.json();
      return body && typeof body === 'object' && !Array.isArray(body) ? body : undefined;
    } catch {
      return undefined;
    }
  }

  // sets: set codes (lowercase). Returns a Map of the ones that answered: the parsed file, or null for a set with none.
  // A set that could not be loaded is left out of the Map, which is how the preview knows to say so.
  async function load(sets) {
    const loaded = new Map();
    await Promise.all([...new Set(sets)].map(async (set) => {
      let pending = cache.get(set);
      if (!pending) { pending = fetchOne(set); cache.set(set, pending); }
      const file = await pending;
      if (file === undefined) { if (cache.get(set) === pending) cache.delete(set); return; }
      loaded.set(set, file);
    }));
    return loaded;
  }

  return { load };
}
