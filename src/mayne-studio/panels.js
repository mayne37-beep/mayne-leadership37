import { AUDIO, BACKGROUNDS, clock, OVERLAYS, OVERLAY_GROUPS, OVERLAY_LIMIT,
  overlayGroup, SOURCES, VISUAL, visibleSceneLayers } from './model.js';
import { checked, e, fields, icon, iconButton, option, pressed } from './ui.js';
import { overlayShortcutLabel } from './shortcuts.js';
import { TIMER_STYLES, TIMER_ENDINGS, TIMER_BACKGROUNDS, BUILTIN_TIMER_PRESETS, timerParts, timerText } from './timer.js';

const options = (all, active) => Object.entries(all).map(([id, name]) => option(id, name, active)).join('');
const buttons = (name, act, data = '', classes = '') => '<button class="button '+ classes +'" type="button" data-act="' + act + '" ' + data + '>' + name + '</button>';
const field = (label, scope, key, value, limit = 120) => '<label>' + label + '<input maxlength="' + limit + '" data-' + scope + '="' + key + '" value="' + e(value) + '"></label>';
const inputState = (source, entry) => {
  if (source.type === 'title') return 'Text layer';
  if (source.type === 'scene') return 'Reusable scene';
  if (source.type === 'timer') return 'Shared countdown';
  if (entry?.state === 'error') return 'Input unavailable';
  if (entry?.state === 'loading') return 'Connecting…';
  if (entry?.state === 'ready') return entry.deck ? entry.deck.count + ' slides' : 'Ready';
  return ['camera', 'mic', 'screen'].includes(source.type) ? 'Disconnected' : 'Offline';
};

export function layersPanel(scene, project, state, media) {
  const layers = [...scene.layers].reverse().filter(layer => project.sources.some(source => source.id === layer.source));
  const rows = layers.map((layer, index) => {
    const source = project.sources.find(source => source.id === layer.source);
    const data = 'data-id="' + layer.id + '"';
    return `<div class="layer-row ${layer.id === state.layerId ? 'selected' : ''}">
      <button type="button" class="layer-main" data-act="select-layer" ${data} aria-pressed="${pressed(layer.id === state.layerId)}">${icon(source.type,16)}
        <span><b title="${e(source.name)}">${e(source.name)}</b><small>${e(SOURCES[source.type])} · ${inputState(source, media.get(source.id))}</small></span></button>
      <div class="source-actions">
        ${iconButton('toggle-layer', layer.visible ? 'Hide ' + source.name : 'Show ' + source.name, layer.visible ? 'eye' : 'eyeOff', data, 'aria-pressed="' + pressed(!layer.visible) + '"')}
        ${iconButton('layer-up', 'Move ' + source.name + ' up', 'up', data, index === 0 ? 'disabled' : '')}
        ${iconButton('layer-down', 'Move ' + source.name + ' down', 'down', data, index === layers.length - 1 ? 'disabled' : '')}
      </div></div>`;
  }).join('');
  const layer = scene.layers.find(item => item.id === state.layerId);
  const source = project.sources.find(item => item.id === layer?.source);
  return `<div class="layer-console"><div class="layer-stack">
    <div class="section-label"><h3>${e(scene.name)}</h3><span>${layers.length} ${layers.length === 1 ? 'input' : 'inputs'}</span></div>
    ${rows}
    <div class="layer-row">
      <button type="button" class="layer-main" data-act="scene-edit">${icon('image',16)}
        <span><b>Scene background</b><small>${e(BACKGROUNDS[scene.background])}</small></span></button>
      ${iconButton('scene-edit','Scene background settings','gear')}
    </div>
    ${rows ? '' : `<div class="empty-panel"><p>Add a camera, PowerPoint, or other input to this scene.</p><div class="inspector-tools">${buttons(icon('camera',15) + ' Camera', 'input-camera')}${buttons(icon('powerpoint',15) + ' PowerPoint', 'input-powerpoint')}</div></div>`}
    </div><aside class="inspector" aria-label="Layer properties">${source && layer ? layerInspector(layer, source, media, project) :
      '<div class="section-label"><h3>Layer properties</h3></div><div class="empty-panel">' + icon('layers',20) + '<p>Select a layer to adjust its placement and appearance.</p></div>'}</aside></div>`;
}

function layerInspector(layer, source, media, project) {
  const id = 'data-id="' + layer.id + '"';
  const sourceId = 'data-id="' + source.id + '"';
  const entry = media.get(source.id);
  const capture = ['camera', 'mic', 'screen'].includes(source.type);
  const visuals = VISUAL.has(source.type);
  const connected = entry?.state === 'ready';
  const connect = connected
    ? buttons('Disconnect device', 'disconnect', sourceId)
    : buttons(entry?.state === 'loading' ? 'Connecting…' : 'Connect device', 'connect', sourceId, 'primary-outline');
  return `<div class="section-label"><h3>Layer properties</h3>${iconButton(
      'remove-layer', 'Remove input from this scene only',
      'trash', id)}</div>
    <div class="fieldset">
      ${source.type === 'scene'
        ? '<p class="slide-label">Embedded scene: <strong>' +
          e(project.scenes.find(item => item.id === source.sceneId)?.name ?? 'Missing scene') +
          '</strong>. Its whole composition is shown at this layer’s position. '
          + 'Use the scene editor to change its contents; drag and resize this layer to '
          + 'place it on a TV, classroom display, or whiteboard.</p>'
          + buttons('Edit embedded scene', 'open-embedded-scene', 'data-id="' + e(source.sceneId) + '"')
        : field('Input name', 'source', 'name', source.name)}
      ${source.type === 'title' ? field('Title', 'source', 'text', source.text, 180)
        + field('Subtitle', 'source', 'sub', source.sub, 240) : ''}
      ${source.type === 'timer'
        ? '<p class="slide-label">Live output only: this layer sets the countdown’s style and location whenever this scene is on Program. '
          + 'The countdown is intentionally hidden in private Preview, scene thumbnails and the scene editor. '
          + 'Move or resize its placement using Arrange scene; only the live output shows the running clock.</p>'
          + '<label>Timer style<select data-layer="timerStyle">' + options(TIMER_STYLES,layer.timerStyle || 'digital') + '</select></label>'
          + buttons('Open Classroom timer controls','workspace-tab','data-id="classroom"')
        : ''}
      ${source.type === 'camera' ? '<p class="slide-label">This camera is assigned only to scenes with this input layer. Connecting or disconnecting controls the shared camera source, without adding it to other scenes. Use Camera assignments under Scenes to choose where it appears.</p>' :
          source.type === 'mic' ? '<p class="slide-label">This microphone is one shared audio source. Its mixer channel is active across scene changes.</p>' : ''}
      ${capture ? `<div class="inspector-tools">${connect}
        ${source.type !== 'screen' ? buttons('Device…','change-device',sourceId) : ''}</div>` : ''}
      ${entry?.state === 'error' ? '<p class="warning-note">' + e(entry.message) + '</p>' : ''}
      ${visuals ? `<label>Placement<select data-layer="preset"><option value="">Choose placement</option>
        <option value="full">Full frame</option><option value="slides">Slide panel</option><option value="inset">Presenter inset</option>
        <option value="board">Studio whiteboard</option><option value="title">Lower third</option>
        <option value="graphic">Bottom right</option>
      </select></label>${fields(layer, 'layer')}
      <label>Opacity<input type="range" min="0" max="100" data-layer="opacity" value="${layer.opacity}"></label>
      ${source.type !== 'title' ? `<label>Fit<select data-layer="fit">${options({cover:'Fill frame',contain:'Fit inside frame',stretch:'Stretch'},layer.fit)}</select></label>` : ''}
      ${source.type === 'camera' ? `<label>Camera background<select data-layer="matte">${options({off:'Original camera',chroma:'Green screen / chroma key',person:'Remove background (AI)'},layer.matte)}</select></label>
        ${layer.matte === 'chroma' ? `<label>Key color<input type="color" data-layer="key" value="${layer.key}"></label>` : ''}
        ${layer.matte !== 'off' ? `<label>Subject coverage<select data-layer="coverage">${options({balanced:'Balanced',more:'Keep more',most:'Keep most'},layer.coverage)}</select></label>
          <p class="slide-label" id="matte-status" data-id="${source.id}">${e(media.matteStatus(source.id, layer))}</p>` : ''}
        <label class="inline"><input type="checkbox" data-layer="mirror"${checked(layer.mirror)}> Mirror camera</label>` : ''}
      ` : ''}
      ${entry?.deck ? deckPanel(entry, layer, 'preview') : ''}
      ${source.type === 'powerpoint' && !entry?.deck && entry?.state !== 'error' ? '<p class="slide-label">Reading slides and notes…</p>' : ''}
      ${['audio','video'].includes(source.type) && connected ? `<div class="inspector-tools">${buttons('Play / pause','play-media',sourceId)}
         ${buttons('Restart','restart-media',sourceId)}<span class="slide-label media-clock" data-source-id="${source.id}"></span></div>
         <label class="inline"><input type="checkbox" data-source="loop"${checked(source.loop)}> Loop</label>
         <label class="inline"><input type="checkbox" data-source="autoplay"${checked(source.autoplay)}> Play on take</label>` : ''}
      ${source.type === 'mic' ? '<p class="slide-label">Microphone audio always follows the full Program, including scene transitions.</p>' :
        AUDIO.has(source.type) ? `<label>Audio routing<select data-source="route">${options({scene:'Follow the Program scene',always:'Always in the Program mix'},source.route)}</select></label>` : ''}
    </div>`;
}

export function deckPanel(entry, layer, target, compact = false) {
  if (!entry?.deck) return '';
  const deck = entry.deck;
  const page = Math.min(layer.page, deck.count - 1);
  const note = deck.slides[page]?.notes;
  const frame = entry.frames.get(page);
  const data = 'data-id="' + layer.id + '" data-bus="' + target + '"';
  return `<div class="fieldset deck-controls" data-bus="${target}">
    ${!compact ? '<p class="slide-label">Preview slide controls</p>' : ''}
    <div class="slide-nav">${buttons(icon('left',13) + ' Previous','slide-prev',data + (page === 0 ? ' disabled' : ''))}
      <span class="slide-label mono">Slide ${page + 1} / ${deck.count}</span>
      ${buttons('Next ' + icon('right',13),'slide-next',data + (page >= deck.count - 1 ? ' disabled' : ''))}
    </div>
    ${note ? '<div class="notes" aria-label="Private speaker notes">' + e(note) + '</div>' :
      '<p class="slide-label">No speaker notes for this slide.</p>'}
    ${frame?.error ? '<p class="warning-note">' + e(frame.error) + '</p>' : ''}
    ${frame?.hints?.length ? '<p class="warning-note">Use slideshow capture to play ' + e(frame.hints.join(', ')) + '.</p>' : ''}
  </div>`;
}

export function overlaysPanel(project, preview, live, filter = {search:'',group:'all'}) {
  const groupOptions = '<option value="all">All groups</option>' +
    Object.entries(OVERLAY_GROUPS).map(([id,label])=>option(id,label,filter.group)).join('');
  return '<div class="overlay-library">' +
    '<div class="overlay-library-toolbar">' +
      '<label>Find overlay<input type="search" data-overlay-search autocomplete="off" placeholder="Search name or message" value="' +
        e(filter.search || '') + '"></label>' +
      '<label>Group<select data-overlay-filter>' + groupOptions + '</select></label>' +
      '<span class="overlay-library-count" id="overlay-library-count" aria-live="polite">' +
        project.overlays.length + ' / ' + OVERLAY_LIMIT + ' saved</span>' +
    '</div><div class="keys overlay-library-list">' + project.overlays.map((o, index) => {
    const id = 'data-id="' + o.id + '"';
    const staged = preview.has(o.id) && preview.get(o.id).end === undefined;
    const shown = live.has(o.id) && live.get(o.id).end === undefined;
    const category = o.type === 'emoji' ? 'Emoji'
      : ['image','video','graphic'].includes(o.type)
        ? (o.type === 'video' ? 'Video' : o.type === 'image' ? 'Image' : 'Media') : 'Message';
    const group=overlayGroup(o.group,o.type);
    const search=(o.name+' '+(o.text||'')+' '+(o.sub||'')).toLowerCase();
    return `<article class="overlay-card ${shown ? 'is-live' : ''} ${staged ? 'is-preview' : ''}" data-overlay-group="${e(group)}" data-overlay-terms="${e(search)}">
      <div class="overlay-title">${icon(category.toLowerCase() === 'media' ? 'image' : category.toLowerCase(),17)}
        <span title="${e(o.name)}"><b>${o.type === 'emoji'
          ? '<span class="overlay-emoji-glyph" aria-hidden="true">'+e(o.emoji)+'</span> ' : ''}${e(o.name)}</b><small class="overlay-type-label">${category}</small><small class="overlay-group-label">${e(OVERLAY_GROUPS[group])}</small></span>
        <kbd>${e(overlayShortcutLabel(project,index))}</kbd></div>
      ${iconButton('overlay-edit','Open visual editor for ' + o.name,'gear',id)}
      <div class="overlay-actions">
        ${buttons(staged ? 'Clear preview' : 'Preview','overlay-preview',id + ' aria-pressed="' + pressed(staged) + '"',staged?'cue':'')}
        ${buttons(shown ? 'Hide live' : 'Go live','overlay-live',id + ' aria-pressed="' + pressed(shown) + '"',shown?'on-air':'')}
        ${buttons('Delete','overlay-remove',id)}
      </div>
    </article>`;
  }).join('') + (project.overlays.length ? '' : '<p class="empty-panel">Add an image, video, message or emoji overlay.</p>') + '</div>' +
    '<p class="overlay-library-empty" id="overlay-library-empty" hidden>No overlays match this search or group.</p></div>';
}

export function classroomPanel(project, timer, state, media) {
  const deck = ['program', 'preview'].flatMap(bus => state[bus]
    ? visibleSceneLayers(state[bus]).filter(({source}) => source.type === 'powerpoint'
      && media.get(source.id)?.deck).map(({layer}) => [bus,layer]) : []);
  const time=timerParts(project.timerSeconds);
  const currentScene=state.preview?.scene && project.scenes.find(s=>s.id===state.preview.scene.id);
  const sceneTimer=currentScene?.layers.find(layer=>project.sources.some(source=>source.id===layer.source&&source.type==='timer'));
  const assigned=project.scenes.filter(scene=>scene.layers.some(layer=>project.sources.some(source=>source.id===layer.source&&source.type==='timer'))).length;
  const selectedStyle=sceneTimer?.timerStyle||project.timerStyle||'digital';
  const timerDisplay=timer.remaining < 0 ? '+'+timerText(Math.abs(timer.remaining),project.timerSeconds>=3600)
    : timerText(Math.ceil(timer.remaining),project.timerSeconds>=3600);
  const presetButton=(name,seconds,index=null)=>'<span class="timer-preset-item"><button type="button" class="button timer-preset" data-act="timer-preset" data-id="'+seconds+'">'+e(name)+'</button>'+
    (index===null?'':'<button type="button" class="timer-preset-delete" data-act="timer-preset-delete" data-id="'+index+'" aria-label="Delete '+e(name)+'" title="Delete saved preset">×</button>')+'</span>';
  return `<div class="classroom-tools">
    <section class="class-card timer-designer">
      <div class="timer-designer-heading"><h3>Classroom countdown designer</h3><span class="timer-live-tag">Program only</span></div>
      <p class="timer-program-note">The timer is visible on live Program, never in private Preview or scene editors.</p>
      <div class="timer-scene-assignment">
        <strong>Scene: ${e(currentScene?.name||'No scene selected')}</strong>
        <div class="timer-actions">
          ${buttons(timer.visible?'Hide from live output':'Show on live output','timer-show','','primary-outline')}
          ${currentScene ? buttons(sceneTimer?'Remove timer layout from this scene':'Add timer layout to this scene',
            'timer-assign','',sceneTimer?'':'primary-outline') : ''}
        </div>
        ${sceneTimer?'<span class="timer-scene-hint">Live style: '+e(TIMER_STYLES[selectedStyle])+
          '. Adjust placement in Arrange scene; the timer appears on Program only.</span>':
          '<span class="timer-scene-hint">No scene layout needed: Start displays the timer on Program.</span>'}
        <span class="timer-scene-hint">Custom layout: ${assigned} of ${project.scenes.length} scenes. One clock continues across scenes.</span>
      </div>
      <div class="timer-designer-grid"><div class="timer-main-controls">
      <div class="timer-live-line"><output class="timer-read mono" id="timer-read" role="timer" aria-label="Countdown remaining">${timerDisplay}</output>
        <span id="timer-status" class="timer-status">${timer.deadline?(timer.finished?'Overtime':'Running'):timer.finished?'Finished':'Paused / ready'}</span></div>
      <div class="timer-section-title">Set duration</div>
      <div class="timer-time-fields">
        <label>Hours<input aria-label="Timer hours" type="number" min="0" max="23" step="1" inputmode="numeric" data-timer-time="h" value="${time.h}"></label>
        <span aria-hidden="true">:</span>
        <label>Minutes<input aria-label="Timer minutes" type="number" min="0" max="59" step="1" inputmode="numeric" data-timer-time="m" value="${time.m}"></label>
        <span aria-hidden="true">:</span>
        <label>Seconds<input aria-label="Timer seconds" type="number" min="0" max="59" step="1" inputmode="numeric" data-timer-time="s" value="${time.s}"></label>
      </div>
      <div class="timer-preset-list" aria-label="Quick countdown presets">${BUILTIN_TIMER_PRESETS.map(m=>presetButton(m+' min',m*60)).join('')}</div>
      ${project.timerPresets?.length?'<div class="timer-saved-presets"><span>Saved favorites</span><div class="timer-preset-list">'+project.timerPresets.map((p,i)=>presetButton(p.name,p.seconds,i)).join('')+'</div></div>':''}
      <div class="timer-actions">
        ${buttons(timer.deadline?'Pause':'Start on live output','timer-toggle','','primary-outline')}
        ${buttons('Reset','timer-reset')}
        ${buttons('Save preset…','timer-save-preset')}
      </div>
      <div class="timer-live-adjust">
        <span>Adjust while running</span>
        ${[-60,-30,-10,10,30,60].map(n=>buttons((n>0?'+':'')+n+'s','timer-adjust','data-id="'+n+'"')).join('')}
      </div>
      </div><div class="timer-appearance-controls">
      <div class="timer-section-title">Timer style</div>
      <div class="timer-style-options" aria-label="Countdown appearance">
        ${Object.entries(TIMER_STYLES).map(([id,name])=>'<button type="button" class="timer-style-choice '+(selectedStyle===id?'active':'')+'" aria-pressed="'+(selectedStyle===id)+'" data-act="timer-style" data-id="'+id+'"><span class="timer-style-sample timer-style-'+id+'" aria-hidden="true">'+(id==='traffic'?'🟡':id==='bar'?'▰▰▰':id==='ring'?'◉':id==='fullscreen'?'▣':'05:00')+'</span><span>'+e(name)+'</span></button>').join('')}
      </div>
      <div class="timer-section-title">Appearance &amp; finish</div>
      <div class="timer-config-grid">
        <label>Accent color<input type="color" data-project="timerColor" value="${project.timerColor}"></label>
        <label>Background<select data-project="timerBackground">${options(TIMER_BACKGROUNDS,project.timerBackground)}</select></label>
        <label>Opacity <span id="timer-opacity-read">${project.timerOpacity}%</span><input type="range" min="10" max="100" step="5" data-project="timerOpacity" value="${project.timerOpacity}"></label>
        <label>At zero<select data-project="timerEnd">${options(TIMER_ENDINGS,project.timerEnd)}</select></label>
      </div>
      <div class="timer-checks">
        <label><input type="checkbox" data-project="timerChime" ${checked(project.timerChime)}> Play a finish chime</label>
        <label><input type="checkbox" data-project="timerFlash" ${checked(project.timerFlash)}> Flash the timer when time expires</label>
      </div>
      </div></div>
    </section>
    <section class="class-card"><h3>PowerPoint &amp; speaker notes</h3>
      ${deck.length ? deck.map(([bus, layer]) => '<p><strong>' + (bus === 'program' ? 'Program' : 'Preview') + '</strong></p>'
        + deckPanel(media.get(layer.source), layer, bus, true)).join('') : '<p>Import a deck to cue slides and read notes privately.</p>'}
      <div class="inspector-tools">${buttons(icon('powerpoint',15) + ' Import deck','input-powerpoint')}
        ${buttons(icon('popout',14) + ' Capture slideshow','input-slideshow')}</div></section>
    <section class="class-card"><h3>Classroom tools</h3><p>Open an activity in a new tab and capture it as a screen input.</p>
      <a href="word-cloud-studio.html" target="_blank" rel="noopener">Classroom Response Studio ↗</a>
      <a href="collaboration-canvas.html" target="_blank" rel="noopener">Collaboration Canvas ↗</a></section>
  </div>`;
}

function channel(id, name, gain, mute, titleIcon, description) {
  return `<div class="channel ${id === 'master' ? 'master' : ''}">
    <div class="channel-title"><span>${icon(titleIcon,15)} <b title="${e(name)}">${e(name)}</b></span>
      ${iconButton('audio-mute', (mute ? 'Unmute ' : 'Mute ') + name, mute ? 'mute' : 'volume', 'data-id="' + id + '"', 'aria-pressed="' + pressed(mute) + '"')}</div>
    <div class="channel-meter" aria-hidden="true" data-meter="${id}"><i></i></div>
    ${id === 'master' ? '<div class="meter-scale mono"><span>–60</span><span>–24</span><span>–12</span><span>0 dB</span></div>' : ''}
    <label class="fader"><span class="visually-hidden">${e(name)} gain</span>
      <input type="range" min="-60" max="6" step="1" data-gain="${id}" value="${gain}">
      <output class="mono" data-db="${id}">${formatGain(gain)}</output></label>
    <small>${e(description)}</small>
  </div>`;
}
export const formatGain = gain => (gain === -60 ? '−∞' : gain > 0 ? '+' + gain : gain) + ' dB';
export function mixerPanel(project, media) {
  const sources = project.sources.filter(s => AUDIO.has(s.type));
  return channel('master', 'Program master', project.master, project.masterMute, 'volume', 'All Program audio')
    + sources.map(source => channel(source.id, source.name, source.gain, source.mute, source.type,
      media.get(source.id)?.state !== 'ready' ? 'Offline' :
        source.type === 'screen' && !media.get(source.id).stream?.getAudioTracks().some(track => track.readyState === 'live') ? 'Video only' :
        source.route === 'always' ? 'Always routed' : 'Follows Program')).join('')
    + (sources.length ? '' : '<div class="mix-empty">'+icon('mic',22)+'<p>Add a mic or media to start mixing.</p>'
      + buttons(icon('plus',14) + ' Microphone','input-mic') + '</div>');
}

export { buttons, field, options };
