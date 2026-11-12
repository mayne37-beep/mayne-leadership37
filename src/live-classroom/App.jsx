import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from './icons.jsx';
import { cleanText } from './shared.js';
import { copyLink, displayTime, downloadCsv, guestLink, instructorAuth, newNonce, request } from './client.js';
import { DeviceSelect, MeetingInvitation, Modal } from './components.jsx';
import { Meeting } from './Meeting.jsx';

const requestedInvite = new URLSearchParams(location.search).get('invite') || '';
const storageKey = id => 'mayne-live-classroom-rooms:' + id;

function savedRooms(id) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(id)) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function Brand({ guest = false }) {
  return <header className="brandbar">
    <a className="brand" href={guest ? '/live-classroom.html' : '/facilitation.html'}>
      <span className="brand-symbol"><Icon name="camera" size={19} /></span><span>Mayne Leadership</span>
    </a>
    <span className="brand-divider" aria-hidden="true" />
    <span className="brand-area">Live Classroom</span>
    {!guest && <a className="brand-back" href="/facilitation.html">Classroom tools <Icon name="arrow" size={15} /></a>}
  </header>;
}

function Notice({ title, detail, children }) {
  return <section className="notice-card">
    <div className="notice-icon"><Icon name="camera" size={28} /></div>
    <h1>{title}</h1>
    {detail && <p>{detail}</p>}
    {children}
  </section>;
}

function Prejoin({ meeting, host, onJoin, onBack, busy }) {
  const [name, setName] = useState(host ? 'Instructor' : '');
  const [options, setOptions] = useState({ video: false, audio: false, camera: '', microphone: '', speaker: '' });
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState('');
  const [time, setTime] = useState(Date.now());
  const video = useRef(null);
  const preview = useRef(null);
  const setOption = (key, value) => setOptions(old => ({ ...old, [key]: value }));
  const readDevices = () => navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => {});
  useEffect(() => {
    readDevices();
    const timer = setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!options.video) return;
    let active = true;
    const node = video.current;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: options.camera ? { deviceId: { exact: options.camera } } : true, audio: false,
        });
        if (!active) return stream.getTracks().forEach(track => track.stop());
        preview.current = stream;
        node.srcObject = stream;
        setError('');
        readDevices();
      } catch {
        if (active) {
          setError('Camera preview is unavailable. Check browser permissions or choose another device.');
          setOption('video', false);
        }
      }
    })();
    return () => {
      active = false;
      preview.current?.getTracks().forEach(track => track.stop());
      preview.current = null;
      if (node) node.srcObject = null;
    };
  }, [options.video, options.camera]);
  const ready = time / 1000 >= meeting.start - 2;
  const isOver = time / 1000 >= meeting.end;
  return <div className="prejoin">
    <div className="prejoin-heading"><div className="prejoin-label">{host ? 'Organizer' : 'Meeting invitation'}</div>
      <h1>{meeting.title}</h1><p>{isOver ? 'This meeting has ended.' :
        ready ? 'Choose your audio and video settings.' : 'Starts ' + displayTime(meeting.start)}</p></div>
    <div className="prejoin-card">
      <div className="preview-camera">
        {options.video
          ? <video ref={video} muted autoPlay playsInline aria-label="Camera preview" />
          : <div className="preview-off"><Icon name="camera" off size={27} /><span>Camera is off</span></div>}
        <div className="preview-toggles">
          <button type="button" className={options.video ? 'media-toggle on' : 'media-toggle'} aria-pressed={options.video}
            title={options.video ? 'Turn camera off' : 'Turn camera on'} aria-label="Preview camera"
            onClick={() => setOption('video', !options.video)}><Icon name="camera" off={!options.video} /></button>
          <button type="button" className={options.audio ? 'media-toggle on' : 'media-toggle'} aria-pressed={options.audio}
            title={options.audio ? 'Join muted' : 'Join with microphone on'} aria-label="Microphone on when joining"
            onClick={() => setOption('audio', !options.audio)}><Icon name="mic" off={!options.audio} /></button>
        </div>
      </div>
      <form className="prejoin-form" onSubmit={e => {
        e.preventDefault();
        if (isOver || !ready || !cleanText(name, 70)) return;
        preview.current?.getTracks().forEach(track => track.stop());
        onJoin(cleanText(name, 70), options);
      }}>
        <label className="field">Display name<input required autoComplete="name" maxLength={70}
          placeholder="Enter your name" value={name} onChange={e => setName(e.target.value)} /></label>
        <DeviceSelect title="Camera" devices={devices} kind="videoinput" value={options.camera} onChange={v => setOption('camera', v)} />
        <DeviceSelect title="Microphone" devices={devices} kind="audioinput" value={options.microphone} onChange={v => setOption('microphone', v)} />
        {typeof HTMLMediaElement.prototype.setSinkId === 'function' &&
          <DeviceSelect title="Speaker" devices={devices} kind="audiooutput" value={options.speaker} onChange={v => setOption('speaker', v)} />}
        {error && <p className="form-status" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="btn secondary" onClick={onBack}>Back</button>
          <button className="btn primary" disabled={busy || !ready || isOver || !cleanText(name, 70)}>{host ? 'Start meeting' : 'Join meeting'}</button></div>
      </form>
    </div>
  </div>;
}

function Organizer({ account, onSignIn, onSignOut, rooms, onCreate, onOpen, onRecordings, onCopy, busy, enabled }) {
  const [scheduled, setScheduled] = useState(false);
  return <main className="organizer">
    <div className="organizer-heading">
      <div><h1>Live Classroom</h1><p>Start a video meeting or schedule one for your next class.</p></div>
      {account && <button type="button" className="btn secondary" onClick={onSignOut}>Sign out</button>}
    </div>
    <div className="organizer-layout">
      <section className="organizer-card" aria-labelledby="create-title">
        <div className="section-icon"><Icon name={scheduled ? 'calendar' : 'camera'} size={24} /></div>
        <h2 id="create-title">{scheduled ? 'Schedule a meeting' : 'New meeting'}</h2>
        {!account ? <form className="stack" onSubmit={e => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          onSignIn(form.get('email').trim(), form.get('password'));
        }}>
          <p>Sign in with your Mayne Leadership instructor account to host.</p>
          <label className="field">Email<input name="email" type="email" required autoComplete="username" /></label>
          <label className="field">Password<input name="password" type="password" required autoComplete="current-password" /></label>
          <button className="btn primary" disabled={busy || !enabled}>Sign in</button>
        </form> : <form className="stack" onSubmit={e => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          onCreate(form.get('title'), scheduled ? form.get('start') : '', Number(form.get('duration')));
        }}>
          <label className="field">Meeting title<input name="title" required maxLength={90} placeholder="e.g., Leadership 101" /></label>
          {scheduled && <label className="field">Start time<input name="start" type="datetime-local" required /></label>}
          <label className="field">Meeting length<select name="duration" key={String(scheduled)} defaultValue={scheduled ? '90' : '480'}>
            <option value="30">30 minutes</option><option value="60">1 hour</option><option value="90">90 minutes</option>
            <option value="120">2 hours</option><option value="240">4 hours</option><option value="480">8 hours</option>
          </select></label>
          <div className="form-actions start">
            <button className="btn primary" disabled={busy || !enabled}><Icon name={scheduled ? 'calendar' : 'camera'} size={17} />
              {scheduled ? 'Create invite' : 'Set up meeting'}</button>
            <button className="btn secondary" type="button" onClick={() => setScheduled(!scheduled)}>{scheduled ? 'Meet now' : 'Schedule'}</button>
          </div>
        </form>}
      </section>
      <section className="organizer-card" aria-labelledby="meetings-title">
        <div className="section-icon"><Icon name="calendar" size={24} /></div><h2 id="meetings-title">My meetings</h2>
        {rooms.length === 0 && <p>Meetings you create on this device will appear here.</p>}
        <ul className="saved-meetings">
          {rooms.map(meeting => {
            const time = Date.now() / 1000;
            const closed = meeting.closed || meeting.end <= time;
            return <li key={meeting.room}>
              <div><strong>{meeting.title}</strong><small>{closed ? 'Ended' : displayTime(meeting.start)}</small></div>
              <div className="room-actions">
                {!closed && <><button className="btn secondary" type="button" disabled={busy || !enabled} onClick={() => onCopy(meeting)}>Copy link</button>
                  <button className="btn secondary" type="button" disabled={busy || !enabled} onClick={() => onOpen(meeting)}>Open</button></>}
                {meeting.recording && <button className="btn secondary" type="button" disabled={busy || !enabled}
                  onClick={() => onRecordings(meeting)}>Recordings</button>}
              </div>
            </li>;
          })}
        </ul>
      </section>
    </div>
  </main>;
}

function App() {
  const [config, setConfig] = useState(null);
  const [account, setAccount] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [call, setCall] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [report, setReport] = useState('');
  const [recordings, setRecordings] = useState(null);
  const [guestClosed, setGuestClosed] = useState(false);
  const [inviteFor, setInviteFor] = useState(null);
  const retry = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const status = await request('status');
        if (!active) return;
        setConfig(status);
        if (requestedInvite && status.configured) {
          const invite = await request('inspect', { invite: requestedInvite });
          if (active) setSelected(invite);
        }
      } catch (error) {
        if (active) {
          setMessage(error.message);
          setConfig(value => value ?? { configured: false });
        }
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (requestedInvite) return;
    const auth = instructorAuth();
    let active = true;
    auth.getSession().then(({ data }) => { if (active) setAccount(data.session?.user ?? null); });
    const { data } = auth.onAuthStateChange((_event, session) => { if (active) setAccount(session?.user ?? null); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  const id = account?.id;
  useEffect(() => setRooms(id ? savedRooms(id) : []), [id]);

  function saveRoom(meeting) {
    const updated = [meeting, ...savedRooms(id).filter(record => record.room !== meeting.room)].slice(0, 40);
    try { localStorage.setItem(storageKey(id), JSON.stringify(updated)); } catch {}
    setRooms(updated);
  }

  async function run(operation) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try { await operation(); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  function create(title, startText, duration) {
    run(async () => {
      const fingerprint = JSON.stringify([title, startText, duration]);
      if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, nonce: newNonce() };
      const { nonce } = retry.current;
      const start = startText ? Math.floor(Date.parse(startText) / 1000) : undefined;
      if (startText && !Number.isFinite(start)) throw new Error('Choose a valid meeting start time.');
      const meeting = await request('create', { title, start, duration, nonce }, true);
      const entry = { ...meeting, nonce, host: true };
      saveRoom(entry);
      retry.current = null;
      if (startText) setInviteFor(entry);
      else setSelected(entry);
    });
  }

  function start(name, preferences) {
    run(async () => {
      const main = selected.host
        ? await request('host', { invite: selected.invite, nonce: selected.nonce }, true)
        : selected;
      setCall({ name, preferences, main, entry: selected });
    });
  }

  if (call) return <Meeting {...call} onExit={({ ended, attendance }) => {
    if (attendance) setReport(attendance);
    if (ended && call.entry.host) saveRoom({ ...call.entry, closed: true });
    if (ended && !call.entry.host) setGuestClosed(true);
    setCall(null);
    setSelected(ended || call.entry.host ? null : call.entry);
  }} />;

  return <div className="workspace">
    <Brand guest={Boolean(requestedInvite)} />
    {message && <p className="banner" role="status">{message}<button type="button" aria-label="Dismiss message"
      className="icon-button" onClick={() => setMessage('')}><Icon name="close" size={16} /></button></p>}
    {config === null ? <Notice title="Opening Live Classroom…" /> :
      requestedInvite && guestClosed ? <Notice title="The meeting has ended" detail="The organizer closed this meeting." /> :
      requestedInvite && !selected ? <Notice title="Meeting unavailable" detail={config.configured
        ? 'Ask the organizer for a current meeting link.' : 'Live video is awaiting service setup.'} /> :
      selected ? <Prejoin meeting={selected} host={selected.host} busy={busy} onJoin={start} onBack={() => {
        if (requestedInvite) location.assign('/live-classroom.html');
        else { setSelected(null); setMessage(''); }
      }} /> :
      <>
        {!config.configured && <p className="banner">Live video is awaiting service setup.</p>}
        <Organizer account={account} rooms={rooms} busy={busy} enabled={config.configured}
          onSignIn={(email, password) => run(async () => {
            const { error } = await instructorAuth().signInWithPassword({ email, password });
            if (error) throw new Error(error.message);
          })}
          onSignOut={() => run(async () => {
            const { error } = await instructorAuth().signOut({ scope: 'local' });
            if (error) throw new Error(error.message);
            setReport('');
          })}
          onCreate={create} onOpen={setSelected} onCopy={setInviteFor}
          onRecordings={entry => run(async () => {
            const data = await request('recordings', { invite: entry.invite, nonce: entry.nonce }, true);
            setRecordings({ entry, items: data.recordings });
          })} />
        {report && <div className="report-card"><span>Attendance from your last meeting</span>
          <button className="btn secondary" type="button" onClick={() => downloadCsv(report)}><Icon name="download" size={17} /> Download CSV</button></div>}
      </>}
    {inviteFor && <MeetingInvitation link={guestLink(inviteFor.invite)}
      details={inviteFor.title + ' · ' + displayTime(inviteFor.start)} close={() => setInviteFor(null)}
      onCopy={link => run(async () => {
        await copyLink(link);
        setInviteFor(null);
        setMessage('Meeting link copied.');
      })} />}
    {recordings && <Modal title="Meeting recordings" close={() => setRecordings(null)}>
      {recordings.items.length === 0 && <p>No cloud recordings yet. Processing can take a few minutes.</p>}
      <ul className="saved-meetings">{recordings.items.map(item => <li key={item.id}>
        <div><strong>{item.start ? displayTime(item.start) : 'Recording'}</strong><small>{item.status === 'finished' ? 'Ready' : item.status}</small></div>
        {item.status === 'finished' && <button type="button" className="btn secondary" onClick={() => run(async () => {
          const { invite, nonce } = recordings.entry;
          const data = await request('download-recording', { id: item.id, invite, nonce }, true);
          if (new URL(data.download).protocol !== 'https:') throw new Error('The recording is unavailable.');
          location.assign(data.download);
        })}>Download</button>}
      </li>)}</ul>
    </Modal>}
  </div>;
}

createRoot(document.getElementById('live-classroom')).render(<App />);
