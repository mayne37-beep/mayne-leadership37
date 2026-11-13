import React from 'react';
import { Icon } from './icons.jsx';
import { annotationColors, annotationEmoji, annotationTools } from './annotations.js';
import { participantName } from './use-call.js';

export function PresentationTools({ collaboration, interactive, editing, onEditing, tool, setTool, color, setColor, emoji, setEmoji }) {
  const { board, own, localId, edit } = collaboration;
  if (!board || (!own && !interactive)) return null;
  return <div className="annotation-tools">
    {(!own || !editing) && <button className="btn secondary" type="button" aria-pressed={editing} onClick={() => {
      if (own && board.mode === 'off') collaboration.setMode('presenter');
      onEditing(!editing);
    }}>
      <Icon name="pen" size={16} />{editing ? 'Finish annotating' : 'Annotate'}
    </button>}
    {own && board.mode !== 'off' && <label className="annotation-permission">Who can annotate
      <select aria-label="Who can annotate" value={board.mode} onChange={event => {
        const mode = event.target.value;
        collaboration.setMode(mode);
        onEditing(mode !== 'off');
      }}>
        <option value="off">Off</option>
        <option value="presenter">Only me</option>
        <option value="everyone">Everyone who can participate</option>
      </select>
    </label>}
    {editing && interactive && <div className="annotation-toolset" role="group" aria-label="Annotation tools">
      {annotationTools.map(([id, label, icon]) => <button key={id} type="button" className="icon-button"
        title={label} aria-label={label} aria-pressed={tool === id} onClick={() => setTool(id)}>
        <Icon name={icon} size={18} />
      </button>)}
      {tool === 'emoji' ? <select className="annotation-emoji-picker" aria-label="Choose annotation emoji" value={emoji}
        onChange={event => setEmoji(event.target.value)}>
        {annotationEmoji.map(([value, label]) => <option value={value} key={label}>{value} {label}</option>)}
      </select> : tool !== 'erase' && <div className="annotation-swatches" role="group" aria-label="Annotation color">
        {Object.entries(annotationColors).map(([name, value]) => <button key={name} type="button" title={name}
          aria-label={name + ' ink'} aria-pressed={color === name} style={{ '--swatch': value }} onClick={() => setColor(name)} />)}
      </div>}
      <button type="button" className="icon-button" title="Undo my last mark" aria-label="Undo my last mark"
        disabled={!board.marks.some(mark => mark.author === localId)} onClick={() => edit({ kind: 'undo' })}>
        <Icon name="undo" size={18} />
      </button>
      {own && <button type="button" className="btn secondary" disabled={!board.marks.length} onClick={() => edit({ kind: 'clear' })}>Clear marks</button>}
      {own && <button type="button" className="icon-button" aria-label="Pause drawing" title="Pause drawing"
        onClick={() => onEditing(false)}><Icon name="close" size={18} /></button>}
    </div>}
  </div>;
}

export function SlideHandoff({ collaboration, canInteract }) {
  const { board, localBoard, own, controller, controlling, participants, requests, requested } = collaboration;
  if (localBoard?.pages) return <div className="slide-handoff">
    {controller ? <>
      <span role="status">{participantName(controller)} has slide control</span>
      <button type="button" className="btn secondary" onClick={collaboration.takeBack}>Take back control</button>
    </> : <>
      <select aria-label="Give slide control" value="" disabled={!participants.length}
        onChange={event => collaboration.giveControl(event.target.value)}>
        <option value="">Give control…</option>
        {participants.map(person => <option key={person.session_id} value={person.session_id}>{participantName(person)}</option>)}
      </select>
      {requests.length > 0 && <div className="slide-request">
        <span>{requests[0].name} requested slide control.</span>
        <button type="button" className="btn secondary" onClick={() => collaboration.declineControl(requests[0].id)}>Decline</button>
        <button type="button" className="btn primary" onClick={() => collaboration.giveControl(requests[0].id)}>Allow</button>
      </div>}
    </>}
  </div>;
  if (own || !canInteract || !board?.pages || (board.controller && !controlling)) return null;
  return <div className="slide-handoff">
    {controlling ? <button type="button" className="btn secondary" onClick={collaboration.releaseControl}>Release control</button>
      : <button type="button" className="btn secondary" disabled={requested} onClick={collaboration.requestControl}>
        {requested ? 'Control requested' : 'Request control'}
      </button>}
  </div>;
}
