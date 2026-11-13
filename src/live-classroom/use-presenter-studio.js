import { useCallback, useEffect, useRef, useState } from 'react';
import { createPresenterMixer, supportsPresenterStudio } from './presenter-mixer.js';
import { editSceneLayer, initialScene } from './presenter-scene.js';

function publishScreen(call, stream, signal) {
  return new Promise((resolve, reject) => {
    const output = stream.getVideoTracks()[0];
    function finish(error) {
      clearTimeout(timeout);
      call.off('local-screen-share-started', started);
      call.off('participant-updated', started);
      call.off('local-screen-share-canceled', failed);
      call.off('screen-share-error', failed);
      signal.removeEventListener('abort', aborted);
      if (error) reject(error);
      else resolve();
    }
    function started() {
      const track = call.participants().local?.tracks?.screenVideo;
      if ((track?.persistentTrack ?? track?.track)?.id === output.id) finish();
    }
    function failed() { finish(new Error('The layered presentation could not be shared.')); }
    function aborted() { finish(signal.reason); }
    const timeout = setTimeout(failed, 10000);
    call.on('local-screen-share-started', started);
    call.on('participant-updated', started);
    call.on('local-screen-share-canceled', failed);
    call.on('screen-share-error', failed);
    signal.addEventListener('abort', aborted, { once: true });
    try {
      signal.throwIfAborted();
      call.startScreenShare({ mediaStream: stream, screenVideoSendSettings: 'motion-and-detail-balanced' });
      started();
    } catch (error) { finish(error); }
  });
}

export function usePresenterStudio({ call, camera, cameraSettings, sync, notify }) {
  const [supported] = useState(supportsPresenterStudio);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('idle');
  const [scene, setScene] = useState(initialScene);
  const [slidesReady, setSlidesReady] = useState(false);
  const [picking, setPicking] = useState(false);
  const [background, setBackground] = useState(null);
  const [error, setError] = useState('');
  const mixer = useRef(null);
  const editorOpen = useRef(false);
  const preview = useRef(null);
  const source = useRef(null);
  const output = useRef(null);
  const capture = useRef(null);
  const loadingImage = useRef(null);
  const stoppedSharing = useRef(null);

  const stopOutput = useCallback((stopShare = false) => {
    const session = output.current;
    output.current = null;
    const call = session?.call;
    const screen = call?.participants().local?.tracks?.screenVideo;
    const ownsShare = session?.track && session.track.id === (screen?.persistentTrack ?? screen?.track)?.id;
    if (stopShare && ownsShare && !call.isDestroyed()) {
      try { call.stopScreenShare(); } catch {}
    }
    session?.abort();
    mixer.current?.stopOutput();
    if (session?.restore) {
      const restored = session.restore().catch(() => {});
      stoppedSharing.current = restored;
    }
    setStatus('idle');
  }, []);

  const clearSources = useCallback(() => {
    capture.current?.abort();
    capture.current = null;
    loadingImage.current?.abort();
    loadingImage.current = null;
    source.current?.stop();
    source.current = null;
    setPicking(false);
    setSlidesReady(false);
    setBackground(null);
  }, []);

  function releaseIfClosed() {
    if (editorOpen.current) return;
    clearSources();
    mixer.current?.close();
    mixer.current = null;
  }

  useEffect(() => () => {
    stopOutput(true);
    clearSources();
    mixer.current?.close();
    mixer.current = null;
    editorOpen.current = false;
    setOpen(false);
  }, [call, clearSources, stopOutput]);

  const attachPreview = useCallback(element => {
    preview.current = element;
    mixer.current?.setPreview(element);
  }, []);

  function openEditor() {
    try {
      mixer.current ??= createPresenterMixer(scene, () => {
        stop();
        notify('The layered presentation stopped. Open Presenter Studio to try again.');
      });
      mixer.current.setSettings(cameraSettings);
      mixer.current.setCamera(camera);
      mixer.current.setPreview(preview.current);
      editorOpen.current = true;
      setError('');
      setOpen(true);
    } catch {
      notify('Presenter Studio could not open. Try again in Chrome or Edge.');
    }
  }

  function closeEditor() {
    editorOpen.current = false;
    setOpen(false);
    if (!output.current) releaseIfClosed();
  }

  useEffect(() => {
    if (!open && status === 'idle') return;
    mixer.current?.setCamera(camera);
  }, [camera, open, status]);

  const { coverage, backdropColor } = cameraSettings;
  useEffect(() => { mixer.current?.setSettings({ coverage, backdropColor }); }, [coverage, backdropColor]);
  useEffect(() => { mixer.current?.setScene(scene); }, [scene]);

  function detachSlides() {
    source.current?.stop();
    source.current = null;
    mixer.current?.setSlides(null);
    setSlidesReady(false);
  }

  async function chooseSlides() {
    if (capture.current) return;
    const operation = new AbortController();
    capture.current = operation;
    setError('');
    setPicking(true);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 24 } },
        audio: false,
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'exclude',
      });
      const [track] = stream.getVideoTracks();
      if (!track || operation.signal.aborted || !mixer.current) {
        stream.getTracks().forEach(item => item.stop());
        return;
      }
      detachSlides();
      source.current = track;
      track.addEventListener('ended', () => {
        if (source.current === track) detachSlides();
      }, { once: true });
      mixer.current.setSlides(track);
      setScene(previous => editSceneLayer(previous, 'slides', { visible: true }));
      setSlidesReady(true);
    } catch (error) {
      if (!operation.signal.aborted && error.name !== 'NotAllowedError') setError('Could not capture that window. Try sharing it again.');
    } finally {
      if (capture.current === operation) {
        capture.current = null;
        setPicking(false);
      }
    }
  }

  async function chooseBackground(file) {
    loadingImage.current?.abort();
    const operation = new AbortController();
    loadingImage.current = operation;
    setError('');
    try {
      let image = file ? await createImageBitmap(file) : null;
      if (operation.signal.aborted || !mixer.current) { image?.close(); return; }
      if (image && Math.max(image.width, image.height) > 1920) {
        const original = image;
        const scale = 1920 / Math.max(original.width, original.height);
        try {
          image = await createImageBitmap(original, {
            resizeWidth: Math.max(1, Math.round(original.width * scale)),
            resizeHeight: Math.max(1, Math.round(original.height * scale)),
          });
        } finally { original.close(); }
      }
      if (operation.signal.aborted || !mixer.current) { image?.close(); return; }
      mixer.current.setBackground(image);
      setBackground(file?.name ?? null);
      if (file) setScene(previous => editSceneLayer(previous, 'background', { visible: true }));
    } catch {
      if (!operation.signal.aborted) setError('Could not open that image. Choose a JPG, PNG, or WebP file.');
    } finally {
      if (loadingImage.current === operation) loadingImage.current = null;
    }
  }

  async function start() {
    if (!call || !mixer.current || output.current) return;
    const session = new AbortController();
    session.call = call;
    output.current = session;
    setError('');
    setStatus('starting');
    const ended = () => {
      if (output.current !== session) return;
      stopOutput();
      releaseIfClosed();
    };
    session.signal.addEventListener('abort', () => {
      call.off('local-screen-share-stopped', ended);
    }, { once: true });
    try {
      if (call.localScreenVideo()) throw new Error('Stop the current screen share before going live with this scene.');
      await stoppedSharing.current;
      stoppedSharing.current = null;
      session.signal.throwIfAborted();
      const previous = call.participants().local?.userData?.presentation;
      await sync({ presentation: { ...previous, layout: 'studio' } }, call);
      session.restore = () => call.meetingState() === 'joined-meeting'
        ? sync({ presentation: previous ?? null }, call) : Promise.resolve();
      if (session.signal.aborted) {
        await session.restore().catch(() => {});
        return;
      }
      call.on('local-screen-share-stopped', ended);
      const stream = mixer.current.startOutput();
      session.track = stream.getVideoTracks()[0];
      await publishScreen(call, stream, session.signal);
      session.signal.throwIfAborted();
      setStatus('live');
      editorOpen.current = false;
      setOpen(false);
    } catch (error) {
      if (!session.signal.aborted) {
        stop();
        const message = error?.message || 'The layered presentation could not be shared.';
        if (editorOpen.current) setError(message);
        else notify(message);
      }
    }
  }

  function stop() {
    stopOutput(true);
    releaseIfClosed();
  }

  return {
    supported, open, openEditor, closeEditor, status, error, scene, setScene, attachPreview,
    slidesReady, picking, chooseSlides, detachSlides, background, chooseBackground,
    start, stop,
  };
}
