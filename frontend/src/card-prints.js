// Fetches the printings of one card from the site's own static files (shared/card-prints.mjs): the one small file that holds the card (about 12 KB compressed) and the sets file (about 8 KB), each at most once per
// visit. No request goes to Scryfall: the pictures are only asked for when a printing is pointed at. Never throws: it answers { state, printings, sets } with state 'ready', 'none' (the files are not on this site
// yet, a 404, or the card is not in them) or 'failed' (the network failed; asking again tries again).
import { shardUrl, setsUrl, printingsOf } from '../../shared/card-prints.mjs';

export function makePrintsLoader(fetchImpl = (...args) => fetch(...args)) {
  const shards = new Map(); // url -> parsed file, or null for "not there"
  let sets;

  async function getJson(url) {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
    return response.json();
  }

  // name: the card's real English name. Returns { state, printings: [{ set, number, id }], sets: { code: [name, date] } }.
  async function load(name) {
    const url = shardUrl(name);
    if (!url) return { state: 'none', printings: [], sets: {} };
    try {
      if (!shards.has(url)) shards.set(url, await getJson(url));
      if (sets === undefined) sets = await getJson(setsUrl());
    } catch {
      shards.delete(url);
      return { state: 'failed', printings: [], sets: {} };
    }
    const printings = printingsOf(shards.get(url), name);
    return { state: printings.length ? 'ready' : 'none', printings, sets: sets ?? {} };
  }
  return { load };
}
