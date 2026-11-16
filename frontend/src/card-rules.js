// Fetches the rules of one card from the site's own static files (shared/card-rules.mjs): the one small file that holds the card (about 12 KB compressed), at most once per visit. No request goes to Scryfall.
// Never throws: it answers { state, entry } with state 'ready', 'none' (the files are not on this site yet, a 404, or the card is not in them) or 'failed' (the network failed; asking again tries again).
import { shardUrl, rulesOf } from '../../shared/card-rules.mjs';

export function makeRulesLoader(fetchImpl = (...args) => fetch(...args)) {
  const shards = new Map(); // url -> parsed file, or null for "not there"

  async function getJson(url) {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
    return response.json();
  }

  // name: the card's real English name. Returns { state, entry }.
  async function load(name) {
    const url = shardUrl(name);
    if (!url) return { state: 'none', entry: null };
    try {
      if (!shards.has(url)) shards.set(url, await getJson(url));
    } catch {
      shards.delete(url);
      return { state: 'failed', entry: null };
    }
    const entry = rulesOf(shards.get(url), name);
    return { state: entry ? 'ready' : 'none', entry };
  }
  return { load };
}
