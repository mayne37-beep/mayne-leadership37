export const coverageOptions = [
  { id: 'balanced', label: 'Balanced', threshold: 0.49 },
  { id: 'more', label: 'Keep more of me', threshold: 0.42 },
  { id: 'most', label: 'Keep the most', threshold: 0.35 },
];

export const blurOptions = [
  { id: 'light', label: 'Light', strength: 0.25, radius: 5 },
  { id: 'medium', label: 'Medium', strength: 0.55, radius: 11 },
  { id: 'strong', label: 'Strong', strength: 1, radius: 20 },
];

const storageKey = 'mayne-live-classroom-camera-settings';
export const jpegPrefix = 'data:image/jpeg;base64,';

export const coverageOption = id => coverageOptions.find(option => option.id === id) ?? coverageOptions[0];
export const blurOption = id => blurOptions.find(option => option.id === id) ?? blurOptions[1];
export const validBackdropColor = color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);

export function cameraPresentationSettings(settings, background) {
  return {
    cameraCoverage: settings.coverage,
    cameraBackdrop: !background && settings.backdropMode === 'solid' ? settings.backdropColor : null,
  };
}

export function sampleBackdropColor(video, clientX, clientY) {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  const rect = video.getBoundingClientRect();
  const scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);
  if (scale <= 0) return null;
  const x = (clientX - rect.left - (rect.width - video.videoWidth * scale) / 2) / scale;
  const y = (clientY - rect.top - (rect.height - video.videoHeight * scale) / 2) / scale;
  if (x < 0 || x >= video.videoWidth || y < 0 || y >= video.videoHeight) return null;
  const size = Math.min(7, video.videoWidth, video.videoHeight);
  // The self-preview is mirrored. Sample the corresponding patch in the unmirrored camera.
  const left = Math.max(0, Math.min(video.videoWidth - size, Math.round(video.videoWidth - 1 - x - size / 2)));
  const top = Math.max(0, Math.min(video.videoHeight - size, Math.round(y - size / 2)));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { alpha: false });
  context.drawImage(video, left, top, size, size, 0, 0, 1, 1);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return '#' + [red, green, blue].map(channel => channel.toString(16).padStart(2, '0')).join('');
}

export function loadCameraSettings() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch {}
  return {
    coverage: coverageOption(saved?.coverage).id,
    blur: blurOption(saved?.blur).id,
    backdropMode: saved?.backdropMode === 'solid' ? 'solid' : 'automatic',
    backdropColor: validBackdropColor(saved?.backdropColor) ? saved.backdropColor : '#00a040',
  };
}

export function saveCameraSettings(settings) {
  try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch {}
}

export function backgroundSettings(choice, blur) {
  let processor = { type: 'none' };
  if (choice?.id === 'blur') processor = { type: 'background-blur', config: { strength: blurOption(blur).strength } };
  else if (choice?.image) {
    const source = choice.image.startsWith(jpegPrefix)
      ? Uint8Array.from(atob(choice.image.slice(jpegPrefix.length)), char => char.charCodeAt(0)).buffer
      : new URL(choice.image, location.origin).href;
    processor = { type: 'background-image', config: { source } };
  }
  return { video: { processor } };
}
