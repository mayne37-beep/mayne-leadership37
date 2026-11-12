import React, { useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { newNonce } from './client.js';

const storagePrefix = 'mayne-live-classroom-background:';
const jpegPrefix = 'data:image/jpeg;base64,';
const office = '/assets/live-classroom-backgrounds/office.jpg';
const choices = [
  { id: 'none', label: 'None' },
  { id: 'blur', label: 'Blur', image: office },
  { id: 'office', label: 'Office', image: office },
  { id: 'reading-room', label: 'Reading room', image: '/assets/live-classroom-backgrounds/reading-room.jpg' },
];

export function loadBackgrounds() {
  try {
    const saved = [];
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(storagePrefix)) continue;
      try {
        const item = JSON.parse(localStorage.getItem(key));
        if (typeof item?.id === 'string' && key === storagePrefix + item.id &&
            typeof item.label === 'string' && typeof item.image === 'string' && item.image.startsWith(jpegPrefix)) saved.push(item);
      } catch {}
    }
    return saved;
  } catch {
    return [];
  }
}

export function backgroundSettings(choice) {
  let processor = { type: 'none' };
  if (choice?.id === 'blur') processor = { type: 'background-blur', config: {} };
  else if (choice?.image) {
    const source = choice.image.startsWith(jpegPrefix)
      ? Uint8Array.from(atob(choice.image.slice(jpegPrefix.length)), char => char.charCodeAt(0)).buffer
      : new URL(choice.image, location.origin).href;
    processor = { type: 'background-image', config: { source } };
  }
  return { video: { processor } };
}

async function readImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1280 / image.naturalWidth, 720 / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#f5f4f7';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {
      id: 'custom-' + newNonce(),
      label: file.name.replace(/\.[^.]+$/, '').trim().slice(0, 70) || 'Custom image',
      image: canvas.toDataURL('image/jpeg', 0.84),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function BackgroundSettings({ supported, selected, select, custom, setCustom, busy }) {
  const input = useRef(null);
  const [reading, setReading] = useState(false);
  const [status, setStatus] = useState('');

  async function add(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setStatus('');
    setReading(true);
    try {
      const supportedFormat = file.type ? /^image\/(jpeg|png|webp)$/.test(file.type) : /\.(jpe?g|png|webp)$/i.test(file.name);
      if (!supportedFormat) {
        throw new Error('Unsupported image format');
      }
      const choice = await readImage(file);
      setCustom(items => [...items, choice]);
      try {
        localStorage.setItem(storagePrefix + choice.id, JSON.stringify(choice));
      } catch {
        setStatus('This image is available for this meeting. Browser storage could not save it.');
      }
      await select(choice);
    } catch {
      setStatus('Could not open this image. Choose a JPG, PNG, or WebP file.');
    } finally {
      setReading(false);
    }
  }

  async function remove(choice) {
    setStatus('');
    if (choice.id === selected?.id && !(await select(null))) return;
    setCustom(items => items.filter(item => item.id !== choice.id));
    try {
      localStorage.removeItem(storagePrefix + choice.id);
    } catch {
      setStatus('This image was removed for this meeting. Browser storage could not save the change.');
    }
  }

  function tile(choice) {
    const active = choice.id === (selected?.id ?? 'none');
    return <button key={choice.id} className="background-choice" type="button" aria-pressed={active}
      title={choice.label} onClick={() => { if (!active) select(choice.id === 'none' ? null : choice); }}>
      <span className={'background-thumbnail' + (choice.id === 'blur' ? ' blurred' : '')}>
        {choice.image ? <img alt="" src={choice.image} /> : <Icon name="camera" off size={23} />}
      </span>
      <span className="background-label">{choice.label}</span>
    </button>;
  }

  return <fieldset className="background-settings" disabled={busy || reading}>
    <legend>Video background</legend>
    {supported ? <>
      <div className="background-grid">{choices.map(tile)}{custom.map(choice => <div key={choice.id} className="custom-background">
        {tile(choice)}
        <button className="icon-button remove-background" type="button" title={'Remove ' + choice.label}
          aria-label={'Remove background ' + choice.label} onClick={() => remove(choice)}><Icon name="close" size={15} /></button>
      </div>)}</div>
      <button className="btn secondary" type="button" onClick={() => input.current.click()}>Add image</button>
      <input ref={input} type="file" hidden accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        aria-label="Upload background image" onChange={add} />
      <p className="subtle">Your images are saved in this browser.</p>
      {(reading || status) && <p className="subtle" role="status">{reading ? 'Opening image…' : status}</p>}
    </> : <p className="subtle">Video backgrounds are available in supported desktop browsers.</p>}
  </fieldset>;
}
