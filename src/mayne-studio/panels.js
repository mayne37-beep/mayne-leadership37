import { AUDIO, BACKGROUNDS, clock, OVERLAYS, SHORTCUTS, SOURCES, VISUAL } from './model.js';
import { checked, e, fields, icon, iconButton, option, pressed } from './ui.js';
import { shortcutLabel } from './shortcuts.js';

const options = (all, active) => Object.entries(all).map(([id, name]) => option(id, name, active)).join('');
const buttons = (name, act, data = '', classes = '') => '<button class="button '+ classes +'" type="button" data-act="' + act + '" ' + data + '>' + name + '</button>';
const field = (label, scope, key, value, limit = 120) => '<label>' + label + '<input maxlength="' + limit + '" data-' + scope + '="' + key + '" value="' + e(value) + '"></label>';
const inputState = (source, entry) => {
  if (source.type === 'title') return 'Text layer';
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
    </div><aside class="inspector" aria-label="Layer properties">${source && layer ? layerInspector(layer, source, media) :
      '<div class="section-label"><h3>Layer properties</h3></div><div class="empty-panel">' + icon('layers',20) + '<p>Select a layer to adjust its placement and appearance.</p></div>'}</aside></div>`;
}

function layerInspector(layer, source, media) {
  const id = 'data-id="' + layer.id + '"';
  const sourceId = 'data-id="' + source.id + '"';
  const entry = media.get(source.id);
  const capture = ['camera', 'mic', 'screen'].includes(source.type);
  const visuals = VISUAL.has(source.type);
  const connected = entry?.state === 'ready';
  const connect = connected ? buttons('Disconnect', 'disconnect', sourceId)
    : buttons(entry?.state === 'loading' ? 'Connecting…' : 'Connect input', 'connect', sourceId, 'primary-outline');
  return `<div class="section-label"><h3>Layer properties</h3>${iconButton('remove-layer','Remove layer','trash',id)}</div>
    <div class="fieldset">
      ${field('Input name', 'source', 'name', source.name)}
      ${source.type === 'title' ? field('Title', 'source', 'text', source.text, 180)
        + field('Subtitle', 'source', 'sub', source.sub, 240) : ''}
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
      ${AUDIO.has(source.type) ? `<label>Audio routing<select data-source="route">${options({scene:'Follow the Program scene',always:'Always in the Program mix'},source.route)}</select></label>` : ''}
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

export function overlaysPanel(project, preview, live) {
  return '<div class="keys">' + project.overlays.map((o, index) => {
    const id = 'data-id="' + o.id + '"';
    const staged = preview.has(o.id) && preview.get(o.id).end === undefined;
    const shown = live.has(o.id) && live.get(o.id).end === undefined;
    const category = ['image','video','graphic'].includes(o.type)
      ? (o.type === 'video' ? 'Video' : o.type === 'image' ? 'Image' : 'Media') : 'Message';
    return `<article class="overlay-card ${shown ? 'is-live' : ''} ${staged ? 'is-preview' : ''}">
      <div class="overlay-title">${icon(category.toLowerCase() === 'media' ? 'image' : category.toLowerCase(),17)}
        <span title="${e(o.name)}"><b>${e(o.name)}</b><small class="overlay-type-label">${category}</small></span>
        <kbd>${e(shortcutLabel(project.shortcuts?.['overlay' + index] ?? ''))}</kbd></div>
      ${iconButton('overlay-edit','Open visual editor for ' + o.name,'gear',id)}
      <div class="overlay-actions">
        ${buttons(staged ? 'Clear preview' : 'Preview','overlay-preview',id + ' aria-pressed="' + pressed(staged) + '"',staged?'cue':'')}
        ${buttons(shown ? 'Hide live' : 'Go live','overlay-live',id + ' aria-pressed="' + pressed(shown) + '"',shown?'on-air':'')}
        ${buttons('Delete','overlay-remove',id)}
      </div>
    </article>`;
  }).join('') + (project.overlays.length ? '' : '<p class="empty-panel">Add a graphic or text overlay.</p>') + '</div>';
}

export function classroomPanel(project, timer, state, media) {
  const deck = ['program', 'preview'].flatMap(bus => state[bus]?.scene.layers
    .filter(layer => layer.visible && media.get(layer.source)?.deck)
    .map(layer => [bus, layer]) ?? []);
  return `<div class="classroom-tools">
    <section class="class-card"><h3>Countdown timer</h3><span class="timer-read mono" id="timer-read">${clock(Math.ceil(timer.remaining))}</span>
      <label>Duration in seconds<input type="number" min="1" max="5400" data-project="timerSeconds" value="${project.timerSeconds}"></label>
      <div class="timer-actions">${buttons(timer.deadline ? 'Pause' : 'Start on air', 'timer-toggle', '', 'primary-outline')}
        ${buttons('Reset','timer-reset')}${buttons(timer.visible ? 'Hide' : 'Show on air', 'timer-show')}</div></section>
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
