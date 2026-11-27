// The local port the live checks serve the pages on. The web API key only works from the addresses allowed in Google Cloud (APIs & Services > Credentials > the
// browser key > Websites): the real sites, http://localhost:5173/* and http://127.0.0.1:5173/* (for npm run dev), and http://127.0.0.1:5199/* (Kevin added it on
// 2026-11-27 for these checks, so they can run while his own dev server keeps 5173). Change it here only, for every check.
export const LIVE_PORT = 5199;
