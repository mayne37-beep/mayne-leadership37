import { AUDIO, dbGain, gainDb } from './model.js';
import { loadFile } from './projects.js';

const imageUrl = (src, local = false) => {
  const image = new Image();
  if (!local) image.decoding = 'async';
  image.src = src;
  return image;
};
const extension = value => /\.([a-z0-9]+)$/i.exec(value ?? '')?.[1].toLowerCase() ?? '';
export function fileKind(file) {
  const ext = extension(file.name);
  if (['pptx', 'ppsx'].includes(ext)) return 'powerpoint';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'ogv', 'mov', 'm4v'].includes(ext) && !file.type.startsWith('audio/')) return 'video';
  if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'weba'].includes(ext) || file.type.startsWith('audio/')) return 'audio';
  return null;
}

function mediaElement(kind, url) {
  const element = document.createElement(kind === 'audio' ? 'audio' : 'video');
  element.playsInline = true;
  element.preload = 'auto';
  element.muted = true;
  if (url) element.src = url;
  return element;
}

function whenReady(element) {
  return new Promise((resolve, reject) => {
    const signal = AbortSignal.timeout(12000);
    if (element.readyState >= 2) { resolve(); return; }
    const finish = (error) => {
      element.removeEventListener('loadeddata', loaded);
      element.removeEventListener('error', failed);
      signal.removeEventListener('abort', failed);
      if (error) reject(error); else resolve();
    };
    const loaded = () => finish();
    const failed = () => finish(new Error('This media could not be decoded in this browser.'));
    element.addEventListener('loadeddata', loaded, { once: true });
    element.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', failed, { once: true });
  });
}

const quietPlay = element => element.play().catch(() => {});
const releaseElement = element => {
  if (!element) return;
  element.pause();
  element.srcObject = null;
  element.removeAttribute('src');
  element.load();
};

export class AudioBus {
  constructor(onError) {
    this.channels = new Map();
    this.onError = onError;
  }

  async activate() {
    if (!this.context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('This browser does not support the audio mixer.');
      this.context = new Audio();
      const audio = this.context;
      this.destination = audio.createMediaStreamDestination();
      this.master = audio.createGain();
      this.monitor = audio.createGain();
      this.meter = audio.createAnalyser();
      this.master.gain.value = 0;
      this.monitor.gain.value = 0;
      this.samples = new Float32Array(this.meter.fftSize = 512);
      const limiter = audio.createDynamicsCompressor();
      limiter.threshold.value = -4;
      limiter.knee.value = 4;
      limiter.ratio.value = 12;
      this.master.connect(limiter).connect(this.meter);
      this.meter.connect(this.destination);
      this.meter.connect(this.monitor).connect(audio.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    return this.destination.stream;
  }

  attach(id, entry) {
    if (!this.context || this.channels.get(id)?.entry === entry) return;
    const hasStreamAudio = entry.stream?.getAudioTracks().some(track => track.readyState === 'live');
    const hasFileAudio = !entry.stream && entry.element && ['video', 'audio'].includes(entry.type);
    if (!hasStreamAudio && !hasFileAudio) return;
    this.detach(id);
    try {
      const node = hasStreamAudio
        ? this.context.createMediaStreamSource(entry.stream)
        : this.context.createMediaElementSource(entry.element);
      const fader = this.context.createGain();
      const meter = this.context.createAnalyser();
      fader.gain.value = 0;
      meter.fftSize = this.samples.length;
      node.connect(fader).connect(meter).connect(this.master);
      this.channels.set(id, { entry, node, fader, meter, gain: 0 });
      if (hasFileAudio) entry.element.muted = false;
    } catch { this.onError?.('An audio input could not connect to the mixer.'); }
  }

  detach(id) {
    const channel = this.channels.get(id);
    if (!channel) return;
    channel.node.disconnect();
    channel.fader.disconnect();
    channel.meter.disconnect();
    this.channels.delete(id);
    if (channel.entry.element) channel.entry.element.muted = true;
  }

  update(project, entries, weights) {
    if (!this.master) return;
    const masterGain = project.masterMute ? 0 : dbGain(project.master);
    this.adjust(this.master.gain, masterGain);
    for (const source of project.sources) {
      if (!AUDIO.has(source.type)) continue;
      const entry = entries.get(source.id);
      if (entry) this.attach(source.id, entry);
      const channel = this.channels.get(source.id);
      if (!channel) continue;
      const weight = source.route === 'always' ? 1 : (weights.get(source.id) ?? 0);
      const gain = source.mute ? 0 : dbGain(source.gain) * weight;
      if (channel.gain !== gain) {
        this.adjust(channel.fader.gain, gain);
        channel.gain = gain;
      }
    }
  }

  adjust(parameter, gain) {
    if (parameter.studioTarget === gain) return;
    parameter.setTargetAtTime(gain, this.context.currentTime, 0.022);
    parameter.studioTarget = gain;
  }

  level(id) {
    const meter = id === 'master' ? this.meter : this.channels.get(id)?.meter;
    if (!meter) return -80;
    meter.getFloatTimeDomainData(this.samples);
    let peak = 0;
    for (const sample of this.samples) peak = Math.max(peak, Math.abs(sample));
    return gainDb(peak);
  }

  listen(enabled) {
    if (this.monitor) this.adjust(this.monitor.gain, enabled ? 1 : 0);
  }

  reset() {
    for (const id of this.channels.keys()) this.detach(id);
  }
}

export class StudioMedia {
  constructor(onChange, onError) {
    this.onChange = onChange;
    this.onError = onError;
    this.entries = new Map();
    this.photos = new Map();
    this.effects = new Map();
    this.audio = new AudioBus(onError);
    this.generation = 0;
  }

  setProject(project) {
    this.generation++;
    this.audio.reset();
    for (const id of this.entries.keys()) this.dispose(id);
    for (const path of this.photos.values()) if (path.url) URL.revokeObjectURL(path.url);
    this.photos.clear();
    this.projectId = project.id;
    for (const source of project.sources) if (source.asset) this.load(source);
  }

  get(id) { return this.entries.get(id); }

  async load(source) {
    if (this.entries.has(source.id) || !source.asset) return;
    const entry = { type: source.type, state: 'loading', abort: new AbortController() };
    const current = () => this.entries.get(source.id) === entry;
    this.entries.set(source.id, entry);
    this.onChange?.(source.id);
    try {
      const file = await loadFile(this.projectId, source.asset);
      if (!file) throw new Error('Source file is missing. Import it again.');
      if (!current()) return;
      if (source.type === 'powerpoint') {
        const { openDirectPowerPoint } = await import('/assets/live-classroom-direct-powerpoint.js?v=1');
        const deck = await openDirectPowerPoint(file, entry.abort.signal);
        if (!current()) { deck.close(); return; }
        entry.deck = deck;
        entry.frames = new Map();
      } else {
        entry.url = URL.createObjectURL(file);
        if (['image', 'graphic'].includes(source.type) && fileKind(file) === 'image') {
          entry.image = imageUrl(entry.url, true);
          await entry.image.decode();
          if (extension(file.name) === 'gif' && window.ImageDecoder) {
            try {
              const decoder = new ImageDecoder({ data: file.stream(), type: 'image/gif' });
              entry.decoder = decoder;
              await decoder.tracks.ready;
              entry.framesCount = decoder.tracks.selectedTrack.frameCount;
            } catch {
              entry.decoder?.close();
              entry.decoder = null;
            }
          }
        } else {
          entry.element = mediaElement(source.type, entry.url);
          entry.element.loop = source.type === 'graphic' || source.loop;
          await whenReady(entry.element);
        }
      }
      if (current()) {
        entry.state = 'ready';
        if (entry.wantsPlay) this.playGraphic(source.id);
        this.onChange?.(source.id);
      }
    } catch (error) {
      if (!current()) return;
      entry.state = 'error';
      entry.message = error.message;
      this.onChange?.(source.id);
    }
  }

  async connect(source) {
    if (!navigator.mediaDevices) throw new Error('Camera and screen inputs require a secure browser window.');
    const generation = this.generation;
    const previous = this.entries.get(source.id);
    if (previous?.state === 'loading') throw new Error('This input is already connecting.');
    if (previous?.state === 'ready') return;
    const entry = { type: source.type, state: 'loading' };
    this.entries.set(source.id, entry);
    this.onChange?.(source.id);
    try {
      const options = source.device ? { deviceId: { exact: source.device } } : {};
      const request = source.type === 'screen'
        ? navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: true, selfBrowserSurface: 'exclude' })
        : navigator.mediaDevices.getUserMedia(source.type === 'camera'
          ? { video: { ...options, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } }, audio: false }
          : { video: false, audio: options });
      const audioReady = source.type === 'camera' ? Promise.resolve() : this.audio.activate().catch(() => {});
      const stream = await request;
      if (this.generation !== generation || this.entries.get(source.id) !== entry) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      entry.stream = stream;
      for (const track of stream.getTracks()) track.addEventListener('ended', () => {
        if (this.entries.get(source.id) !== entry) return;
        if (track.kind === 'audio' && source.type === 'screen') {
          this.audio.detach(source.id);
          this.onChange?.(source.id);
          return;
        }
        this.disconnect(source.id);
        this.onError?.(source.name + ' disconnected.');
      }, { once: true });
      if (source.type !== 'mic') {
        entry.element = mediaElement('video');
        entry.element.srcObject = stream;
        await entry.element.play();
      }
      await audioReady;
      if (this.entries.get(source.id) !== entry) return;
      entry.state = 'ready';
      this.audio.attach(source.id, entry);
      this.onChange?.(source.id);
    } catch (error) {
      if (this.entries.get(source.id) !== entry) return;
      entry.stream?.getTracks().forEach(track => track.stop());
      releaseElement(entry.element);
      entry.state = 'error';
      entry.message = error.name === 'NotAllowedError' ? 'Permission was declined or capture was canceled.'
        : error.name === 'NotReadableError' ? 'This device is unavailable or in use by another application.'
        : error.name === 'OverconstrainedError' || error.name === 'NotFoundError' ? 'Choose an available device and reconnect.'
        : error.message;
      this.onChange?.(source.id);
      throw new Error(entry.message);
    }
  }

  disconnect(id) {
    this.dispose(id);
    this.onChange?.(id);
  }

  releaseEffect(key) {
    const effect = this.effects.get(key);
    effect.worker.terminate();
    effect.frame?.close();
    this.effects.delete(key);
  }

  dispose(id) {
    this.audio.detach(id);
    const entry = this.entries.get(id);
    if (entry) {
      this.entries.delete(id);
      entry.abort?.abort();
      entry.stream?.getTracks().forEach(track => track.stop());
      releaseElement(entry.element);
      entry.deck?.close();
      entry.decoder?.close();
      entry.gif?.close();
      if (entry.url) URL.revokeObjectURL(entry.url);
    }
    for (const key of this.effects.keys()) if (key.startsWith(id + ':')) this.releaseEffect(key);
  }

  photo(key, custom = false) {
    if (!key) return null;
    const id = custom ? 'asset:' + key : key;
    if (!this.photos.has(id)) {
      const path = {};
      this.photos.set(id, path);
      if (custom) loadFile(this.projectId, key).then(file => {
        if (!file || this.photos.get(id) !== path) return;
        path.url = URL.createObjectURL(file);
        path.image = imageUrl(path.url, true);
      }).catch(() => {});
      else path.image = imageUrl(key);
    }
    const image = this.photos.get(id)?.image;
    return image?.complete && image.naturalWidth ? image : null;
  }

  deckFrame(entry, page) {
    const index = Math.min(page, entry.deck.count - 1);
    if (!entry.frames.has(index)) {
      const canvas = document.createElement('canvas');
      canvas.width = 1600;
      canvas.height = 900;
      const frame = { canvas, ready: false };
      entry.frames.set(index, frame);
      if (entry.frames.size > 8) entry.frames.delete(entry.frames.keys().next().value);
      entry.deck.render(index, canvas).then(info => {
        frame.ready = true;
        frame.hints = info?.hints ?? [];
        this.onChange?.();
      }).catch(error => {
        frame.error = error.message;
        this.onChange?.();
      });
    }
    const frame = entry.frames.get(index);
    return frame?.ready ? frame.canvas : null;
  }

  updateGif(entry, now) {
    if (!entry.decoder || (entry.framesCount ?? 0) < 2 || entry.decoding || now < (entry.nextFrame ?? 0)) return;
    entry.decoding = true;
    const index = entry.gifIndex ?? 0;
    entry.decoder.decode({ frameIndex: index }).then(({ image }) => {
      if (!entry.decoder || entry.decoder.state === 'closed') { image.close(); return; }
      entry.gif?.close();
      entry.gif = image;
      entry.nextFrame = performance.now() + Math.max(20, (image.duration ?? 100000) / 1000);
      entry.gifIndex = (index + 1) % entry.framesCount;
    }).catch(() => { entry.nextFrame = Infinity; }).finally(() => { entry.decoding = false; });
  }

  drawable(source, layer, now) {
    const entry = this.entries.get(source.id);
    if (!entry || entry.state !== 'ready') return null;
    if (entry.deck) return this.deckFrame(entry, layer.page);
    if (entry.image) {
      this.updateGif(entry, now);
      return entry.gif || entry.image;
    }
    const video = entry.element;
    if (!video || video.readyState < 2 || !video.videoWidth) return null;
    if (source.type === 'camera' && layer.matte !== 'off') return this.matte(layer, source.id, video, now);
    return video;
  }

  matte(layer, id, video, now) {
    const key = [id, layer.matte, layer.key, layer.coverage,
      layer.keyStrength ?? 50, layer.keySoftness ?? 50, layer.keyDespill ?? 0].join(':');
    if (!this.effects.has(key)) {
      if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) return null;
      const worker = layer.matte === 'chroma'
        ? new Worker('/assets/live-classroom-portrait.js?mode=solid')
        : new Worker('/assets/mayne-studio/person-worker.js', { type: 'module' });
      const effect = { worker, started: now, seen: now, ready: false, busy: false, errored: false };
      worker.onmessage = ({ data }) => {
        if (data.ready) { effect.ready = true; return; }
        effect.busy = false;
        if (data.error) { effect.errored = true; this.onError?.('Camera background processing failed. Check the camera effect settings.'); return; }
        effect.frame?.close();
        effect.frame = data.bitmap;
        effect.produced = true;
      };
      worker.onerror = () => {
        effect.errored = true;
        this.onError?.('The camera background processor could not load.');
      };
      this.effects.set(key, effect);
    }
    const effect = this.effects.get(key);
    effect.seen = now;
    if (!effect.ready && !effect.errored && now - effect.started > 60000) {
      effect.errored = true;
      this.onError?.('Camera background processing could not start.');
    }
    if (!effect.errored && effect.ready && !effect.busy && now >= (effect.next ?? 0)) {
      effect.busy = true;
      effect.next = now + (layer.matte === 'person' ? 64 : 45);
      const width = Math.min(video.videoWidth, layer.matte === 'person' ? 640 : 960);
      const height = Math.max(1, Math.round(video.videoHeight * width / video.videoWidth));
      createImageBitmap(video, { resizeWidth: width, resizeHeight: height }).then(bitmap => {
        if (this.effects.get(key) !== effect) { bitmap.close(); return; }
        effect.worker.postMessage({ bitmap, settings: { coverage: layer.coverage,
          backdropColor: layer.matte === 'chroma' ? layer.key : null,
          keyStrength: layer.keyStrength ?? 50,
          keySoftness: layer.keySoftness ?? 50,
          keyDespill: layer.keyDespill ?? 0,
          timestamp: now } }, [bitmap]);
      }).catch(() => { effect.busy = false; });
    }
    return effect.frame ?? null;
  }

  matteStatus(id, layer) {
    const effect = this.effects.get([id, layer.matte, layer.key, layer.coverage,
      layer.keyStrength ?? 50, layer.keySoftness ?? 50, layer.keyDespill ?? 0].join(':'));
    if (effect?.errored) return 'Camera effect unavailable';
    if (effect?.produced) return effect.frame ? 'Background removed' : 'Looking for presenter';
    return 'Processing camera';
  }

  trimEffects(now) {
    for (const [key, effect] of this.effects) if (now - effect.seen > 3000) this.releaseEffect(key);
  }

  playSources(project, incoming, outgoing) {
    const active = new Set([...(incoming?.layers ?? []), ...(outgoing?.layers ?? [])]
      .filter(layer => layer.visible).map(layer => layer.source));
    for (const source of project.sources) {
      if (!['video', 'audio'].includes(source.type)) continue;
      const entry = this.entries.get(source.id);
      if (!entry?.element || entry.state !== 'ready') continue;
      const onAir = source.route === 'always' || active.has(source.id);
      entry.element.loop = source.loop;
      if (onAir && !entry.active && source.autoplay) {
        if (entry.element.ended) entry.element.currentTime = 0;
        quietPlay(entry.element);
      }
      if (!onAir && entry.active) entry.element.pause();
      entry.active = onAir;
    }
  }

  playGraphic(id) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.wantsPlay = entry.state === 'loading';
    entry.gifIndex = 0;
    entry.nextFrame = 0;
    const element = entry.element;
    if (!element || element.readyState < 2) return;
    element.currentTime = 0;
    quietPlay(element);
  }

  stopGraphic(id) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.wantsPlay = false;
    entry.element?.pause();
  }
}
