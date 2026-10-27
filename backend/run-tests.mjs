// Runs the rule tests in the local database emulator, then stops the emulator's Java process.
// On Windows the emulator's Java process outlives `firebase emulators:exec`, keeps port 9000
// and makes the next run fail with "port taken". Only a java process whose command line has
// both "firebase-database-emulator" and "--port 9000" is stopped.
import { spawnSync, execFileSync } from 'node:child_process';

const command = 'npx firebase emulators:exec --only database --project demo-overloaded "node test-rules.mjs"';
const result = spawnSync(command, {
  shell: true,
  stdio: 'inherit',
  windowsHide: true,
  cwd: new URL('.', import.meta.url),
});

if (process.platform === 'win32') {
  const script =
    "Get-CimInstance Win32_Process -Filter \"Name='java.exe'\" | " +
    "Where-Object { $_.CommandLine -like '*firebase-database-emulator*' -and $_.CommandLine -like '*--port 9000*' } | " +
    'ForEach-Object { Stop-Process -Id $_.ProcessId -Force; "Stopped leftover emulator process $($_.ProcessId)" }';
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      encoding: 'utf8',
    });
    if (out.trim()) console.log(out.trim());
  } catch (error) {
    console.error('Could not check for a leftover emulator process:', error.message);
  }
}

process.exit(result.status ?? 1);
