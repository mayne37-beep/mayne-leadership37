import { useCallback, useEffect, useRef, useState } from 'react';
import { createPresenterMixer, supportsPresenterStudio } from './presenter-mixer.js';
import { editSceneLayer, restorePresenterScene } from './presenter-scene.js';
import { publishPresentation, screenTrack } from './presentation-stream.js';
import { loadStudioScene, saveMeetingPreferences } from './preferences.js';
import { loadStudioBackground, saveStudioBackground } from './studio-background.js';

export function usePresenterStudio({ call, camera, cameraSettings, sync, notify }) {
  const [supported] = useState(supportsPresenterStudio);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('idle');
  const [scene, setScene] = useState(() => restorePresenterScene(loadStudioScene()));
  const [slidesReady, setSlidesReady] = useState(false);
  const [picking, setPicking] = useState(false);
  const [background, setBackground] = useState(null);
  const [restoringBackground, setRestoringBackground] = useState(false);
  const [error, setError] = useState('');
  const mixer = useRef(null);
  const editorOpen = useRef(false);
  const preview = useRef(null);
  const source = useRef(null);
  const output = useRef(null);
  const capture = useRef(null);
  const loadingImage = useRef(null);
  const backgroundSource = useRef(null);
  const stoppedSharing = useRef(null);

  const stopOutput = useCallback((stopShare = false) => {
    const session = output.current;
    output.current = null;
    const call = session?.call;
    const ownsShare = session?.track && session.track.id === screenTrack(call)?.id;
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
    setRestoringBackground(false);
    backgroundSource.current = null;
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
      if (backgroundSource.current === null && !loadingImage.current) restoreBackground();
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
  useEffect(() => {
    mixer.current?.setScene(scene);
    saveMeetingPreferences({ scene });
  }, [scene]);

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

  async function restoreBackground() {
    const operation = new AbortController();
    loadingImage.current = operation;
    setRestoringBackground(true);
    try {
      const file = await loadStudioBackground();
      if (!operation.signal.aborted) await applyBackground(file, operation);
    } catch {}
    finally {
      if (loadingImage.current === operation) {
        loadingImage.current = null;
        setRestoringBackground(false);
      }
    }
  }

  async function applyBackground(file, operation) {
    let image = file ? await createImageBitmap(file) : null;
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
    if (operation.signal.aborted || !mixer.current) { image?.close(); return false; }
    mixer.current.setBackground(image);
    backgroundSource.current = file ?? false;
    setBackground(file?.name ?? null);
    return true;
  }

  async function chooseBackground(file) {
    loadingImage.current?.abort();
    const operation = new AbortController();
    loadingImage.current = operation;
    setRestoringBackground(false);
    setError('');
    try {
      if (!(await applyBackground(file, operation))) return;
      if (file) setScene(previous => editSceneLayer(previous, 'background', { visible: true }));
      try { await saveStudioBackground(file); }
      catch { if (!operation.signal.aborted) setError('This image is available now. Browser storage could not save the change.'); }
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
      await publishPresentation(call, stream, session.signal);
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
    slidesReady, picking, chooseSlides, detachSlides, background, restoringBackground, chooseBackground,
    start, stop,
  };
}
