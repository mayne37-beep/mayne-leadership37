import { useCallback, useEffect, useRef, useState } from 'react';
import { cleanText } from './shared.js';
import { participantCanSend } from './meeting-roles.js';
import { isPowerPointFile, loadPresentationDocument, waitForDocument } from './presentation-document.js';
import { publishPresentation, screenTrack } from './presentation-stream.js';

function slideLinks(pages, index, canvas) {
  if (!pages.powerpoint) return undefined;
  try {
    return pages.links(index, canvas).filter(link => link.href || (link.page >= 0 && link.page < pages.count));
  } catch {
    return [];
  }
}

function slideDetails(pages, index, canvas, rendered) {
  return { links: rendered?.links ?? slideLinks(pages, index, canvas), hints: rendered?.hints };
}

export function useDocumentPresentation({ call, allowed, notify, sync }) {
  const supported = typeof HTMLCanvasElement.prototype.captureStream === 'function';
  const [open, setOpen] = useState(false);
  const [deck, setDeck] = useState(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('idle');
  const [rendering, setRendering] = useState(false);
  const [fallbackAvailable, setFallbackAvailable] = useState(false);
  const prepared = useRef(null);
  const importing = useRef(null);
  const navigation = useRef(null);
  const output = useRef(null);
  const restoring = useRef(null);
  const preview = useRef(null);
  const lastPowerPoint = useRef(null);

  const cancelNavigation = useCallback(() => {
    navigation.current?.abort();
    navigation.current = null;
    setRendering(false);
  }, []);

  const stop = useCallback(() => {
    cancelNavigation();
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
  }, [cancelNavigation]);

  useEffect(() => () => {
    stop();
    importing.current?.abort();
    importing.current = null;
    prepared.current?.pages.close();
    prepared.current = null;
    lastPowerPoint.current = null;
    setFallbackAvailable(false);
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
    cancelNavigation();
    cancelImport();
    setOpen(false);
  }

  function cancelImport() {
    importing.current?.abort();
    importing.current = null;
    setProgress('');
  }

  async function choose(file, convertPowerPoint = false) {
    if (!file || !allowed || !supported || importing.current || output.current) return;
    cancelNavigation();
    const powerpoint = isPowerPointFile(file.name);
    lastPowerPoint.current = powerpoint && file.size <= 25 * 1024 * 1024 ? file : null;
    setFallbackAvailable(Boolean(lastPowerPoint.current) && !convertPowerPoint);
    const operation = new AbortController();
    importing.current = operation;
    setError('');
    setProgress('Opening ' + cleanText(file.name, 90) + '…');
    let pages;
    let timeout;
    if (powerpoint && !convertPowerPoint) {
      timeout = setTimeout(() => operation.abort(new Error('PowerPoint took too long to open. Share its slideshow window to present it now.')), 45000);
    }
    try {
      const loading = loadPresentationDocument(file, operation.signal, setProgress, convertPowerPoint).then(document => {
        if (operation.signal.aborted) document.close();
        operation.signal.throwIfAborted();
        return document;
      });
      pages = await waitForDocument(loading, operation.signal);
      operation.signal.throwIfAborted();
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = 1920;
      pageCanvas.height = 1080;
      if (pages.direct) setProgress('Rendering the first slide…');
      const rendered = await waitForDocument(pages.render(0, pageCanvas), operation.signal);
      operation.signal.throwIfAborted();
      const canvas = document.createElement('canvas');
      canvas.width = pageCanvas.width;
      canvas.height = pageCanvas.height;
      const frame = canvas.getContext('2d', { alpha: false });
      frame.drawImage(pageCanvas, 0, 0);
      prepared.current?.pages.close();
      prepared.current = { canvas, frame, pageCanvas, pages, page: 0 };
      setDeck({ name: cleanText(file.name, 90), page: 0, count: pages.count,
        powerpoint: pages.powerpoint, slides: pages.slides, direct: pages.direct,
        ...slideDetails(pages, 0, pageCanvas, rendered) });
    } catch (failure) {
      pages?.close();
      if (importing.current === operation && operation.signal.reason?.name !== 'AbortError') {
        setError(operation.signal.reason?.message || failure.message || 'The document could not be opened.');
      }
    } finally {
      clearTimeout(timeout);
      if (importing.current === operation) {
        importing.current = null;
        setProgress('');
      }
    }
  }

  const renderPreview = useCallback((page, canvas) => {
    const pages = prepared.current?.pages;
    if (!pages || page < 0 || page >= pages.count) return;
    try { Promise.resolve(pages.render(page, canvas)).catch(() => {}); } catch {}
  }, []);

  const goTo = useCallback(page => {
    const current = prepared.current;
    if (!current || !Number.isInteger(page) || page < 0 || page >= current.pages.count || current.page === page || navigation.current) return false;
    function commit(canvas, rendered) {
      current.frame.drawImage(canvas, 0, 0);
      current.pageCanvas = canvas;
      current.page = page;
      const details = slideDetails(current.pages, page, canvas, rendered);
      setDeck(previous => ({ ...previous, page, ...details }));
      return true;
    }
    function failed() {
      const message = 'This slide could not be displayed. Try another slide or share the slideshow window.';
      if (open) setError(message);
      else notify(message);
      return false;
    }
    if (current.pages.direct) {
      const operation = new AbortController();
      navigation.current = operation;
      setRendering(true);
      const canvas = document.createElement('canvas');
      canvas.width = current.canvas.width;
      canvas.height = current.canvas.height;
      const timeout = setTimeout(() => operation.abort(new Error('This slide took too long to open.')), 15000);
      return waitForDocument(current.pages.render(page, canvas), operation.signal)
        .then(rendered => commit(canvas, rendered))
        .catch(() => operation.signal.reason?.name === 'AbortError' ? false : failed())
        .finally(() => {
          clearTimeout(timeout);
          if (navigation.current === operation) cancelNavigation();
        });
    }
    try {
      current.pages.render(page, current.pageCanvas);
      return commit(current.pageCanvas);
    } catch {
      if (open) setError('This page could not be displayed. Try another page.');
      else notify('This page could not be displayed. Try another page.');
      return false;
    }
  }, [open, notify, cancelNavigation]);

  async function start() {
    if (!allowed || !call || !prepared.current || importing.current || output.current || navigation.current ||
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

  return { supported, open, openEditor, closeEditor, cancelImport, deck, progress, error, status, preview, renderPreview, choose, goTo, start, stop,
    rendering, fallbackAvailable, tryCompatibility: () => choose(lastPowerPoint.current, true) };
}
