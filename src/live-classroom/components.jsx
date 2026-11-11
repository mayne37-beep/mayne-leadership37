import React, { useEffect, useRef } from 'react';
import { Icon } from './icons.jsx';

export function DeviceSelect({ title, devices, kind, value, onChange }) {
  return <label className="field">{title}
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">System default</option>
      {devices.filter(d => d.kind === kind && d.deviceId && !['default', 'communications'].includes(d.deviceId))
        .map((device, i) => <option key={device.deviceId} value={device.deviceId}>{device.label || title + ' ' + (i + 1)}</option>)}
    </select>
  </label>;
}

export function Modal({ title, children, close }) {
  const dialog = useRef(null);
  useEffect(() => {
    dialog.current.showModal();
    const node = dialog.current;
    return () => node.close();
  }, []);
  return <dialog className="modal" ref={dialog} aria-label={title} onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2>{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={close}><Icon name="close" /></button></header>
    {children}
  </dialog>;
}
