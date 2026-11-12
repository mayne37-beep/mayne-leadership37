import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
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

export function MeetingInvitation({ link, details, close, onCopy }) {
  const [png, setPng] = useState(null);

  useEffect(() => {
    let active = true;
    setPng(null);
    QRCode.toDataURL(link, { width: 768, margin: 4, errorCorrectionLevel: 'M' }).then(
      image => { if (active) setPng(image); },
      () => { if (active) setPng(''); },
    );
    return () => { active = false; };
  }, [link]);

  return <Modal title="Meeting invitation" close={close}>
    {details && <p>{details}</p>}
    <label className="field">Guest link<input readOnly value={link} onFocus={event => event.target.select()} /></label>
    {png ? <figure className="invite-qr">
      <img src={png} alt="QR code to join the meeting" width="200" height="200" />
      <figcaption>Scan with your phone’s camera to join.</figcaption>
    </figure> : <p className="invite-qr-status" role="status">
      {png === null ? 'Preparing QR code…' : 'QR code couldn’t be generated. Copy the guest link to invite participants.'}
    </p>}
    <div className="form-actions">
      {png && <a className="btn secondary" href={png} download="live-classroom-qr.png">
        <Icon name="download" size={17} /> Download QR code
      </a>}
      <button className="btn primary" type="button" onClick={() => onCopy(link)}>Copy link</button>
    </div>
  </Modal>;
}
