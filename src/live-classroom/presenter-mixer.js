import { createPortraitProcessor } from './portrait-processor.js';
import { drawPresenterScene, sceneWidth, sceneHeight } from './presenter-scene.js';

export function supportsPresenterStudio() {
  return typeof MediaStreamTrackProcessor === 'function' && typeof MediaStreamTrackGenerator === 'function' &&
    typeof VideoFrame === 'function' && typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function' &&
    Boolean(navigator.mediaDevices?.getDisplayMedia);
}

function watchFrames(track, onFrame) {
  const input = track.clone();
  const reader = new MediaStreamTrackProcessor({ track: input, maxBufferSize: 1 }).readable.getReader();
  let stopped = false;
  async function read() {
    while (!stopped) {
      const { value, done } = await reader.read();
      if (done) return;
      if (stopped) value.close();
      else onFrame(value);
    }
  }
  read().catch(() => {});
  return () => {
    stopped = true;
    reader.cancel().catch(() => {});
    input.stop();
  };
}

export function createPresenterMixer(initialScene, onError) {
  const canvas = new OffscreenCanvas(sceneWidth, sceneHeight);
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Could not create a presentation preview.');
  let scene = initialScene;
  let previewContext;
  let output;
  let lastOutput = -Infinity;
  let renderPending = false;
  let cameraTrack;
  let slidesTrack;
  let stopCamera;
  let stopSlides;
  let cameraFrame;
  let slidesFrame;
  let background;
  let cutout;
  let cutoutAt = -Infinity;
  let processing = false;
  let processor;
  let processorFailed = false;
  let settings = {};
  let stopped = false;

  function render(forceOutput = false) {
    if (stopped) return;
    const now = performance.now();
    drawPresenterScene(context, scene, {
      background,
      slides: slidesFrame,
      camera: scene.layers.camera.cutout ? cutout ?? cameraFrame : cameraFrame,
    });
    previewContext?.drawImage(canvas, 0, 0);
    const writer = output?.writer;
    if (writer?.desiredSize > 0 && (forceOutput || now - lastOutput >= 1000 / 30)) {
      lastOutput = now;
      const frame = new VideoFrame(canvas, { timestamp: Math.round(now * 1000) });
      writer.write(frame).catch(error => { if (output?.writer === writer) onError(error); }).finally(() => frame.close());
    }
  }

  function queueRender() {
    if (stopped || renderPending) return;
    renderPending = true;
    queueMicrotask(() => {
      renderPending = false;
      render();
    });
  }

  function clearCutout() {
    processor?.close();
    processor = undefined;
    processorFailed = false;
    processing = false;
    cutout?.close();
    cutout = undefined;
    cutoutAt = -Infinity;
  }

  async function processCamera(frame) {
    if (processing || processorFailed || !scene.layers.camera.cutout || !scene.layers.camera.visible) return;
    processing = true;
    let current;
    try {
      processor ??= createPortraitProcessor(settings.backdropColor);
      current = processor;
      const timestamp = frame.timestamp / 1000;
      const scale = Math.min(1, 720 / Math.max(frame.displayWidth, frame.displayHeight));
      const bitmap = await createImageBitmap(frame, {
        resizeWidth: Math.max(1, Math.round(frame.displayWidth * scale)),
        resizeHeight: Math.max(1, Math.round(frame.displayHeight * scale)),
      });
      if (current !== processor) { bitmap.close(); return; }
      const next = await current.process(bitmap, { ...settings, timestamp });
      if (current !== processor) { next?.close(); return; }
      const now = performance.now();
      if (next || now - cutoutAt > 170) {
        cutout?.close();
        cutout = next;
        if (next) cutoutAt = now;
      }
      queueRender();
    } catch {
      if (current !== processor) return;
      clearCutout();
      processorFailed = true;
      render();
    } finally {
      if (current === processor) processing = false;
    }
  }

  function setCamera(track) {
    if (track === cameraTrack) return;
    stopCamera?.();
    cameraFrame?.close();
    cameraFrame = undefined;
    cameraTrack = track;
    clearCutout();
    stopCamera = track ? watchFrames(track, frame => {
      cameraFrame?.close();
      cameraFrame = frame;
      queueRender();
      processCamera(frame);
    }) : undefined;
    render();
  }

  function setSlides(track) {
    if (track === slidesTrack) return;
    stopSlides?.();
    slidesFrame?.close();
    slidesFrame = undefined;
    slidesTrack = track;
    stopSlides = track ? watchFrames(track, frame => {
      slidesFrame?.close();
      slidesFrame = frame;
      queueRender();
    }) : undefined;
    render();
  }

  function startOutput() {
    if (output) return output.stream;
    const track = new MediaStreamTrackGenerator({ kind: 'video' });
    track.contentHint = 'detail';
    const writer = track.writable.getWriter();
    const stream = new MediaStream([track]);
    lastOutput = -Infinity;
    output = { track, writer, stream, heartbeat: setInterval(render, 500) };
    render(true);
    return stream;
  }

  function stopOutput() {
    if (!output) return;
    const { track, writer, heartbeat } = output;
    output = undefined;
    clearInterval(heartbeat);
    writer.abort().catch(() => {});
    track.stop();
  }

  return {
    setCamera,
    setSlides,
    setBackground(image) {
      background?.close();
      background = image;
      render(true);
    },
    setPreview(element) {
      previewContext = element?.getContext('2d', { alpha: false });
      render();
    },
    setScene(next) {
      const before = scene.layers.camera;
      const after = next.layers.camera;
      if (before.cutout !== after.cutout || before.visible !== after.visible) clearCutout();
      scene = next;
      render(true);
    },
    setSettings(next) {
      if (settings.backdropColor !== next.backdropColor) clearCutout();
      settings = next;
      if (cameraFrame) processCamera(cameraFrame);
    },
    startOutput,
    stopOutput,
    close() {
      stopped = true;
      stopOutput();
      stopCamera?.();
      stopSlides?.();
      cameraFrame?.close();
      slidesFrame?.close();
      background?.close();
      clearCutout();
    },
  };
}
