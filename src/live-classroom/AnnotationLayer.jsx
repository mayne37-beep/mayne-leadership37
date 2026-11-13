import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from './components.jsx';
import { newNonce } from './client.js';
import { annotationColors, decodeStroke, encodeStroke, maxAnnotationText, maxStrokePoints } from './annotations.js';

function Stroke({ points, kind, color, erasing, onErase }) {
  const path = 'M' + points.map(point => point.join(' ')).join(' L') +
    (points.length === 1 ? ' l0.01 0' : '');
  const width = kind === 'highlighter' ? 18 : 4;
  return <g>
    <path d={path} fill="none" stroke={annotationColors[color]} strokeWidth={width}
      strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
      opacity={kind === 'highlighter' ? 0.42 : 1} />
    {erasing && <path d={path} fill="none" stroke="transparent" strokeWidth={Math.max(22, width)}
      strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'stroke' }} onPointerDown={onErase} />}
  </g>;
}

export function AnnotationLayer({ board, tool, color, emoji, author, presenter, edit, interactive, dialogHost }) {
  const [draft, setDraft] = useState(null);
  const [placement, setPlacement] = useState(null);
  const [text, setText] = useState('');
  const stroke = useRef(null);
  const drawing = tool === 'pen' || tool === 'highlighter';
  const erasing = tool === 'erase';
  const active = interactive && Boolean(tool);
  const canErase = mark => active && erasing && (presenter || mark.author === author);
  const add = mark => edit({ kind: 'add', mark: { ...mark, id: newNonce() } });
  const erase = mark => event => {
    if (event.button !== 0) return;
    event.stopPropagation();
    edit({ kind: 'erase', id: mark.id });
  };

  function point(event, bounds) {
    const scale = (value, edge, size) => Math.max(0, Math.min(1000, Math.round((value - edge) / size * 1000)));
    return [scale(event.clientX, bounds.left, bounds.width), scale(event.clientY, bounds.top, bounds.height)];
  }

  function start(event) {
    if (!active || event.button !== 0 || erasing || stroke.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const [x, y] = point(event, bounds);
    if (drawing) {
      event.currentTarget.setPointerCapture(event.pointerId);
      const next = { pointer: event.pointerId, bounds, kind: tool, color, points: [[x, y]] };
      stroke.current = next;
      setDraft(next);
    } else if (tool === 'emoji') add({ kind: tool, color, emoji, x, y });
    else {
      setText('');
      setPlacement({ kind: tool, color, x, y });
    }
  }

  function move(event) {
    const current = stroke.current;
    if (!active || current?.pointer !== event.pointerId) return;
    const next = point(event, current.bounds);
    const previous = current.points.at(-1);
    if (Math.hypot(next[0] - previous[0], next[1] - previous[1]) < 4) return;
    if (current.points.length < maxStrokePoints) current.points.push(next);
    else current.points[current.points.length - 1] = next;
    setDraft({ ...current });
  }

  function end(event, cancelled = false) {
    const current = stroke.current;
    if (current?.pointer !== event.pointerId) return;
    stroke.current = null;
    setDraft(null);
    if (!cancelled && active) add({ kind: current.kind, color: current.color, path: encodeStroke(current.points) });
  }

  const closeText = () => setPlacement(null);
  const marks = board?.marks ?? [];
  return <>
    <div className="annotation-layer" data-tool={active ? tool : undefined} aria-label="Annotations on presentation"
      onPointerDown={start} onPointerMove={move} onPointerUp={event => end(event)}
      onPointerCancel={event => end(event, true)} onLostPointerCapture={event => end(event, true)}>
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="Drawing annotations" role="img">
        {marks.filter(mark => mark.path).map(mark => <Stroke key={mark.id} points={decodeStroke(mark.path)}
          kind={mark.kind} color={mark.color} erasing={canErase(mark)} onErase={erase(mark)} />)}
        {active && draft && <Stroke points={draft.points} kind={draft.kind} color={draft.color} />}
      </svg>
      {marks.filter(mark => !mark.path).map(mark => <div key={mark.id}
        className={'annotation-item annotation-' + mark.kind} data-mark={mark.kind} data-erase={canErase(mark) || undefined}
        style={{ left: mark.x / 10 + '%', top: mark.y / 10 + '%', '--mark-color': annotationColors[mark.color],
          '--mark-x': mark.x > 750 ? '-100%' : '0', '--mark-y': mark.y > 750 ? '-100%' : '0' }}
        onPointerDown={canErase(mark) ? erase(mark) : undefined}>
        {mark.text || mark.emoji}
      </div>)}
    </div>
    {placement && active && createPortal(<Modal title={placement.kind === 'note' ? 'Add sticky note' : 'Add text box'} className="annotation-dialog" close={closeText}>
      <form onSubmit={event => {
        event.preventDefault();
        if (!text.trim()) return;
        add({ ...placement, text });
        closeText();
      }}>
        <label className="field">Annotation text<textarea value={text} maxLength={maxAnnotationText} rows={3}
          autoFocus onChange={event => setText(event.target.value)} required /></label>
        <div className="form-actions">
          <button className="btn secondary" type="button" onClick={closeText}>Cancel</button>
          <button className="btn primary" disabled={!text.trim()}>Place annotation</button>
        </div>
      </form>
    </Modal>, dialogHost.current)}
  </>;
}
