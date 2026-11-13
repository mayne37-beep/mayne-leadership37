import { presentationOf } from './shared.js';

const key = 'mayne-live-classroom-preferences';
export const deviceKinds = { camera: 'videoinput', microphone: 'audioinput', speaker: 'audiooutput' };

function read() {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {}
  return {};
}

export function loadMeetingPreferences() {
  const saved = read();
  return {
    ...Object.fromEntries(Object.keys(deviceKinds).map(device => [
      device, typeof saved[device] === 'string' ? saved[device].slice(0, 512) : '',
    ])),
    background: typeof saved.background === 'string' ? saved.background : '',
    presentation: presentationOf({ userData: saved }),
    view: saved.view === 'speaker' ? 'speaker' : 'gallery',
    hideSelf: saved.hideSelf === true,
    hideVideo: saved.hideVideo === true,
    showCaptions: saved.showCaptions !== false,
  };
}

export function saveMeetingPreferences(patch) {
  try { localStorage.setItem(key, JSON.stringify({ ...read(), ...patch })); } catch {}
}

export function loadStudioScene() {
  const { scene } = read();
  return scene;
}

export function availableDevice(device, kind, devices) {
  return devices.some(item => item.kind === kind && item.deviceId === device) ? device : '';
}
