const cancelError = () => new DOMException('Conversion cancelled.', 'AbortError');

// A bounded worker interface keeps document conversion off the UI thread.
export class WordPdfConverter {
  constructor({ onProgress = () => {}, WorkerType = globalThis.Worker } = {}) {
    this.WorkerType = WorkerType;
    this.onProgress = onProgress;
    this.worker = null;
    this.pending = new Map();
    this.counter = 0;
    this.ready = false;
    this.initializing = null;
    this.loaded = null;
  }

  initialize() {
    if (this.ready) return Promise.resolve();
    if (this.initializing) return this.initializing;
    this.initializing = this.start().finally(() => { this.initializing = null; });
    return this.initializing;
  }

  async start() {
    try {
      this.onProgress({ phase: 'loading', percent: 0, message: 'Loading the document engine…' });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { this.loaded = null; reject(new Error('The conversion worker could not load. Reload the page and try again.')); }, 20000);
        this.loaded = { resolve: () => { clearTimeout(timer); resolve(); }, reject: error => { clearTimeout(timer); reject(error); } };
        this.worker = new this.WorkerType('/assets/word-engine/client-worker.js');
        this.worker.addEventListener('message', event => this.message(event.data));
        this.worker.addEventListener('error', () => this.fail(new Error('The document engine stopped. Try a smaller document or reload the page.')));
        this.worker.addEventListener('messageerror', () => this.fail(new Error('The document engine could not read its response. Try again.')));
      });
      const base = `${globalThis.location.origin}/assets/word-engine/`;
      await this.request('init', {
        sofficeJs: `${base}soffice.js`,
        sofficeWasm: `${base}soffice.wasm.br`,
        sofficeData: `${base}soffice.data.br`,
        sofficeWorkerJs: `${base}soffice.worker.js`,
        verbose: false,
        enableProgressTracking: false,
      }, 180000);
      this.ready = true;
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  message(message) {
    if (message.type === 'loaded') { this.loaded?.resolve(); this.loaded = null; return; }
    if (message.type === 'progress') { this.onProgress(message.progress || {}); return; }
    const request = this.pending.get(message.id);
    if (!request) return;
    if (!['ready', 'result', 'error'].includes(message.type)) return;
    clearTimeout(request.timer);
    this.pending.delete(message.id);
    if (message.type === 'error') request.reject(new Error(message.error || 'This Word document could not be converted.'));
    else request.resolve(message.data);
  }

  request(type, data, timeout = 120000) {
    return new Promise((resolve, reject) => {
      if (!this.worker) { reject(cancelError()); return; }
      const id = ++this.counter;
      const timer = setTimeout(() => this.fail(new Error('Conversion took too long. Try a smaller document or reload the page.')), timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        if (data.inputData) {
          const inputData = data.inputData.slice();
          this.worker.postMessage({ type, id, ...data, inputData }, [inputData.buffer]);
        } else this.worker.postMessage({ type, id, ...data });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  async convert(bytes, extension, filterOptions) {
    if (!this.ready) throw new Error('The converter is not ready.');
    const result = await this.request('convert', { inputData: bytes, inputExt: extension, outputFormat: 'pdf', filterOptions });
    const data = new Uint8Array(result);
    if (data.length < 8 || new TextDecoder().decode(data.subarray(0, 5)) !== '%PDF-') throw new Error('The document engine did not produce a valid PDF. Save a fresh copy in Word and try again.');
    return data;
  }

  fail(error) {
    this.loaded?.reject(error);
    this.loaded = null;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }

  destroy() { this.fail(cancelError()); }
}
