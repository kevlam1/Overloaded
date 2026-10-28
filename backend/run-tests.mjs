// Runs the rule tests against the local Firebase Realtime Database emulator, then stops the emulator.
//
// Preferred path: start the emulator's jar (cached by firebase-tools) directly with no console window,
// wait for its port, run test-rules.mjs, then stop it. `firebase emulators:exec` starts the same Java
// program detached, and on Windows that opens a visible console window that steals focus.
// Fallback (jar not cached yet): `firebase emulators:exec`, which downloads it.
//
// On Windows `java` can be a launcher that starts the real java.exe, so after stopping our handle we also stop
// any java process whose command line has both "firebase-database-emulator" and "--port 9000", and nothing else.
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

const HOST = '127.0.0.1';
const PORT = 9000;
const here = new URL('.', import.meta.url);
// ONLY_TESTS=test-table-flow.mjs runs just that file (used to check a test against deliberately broken copies).
const TEST_FILES = process.env.ONLY_TESTS ? process.env.ONLY_TESTS.split(',') : ['test-rules.mjs', 'test-table-ops.mjs', 'test-table-flow.mjs'];

function findJar() {
  const dir = join(homedir(), '.cache', 'firebase', 'emulators');
  if (!existsSync(dir)) return null;
  const jars = readdirSync(dir).filter((f) => /^firebase-database-emulator-v.*\.jar$/.test(f)).sort();
  return jars.length ? join(dir, jars[jars.length - 1]) : null;
}

const portOpen = () => new Promise((resolve) => {
  const socket = net.connect({ host: HOST, port: PORT });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});

function stopLeftoverEmulators() {
  if (process.platform !== 'win32') return;
  const script =
    "Get-CimInstance Win32_Process -Filter \"Name='java.exe'\" | " +
    "Where-Object { $_.CommandLine -like '*firebase-database-emulator*' -and $_.CommandLine -like '*--port 9000*' } | " +
    'ForEach-Object { Stop-Process -Id $_.ProcessId -Force; "Stopped leftover emulator process $($_.ProcessId)" }';
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, encoding: 'utf8' });
    if (out.trim()) console.log(out.trim());
  } catch (error) {
    console.error('Could not check for a leftover emulator process:', error.message);
  }
}

async function runWithJar(jar) {
  if (await portOpen()) {
    console.error(`Port ${PORT} is already in use. Stop whatever is using it and run again (nothing was started or stopped).`);
    return 1;
  }
  const emulator = spawn('java', ['-Duser.language=en', '-jar', jar, '--host', HOST, '--port', String(PORT)], {
    windowsHide: true,
    stdio: 'ignore',
  });
  let exited = false;
  emulator.once('exit', () => { exited = true; });
  emulator.once('error', (error) => { exited = true; console.error('Could not start java:', error.message); });
  try {
    const deadline = Date.now() + 60000;
    while (!(await portOpen())) {
      if (exited) { console.error('The emulator stopped before it was ready.'); return 1; }
      if (Date.now() > deadline) { console.error('The emulator was not ready after 60 seconds.'); return 1; }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    // Both files share the one emulator; each seeds its own tables, so they cannot disturb each other.
    for (const file of TEST_FILES) {
      const result = spawnSync(process.execPath, [file], { cwd: here, stdio: 'inherit', windowsHide: true });
      if ((result.status ?? 1) !== 0) return result.status ?? 1;
    }
    return 0;
  } finally {
    emulator.kill();
    stopLeftoverEmulators();
  }
}

function runWithFirebaseTools() {
  const command = `npx firebase emulators:exec --only database --project demo-overloaded "${TEST_FILES.map((f) => `node ${f}`).join(' && ')}"`;
  const result = spawnSync(command, { shell: true, stdio: 'inherit', windowsHide: true, cwd: here });
  stopLeftoverEmulators();
  return result.status ?? 1;
}

const jar = findJar();
const status = jar ? await runWithJar(jar) : runWithFirebaseTools();
process.exit(status);
