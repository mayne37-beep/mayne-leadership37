import { createPortraitProcessor } from './portrait-processor.js';

export function supportsCameraEffects() {
  return typeof MediaStreamTrackProcessor === 'function' && typeof MediaStreamTrackGenerator === 'function' &&
    typeof VideoFrame === 'function' && typeof Worker === 'function' && typeof OffscreenCanvas === 'function' &&
    typeof createImageBitmap === 'function';
}

export async function createCameraEffect({ choice, device, sourceTrack, getSettings, signal, onError }) {
  let source;
  let track;
  let reader;
  let writer;
  let processor;
  let image;
  let stopped = false;
  let rendered = false;
  let frameTime = -Infinity;
  let resolveFirst;
  let rejectFirst;

  function stop(error = new DOMException('Camera effect stopped.', 'AbortError')) {
    if (stopped) return;
    stopped = true;
    signal.removeEventListener('abort', abort);
    processor?.close(error);
    reader?.cancel().catch(() => {});
    writer?.abort().catch(() => {});
    track?.stop();
    source?.stop();
    image?.close();
    rejectFirst?.(error);
  }

  function abort() { stop(signal.reason); }

  try {
    signal.throwIfAborted();
    source = sourceTrack?.readyState === 'live' ? sourceTrack.clone() : null;
    if (!source) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        ...(device ? { deviceId: { exact: device } } : {}),
        width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 },
      } });
      [source] = stream.getVideoTracks();
    }
    if (!source) throw new Error('The camera did not provide video.');
    signal.throwIfAborted();
    signal.addEventListener('abort', abort, { once: true });
    if (choice.id !== 'blur') {
      const response = await fetch(choice.image, { signal });
      if (!response.ok) throw new Error('The background image could not be opened.');
      const bitmap = await createImageBitmap(await response.blob());
      if (stopped) { bitmap.close(); signal.throwIfAborted(); }
      image = bitmap;
    }
    track = new MediaStreamTrackGenerator({ kind: 'video' });
    reader = new MediaStreamTrackProcessor({ track: source, maxBufferSize: 1 }).readable.getReader();
    writer = track.writable.getWriter();
    processor = createPortraitProcessor();
    await processor.initialized;

    const first = new Promise((resolve, reject) => { resolveFirst = resolve; rejectFirst = reject; });
    const timeout = setTimeout(() => stop(new Error('The camera did not provide a preview.')), 5000);

    async function render() {
      while (!stopped) {
        const { value: frame, done } = await reader.read();
        if (done) throw new Error('The camera stopped.');
        try {
          if (frame.timestamp >= frameTime && frame.timestamp - frameTime < 27500) continue;
          frameTime = frame.timestamp;
          const scale = Math.min(1, 960 / frame.displayWidth, 720 / frame.displayHeight);
          const bitmap = await createImageBitmap(frame, {
            resizeWidth: Math.max(1, Math.round(frame.displayWidth * scale)),
            resizeHeight: Math.max(1, Math.round(frame.displayHeight * scale)),
          });
          const background = image;
          image = null;
          const output = await processor.process(bitmap, {
            ...getSettings(), timestamp: frame.timestamp / 1000, effect: choice.id === 'blur' ? 'blur' : 'image',
          }, background);
          try {
            const result = new VideoFrame(output, { timestamp: frame.timestamp });
            try { await writer.write(result); } finally { result.close(); }
          } finally { output.close(); }
          rendered = true;
          resolveFirst();
        } finally { frame.close(); }
      }
    }

    render().catch(error => {
      if (stopped) return;
      stop(error);
      if (rendered) onError(error);
    });
    try { await first; } finally { clearTimeout(timeout); }
    return { track, source, device, stop };
  } catch (error) {
    stop(error);
    throw error;
  }
}
