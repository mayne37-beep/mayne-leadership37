import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { DeviceSelect, MeetingInvitation, Modal } from './components.jsx';
import { activityPath, attendanceCsv, cleanText, presentationOf, presenterLayouts, reactions } from './shared.js';
import { copyLink, downloadCsv, guestLink, newNonce, request } from './client.js';
import { participantName, useCall } from './use-call.js';
import { BackgroundSettings, loadBackgroundChoice, loadBackgrounds } from './BackgroundSettings.jsx';
import { PresenterView } from './PresenterView.jsx';
import { PresenterStudio } from './PresenterStudio.jsx';
import { usePresenterStudio } from './use-presenter-studio.js';
import { backgroundSettings, blurOptions, cameraPresentationSettings, coverageOptions, sampleBackdropColor } from './camera-settings.js';
import { useCameraEffects } from './use-camera-effects.js';
import { PollResults, QuickPolls } from './QuickPolls.jsx';
import { emptyPollDraft, readSharedPoll } from './quick-poll.js';
import { useQuickPoll } from './use-quick-poll.js';
import { assignableRoles, canParticipate, changeParticipantRole, meetingRoles, participantCanSend, participantRole } from './meeting-roles.js';
import { loadMeetingPreferences, saveMeetingPreferences } from './preferences.js';
import { DocumentControls, DocumentPresentation } from './DocumentPresentation.jsx';
import { useDocumentPresentation } from './use-document-presentation.js';

const APP_MESSAGE = 'mayne-live-classroom';
const PAGE_SIZE = 9;
const POLL_CHAT_HISTORY = 10;
const REACTION_DURATION_MS = 2800;
const EMPTY_CHAT = [];
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

function MenuItem({ icon, children, onClick, danger, selected, disabled }) {
  return <button type="button" className={'menu-item' + (danger ? ' danger' : '')} onClick={onClick} disabled={disabled}
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
    {person.userData?.raised && canParticipate(person) && <span className="hand-badge" title="Hand raised" aria-label="Hand raised">✋</span>}
    {!screen && onPin && <button type="button" className="tile-pin" aria-pressed={focused}
      aria-label={focused ? 'Unpin ' + name : 'Pin ' + name} onClick={onPin}><Icon name="pin" size={16} /></button>}
  </article>;
}

function Stage({ participants, speaker, view, pin, spotlight, setPin, hideSelf, hideVideo, caption, onEditPresentation }) {
  const [page, setPage] = useState(0);
  const shown = participants.filter(person => !hideSelf || !person.local || participants.length === 1);
  const shares = participants.filter(person => playable(person, 'screenVideo'));
  const shared = shares.find(person => presentationOf(person).composed) ?? shares[0];
  const { layout, side, mirror, composed } = presentationOf(shared);
  const presenterCamera = !composed && layout !== 'standard' && shown.includes(shared) && (!hideVideo || shared.local)
    ? playable(shared, 'video') : null;
  const chosen = shown.find(person => person.session_id === pin);
  const speaking = shown.find(person => person.session_id === speaker || (speaker === 'local' && person.local));
  const spotlighted = shown.find(person => person.session_id === spotlight);
  const focus = chosen || spotlighted || (view === 'speaker' ? speaking || shown[0] : null);
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const tiles = shown.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const showCameraInStrip = shared?.userData?.presentation?.layout === 'document';
  const strip = shown.filter(person => person !== ((composed && !showCameraInStrip) || presenterCamera ? shared : shared ? null : focus));
  const render = person => <Tile key={person.session_id} person={person} hidden={hideVideo}
    active={person.session_id === speaking?.session_id} focused={person.session_id === pin}
    onPin={() => setPin(person.session_id === pin ? '' : person.session_id)} />;
  return <div className="stage">
    {(shared || focus) ? <div className="focus-layout">
      {presenterCamera ? <PresenterView screen={playable(shared, 'screenVideo')} camera={presenterCamera}
        side={side} layout={layout} name={participantName(shared)} coverage={shared.userData?.cameraCoverage} mirror={mirror}
        backdropColor={shared.userData?.cameraBackdrop} />
        : shared ? <Tile person={shared} screen /> : render(focus)}
      {shown.length > 1 && strip.length > 0 && <div className="filmstrip">{strip.map(render)}</div>}
    </div> : <div className="gallery" data-count={Math.max(1, tiles.length)}>{tiles.map(render)}</div>}
    {!shared && !focus && pageCount > 1 && <div className="page-controls">
      <button type="button" className="icon-button prev" aria-label="Previous gallery page"
        disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><Icon name="chevron" /></button>
      <span>{currentPage + 1} / {pageCount}</span>
      <button type="button" className="icon-button next" aria-label="Next gallery page"
        disabled={currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}><Icon name="chevron" /></button>
    </div>}
    {composed && shared.local && onEditPresentation && <button className="btn secondary edit-live-presentation" type="button"
      onClick={onEditPresentation}><Icon name="layers" size={17} /> Edit live presentation</button>}
    {caption && <div className="caption" role="status"><strong>{caption.name}</strong> {caption.text}</div>}
  </div>;
}

function People({ state, host, moderate, onInvite, lowerHand, setPin, pin, setSpotlight, spotlight, setRole, busy }) {
  const [query, setQuery] = useState('');
  const shown = state.participants.filter(person => participantName(person).toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <div className="side-tools">
      {host && <button className="btn secondary" type="button" onClick={onInvite}><Icon name="link" size={16} /> Meeting link</button>}
      <label className="field sr-field">Find a participant<input placeholder="Find a participant" value={query}
        onChange={e => setQuery(e.target.value)} /></label>
      {host && <p className="subtle">Role assignments apply while a participant is connected to this room.</p>}
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
        {host && shown.some(p => !p.owner && p.audio) &&
          <button className="text-button" type="button" onClick={() => moderate('mute-all')}>Mute all</button>}</header>
      {shown.length === 0 && <p className="subtle">No matching participants.</p>}
      <ul>{shown.map(person => {
        const id = person.session_id;
        const name = participantName(person);
        const role = participantRole(person);
        const manage = host && !person.local && !person.owner;
        const raised = person.userData?.raised && canParticipate(person);
        return <li key={id}>
          <Avatar name={name} />
          <div className="person-name"><strong>{name}{person.local ? ' (you)' : ''}</strong>
            {manage ? <select className="person-role" aria-label={'Role for ' + name} value={role} disabled={busy}
              onChange={event => setRole(id, event.target.value)}>
              {assignableRoles.map(option => <option key={option} value={option}>{meetingRoles[option].label}</option>)}
            </select> : <small>{meetingRoles[role].label}</small>}
          </div>
          {raised && <span title="Hand raised" aria-label="Hand raised">✋</span>}
          <Icon name="mic" size={16} off={!person.audio} />
          <details className="person-options">
            <summary aria-label={'Actions for ' + name}><Icon name="more" size={18} /></summary>
            <div className="person-menu">
              <MenuItem icon="pin" onClick={() => setPin(pin === id ? '' : id)}>{pin === id ? 'Unpin' : 'Pin for me'}</MenuItem>
              {host && <MenuItem icon="view" onClick={() => setSpotlight(spotlight === id ? '' : id)}>
                {spotlight === id ? 'Remove spotlight' : 'Spotlight for everyone'}</MenuItem>}
              {manage && <>
                <MenuItem icon="mic" onClick={() => moderate('mute', id)}>Mute</MenuItem>
                {raised && <MenuItem icon="hand" onClick={() => lowerHand(id)}>Lower hand</MenuItem>}
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

function Chat({ items, send, canWrite }) {
  const [text, setText] = useState('');
  const log = useRef(null);
  useEffect(() => { log.current.scrollTop = log.current.scrollHeight; }, [items]);
  return <>
    <div className="chat-log" role="log" aria-label="Meeting messages" ref={log}>
      {items.length === 0 && <div className="chat-empty"><Icon name="chat" size={30} /><p>Messages sent during this meeting will appear here.</p></div>}
      {items.map(item => {
        const time = new Date(item.time);
        const byline = <small>{item.own ? 'You' : item.name} <time dateTime={time.toISOString()}>
          {time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></small>;
        return item.poll ? <article className="chat-poll" key={item.id}>
          <div className="chat-poll-label"><Icon name="poll" size={16} /> Poll results</div>
          {byline}
          <PollResults poll={item.poll} results={item.poll.results} title={item.poll.question} announce={false} />
        </article> : <div key={item.id} className={item.own ? 'message own' : 'message'}>
          {byline}
          <p>{item.text}</p>
        </div>;
      })}
    </div>
    {canWrite ? <form className="chat-form" onSubmit={event => {
      event.preventDefault();
      if (send(text)) setText('');
    }}>
      <input aria-label="Message" value={text} onChange={e => setText(e.target.value)}
        placeholder="Type a message" maxLength={1500} required />
      <button className="icon-button" type="submit" aria-label="Send message" title="Send message" disabled={!text.trim()}><Icon name="send" /></button>
    </form> : <p className="chat-form subtle">Observers can read meeting chat.</p>}
  </>;
}

function DeviceSettings({ preferences, setDevice, canCamera, canMic, children }) {
  const [devices, setDevices] = useState([]);
  useEffect(() => {
    const update = () => navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => {});
    update();
    navigator.mediaDevices?.addEventListener('devicechange', update);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', update);
  }, []);
  return <div className="side-content stack">
    {canCamera && <DeviceSelect title="Camera" devices={devices} kind="videoinput" value={preferences.camera} onChange={v => setDevice('camera', v)} />}
    {canMic && <DeviceSelect title="Microphone" devices={devices} kind="audioinput" value={preferences.microphone} onChange={v => setDevice('microphone', v)} />}
    {typeof HTMLMediaElement.prototype.setSinkId === 'function' &&
      <DeviceSelect title="Speaker" devices={devices} kind="audiooutput" value={preferences.speaker} onChange={v => setDevice('speaker', v)} />}
    {children}
  </div>;
}

function CameraEffectsSettings({ camera, rawCamera, cameraOn, settings, tune, busy, adjusting, advanced, background }) {
  const [sampling, setSampling] = useState(false);
  const preview = useRef(null);
  const solid = settings.backdropMode === 'solid';
  const sampleSource = cameraOn ? rawCamera ?? (background ? null : camera) : null;
  const picking = solid && sampling && sampleSource;
  const previewTrack = picking ? sampleSource : camera;

  function sample(event) {
    if (!picking || busy) return;
    const color = sampleBackdropColor(preview.current?.querySelector('video'), event.clientX, event.clientY);
    if (!color) return;
    setSampling(false);
    tune({ backdropColor: color });
  }

  return <fieldset className="camera-effects-settings" disabled={busy}>
    <legend>Camera effects</legend>
    <div ref={preview} className={'camera-effects-preview' + (picking ? ' sampling-backdrop' : '')}
      role="group" aria-label="Camera preview" onPointerDown={sample}>
      {previewTrack ? <Track track={previewTrack} mirror label="Your camera preview" />
        : <p className="subtle">{adjusting || cameraOn ? 'Preparing your camera…' : 'Turn on your camera to see the preview.'}</p>}
    </div>
    <label className="field">Background removal
      <select value={settings.backdropMode} onChange={event => {
        setSampling(false);
        tune({ backdropMode: event.target.value });
      }}>
        <option value="automatic">Automatic</option>
        <option value="solid">Solid backdrop (green screen)</option>
      </select>
    </label>
    {solid && <>
      <div className="backdrop-controls">
        <label className="field">Backdrop color
          <input type="color" value={settings.backdropColor} onChange={event => tune({ backdropColor: event.target.value })} />
        </label>
        <button className="btn secondary" type="button" disabled={!sampleSource} aria-pressed={Boolean(picking)}
          onClick={() => setSampling(!sampling)}>{picking ? 'Cancel sampling' : 'Sample from camera'}</button>
      </div>
      <p className="subtle">{picking ? 'Click the backdrop in your camera preview.' : 'Use an evenly lit backdrop with a color that differs from your hair, skin, and clothing.'}</p>
      {background && <p className="subtle">Choose None under Video background to use the solid backdrop directly in Weather view.</p>}
    </>}
    <label className="field">Subject outline
      <select value={settings.coverage} onChange={event => tune({ coverage: event.target.value })}>
        {coverageOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
    <p className="subtle">{advanced ? 'Use Keep more of me if the effect cuts into your outline.'
      : 'Background removal and subject outline settings apply to Weather view on this device.'}</p>
    <label className="field">Blur strength
      <select value={settings.blur} onChange={event => tune({ blur: event.target.value })}>
        {blurOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
    {adjusting && <p className="subtle" role="status">Updating camera effects…</p>}
  </fieldset>;
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

function Activity({ url, host, publish, studioConnection }) {
  const [input, setInput] = useState('');
  const studioUrl = '/word-cloud-studio.html' + (studioConnection ? '?live-classroom=' + studioConnection : '');
  return <div className={url ? 'activity-content with-activity' : 'activity-content'}>
    {host && <>
      <section className="activity-launch">
        <h3>Classroom Response Studio</h3>
        <p className="subtle">{studioConnection ? 'Start or share a live session from the studio.' : 'Copy the student link from the studio to share it here.'}</p>
        <a className="btn primary" href={studioUrl} target="_blank" rel="noopener noreferrer">Open Response Studio <Icon name="arrow" size={15} /></a>
      </section>
      <form className="activity-form" onSubmit={event => { event.preventDefault(); if (publish(input)) setInput(''); }}>
        <label className="field">Student code or link<input placeholder="e.g., 1234567" value={input}
          onChange={e => setInput(e.target.value)} maxLength={600} required /></label>
        <p className="subtle">Use a Response Studio code or a Collaboration Canvas guest link.</p>
        <div className="form-actions start"><button className="btn secondary">Share activity</button>
          {url && <button className="btn secondary" type="button" onClick={() => publish('')}>Remove</button>}</div>
      </form>
    </>}
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
  const [savedPreferences] = useState(loadMeetingPreferences);
  const [preferences, setPreferences] = useState(initialPrefs);
  const [target, setTarget] = useState(main);
  const [panel, setPanel] = useState('');
  const [pollDraft, setPollDraft] = useState(emptyPollDraft);
  const [dismissedPollId, setDismissedPollId] = useState('');
  const [seenPollResults, setSeenPollResults] = useState('');
  const [menu, setMenu] = useState('');
  const [view, setView] = useState(savedPreferences.view);
  const [pin, setPin] = useState('');
  const [spotlight, setSpotlight] = useState('');
  const [hideSelf, setHideSelf] = useState(savedPreferences.hideSelf);
  const [hideVideo, setHideVideo] = useState(savedPreferences.hideVideo);
  const [customBackgrounds, setCustomBackgrounds] = useState(loadBackgrounds);
  const [caption, setCaption] = useState(null);
  const [showCaptions, setShowCaptions] = useState(savedPreferences.showCaptions);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [visuals, setVisuals] = useState([]);
  const [chat, setChat] = useState({});
  const [unread, setUnread] = useState(0);
  const [activity, setActivity] = useState('');
  const [studioConnection] = useState(() => host && typeof BroadcastChannel === 'function' ? newNonce() : '');
  const [groups, setGroups] = useState([]);
  const [incoming, setIncoming] = useState(null);
  const [locked, setLocked] = useState(main.locked);
  const [inviteDialog, setInviteDialog] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [adjustingCamera, setAdjustingCamera] = useState(false);
  const [time, setTime] = useState(Date.now());
  const attendance = useRef(new Map());
  const started = useRef(Date.now());
  const mediaIntent = useRef({ audio: initialPrefs.audio, video: initialPrefs.video });
  const breakoutRound = useRef(null);
  const returnToken = useRef('');
  const closing = useRef(false);
  const leaving = useRef(false);
  const chatHistory = useRef({});
  const chatLastSent = useRef(0);
  const stateRequests = useRef({ call: null, participants: new Set() });
  const previousRole = useRef(null);
  const studioMessage = useRef(null);
  const soundBlocked = useRef(() => setAudioBlocked(true)).current;
  const cameraFailure = useRef(null);
  const restoreCamera = useRef(false);
  const setup = { invite: entry.invite, nonce: entry.nonce };
  const { ref, state, connect, disconnect, update, updateLocalData } = useCall({
    onMessage: receive,
    onBackgroundError: () => cameraFailure.current?.(),
    onCaption: (event, person) => {
      const text = cleanText(event.text, 500);
      if (text) setCaption({ text, name: participantName(person), time: Date.now() });
    },
    onAttendance: trackAttendance,
  });
  const call = () => ref.current;
  const currentRoom = target.url;
  const activeCall = state.phase === 'connected' && state.room === currentRoom;
  const activeInstance = activeCall ? call() : null;
  const local = state.participants.find(person => person.local);
  const remoteOrganizer = state.participants.find(person => !person.local && person.owner)?.session_id;
  const localRole = participantRole(local);
  const organizer = host && Boolean(local?.owner);
  const canInteract = canParticipate(local);
  const canCamera = participantCanSend(local, 'video');
  const canMic = participantCanSend(local, 'audio');
  const canPresent = participantCanSend(local, 'screenVideo');
  const filePresentation = useDocumentPresentation({ call: activeInstance, allowed: canPresent, notify: setNotice, sync: updateLocalData });
  const quick = useQuickPoll({
    callRef: ref, call: activeInstance, organizer, participants: state.participants,
    localPoll: state.localData.quickPoll, sync: updateLocalData, send, onShared: publishPollChat,
  });
  const votingPollId = !organizer && quick.canVote && quick.poll?.open && !quick.answered ? quick.poll.id : '';
  const pollPopupOpen = Boolean(votingPollId && votingPollId !== dismissedPollId);
  const sharedPollId = !organizer && quick.poll?.results ? quick.poll.id : '';
  const cameraEffects = useCameraEffects({ callRef: ref, notify: setNotice, nativeSupported: state.videoEffects,
    sync: updateLocalData, initialChoice: () => loadBackgroundChoice(customBackgrounds) });
  cameraFailure.current = cameraEffects.onDailyError;
  const localCamera = playable(local, 'video');
  const studio = usePresenterStudio({
    call: activeInstance,
    camera: state.video ? cameraEffects.rawCamera ?? localCamera : null,
    cameraSettings: {
      coverage: cameraEffects.settings.coverage,
      backdropColor: cameraEffects.settings.backdropMode === 'solid' &&
        (cameraEffects.rawCamera || !cameraEffects.choice) ? cameraEffects.settings.backdropColor : null,
    },
    sync: updateLocalData,
    notify: setNotice,
  });
  studioMessage.current = (message, channel) => {
    if (message?.type !== 'share' || typeof message.requestId !== 'string' || !/^[a-f0-9]{32}$/.test(message.requestId) ||
        typeof message.code !== 'string' || !/^\d{6,7}$/.test(message.code)) return;
    const shared = publish(message.code);
    if (shared) {
      setMenu('');
      setPanel('activity');
    }
    channel.postMessage({ type: 'share-result', requestId: message.requestId, shared });
  };

  useEffect(() => {
    setPin('');
    setSpotlight('');
    setCaption(null);
    setVisuals([]);
    setDismissedPollId('');
    setUnread(0);
    cameraEffects.stop();
    const enhancedBackground = cameraEffects.enhanced && cameraEffects.choice;
    restoreCamera.current = Boolean(enhancedBackground && preferences.video);
    let input;
    if (!enhancedBackground && cameraEffects.choice) {
      try { input = backgroundSettings(cameraEffects.choice, cameraEffects.settings.blur); }
      catch { setNotice('The saved camera image could not be opened. Choose another background in Device settings.'); }
    }
    connect(target, name, restoreCamera.current ? { ...preferences, video: false } : preferences, input,
      { ...cameraPresentationSettings(cameraEffects.settings, cameraEffects.choice), presentation: loadMeetingPreferences().presentation });
  }, [target, name, connect]);
  useEffect(() => { saveMeetingPreferences({ view, hideSelf, hideVideo, showCaptions }); }, [view, hideSelf, hideVideo, showCaptions]);
  useEffect(() => {
    if (!restoreCamera.current || !activeInstance || activeInstance !== call() || busy) return;
    restoreCamera.current = false;
    if (canCamera) adjustCamera(() => cameraEffects.setVideo(activeInstance, true, preferences.camera));
  }, [activeInstance, busy, canCamera]);
  useEffect(() => {
    const previous = previousRole.current;
    previousRole.current = { call: activeInstance, role: localRole };
    if (!activeInstance || activeInstance !== call() || previous?.call !== activeInstance || previous.role === localRole) return;
    setNotice('Your role is now ' + meetingRoles[localRole].label + '.');
    if (!canPresent) {
      if (studio.status === 'idle' && state.sharing) {
        try { activeInstance.stopScreenShare(); } catch {}
      }
      if (studio.open || studio.status !== 'idle') {
        studio.stop();
        studio.closeEditor();
      }
      setMenu(value => ['share', 'presenter'].includes(value) ? '' : value);
    }
    if (!canInteract) {
      setMenu(value => value === 'react' ? '' : value);
      setPanel(value => value === 'activity' ? '' : value);
      if (state.localData.raised) updateLocalData({ raised: false }, activeInstance).catch(() => {});
    }
    if (!canCamera) {
      cameraEffects.setVideo(activeInstance, false, preferences.camera).catch(cameraEffects.stop);
    }
    if (!canMic) {
      try { activeInstance.setLocalAudio(false, { forceDiscardTrack: true }); } catch {}
    }
  }, [activeInstance, localRole]);
  useEffect(() => {
    if (quick.answered) setNotice('Poll response submitted.');
  }, [quick.answered]);
  useEffect(() => {
    if ((panel === 'polls' || panel === 'chat') && sharedPollId) setSeenPollResults(sharedPollId);
  }, [panel, sharedPollId]);
  useEffect(() => {
    if (!sharedPollId || !activeInstance || activeInstance !== call()) return;
    const sender = activeInstance.participants()[quick.publisher];
    if (sender?.owner) appendPollChat(currentRoom, quick.poll, sender);
  }, [activeInstance, currentRoom, quick.poll, quick.publisher, sharedPollId]);
  useEffect(() => {
    if (state.phase === 'left' || state.phase === 'error') cameraEffects.stop();
  }, [state.phase, cameraEffects.stop]);
  useEffect(() => {
    const timer = setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (state.phase === 'connected') mediaIntent.current = { audio: state.audio, video: state.video };
  }, [state.phase, state.audio, state.video]);
  useEffect(() => {
    if (!host && activeInstance && remoteOrganizer) send('request-state', {}, '*', activeInstance);
  }, [activeInstance, host, remoteOrganizer]);
  useEffect(() => {
    if (!studioConnection) return;
    const channel = new BroadcastChannel('mayne-response-studio:' + studioConnection);
    channel.onmessage = event => studioMessage.current(event.data, channel);
    return () => channel.close();
  }, [studioConnection]);
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

  function send(type, fields = {}, recipient = '*', expectedCall) {
    const instance = call();
    if (instance?.meetingState() !== 'joined-meeting' || (expectedCall && instance !== expectedCall)) return false;
    if (['chat', 'reaction'].includes(type) && !canParticipate(instance.participants().local)) return false;
    instance.sendAppMessage({ app: APP_MESSAGE, type, ...fields }, recipient);
    return true;
  }

  function appendMessage(room, item) {
    const items = chatHistory.current[room] ?? [];
    if (items.some(row => row.id === item.id)) return;
    const next = [...items, item].sort((a, b) => a.time - b.time).slice(-200);
    if (!next.includes(item)) return;
    chatHistory.current = { ...chatHistory.current, [room]: next };
    setChat(chatHistory.current);
    if (panel !== 'chat') setUnread(n => Math.min(99, n + 1));
  }

  function appendPollChat(room, poll, sender) {
    appendMessage(room, {
      id: 'poll:' + poll.id, poll, time: poll.sharedAt ?? Date.now(),
      name: participantName(sender), own: sender.local,
    });
  }

  function publishPollChat(poll, instance) {
    const sender = instance.participants().local;
    if (!sender?.owner) return;
    appendPollChat(currentRoom, poll, sender);
    try { send('poll-chat', { poll }, '*', instance); } catch {} // Guests can also read the shared poll from the roster.
  }

  function react(emoji, sender) {
    const reaction = reactions.find(([value]) => value === emoji);
    if (!reaction) return;
    const [, label] = reaction;
    const id = newNonce();
    setVisuals(old => [...old.slice(-3), { id, emoji, label, name: sender }]);
    setTimeout(() => setVisuals(old => old.filter(item => item.id !== id)), REACTION_DURATION_MS);
  }

  function receive(event, participants, room) {
    const message = event.data;
    const sender = participants[event.fromId];
    if (!sender || message?.app !== APP_MESSAGE) return;
    if (message.type === 'poll-ballot' || message.type === 'poll-receipt') {
      quick.receive(message, sender);
      return;
    }
    if (message.type === 'chat' && canParticipate(sender)) {
      const text = cleanText(message.text, 1500);
      if (!text || !/^[a-f0-9]{32}$/.test(message.id ?? '')) return;
      appendMessage(room.url, { id: event.fromId + ':' + message.id, name: participantName(sender), text, time: Date.now() });
    }
    if (message.type === 'reaction' && canParticipate(sender)) react(message.emoji, participantName(sender));
    if (message.type === 'request-state' && host && participants.local?.owner && !sender.local) {
      if (stateRequests.current.call !== call()) stateRequests.current = { call: call(), participants: new Set() };
      if (stateRequests.current.participants.has(event.fromId)) return;
      stateRequests.current.participants.add(event.fromId);
      if (activity && !room.label) send('activity', { url: activity }, event.fromId);
      if (spotlight) send('spotlight', { id: spotlight }, event.fromId);
      const recent = (chatHistory.current[room.url] ?? []).filter(item => item.own && item.poll).slice(-POLL_CHAT_HISTORY);
      for (const item of recent) send('poll-chat', { poll: item.poll }, event.fromId);
    }
    if (!sender.owner) return;
    if (message.type === 'poll-chat') {
      const poll = readSharedPoll(message.poll);
      if (poll?.results) appendPollChat(room.url, poll, sender);
      return;
    }
    if (message.type === 'spotlight' && typeof message.id === 'string') {
      setSpotlight(message.id.slice(0, 128));
    }
    if (message.type === 'lower-hand') updateLocalData({ raised: false }).catch(() => {});
    if (message.type === 'activity' && !room.label) {
      const url = activityPath(message.url, location.origin);
      if (message.url && !url) return;
      setActivity(url);
      if (url && !host && canParticipate(participants.local)) setPanel('activity');
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
    if (!organizer || state.participants.some(person => person.owner && person.session_id === id)) return;
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
        call().updateParticipants(Object.fromEntries(state.participants.filter(person => !person.owner)
          .map(person => [person.session_id, { setAudio: false }])));
      } else {
        call().updateParticipant(id, action === 'mute' ? { setAudio: false } : { setScreenShare: false });
      }
    });
  }

  async function setRole(id, role) {
    const instance = call();
    if (!organizer || instance?.meetingState() !== 'joined-meeting') return;
    const updated = await perform(() => changeParticipantRole(instance, id, role));
    const person = instance === call() && instance.participants()[id];
    if (updated && person) setNotice(participantName(person) + ' is now ' + meetingRoles[role].label + '.');
  }

  function publish(value) {
    const url = activityPath(value, location.origin);
    if (value && !url) {
      setNotice('Enter a six- or seven-digit Response Studio code or a student link from Response Studio or Collaboration Canvas.');
      return false;
    }
    if (!organizer || target.label || !activeCall || leaving.current || closing.current) {
      setNotice('Share activities from the main meeting while it is connected.');
      return false;
    }
    try {
      if (!send('activity', { url })) throw new Error('Meeting disconnected');
    } catch {
      setNotice('Could not share the activity. Check the meeting connection and try again.');
      return false;
    }
    setActivity(url);
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
    if (key === 'camera') {
      adjustCamera(async () => {
        await cameraEffects.setCamera(activeInstance, value, state.video);
        if (activeInstance === call()) {
          setPreferences(old => ({ ...old, camera: value }));
          saveMeetingPreferences({ camera: value });
        }
      });
      return;
    }
    perform(async () => {
      if (key === 'microphone' && !participantCanSend(call()?.participants().local, 'audio')) return;
      if (key === 'microphone') await call().setInputDevicesAsync({ audioDeviceId: value || null });
      setPreferences(old => ({ ...old, [key]: value }));
      saveMeetingPreferences({ [key]: value });
    });
  }

  async function adjustCamera(operation, allowBusy = false) {
    if (!activeInstance || activeInstance !== call() || !participantCanSend(activeInstance.participants().local, 'video')) return false;
    if (allowBusy && busy) {
      try { await operation(); return true; }
      catch (error) { setNotice(error?.message || 'Could not update the camera. Try again.'); return false; }
    }
    return perform(async () => {
      setAdjustingCamera(true);
      try { await operation(); }
      finally { setAdjustingCamera(false); }
    });
  }

  function selectBackground(choice) {
    return adjustCamera(async () => {
      if (!(await cameraEffects.select(activeInstance, choice, preferences.camera, state.video))) {
        throw new Error('The camera update was interrupted.');
      }
    });
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
    studio.stop();
    filePresentation.stop();
    cameraEffects.stop();
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

  const raised = Boolean(state.localData.raised);
  const presentation = presentationOf({ userData: state.localData });
  const canShare = canPresent && Boolean(navigator.mediaDevices?.getDisplayMedia);
  function choosePresentation(patch) {
    if (!participantCanSend(call()?.participants().local, 'screenVideo')) return;
    setMenu('');
    const next = {
      layout: presentation.layout,
      side: presentation.side,
      mirror: presentation.mirror,
      ...patch,
    };
    perform(async () => {
      await updateLocalData({ presentation: next }, activeInstance);
      saveMeetingPreferences({ presentation: next });
    });
  }
  function openPresenterStudio() {
    if (!participantCanSend(call()?.participants().local, 'screenVideo')) return;
    setMenu('');
    studio.openEditor();
  }
  function openFilePresentation() {
    if (!participantCanSend(call()?.participants().local, 'screenVideo')) return;
    setMenu('');
    filePresentation.openEditor();
  }
  const memberTitle = target.label ? main.title + ' · ' + target.label : main.title;
  const displayedCaption = showCaptions && state.transcription && caption && time - caption.time < 9000 ? caption : null;
  const openGroups = groups.filter(group => group.end * 1000 > time);
  const labels = {
    chat: 'Meeting chat', people: 'Participants', rooms: 'Breakout rooms', activity: 'Classroom activity',
    polls: 'Polls', devices: 'Device settings',
  };
  const pollWaiting = Boolean(votingPollId && !pollPopupOpen && panel !== 'polls');
  const pollResultsWaiting = panel !== 'polls' && panel !== 'chat' && Boolean(sharedPollId) && seenPollResults !== sharedPollId;

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
        <Tool label={raised ? 'Lower' : 'Raise'} icon="hand" on={raised} title={raised ? 'Lower hand' : 'Raise hand'} disabled={!canInteract}
          onClick={() => {
            if (canParticipate(call()?.participants().local)) perform(() => updateLocalData({ raised: !raised }));
          }} />
        <div className="tool-wrap" data-menu-root>
          <Tool label="React" icon="react" expanded={menu === 'react'} disabled={!canInteract} onClick={() => toggleMenu('react')} />
          {canInteract && menu === 'react' && <Popover title="Reactions"><div className="emoji-options">{reactions.map(([emoji, label]) =>
            <button key={label} type="button" aria-label={label} title={label} onClick={() => {
              if (send('reaction', { emoji })) react(emoji, name);
              setMenu('');
            }}>{emoji}</button>)}</div></Popover>}
        </div>
        <div className="tool-wrap" data-menu-root>
          <Tool label="View" icon="view" expanded={menu === 'view' || menu === 'presenter'}
            onClick={() => setMenu(menu === 'view' || menu === 'presenter' ? '' : 'view')} />
          {menu === 'view' && <Popover title="Meeting views">
            <MenuItem icon="view" selected={view === 'gallery' && !pin} onClick={() => { setView('gallery'); setPin(''); setMenu(''); }}>Gallery</MenuItem>
            <MenuItem icon="people" selected={view === 'speaker' && !pin} onClick={() => { setView('speaker'); setPin(''); setMenu(''); }}>Speaker</MenuItem>
            <MenuItem icon="camera" selected={hideSelf} onClick={() => { setHideSelf(!hideSelf); setMenu(''); }}>Hide self view</MenuItem>
            <MenuItem icon="camera" selected={hideVideo} onClick={() => { setHideVideo(!hideVideo); setMenu(''); }}>Hide incoming video</MenuItem>
            {canPresent && filePresentation.status === 'idle' && (canShare || state.sharing || studio.supported) &&
              <MenuItem icon="present-side" onClick={() => setMenu('presenter')}>Presenter layouts</MenuItem>}
            {document.fullscreenEnabled && <MenuItem icon="expand" onClick={() => {
              setMenu('');
              perform(() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
            }}>Toggle fullscreen</MenuItem>}
          </Popover>}
          {canPresent && filePresentation.status === 'idle' && menu === 'presenter' && <Popover title="Presenter layouts">
            <div className="presenter-options">
              <MenuItem icon="arrow" onClick={() => setMenu('view')}>Back to views</MenuItem>
              <p className="subtle">Choose what attendees see when you share your screen.</p>
              {presenterLayouts.map(({ id, icon, label }) => <MenuItem key={id} icon={icon} selected={presentation.layout === id}
                disabled={busy || studio.status !== 'idle'} onClick={() => choosePresentation({ layout: id })}>{label}</MenuItem>)}
              {presentation.layout !== 'standard' && <fieldset className="presenter-position" disabled={busy || studio.status !== 'idle'}>
                <legend>Camera position</legend>
                {['left', 'right'].map(side => <button className="btn secondary" type="button" key={side}
                  aria-pressed={side === presentation.side} onClick={() => choosePresentation({ side })}>{side === 'left' ? 'Left' : 'Right'}</button>)}
              </fieldset>}
              <MenuItem icon="camera" selected={presentation.mirror} disabled={busy || studio.status !== 'idle'}
                onClick={() => choosePresentation({ mirror: !presentation.mirror })}>Mirror presenter camera</MenuItem>
              {studio.supported && <MenuItem icon="layers" onClick={openPresenterStudio}>Presenter Studio</MenuItem>}
            </div>
          </Popover>}
        </div>
        <Tool label="Rooms" icon="rooms" on={panel === 'rooms'} onClick={() => showPanel('rooms')} />
        <Tool label="Polls" icon="poll" on={panel === 'polls'} onClick={() => showPanel('polls')}>
          {(pollWaiting || pollResultsWaiting) && <span className="badge attention" aria-hidden="true">!</span>}
        </Tool>
        <Tool label="Activity" icon="activity" on={panel === 'activity'} disabled={!canInteract} onClick={() => showPanel('activity')} />
        <div className="tool-wrap" data-menu-root>
          <Tool label="More" icon="more" expanded={menu === 'more'} onClick={() => toggleMenu('more')} />
          {menu === 'more' && <Popover title="More actions">
            <MenuItem icon="gear" onClick={() => showPanel('devices')}>Device settings and effects</MenuItem>
            {state.transcription && <MenuItem icon="captions" selected={showCaptions}
              onClick={() => { setShowCaptions(!showCaptions); setMenu(''); }}>Show live captions</MenuItem>}
            {organizer && <>
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
          title={state.video ? 'Turn camera off' : 'Turn camera on'} disabled={!canCamera || (adjustingCamera && !state.video)}
          onClick={() => adjustCamera(() => cameraEffects.setVideo(activeInstance, !state.video, preferences.camera), state.video)} />
        <Tool label="Mic" icon="mic" on={state.audio} off={!state.audio} title={state.audio ? 'Mute microphone' : 'Unmute microphone'}
          disabled={!canMic} onClick={() => {
            if (participantCanSend(call()?.participants().local, 'audio')) perform(() => call().setLocalAudio(!state.audio));
          }} />
        <div className="tool-wrap share-wrap" data-menu-root>
          <Tool label={state.sharing ? 'Stop share' : 'Share'} icon="share" on={state.sharing}
            title={state.sharing ? 'Stop screen sharing' : canShare || !canPresent ? 'Share screen' : 'Share options'}
            disabled={!canShare && !state.sharing && !(canPresent && filePresentation.supported)}
            onClick={() => {
              if (studio.status !== 'idle') studio.stop();
              else if (filePresentation.status !== 'idle') filePresentation.stop();
              else if (state.sharing) perform(() => call().stopScreenShare());
              else if (canShare && participantCanSend(call()?.participants().local, 'screenVideo')) {
                perform(() => call().startScreenShare({ displayMediaOptions: { audio: true } }));
              } else if (canPresent) toggleMenu('share');
            }} />
          {canShare && (studio.supported || filePresentation.supported) && <button type="button" className="leave-options" aria-label="Share options" aria-expanded={menu === 'share'}
            onClick={() => toggleMenu('share')}><Icon name="down" size={15} /></button>}
          {canPresent && menu === 'share' && <Popover title="Share options">
            {filePresentation.supported && <MenuItem icon="present-standard" disabled={filePresentation.status !== 'idle'}
              onClick={openFilePresentation}>Present a file</MenuItem>}
            {studio.supported && <MenuItem icon="layers" onClick={openPresenterStudio}>
              {studio.status === 'live' ? 'Edit live presentation' : 'Presenter Studio'}</MenuItem>}
          </Popover>}
        </div>
        <div className="leave-wrap tool-wrap" data-menu-root>
          <Tool label="Leave" icon="leave" className="leave" onClick={() => target.label ? returnMain() : exit()} />
          {organizer && <button type="button" className="leave-options" aria-label="Leave options" aria-expanded={menu === 'leave'}
            onClick={() => toggleMenu('leave')}><Icon name="chevron" size={16} /></button>}
          {organizer && menu === 'leave' && <Popover title="Leave options">
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
    {(pollWaiting || pollResultsWaiting) && <div className="meeting-alert poll-invitation">
      <Icon name="poll" size={17} /><span role="status">{pollWaiting ? 'Poll open' : 'Poll results posted to chat'}</span>
      <button type="button" className="text-button" onClick={() => {
        if (pollWaiting) {
          setMenu('');
          setDismissedPollId('');
        } else {
          setSeenPollResults(sharedPollId);
          showPanel('chat');
        }
      }}>{pollWaiting ? 'Answer poll' : 'View results'}</button>
      {pollResultsWaiting && <button className="icon-button" type="button" aria-label="Dismiss poll results notice"
        onClick={() => setSeenPollResults(sharedPollId)}><Icon name="close" size={15} /></button>}
    </div>}
    <div className={'meeting-body' + (panel === 'activity' ? ' wide-panel' : '')}>
      <Stage participants={state.participants} speaker={state.speaker} view={view} pin={pin} spotlight={spotlight} setPin={setPin}
        hideSelf={hideSelf} hideVideo={hideVideo} caption={displayedCaption}
        onEditPresentation={canPresent && studio.status === 'live' ? openPresenterStudio : undefined} />
      {panel && <aside className="sidebar" aria-label={labels[panel]}>
        <header className="sidebar-heading"><h2>{labels[panel]}</h2><button type="button" className="icon-button"
          aria-label={'Close ' + labels[panel].toLowerCase()} onClick={() => setPanel('')}><Icon name="close" size={18} /></button></header>
        {panel === 'people' && <People state={state} host={organizer} moderate={moderate} onInvite={() => setInviteDialog(true)}
          lowerHand={id => send('lower-hand', {}, id)} setPin={setPin} pin={pin} setRole={setRole} busy={busy}
          spotlight={spotlight} setSpotlight={id => { setSpotlight(id); send('spotlight', { id }); }} />}
        {panel === 'chat' && <Chat items={chat[currentRoom] || EMPTY_CHAT} send={sendChat} canWrite={canInteract} />}
        {panel === 'polls' && <QuickPolls quick={quick} organizer={organizer} draft={pollDraft} setDraft={setPollDraft} />}
        {panel === 'activity' && canInteract && <Activity url={activity} host={organizer && !target.label} publish={publish} studioConnection={studioConnection} />}
        {panel === 'devices' && <DeviceSettings preferences={preferences} setDevice={setDevice} canCamera={canCamera} canMic={canMic}>
          {canCamera && (state.videoEffects || cameraEffects.enhanced) && <CameraEffectsSettings camera={localCamera} cameraOn={state.video}
            settings={cameraEffects.settings} tune={patch => adjustCamera(() => cameraEffects.tune(patch))}
            rawCamera={cameraEffects.rawCamera} background={cameraEffects.choice} busy={busy}
            adjusting={adjustingCamera} advanced={cameraEffects.enhanced} />}
          {canCamera && <BackgroundSettings supported={state.videoEffects || cameraEffects.enhanced} selected={cameraEffects.choice}
            select={selectBackground} custom={customBackgrounds} setCustom={setCustomBackgrounds} busy={busy} />}
        </DeviceSettings>}
        {panel === 'rooms' && <Rooms host={organizer} groups={openGroups} current={target.label} incoming={incoming?.end * 1000 > time ? incoming : null}
          open={(count, minutes) => { if (!openGroups.length && groups.length) breakoutRound.current = null; openRooms(count, minutes); }}
          close={closeRooms} visit={destination => { setIncoming(null); move(destination); }} back={returnMain}
          busy={busy} now={time} assign={assign} participants={state.participants} />}
      </aside>}
      <div className="reaction-overlay" aria-live="polite" aria-relevant="additions"
        style={{ '--reaction-duration': REACTION_DURATION_MS + 'ms' }}>
        <div>{visuals.map(({ id, emoji, label, name }) => <span key={id} role="img" aria-label={name + ' reacted with ' + label}>
          {emoji}</span>)}</div>
      </div>
    </div>
    {canPresent && filePresentation.status === 'live' && <DocumentControls presentation={filePresentation} />}
    <div className="meeting-audio" aria-hidden="true">
      {state.participants.filter(p => !p.local).flatMap(person => ['audio', 'screenAudio'].map(type => {
        const track = playable(person, type);
        return track && <Track key={person.session_id + ':' + type} track={track} audio speaker={preferences.speaker} onBlocked={soundBlocked} />;
      }))}
    </div>
    {canPresent && studio.open && <PresenterStudio studio={studio} cameraOn={state.video} busy={busy} sharing={state.sharing}
      stopShare={() => perform(() => activeInstance.stopScreenShare())}
      turnCameraOn={() => adjustCamera(() => cameraEffects.setVideo(activeInstance, true, preferences.camera))} />}
    {canPresent && filePresentation.open && <DocumentPresentation presentation={filePresentation} sharing={state.sharing} />}
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
    {pollPopupOpen && <Modal key={votingPollId} title="Live poll" className="poll-dialog" close={() => setDismissedPollId(votingPollId)}>
      <QuickPolls quick={quick} />
    </Modal>}
  </main>;
}
