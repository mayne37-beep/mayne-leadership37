const workerUrl = '/assets/live-classroom-portrait.js?v=4';

export function createPortraitProcessor() {
  const worker = new Worker(workerUrl);
  let resolveFrame;
  let rejectFrame;
  let stopped = false;
  let ready;
  let rejectReady;
  const initialized = new Promise((resolve, reject) => { ready = resolve; rejectReady = reject; });
  const timeout = setTimeout(() => close(new Error('Camera effects took too long to load.')), 15000);

  function close(error = new DOMException('Camera effect stopped.', 'AbortError')) {
    if (stopped) return;
    stopped = true;
    clearTimeout(timeout);
    worker.terminate();
    rejectReady(error);
    rejectFrame?.(error);
  }

  worker.onmessage = ({ data }) => {
    if (data.error) { close(new Error('Camera effects could not process the video.')); return; }
    if (data.ready) { clearTimeout(timeout); ready(); return; }
    const resolve = resolveFrame;
    resolveFrame = rejectFrame = undefined;
    if (resolve) resolve(data.bitmap);
    else data.bitmap?.close();
  };
  worker.onerror = () => close(new Error('Camera effects could not start.'));

  async function process(bitmap, settings, background) {
    try {
      await initialized;
      if (stopped) throw new DOMException('Camera effect stopped.', 'AbortError');
      return await new Promise((resolve, reject) => {
        resolveFrame = resolve;
        rejectFrame = reject;
        try { worker.postMessage({ bitmap, settings, background }, background ? [bitmap, background] : [bitmap]); }
        catch (error) { close(error); }
      });
    } catch (error) {
      bitmap.close();
      background?.close();
      throw error;
    }
  }

  return { initialized, process, close };
}
