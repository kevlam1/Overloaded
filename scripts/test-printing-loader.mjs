// Tests for frontend/src/printings.js: fetching only the set files a deck names, once each, and what is remembered. A fake
// fetch answers (no network) and records every address asked for. Run: node scripts/test-printing-loader.mjs
import { makePrintingLoader } from '../frontend/src/printings.js';

let checks = 0;
function check(label, condition, detail = '') {
  checks++;
  if (!condition) { console.error(`FAILED: ${label} ${detail}`); process.exit(1); }
}
const same = (label, actual, expected) => check(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

// A pretend server: sets with a file answer it, others answer what `answers` says (404 by default).
function pretend(files, answers = {}) {
  const asked = [];
  const fetchImpl = async (url, options) => {
    asked.push({ url, accept: options?.headers?.Accept });
    const set = /set-([a-z0-9]+)\.json$/.exec(url)?.[1];
    const answer = answers[set];
    if (answer === 'throw') throw new TypeError('network down');
    if (typeof answer === 'number') return { ok: answer >= 200 && answer < 300, status: answer, json: async () => ({}) };
    if (answer && answer.json) return { ok: true, status: 200, json: async () => answer.json() };
    if (files[set]) return { ok: true, status: 200, json: async () => files[set] };
    return { ok: false, status: 404, json: async () => { throw new Error('no body'); } };
  };
  return { fetchImpl, asked };
}

// ---- what is asked for ----
{
  const { fetchImpl, asked } = pretend({ cmm: { 410: 'x' }, sld: { 916: 'y' } });
  const loader = makePrintingLoader(fetchImpl);
  const loaded = await loader.load(['cmm', 'sld']);
  same('each set is asked for at its own address, naming what is accepted', asked.map((a) => [a.url, a.accept]).sort(), [['/data/printings/set-cmm.json', 'application/json'], ['/data/printings/set-sld.json', 'application/json']]);
  same('the answers come back by set', [...loaded.keys()].sort(), ['cmm', 'sld']);
  same('with the parsed files', [loaded.get('cmm'), loaded.get('sld')], [{ 410: 'x' }, { 916: 'y' }]);
  const again = await loader.load(['sld', 'cmm']);
  check('asking again fetches nothing more', asked.length === 2 && again.size === 2);
  check('a set already loaded is not fetched again even among new ones', (await loader.load(['cmm', 'sld', 'cmm'])).size === 2 && asked.length === 2);
}
{
  const { fetchImpl, asked } = pretend({ cmm: {} });
  const loader = makePrintingLoader(fetchImpl);
  await loader.load(['cmm', 'cmm', 'cmm']);
  check('one set listed three times is fetched once', asked.length === 1);
  const none = await loader.load([]);
  check('no sets means no request and an empty answer', asked.length === 1 && none.size === 0);
}
{
  const { fetchImpl, asked } = pretend({ cmm: { 1: 'a' } });
  const loader = makePrintingLoader(fetchImpl);
  const [one, two] = await Promise.all([loader.load(['cmm']), loader.load(['cmm'])]);
  check('two checks at the same moment share one request', asked.length === 1 && one.get('cmm') === two.get('cmm'));
}

// ---- sets that cannot be addressed ----
{
  const { fetchImpl, asked } = pretend({});
  const loader = makePrintingLoader(fetchImpl);
  const odd = ['', 'ab', 'CMM', '../x', 'a/b', 'cmm.json', 'abcdefg', 'c m'];
  const loaded = await loader.load(odd);
  check('anything that is not a set code is never requested', asked.length === 0, JSON.stringify(asked));
  check('and counts as a set with no data', odd.every((set) => loaded.has(set) && loaded.get(set) === null));
}

// ---- what the server says ----
{
  const { fetchImpl } = pretend({ cmm: { 1: 'a' } }, { gone: 404, broken: 500, busy: 503, teapot: 418, throws: 'throw' });
  const loader = makePrintingLoader(fetchImpl);
  const loaded = await loader.load(['cmm', 'gone', 'broken', 'busy', 'throws', 'nope']);
  same('a 404 is a set with no data (null)', [loaded.get('gone'), loaded.get('nope')], [null, null]);
  same('a file that loaded is the file', loaded.get('cmm'), { 1: 'a' });
  check('a server error, an unavailable server and a network error leave the set out, so the page says it was not loaded', !loaded.has('broken') && !loaded.has('busy') && !loaded.has('throws'), JSON.stringify([...loaded.keys()]));
  check('so does any other failing status', !(await loader.load(['teapot'])).has('teapot'));
}
{
  const { fetchImpl } = pretend({}, { arr: { json: () => [1, 2] }, str: { json: () => 'text' }, nul: { json: () => null }, num: { json: () => 5 }, bad: { json: () => { throw new SyntaxError('not json'); } }, fine: { json: () => ({ 1: 'a' }) } });
  const loaded = await makePrintingLoader(fetchImpl).load(['arr', 'str', 'nul', 'num', 'bad', 'fine']);
  check('an answer that is not a JSON object (a list, text, null, a number, not JSON at all) is not a file', ['arr', 'str', 'nul', 'num', 'bad'].every((set) => !loaded.has(set)));
  same('an object is', loaded.get('fine'), { 1: 'a' });
}

// ---- what is remembered ----
{
  let up = false;
  const asked = [];
  const fetchImpl = async (url) => { asked.push(url); if (!up) throw new TypeError('offline'); return { ok: true, status: 200, json: async () => ({ 1: 'a' }) }; };
  const loader = makePrintingLoader(fetchImpl);
  check('while offline the set is left out', !(await loader.load(['cmm'])).has('cmm') && asked.length === 1);
  up = true;
  check('a failure is not remembered: the next check asks again and gets it', (await loader.load(['cmm'])).get('cmm')?.[1] === 'a' && asked.length === 2);
  check('and a success is remembered', (await loader.load(['cmm'])).size === 1 && asked.length === 2);
}
{
  const { fetchImpl, asked } = pretend({}, { gone: 404 });
  const loader = makePrintingLoader(fetchImpl);
  await loader.load(['gone']);
  const second = await loader.load(['gone']);
  check('a set with no data (404) is remembered too, so a typo does not ask the server again', asked.length === 1 && second.get('gone') === null);
}
{
  // A failure that happens while another check is waiting for the same set: the failure is not kept for later.
  let calls = 0;
  const fetchImpl = async () => { calls++; if (calls === 1) throw new TypeError('blip'); return { ok: true, status: 200, json: async () => ({ 1: 'b' }) }; };
  const loader = makePrintingLoader(fetchImpl);
  const [a, b] = await Promise.all([loader.load(['cmm']), loader.load(['cmm'])]);
  check('two checks that share a failed request both see the failure', !a.has('cmm') && !b.has('cmm') && calls === 1);
  check('and the next one starts again', (await loader.load(['cmm'])).get('cmm')?.[1] === 'b' && calls === 2);
}
check('the default fetch is the browser\'s own (no other option is needed)', typeof makePrintingLoader().load === 'function');

console.log(`All ${checks} printing loader checks passed.`);
