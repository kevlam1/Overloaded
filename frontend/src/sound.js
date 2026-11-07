// Sound effects for the table pages: play(name) and the small settings control (Sound on or off, and a volume slider), remembered in this browser.
// A sound that fails to load or play (a blocked autoplay, a missing file) never breaks the page: it is simply silent.
import { makeSafeStore } from './safe-store.js';
import { SOUND_KEY, SOUND_FILES, readSoundSettings, writeSoundSettings, soundLevel } from '../../shared/sound-settings.mjs';

const store = makeSafeStore();
let settings = readSoundSettings(store.get(SOUND_KEY));
const loaded = {};

function audioFor(name) {
  if (!Object.hasOwn(SOUND_FILES, name)) return null;
  if (!loaded[name]) {
    loaded[name] = new Audio(SOUND_FILES[name]);
    loaded[name].preload = 'auto';
  }
  return loaded[name];
}

// Plays a sound once at the saved volume times that sound's own gain (shared/sound-settings.mjs). A copy of the loaded element plays, so a sound can overlap itself (two quick draws).
export function play(name) {
  const level = soundLevel(settings, name);
  if (level === 0) return;
  try {
    const base = audioFor(name);
    if (!base) return;
    const sound = base.cloneNode();
    sound.volume = level;
    const started = sound.play();
    if (started && typeof started.catch === 'function') started.catch(() => {});
  } catch { /* silent */ }
}

// Draws the settings into `host` (an empty element): a Sound checkbox and a Volume slider. Changing the volume plays a short sample so the level can be heard.
export function mountSoundSettings(host) {
  if (!host) return;
  const group = document.createElement('div');
  group.className = 'sound-settings';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Sound');

  const onLabel = document.createElement('label');
  const on = document.createElement('input');
  on.type = 'checkbox';
  on.id = 'sound-on';
  on.checked = settings.on;
  onLabel.append(on, ' Sound');

  const volumeLabel = document.createElement('label');
  const volume = document.createElement('input');
  volume.type = 'range';
  volume.id = 'sound-volume';
  volume.min = '0';
  volume.max = '100';
  volume.step = '5';
  volume.value = String(Math.round(settings.volume * 100));
  volume.disabled = !settings.on;
  volume.setAttribute('aria-label', 'Sound volume');
  volumeLabel.append('Volume ', volume);

  const save = () => store.set(SOUND_KEY, writeSoundSettings(settings));
  on.addEventListener('change', () => {
    settings = { ...settings, on: on.checked };
    volume.disabled = !settings.on;
    save();
  });
  volume.addEventListener('input', () => { settings = { ...settings, volume: Number(volume.value) / 100 }; save(); });
  volume.addEventListener('change', () => play('draw'));

  group.append(onLabel, volumeLabel);
  host.replaceChildren(group);
}
