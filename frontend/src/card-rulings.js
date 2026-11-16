// Fetches the rulings of one card from the site's own static files (shared/card-rulings.mjs): the one small file that holds the card (about 18 KB compressed, 29 KB at most), at most once per visit.
// No request goes to Scryfall. Never throws: it answers { state, rows } with state 'ready', 'none' (the card has no rulings, the files are not on this site yet or a 404) or 'failed' (the network failed; asking again tries again).
import { shardUrl, rulingsOf } from '../../shared/card-rulings.mjs';

export function makeRulingsLoader(fetchImpl = (...args) => fetch(...args)) {
  const shards = new Map(); // url -> parsed file, or null for "not there"

  async function getJson(url) {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
    return response.json();
  }

  // name: the card's real English name. Returns { state, rows: [{ date, source, words, text }] }.
  async function load(name) {
    const url = shardUrl(name);
    if (!url) return { state: 'none', rows: [] };
    try {
      if (!shards.has(url)) shards.set(url, await getJson(url));
    } catch {
      shards.delete(url);
      return { state: 'failed', rows: [] };
    }
    const rows = rulingsOf(shards.get(url), name);
    return { state: rows.length ? 'ready' : 'none', rows };
  }
  return { load };
}
