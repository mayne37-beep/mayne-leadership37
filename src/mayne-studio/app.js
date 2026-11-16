import { AUDIO, BACKGROUNDS, PLACE, SCENE_LIMIT, DEFAULT_SCENE_GROUP, sceneGroup,
  OVERLAY_LIMIT, SOURCES, TEMPLATES, OVERLAYS, OVERLAY_CHOICES, audioWeights,
  clamp, clock, clone, makeLayer, makeOverlay, makeProject, makeScene, makeSource, normalizeProject,
  assignDeviceToScene, isDefaultSharedCameraInset, canEmbedScene, visibleSceneLayers,
  linkSceneDecks, syncLinkedDecks, transitionProgress, uid } from './model.js';
import * as storage from './projects.js';
import { StudioMedia, fileKind } from './media.js';
import { StudioRenderer, drawImage } from './render.js';
import { ProgramOutput, download, outputPage } from './output.js';
import { buttons, classroomPanel, formatGain, layersPanel, mixerPanel, options, overlaysPanel } from './panels.js';
import { e, fields, icon, iconButton, option, shell } from './ui.js';
import { SceneDesigner } from './scene-designer.js';
import { InlinePreviewEditor } from './inline-preview.js';
import { OverlayEditor } from './overlay-editor.js';
import { SHORTCUT_ACTIONS, EXTRA_SHORTCUT_LIMIT, keyboardShortcut, shortcutAction, shortcutLabel } from './shortcuts.js';
import { TRANSITIONS, DEFAULT_FAVORITE_TRANSITIONS, normalizeFavoriteTransitions } from './transitions.js';
import { TIMER_STYLES, MAX_TIMER_SECONDS, newTimer, timerText, parseTimerFields, tickTimer, pauseTimer, startTimer, resetTimer, adjustTimer } from './timer.js';

const $ = id => document.getElementById(id);
const fileAccept = {
  all: '.pptx,.ppsx,.jpg,.jpeg,.png,.webp,.gif,.avif,.webm,.mp4,.ogv,.mov,.m4v,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac,.weba,image/*,video/*,audio/*',
  powerpoint: '.pptx,.ppsx', graphic: '.png,.jpg,.jpeg,.webp,.gif,.avif,.webm,.mp4',
  backdrop: '.png,.jpg,.jpeg,.webp,.gif,.avif',
  'overlay-image': '.png,.jpg,.jpeg,.webp,.gif,.avif',
  'overlay-video': '.mp4,.webm,.ogv,.mov,.m4v',
  'overlay-media': '.png,.jpg,.jpeg,.webp,.gif,.avif,.mp4,.webm,.ogv,.mov,.m4v',
};
const blankSceneId = 'mayne-empty-workspace';
const timers = newTimer;
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
      (message, error) => this.notify(message, error), () => this.recordStatus(),
      chord => this.runShortcut(chord));
    this.workspaceTab = 'scenes';
    this.overlaySearch = '';
    this.overlayGroup = 'all';
    this.sceneSearch = '';
    this.sceneGroupFilter = 'all';
    this.lastThumbScroll = 0;
    this.lastChromaPreview = 0;
    try { this.mixerCollapsed = localStorage.getItem('mayne-studio-mixer-collapsed') === '1'; }
    catch { this.mixerCollapsed = false; }
    this.timer = timers();
    this.saved = Promise.resolve();
    this.editing = false;
    this.lastFrame = 0;
    this.lastThumb = 0;
    this.lastStatus = 0;
    this.started = performance.now();
    this.dialog = $('dialog');
    this.designer = new SceneDesigner(this);
    this.overlayEditor = new OverlayEditor(this);
    this.inlineEditor = new InlinePreviewEditor(this);
    this.tools = $('studio-tools');
    this.dialog.addEventListener('keydown', event => {
      const input = event.target.closest?.('[data-shortcut],[data-extra-shortcut]');
      if (!input || event.key === 'Tab' || event.key === 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      const id = input.dataset.shortcut;
      const extraId = input.dataset.extraShortcut;
      const binding = ['Backspace','Delete'].includes(event.key) ? '' : keyboardShortcut(event);
      if (!binding && !['Backspace','Delete'].includes(event.key)) return;
      if (binding && (Object.entries(this.project.shortcuts).some(([key, value]) => key !== id && value === binding) ||
        (this.project.extraShortcuts || []).some(row=>row.id !== extraId && row.key === binding))) {
        this.notify(shortcutLabel(binding) + ' is already assigned. Clear that shortcut first.', true);
        return;
      }
      if (extraId) {
        const row=this.project.extraShortcuts?.find(item=>item.id===extraId);
        if(!row)return;
        row.key=binding;
      } else this.project.shortcuts[id] = binding;
      input.value = shortcutLabel(binding);
      this.mark();
      this.renderDock();
      this.render();
    });
    this.root.addEventListener('click', event => this.click(event));
    // Keyboard users can sample the center of the camera's raw preview.
    this.root.addEventListener('keydown', event => {
      if (!event.target.matches?.('[data-chroma-sample]') ||
        !['Enter',' '].includes(event.key)) return;
      event.preventDefault();
      this.sampleChromaKey(event.target);
    });
    // Only the grip is draggable: clicking a thumbnail still cues Preview.
    // A drag moves scene IDs in the project array; it never takes a scene live.
    this.sceneDragId = null;
    const sceneStrip = $('scenes');
    sceneStrip.addEventListener('scroll', () => {
      const now=performance.now();
      if(now-this.lastThumbScroll>90){this.lastThumbScroll=now;this.thumbnails(now);}
    },{passive:true});
    sceneStrip.addEventListener('dragstart', event => this.sceneDragStart(event));
    sceneStrip.addEventListener('dragover', event => this.sceneDragOver(event));
    sceneStrip.addEventListener('drop', event => this.sceneDrop(event));
    sceneStrip.addEventListener('dragend', () => this.sceneDragEnd());
    sceneStrip.addEventListener('dragleave', event => {
      if (!sceneStrip.contains(event.relatedTarget)) this.clearSceneDropTarget();
    });
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
    if (this.overlayEditor.open) this.overlayEditor.dialog.close();
    this.project = project;
    syncLinkedDecks(this.project);
    // Also handle projects constructed by integrations and older in-memory studio sessions.
    this.project.favoriteTransitions = normalizeFavoriteTransitions(project.favoriteTransitions);
    this.media.setProject(project);
    for (const overlay of project.overlays) if (overlay.asset) this.loadGraphic(overlay);
    // Empty preview is an unsaved monitor placeholder, not a template studio.
    this.emptyScene = { ...makeScene('blank', 'No scene'), id: blankSceneId };
    const first = project.scenes.find(scene => scene.template === 'standby') || project.scenes[0];
    this.program = this.shot(first || this.emptyScene);
    this.previewId = project.scenes.find(scene => scene.template === 'presenter')?.id
      || project.scenes[0]?.id || null;
    this.layerId = this.scene.layers.at(-1)?.id;
    this.transition = null;
    this.previewOverlays.clear();
    this.liveOverlays.clear();
    this.timer = timers(project.timerSeconds);
    this.started = performance.now();
    storage.lastProject(project.id);
    this.setSaveStatus('Saved on this device');
    this.render();
  }

  get scene() { return this.project.scenes.find(scene => scene.id === this.previewId) || this.project.scenes[0] || this.emptyScene; }
  get layer() { return this.scene.layers.find(layer => layer.id === this.layerId); }
  source(id) { return this.project.sources.find(source => source.id === id); }
  overlay(id) { return this.project.overlays.find(item => item.id === id); }
  shot(scene, snapshot = true) {
    const sources = new Map(this.project.sources.map(source => [source.id, snapshot ? clone(source) : source]));
    const scenes = new Map(this.project.scenes.map(item => [item.id, snapshot ? clone(item) : item]));
    return { scene: scenes.get(scene.id) ?? (snapshot ? clone(scene) : scene), sources, scenes };
  }

  audibleShot(shot) {
    return shot && { layers: visibleSceneLayers(shot).map(({layer}) => layer) };
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

  /** Reorder the saved scene list without changing any camera assignments,
   * layer geometry, selected Preview scene, or currently broadcasting Program. */
  reorderScene(sourceId, destinationId, after = false) {
    if (!this.project || this.editing) return false;
    const scenes = this.project.scenes;
    const from = scenes.findIndex(scene => scene.id === sourceId);
    const target = destinationId === null ? scenes.length
      : scenes.findIndex(scene => scene.id === destinationId);
    if (from < 0 || target < 0 || sourceId === destinationId) return false;
    let to = target + (destinationId !== null && after ? 1 : 0);
    if (from < to) to--;
    if (to === from) return false;
    const [scene] = scenes.splice(from, 1);
    scenes.splice(to, 0, scene);
    this.mark();
    this.render();
    return true;
  }

  clearSceneDropTarget() {
    for (const tile of $('scenes').querySelectorAll('.scene-drop-before,.scene-drop-after'))
      tile.classList.remove('scene-drop-before', 'scene-drop-after');
  }

  sceneDragStart(event) {
    const grip = event.target.closest?.('[data-scene-drag]');
    const id = grip?.dataset.sceneDrag;
    if (this.editing || this.sceneFiltersActive() || !id || !this.project.scenes.some(scene => scene.id === id)) {
      event.preventDefault();
      return;
    }
    this.sceneDragId = id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', 'mayne-scene:' + id);
    grip.closest('.scene-tile')?.classList.add('scene-dragging');
  }

  sceneDragOver(event) {
    if (!this.sceneDragId || this.sceneFiltersActive()) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const strip = $('scenes');
    const bounds = strip.getBoundingClientRect();
    if (event.clientX < bounds.left + 28) strip.scrollLeft -= 13;
    else if (event.clientX > bounds.right - 28) strip.scrollLeft += 13;
    this.clearSceneDropTarget();
    const tile = event.target.closest?.('.scene-tile');
    if (!tile || tile.dataset.sceneId === this.sceneDragId) return;
    tile.classList.add(event.clientX > tile.getBoundingClientRect().left
      + tile.getBoundingClientRect().width / 2 ? 'scene-drop-after' : 'scene-drop-before');
  }

  sceneDrop(event) {
    if (!this.sceneDragId || this.sceneFiltersActive()) return;
    event.preventDefault();
    const sourceId = this.sceneDragId;
    const tile = event.target.closest?.('.scene-tile');
    const destinationId = tile?.dataset.sceneId || null;
    const after = tile ? event.clientX >
      tile.getBoundingClientRect().left + tile.getBoundingClientRect().width / 2 : true;
    this.sceneDragEnd();
    const changed = this.reorderScene(sourceId, destinationId, after);
    if (changed) this.notify('Scene order updated and saved with your project.');
  }

  sceneDragEnd() {
    this.sceneDragId = null;
    this.clearSceneDropTarget();
    for (const tile of $('scenes').querySelectorAll('.scene-dragging'))
      tile.classList.remove('scene-dragging');
  }

  setPreview(id) {
    if (!this.project.scenes.some(scene => scene.id === id)) return;
    // Newly embedded decks and late PowerPoint imports reuse the same
    // project-wide page before this studio's private Preview is drawn.
    syncLinkedDecks(this.project,[this.program,this.transition?.previous]);
    this.previewId = id;
    this.layerId = this.scene.layers.at(-1)?.id;
    this.render();
  }

  take(type) {
    if (!this.project.scenes.length || this.transition || this.editing) return;
    // Cue a fresh studio snapshot at the canonical PowerPoint page. Switching
    // camera views must never reset or branch the shared slideshow.
    syncLinkedDecks(this.project,[this.program,this.transition?.previous]);
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
    const empty = this.project.scenes.length === 0;
    $('preview-name').textContent = empty ? 'No scene created' : this.scene.name;
    $('preview-canvas').setAttribute('aria-label', empty ? 'Preview: no scenes yet' : 'Preview: ' + this.scene.name);
    $('program-name').textContent = empty ? 'No scene on air' : this.program?.scene.name ?? '';
    $('program-canvas').setAttribute('aria-label', empty ? 'Program: no scenes yet' : 'Program: ' + this.program?.scene.name);
    $('transition').value = this.project.transition;
    const ms = $('transition-ms');
    if (![...ms.options].some(item => Number(item.value) === this.project.duration)) ms.add(new Option(this.project.duration + ' ms', this.project.duration));
    ms.value = this.project.duration;
    ms.disabled = this.project.transition === 'cut';
    $('take').disabled = empty || !!this.transition;
    this.root.querySelector('[data-act="cut"]').disabled = empty || !!this.transition;
    this.root.querySelector('[data-act="cut"] kbd').textContent = shortcutLabel(this.project.shortcuts.cut);
    $('take').querySelector('kbd').textContent = shortcutLabel(this.project.shortcuts.take);
    this.renderFavorites();
    $('scenes').innerHTML = this.project.scenes.map((scene, index) => {
      const preview = scene.id === this.previewId, program = scene.id === this.program.scene.id;
      return `<div class="scene-tile" data-scene-id="${scene.id}" data-scene-name="${e(scene.name.toLowerCase())}" data-scene-group="${e(sceneGroup(scene.group))}"><div class="scene-reorder-bar">
        <span class="scene-drag-handle" data-scene-drag="${scene.id}" draggable="true"
          title="Drag to reorder ${e(scene.name)}" aria-label="Drag to reorder ${e(scene.name)}">
          ${icon('grip',14)}<span>Move</span></span>
        <span class="scene-order-index" aria-label="Position ${index + 1} of ${this.project.scenes.length}">${index + 1} / ${this.project.scenes.length}</span>
        <button type="button" class="scene-order-step" data-act="scene-reorder-left" data-id="${scene.id}"
          title="Move ${e(scene.name)} earlier" aria-label="Move ${e(scene.name)} left" ${index === 0 ? 'disabled' : ''}>${icon('left',13)}</button>
        <button type="button" class="scene-order-step" data-act="scene-reorder-right" data-id="${scene.id}"
          title="Move ${e(scene.name)} later" aria-label="Move ${e(scene.name)} right"
          ${index === this.project.scenes.length - 1 ? 'disabled' : ''}>${icon('right',13)}</button>
        </div><button class="scene ${program ? 'on-program' : ''}" type="button" data-act="scene" data-id="${scene.id}" aria-pressed="${preview}"
        title="${e(scene.name)}"><canvas width="128" height="72" aria-hidden="true" data-thumb="${scene.id}"></canvas>
        <strong>${e(scene.name)}</strong><span class="scene-meta"><span>${program ? 'Program' : preview ? 'Preview' : 'Ready'}</span>
        ${index < 9 && this.project.shortcuts['scene' + index] ? '<kbd>' + e(shortcutLabel(this.project.shortcuts['scene' + index])) + '</kbd>' : ''}</span></button>
        <div class="scene-card-actions"><button class="scene-gear" type="button" data-act="scene-tools" data-id="${scene.id}" aria-label="Settings for ${e(scene.name)}">${icon('gear',13)} Settings</button>
        <button class="scene-delete" type="button" data-act="scene-delete" data-id="${scene.id}" aria-label="Delete scene ${e(scene.name)}"
        title="${this.project.scenes.length <= 1 ? 'Keep at least one scene' : program ? 'Switch Program to another scene before deleting' : 'Delete this scene'}"
        ${this.project.scenes.length <= 1 ? 'disabled' : ''}>${icon('trash',14)}</button></div></div>`;
    }).join('') || '<div class="studio-empty-scenes"><strong>Start with your own scene</strong>'
      + '<p>No studios or camera inputs have been added. Create a blank scene, then '
      + 'add only the cameras, microphones and other inputs you want in that scene.</p>'
      + '<button class="button primary" type="button" data-act="new-scene">Create first scene</button></div>';
    this.updateSceneLibrary();
    this.thumbnails(performance.now());
    this.renderDock();
    this.renderMixer();
    this.renderMixerState();
    this.recordStatus();
    this.renderProgramDeck();
    this.inlineEditor.refresh();
    if (this.designer.open) this.designer.refresh();
  }


  sceneFiltersActive() {
    return !!this.sceneSearch.trim() || this.sceneGroupFilter!=='all';
  }

  /** Filter existing thumbnails without modifying Program, Preview or scene order. */
  updateSceneLibrary() {
    const search=$('scene-library-search');
    const groups=$('scene-library-group');
    if(!search || !groups || !this.project)return;
    search.value=this.sceneSearch;
    const names=[...new Set(this.project.scenes.map(scene=>sceneGroup(scene.group)))]
      .sort((a,b)=>a.localeCompare(b));
    if(this.sceneGroupFilter!=='all' && !names.includes(this.sceneGroupFilter))
      this.sceneGroupFilter='all';
    groups.innerHTML='<option value="all">All groups</option>'+
      names.map(name=>option(name,name,this.sceneGroupFilter)).join('');
    this.filterSceneLibrary();
  }

  filterSceneLibrary() {
    const list=$('scenes');
    if(!list || !this.project)return;
    const query=this.sceneSearch.trim().toLowerCase();
    const filtered=this.sceneFiltersActive();
    let shown=0;
    const tiles=list.querySelectorAll('.scene-tile');
    for(const [index,tile] of [...tiles].entries()) {
      const visible=(this.sceneGroupFilter==='all' || tile.dataset.sceneGroup===this.sceneGroupFilter) &&
        (!query || tile.dataset.sceneName.includes(query));
      tile.hidden=!visible;
      if(visible)shown++;
      const grip=tile.querySelector('[data-scene-drag]');
      if(grip)grip.draggable=!filtered;
      const left=tile.querySelector('[data-act="scene-reorder-left"]');
      const right=tile.querySelector('[data-act="scene-reorder-right"]');
      if(left)left.disabled=filtered||index===0;
      if(right)right.disabled=filtered||index===tiles.length-1;
    }
    const counter=$('scene-library-count');
    if(counter)counter.textContent=shown+' of '+tiles.length+' shown · '+
      this.project.scenes.length+' / '+SCENE_LIMIT+' saved';
    const hint=$('scene-library-hint');
    if(hint)hint.hidden=!filtered||!tiles.length;
    const empty=$('scene-library-empty');
    if(empty)empty.hidden=!!shown||!tiles.length;
  }

  renderFavorites() {
    const list = $('favorite-transition-list');
    if (!list) return;
    list.innerHTML = this.project.favoriteTransitions.map((type, index) => {
      const name = TRANSITIONS[type] || type;
      const label = e(name);
      return '<button type="button" class="favorite-transition" data-act="favorite-take" data-id="' + index
        + '" aria-label="Favorite ' + (index + 1) + ': Take with ' + label
        + '" title="Take Preview live using ' + label + '"'
        + (!this.project.scenes.length || this.transition || this.editing ? ' disabled' : '') + '>'
        + '<span class="favorite-number">' + (index + 1) + '</span>'
        + '<span class="favorite-name">' + label + '</span></button>';
    }).join('');
  }

  favoriteDialog() {
    const rows = this.project.favoriteTransitions.map((type, index) =>
      '<label>Favorite ' + (index + 1) + '<select name="favorite' + index
      + '" required>' + options(TRANSITIONS, type) + '</select></label>').join('');
    this.dialogOpen('Configure favorite transitions',
      '<p>Choose five different transitions for your center bar. Clicking a favorite will immediately '
      + 'take the Preview scene to Program using that effect and the current transition duration. '
      + 'Your choices are saved with this project.</p><div class="form-grid favorite-config-fields">'
      + rows + '</div>',
      buttons('Restore defaults', 'favorite-reset')
        + '<button class="button primary" type="submit">Save favorites</button>', data => {
        const selected = DEFAULT_FAVORITE_TRANSITIONS.map((_, index) => String(data.get('favorite' + index) || ''));
        if (selected.some(type => !Object.hasOwn(TRANSITIONS, type)))
          throw new Error('Please select a valid transition for every favorite.');
        if (new Set(selected).size !== 5)
          throw new Error('Each of the five favorites must use a different transition.');
        this.project.favoriteTransitions = selected;
        this.closeDialog();
        this.mark();
        this.renderFavorites();
      });
  }

  renderDock() {
    if (!this.project || !this.program) return;
    $('tools-scene-name').textContent = this.project.scenes.length
      ? this.scene.name + ' · layers & inputs' : 'No scene selected';
    $('dock-panel').innerHTML = this.project.scenes.length
      ? layersPanel(this.scene, this.project, this, this.media)
      : '<div class="empty-panel"><p>Create a scene first to add or position inputs.</p></div>';
    this.renderWorkspacePanel();
  }

  renderWorkspacePanel() {
    if (!this.project || !this.program) return;
    const current = this.workspaceTab;
    const labels = { scenes: 'Add scene', overlays: 'Add overlay', classroom: 'Import PowerPoint' };
    for (const tab of this.root.querySelectorAll('.production-tabs [role="tab"]')) {
      const selected = tab.dataset.id === current;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    $('scene-panel').hidden = current !== 'scenes';
    $('manage-cameras').hidden = current !== 'scenes' || !this.project.scenes.length;
    const canEditScene = !!this.project.scenes.length;
    this.root.querySelectorAll('[data-act="scene-tools"],[data-act="arrange-preview"],[data-act="scene-designer"]').forEach(button => {
      button.disabled = !canEditScene;
    });
    $('overlays-panel').hidden = current !== 'overlays';
    $('classroom-panel').hidden = current !== 'classroom';
    const add = $('workspace-add');
    add.setAttribute('aria-label', labels[current]);
    add.title = labels[current];
    if (current === 'overlays') {
      $('overlays-panel').innerHTML = overlaysPanel(this.project, this.previewOverlays, this.liveOverlays,
        {search:this.overlaySearch,group:this.overlayGroup});
      this.filterOverlayLibrary();
    } else if (current === 'classroom') {
      $('classroom-panel').innerHTML = classroomPanel(this.project, this.timer,
        { preview: this.shot(this.scene, false), program: this.program }, this.media);
    }
  }

  filterOverlayLibrary() {
    const panel=$('overlays-panel');
    if (!panel || panel.hidden) return;
    const query=this.overlaySearch.trim().toLowerCase();
    let count=0;
    const cards=panel.querySelectorAll('[data-overlay-group]');
    for(const card of cards){
      const visible=(this.overlayGroup==='all'||card.dataset.overlayGroup===this.overlayGroup) &&
        (!query||card.dataset.overlayTerms.includes(query));
      card.hidden=!visible;
      if(visible)count++;
    }
    const status=panel.querySelector('#overlay-library-count');
    if(status)status.textContent=count+' of '+cards.length+' shown · '+this.project.overlays.length+
      ' / '+OVERLAY_LIMIT+' saved';
    const empty=panel.querySelector('#overlay-library-empty');
    if(empty)empty.hidden=count>0||!cards.length;
  }

  setWorkspaceTab(id) {
    if (!['scenes', 'overlays', 'classroom'].includes(id)) return;
    this.workspaceTab = id;
    this.renderWorkspacePanel();
  }

  renderMixerState() {
    const collapsed = this.mixerCollapsed;
    const workspace = $('switcher');
    workspace.classList.toggle('mixer-collapsed', collapsed);
    $('mixer-pane').classList.toggle('collapsed', collapsed);
    const toggle = $('mixer-toggle');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    const label = collapsed ? 'Expand audio mixer' : 'Collapse audio mixer';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    toggle.innerHTML = icon(collapsed ? 'left' : 'right', 17);
    $('mixer-body').hidden = collapsed;
  }

  toggleMixer() {
    this.mixerCollapsed = !this.mixerCollapsed;
    try { localStorage.setItem('mayne-studio-mixer-collapsed', this.mixerCollapsed ? '1' : '0'); }
    catch { /* Keep the current session layout even if browser preferences are unavailable. */ }
    this.renderMixerState();
  }

  showTools(id) {
    if (!this.project.scenes.length) { this.sceneDialog(true); return; }
    if (id && this.project.scenes.some(scene => scene.id === id) && id !== this.previewId) this.setPreview(id);
    this.renderDock();
    if (!this.tools.open) this.tools.showModal();
  }

  renderProgramDeck() {
    const container = $('live-deck-controls');
    if (!this.program || !container) return;
    const layers = visibleSceneLayers(this.program).filter(({source}) => source.type === 'powerpoint')
      .map(({layer}) => layer);
    container.hidden = !layers.length;
    if (!layers.length) { container.innerHTML = ''; return; }
    container.innerHTML = layers.map(layer => {
      const source = this.program.sources.get(layer.source);
      const deck = this.media.get(layer.source)?.deck;
      const count = deck?.count ?? 0;
      const page = Math.min(Math.max(layer.page, 0), Math.max(count - 1, 0));
      const data = 'data-id="' + layer.id + '" data-bus="program"';
      return '<div class="live-deck-row"><strong title="' + e(source?.name) + '">' + icon('powerpoint',14) + ' ' + e(source?.name || 'PowerPoint') + '</strong>'
        + (source?.sync ? '<span class="live-deck-shared">Shared across studio views</span>' : '')
        + '<div class="slide-nav"><button type="button" class="button" data-act="slide-prev" ' + data + (page <= 0 ? ' disabled' : '') + '>'
        + icon('left',14) + ' Previous</button><span class="mono">' + (count ? 'Slide ' + (page + 1) + ' / ' + count : 'Loading slides…') + '</span>'
        + '<button type="button" class="button" data-act="slide-next" ' + data + (!count || page >= count - 1 ? ' disabled' : '') + '>Next ' + icon('right',14) + '</button></div></div>';
    }).join('');
  }

  activeDeck(bus) {
    const shot = bus === 'program' ? this.program : this.shot(this.scene, false);
    return visibleSceneLayers(shot).find(({source}) =>
      source.type === 'powerpoint' && this.media.get(source.id)?.deck)?.layer;
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
    const fields=SHORTCUT_ACTIONS.map(([id,label]) =>
      '<div class="shortcut-row"><label for="shortcut-'+id+'">'+e(label)+'</label>'+
      '<input type="text" id="shortcut-'+id+'" data-shortcut="'+id+'" value="'+
      e(shortcutLabel(this.project.shortcuts[id]))+'" aria-label="Set '+e(label)+'" readonly>'+
      '<button class="button" type="button" data-act="shortcut-clear" data-id="'+id+'">Clear</button></div>').join('');
    const actions=[...SHORTCUT_ACTIONS.filter(([id])=>
        !/^overlay[0-7]$/.test(id) && !/^scene[0-8]$/.test(id)).map(([id,label])=>[id,label]),
      ...this.project.overlays.map((overlay,index)=>['overlay:'+overlay.id,
        'Overlay '+(index+1)+': '+overlay.name]),
      ...this.project.scenes.map((scene,index)=>['scene:'+scene.id,
        'Scene '+(index+1)+': '+scene.name])];
    const custom=(this.project.extraShortcuts||[]).map((entry,index)=>{
      const selection='<option value="">Choose command…</option>'+
        actions.map(([id,label])=>option(id,label,entry.action)).join('');
      return '<div class="shortcut-row shortcut-extra-row">'+
        '<select id="extra-action-'+e(entry.id)+'" data-extra-action="'+e(entry.id)+
          '" aria-label="Action for additional shortcut '+(index+1)+'">'+selection+'</select>'+
        '<input type="text" data-extra-shortcut="'+e(entry.id)+'" value="'+
          e(shortcutLabel(entry.key))+'" aria-label="Key for additional shortcut '+(index+1)+'" readonly>'+
        '<button class="button" type="button" data-act="shortcut-extra-remove" data-id="'+
          e(entry.id)+'">Remove</button></div>';
    }).join('');
    this.dialogOpen('Keyboard shortcuts',
      '<p>Click an assignment box and press a key combination. Backspace clears it. '+
      'Choose <strong>Add shortcut</strong> to create another command, including shortcuts '+
      'for overlays beyond the first eight. A key can trigger only one command. '+
      'Some combinations are reserved by your browser.</p>'+
      '<div class="shortcut-extra-heading"><strong>Additional shortcuts ('+
      (this.project.extraShortcuts?.length||0)+' / '+EXTRA_SHORTCUT_LIMIT+')</strong>'+
      '<button type="button" class="button primary-outline" data-act="shortcut-extra-add">+ Add shortcut</button></div>'+
      '<p class="shortcut-extra-help">Pick an action, then click its key field and press the shortcut you want. '+
      'Overlay choices refer to their saved names and stay linked if the library order changes.</p>'+
      '<div class="shortcut-list shortcut-extra-list">'+(custom||
        '<p class="slide-label">No additional shortcuts yet.</p>')+'</div>'+
      '<div class="shortcut-extra-heading"><strong>Standard shortcuts</strong></div>'+
      '<div class="shortcut-list">'+fields+'</div>',
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
      for (const button of this.root.querySelectorAll('[data-act="favorite-take"]')) button.disabled = false;
    }
    this.expireOverlays(now);
    if (this.timer.deadline && tickTimer(this.timer,now,this.project.timerEnd)) {
      if (this.project.timerChime) this.playTimerChime();
      if (this.workspaceTab === 'classroom') this.renderWorkspacePanel();
    }
    const incomingAudio = this.audibleShot(this.program);
    const outgoingAudio = this.audibleShot(outgoing);
    this.media.playSources(this.project, incomingAudio, outgoingAudio);
    this.media.audio.update(this.project, this.media.entries, audioWeights(incomingAudio, outgoingAudio, progress.eased));
    this.renderer.draw({ preview: this.shot(this.scene, false), program: this.program,
      transition: this.transition, previewOverlays: this.previewOverlays, liveOverlays: this.liveOverlays,
      timer: { ...this.timer, config: this.project } }, now);
    this.designer.draw(now);
    this.overlayEditor.draw(now);
    if (now - this.lastThumb > 1050 && !document.hidden) { this.lastThumb = now; this.thumbnails(now); }
    if (now - this.lastStatus > 110) { this.lastStatus = now; this.updateStatus(now); }
    this.media.trimEffects(now);
  }

  thumbnails(now) {
    const shot = this.shot(this.scene, false);
    const strip=$('scenes');
    const bounds=strip.getBoundingClientRect();
    const sceneMap=new Map(this.project.scenes.map(scene=>[scene.id,scene]));
    for (const node of strip.querySelectorAll('canvas')) {
      const tile=node.closest('.scene-tile');
      if(tile?.hidden)continue;
      const box=tile?.getBoundingClientRect();
      const active=tile?.dataset.sceneId===this.previewId || tile?.dataset.sceneId===this.program.scene.id;
      // Skip offscreen cards to avoid drawing all 100 thumbnails every second.
      if(!active && box && (box.right<bounds.left-220 || box.left>bounds.right+220))continue;
      const scene = sceneMap.get(node.dataset.thumb);
      if (scene) this.renderer.thumbnail(node, scene, shot.sources, now, shot.scenes,
        {...this.timer,config:this.project});
    }
  }


  /** Draw original camera frames plus the processed matte in nonmodal controls.
   * Both panels read the same connected camera. The keyed side uses the exact
   * StudioMedia.drawable path seen by scene Preview and live Program. */
  drawChromaPreview(now) {
    const original=$('chroma-raw-preview');
    const keyed=$('chroma-keyed-preview');
    if(!original || !keyed || !this.layer || this.layer.matte!=='chroma')return;
    if(now-this.lastChromaPreview<125)return;
    this.lastChromaPreview=now;
    const layer=this.layer;
    const source=this.source(layer.source);
    if(!source || source.type!=='camera')return;
    const video=this.media.get(source.id)?.element;
    const ready=!!video && video.readyState>=2 && video.videoWidth>0;
    const raw=original.getContext('2d',{willReadFrequently:true});
    const effect=keyed.getContext('2d');
    const width=original.width,height=original.height;
    raw.clearRect(0,0,width,height);
    effect.clearRect(0,0,width,height);
    const status=$('chroma-preview-status');
    if(!ready){
      original.dataset.chromaReady='false';
      for(const ctx of [raw,effect]){
        ctx.fillStyle='#142338';ctx.fillRect(0,0,width,height);
        ctx.fillStyle='#bfd4e9';ctx.font='14px sans-serif';ctx.textAlign='center';
        ctx.fillText('Connect camera to preview',width/2,height/2);
      }
      if(status)status.textContent='Connect this camera to sample the backdrop color.';
      return;
    }
    drawImage(raw,video,0,0,width,height,'cover',layer.mirror);
    original.dataset.chromaReady='true';
    // Checkerboard indicates transparent pixels, not a green background.
    effect.fillStyle='#e5eaf0';effect.fillRect(0,0,width,height);
    effect.fillStyle='#aab5c2';
    for(let y=0;y<height;y+=18)for(let x=0;x<width;x+=18)
      if(((x/18+y/18)&1)===0)effect.fillRect(x,y,18,18);
    const frame=this.media.drawable(source,layer,now);
    if(frame){
      drawImage(effect,frame,0,0,width,height,'cover',layer.mirror);
      if(status)status.textContent='Click a backdrop area in Original Camera, then adjust the key sliders.';
    } else if(status)status.textContent='Processing the selected key…';
  }

  /** Pick the exact visible video color, including mirroring and cover crop,
   * by reading a small averaged patch in the raw preview canvas. */
  sampleChromaKey(canvas,event=null) {
    const layer=this.layer;
    if(!layer || layer.matte!=='chroma' ||
      this.source(layer.source)?.type!=='camera' || canvas.dataset.chromaReady!=='true'){
      this.notify('Connect the camera before sampling its backdrop.',true);
      return;
    }
    const bounds=canvas.getBoundingClientRect();
    if(!bounds.width || !bounds.height)return;
    const x=event ? (event.clientX-bounds.left)/bounds.width : .5;
    const y=event ? (event.clientY-bounds.top)/bounds.height : .5;
    if(x<0 || x>1 || y<0 || y>1)return;
    const width=canvas.width,height=canvas.height;
    const cx=Math.max(0,Math.min(width-1,Math.floor(x*width)));
    const cy=Math.max(0,Math.min(height-1,Math.floor(y*height)));
    const startX=Math.max(0,cx-2),startY=Math.max(0,cy-2);
    const patch=canvas.getContext('2d',{willReadFrequently:true})
      .getImageData(startX,startY,Math.min(5,width-startX),Math.min(5,height-startY)).data;
    let red=0,green=0,blue=0;
    const samples=patch.length/4;
    for(let i=0;i<patch.length;i+=4) {
      red+=patch[i];green+=patch[i+1];blue+=patch[i+2];
    }
    layer.key='#'+[red,green,blue].map(channel=>
      Math.round(channel/samples).toString(16).padStart(2,'0')).join('');
    this.mark();
    this.lastChromaPreview=0;
    this.renderDock();
    this.drawChromaPreview(performance.now());
    this.notify('Camera backdrop sampled: '+layer.key.toUpperCase());
  }

  updateStatus(now) {
    $('session-clock').textContent = clock((now - this.started) / 1000, true);
    if ($('timer-read')) $('timer-read').textContent =
      (this.timer.remaining < 0 ? '+' : '') + timerText(
        this.timer.remaining < 0 ? Math.abs(this.timer.remaining) : Math.ceil(this.timer.remaining),
        this.project.timerSeconds >= 3600);
    if ($('timer-status')) $('timer-status').textContent = this.timer.deadline
      ? (this.timer.finished ? 'Overtime' : 'Running')
      : this.timer.finished ? 'Finished' : 'Paused / ready';
    if ($('matte-status') && this.layer) $('matte-status').textContent = this.media.matteStatus($('matte-status').dataset.id, this.layer);
    this.drawChromaPreview(now);
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
    if (!this.project.scenes.length) { this.sceneDialog(true); return; }
    const actions = [
      ['camera', 'Camera'], ['mic', 'Microphone'], ['screen', 'Screen or app window'], ['powerpoint', 'PowerPoint deck'],
      ['slideshow', 'Capture PowerPoint slideshow'], ['files', 'Video, image or audio'], ['title', 'Text layer'],
      ['scene', 'Embed another scene'], ['timer', 'Classroom timer'],
    ];
    const available = this.project.sources.filter(source =>
      !this.scene.layers.some(layer => layer.source === source.id)
      && (source.type !== 'scene' || canEmbedScene(this.project,this.scene.id,source.sceneId)));
    this.dialogOpen('Add an input',
      '<p>Add a new camera or microphone here for <strong>' + e(this.scene.name)
      + '</strong> only. To display a camera already used in another scene, select '
      + '<strong>Use an existing input</strong> below instead. An existing camera shares '
      + 'one connection while its placement remains independent in each scene.</p>'
      + '<div class="input-grid">' + actions.map(([id, label]) =>
      buttons(icon(id === 'slideshow' ? 'popout' : id === 'files' ? 'folder' : id, 17) + e(label), 'input-' + id)).join('')
      + '</div>' + (available.length ? '<div class="form-grid"><label>Use an existing input<select id="reuse-input"><option value="">Select an input</option>'
        + available.map(source => option(source.id, source.name)).join('') + '</select></label>'
        + '<div class="inline">' + buttons('Assign to this scene', 'reuse-input') + buttons('Remove input entirely', 'delete-input') + '</div></div>' : ''));
  }

  timerLayerForScene(scene = this.scene) {
    if (!scene || !this.project.scenes.some(item => item.id === scene.id)) return null;
    return scene.layers.find(layer => this.source(layer.source)?.type === 'timer') || null;
  }

  syncTimerToProgram(sceneId) {
    const source = this.project.sources.find(item => item.type === 'timer');
    if (!source) return;
    // The live Program holds a snapshot. Only update its timer references,
    // never replace camera, PowerPoint or other live scene layers.
    for (const [id, live] of [[this.program.scene.id,this.program.scene],
      ...this.program.scenes.entries()]) {
      if (id !== sceneId) continue;
      const actual = this.project.scenes.find(scene => scene.id === id);
      if (!actual) continue;
      live.layers = live.layers.filter(layer => layer.source !== source.id);
      for (const layer of actual.layers)
        if (layer.source === source.id) live.layers.push(clone(layer));
    }
    this.program.sources.set(source.id,clone(source));
  }

  assignTimerToScene(scene=this.scene, enabled) {
    if (!this.project.scenes.some(item => item.id === scene.id))
      throw new Error('Create a scene before adding a timer.');
    const existing = this.timerLayerForScene(scene);
    const wanted = enabled ?? !existing;
    if (wanted && !existing) {
      let source = this.project.sources.find(item => item.type === 'timer');
      if (!source) {
        if (this.project.sources.length >= 100) throw new Error('Project input limit reached.');
        source = makeSource('timer','Classroom timer');
        this.project.sources.push(source);
      }
      this.layerId = this.addLayer(this.project,scene,source).id;
    } else if (!wanted && existing) {
      scene.layers = scene.layers.filter(layer => layer.id !== existing.id);
      if (this.layerId === existing.id) this.layerId = scene.layers.at(-1)?.id;
    } else return;
    this.syncTimerToProgram(scene.id);
    this.mark();
    this.render();
    this.notify(wanted ? 'Live timer layout added to this scene. It appears only on Program; resize the placement in Arrange scene.' :
      'Scene-specific timer layout removed. You can still show the countdown directly on live output.');
  }

  setTimerStyle(style) {
    if (!Object.hasOwn(TIMER_STYLES,style)) return;
    const layer=this.timerLayerForScene();
    if (layer) {
      if (style === 'fullscreen') Object.assign(layer,PLACE.full);
      else if (layer.timerStyle === 'fullscreen' &&
        layer.x===0 && layer.y===0 && layer.w===100 && layer.h===100)
        Object.assign(layer,{x:75,y:7,w:22,h:19});
      layer.timerStyle=style;
      this.syncTimerToProgram(this.scene.id);
    }
    this.project.timerStyle=style;
    this.mark();
    this.render();
  }

  timerSetDuration(seconds) {
    const n=Math.round(Number(seconds));
    if (!Number.isInteger(n)||n<1||n>MAX_TIMER_SECONDS)
      throw new Error('Enter a duration between 00:00:01 and 23:59:59.');
    this.project.timerSeconds=n;
    const running=!!this.timer.deadline;
    resetTimer(this.timer,n);
    if (running) startTimer(this.timer,performance.now(),n);
    this.mark();
    this.renderWorkspacePanel();
  }

  playTimerChime() {
    // Reuse the production AudioBus so the chime is available to the
    // Program recording/stream, rather than only the local computer speakers.
    const audio=this.media.audio;
    if (!audio.context || !audio.master) return;
    const ctx=audio.context;
    for (const [i,frequency] of [880,660].entries()) {
      const oscillator=ctx.createOscillator(),gain=ctx.createGain();
      const when=ctx.currentTime+i*.2;
      oscillator.type='sine';
      oscillator.frequency.setValueAtTime(frequency,when);
      gain.gain.setValueAtTime(.0001,when);
      gain.gain.exponentialRampToValueAtTime(.12,when+.025);
      gain.gain.exponentialRampToValueAtTime(.0001,when+.23);
      oscillator.connect(gain).connect(audio.master);
      oscillator.start(when);oscillator.stop(when+.24);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    }
  }

  /** Embed an existing user-built scene on the current scene's canvas.
   * No template scenes or cameras are created. */
  sceneLayerDialog() {
    const parent = this.scene;
    const eligible = this.project.scenes.filter(child => canEmbedScene(this.project, parent.id, child.id)
      && !parent.layers.some(layer =>
        this.source(layer.source)?.type === 'scene' && this.source(layer.source).sceneId === child.id));
    if (!eligible.length) {
      this.dialogOpen('Embed another scene',
        '<p>Create a separate scene first, such as a PowerPoint-only scene. '
        + 'You can then reuse it inside this studio as a movable and resizable layer. '
        + 'A scene cannot embed itself or create a circular reference.</p>');
      return;
    }
    this.dialogOpen('Embed another scene',
      '<p>Choose an existing scene to appear inside <strong>' + e(parent.name)
      + '</strong>—for example, a full PowerPoint scene inside a classroom TV. '
      + 'Move and resize the embedded scene using Arrange layers or the larger Scene Designer.</p>'
      + '<p>PowerPoint decks inside the reused scene will share one live slide position '
      + 'across full-screen, all studios, Preview and Program—even if you add the '
      + 'PowerPoint after embedding the scene.</p>'
      + '<div class="form-grid"><label>Scene to embed<select name="child">'
      + eligible.map(child => option(child.id,child.name)).join('')
      + '</select></label></div>',
      '<button type="button" class="button" data-act="close-dialog">Cancel</button>'
      + '<button type="submit" class="button primary">Add scene layer</button>', data => {
        const id = String(data.get('child'));
        if (!canEmbedScene(this.project,parent.id,id)) throw new Error('That scene would create a circular reference.');
        if (parent.layers.some(layer => this.source(layer.source)?.type === 'scene'
          && this.source(layer.source).sceneId === id)) throw new Error('This scene is already embedded here.');
        const child = this.project.scenes.find(scene => scene.id === id);
        if (!child) throw new Error('Choose an existing scene.');
        let source = this.project.sources.find(source => source.type === 'scene' && source.sceneId === id);
        if (!source) {
          if (this.project.sources.length >= 100) throw new Error('Project input limit reached.');
          source = makeSource('scene', child.name, { sceneId:id });
          this.project.sources.push(source);
        }
        this.layerId = this.addLayer(this.project,parent,source).id;
        linkSceneDecks(this.project,id);
        syncLinkedDecks(this.project,[this.program,this.transition?.previous]);
        this.closeDialog();
        this.mark();
        this.render();
        this.notify('Embedded scene added. Related PowerPoints now stay on the same slide.');
      });
  }

  addLayer(project, scene, source) {
    if (scene.layers.length >= 40) throw new Error('A scene can contain up to 40 input layers.');
    const slides = scene.template === 'slides';
    const hasSlides = scene.layers.some(layer => ['powerpoint','image','screen'].includes(project.sources.find(s => s.id === layer.source)?.type));
    const layers = source.type === 'timer' ? (project.timerStyle === 'fullscreen'
        ? PLACE.full : {x:75,y:7,w:22,h:19})
      : source.type === 'scene' ? { x: 7, y: 4, w: 48, h: 43 }
      : source.type === 'title' ? PLACE.title
      : source.type === 'camera' && (slides || hasSlides || scene.layers.some(layer => project.sources.find(s => s.id === layer.source)?.type === 'camera')) ? PLACE.inset
      : slides && ['powerpoint', 'screen', 'image', 'video'].includes(source.type) ? PLACE.slides : PLACE.full;
    const layer = makeLayer(source.id, layers);
    if (['powerpoint', 'screen', 'image', 'scene'].includes(source.type)) layer.fit = 'contain';
    if (source.type === 'timer') layer.timerStyle = project.timerStyle;
    if (source.type === 'powerpoint' && source.sync) layer.page = source.page;
    scene.layers.push(layer);
    if (['powerpoint','scene'].includes(source.type)) {
      // Linking also runs when a PowerPoint is imported into a slide scene
      // that was already embedded in one or more studio views.
      syncLinkedDecks(project, project === this.project
        ? [this.program,this.transition?.previous] : []);
    }
    return layer;
  }

  /** A connected device is shared by reference, not inserted in every scene.
   * Only scenes with an explicitly assigned layer can display that camera. */
  async connectInput(source) {
    if (!source) return;
    if (source.type === 'mic' && source.route !== 'always') {
      source.route = 'always';
      this.mark();
    }
    await this.media.connect(source);
    this.render();
  }

  /** Project-wide camera assignment matrix: independent camera stream, explicit
   * per-scene visibility and geometry. Legacy auto-added insets are identified
   * as suggestions only; nothing is removed without operator confirmation. */
  cameraAssignments() {
    const cameras = this.project.sources.filter(source => source.type === 'camera');
    if (!cameras.length) {
      this.dialogOpen('Camera assignments',
        '<p>There are no cameras in this project yet. Choose a scene, open its '
        + 'Settings and select Add input → Camera to add one.</p>');
      return;
    }
    const header = '<div class="camera-matrix-head"><span>Scene</span>'
      + cameras.map(camera => '<strong title="' + e(camera.name) + '">' + e(camera.name) + '</strong>').join('')
      + '</div>';
    const rows = this.project.scenes.map((scene, rowIndex) =>
      '<div class="camera-matrix-row"><strong>' + e(scene.name) + '</strong>'
      + cameras.map((camera, columnIndex) => {
        const layer = scene.layers.find(item => item.source === camera.id);
        const suggested = isDefaultSharedCameraInset(layer, camera);
        return '<label class="camera-matrix-check" title="'
          + e(camera.name) + ' in ' + e(scene.name) + '">'
          + '<input type="checkbox" name="cam-' + rowIndex + '-' + columnIndex
          + '" data-default-inset="' + suggested + '"' + (layer ? ' checked' : '') + '>'
          + '<span>' + (layer ? 'Assigned' : 'Off') + '</span></label>';
      }).join('') + '</div>').join('');
    this.dialogOpen('Camera assignments',
      '<p><b>A camera only appears in scenes where its box is checked.</b> All scenes '
      + 'that use the same camera share one device connection, but can size and position '
      + 'that camera differently.</p><p class="slide-label">This also lets you remove camera '
      + 'layers that the previous update may have added automatically. Changes to a scene '
      + 'already on air take effect the next time you Take that scene.</p>'
      + '<div class="camera-matrix" style="--camera-cols:' + cameras.length + '">' + header + rows + '</div>'
      + '<p class="slide-label">Review before saving. “Clear default insets” only unchecks '
      + 'unmodified inset-sized camera layers; it does not change anything until you apply.</p>',
      '<button type="button" class="button" data-act="camera-uncheck-defaults">Clear default insets</button>'
      + '<button type="button" class="button" data-act="close-dialog">Cancel</button>'
      + '<button type="submit" class="button primary">Apply camera assignments</button>',
      data => {
        const planned = this.project.scenes.map((scene, rowIndex) => {
          const additions = cameras.filter((camera, columnIndex) =>
            data.has('cam-' + rowIndex + '-' + columnIndex) &&
            !scene.layers.some(layer => layer.source === camera.id));
          const removed = new Set(cameras.filter((camera, columnIndex) =>
            !data.has('cam-' + rowIndex + '-' + columnIndex)).map(camera => camera.id));
          if (scene.layers.length + additions.length
            - scene.layers.filter(layer => removed.has(layer.source)).length > 40)
            throw new Error('“' + scene.name + '” has too many layers for the chosen cameras.');
          return { scene, additions, removed };
        });
        for (const { scene, additions, removed } of planned) {
          scene.layers = scene.layers.filter(layer => !removed.has(layer.source));
          for (const camera of additions) assignDeviceToScene(this.project, scene, camera);
        }
        this.layerId = this.scene.layers.some(layer => layer.id === this.layerId)
          ? this.layerId : this.scene.layers.at(-1)?.id;
        this.closeDialog();
        this.mark();
        this.render();
      });
  }

  addSource(type, name, options, project = this.project, scene = this.scene) {
    if (!project.scenes.some(item => item.id === scene.id))
      throw new Error('Create a blank scene before adding a camera or other input.');
    if (project.sources.length >= 100) throw new Error('A project can hold up to 100 inputs.');
    if (scene.layers.length >= 40) throw new Error('A scene can contain up to 40 input layers.');
    const source = makeSource(type, name, options);
    // Add a new device to the chosen scene only. Other scenes can explicitly
    // reuse this source ID, with a single shared MediaStream connection.
    project.sources.push(source);
    const layer = this.addLayer(project, scene, source);
    return { source, layer };
  }

  async deviceMenu(type, existing) {
    if (!this.project.scenes.length) { this.sceneDialog(true); return; }
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
          await this.connectInput(existing);
        } else {
          const { source, layer } = this.addSource(type, textName(String(data.get('name')), label), { device });
          this.layerId = layer.id;
          
          this.mark();
          this.render();
          await this.connectInput(source);
        }
      });
  }

  startScreen(slideshow) {
    this.closeDialog();
    const { source, layer } = this.addSource('screen', slideshow ? 'PowerPoint slideshow' : 'Screen share', {});
    this.layerId = layer.id;
    
    this.mark();
    this.render();
    return this.media.connect(source);
  }

  pickFile(mode, data = null) {
    if (!this.project.scenes.length && !mode.startsWith('overlay-') && mode !== 'graphic') {
      this.sceneDialog(true);
      return;
    }
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
        || (pick.mode === 'backdrop' && kind !== 'image')
        || (pick.mode === 'graphic' && !['image', 'video'].includes(kind))
        || (pick.mode === 'overlay-image' && kind !== 'image')
        || (pick.mode === 'overlay-video' && kind !== 'video')
        || (pick.mode === 'overlay-media' && !['image','video'].includes(kind))) {
        this.notify('Choose a supported media file. ' + file.name, true);
        continue;
      }
      if (file.size > storage.FILE_LIMIT) { this.notify(file.name + ' exceeds the 180 MB per-file limit.', true); continue; }
      const name = file.name.replace(/\.[^.]+$/, '').slice(0, 120);
      const result = await this.atomic((draft, id) => {
        const scene = draft.scenes.find(item => item.id === pick.scene);
        // Overlays are project-wide; they can be imported before any scene
        // exists, unlike media layers or scene background images.
        if (!scene && pick.mode !== 'graphic' && !pick.mode.startsWith('overlay-'))
          throw new Error('Create a scene and import the file again.');
        if (pick.mode === 'backdrop') {
          scene.backdrop = id;
          scene.background = 'custom';
          return null;
        }
        if (pick.mode === 'graphic' || pick.mode.startsWith('overlay-')) {
          const replacing = pick.data?.id && draft.overlays.find(item => item.id === pick.data.id);
          if (replacing) {
            if (this.liveOverlays.has(replacing.id) && this.liveOverlays.get(replacing.id).end === undefined)
              throw new Error('Hide this overlay from Program before replacing its media.');
            replacing.asset = id;
            return { overlay: replacing, replacing: true };
          }
          if (draft.overlays.length >= OVERLAY_LIMIT) throw new Error('This project already has '+OVERLAY_LIMIT+' overlays.');
          const type = pick.mode === 'graphic' ? 'graphic' : kind;
          const overlay = makeOverlay(type, { ...pick.data, asset: id, name: pick.data?.name || name });
          draft.overlays.push(overlay);
          return { overlay };
        }
        return this.addSource(kind, name, { asset: id }, draft, scene);
      }, file);
      if (result?.source) {
        this.previewId = pick.scene;
        this.layerId = result.layer.id;
        
        this.media.load(result.source);
      }
      if (result?.overlay) {
        if (result.replacing) {
          this.media.dispose('preview:' + result.overlay.id);
          this.media.dispose('program:' + result.overlay.id);
        }
        this.loadGraphic(result.overlay);
      }
      this.render();
      if (result?.overlay) this.overlayEditor.show(result.overlay.id, 'message', !result.replacing);
    }
  }

  sceneDialog(adding) {
    if (!adding && !this.project.scenes.length) { this.sceneDialog(true); return; }
    const scene = this.scene;
    const position = this.project.scenes.indexOf(scene);
    const groupChoices=[...new Set(this.project.scenes.map(item=>sceneGroup(item.group)))];
    const body = '<div class="form-grid">' + (adding
      ? '<p>Your scene starts blank. Add only the cameras, microphones and other layers you choose.</p>'
      + '<label>Scene name<input name="name" required maxlength="120" placeholder="e.g. Studio 1"></label>'
      : '<label>Scene name<input name="name" required maxlength="120" value="' + e(scene.name) + '"></label>'
      + '<label>Background<select name="background">' + options(Object.fromEntries(Object.entries(BACKGROUNDS).filter(([id]) => id !== 'custom' || scene.backdrop)), scene.background) + '</select></label>'
      + '<div class="inline">' + buttons(icon('image',15) + ' Upload background','input-backdrop') + '</div>'
      + '<label>On-screen title<input name="title" maxlength="100" value="' + e(scene.title) + '"></label>'
      + '<label>On-screen caption<input name="caption" maxlength="200" value="' + e(scene.caption) + '"></label>') +
      '<label>Scene group<input name="group" list="scene-group-suggestions" maxlength="40" value="' +
        e(adding ? DEFAULT_SCENE_GROUP : sceneGroup(scene.group)) +
        '" placeholder="e.g. Leadership 101"></label>' +
      '<datalist id="scene-group-suggestions">' + groupChoices.map(name=>'<option value="'+e(name)+'"></option>').join('') +
      '</datalist></div>';
    const manage = adding ? '' : buttons('Duplicate','duplicate-scene') + buttons('Move up','scene-up',position === 0 ? 'disabled' : '')
      + buttons('Move down','scene-down',position === this.project.scenes.length - 1 ? 'disabled' : '')
      + buttons('Delete','remove-scene',this.project.scenes.length < 2 ? 'disabled' : '');
    this.dialogOpen(adding ? 'Add scene' : 'Scene settings', body, manage
      + '<button class="button primary" type="submit">' + (adding ? 'Add scene' : 'Apply to Preview') + '</button>', data => {
        if (adding) {
          if (this.project.scenes.length >= SCENE_LIMIT) throw new Error('This project already has '+SCENE_LIMIT+' scenes.');
          const wasEmpty = this.project.scenes.length === 0;
          const item = makeScene('blank', textName(String(data.get('name')), 'Scene ' + (this.project.scenes.length + 1)));
          item.group=sceneGroup(data.get('group'));
          this.project.scenes.push(item);
          this.sceneSearch='';this.sceneGroupFilter='all';
          // First user-created scene becomes the starting monitor scene.
          // Nothing, including a camera, is automatically added to it.
          if (wasEmpty) this.program = this.shot(item);
          this.setPreview(item.id);
        } else {
          scene.name = textName(String(data.get('name')), scene.name);
          scene.group=sceneGroup(data.get('group'));
          for (const source of this.project.sources)
            if (source.type === 'scene' && source.sceneId === scene.id) source.name = scene.name;
          scene.background = String(data.get('background'));
          scene.title = String(data.get('title')).slice(0, 100);
          scene.caption = String(data.get('caption')).slice(0, 200);
        }
        this.closeDialog();
        this.mark();
        this.render();
      });
  }

  requestSceneDeletion(id) {
    const index = this.project.scenes.findIndex(scene => scene.id === id);
    if (index < 0) return;
    const scene = this.project.scenes[index];
    if (this.project.scenes.length <= 1) {
      this.notify('Keep at least one scene in your project.', true);
      return;
    }
    if (this.project.scenes.some(parent => parent.layers.some(layer =>
      this.source(layer.source)?.type === 'scene' && this.source(layer.source).sceneId === id))) {
      this.dialogOpen('Scene is embedded', '<p>“' + e(scene.name)
        + '” is used inside another scene. Remove its embedded scene layer from the '
        + 'parent studio first, then delete this scene.</p>');
      return;
    }
    if (this.program.scene.id === id || this.transition?.previous.scene.id === id) {
      this.dialogOpen('Scene is on air', '<p>“' + e(scene.name)
        + '” is part of the live output. First cue another scene in Preview and press Cut or Take. '
        + 'Then you can safely delete this scene without interrupting the broadcast.</p>');
      return;
    }
    this.dialogOpen('Delete scene', '<p>Delete “' + e(scene.name)
      + '” from this project? This removes its layout and settings, but keeps imported media '
      + 'in your project for reuse.</p><p class="warning-note">This cannot be undone after saving. '
      + 'Download a project backup if you want a copy first.</p>',
      '<button class="button" type="button" data-act="close-dialog">Cancel</button>'
        + '<button class="button danger" type="submit">Delete scene</button>', () => {
        const current = this.project.scenes.findIndex(item => item.id === id);
        if (current < 0 || this.project.scenes.length <= 1
          || this.program.scene.id === id || this.transition?.previous.scene.id === id) {
          this.closeDialog();
          this.notify('Scene could not be deleted. Check which scene is live.', true);
          return;
        }
        this.project.scenes.splice(current, 1);
        this.project.extraShortcuts=(this.project.extraShortcuts||[])
          .filter(row=>row.action!=='scene:'+id);
        if (this.previewId === id) {
          const replacement = this.project.scenes[Math.min(current, this.project.scenes.length - 1)];
          this.previewId = replacement.id;
          this.layerId = replacement.layers.at(-1)?.id;
        }
        this.closeDialog();
        this.mark();
        this.render();
        this.notify('Scene deleted from this project.');
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
    if (this.project.overlays.length >= OVERLAY_LIMIT)
      throw new Error('This project already has '+OVERLAY_LIMIT+' overlays.');
    this.dialogOpen('Add overlay',
      '<p>An overlay is an independent image, video, message, or emoji reaction that appears above any live scene. '
      + 'Each one can be moved and resized on its own 16:9 canvas, then shown and hidden on air.</p>'
      + '<div class="input-grid">'
      + Object.entries(OVERLAY_CHOICES).map(([id, title]) =>
        buttons(icon(id === 'message' ? 'message' : id,17) + e(title),
          'overlay-type', dataId(id))).join('')
      + '</div>');
  }

  overlayEdit(id, type = 'message') {
    this.overlayEditor.show(id, type);
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
    if (this.workspaceTab === 'overlays') this.renderWorkspacePanel();
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
    if (changed && this.workspaceTab === 'overlays') this.renderWorkspacePanel();
  }

  slide(layerId, bus, delta) {
    // Re-detect shared inputs before navigation, including scenes built before
    // automatic linking existed. A linked deck always advances one page
    // globally, regardless of which studio currently contains it.
    syncLinkedDecks(this.project,[this.program,this.transition?.previous]);
    const shot = bus === 'program' ? this.program : this.shot(this.scene, false);
    const found = visibleSceneLayers(shot).find(({layer,source}) =>
      layer.id === layerId && source.type === 'powerpoint');
    if (!found) return;
    const {layer} = found;
    const deck = this.media.get(layer.source)?.deck;
    if (!deck) return;
    const source = this.source(layer.source);
    const current = source?.sync ? source.page : layer.page;
    const page = Math.min(deck.count - 1, Math.max(0, current + delta));
    if (current === page) return;
    if (source?.sync) {
      source.page = page;
      syncLinkedDecks(this.project,[this.program,this.transition?.previous]);
      this.mark();
    } else {
      layer.page = page;
      if (bus !== 'program') this.mark();
    }
    this.renderDock();
    this.renderProgramDeck();
    if (this.workspaceTab === 'classroom') this.renderWorkspacePanel();
  }

  help() {
    this.dialogOpen('Shortcuts and setup', `<div class="help-copy">
      <p>Switch scenes with configured shortcuts. The default keys are Space for Take, C for Cut,
      1–9 to cue scenes, Q/W/E/R/T/Y/U/I for live overlays, Page Up/Down for the live PowerPoint,
      and comma/period for Preview slides.</p>
      <p>Use Shortcuts at the top of the control room to assign your own keys, including modifiers.
      Press a key in its assignment box, or select Add shortcut to create additional commands
      for any saved overlay or production action. Duplicate assignments are rejected.</p>
      <p>The Scenes workspace supports up to 100 scenes. Search by name and organize scenes
      with custom groups. Clear filters before reordering scenes.</p>
      <p>The Overlays workspace includes up to 100 saved items. Use the search box and group
      selector to find message, emoji, announcement and media overlays. Only active overlays
      are drawn on Program, so avoid stacking large numbers of video overlays at once.</p>
      <h3>Share a clean feed</h3>
      <p>Open Program output, then share that window or tab in your meeting app. Enable its audio and
      share computer sound if the meeting app offers it.</p>
      <h3>PowerPoint</h3>
      <p>Import .pptx or .ppsx for slide controls and private notes. Live PowerPoint navigation appears
      under Program while that scene is on air. For animations or embedded media, capture the
      PowerPoint slideshow window instead.</p>
      <h3>Scene editing, nesting, and order</h3>
      <p>In a scene's Layers & Inputs, choose Add input → Embed another scene. Select a
      previously created scene, then resize and drag it over a TV or whiteboard. Its
      PowerPoint automatically stays synchronized with the full-screen version—even
      after switching between studio, Preview, and Program.</p>
      <p>In the Scenes tab, grab the Move handle on a scene card and drag it before or after
      another scene to change the order. The left and right arrows on each card also
      reorder one position at a time, including on touchscreens. Ordering updates the
      keyboard scene number shortcuts, saves with your project, and does not interrupt Program.
      Camera layers and scene settings are preserved.</p>
      <p>Choose Arrange layers under Preview and drag a camera, slide, or graphic. Select its border
      handles to resize; hold Shift to snap to the 2% grid. The Larger editor offers extra controls.
      Your on-air Program remains unchanged until Take or Cut.</p>
      <h3>Global production tools</h3>
      <p>Use Scenes, Overlays, and Classroom tabs below the monitors. Overlays and classroom functions belong
      to the overall project, not to individual scene settings. Scene settings contain only layers and inputs.
      Collapse or expand the Audio Mixer using its arrow at the right of the workspace.</p>
      <h3>Camera and recording</h3><p>Use desktop Chrome or Edge and reconnect devices if permissions
      change. Use headphones when monitoring the audio mix.</p>
      ${this.output.lastRecording ? buttons('Download last recording','download-recording') : ''}
      ${window.showSaveFilePicker && !this.output.active ? buttons('Record directly to disk','record-disk') : ''}
      </div>`);
  }

  async click(event) {
    // The original camera preview is embedded in the inspector, never
    // obscured by a modal or the browser's native color chooser.
    if (event.target.matches?.('[data-chroma-sample]')) {
      this.sampleChromaKey(event.target,event);
      return;
    }
    const button = event.target.closest('[data-act]');
    if (!button || !this.project || button.disabled) return;
    const { act, id, bus } = button.dataset;
    if (this.editing && !['close-dialog', 'record', 'output'].includes(act)) return;
    event.preventDefault();
    try {
      if (act.startsWith('input-')) {
        const type = act.slice(6);
        if (type === 'scene') this.sceneLayerDialog();
        else if (type === 'timer') { this.closeDialog(); this.assignTimerToScene(); }
        else if (['camera', 'mic'].includes(type)) await this.deviceMenu(type);
        else if (['screen', 'slideshow'].includes(type)) await this.startScreen(type === 'slideshow');
        else if (type === 'title') {
          this.closeDialog();
          const { layer } = this.addSource('title', 'Text layer', {});
          this.layerId = layer.id;
          
          this.mark();
          this.render();
        } else {
          this.closeDialog();
          this.pickFile(type === 'files' ? 'all' : type);
        }
        return;
      }
      switch (act) {
        case 'chroma-reset':
          if (this.layer && this.source(this.layer.source)?.type === 'camera') {
            Object.assign(this.layer,{
              key:'#00a040',keyStrength:50,keySoftness:50,keyDespill:0,
            });
            this.mark();
            this.renderDock();
            this.notify('Chroma key settings reset for this camera layer.');
          }
          break;
        case 'scene': this.setPreview(id); break;
        case 'open-embedded-scene':
          if (this.project.scenes.some(scene => scene.id === id)) {
            if (this.tools.open) this.tools.close();
            this.setPreview(id);
            this.showTools(id);
          }
          break;
        case 'scene-reorder-left': case 'scene-reorder-right': {
          const index = this.project.scenes.findIndex(scene => scene.id === id);
          const step = act === 'scene-reorder-left' ? -1 : 1;
          const neighbor = this.project.scenes[index + step];
          if (neighbor && this.reorderScene(id, neighbor.id, step > 0)) {
            this.notify('Scene order updated and saved with your project.');
            this.root.querySelector('[data-act="' + act + '"][data-id="' + id + '"]')?.focus();
          }
          break;
        }
        case 'scene-tools': this.showTools(id); break;
        case 'scene-delete': this.requestSceneDeletion(id); break;
        case 'close-tools': this.tools.close(); break;
        case 'arrange-preview': this.inlineEditor.toggle(); break;
        case 'shortcuts': this.shortcutDialog(); break;
        case 'shortcut-extra-add': {
          this.project.extraShortcuts ||= [];
          if(this.project.extraShortcuts.length >= EXTRA_SHORTCUT_LIMIT)
            throw new Error('You have reached the additional shortcut limit.');
          const newId=uid();
          this.project.extraShortcuts.push({id:newId,action:'',key:''});
          this.mark();
          this.shortcutDialog();
          this.dialog.querySelector('[data-extra-action="'+newId+'"]')?.focus();
          break;
        }
        case 'shortcut-extra-remove': {
          this.project.extraShortcuts=(this.project.extraShortcuts||[]).filter(row=>row.id!==id);
          this.mark();
          this.shortcutDialog();
          break;
        }
        case 'shortcut-extra-clear': {
          const row=this.project.extraShortcuts?.find(item=>item.id===id);
          if (!row)break;
          row.key='';
          this.mark();
          this.shortcutDialog();
          break;
        }

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
          this.project.extraShortcuts=[];
          this.mark();
          this.shortcutDialog();
          break;
        }
        case 'new-scene': this.sceneDialog(true); break;
        case 'scene-edit': if (this.tools.open) this.tools.close(); this.sceneDialog(false); break;
        case 'scene-designer': if (this.tools.open) this.tools.close(); this.designer.show(); break;
        case 'duplicate-scene': {
          if (this.project.scenes.length >= SCENE_LIMIT) throw new Error('This project already has '+SCENE_LIMIT+' scenes.');
          const duplicate = { ...clone(this.scene), id: uid(), name: (this.scene.name + ' copy').slice(0, 120) };
          this.project.scenes.splice(this.project.scenes.indexOf(this.scene) + 1, 0, duplicate);
          this.sceneSearch='';this.sceneGroupFilter='all';
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
        case 'remove-scene': this.requestSceneDeletion(this.scene.id); break;
        case 'cut': this.take('cut'); break;
        case 'take': this.take(this.project.transition); break;
        case 'favorite-take': {
          const index = Number(id);
          const type = this.project.favoriteTransitions[index];
          if (Number.isInteger(index) && index >= 0 && index < 5 && Object.hasOwn(TRANSITIONS, type))
            this.take(type);
          break;
        }
        case 'favorite-config': this.favoriteDialog(); break;
        case 'favorite-reset':
          this.project.favoriteTransitions = [...DEFAULT_FAVORITE_TRANSITIONS];
          this.mark();
          this.favoriteDialog();
          this.renderFavorites();
          break;
        case 'workspace-tab': this.setWorkspaceTab(id); break;
        case 'workspace-add':
          if (this.workspaceTab === 'overlays') this.overlayNew();
          else if (this.workspaceTab === 'classroom') this.pickFile('powerpoint');
          else this.sceneDialog(true);
          break;
        case 'toggle-mixer': this.toggleMixer(); break;
        case 'add-context': this.inputMenu(); break;
        case 'manage-cameras': this.cameraAssignments(); break;
        case 'camera-uncheck-defaults':
          for (const input of this.dialog.querySelectorAll('input[data-default-inset="true"]')) {
            input.checked = false;
            input.parentElement.querySelector('span').textContent = 'Off';
          }
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
          // Removing a camera from this scene NEVER disconnects that shared
          // camera from other scenes that refer to the same source.
          this.scene.layers = this.scene.layers.filter(layer => layer.id !== id);
          this.layerId = this.scene.layers.at(-1)?.id;
          this.mark();
          this.render();
          break;
        }
        case 'reuse-input': {
          const source = this.source($('reuse-input')?.value);
          if (!source) break;
          if (source.type === 'scene' && !canEmbedScene(this.project,this.scene.id,source.sceneId))
            throw new Error('That scene would create a circular reference.');
          this.layerId = ['camera','mic'].includes(source.type)
            ? assignDeviceToScene(this.project, this.scene, source).id
            : this.addLayer(this.project, this.scene, source).id;
          if (source.type === 'scene') {
            linkSceneDecks(this.project,source.sceneId);
            syncLinkedDecks(this.project,[this.program,this.transition?.previous]);
          }
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
        case 'remove-shared-device': {
          const source = this.source(id);
          if (!source || !['camera','mic'].includes(source.type)) break;
          this.dialogOpen('Remove shared ' + (source.type === 'camera' ? 'camera' : 'microphone'),
            '<p>Remove “' + e(source.name) + '” from every scene and from the Audio Mixer? '
            + 'This will disconnect the device and remove its saved per-scene placement.</p>',
            '<button class="button" type="button" data-act="close-dialog">Cancel</button>'
            + '<button class="button danger" type="submit">Remove shared input</button>', () => {
              this.media.disconnect(source.id);
              this.project.sources = this.project.sources.filter(item => item.id !== source.id);
              for (const scene of this.project.scenes)
                scene.layers = scene.layers.filter(layer => layer.source !== source.id);
              this.program.scene.layers = this.program.scene.layers.filter(layer => layer.source !== source.id);
              this.program.sources.delete(source.id);
              this.layerId = this.scene.layers.at(-1)?.id;
              this.closeDialog();
              this.mark();
              this.render();
            });
          break;
        }
        case 'connect': await this.connectInput(this.source(id)); break;
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
          this.closeDialog();
          if (id === 'image' || id === 'video') this.pickFile('overlay-' + id);
          else if (id === 'message' || id === 'emoji') this.overlayEdit(null, id);
          break;
        case 'overlay-remove': {
          const overlay = this.overlay(id);
          if (!overlay) break;
          this.dialogOpen('Delete overlay', '<p>Remove “' + e(overlay.name)
            + '” from this project? Imported files used by other sources are preserved.</p>',
            '<button class="button" type="button" data-act="close-dialog">Cancel</button>'
            + '<button class="button danger" type="submit">Delete overlay</button>', () => {
              this.previewOverlays.delete(id);
              this.liveOverlays.delete(id);
              this.media.dispose('preview:' + id);
              this.media.dispose('program:' + id);
              this.project.overlays = this.project.overlays.filter(item => item.id !== id);
              this.project.extraShortcuts=(this.project.extraShortcuts||[])
                .filter(row=>row.action!=='overlay:'+id);
              this.closeDialog();
              this.mark();
              this.renderWorkspacePanel();
            });
          break;
        }
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
          if (this.timer.deadline) pauseTimer(this.timer,performance.now());
          else {
            if (this.project.timerChime) {
              try { await this.media.audio.activate(); }
              catch { this.notify('Timer runs, but chime audio is unavailable in this browser.',true); }
            }
            startTimer(this.timer,performance.now(),this.project.timerSeconds);
          }
          this.renderWorkspacePanel();
          break;
        case 'timer-reset':
          resetTimer(this.timer,this.project.timerSeconds);
          this.renderWorkspacePanel();
          break;
        case 'timer-show':
          this.timer.visible=!this.timer.visible;
          this.renderWorkspacePanel();
          break;
        case 'timer-adjust':
          adjustTimer(this.timer,Number(id),performance.now());
          this.renderWorkspacePanel();
          break;
        case 'timer-assign':
          this.assignTimerToScene();
          break;
        case 'timer-style':
          this.setTimerStyle(id);
          break;
        case 'timer-preset':
          this.timerSetDuration(Number(id));
          break;
        case 'timer-save-preset':
          this.dialogOpen('Save a timer preset',
            '<p>Save the current countdown duration as a one-click classroom favorite.</p>'
            + '<div class="form-grid"><label>Preset name'
            + '<input name="name" maxlength="32" placeholder="Group discussion" required></label></div>',
            '<button type="button" class="button" data-act="close-dialog">Cancel</button>'
            + '<button type="submit" class="button primary">Save preset</button>', data => {
              const name=String(data.get('name')||'').trim().slice(0,32);
              if (!name) throw new Error('Enter a name for the timer preset.');
              const presets=this.project.timerPresets||[];
              if (presets.length>=8) throw new Error('You can save eight presets. Delete one first.');
              presets.push({name,seconds:this.project.timerSeconds});
              this.project.timerPresets=presets;
              this.closeDialog();this.mark();this.renderWorkspacePanel();
            });
          break;
        case 'timer-preset-delete':
          this.project.timerPresets.splice(Number(id),1);
          this.mark();this.renderWorkspacePanel();
          break;
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
    if (target.matches?.('[data-overlay-search]')) {
      this.overlaySearch=target.value.slice(0,140);
      this.filterOverlayLibrary();
      return;
    }
    if (target.matches?.('[data-scene-search]')) {
      this.sceneSearch=target.value.slice(0,120);
      this.filterSceneLibrary();
      this.thumbnails(performance.now());
      return;
    }
    const chromaOutput=['keyStrength','keySoftness','keyDespill'].includes(target.dataset.layer)
      ? this.root.querySelector('[data-chroma-output="'+target.dataset.layer+'"]') : null;
    if (chromaOutput) {
      chromaOutput.textContent=target.value+'%';
      return;
    }
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
      if (target.name?.startsWith('cam-') && target.closest('.camera-matrix')) {
        target.parentElement.querySelector('span').textContent = target.checked ? 'Assigned' : 'Off';
        return;
      }
      if (target.matches?.('[data-scene-filter]')) {
        this.sceneGroupFilter=target.value;
        this.filterSceneLibrary();
        this.thumbnails(performance.now());
        return;
      }
      if (target.matches?.('[data-overlay-filter]')) {
        this.overlayGroup=target.value;
        this.filterOverlayLibrary();
        return;
      }
      if (target.dataset.extraAction) {
        const row=this.project.extraShortcuts?.find(item=>item.id===target.dataset.extraAction);
        if (!row) return;
        const value=target.value;
        const allowed=SHORTCUT_ACTIONS.some(([action])=>action===value) ||
          (value.startsWith('overlay:') && this.project.overlays.some(o=>o.id===value.slice(8))) ||
          (value.startsWith('scene:') && this.project.scenes.some(scene=>scene.id===value.slice(6)));
        if (value && !allowed) throw new Error('Choose an available shortcut action.');
        row.action=value;
        this.mark();this.renderWorkspacePanel();
        return;
      }
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
      else if (target.dataset.timerTime) {
        const input=(unit)=>this.root.querySelector('[data-timer-time="'+unit+'"]')?.value;
        const seconds=parseTimerFields(input('h'),input('m'),input('s'));
        if (seconds===null) throw new Error('Enter hours 0–23, minutes 0–59 and seconds 0–59 (at least one second).');
        this.timerSetDuration(seconds);
        return;
      } else if (project === 'timerSeconds') {
        this.timerSetDuration(Number(target.value));
        return;
      } else if (project?.startsWith('timer')) {
        if (project === 'timerColor') {
          if (!/^#[0-9a-f]{6}$/i.test(target.value)) throw new Error('Invalid timer color.');
          this.project[project]=target.value;
        } else if (project === 'timerOpacity') this.project[project]=clamp(Number(target.value),10,100,100);
        else if (project === 'timerBackground' && ['solid','glass','transparent'].includes(target.value))
          this.project[project]=target.value;
        else if (project === 'timerEnd' && ['stop','overtime'].includes(target.value))
          this.project[project]=target.value;
        else if (['timerChime','timerFlash'].includes(project)) this.project[project]=target.checked;
        else return;
        this.mark();this.renderWorkspacePanel();
        return;
      } else if (layer && this.layer) {
        if (layer === 'preset') {
          const preset = target.value === 'board' ? { x: 7, y: 4, w: 48, h: 43 } : PLACE[target.value];
          if (preset) Object.assign(this.layer, preset);
          this.renderDock();
        } else if (['x', 'y', 'w', 'h'].includes(layer)) {
          this.layer[layer] = clamp(Number(target.value), Number(target.min), Number(target.max), this.layer[layer]);
          target.value = this.layer[layer];
        } else if (['keyStrength','keySoftness','keyDespill'].includes(layer)) {
          this.layer[layer]=Math.round(clamp(Number(target.value),0,100,
            layer==='keyStrength'?50:layer==='keySoftness'?50:0));
          target.value=this.layer[layer];
          this.lastChromaPreview=0;
        } else if (layer === 'key') {
          if (!/^#[0-9a-f]{6}$/i.test(target.value)) throw new Error('Invalid chroma key color.');
          this.layer.key=target.value;
          const label=$('chroma-key-code');
          if(label)label.textContent=target.value.toUpperCase();
          this.lastChromaPreview=0;
        } else if (layer !== 'opacity') {
          this.layer[layer] = target.type === 'checkbox' ? target.checked : target.value;
          if (layer === 'matte') this.renderDock();
          if (layer === 'timerStyle') {
            this.syncTimerToProgram(this.scene.id);
            if (this.workspaceTab === 'classroom') this.renderWorkspacePanel();
          }
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
    if (event.target.closest?.('.production-tabs') && event.target.getAttribute?.('role') === 'tab'
      && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      const tabs = [...this.root.querySelectorAll('.production-tabs [role="tab"]')];
      const index = tabs.indexOf(event.target);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
      this.setWorkspaceTab(tabs[next].dataset.id);
      tabs[next].focus();
      event.preventDefault();
      return;
    }
    if (!this.project || this.editing || this.dialog.open || this.tools.open || this.designer.open || this.overlayEditor.open ||
      event.defaultPrevented || event.repeat || event.target.closest?.('input,textarea,select,[contenteditable]')) return;
    const chord = keyboardShortcut(event);
    if (chord.endsWith('Space') && event.target.closest?.('button,a')) return;
    if (this.runShortcut(chord)) event.preventDefault();
  }

  runShortcut(chord) {
    if (!this.project || this.editing || !chord) return false;
    const action = shortcutAction(this.project.shortcuts, chord, this.project.extraShortcuts || []);
    if (!action) return false;
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
    else if (action.startsWith('overlay:')) {
      const id=action.slice(8);
      if(!this.overlay(id))return false;
      this.toggleOverlay(id,true);
    }
    else if (/^scene[0-8]$/.test(action))
      this.setPreview(this.project.scenes[Number(action.slice(5))]?.id);
    else if (action.startsWith('scene:')) {
      const id=action.slice(6);
      if(!this.project.scenes.some(scene=>scene.id===id))return false;
      this.setPreview(id);
    }
    else return false;
    return true;
  }
}

if (new URLSearchParams(location.search).get('output') === '1') outputPage();
else new Studio($('studio')).start();
