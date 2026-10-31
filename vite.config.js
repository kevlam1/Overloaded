import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

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
      // On Vercel /table/CODE and /lobby/CODE are rewritten to their pages (vercel.json); the dev server needs the same rules.
      name: 'overloaded-dev-rewrites',
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          const match = /^\/(table|lobby)\/[^/?#]+\/?(\?|#|$)/.exec(request.url ?? '');
          if (match) request.url = `/pages/${match[1]}/index.html`;
          next();
        });
      },
    }],
  };
});
