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

export function loadCameraSettings() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch {}
  return { coverage: coverageOption(saved?.coverage).id, blur: blurOption(saved?.blur).id };
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
