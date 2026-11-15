import { AUDIO, BACKGROUNDS, PLACE, SHORTCUTS, SOURCES, TEMPLATES, OVERLAYS, audioWeights,
  clamp, clock, clone, makeLayer, makeOverlay, makeProject, makeScene, makeSource, normalizeProject,
  transitionProgress, uid } from './model.js';
import * as storage from './projects.js';
import { StudioMedia, fileKind } from './media.js';
import { StudioRenderer } from './render.js';
import { ProgramOutput, download, outputPage } from './output.js';
import { buttons, classroomPanel, formatGain, layersPanel, mixerPanel, options, overlaysPanel } from './panels.js';
import { e, fields, icon, iconButton, option, shell } from './ui.js';
import { SceneDesigner } from './scene-designer.js';
import { InlinePreviewEditor } from './inline-preview.js';
import { SHORTCUT_ACTIONS, keyboardShortcut, shortcutAction, shortcutLabel } from './shortcuts.js';

const $ = id => document.getElementById(id);
const fileAccept = {
  all: '.pptx,.ppsx,.jpg,.jpeg,.png,.webp,.gif,.avif,.webm,.mp4,.ogv,.mov,.m4v,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac,.weba,image/*,video/*,audio/*',
  powerpoint: '.pptx,.ppsx', graphic: '.png,.jpg,.jpeg,.webp,.gif,.avif,.webm,.mp4',
  backdrop: '.png,.jpg,.jpeg,.webp,.gif,.avif',
};
const draftTemplate = 'standby';
const timers = () => ({ visible: false, deadline: 0, remaining: 0 });
const dataId = id => 'data-id="' + id + '"';
const textName = (name, fallback) => name.trim().slice(0, 120) || fallback;

class Studio {
  constructor(root) {
    this.root = root;
    this.root.innerHTML = shell();
    this.previewOverlays = new Map();
    this.liveOverlays = new Map();
    this.media = new StudioMedia(() => this.mediaChanged(), (message) => this.notify(message, true));
    this.renderer = new StudioRenderer($('preview-canvas'), $('program-canvas'), this.media);
    this.output = new ProgramOutput($('program-canvas'), this.media.audio, () => this.frame(),
      (message, error) => this.notify(message, error), () => this.recordStatus());
    this.tab = 'layers';
    this.timer = timers();
    this.saved = Promise.resolve();
    this.editing = false;
    this.lastFrame = 0;
    this.lastThumb = 0;
    this.lastStatus = 0;
    this.started = performance.now();
    this.dialog = $('dialog');
    this.designer = new SceneDesigner(this);
    this.inlineEditor = new InlinePreviewEditor(this);
    this.tools = $('studio-tools');
    this.tools.addEventListener('close', () => { this.tab = 'layers'; });
    this.dialog.addEventListener('keydown', event => {
      const input = event.target.closest?.('[data-shortcut]');
      if (!input || event.key === 'Tab' || event.key === 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      const id = input.dataset.shortcut;
      const binding = ['Backspace','Delete'].includes(event.key) ? '' : keyboardShortcut(event);
      if (!binding && !['Backspace','Delete'].includes(event.key)) return;
      if (binding && Object.entries(this.project.shortcuts).some(([key, value]) => key !== id && value === binding)) {
        this.notify(shortcutLabel(binding) + ' is already assigned. Clear that shortcut first.', true);
        return;
      }
      this.project.shortcuts[id] = binding;
      input.value = shortcutLabel(binding);
      this.mark();
      this.renderDock();
      this.render();
    });
    this.root.addEventListener('click', event => this.click(event));
    this.root.addEventListener('input', event => this.input(event));
    this.root.addEventListener('change', event => this.change(event));
    this.dialog.addEventListener('submit', event => {
      event.preventDefault();
      if (!this.dialogHandler) return;
      try {
        Promise.resolve(this.dialogHandler(new FormData(event.target))).catch(error => this.notify(error.message, true));
      } catch (error) { this.notify(error.message, true); }
    });
    document.addEventListener('keydown', event => this.hotkey(event));
    window.addEventListener('beforeunload', event => {
      if (this.output.active || this.editing) event.preventDefault();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.saveTimer) this.save().catch(() => {});
    });
    window.addEventListener('pagehide', event => {
      if (!event.persisted && this.output.popup && !this.output.popup.closed) this.output.popup.close();
    });
  }

  async start() {
    try {
      const id = storage.lastProject();
      const loaded = id && await storage.loadProject(id);
      this.load(loaded ? normalizeProject(loaded) : makeProject());
      if (!loaded) this.mark();
    } catch (error) {
      this.load(makeProject());
      this.setSaveStatus('Browser storage unavailable', true);
      this.notify(error.message, true);
    }
    this.root.hidden = false;
    requestAnimationFrame(() => {
      const loop = () => { this.frame(); requestAnimationFrame(loop); };
      loop();
    });
    setInterval(() => { if (document.hidden && this.output.active) this.frame(); }, 40);
  }

  load(project) {
    this.project = project;
    this.media.setProject(project);
    for (const overlay of project.overlays) if (overlay.asset) this.loadGraphic(overlay);
    const first = project.scenes.find(scene => scene.template === draftTemplate) || project.scenes[0];
    this.program = this.shot(first);
    this.previewId = project.scenes.find(scene => scene.template === 'presenter')?.id || project.scenes[0].id;
    this.layerId = this.scene.layers.at(-1)?.id;
    this.transition = null;
    this.previewOverlays.clear();
    this.liveOverlays.clear();
    this.timer = { ...timers(), remaining: project.timerSeconds };
    this.started = performance.now();
    storage.lastProject(project.id);
    this.setSaveStatus('Saved on this device');
    this.render();
  }

  get scene() { return this.project.scenes.find(scene => scene.id === this.previewId) || this.project.scenes[0]; }
  get layer() { return this.scene.layers.find(layer => layer.id === this.layerId); }
  source(id) { return this.project.sources.find(source => source.id === id); }
  overlay(id) { return this.project.overlays.find(item => item.id === id); }
  shot(scene, snapshot = true) {
    const sources = new Map(this.project.sources.map(source => [source.id, snapshot ? clone(source) : source]));
    return { scene: snapshot ? clone(scene) : scene, sources };
  }

  notify(message, error = false) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.toggle('error', error);
    toast.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { toast.hidden = true; }, error ? 7200 : 3600);
  }

  setSaveStatus(value, error = false) {
    $('save-state').innerHTML = '<i class="status-dot"' + (error ? ' style="color:#ff9b93"' : '') + '></i> ' + e(value);
  }

  mark() {
    this.project.updated = Date.now();
    this.setSaveStatus('Saving project…');
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { this.save().catch(() => {}); }, 420);
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const project = clone(this.project);
    const operation = this.saved.catch(() => {}).then(() => storage.saveProject(project));
    this.saved = operation;
    return operation.then(() => {
      if (this.saved === operation && !this.saveTimer) this.setSaveStatus('Saved on this device');
    }).catch(error => {
      this.setSaveStatus('Project could not save', true);
      this.notify('Browser storage could not save the project. ' + error.message, true);
      throw error;
    });
  }

  async atomic(mutator, file) {
    if (this.editing) throw new Error('Wait for the current project operation to finish.');
    this.editing = true;
    this.setSaveStatus('Saving media…');
    try {
      await this.saved.catch(() => {});
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      const draft = clone(this.project);
      draft.updated = Date.now();
      const asset = uid();
      const result = mutator(draft, asset);
      await storage.saveProject(draft, [[asset, file]]);
      this.project = draft;
      this.setSaveStatus('Saved on this device');
      return result;
    } catch (error) {
      this.setSaveStatus('Media could not save', true);
      this.mark();
      throw error;
    } finally { this.editing = false; }
  }

  setPreview(id) {
    if (!this.project.scenes.some(scene => scene.id === id)) return;
    this.previewId = id;
    this.layerId = this.scene.layers.at(-1)?.id;
    this.render();
  }

  take(type) {
    if (this.transition || this.editing) return;
    const previous = this.program;
    this.program = this.shot(this.scene);
    if (this.project.scenes.some(scene => scene.id === previous.scene.id)) this.previewId = previous.scene.id;
    this.layerId = this.scene.layers.at(-1)?.id;
    if (type !== 'cut') this.transition = { type, previous, start: performance.now(), duration: this.project.duration };
    this.media.audio.activate().catch(error => this.notify(error.message, true));
    this.render();
  }

  render() {
    if (!this.project) return;
    $('project-name').textContent = this.project.name;
    $('preview-name').textContent = this.scene.name;
    $('preview-canvas').setAttribute('aria-label', 'Preview: ' + this.scene.name);
    $('program-name').textContent = this.program?.scene.name ?? '';
    $('program-canvas').setAttribute('aria-label', 'Program: ' + this.program?.scene.name);
    $('transition').value = this.project.transition;
    const ms = $('transition-ms');
    if (![...ms.options].some(item => Number(item.value) === this.project.duration)) ms.add(new Option(this.project.duration + ' ms', this.project.duration));
    ms.value = this.project.duration;
    ms.disabled = this.project.transition === 'cut';
    $('take').disabled = !!this.transition;
    this.root.querySelector('[data-act="cut"]').disabled = !!this.transition;
    this.root.querySelector('[data-act="cut"] kbd').textContent = shortcutLabel(this.project.shortcuts.cut);
    $('take').querySelector('kbd').textContent = shortcutLabel(this.project.shortcuts.take);
    $('scenes').innerHTML = this.project.scenes.map((scene, index) => {
      const preview = scene.id === this.previewId, program = scene.id === this.program.scene.id;
      return `<div class="scene-tile"><button class="scene ${program ? 'on-program' : ''}" type="button" data-act="scene" data-id="${scene.id}" aria-pressed="${preview}"
        title="${e(scene.name)}"><canvas width="128" height="72" aria-hidden="true" data-thumb="${scene.id}"></canvas>
        <strong>${e(scene.name)}</strong><span class="scene-meta"><span>${program ? 'Program' : preview ? 'Preview' : 'Ready'}</span>
        ${index < 9 && this.project.shortcuts['scene' + index] ? '<kbd>' + e(shortcutLabel(this.project.shortcuts['scene' + index])) + '</kbd>' : ''}</span></button>
        <button class="scene-gear" type="button" data-act="scene-tools" data-id="${scene.id}" aria-label="Settings for ${e(scene.name)}">${icon('gear',13)} Scene settings</button></div>`;
    }).join('');
    this.thumbnails(performance.now());
    this.renderDock();
    this.renderMixer();
    this.recordStatus();
    this.renderProgramDeck();
    this.inlineEditor.refresh();
    if (this.designer.open) this.designer.refresh();
  }

  renderDock() {
    if (!this.project || !this.program) return;
    const panel = $('dock-panel');
    $('tools-scene-name').textContent = this.scene.name + ' · controls';
    for (const tab of $('dock-tabs').querySelectorAll('[role="tab"]')) {
      const selected = tab.dataset.id === this.tab;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', 'tab-' + this.tab);
    $('dock-add-label').textContent = this.tab === 'overlays' ? 'Add overlay' : this.tab === 'classroom' ? 'Add PowerPoint' : 'Add input';
    panel.innerHTML = this.tab === 'layers' ? layersPanel(this.scene, this.project, this, this.media)
      : this.tab === 'overlays' ? overlaysPanel(this.project, this.previewOverlays, this.liveOverlays)
      : classroomPanel(this.project, this.timer, { preview: this.shot(this.scene, false), program: this.program }, this.media);
  }

  showTools(id) {
    if (id && this.project.scenes.some(scene => scene.id === id) && id !== this.previewId) this.setPreview(id);
    this.tab = 'layers';
    this.renderDock();
    if (!this.tools.open) this.tools.showModal();
  }

  renderProgramDeck() {
    const container = $('live-deck-controls');
    if (!this.program || !container) return;
    const layers = this.program.scene.layers.filter(layer => layer.visible && this.program.sources.get(layer.source)?.type === 'powerpoint');
    container.hidden = !layers.length;
    if (!layers.length) { container.innerHTML = ''; return; }
    container.innerHTML = layers.map(layer => {
      const source = this.program.sources.get(layer.source);
      const deck = this.media.get(layer.source)?.deck;
      const count = deck?.count ?? 0;
      const page = Math.min(Math.max(layer.page, 0), Math.max(count - 1, 0));
      const data = 'data-id="' + layer.id + '" data-bus="program"';
      return '<div class="live-deck-row"><strong title="' + e(source?.name) + '">' + icon('powerpoint',14) + ' ' + e(source?.name || 'PowerPoint') + '</strong>'
        + '<div class="slide-nav"><button type="button" class="button" data-act="slide-prev" ' + data + (page <= 0 ? ' disabled' : '') + '>'
        + icon('left',14) + ' Previous</button><span class="mono">' + (count ? 'Slide ' + (page + 1) + ' / ' + count : 'Loading slides…') + '</span>'
        + '<button type="button" class="button" data-act="slide-next" ' + data + (!count || page >= count - 1 ? ' disabled' : '') + '>Next ' + icon('right',14) + '</button></div></div>';
    }).join('');
  }

  activeDeck(bus) {
    const scene = bus === 'program' ? this.program.scene : this.scene;
    return scene.layers.find(layer => layer.visible && this.source(layer.source)?.type === 'powerpoint'
      && this.media.get(layer.source)?.deck);
  }

  advanceDeck(bus, delta) {
    const layer = this.activeDeck(bus);
    if (layer) this.slide(layer.id, bus, delta);
  }

  cueAdjacent(step) {
    const index = this.project.scenes.findIndex(scene => scene.id === this.previewId);
    if (index < 0) return;
    this.setPreview(this.project.scenes[(index + step + this.project.scenes.length) % this.project.scenes.length].id);
  }

  shortcutDialog() {
    const fields = SHORTCUT_ACTIONS.map(([id, label]) =>
      '<div class="shortcut-row"><label for="shortcut-' + id + '">' + e(label) + '</label>'
      + '<input type="text" id="shortcut-' + id + '" data-shortcut="' + id + '" value="' +
      e(shortcutLabel(this.project.shortcuts[id])) + '" aria-label="Set ' + e(label) + '" readonly>'
      + '<button class="button" type="button" data-act="shortcut-clear" data-id="' + id + '">Clear</button></div>').join('');
    this.dialogOpen('Keyboard shortcuts', '<p>Click an assignment box, then press the key or key combination you want. Changes are saved with this project. Backspace clears an assignment. Avoid browser-reserved shortcuts.</p>'
      + '<div class="shortcut-list">' + fields + '</div>',
      '<button class="button" type="button" data-act="shortcuts-reset">Restore defaults</button>');
  }

  renderMixer() {
    if (this.project) $('mixer').innerHTML = mixerPanel(this.project, this.media);
  }

  mediaChanged() {
    if (!this.program || !this.project || this.mediaRefresh) return;
    this.mediaRefresh = setTimeout(() => {
      this.mediaRefresh = null;
      if (!document.activeElement?.matches('[data-layer],[data-source],[data-project]')) this.renderDock();
      this.renderProgramDeck();
      if (!document.activeElement?.matches('[data-gain]')) this.renderMixer();
    }, 90);
  }

  frame() {
    if (!this.program) return;
    const now = performance.now();
    if (now - this.lastFrame < 30) return;
    this.lastFrame = now;
    const progress = this.transition ? transitionProgress(this.transition.start, this.transition.duration, now) : { progress: 1, eased: 1 };
    let outgoing = this.transition?.previous;
    if (this.transition && progress.progress >= 1) {
      this.transition = null;
      outgoing = null;
      $('take').disabled = false;
      this.root.querySelector('[data-act="cut"]').disabled = false;
    }
    this.expireOverlays(now);
    if (this.timer.deadline) {
      this.timer.remaining = Math.max(0, (this.timer.deadline - now) / 1000);
      if (this.timer.remaining === 0) { this.timer.deadline = 0; if (this.tab === 'classroom') this.renderDock(); }
    }
    this.media.playSources(this.project, this.program.scene, outgoing?.scene);
    this.media.audio.update(this.project, this.media.entries, audioWeights(this.program.scene, outgoing?.scene, progress.eased));
    this.renderer.draw({ preview: this.shot(this.scene, false), program: this.program,
      transition: this.transition, previewOverlays: this.previewOverlays, liveOverlays: this.liveOverlays,
      timer: { ...this.timer, remaining: Math.ceil(this.timer.remaining) } }, now);
    this.designer.draw(now);
    if (now - this.lastThumb > 1050 && !document.hidden) { this.lastThumb = now; this.thumbnails(now); }
    if (now - this.lastStatus > 110) { this.lastStatus = now; this.updateStatus(now); }
    this.media.trimEffects(now);
  }

  thumbnails(now) {
    const map = this.shot(this.scene, false).sources;
    for (const node of $('scenes').querySelectorAll('canvas')) {
      const scene = this.project.scenes.find(item => item.id === node.dataset.thumb);
      this.renderer.thumbnail(node, scene, map, now);
    }
  }

  updateStatus(now) {
    $('session-clock').textContent = clock((now - this.started) / 1000, true);
    if ($('timer-read')) $('timer-read').textContent = clock(Math.ceil(this.timer.remaining));
    if ($('matte-status') && this.layer) $('matte-status').textContent = this.media.matteStatus($('matte-status').dataset.id, this.layer);
    for (const node of this.root.querySelectorAll('[data-meter]')) {
      const level = clamp(this.media.audio.level(node.dataset.meter), -60, 0, -60);
      node.style.setProperty('--level', ((level + 60) / .6).toFixed(1) + '%');
    }
    for (const node of this.root.querySelectorAll('.media-clock')) {
      const media = this.media.get(node.dataset.sourceId)?.element;
      node.textContent = media ? clock(media.currentTime) + ' / ' + clock(Number.isFinite(media.duration) ? media.duration : 0) : '';
    }
    if (this.output.recorder?.state === 'recording') {
      $('record-status').textContent = 'REC  ' + clock((now - this.output.startedAt) / 1000, true);
    }
  }

  recordStatus() {
    const recording = this.output.recorder?.state === 'recording';
    const button = $('record');
    button.disabled = this.output.active && !recording;
    button.classList.toggle('active', recording);
    button.querySelector('span').textContent = recording ? 'Stop recording' : this.output.active ? 'Saving recording' : 'Record';
    $('record-status').hidden = !this.output.active;
    $('record-status').textContent = recording ? 'REC  00:00:00' : 'Preparing recording…';
    $('runtime-status').textContent = this.output.lastRecording && !this.output.active ? 'Recording ready' : 'Browser-local';
  }

  dialogOpen(title, body, footer = '', onSubmit = null) {
    this.dialogHandler = onSubmit;
    this.dialog.innerHTML = `<form><div class="dialog-top"><h2 id="dialog-title">${e(title)}</h2>${iconButton('close-dialog','Close dialog','close')}</div>
      <div class="dialog-body">${body}</div>${footer ? '<div class="dialog-bottom">' + footer + '</div>' : ''}</form>`;
    if (!this.dialog.open) this.dialog.showModal();
  }

  closeDialog() { if (this.dialog.open) this.dialog.close(); this.dialogHandler = null; }

  inputMenu() {
    const actions = [
      ['camera', 'Camera'], ['mic', 'Microphone'], ['screen', 'Screen or app window'], ['powerpoint', 'PowerPoint deck'],
      ['slideshow', 'Capture PowerPoint slideshow'], ['files', 'Video, image or audio'], ['title', 'Text layer'],
    ];
    const available = this.project.sources.filter(source => !this.scene.layers.some(layer => layer.source === source.id));
    this.dialogOpen('Add an input', '<div class="input-grid">' + actions.map(([id, label]) =>
      buttons(icon(id === 'slideshow' ? 'popout' : id === 'files' ? 'folder' : id, 17) + e(label), 'input-' + id)).join('')
      + '</div>' + (available.length ? '<div class="form-grid"><label>Use an existing input<select id="reuse-input"><option value="">Select an input</option>'
        + available.map(source => option(source.id, source.name)).join('') + '</select></label>'
        + '<div class="inline">' + buttons('Add to preview scene', 'reuse-input') + buttons('Remove from project', 'delete-input') + '</div></div>' : ''));
  }

  addLayer(project, scene, source) {
    if (scene.layers.length >= 40) throw new Error('A scene can contain up to 40 input layers.');
    const slides = scene.template === 'slides';
    const hasSlides = scene.layers.some(layer => ['powerpoint','image','screen'].includes(project.sources.find(s => s.id === layer.source)?.type));
    const layers = source.type === 'title' ? PLACE.title
      : source.type === 'camera' && (slides || hasSlides || scene.layers.some(layer => project.sources.find(s => s.id === layer.source)?.type === 'camera')) ? PLACE.inset
      : slides && ['powerpoint', 'screen', 'image', 'video'].includes(source.type) ? PLACE.slides : PLACE.full;
    const layer = makeLayer(source.id, layers);
    if (['powerpoint', 'screen', 'image'].includes(source.type)) layer.fit = 'contain';
    scene.layers.push(layer);
    return layer;
  }

  addSource(type, name, options, project = this.project, scene = this.scene) {
    if (project.sources.length >= 100) throw new Error('A project can hold up to 100 inputs.');
    if (scene.layers.length >= 40) throw new Error('A scene can contain up to 40 input layers.');
    const source = makeSource(type, name, options);
    project.sources.push(source);
    const layer = this.addLayer(project, scene, source);
    return { source, layer };
  }

  async deviceMenu(type, existing) {
    if (!navigator.mediaDevices?.enumerateDevices) throw new Error('Open the studio over HTTPS to use media devices.');
    const all = await navigator.mediaDevices.enumerateDevices();
    const hardware = all.filter(device => device.kind === (type === 'camera' ? 'videoinput' : 'audioinput'));
    const label = SOURCES[type];
    const options = option('', 'Default ' + label.toLowerCase(), existing?.device)
      + hardware.filter(device => device.deviceId && device.deviceId !== 'default')
        .map((device, index) => option(device.deviceId, device.label || label + ' ' + (index + 1), existing?.device)).join('');
    this.dialogOpen(existing ? 'Choose device' : 'Add ' + label.toLowerCase(),
      '<div class="form-grid"><label>Device<select name="device">' + options + '</select></label>'
      + '<label>Input name<input name="name" maxlength="120" value="' + e(existing?.name || label) + '"></label></div>',
      '<button class="button primary" type="submit">Connect ' + label.toLowerCase() + '</button>', async data => {
        this.closeDialog();
        const device = String(data.get('device') || '');
        if (existing) {
          this.media.disconnect(existing.id);
          existing.device = device;
          existing.name = textName(String(data.get('name')), label);
          this.mark();
          await this.media.connect(existing);
        } else {
          const { source, layer } = this.addSource(type, textName(String(data.get('name')), label), { device });
          this.layerId = layer.id;
          this.tab = 'layers';
          this.mark();
          this.render();
          await this.media.connect(source);
        }
      });
  }

  startScreen(slideshow) {
    this.closeDialog();
    const { source, layer } = this.addSource('screen', slideshow ? 'PowerPoint slideshow' : 'Screen share', {});
    this.layerId = layer.id;
    this.tab = 'layers';
    this.mark();
    this.render();
    return this.media.connect(source);
  }

  pickFile(mode, data = null) {
    this.pick = { mode, data, scene: this.scene.id };
    const picker = $('media-picker');
    picker.value = '';
    picker.accept = fileAccept[mode];
    picker.multiple = mode === 'all';
    picker.click();
  }

  async addFiles(fileList) {
    const pick = this.pick;
    this.pick = null;
    if (!pick) return;
    for (const file of fileList) {
      const kind = fileKind(file);
      if (!kind || (pick.mode === 'powerpoint' && kind !== 'powerpoint')
        || (pick.mode === 'backdrop' && kind !== 'image') || (pick.mode === 'graphic' && !['image', 'video'].includes(kind))) {
        this.notify('Choose a supported media file. ' + file.name, true);
        continue;
      }
      if (file.size > storage.FILE_LIMIT) { this.notify(file.name + ' exceeds the 180 MB per-file limit.', true); continue; }
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 120);
      const result = await this.atomic((draft, id) => {
        const scene = draft.scenes.find(item => item.id === pick.scene);
        if (!scene) throw new Error('Select a scene and import the file again.');
        if (pick.mode === 'backdrop') {
          scene.backdrop = id;
          scene.background = 'custom';
          return null;
        }
        if (pick.mode === 'graphic') {
          if (draft.overlays.length >= SHORTCUTS.length) throw new Error('This project already uses all eight overlay slots.');
          const overlay = makeOverlay('graphic', { ...pick.data, asset: id, name: pick.data?.name || name });
          draft.overlays.push(overlay);
          return { overlay };
        }
        return this.addSource(kind, name, { asset: id }, draft, scene);
      }, file);
      if (result?.source) {
        this.previewId = pick.scene;
        this.layerId = result.layer.id;
        this.tab = 'layers';
        this.media.load(result.source);
      }
      if (result?.overlay) this.loadGraphic(result.overlay);
      this.render();
    }
  }

  sceneDialog(adding) {
    const scene = this.scene;
    const position = this.project.scenes.indexOf(scene);
    const body = '<div class="form-grid">' + (adding
      ? '<label>Scene template<select name="template">' + options(TEMPLATES, 'blank') + '</select></label><label>Scene name<input name="name" maxlength="120" placeholder="Use template name"></label>'
      : '<label>Scene name<input name="name" required maxlength="120" value="' + e(scene.name) + '"></label>'
      + '<label>Background<select name="background">' + options(Object.fromEntries(Object.entries(BACKGROUNDS).filter(([id]) => id !== 'custom' || scene.backdrop)), scene.background) + '</select></label>'
      + '<div class="inline">' + buttons(icon('image',15) + ' Upload background','input-backdrop') + '</div>'
      + '<label>On-screen title<input name="title" maxlength="100" value="' + e(scene.title) + '"></label>'
      + '<label>On-screen caption<input name="caption" maxlength="200" value="' + e(scene.caption) + '"></label>') + '</div>';
    const manage = adding ? '' : buttons('Duplicate','duplicate-scene') + buttons('Move up','scene-up',position === 0 ? 'disabled' : '')
      + buttons('Move down','scene-down',position === this.project.scenes.length - 1 ? 'disabled' : '')
      + buttons('Delete','remove-scene',this.project.scenes.length < 2 ? 'disabled' : '');
    this.dialogOpen(adding ? 'Add scene' : 'Scene settings', body, manage
      + '<button class="button primary" type="submit">' + (adding ? 'Add scene' : 'Apply to Preview') + '</button>', data => {
        if (adding) {
          if (this.project.scenes.length >= 40) throw new Error('This project already has 40 scenes.');
          const template = String(data.get('template'));
          const item = makeScene(template, textName(String(data.get('name')), TEMPLATES[template]));
          this.project.scenes.push(item);
          this.setPreview(item.id);
        } else {
          scene.name = textName(String(data.get('name')), scene.name);
          scene.background = String(data.get('background'));
          scene.title = String(data.get('title')).slice(0, 100);
          scene.caption = String(data.get('caption')).slice(0, 200);
        }
        this.closeDialog();
        this.mark();
        this.render();
      });
  }

  projectDialog() {
    this.dialogOpen('Projects', '<p>Scenes and media save in this browser. Backups include imported media.</p>'
      + '<div class="input-grid">' + buttons('New classroom project','new-project') + buttons('Rename current project','rename-project')
      + buttons('Duplicate current project','copy-project') + buttons('Download project backup','export-project')
      + buttons('Import project backup','import-project') + '</div><div class="project-list" id="project-list">Loading projects…</div>');
    storage.listProjects().then(items => {
      const list = $('project-list');
      if (!list) return;
      list.innerHTML = items.sort((a, b) => b.updated - a.updated).map(project => {
        const id = dataId(project.id);
        return '<div class="project-item"><strong>' + e(project.name) + '</strong><div class="inline">'
          + (project.id === this.project.id ? '<span class="slide-label">Open</span>' : buttons('Open','load-project',id)
            + iconButton('delete-project', 'Delete ' + project.name, 'trash', id)) + '</div></div>';
      }).join('');
    }).catch(error => { if ($('project-list')) $('project-list').textContent = error.message; });
  }

  async loadProject(project) {
    if (this.output.active) throw new Error('Stop the recording before switching projects.');
    this.editing = true;
    try {
      await this.save();
      this.load(project);
      await this.save();
      this.closeDialog();
    } finally { this.editing = false; }
  }

  overlayNew() {
    if (this.project.overlays.length >= SHORTCUTS.length) throw new Error('This project already uses all eight overlay slots.');
    this.dialogOpen('Add overlay', '<div class="input-grid">' + Object.entries(OVERLAYS).map(([id, title]) =>
      buttons(icon(id,17) + e(title), 'overlay-type', dataId(id))).join('') + '</div>');
  }

  overlayEdit(id, type) {
    const existing = id && this.overlay(id);
    const draft = clone(existing || makeOverlay(type));
    this.dialogOpen(existing ? 'Edit overlay' : 'Add ' + OVERLAYS[draft.type].toLowerCase(),
      '<div class="form-grid"><label>Name<input name="name" maxlength="120" value="' + e(draft.name) + '"></label>'
      + (['lower','message','hand'].includes(draft.type) ? '<label>On-screen text<input name="text" maxlength="160" value="' + e(draft.text) + '"></label>' : '')
      + (draft.type === 'lower' ? '<label>Subtitle<input name="sub" maxlength="160" value="' + e(draft.sub) + '"></label>' : '')
      + '<label>Animation<select name="animation">' + options({ slide: 'Slide', pop: 'Pop', fade: 'Fade', none: 'None' }, draft.animation) + '</select></label>'
      + '<label>Auto-hide in seconds (0 stays on)<input name="seconds" type="number" min="0" max="3600" value="' + draft.seconds + '"></label>'
      + fields(draft, 'overlay').replaceAll('data-overlay=', 'name=') + '</div>',
      (existing ? buttons('Delete','delete-overlay',dataId(id)) : '') + '<button class="button primary" type="submit">Save overlay</button>', data => {
        for (const key of ['name', 'text', 'sub', 'animation']) if (data.has(key)) draft[key] = String(data.get(key));
        for (const key of ['x', 'y', 'w', 'h', 'seconds']) draft[key] = Number(data.get(key));
        if (existing) Object.assign(existing, draft); else this.project.overlays.push(draft);
        this.closeDialog();
        this.mark();
        this.renderDock();
      });
  }

  loadGraphic(overlay) {
    for (const bus of ['preview', 'program']) this.media.load({ ...overlay, id: bus + ':' + overlay.id });
  }

  toggleOverlay(id, live) {
    const overlay = this.overlay(id);
    if (!overlay) return;
    const map = live ? this.liveOverlays : this.previewOverlays;
    const item = map.get(id);
    const now = performance.now();
    if (item && item.end === undefined) item.end = now;
    else {
      const assetId = (live ? 'program:' : 'preview:') + id;
      this.media.playGraphic(assetId);
      map.set(id, { overlay: { ...overlay, id: assetId }, start: now,
        expires: live && overlay.seconds ? now + overlay.seconds * 1000 : Infinity });
    }
    if (this.tab === 'overlays') this.renderDock();
    if (live) this.notify(overlay.name + (item && item.end === now ? ' hidden.' : ' live.'));
  }

  expireOverlays(now) {
    let changed = false;
    for (const map of [this.previewOverlays, this.liveOverlays]) for (const [id, item] of map) {
      if (now >= item.expires && item.end === undefined) { item.end = now; changed = true; }
      if (item.end !== undefined && now - item.end >= 240) {
        map.delete(id);
        this.media.stopGraphic(item.overlay.id);
      }
    }
    if (changed && this.tab === 'overlays') this.renderDock();
  }

  slide(layerId, bus, delta) {
    const scene = bus === 'program' ? this.program.scene : this.scene;
    const layer = scene.layers.find(item => item.id === layerId);
    const deck = layer && this.media.get(layer.source)?.deck;
    if (!deck) return;
    const page = Math.min(deck.count - 1, Math.max(0, layer.page + delta));
    if (layer.page === page) return;
    layer.page = page;
    if (bus !== 'program') this.mark();
    this.renderDock();
    this.renderProgramDeck();
  }

  help() {
    this.dialogOpen('Shortcuts and setup', `<div class="help-copy">
      <p>Switch scenes with configured shortcuts. The default keys are Space for Take, C for Cut,
      1–9 to cue scenes, Q/W/E/R/T/Y/U/I for live overlays, Page Up/Down for the live PowerPoint,
      and comma/period for Preview slides.</p>
      <p>Use Shortcuts at the top of the control room to assign your own keys, including modifiers.
      Press a key in its assignment box; duplicate assignments are rejected.</p>
      <h3>Share a clean feed</h3>
      <p>Open Program output, then share that window or tab in your meeting app. Enable its audio and
      share computer sound if the meeting app offers it.</p>
      <h3>PowerPoint</h3>
      <p>Import .pptx or .ppsx for slide controls and private notes. Live PowerPoint navigation appears
      under Program while that scene is on air. For animations or embedded media, capture the
      PowerPoint slideshow window instead.</p>
      <h3>Scene editing</h3>
      <p>Choose Arrange layers under Preview and drag a camera, slide, or graphic. Select its border
      handles to resize; hold Shift to snap to the 2% grid. The Larger editor offers extra controls.
      Your on-air Program remains unchanged until Take or Cut.</p>
      <h3>Camera and recording</h3><p>Use desktop Chrome or Edge and reconnect devices if permissions
      change. Use headphones when monitoring the audio mix.</p>
      ${this.output.lastRecording ? buttons('Download last recording','download-recording') : ''}
      ${window.showSaveFilePicker && !this.output.active ? buttons('Record directly to disk','record-disk') : ''}
      </div>`);
  }

  async click(event) {
    const button = event.target.closest('[data-act]');
    if (!button || !this.project || button.disabled) return;
    const { act, id, bus } = button.dataset;
    if (this.editing && !['close-dialog', 'record', 'output'].includes(act)) return;
    event.preventDefault();
    try {
      if (act.startsWith('input-')) {
        const type = act.slice(6);
        if (['camera', 'mic'].includes(type)) await this.deviceMenu(type);
        else if (['screen', 'slideshow'].includes(type)) await this.startScreen(type === 'slideshow');
        else if (type === 'title') {
          this.closeDialog();
          const { layer } = this.addSource('title', 'Text layer', {});
          this.layerId = layer.id;
          this.tab = 'layers';
          this.mark();
          this.render();
        } else {
          this.closeDialog();
          this.pickFile(type === 'files' ? 'all' : type);
        }
        return;
      }
      switch (act) {
        case 'scene': this.setPreview(id); break;
        case 'scene-tools': this.showTools(id); break;
        case 'close-tools': this.tools.close(); break;
        case 'arrange-preview': this.inlineEditor.toggle(); break;
        case 'shortcuts': this.shortcutDialog(); break;
        case 'shortcut-clear': {
          if (!this.project.shortcuts || !Object.hasOwn(this.project.shortcuts, id)) break;
          this.project.shortcuts[id] = '';
          const field = this.dialog.querySelector('[data-shortcut="' + id + '"]');
          if (field) field.value = shortcutLabel('');
          this.mark();
          this.renderDock();
          this.render();
          break;
        }
        case 'shortcuts-reset': {
          this.project.shortcuts = Object.fromEntries(SHORTCUT_ACTIONS.map(([key,,shortcut]) => [key, shortcut]));
          this.mark();
          this.shortcutDialog();
          break;
        }
        case 'new-scene': this.sceneDialog(true); break;
        case 'scene-edit': if (this.tools.open) this.tools.close(); this.sceneDialog(false); break;
        case 'scene-designer': if (this.tools.open) this.tools.close(); this.designer.show(); break;
        case 'duplicate-scene': {
          if (this.project.scenes.length >= 40) throw new Error('This project already has 40 scenes.');
          const duplicate = { ...clone(this.scene), id: uid(), name: (this.scene.name + ' copy').slice(0, 120) };
          this.project.scenes.splice(this.project.scenes.indexOf(this.scene) + 1, 0, duplicate);
          this.closeDialog();
          this.setPreview(duplicate.id);
          this.mark();
          break;
        }
        case 'scene-up': case 'scene-down': {
          const index = this.project.scenes.indexOf(this.scene);
          this.move(this.project.scenes, index, act === 'scene-up' ? -1 : 1);
          this.mark();
          this.render();
          this.sceneDialog(false);
          break;
        }
        case 'remove-scene':
          if (this.project.scenes.length < 2) break;
          this.dialogOpen('Delete scene', '<p>Delete “' + e(this.scene.name) + '” from this project?</p>',
            '<button class="button primary" type="submit">Delete scene</button>', () => {
              this.project.scenes.splice(this.project.scenes.indexOf(this.scene), 1);
              this.closeDialog();
              this.setPreview(this.project.scenes[0].id);
              this.mark();
            });
          break;
        case 'cut': this.take('cut'); break;
        case 'take': this.take(this.project.transition); break;
        case 'tab': this.tab = id; this.renderDock(); break;
        case 'add-context':
          if (this.tab === 'overlays') this.overlayNew();
          else if (this.tab === 'classroom') this.pickFile('powerpoint');
          else this.inputMenu();
          break;
        case 'select-layer': this.layerId = id; this.renderDock(); break;
        case 'toggle-layer': {
          const layer = this.scene.layers.find(item => item.id === id);
          layer.visible = !layer.visible;
          this.mark();
          this.renderDock();
          break;
        }
        case 'layer-up': case 'layer-down': {
          this.move(this.scene.layers, this.scene.layers.findIndex(layer => layer.id === id), act === 'layer-up' ? 1 : -1);
          this.mark();
          this.renderDock();
          break;
        }
        case 'remove-layer': {
          this.scene.layers = this.scene.layers.filter(layer => layer.id !== id);
          this.layerId = this.scene.layers.at(-1)?.id;
          this.mark();
          this.renderDock();
          break;
        }
        case 'reuse-input': {
          const source = this.source($('reuse-input')?.value);
          if (!source) break;
          this.layerId = this.addLayer(this.project, this.scene, source).id;
          this.closeDialog();
          this.mark();
          this.render();
          break;
        }
        case 'delete-input': {
          const source = this.source($('reuse-input')?.value);
          if (!source) break;
          this.dialogOpen('Remove input', '<p>Remove “' + e(source.name) + '” from all scenes and from the audio mixer?</p>',
            '<button class="button primary" type="submit">Remove input</button>', () => {
              this.media.dispose(source.id);
              this.project.sources = this.project.sources.filter(item => item.id !== source.id);
              for (const scene of this.project.scenes) scene.layers = scene.layers.filter(layer => layer.source !== source.id);
              this.closeDialog();
              this.mark();
              this.render();
            });
          break;
        }
        case 'connect': await this.media.connect(this.source(id)); break;
        case 'disconnect': this.media.disconnect(id); this.render(); break;
        case 'change-device': await this.deviceMenu(this.source(id).type, this.source(id)); break;
        case 'play-media': case 'restart-media': {
          const element = this.media.get(id)?.element;
          if (!element) break;
          await this.media.audio.activate();
          if (act === 'restart-media') element.currentTime = 0;
          if (element.paused || act === 'restart-media') await element.play(); else element.pause();
          break;
        }
        case 'audio-mute':
          if (id === 'master') this.project.masterMute = !this.project.masterMute;
          else { const source = this.source(id); source.mute = !source.mute; }
          await this.media.audio.activate();
          this.mark();
          this.renderMixer();
          break;
        case 'listen': {
          const next = !this.listening;
          await this.media.audio.activate();
          this.media.audio.listen(next);
          this.listening = next;
          button.innerHTML = icon('headphones',17) + (next ? ' Monitor on' : ' Monitor off');
          button.setAttribute('aria-pressed', String(next));
          break;
        }
        case 'projects': this.projectDialog(); break;
        case 'save': await this.save(); this.notify('Project saved on this device.'); break;
        case 'new-project': {
          this.dialogOpen('New classroom project', '<div class="form-grid"><label>Project name<input name="name" maxlength="90" required placeholder="Leadership Classroom"></label></div>',
            '<button class="button primary" type="submit">Create project</button>', async data =>
              this.loadProject(makeProject(textName(String(data.get('name')), 'Leadership Classroom'))));
          break;
        }
        case 'rename-project':
          this.dialogOpen('Rename project', '<div class="form-grid"><label>Project name<input name="name" maxlength="90" required value="' + e(this.project.name) + '"></label></div>',
            '<button class="button primary" type="submit">Rename project</button>', data => {
              this.project.name = textName(String(data.get('name')), this.project.name);
              this.closeDialog();
              this.mark();
              this.render();
            });
          break;
        case 'copy-project': {
          if (this.output.active) throw new Error('Stop recording before switching projects.');
          this.editing = true;
          try {
            await this.save();
            const copy = await storage.copyProject(this.project);
            this.load(copy);
            this.closeDialog();
            this.notify('Opened a copy with its media.');
          } finally { this.editing = false; }
          break;
        }
        case 'export-project': {
          this.closeDialog();
          this.editing = true;
          this.notify('Preparing project backup…');
          try {
            await this.save();
            const blob = await storage.exportProject(this.project);
            download(blob, 'Mayne-Studio-' + this.project.name.replace(/[^a-z0-9 -]/gi, '') + '.zip');
            this.notify('Project backup downloaded.');
          } finally { this.editing = false; }
          break;
        }
        case 'import-project':
          if (this.output.active) throw new Error('Stop recording before switching projects.');
          this.closeDialog();
          $('project-picker').value = '';
          $('project-picker').click();
          break;
        case 'load-project': {
          const project = await storage.loadProject(id);
          if (!project) throw new Error('This project is no longer available.');
          await this.loadProject(normalizeProject(project));
          break;
        }
        case 'delete-project': {
          const project = await storage.loadProject(id);
          if (!project || project.id === this.project.id) break;
          this.dialogOpen('Delete project', '<p>Delete “' + e(project.name) + '” and its local media?</p>',
            '<button class="button primary" type="submit">Delete project</button>', async () => {
              await storage.removeProject(id);
              this.projectDialog();
            });
          break;
        }
        case 'close-dialog': this.closeDialog(); break;
        case 'overlay-type':
          if (id === 'graphic') { this.closeDialog(); this.pickFile('graphic'); }
          else this.overlayEdit(null, id);
          break;
        case 'overlay-edit': this.overlayEdit(id); break;
        case 'delete-overlay':
          this.previewOverlays.delete(id);
          this.liveOverlays.delete(id);
          this.media.dispose('preview:' + id);
          this.media.dispose('program:' + id);
          this.project.overlays = this.project.overlays.filter(o => o.id !== id);
          this.closeDialog();
          this.mark();
          this.renderDock();
          break;
        case 'overlay-preview': case 'overlay-live': this.toggleOverlay(id, act === 'overlay-live'); break;
        case 'slide-prev': case 'slide-next': this.slide(id, bus, act === 'slide-next' ? 1 : -1); break;
        case 'timer-toggle':
          if (this.timer.deadline) this.timer.deadline = 0;
          else {
            this.timer.remaining ||= this.project.timerSeconds;
            this.timer.deadline = performance.now() + this.timer.remaining * 1000;
            this.timer.visible = true;
          }
          this.renderDock();
          break;
        case 'timer-reset':
          this.timer = { ...this.timer, remaining: this.project.timerSeconds, deadline: 0 };
          this.renderDock();
          break;
        case 'timer-show': this.timer.visible = !this.timer.visible; this.renderDock(); break;
        case 'output': this.output.open(); break;
        case 'record': await this.output.record(this.project.name); break;
        case 'record-disk': this.closeDialog(); await this.output.record(this.project.name, true); break;
        case 'download-recording': {
          const recording = this.output.lastRecording;
          if (recording) download(recording.blob, recording.name);
          break;
        }
        case 'help': this.help(); break;
      }
    } catch (error) { this.notify(error.message || 'The operation failed.', true); }
  }

  move(items, index, step) {
    const target = index + step;
    if (index < 0 || target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
  }

  input(event) {
    if (this.editing || !this.project) return;
    const { target } = event;
    const id = target.dataset.gain;
    if (id) {
      const gain = Number(target.value);
      if (id === 'master') this.project.master = gain; else this.source(id).gain = gain;
      target.parentElement.querySelector('output').textContent = formatGain(gain);
      this.mark();
    } else if (target.dataset.layer === 'opacity' && this.layer) {
      this.layer.opacity = Number(target.value);
      this.mark();
    }
  }

  async change({ target }) {
    if (this.editing || !this.project) return;
    try {
      if (target.id === 'media-picker') { await this.addFiles(target.files); return; }
      if (target.id === 'project-picker') {
        const file = target.files[0];
        if (file) {
          this.editing = true;
          try {
            this.notify('Opening project backup…');
            const project = await storage.importProject(file);
            await this.loadProject(project);
            this.notify('Project and media restored.');
          } finally { this.editing = false; }
        }
        return;
      }
      const { project, layer, source } = target.dataset;
      if (project === 'transition') {
        this.project.transition = target.value;
        $('transition-ms').disabled = target.value === 'cut';
      } else if (project === 'duration') this.project.duration = Number(target.value);
      else if (project === 'timerSeconds') {
        this.project.timerSeconds = Math.round(clamp(Number(target.value), 1, 5400));
        target.value = this.project.timerSeconds;
        if (!this.timer.deadline) this.timer.remaining = this.project.timerSeconds;
      } else if (layer && this.layer) {
        if (layer === 'preset') {
          const preset = target.value === 'board' ? { x: 7, y: 4, w: 48, h: 43 } : PLACE[target.value];
          if (preset) Object.assign(this.layer, preset);
          this.renderDock();
        } else if (['x', 'y', 'w', 'h'].includes(layer)) {
          this.layer[layer] = clamp(Number(target.value), Number(target.min), Number(target.max), this.layer[layer]);
          target.value = this.layer[layer];
        } else if (layer !== 'opacity') {
          this.layer[layer] = target.type === 'checkbox' ? target.checked : target.value;
          if (layer === 'matte') this.renderDock();
        }
      } else if (source && this.layer) {
        const entry = this.source(this.layer.source);
        entry[source] = target.type === 'checkbox' ? target.checked
          : source === 'name' ? textName(target.value, SOURCES[entry.type]) : target.value;
        if (['name','route'].includes(source)) this.renderMixer();
        if (source === 'name') this.renderDock();
      } else return;
      this.mark();
    } catch (error) { this.notify(error.message, true); }
  }

  hotkey(event) {
    if (this.tools?.open && event.target.getAttribute?.('role') === 'tab' && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      const tabs = [...$('dock-tabs').querySelectorAll('[role="tab"]')];
      const index = tabs.indexOf(event.target);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
      this.tab = tabs[next].dataset.id;
      this.renderDock();
      tabs[next].focus();
      event.preventDefault();
      return;
    }
    if (!this.project || this.editing || this.dialog.open || this.tools.open || this.designer.open ||
      event.defaultPrevented || event.repeat || event.target.closest?.('input,textarea,select,[contenteditable]')) return;
    const chord = keyboardShortcut(event);
    const action = shortcutAction(this.project.shortcuts, chord);
    if (!action) return;
    if (chord.endsWith('Space') && event.target.closest?.('button,a')) return;
    if (action === 'take') this.take(this.project.transition);
    else if (action === 'cut') this.take('cut');
    else if (action === 'scenePrevious') this.cueAdjacent(-1);
    else if (action === 'sceneNext') this.cueAdjacent(1);
    else if (action === 'programPrevious') this.advanceDeck('program', -1);
    else if (action === 'programNext') this.advanceDeck('program', 1);
    else if (action === 'previewPrevious') this.advanceDeck('preview', -1);
    else if (action === 'previewNext') this.advanceDeck('preview', 1);
    else if (/^overlay[0-7]$/.test(action))
      this.toggleOverlay(this.project.overlays[Number(action.slice(7))]?.id, true);
    else if (/^scene[0-8]$/.test(action))
      this.setPreview(this.project.scenes[Number(action.slice(5))]?.id);
    else return;
    event.preventDefault();
  }
}

if (new URLSearchParams(location.search).get('output') === '1') outputPage();
else new Studio($('studio')).start();
