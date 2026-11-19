// The tokens and emblems file (/data/tokens.json, built from Scryfall's data: shared/card-tokens.mjs), fetched once, only when a token menu opens (it is 0.17 MB compressed). Our own static file: no Scryfall request.
// loadTokens() gives { tokens, links } read strictly, or null when it could not be loaded; a failure is not remembered, so the next try asks again.
import { TOKENS_PATH, readTokens } from '../../shared/card-tokens.mjs';

let loading = null;
export function loadTokens(fetchImpl = fetch) {
  if (!loading) {
    loading = (async () => {
      try {
        const response = await fetchImpl(TOKENS_PATH);
        if (!response.ok) return null;
        return readTokens(await response.json());
      } catch {
        return null;
      }
    })().then((data) => { if (data === null) loading = null; return data; });
  }
  return loading;
}
