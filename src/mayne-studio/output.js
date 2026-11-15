const message = 'mayne-studio-output-ready';
const key = 'setMayneStudioProgram';
const saveName = value => value.trim().replace(/[^a-z0-9 _-]/gi, '').replace(/\s+/g, '-').slice(0, 80) || 'Mayne-Studio';

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function outputPage() {
  const output = document.querySelector('#output');
  const video = document.querySelector('#output-video');
  const status = document.querySelector('#output-message');
  const audio = document.querySelector('#output-audio');
  output.hidden = false;
  document.querySelector('.skip').hidden = true;
  document.title = 'Mayne Studio — Program Output';
  window[key] = (feed, refresh) => {
    if (video.srcObject !== feed) video.srcObject = feed;
    status.hidden = true;
    video.play().catch(() => { status.textContent = 'Click the output to play.'; status.hidden = false; });
    if (!window.outputRefresh) {
      window.outputRefresh = true;
      function tick() {
        refresh();
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }
  };
  function listen() {
    video.muted = !video.muted;
    audio.textContent = video.muted ? 'Enable audio' : 'Mute audio';
    video.play().catch(() => {});
  }
  function fullscreen() {
    const operation = document.fullscreenElement ? document.exitFullscreen() : output.requestFullscreen?.();
    operation?.catch(() => {});
  }
  audio.addEventListener('click', listen);
  document.querySelector('#output-fullscreen').addEventListener('click', fullscreen);
  output.addEventListener('dblclick', fullscreen);
  video.addEventListener('click', () => video.play().then(() => { status.hidden = true; }).catch(() => {}));
  window.addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'f') fullscreen();
    if (event.key.toLowerCase() === 'm') listen();
  });
  if (window.opener && !window.opener.closed) window.opener.postMessage({ type: message }, location.origin);
  else status.textContent = 'Open Program output from the Mayne Studio control room.';
}

export class ProgramOutput {
  constructor(canvas, audio, frame, notify, stateChanged) {
    this.canvas = canvas;
    this.audio = audio;
    this.frame = frame;
    this.notify = notify;
    this.stateChanged = stateChanged;
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.source !== this.popup || event.data?.type !== message) return;
      this.feed().then(feed => {
        if (!this.popup?.closed) this.popup[key]?.(feed, () => this.frame());
      }).catch(error => this.notify(error.message, true));
    });
  }

  async feed() {
    if (!this.canvas.captureStream) throw new Error('This browser cannot capture the Program canvas.');
    const audio = await this.audio.activate();
    this.videoStream ??= this.canvas.captureStream(30);
    this.stream ??= new MediaStream([...this.videoStream.getVideoTracks(), ...audio.getAudioTracks()]);
    return this.stream;
  }

  open() {
    if (this.popup && !this.popup.closed) { this.popup.focus(); return; }
    const url = new URL(location.href);
    url.search = 'output=1';
    url.hash = '';
    this.popup = window.open(url, '_blank', 'popup,width=1152,height=648');
    if (!this.popup) throw new Error('Allow pop-ups for this site to open Program output.');
    this.audio.activate().catch(error => this.notify(error.message, true));
  }

  get active() { return Boolean(this.recorder || this.starting); }

  async record(name, direct = false) {
    if (this.recorder?.state === 'recording') { this.recorder.stop(); this.stateChanged(); return; }
    if (this.active) return;
    if (!window.MediaRecorder) throw new Error('This browser cannot record the Program feed.');
    this.starting = true;
    this.stateChanged();
    const mime = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    const ext = mime?.startsWith('video/mp4') ? 'mp4' : 'webm';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = saveName(name) + '-' + stamp + '.' + ext;
    let writer;
    try {
      if (direct) {
        const file = await window.showSaveFilePicker({ suggestedName: filename,
          types: [{ description: 'Program video', accept: { ['video/' + ext]: ['.' + ext] } }] });
        writer = await file.createWritable();
      }
      const stream = await this.feed();
      const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 5500000, audioBitsPerSecond: 128000 });
      let writes = Promise.resolve();
      let writeError;
      let recorderError;
      const chunks = [];
      recorder.ondataavailable = ({ data }) => {
        if (!data.size) return;
        if (!writer) chunks.push(data);
        else writes = writes.then(async () => {
          if (writeError) return;
          try { await writer.write(data); }
          catch (error) { writeError = error; if (recorder.state === 'recording') recorder.stop(); }
        });
      };
      recorder.onerror = event => { recorderError = event.error || new Error('Recording failed.'); };
      recorder.onstop = async () => {
        this.stateChanged();
        try {
          await writes;
          if (writeError) throw writeError;
          if (writer) {
            await writer.close();
            this.notify(recorderError ? 'A partial recording was saved.' : 'Recording saved to disk.', Boolean(recorderError));
          } else if (chunks.length) {
            const actual = recorder.mimeType || mime || 'video/webm';
            const blob = new Blob(chunks, { type: actual });
            this.lastRecording = { blob, name: filename.replace(/\.(webm|mp4)$/, actual.includes('mp4') ? '.mp4' : '.webm') };
            download(blob, this.lastRecording.name);
            this.notify(recorderError ? 'Downloaded a partial recording.' : 'Program recording downloaded.', Boolean(recorderError));
          } else this.notify(recorderError?.message || 'The recording was empty. Try a longer capture.', true);
        } catch (error) {
          await writer?.abort().catch(() => {});
          this.notify('Could not save the recording. ' + error.message, true);
        } finally {
          this.recorder = null;
          this.startedAt = 0;
          this.stateChanged();
        }
      };
      recorder.start(1000);
      this.recorder = recorder;
      this.startedAt = performance.now();
    } catch (error) {
      await writer?.abort().catch(() => {});
      if (error.name !== 'AbortError') throw error;
    } finally {
      this.starting = false;
      this.stateChanged();
    }
  }
}
