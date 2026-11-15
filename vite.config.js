import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { versionFromLog } from './shared/version.mjs';

// The page needs five Firebase settings. They identify the project and are public by design (Firebase's docs:
// security comes from the database rules, not from hiding them), but this repo never holds the values: they come
// from the gitignored .env locally and from environment variables on Vercel. Only these five names are passed to
// the page, one by one. Nothing else in .env or the environment can reach it, so a future secret (for example a
// key for a cleanup job) stays out of the browser even if it is added to .env.
const FIREBASE_SETTINGS = {
  apiKey: 'FIREBASE_API_KEY',
  authDomain: 'FIREBASE_AUTH_DOMAIN',
  databaseURL: 'FIREBASE_DATABASE_URL',
  projectId: 'FIREBASE_PROJECT_ID',
  appId: 'FIREBASE_APP_ID',
};

const page = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig(({ command, mode }) => {
  // The empty prefix reads every name, including variables set in the environment (Vercel); only the five above are used.
  const env = loadEnv(mode, process.cwd(), '');
  const firebaseConfig = Object.fromEntries(
    Object.entries(FIREBASE_SETTINGS).map(([key, name]) => [key, env[name] ?? '']),
  );
  const missing = Object.entries(FIREBASE_SETTINGS).filter(([key]) => !firebaseConfig[key]).map(([, name]) => name);
  if (missing.length) {
    const message = `Missing Firebase settings (names only): ${missing.join(', ')}. Copy .env.example to .env and fill them in, or set them in Vercel.`;
    if (command === 'build') throw new Error(message); // a build without them would deploy a page that cannot connect
    console.warn(message);
  }

  // The version is worked out from log.md (shared/version.mjs) and put into the pages in place of {{VERSION}}.
  let version = '0.0';
  try { version = versionFromLog(readFileSync(new URL('./log.md', import.meta.url), 'utf8')); } catch { /* no log.md: the pages say 0.0 */ }

  return {
    root: 'frontend',
    define: { __FIREBASE_CONFIG__: JSON.stringify(firebaseConfig) },
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      rollupOptions: {
        input: { lobby: page('./frontend/pages/lobby/index.html'), deck: page('./frontend/pages/deck/index.html'), solo: page('./frontend/pages/solo/index.html'), table: page('./frontend/pages/table/index.html') },
      },
    },
    plugins: [{
      name: 'overloaded-version',
      transformIndexHtml: { order: 'pre', handler: (html) => html.replace(/\{\{VERSION\}\}/g, () => version) },
    }, {
      // On Vercel /, /deck, /solo, /logs, /table/CODE and /lobby/CODE are rewritten to their pages (vercel.json); the dev server needs the same rules.
      name: 'overloaded-dev-rewrites',
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          const url = request.url ?? '';
          const withCode = /^\/(table|lobby)\/[^/?#]+\/?(\?|#|$)/.exec(url);
          const plain = /^\/(deck|solo)?\/?(\?|#|$)/.exec(url);
          if (/^\/logs\/?(\?|#|$)/.test(url)) request.url = '/logs/index.html';
          else if (withCode) request.url = `/pages/${withCode[1]}/index.html`;
          else if (plain) request.url = `/pages/${plain[1] ?? 'lobby'}/index.html${url.slice(url.search(/[?#]/) === -1 ? url.length : url.search(/[?#]/))}`;
          next();
        });
      },
    }],
  };
});
