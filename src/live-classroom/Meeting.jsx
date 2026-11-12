import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { DeviceSelect, MeetingInvitation, Modal } from './components.jsx';
import { activityPath, attendanceCsv, cleanText, reactions } from './shared.js';
import { copyLink, downloadCsv, guestLink, newNonce, request } from './client.js';
import { participantName, useCall } from './use-call.js';
import { BackgroundSettings, backgroundSettings, loadBackgrounds } from './BackgroundSettings.jsx';

const APP_MESSAGE = 'mayne-live-classroom';
const PAGE_SIZE = 9;
const palettes = ['lavender', 'blue', 'rose', 'green', 'gold'];

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();
}

function Avatar({ name }) {
  const color = Array.from(name).reduce((sum, char) => sum + char.codePointAt(0), 0) % palettes.length;
  return <span className={'avatar ' + palettes[color]} aria-hidden="true">{initials(name)}</span>;
}

function playable(participant, type) {
  const track = participant?.tracks?.[type];
  return track?.state === 'playable' ? track.persistentTrack ?? track.track : null;
}

function Track({ track, audio = false, speaker, onBlocked, mirror, share, label }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!track || !element) return;
    element.srcObject = new MediaStream([track]);
    element.play().catch(error => { if (audio && error.name === 'NotAllowedError') onBlocked(); });
    return () => { element.srcObject = null; };
  }, [track, audio, onBlocked]);
  useEffect(() => {
    if (audio && ref.current?.setSinkId) ref.current.setSinkId(speaker || '').catch(() => {});
  }, [audio, speaker]);
  return audio
    ? <audio ref={ref} autoPlay data-meeting-audio />
    : <video ref={ref} autoPlay muted playsInline className={share ? 'shared-screen' : mirror ? 'mirrored' : ''} aria-label={label} />;
}

function Tool({ label, icon, onClick, on, off, title, className = '', children, disabled, expanded }) {
  return <button type="button" className={'tool ' + className + (on ? ' selected' : '')}
    title={title || label} aria-label={title || label} aria-pressed={on} aria-expanded={expanded}
    onClick={onClick} disabled={disabled}>
    <span className="tool-icon"><Icon name={icon} off={off} />{children}</span><span>{label}</span>
  </button>;
}

function Popover({ title, children }) {
  return <div className="popover" role="group" aria-label={title}>{children}</div>;
}

function MenuItem({ icon, children, onClick, danger, selected }) {
  return <button type="button" className={'menu-item' + (danger ? ' danger' : '')} onClick={onClick}
    aria-pressed={selected}><Icon name={icon} size={18} /><span>{children}</span></button>;
}

function Tile({ person, active, screen = false, hidden = false, focused = false, onPin }) {
  const name = participantName(person);
  const label = name + (person.local ? ' (you)' : '');
  const media = playable(person, screen ? 'screenVideo' : 'video');
  const track = !screen && hidden && !person.local ? null : media;
  return <article className={'tile' + (active ? ' speaking' : '') + (screen ? ' screen-tile' : '')}
    aria-label={screen ? label + ' is sharing' : label}>
    {track ? <Track track={track} share={screen} mirror={!screen && person.local} label={label} /> : <Avatar name={name} />}
    <span className="tile-label">{screen ? name + ' is sharing' : label}
      {!screen && !person.audio && <Icon name="mic" off size={14} />}</span>
    {person.userData?.raised && <span className="hand-badge" title="Hand raised" aria-label="Hand raised">✋</span>}
    {!screen && onPin && <button type="button" className="tile-pin" aria-pressed={focused}
      aria-label={focused ? 'Unpin ' + name : 'Pin ' + name} onClick={onPin}><Icon name="pin" size={16} /></button>}
  </article>;
}

function Stage({ participants, speaker, view, pin, spotlight, setPin, hideSelf, hideVideo, caption, visuals }) {
  const [page, setPage] = useState(0);
  const shown = participants.filter(person => !hideSelf || !person.local || participants.length === 1);
  const shared = participants.find(person => playable(person, 'screenVideo'));
  const chosen = shown.find(person => person.session_id === pin);
  const speaking = shown.find(person => person.session_id === speaker || (speaker === 'local' && person.local));
  const spotlighted = shown.find(person => person.session_id === spotlight);
  const focus = chosen || spotlighted || (view === 'speaker' ? speaking || shown[0] : null);
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const tiles = shown.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const render = person => <Tile key={person.session_id} person={person} hidden={hideVideo}
    active={person.session_id === speaking?.session_id} focused={person.session_id === pin}
    onPin={() => setPin(person.session_id === pin ? '' : person.session_id)} />;
  return <div className="stage">
    {(shared || focus) ? <div className="focus-layout">
      {shared ? <Tile person={shared} screen /> : render(focus)}
      {shown.length > 1 && <div className="filmstrip">{shown.filter(person => shared || person !== focus).map(render)}</div>}
    </div> : <div className="gallery" data-count={Math.max(1, tiles.length)}>{tiles.map(render)}</div>}
    {!shared && !focus && pageCount > 1 && <div className="page-controls">
      <button type="button" className="icon-button prev" aria-label="Previous gallery page"
        disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><Icon name="chevron" /></button>
      <span>{currentPage + 1} / {pageCount}</span>
      <button type="button" className="icon-button next" aria-label="Next gallery page"
        disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}><Icon name="chevron" /></button>
    </div>}
    {caption && <div className="caption" role="status"><strong>{caption.name}</strong> {caption.text}</div>}
    <div className="reaction-float" aria-live="polite">
      {visuals.map(({ id, emoji, name }) => <span key={id} aria-label={name + ' reacted ' + emoji}>{emoji}</span>)}
    </div>
  </div>;
}

function People({ state, host, moderate, onInvite, lowerHand, setPin, pin, setSpotlight, spotlight }) {
  const [query, setQuery] = useState('');
  const shown = state.participants.filter(person => participantName(person).toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <div className="side-tools">
      {host && <button className="btn secondary" type="button" onClick={onInvite}><Icon name="link" size={16} /> Meeting link</button>}
      <label className="field sr-field">Find a participant<input placeholder="Find a participant" value={query}
        onChange={e => setQuery(e.target.value)} /></label>
    </div>
    {host && state.waiting.length > 0 && <section className="roster-group">
      <header><h3>In the lobby ({state.waiting.length})</h3>
        {state.waiting.length > 1 && <button className="text-button" type="button" onClick={() => moderate('admit-all')}>Admit all</button>}</header>
      <ul>{state.waiting.map(waiter => <li key={waiter.id}>
        <Avatar name={waiter.name || 'Guest'} /><span className="person-name">{waiter.name || 'Guest'}</span>
        <div className="person-actions">
          <button type="button" className="mini-btn" onClick={() => moderate('admit', waiter.id)}>Admit</button>
          <button type="button" className="icon-button" aria-label={'Decline ' + (waiter.name || 'guest')}
            onClick={() => moderate('deny', waiter.id)}><Icon name="close" size={17} /></button>
        </div>
      </li>)}</ul>
    </section>}
    <section className="roster-group">
      <header><h3>In the meeting ({state.participants.length})</h3>
        {host && shown.some(p => !p.local && p.audio) &&
          <button className="text-button" type="button" onClick={() => moderate('mute-all')}>Mute all</button>}</header>
      {shown.length === 0 && <p className="subtle">No matching participants.</p>}
      <ul>{shown.map(person => {
        const id = person.session_id;
        const name = participantName(person);
        return <li key={id}>
          <Avatar name={name} />
          <div className="person-name"><strong>{name}{person.local ? ' (you)' : ''}</strong>{person.owner && <small>Organizer</small>}</div>
          {person.userData?.raised && <span title="Hand raised" aria-label="Hand raised">✋</span>}
          <Icon name="mic" size={16} off={!person.audio} />
          <details className="person-options">
            <summary aria-label={'Actions for ' + name}><Icon name="more" size={18} /></summary>
            <div className="person-menu">
              <MenuItem icon="pin" onClick={() => setPin(pin === id ? '' : id)}>{pin === id ? 'Unpin' : 'Pin for me'}</MenuItem>
              {host && <MenuItem icon="view" onClick={() => setSpotlight(spotlight === id ? '' : id)}>
                {spotlight === id ? 'Remove spotlight' : 'Spotlight for everyone'}</MenuItem>}
              {host && !person.local && <>
                <MenuItem icon="mic" onClick={() => moderate('mute', id)}>Mute</MenuItem>
                {person.userData?.raised && <MenuItem icon="hand" onClick={() => lowerHand(id)}>Lower hand</MenuItem>}
                {person.screen && <MenuItem icon="share" onClick={() => moderate('stop-share', id)}>Stop sharing</MenuItem>}
                <MenuItem icon="close" danger onClick={() => moderate('remove', id)}>Remove from meeting</MenuItem>
              </>}
            </div>
          </details>
        </li>;
      })}</ul>
    </section>
  </>;
}

function Chat({ items, send }) {
  const [text, setText] = useState('');
  const log = useRef(null);
  useEffect(() => { log.current.scrollTop = log.current.scrollHeight; }, [items.length]);
  return <>
    <div className="chat-log" role="log" aria-label="Meeting messages" ref={log}>
      {items.length === 0 && <div className="chat-empty"><Icon name="chat" size={30} /><p>Messages sent during this meeting will appear here.</p></div>}
      {items.map(item => <div key={item.id} className={item.own ? 'message own' : 'message'}>
        <small>{item.own ? 'You' : item.name} <time dateTime={new Date(item.time).toISOString()}>
          {new Date(item.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></small>
        <p>{item.text}</p>
      </div>)}
    </div>
    <form className="chat-form" onSubmit={event => {
      event.preventDefault();
      if (send(text)) setText('');
    }}>
      <input aria-label="Message" value={text} onChange={e => setText(e.target.value)}
        placeholder="Type a message" maxLength={1500} required />
      <button className="icon-button" type="submit" aria-label="Send message" title="Send message" disabled={!text.trim()}><Icon name="send" /></button>
    </form>
  </>;
}

function DeviceSettings({ preferences, setDevice, children }) {
  const [devices, setDevices] = useState([]);
  useEffect(() => {
    const update = () => navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => {});
    update();
    navigator.mediaDevices?.addEventListener('devicechange', update);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', update);
  }, []);
  return <div className="side-content stack">
    <DeviceSelect title="Camera" devices={devices} kind="videoinput" value={preferences.camera} onChange={v => setDevice('camera', v)} />
    <DeviceSelect title="Microphone" devices={devices} kind="audioinput" value={preferences.microphone} onChange={v => setDevice('microphone', v)} />
    {typeof HTMLMediaElement.prototype.setSinkId === 'function' &&
      <DeviceSelect title="Speaker" devices={devices} kind="audiooutput" value={preferences.speaker} onChange={v => setDevice('speaker', v)} />}
    {children}
  </div>;
}

function Rooms({ host, groups, current, incoming, open, close, visit, back, busy, now, assign, participants }) {
  return <div className="side-content stack">
    {current && <div className="side-callout"><strong>{current}</strong>
      <button type="button" className="btn secondary" onClick={back}>Return to main meeting</button></div>}
    {incoming && <div className="side-callout"><strong>You're assigned to {incoming.label}</strong>
      <button type="button" className="btn primary" onClick={() => visit(incoming)}>Join room</button></div>}
    {!host && !incoming && !current && <p className="subtle">Your breakout assignment will appear here.</p>}
    {host && groups.length === 0 && <form className="stack" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      open(Number(data.get('count')), Number(data.get('minutes')));
    }}>
      <label className="field">Number of rooms<select name="count" defaultValue="2">
        {[2, 3, 4, 5, 6, 7, 8].map(n => <option key={n}>{n}</option>)}</select></label>
      <label className="field">Minutes<input name="minutes" type="number" min="1" max="60" defaultValue="10" required /></label>
      <p className="subtle">Guests in the main meeting will be assigned evenly across the rooms.</p>
      <button className="btn primary" disabled={busy || Boolean(current)}>Open rooms</button>
    </form>}
    {host && groups.length > 0 && <>
      <p className="subtle">Closes in {Math.max(0, Math.ceil((groups[0].end * 1000 - now) / 60000))} min</p>
      <ul className="saved-meetings">{groups.map(group => <li key={group.label}>
        <strong>{group.label}</strong><button type="button" className="btn secondary"
          disabled={busy || group.label === current} onClick={() => visit({ ...group, token: group.ownerToken })}>Visit</button>
      </li>)}</ul>
      {!current && participants.some(p => !p.local) && <form className="stack" onSubmit={event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        assign(data.get('participant'), groups[Number(data.get('room'))]);
      }}>
        <label className="field">Participant<select name="participant">
          {participants.filter(p => !p.local).map(person => <option key={person.session_id} value={person.session_id}>{participantName(person)}</option>)}
        </select></label>
        <label className="field">Assign to<select name="room">
          {groups.map((group, i) => <option key={group.label} value={i}>{group.label}</option>)}</select></label>
        <button className="btn secondary">Send assignment</button>
      </form>}
      <button className="btn secondary" type="button" disabled={busy} onClick={close}>Close all rooms</button>
    </>}
  </div>;
}

function Activity({ url, host, publish }) {
  const [input, setInput] = useState('');
  return <div className={url ? 'activity-content with-activity' : 'activity-content'}>
    {host && <form className="activity-form" onSubmit={event => { event.preventDefault(); if (publish(input)) setInput(''); }}>
      <label className="field">Activity join code or link<input placeholder="e.g., ABC123" value={input}
        onChange={e => setInput(e.target.value)} maxLength={600} required /></label>
      <p className="subtle">Use a Response Studio code or a Collaboration Canvas guest link.</p>
      <div className="form-actions start"><button className="btn primary">Share activity</button>
        {url && <button className="btn secondary" type="button" onClick={() => publish('')}>Remove</button>}</div>
    </form>}
    {url ? <><a className="activity-link" href={url} target="_blank" rel="noreferrer">Open in a new tab <Icon name="arrow" size={15} /></a>
      <iframe title={url.startsWith('/collaboration-join.html') ? 'Collaboration Canvas whiteboard' : 'Classroom Response Studio activity'} src={url} /></> :
      !host && <p className="subtle">Activities shared by the instructor will appear here.</p>}
  </div>;
}

function callDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pair = number => String(number).padStart(2, '0');
  const mins = Math.floor(total / 60);
  return (mins >= 60 ? pair(Math.floor(mins / 60)) + ':' : '') + pair(mins % 60) + ':' + pair(total % 60);
}

export function Meeting({ main, entry, name, preferences: initialPrefs, onExit }) {
  const host = Boolean(entry.host);
  const [preferences, setPreferences] = useState(initialPrefs);
  const [target, setTarget] = useState(main);
  const [panel, setPanel] = useState('');
  const [menu, setMenu] = useState('');
  const [view, setView] = useState('gallery');
  const [pin, setPin] = useState('');
  const [spotlight, setSpotlight] = useState('');
  const [hideSelf, setHideSelf] = useState(false);
  const [hideVideo, setHideVideo] = useState(false);
  const [background, setBackground] = useState(null);
  const [customBackgrounds, setCustomBackgrounds] = useState(loadBackgrounds);
  const [caption, setCaption] = useState(null);
  const [showCaptions, setShowCaptions] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [visuals, setVisuals] = useState([]);
  const [chat, setChat] = useState({});
  const [unread, setUnread] = useState(0);
  const [activity, setActivity] = useState('');
  const [groups, setGroups] = useState([]);
  const [incoming, setIncoming] = useState(null);
  const [locked, setLocked] = useState(main.locked);
  const [inviteDialog, setInviteDialog] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [time, setTime] = useState(Date.now());
  const attendance = useRef(new Map());
  const started = useRef(Date.now());
  const mediaIntent = useRef({ audio: initialPrefs.audio, video: initialPrefs.video });
  const breakoutRound = useRef(null);
  const returnToken = useRef('');
  const closing = useRef(false);
  const leaving = useRef(false);
  const chatLastSent = useRef(0);
  const soundBlocked = useRef(() => setAudioBlocked(true)).current;
  const setup = { invite: entry.invite, nonce: entry.nonce };
  const { ref, state, connect, disconnect, update } = useCall({
    onMessage: receive,
    onBackgroundError: () => setBackground(null),
    onCaption: (event, person) => {
      const text = cleanText(event.text, 500);
      if (text) setCaption({ text, name: participantName(person), time: Date.now() });
    },
    onAttendance: trackAttendance,
  });
  const call = () => ref.current;
  const currentRoom = target.url;
  const local = state.participants.find(person => person.local);
  const activeCall = state.phase === 'connected';
  const activeInstance = activeCall ? call() : null;

  useEffect(() => {
    setPin('');
    setSpotlight('');
    setCaption(null);
    setUnread(0);
    connect(target, name, preferences, background ? backgroundSettings(background) : undefined);
  }, [target, name, connect]);
  useEffect(() => {
    const timer = setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (state.phase === 'connected') mediaIntent.current = { audio: state.audio, video: state.video };
  }, [state.phase, state.audio, state.video]);
  useEffect(() => {
    if (state.phase !== 'connected') return;
    if (!host && !target.label) send('request-state');
  }, [state.phase, target]);
  useEffect(() => {
    if (closing.current || leaving.current || !target.label) return;
    if (state.phase === 'left' || state.phase === 'error' || time >= target.end * 1000) returnMain();
  }, [state.phase, time, target]);
  useEffect(() => {
    if (!menu) return;
    const outside = event => { if (!event.target.closest('[data-menu-root]')) setMenu(''); };
    const escape = event => { if (event.key === 'Escape') setMenu(''); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [menu]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  function trackAttendance(event, participants, room) {
    if (!host) return;
    for (const participant of participants) {
      if (!participant.session_id) continue;
      const key = room.url + ':' + participant.session_id;
      const existing = attendance.current.get(key);
      if (existing && event === 'left') existing.left = Date.now();
      if (!existing && event === 'joined') attendance.current.set(key, {
        name: participantName(participant), room: room.label || 'Main meeting', joined: Date.now(), left: null,
      });
    }
  }

  function report(final = false) {
    const end = Date.now();
    return attendanceCsv(Array.from(attendance.current.values()).map(record => ({
      ...record, left: record.left ?? (final ? end : null),
    })));
  }

  function send(type, fields = {}, recipient = '*') {
    const instance = call();
    if (instance?.meetingState() !== 'joined-meeting') return false;
    instance.sendAppMessage({ app: APP_MESSAGE, type, ...fields }, recipient);
    return true;
  }

  function appendMessage(room, item) {
    setChat(prev => {
      const items = prev[room] || [];
      if (items.some(row => row.id === item.id)) return prev;
      return { ...prev, [room]: [...items.slice(-199), item] };
    });
  }

  function react(emoji, sender) {
    const id = newNonce();
    setVisuals(old => [...old.slice(-7), { id, emoji, name: sender }]);
    setTimeout(() => setVisuals(old => old.filter(item => item.id !== id)), 3600);
  }

  function receive(event, participants, room) {
    const message = event.data;
    const sender = participants[event.fromId];
    if (!sender || message?.app !== APP_MESSAGE) return;
    if (message.type === 'chat') {
      const text = cleanText(message.text, 1500);
      if (!text || !/^[a-f0-9]{32}$/.test(message.id ?? '')) return;
      appendMessage(room.url, { id: event.fromId + ':' + message.id, name: participantName(sender), text, time: Date.now() });
      if (panel !== 'chat') setUnread(n => Math.min(99, n + 1));
    }
    if (message.type === 'reaction' && reactions.some(([emoji]) => emoji === message.emoji)) react(message.emoji, participantName(sender));
    if (message.type === 'request-state' && host && !room.label) {
      if (activity) send('activity', { url: activity }, event.fromId);
      if (spotlight) send('spotlight', { id: spotlight }, event.fromId);
    }
    if (!sender.owner) return;
    if (message.type === 'spotlight' && typeof message.id === 'string') {
      setSpotlight(message.id.slice(0, 128));
    }
    if (message.type === 'lower-hand') call()?.setUserData({ raised: false }).catch(() => {});
    if (message.type === 'activity' && !room.label) {
      const url = activityPath(message.url, location.origin);
      if (message.url && !url) return;
      setActivity(url);
      if (url && !host) setPanel('activity');
    }
    if (message.type === 'breakout' && !host && !room.label) {
      try {
        const url = new URL(message.url);
        if (url.origin !== new URL(main.url).origin || !/^\/mlcb-[a-f0-9]{32}$/.test(url.pathname) ||
            url.search || url.hash || typeof message.token !== 'string' || typeof message.returnToken !== 'string' ||
            !Number.isInteger(message.end) || message.end * 1000 <= Date.now()) return;
        setIncoming({ url: url.href, label: cleanText(message.label, 30), token: message.token,
          returnToken: message.returnToken, end: message.end });
        setPanel('rooms');
      } catch {}
    }
  }

  function showPanel(next) {
    setMenu('');
    setPanel(panel === next ? '' : next);
    if (next === 'chat') setUnread(0);
  }

  function toggleMenu(next) { setMenu(menu === next ? '' : next); }

  async function perform(operation) {
    if (busy) return false;
    setBusy(true);
    try { await operation(); return true; }
    catch (error) { setNotice(error?.message || 'This action could not be completed. Try again.'); return false; }
    finally { setBusy(false); }
  }

  function moderate(action, id) {
    if (action === 'remove') {
      const person = state.participants.find(p => p.session_id === id);
      setConfirmation({ title: 'Remove ' + participantName(person) + '?', label: 'Remove', run: () => call().updateParticipant(id, { eject: true }) });
      return;
    }
    perform(async () => {
      if (action === 'admit' || action === 'deny') {
        await call().updateWaitingParticipant(id, { grantRequestedAccess: action === 'admit' });
      } else if (action === 'admit-all') {
        await call().updateWaitingParticipants(Object.fromEntries(state.waiting.map(person => [person.id, { grantRequestedAccess: true }])));
      } else if (action === 'mute-all') {
        call().updateParticipants(Object.fromEntries(state.participants.filter(person => !person.local)
          .map(person => [person.session_id, { setAudio: false }])));
      } else {
        call().updateParticipant(id, action === 'mute' ? { setAudio: false } : { setScreenShare: false });
      }
    });
  }

  function publish(value) {
    const url = activityPath(value, location.origin);
    if (value && !url) {
      setNotice('Enter a Response Studio code or a student link from Response Studio or Collaboration Canvas.');
      return false;
    }
    setActivity(url);
    if (!target.label) send('activity', { url });
    return true;
  }

  function sendChat(value) {
    const text = cleanText(value, 1500);
    if (!text || Date.now() - chatLastSent.current < 400) return false;
    const id = newNonce();
    if (!send('chat', { id, text })) return false;
    chatLastSent.current = Date.now();
    appendMessage(currentRoom, { id, text, name, own: true, time: Date.now() });
    return true;
  }

  function setDevice(key, value) {
    perform(async () => {
      if (key !== 'speaker') await call().setInputDevicesAsync({ [key === 'camera' ? 'videoDeviceId' : 'audioDeviceId']: value || null });
      setPreferences(old => ({ ...old, [key]: value }));
    });
  }

  async function selectBackground(choice) {
    if (!activeInstance || activeInstance !== call()) return false;
    const applied = await perform(async () => {
      try {
        await activeInstance.updateInputSettings(backgroundSettings(choice));
      } catch {
        throw new Error('Could not apply the camera background. Try another image or try again.');
      }
      if (activeInstance === call()) setBackground(choice);
    });
    return applied && activeInstance === call();
  }

  function move(destination) {
    trackAttendance('left', state.participants, target);
    setPreferences(old => ({ ...old, ...mediaIntent.current }));
    setTarget(destination);
  }

  function returnMain() {
    if (!target.label) return;
    // Retain the current preferences even if the breakout was just closed by the organizer.
    trackAttendance('left', state.participants, target);
    setPreferences(old => ({ ...old, ...mediaIntent.current }));
    setTarget(host ? main : { ...main, token: target.returnToken });
  }

  function openRooms(count, minutes) {
    perform(async () => {
      breakoutRound.current ??= { round: newNonce(), count };
      const result = await request('breakouts-open', { ...setup, ...breakoutRound.current, minutes }, true);
      returnToken.current = result.returnToken;
      setGroups(result.groups);
      state.participants.filter(p => !p.local).forEach((p, index) => assign(p.session_id, result.groups[index % result.groups.length]));
    });
  }

  function assign(id, group) {
    if (!group) return;
    const { label, url, token, end } = group;
    send('breakout', { label, url, token, end, returnToken: returnToken.current }, id);
  }

  function closeRooms() {
    perform(async () => {
      if (!breakoutRound.current) return;
      await request('breakouts-close', { ...setup, ...breakoutRound.current }, true);
      breakoutRound.current = null;
      setGroups([]);
      if (target.label) returnMain();
    });
  }

  async function exit(ended = false) {
    if (leaving.current) return;
    leaving.current = true;
    trackAttendance('left', state.participants, target);
    await disconnect().catch(() => {});
    onExit({ ended, attendance: host && attendance.current.size ? report(true) : '' });
  }

  function endMeeting() {
    setConfirmation({ title: 'End meeting for everyone?', label: 'End meeting', run: async () => {
      closing.current = true;
      try {
        await request('end', { ...setup, ...breakoutRound.current }, true);
        await exit(true);
      } finally { closing.current = false; }
    } });
  }

  const raised = Boolean(local?.userData?.raised);
  const memberTitle = target.label ? main.title + ' · ' + target.label : main.title;
  const displayedCaption = showCaptions && state.transcription && caption && time - caption.time < 9000 ? caption : null;
  const openGroups = groups.filter(group => group.end * 1000 > time);
  const labels = { chat: 'Meeting chat', people: 'Participants', rooms: 'Breakout rooms', activity: 'Classroom activity', devices: 'Device settings' };

  if (!activeCall) return <div className="workspace connecting">
    <section className="notice-card">
      <div className="notice-icon"><Icon name={state.phase === 'lobby' ? 'people' : 'camera'} size={29} /></div>
      <h1>{state.phase === 'lobby' ? 'You’re in the lobby' :
        state.phase === 'error' ? 'Unable to join' : state.phase === 'left' ? 'You left the meeting' : 'Connecting…'}</h1>
      <p role="status">{state.phase === 'lobby' ? 'The organizer will let you in.' : state.error || memberTitle}</p>
      <button type="button" className="btn secondary" onClick={() => exit(state.phase === 'left' && !host)}>
        {state.phase === 'lobby' ? 'Cancel request' : 'Back'}
      </button>
    </section>
  </div>;

  return <main className="meeting" aria-label={memberTitle}>
    <header className="meeting-top">
      <div className="meeting-title">
        <span className="brand-symbol"><Icon name="camera" size={16} /></span>
        <div><strong title={memberTitle}>{memberTitle}</strong>
          <small><span className="live-dot" />{callDuration(time - started.current)} {locked && <Icon name="lock" size={13} />}</small></div>
      </div>
      <nav className="toolbar" aria-label="Meeting controls">
        <Tool label="Chat" icon="chat" on={panel === 'chat'} onClick={() => showPanel('chat')}>
          {unread > 0 && <span className="badge">{unread}</span>}</Tool>
        <Tool label="People" icon="people" on={panel === 'people'} onClick={() => showPanel('people')}>
          <span className={state.waiting.length ? 'badge attention' : 'badge'}>{state.waiting.length || state.participants.length}</span></Tool>
        <Tool label={raised ? 'Lower' : 'Raise'} icon="hand" on={raised} title={raised ? 'Lower hand' : 'Raise hand'}
          onClick={() => perform(() => call().setUserData({ raised: !raised }))} />
        <div className="tool-wrap" data-menu-root>
          <Tool label="React" icon="react" expanded={menu === 'react'} onClick={() => toggleMenu('react')} />
          {menu === 'react' && <Popover title="Reactions"><div className="emoji-options">{reactions.map(([emoji, label]) =>
            <button key={label} type="button" aria-label={label} title={label} onClick={() => {
              if (send('reaction', { emoji })) react(emoji, name);
              setMenu('');
            }}>{emoji}</button>)}</div></Popover>}
        </div>
        <div className="tool-wrap" data-menu-root>
          <Tool label="View" icon="view" expanded={menu === 'view'} onClick={() => toggleMenu('view')} />
          {menu === 'view' && <Popover title="Meeting views">
            <MenuItem icon="view" selected={view === 'gallery' && !pin} onClick={() => { setView('gallery'); setPin(''); setMenu(''); }}>Gallery</MenuItem>
            <MenuItem icon="people" selected={view === 'speaker' && !pin} onClick={() => { setView('speaker'); setPin(''); setMenu(''); }}>Speaker</MenuItem>
            <MenuItem icon="camera" selected={hideSelf} onClick={() => { setHideSelf(!hideSelf); setMenu(''); }}>Hide self view</MenuItem>
            <MenuItem icon="camera" selected={hideVideo} onClick={() => { setHideVideo(!hideVideo); setMenu(''); }}>Hide incoming video</MenuItem>
            {document.fullscreenEnabled && <MenuItem icon="expand" onClick={() => {
              setMenu('');
              perform(() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
            }}>Toggle fullscreen</MenuItem>}
          </Popover>}
        </div>
        <Tool label="Rooms" icon="rooms" on={panel === 'rooms'} onClick={() => showPanel('rooms')} />
        <Tool label="Activity" icon="activity" on={panel === 'activity'} onClick={() => showPanel('activity')} />
        <div className="tool-wrap" data-menu-root>
          <Tool label="More" icon="more" expanded={menu === 'more'} onClick={() => toggleMenu('more')} />
          {menu === 'more' && <Popover title="More actions">
            <MenuItem icon="gear" onClick={() => showPanel('devices')}>Device settings and effects</MenuItem>
            {state.transcription && <MenuItem icon="captions" selected={showCaptions}
              onClick={() => { setShowCaptions(!showCaptions); setMenu(''); }}>Show live captions</MenuItem>}
            {host && <>
              <MenuItem icon="link" onClick={() => { setInviteDialog(true); setMenu(''); }}>Meeting link</MenuItem>
              {!target.label && <MenuItem icon="lock" onClick={() => {
                setMenu('');
                perform(async () => { const data = await request('lock', { ...setup, locked: !locked }, true); setLocked(data.locked); });
              }}>{locked ? 'Unlock meeting' : 'Lock meeting'}</MenuItem>}
              <MenuItem icon="download" onClick={() => { downloadCsv(report()); setMenu(''); }}>Download attendance</MenuItem>
              {main.recording && !target.label && <MenuItem icon="record" onClick={() => {
                setMenu('');
                if (state.recording) perform(() => call().stopRecording());
                else setConfirmation({ title: 'Start cloud recording?', detail: 'Participants will see a recording notice. Cloud recording is billed by Daily.',
                  label: 'Start recording', run: () => call().startRecording() });
              }}>{state.recording ? 'Stop recording' : 'Start recording'}</MenuItem>}
              {main.captions && !target.label && <MenuItem icon="captions" onClick={() => {
                setMenu('');
                if (state.transcription) perform(() => call().stopTranscription());
                else setConfirmation({ title: 'Start live captions?', detail: 'Daily will transcribe meeting audio for live captions. Transcription is billed by Daily.',
                  label: 'Start captions', run: () => call().startTranscription() });
              }}>{state.transcription ? 'Stop live captions' : 'Start live captions'}</MenuItem>}
            </>}
          </Popover>}
        </div>
        <div className="tool-divider" />
        <Tool label="Camera" icon="camera" on={state.video} off={!state.video}
          title={state.video ? 'Turn camera off' : 'Turn camera on'} onClick={() => perform(() => call().setLocalVideo(!state.video))} />
        <Tool label="Mic" icon="mic" on={state.audio} off={!state.audio} title={state.audio ? 'Mute microphone' : 'Unmute microphone'}
          onClick={() => perform(() => call().setLocalAudio(!state.audio))} />
        <Tool label={state.sharing ? 'Stop share' : 'Share'} icon="share" on={state.sharing}
          title={state.sharing ? 'Stop screen sharing' : 'Share screen'} disabled={!navigator.mediaDevices?.getDisplayMedia && !state.sharing}
          onClick={() => perform(() => state.sharing ? call().stopScreenShare() : call().startScreenShare({ displayMediaOptions: { audio: true } }))} />
        <div className="leave-wrap tool-wrap" data-menu-root>
          <Tool label="Leave" icon="leave" className="leave" onClick={() => target.label ? returnMain() : exit()} />
          {host && <button type="button" className="leave-options" aria-label="Leave options" aria-expanded={menu === 'leave'}
            onClick={() => toggleMenu('leave')}><Icon name="chevron" size={16} /></button>}
          {menu === 'leave' && <Popover title="Leave options">
            <MenuItem icon="leave" onClick={() => target.label ? returnMain() : exit()}>{target.label ? 'Return to main meeting' : 'Leave meeting'}</MenuItem>
            <MenuItem icon="close" danger onClick={() => { setMenu(''); endMeeting(); }}>End meeting for everyone</MenuItem>
          </Popover>}
        </div>
      </nav>
    </header>
    {state.recording && <div className="meeting-alert recording" role="status"><Icon name="record" size={16} /> This meeting is being recorded.</div>}
    {state.transcription && <div className="meeting-alert" role="status"><Icon name="captions" size={16} /> Live captions are on.</div>}
    {state.network && <div className="meeting-alert" role="status">{state.network}</div>}
    {(notice || state.error) && <div className="meeting-alert" role="status">{notice || state.error}
      <button type="button" className="icon-button" aria-label="Dismiss message" onClick={() => {
        setNotice(''); update({ error: '' });
      }}><Icon name="close" size={15} /></button></div>}
    {audioBlocked && <div className="meeting-alert" role="status">Your browser paused meeting audio.
      <button className="text-button" type="button" onClick={() => {
        setAudioBlocked(false);
        document.querySelectorAll('[data-meeting-audio]').forEach(element => element.play().catch(soundBlocked));
      }}>Enable audio</button></div>}
    {incoming && incoming.end * 1000 > time && panel !== 'rooms' && <div className="meeting-alert" role="status">You’re assigned to {incoming.label}.
      <button type="button" className="text-button" onClick={() => setPanel('rooms')}>View assignment</button></div>}
    <div className={'meeting-body' + (panel === 'activity' ? ' wide-panel' : '')}>
      <Stage participants={state.participants} speaker={state.speaker} view={view} pin={pin} spotlight={spotlight} setPin={setPin}
        hideSelf={hideSelf} hideVideo={hideVideo} caption={displayedCaption} visuals={visuals} />
      {panel && <aside className="sidebar" aria-label={labels[panel]}>
        <header className="sidebar-heading"><h2>{labels[panel]}</h2><button type="button" className="icon-button"
          aria-label={'Close ' + labels[panel].toLowerCase()} onClick={() => setPanel('')}><Icon name="close" size={18} /></button></header>
        {panel === 'people' && <People state={state} host={host} moderate={moderate} onInvite={() => setInviteDialog(true)}
          lowerHand={id => send('lower-hand', {}, id)} setPin={setPin} pin={pin}
          spotlight={spotlight} setSpotlight={id => { setSpotlight(id); send('spotlight', { id }); }} />}
        {panel === 'chat' && <Chat items={chat[currentRoom] || []} send={sendChat} />}
        {panel === 'activity' && <Activity url={activity} host={host && !target.label} publish={publish} />}
        {panel === 'devices' && <DeviceSettings preferences={preferences} setDevice={setDevice}>
          <BackgroundSettings supported={state.videoEffects} selected={background} select={selectBackground}
            custom={customBackgrounds} setCustom={setCustomBackgrounds} busy={busy} />
        </DeviceSettings>}
        {panel === 'rooms' && <Rooms host={host} groups={openGroups} current={target.label} incoming={incoming?.end * 1000 > time ? incoming : null}
          open={(count, minutes) => { if (!openGroups.length && groups.length) breakoutRound.current = null; openRooms(count, minutes); }}
          close={closeRooms} visit={destination => { setIncoming(null); move(destination); }} back={returnMain}
          busy={busy} now={time} assign={assign} participants={state.participants} />}
      </aside>}
    </div>
    <div className="meeting-audio" aria-hidden="true">
      {state.participants.filter(p => !p.local).flatMap(person => ['audio', 'screenAudio'].map(type => {
        const track = playable(person, type);
        return track && <Track key={person.session_id + ':' + type} track={track} audio speaker={preferences.speaker} onBlocked={soundBlocked} />;
      }))}
    </div>
    {inviteDialog && <MeetingInvitation link={guestLink(entry.invite)} close={() => setInviteDialog(false)}
      onCopy={link => perform(async () => {
        await copyLink(link);
        setInviteDialog(false);
        setNotice('Meeting link copied.');
      })} />}
    {confirmation && <Modal title={confirmation.title} close={() => setConfirmation(null)}>
      {confirmation.detail && <p>{confirmation.detail}</p>}
      <div className="form-actions"><button type="button" className="btn secondary" onClick={() => setConfirmation(null)}>Cancel</button>
        <button type="button" className="btn primary" onClick={() => {
          const action = confirmation.run;
          setConfirmation(null);
          perform(action);
        }}>{confirmation.label}</button></div>
    </Modal>}
  </main>;
}
