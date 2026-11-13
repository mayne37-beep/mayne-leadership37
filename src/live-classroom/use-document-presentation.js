import { useCallback, useEffect, useRef, useState } from 'react';
import { cleanText } from './shared.js';
import { participantCanSend } from './meeting-roles.js';
import { loadPresentationDocument } from './presentation-document.js';
import { publishPresentation, screenTrack } from './presentation-stream.js';

function slideLinks(pages, index, canvas) {
  if (!pages.powerpoint) return undefined;
  try {
    return pages.links(index, canvas).filter(link => link.href || (link.page >= 0 && link.page < pages.count));
  } catch {
    return [];
  }
}

export function useDocumentPresentation({ call, allowed, notify, sync }) {
  const supported = typeof HTMLCanvasElement.prototype.captureStream === 'function';
  const [open, setOpen] = useState(false);
  const [deck, setDeck] = useState(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('idle');
  const prepared = useRef(null);
  const importing = useRef(null);
  const output = useRef(null);
  const restoring = useRef(null);
  const preview = useRef(null);

  const stop = useCallback(() => {
    const session = output.current;
    output.current = null;
    if (session) {
      session.abort();
      if (!session.call.isDestroyed() && screenTrack(session.call)?.id === session.track.id) {
        try { session.call.stopScreenShare(); } catch {}
      }
      clearInterval(session.heartbeat);
      session.track.stop();
      if (session.applied) restoring.current = session.applied.then(session.restore).catch(() => {});
    }
    setStatus('idle');
  }, []);

  useEffect(() => () => {
    stop();
    importing.current?.abort();
    importing.current = null;
    prepared.current?.pages.close();
    prepared.current = null;
    setOpen(false);
    setDeck(null);
    setProgress('');
    setError('');
  }, [call, allowed, stop]);

  useEffect(() => {
    const canvas = preview.current;
    const source = prepared.current?.canvas;
    if (!open || !deck || !canvas || !source) return;
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext('2d').drawImage(source, 0, 0);
  }, [open, deck]);

  function openEditor() {
    if (!allowed || !supported) return;
    setError('');
    setOpen(true);
  }

  function closeEditor() {
    if (status === 'starting') stop();
    importing.current?.abort();
    setProgress('');
    setOpen(false);
  }

  async function choose(file) {
    if (!file || !allowed || !supported || importing.current || output.current) return;
    const operation = new AbortController();
    importing.current = operation;
    setError('');
    setProgress('Opening ' + cleanText(file.name, 90) + '…');
    let pages;
    try {
      pages = await loadPresentationDocument(file, operation.signal, setProgress);
      operation.signal.throwIfAborted();
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = 1920;
      pageCanvas.height = 1080;
      pages.render(0, pageCanvas);
      const canvas = document.createElement('canvas');
      canvas.width = pageCanvas.width;
      canvas.height = pageCanvas.height;
      const frame = canvas.getContext('2d', { alpha: false });
      frame.drawImage(pageCanvas, 0, 0);
      prepared.current?.pages.close();
      prepared.current = { canvas, frame, pageCanvas, pages, page: 0 };
      setDeck({ name: cleanText(file.name, 90), page: 0, count: pages.count,
        powerpoint: pages.powerpoint, slides: pages.slides, links: slideLinks(pages, 0, pageCanvas) });
    } catch (failure) {
      pages?.close();
      if (!operation.signal.aborted) setError(failure.message || 'The document could not be opened.');
    } finally {
      if (importing.current === operation) {
        importing.current = null;
        setProgress('');
      }
    }
  }

  const renderPreview = useCallback((page, canvas) => {
    const pages = prepared.current?.pages;
    if (!pages || page < 0 || page >= pages.count) return;
    try { pages.render(page, canvas); } catch {}
  }, []);

  const goTo = useCallback(page => {
    const current = prepared.current;
    if (!current || !Number.isInteger(page) || page < 0 || page >= current.pages.count || current.page === page) return false;
    try {
      current.pages.render(page, current.pageCanvas);
      current.frame.drawImage(current.pageCanvas, 0, 0);
      current.page = page;
      const links = slideLinks(current.pages, page, current.pageCanvas);
      setDeck(previous => ({ ...previous, page, links }));
      return true;
    } catch {
      const message = 'This page could not be displayed. Try another page.';
      if (open) setError(message);
      else notify(message);
      return false;
    }
  }, [open, notify]);

  async function start() {
    if (!allowed || !call || !prepared.current || importing.current || output.current ||
        !participantCanSend(call.participants().local, 'screenVideo')) return;
    if (call.localScreenVideo()) {
      setError('Stop your current presentation before presenting this file.');
      return;
    }
    setError('');
    const session = new AbortController();
    try {
      const current = prepared.current;
      const stream = current.canvas.captureStream(8);
      const [track] = stream.getVideoTracks();
      if (!track) throw new Error('This browser could not capture the document pages.');
      session.call = call;
      session.track = track;
      output.current = session;
      session.track.contentHint = 'detail';
      const ended = () => { if (output.current === session) stop(); };
      call.on('local-screen-share-stopped', ended);
      session.track.addEventListener('ended', ended, { once: true });
      session.signal.addEventListener('abort', () => {
        call.off('local-screen-share-stopped', ended);
        session.track.removeEventListener('ended', ended);
      }, { once: true });
      // Keep a still page available to the encoder and to people who join mid-slide.
      const draw = () => current.frame.drawImage(current.pageCanvas, 0, 0);
      draw();
      session.heartbeat = setInterval(draw, 500);
      setStatus('starting');
      await restoring.current;
      session.signal.throwIfAborted();
      const presentation = call.participants().local?.userData?.presentation;
      session.restore = () => sync({ presentation: presentation ?? null }, call);
      session.applied = sync({ presentation: { ...presentation, layout: 'document' } }, call);
      await session.applied;
      session.signal.throwIfAborted();
      await publishPresentation(call, stream, session.signal, 'detail-optimized');
      session.signal.throwIfAborted();
      setDeck(previous => ({ ...previous, started: Date.now() }));
      setStatus('live');
      setOpen(false);
    } catch (failure) {
      if (session.signal.aborted) return;
      stop();
      setError(failure.message || 'The document could not be presented.');
    }
  }

  return { supported, open, openEditor, closeEditor, deck, progress, error, status, preview, renderPreview, choose, goTo, start, stop };
}
