import { TRANSITION_GROUPS } from './transitions.js';

const paths = {
  plus: '<path d="M12 5v14M5 12h14"/>', chevron: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m14 6-6 6 6 6"/>', right: '<path d="m10 6 6 6-6 6"/>',
  up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
  grip: '<circle cx="8" cy="5" r="1.25"/><circle cx="16" cy="5" r="1.25"/><circle cx="8" cy="12" r="1.25"/><circle cx="16" cy="12" r="1.25"/><circle cx="8" cy="19" r="1.25"/><circle cx="16" cy="19" r="1.25"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  screen: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  popout: '<path d="M13 3h8v8m0-8-10 10m8 0v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7l10-5Zm10 10-10 5-10-5m20 5-10 5-10-5"/>',
  makeup: '<circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m17-7-1.5 1.5m-11 11L5 19m14 0-1.5-1.5m-11-11L5 5"/>',
  classroom: '<path d="m2 10 10-5 10 5-10 5L2 10Zm4 2v5c4 3 8 3 12 0v-5m4-2v7"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  eye: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  eyeOff: '<path d="m3 3 18 18M10 6l2-.1c6 0 10 6 10 6s-1 1.5-2.5 3M17 17a10 10 0 0 1-5 1c-6 0-10-6-10-6a17 17 0 0 1 4-4"/>',
  camera: '<rect x="2" y="5" width="13" height="14" rx="2"/><path d="m15 10 6-4v12l-6-4"/>',
  scene: '<rect x="3" y="5" width="14" height="12" rx="1"/><path d="M8 17v3h13V9h-4m-7-1h4m-7 3h7"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3"/>',
  powerpoint: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4m-3-7V7h4a2 2 0 0 1 0 4H9"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 16-5-5L5 21"/>',
  video: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 9 5 3-5 3Z"/>',
  audio: '<path d="M9 18V5l12-2v13M9 18a3 2 0 1 1-6 0 3 2 0 0 1 6 0Zm12-2a3 2 0 1 1-6 0 3 2 0 0 1 6 0Z"/>',
  title: '<path d="M4 5h16M12 5v15m-4 0h8m-12-9V5m16 6V5"/>',
  lower: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M6 13h11M6 16h6"/>',
  message: '<path d="M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-6 4V5a1 1 0 0 1 1-1Z"/><path d="M7 8h10m-10 4h7"/>',
  emoji: '<circle cx="12" cy="12" r="9"/><path d="M8 14c1.5 2.5 6.5 2.5 8 0"/><path d="M8.5 9h.01M15.5 9h.01"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  hand: '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v4-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-2a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a5 5 0 0 1-4-2l-4-5c-1-2 1-3 2-2l2 2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  timer: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2M8 2h8m-4 0v2"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  gear: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="2" fill="currentColor"/><circle cx="16" cy="17" r="2" fill="currentColor"/>',
  close: '<path d="m6 6 12 12m0-12L6 18"/>', trash: '<path d="M3 6h18m-12 0V3h6v3m4 0-1 15H6L5 6m5 4v7m4-7v7"/>',
  volume: '<path d="M3 9h4l5-4v14l-5-4H3Zm12 0a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>',
  mute: '<path d="M3 9h4l5-4v14l-5-4H3Zm13 0 5 6m0-6-5 6"/>',
  headphones: '<path d="M3 14v-2a9 9 0 0 1 18 0v2M3 12h4v8H5a2 2 0 0 1-2-2Zm18 0h-4v8h2a2 2 0 0 0 2-2Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.3-3 4m.1 3h.01"/>',
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10"/>',
  check: '<path d="m5 12 4 4L19 6"/>', grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
};
export const icon = (key, size = 18) => '<svg aria-hidden="true" width="' + size + '" height="' + size
  + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'
  + (paths[key === 'graphic' ? 'image' : key] || paths.screen) + '</svg>';
export const e = value => String(value ?? '').replace(/[&<>"']/g, letter => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[letter]);
export const sel = (value, current) => value === current ? ' selected' : '';
export const checked = value => value ? ' checked' : '';
export const pressed = value => value ? 'true' : 'false';
export const option = (value, label, current) => '<option value="' + e(value) + '"' + sel(value, current) + '>' + e(label) + '</option>';
export const iconButton = (act, label, image, data = '', extra = '') => '<button type="button" class="icon-button" data-act="'
  + act + '" ' + data + ' title="' + e(label) + '" aria-label="' + e(label) + '" ' + extra + '>' + icon(image, 16) + '</button>';
export const fields = (o, scope) => '<div class="bounds">' + [['x', 'X %'], ['y', 'Y %'], ['w', 'W %'], ['h', 'H %']]
  .map(([key, label]) => '<label>' + label + '<input type="number" data-' + scope + '="' + key + '" value="' + o[key]
  + '" min="' + ('xy'.includes(key) ? '-100' : '1') + '" max="' + ('xy'.includes(key) ? '100' : '200') + '"></label>').join('') + '</div>';

export function shell() {
  return `
  <header class="app-header">
    <a class="app-back" href="facilitation.html" aria-label="Back to Mayne Leadership classroom" title="Back to Mayne Leadership classroom">${icon('back')}</a>
    <div class="wordmark"><span class="mark" aria-hidden="true"><span></span></span><h1>Mayne <b>Studio</b></h1></div>
    <div class="header-divider"></div>
    <button class="project-picker" type="button" data-act="projects" aria-label="Open projects">${icon('folder',17)} <span id="project-name">Projects</span>${icon('chevron',14)}</button>
    <div class="header-actions">
      <button class="button save" data-act="save" type="button">${icon('save',16)} <span>Save</span></button>
      <button class="button" data-act="shortcuts" type="button">${icon('keyboard',16)} <span>Shortcuts</span></button>
      <button class="button output-toggle" data-act="output" type="button">${icon('popout',16)} <span>Program output</span></button>
      <button class="button record" id="record" data-act="record" type="button"><i></i> <span>Record</span></button>
    </div>
  </header>
  <main class="workspace" id="switcher">
    <section class="switcher">
      <div class="control-heading"><h2>Control room</h2><span class="format mono">1920 × 1080 <span></span> 30 FPS</span></div>
      <div class="monitors">
        <section class="monitor preview-monitor" aria-labelledby="preview-label">
          <div class="monitor-head"><h3 id="preview-label"><i></i> Preview</h3><span id="preview-name"></span></div>
          <div class="monitor-screen"><canvas id="preview-canvas" width="1280" height="720" aria-label="Preview canvas"></canvas><div id="preview-layer-controls" class="inline-preview-targets" hidden></div></div>
          <div class="monitor-foot"><span>${icon('eye',13)} Private preview</span><div class="scene-edit-controls"><button class="quiet-button" type="button" id="arrange-preview" data-act="arrange-preview" aria-pressed="false">${icon('layers',13)} Arrange layers</button><button class="quiet-button" type="button" data-act="scene-designer">${icon('layers',13)} Larger editor</button><button class="quiet-button" type="button" data-act="scene-tools">Scene controls ${icon('gear',14)}</button></div></div>
        </section>
      <section class="switch-controls" aria-label="Switching and transitions">
        <div class="transition-select"><label for="transition">Transition</label><select id="transition" data-project="transition">
          ${TRANSITION_GROUPS.map(group => `<optgroup label="${e(group.name)}">${group.choices.map(([id, name]) => `<option value="${e(id)}">${e(name)}</option>`).join('')}</optgroup>`).join('')}
        </select><label class="visually-hidden" for="transition-ms">Transition duration</label>
          <select id="transition-ms" data-project="duration"><option value="200">200 ms</option><option value="300">300 ms</option><option value="450">450 ms</option><option value="600">600 ms</option><option value="800">800 ms</option><option value="1000">1 s</option><option value="1500">1.5 s</option><option value="2000">2 s</option><option value="2500">2.5 s</option></select>
        </div>
        <div class="favorite-switches" aria-label="Five favorite transitions">
          <div class="favorite-heading"><span>Favorites</span><button type="button" class="favorite-config" data-act="favorite-config" aria-label="Configure favorite transitions" title="Choose five favorite transition effects">${icon('gear',13)} Edit</button></div>
          <div id="favorite-transition-list" class="favorite-transition-list"></div>
        </div>
        <div class="take-controls"><button class="button cut" data-act="cut" type="button">Cut <kbd>C</kbd></button>
          <button class="button primary take" id="take" data-act="take" type="button">Take ${icon('arrow',17)} <kbd>Space</kbd></button></div>
      </section>
        <section class="monitor program-monitor" aria-labelledby="program-label">
          <div class="monitor-head"><h3 id="program-label"><i></i> Program</h3><span id="program-name"></span></div>
          <div class="monitor-screen"><canvas id="program-canvas" width="1920" height="1080" aria-label="Program canvas"></canvas></div>
          <div class="monitor-foot"><span>${icon('screen',13)} Live output</span><span class="mono" id="session-clock">00:00:00</span></div><div class="live-deck-controls" id="live-deck-controls" hidden></div>
        </section>
      </div>
    <section class="pane scene-pane" aria-label="Production workspaces">
      <div class="pane-head production-tabs-head">
        <div class="production-tabs" role="tablist" aria-label="Scenes, overlays and classroom functions">
          <button id="workspace-scenes" role="tab" aria-controls="scene-panel" aria-selected="true" type="button" data-act="workspace-tab" data-id="scenes">${icon('grid',15)} Scenes</button>
          <button id="workspace-overlays" role="tab" aria-controls="overlays-panel" aria-selected="false" tabindex="-1" type="button" data-act="workspace-tab" data-id="overlays">${icon('makeup',15)} Overlays</button>
          <button id="workspace-classroom" role="tab" aria-controls="classroom-panel" aria-selected="false" tabindex="-1" type="button" data-act="workspace-tab" data-id="classroom">${icon('classroom',15)} Classroom</button>
        </div>
        <button type="button" id="manage-cameras" class="button camera-assignments-launch" data-act="manage-cameras" title="Choose which cameras belong to each scene">${icon('camera',15)} Camera assignments</button>
        <button type="button" id="workspace-add" class="icon-button" data-act="workspace-add" aria-label="Add scene" title="Add scene">${icon('plus',17)}</button>
      </div>
      <div id="scene-panel" class="production-panel" role="tabpanel" aria-labelledby="workspace-scenes">
        <div class="scene-library-toolbar" id="scene-library-toolbar">
          <label>Find scene<input type="search" id="scene-library-search" data-scene-search
            placeholder="Search scenes by name" autocomplete="off"></label>
          <label>Group<select id="scene-library-group" data-scene-filter>
            <option value="all">All groups</option>
          </select></label>
          <span id="scene-library-count" class="scene-library-count" aria-live="polite">0 / 100 saved</span>
        </div>
        <div id="scene-library-hint" class="scene-library-hint" hidden>Clear filters to reorder scenes.</div>
        <div id="scenes" class="scene-list"></div>
        <p id="scene-library-empty" class="scene-library-empty" hidden>No scenes match this search or group.</p>
      </div>
      <div id="overlays-panel" class="production-panel production-tools" role="tabpanel" aria-labelledby="workspace-overlays" hidden></div>
      <div id="classroom-panel" class="production-panel production-tools" role="tabpanel" aria-labelledby="workspace-classroom" hidden></div>
      <div class="scene-bottom"><button type="button" class="button add-scene" data-act="new-scene">${icon('plus',16)} Add scene</button></div>
    </section>
    </section>
    <aside class="pane mixer-pane" id="mixer-pane" aria-label="Audio mixer">
      <div class="pane-head"><h2>${icon('volume',18)} Audio mixer</h2>
        <div class="mixer-head-actions">
          <button id="mixer-toggle" type="button" class="icon-button" data-act="toggle-mixer" aria-controls="mixer-body" aria-expanded="true" aria-label="Collapse audio mixer" title="Collapse audio mixer">${icon('right',17)}</button>
          ${iconButton('input-mic','Add microphone','plus')}
        </div>
      </div>
      <span class="mix-rail-label" aria-hidden="true">Audio Mixer</span>
      <div id="mixer-body"><div class="mix-main" id="mixer"></div>
        <div class="mix-footer"><button class="button monitor-audio" type="button" data-act="listen" aria-pressed="false">${icon('headphones',17)} Monitor off</button></div>
      </div>
    </aside>
  </main>
  <footer class="status-strip">
    <span id="save-state"><i class="status-dot"></i> Saving project</span>
    <span id="record-status" class="record-status mono" hidden></span>
    <div class="status-right"><span class="mono" id="runtime-status"></span><button class="quiet-button" type="button" data-act="help">${icon('help',15)} Shortcuts &amp; help</button></div>
  </footer>
  <dialog class="studio-tools-dialog" id="studio-tools" aria-labelledby="tools-scene-name">
    <section class="dock pane" aria-label="Scene production tools"><div class="tools-title"><strong id="tools-scene-name">Scene controls</strong><button class="button" type="button" data-act="close-tools">Close</button></div>
      <div class="tools-scene-actions"><button class="button" type="button" data-act="scene-edit">${icon('gear',15)} Scene settings</button><button class="button" type="button" data-act="scene-designer">${icon('layers',15)} Arrange scene</button></div>
        <div class="dock-top"><span class="scene-input-label">Inputs for this scene</span><button class="button primary-outline dock-add" data-act="add-context" type="button">${icon('plus',16)} <span id="dock-add-label">Add input</span></button></div>
        <div id="dock-panel" aria-labelledby="tools-scene-name"></div>
      </section>
  </dialog>
  <div class="toast" id="toast" role="status" hidden></div>
  <dialog id="dialog" aria-labelledby="dialog-title"></dialog>
  <input type="file" id="media-picker" hidden><input type="file" id="project-picker" accept=".zip,application/zip" hidden>
  `;
}
