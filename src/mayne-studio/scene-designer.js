import { VISUAL, clamp, clone, uid } from './model.js';
import { e } from './ui.js';

const round = value => Math.round(value * 10) / 10;
const limits = (value, min, max) => round(Math.max(min, Math.min(max, value)));

/** Convert pointer movement (percentage of the 16:9 canvas) into valid layer geometry.
 * Keep the opposite edge anchored when resizing from the north or west. */
export function transformBox(box, dx, dy, handle = 'move', snap = false) {
  const step = value => snap ? Math.round(value / 2) * 2 : round(value);
  const x = Number(box.x), y = Number(box.y);
  const right = x + Number(box.w), bottom = y + Number(box.h);
  let left = x, top = y, r = right, b = bottom;
  if (handle === 'move') {
    return { x: limits(step(x + dx), -100, 100), y: limits(step(y + dy), -100, 100),
      w: limits(box.w, 1, 200), h: limits(box.h, 1, 200) };
  }
  if (handle.includes('w')) left = limits(step(x + dx), Math.max(-100, right - 200), Math.min(100, right - 1));
  if (handle.includes('e')) r = limits(step(right + dx), left + 1, left + 200);
  if (handle.includes('n')) top = limits(step(y + dy), Math.max(-100, bottom - 200), Math.min(100, bottom - 1));
  if (handle.includes('s')) b = limits(step(bottom + dy), top + 1, top + 200);
  return { x: left, y: top, w: limits(r - left, 1, 200), h: limits(b - top, 1, 200) };
}

const numberField = (key, label, value) => '<label>' + label +
  '<input type="number" data-designer-field="' + key + '" min="' + ('xy'.includes(key) ? '-100' : '1') +
  '" max="' + ('xy'.includes(key) ? '100' : '200') + '" step="0.1" value="' + value + '"></label>';

const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export class SceneDesigner {
  constructor(studio) {
    this.studio = studio;
    this.snap = true;
    this.drag = null;
    this.dialog = document.createElement('dialog');
    this.dialog.id = 'scene-designer';
    this.dialog.className = 'scene-designer';
    this.dialog.setAttribute('aria-labelledby', 'designer-heading');
    this.dialog.innerHTML = '<div class="designer-shell">' +
      '<header class="designer-head"><div><strong id="designer-heading">Scene Designer</strong>' +
      '<span id="designer-scene-name"></span></div>' +
      '<label class="designer-snap"><input id="designer-snap" type="checkbox" checked> Snap to 2% grid</label>' +
      '<button class="button primary" type="button" data-designer-action="close">Done editing</button></header>' +
      '<div class="designer-body"><div class="designer-workspace">' +
      '<div class="designer-stage" id="designer-stage"><canvas id="designer-canvas" width="1280" height="720" aria-label="Scene design preview"></canvas>' +
      '<div class="designer-targets" id="designer-targets" aria-label="Move or resize visible scene layers"></div></div>' +
      '<p class="designer-hint">Drag an item to move it. Drag its handles to resize. ' +
      'Use arrow keys to nudge the selected layer, or Shift + arrow keys for larger moves. ' +
      'Only Preview is edited; Program changes after you take the scene.</p></div>' +
      '<aside class="designer-sidebar" aria-label="Scene layers and geometry">' +
      '<div class="designer-section"><h3>Scene composition</h3><div class="designer-actions">' +
      '<button type="button" data-designer-action="add-input">Add input</button>' +
      '<button type="button" data-designer-action="background">Background settings</button></div></div>' +
      '<div class="designer-section"><h3>Layer order <small>Top first</small></h3><div id="designer-list" class="designer-layer-list"></div></div>' +
      '<div class="designer-section"><h3>Selected layer</h3><div id="designer-properties"></div></div>' +
      '</aside></div></div>';
    studio.root.append(this.dialog);
    this.canvas = this.dialog.querySelector('#designer-canvas');
    this.targets = this.dialog.querySelector('#designer-targets');
    this.stage = this.dialog.querySelector('#designer-stage');
    this.stage.tabIndex = 0;
    this.stage.setAttribute('role', 'group');
    this.stage.setAttribute('aria-label', 'Scene design canvas. Select a layer to move it with arrow keys.');
    this.list = this.dialog.querySelector('#designer-list');
    this.properties = this.dialog.querySelector('#designer-properties');
    this.dialog.addEventListener('click', event => this.click(event));
    this.dialog.addEventListener('change', event => this.change(event));
    this.dialog.addEventListener('keydown', event => this.keydown(event));
    this.targets.addEventListener('pointerdown', event => this.pointerdown(event));
    this.targets.addEventListener('pointermove', event => this.pointermove(event));
    this.targets.addEventListener('pointerup', event => this.finish(event));
    this.targets.addEventListener('pointercancel', event => this.finish(event));
    this.dialog.addEventListener('close', () => { this.drag = null; });
  }

  get open() { return this.dialog.open; }

  show() {
    if (this.open) return;
    this.refresh();
    this.dialog.showModal();
    this.stage.focus();
    this.draw(performance.now());
  }

  draw(now) {
    if (!this.open || !this.studio.project) return;
    this.studio.renderer.thumbnail(this.canvas, this.studio.scene,
      this.studio.shot(this.studio.scene, false).sources, now);
  }

  refresh() {
    if (!this.studio.project) return;
    const scene = this.studio.scene;
    this.dialog.querySelector('#designer-scene-name').textContent = scene.name;
    this.targets.innerHTML = scene.layers.filter(layer => layer.visible).map(layer => {
      const source = this.studio.source(layer.source);
      if (!source || !VISUAL.has(source.type)) return '';
      return '<div class="designer-target' + (layer.id === this.studio.layerId ? ' selected' : '') +
        '" data-target="' + layer.id + '" style="left:' + layer.x + '%;top:' + layer.y +
        '%;width:' + layer.w + '%;height:' + layer.h + '%"><span class="designer-tag">' +
        e(source.name) + '</span>' + handles.map(handle =>
          '<span class="designer-handle handle-' + handle + '" data-handle="' + handle +
          '" title="Resize ' + handle + '"></span>').join('') + '</div>';
    }).join('');
    this.list.innerHTML = [...scene.layers].reverse().map(layer => {
      const source = this.studio.source(layer.source);
      if (!source) return '';
      return '<div class="designer-layer-row' + (layer.id === this.studio.layerId ? ' selected' : '') + '">' +
        '<button type="button" class="designer-layer-pick" data-designer-action="pick" data-id="' + layer.id +
        '" aria-pressed="' + (layer.id === this.studio.layerId) + '">' + e(source.name) + '</button>' +
        '<button type="button" data-designer-action="visibility" data-id="' + layer.id +
        '" title="' + (layer.visible ? 'Hide layer' : 'Show layer') + '" aria-label="' +
        (layer.visible ? 'Hide ' : 'Show ') + e(source.name) + '">' + (layer.visible ? '◉' : '○') + '</button>' +
        '</div>';
    }).join('') || '<p class="designer-empty">No layers yet. Add a camera, PowerPoint, image, or text in Layers & inputs.</p>';
    const layer = this.studio.layer;
    const source = layer && this.studio.source(layer.source);
    this.properties.innerHTML = source ? '<p class="designer-selected-name">' + e(source.name) + '</p>' +
      '<div class="designer-numbers">' +
      numberField('x', 'X %', layer.x) + numberField('y', 'Y %', layer.y) +
      numberField('w', 'Width %', layer.w) + numberField('h', 'Height %', layer.h) +
      '</div><div class="designer-actions">' +
      '<button type="button" data-designer-action="front">Move forward</button>' +
      '<button type="button" data-designer-action="back">Move backward</button>' +
      '<button type="button" data-designer-action="duplicate">Duplicate layer</button>' +
      '<button type="button" data-designer-action="reset">Fill frame</button></div>' +
      '<p class="designer-note">Width and height are percentages of the 1920 × 1080 frame. ' +
      'Edit source effects, green screen, and slide settings in Layers & inputs.</p>' :
      '<p class="designer-empty">Select a layer on the canvas or in the list.</p>';
  }

  select(id) {
    if (!this.studio.scene.layers.some(layer => layer.id === id)) return;
    this.studio.layerId = id;
    this.studio.tab = 'layers';
    this.studio.renderDock();
    this.refresh();
  }

  changed() {
    this.studio.mark();
    this.studio.renderDock();
    this.refresh();
  }

  click(event) {
    const control = event.target.closest('[data-designer-action]');
    if (!control) return;
    event.preventDefault();
    const { designerAction: action, id } = control.dataset;
    if (action === 'close') { this.dialog.close(); return; }
    if (action === 'add-input') { this.dialog.close(); this.studio.inputMenu(); return; }
    if (action === 'background') { this.dialog.close(); this.studio.sceneDialog(false); return; }
    if (action === 'pick') { this.select(id); return; }
    const scene = this.studio.scene;
    const layer = action === 'visibility' ? scene.layers.find(item => item.id === id) : this.studio.layer;
    if (!layer) return;
    if (action === 'visibility') layer.visible = !layer.visible;
    else if (action === 'front' || action === 'back') {
      this.studio.move(scene.layers, scene.layers.indexOf(layer), action === 'front' ? 1 : -1);
    } else if (action === 'reset') Object.assign(layer, { x: 0, y: 0, w: 100, h: 100 });
    else if (action === 'duplicate') {
      if (scene.layers.length >= 40) { this.studio.notify('This scene already has 40 layers.', true); return; }
      const copy = { ...clone(layer), id: uid(), x: limits(layer.x + 3, -100, 100),
        y: limits(layer.y + 3, -100, 100) };
      scene.layers.splice(scene.layers.indexOf(layer) + 1, 0, copy);
      this.studio.layerId = copy.id;
    } else return;
    this.changed();
  }

  change(event) {
    const target = event.target;
    if (target.id === 'designer-snap') { this.snap = target.checked; return; }
    const axis = target.dataset.designerField;
    const layer = this.studio.layer;
    if (!axis || !layer || !['x', 'y', 'w', 'h'].includes(axis)) return;
    const value = Number(target.value);
    if (!Number.isFinite(value) || target.value.trim() === '') { this.refresh(); return; }
    layer[axis] = limits(value, Number(target.min), Number(target.max));
    this.changed();
  }

  keydown(event) {
    event.stopPropagation(); // Never trigger live switcher shortcuts while the designer is open.
    if (event.target.closest('input,button,select,textarea')) return;
    const offsets = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] };
    const offset = offsets[event.key], layer = this.studio.layer;
    if (!offset || !layer) return;
    const size = event.shiftKey ? 5 : 1;
    Object.assign(layer, transformBox(layer, offset[0] * size, offset[1] * size));
    this.changed();
    event.preventDefault();
  }

  pointerdown(event) {
    if (event.button !== 0) return;
    const element = event.target.closest('[data-target]');
    if (!element) return;
    const layer = this.studio.scene.layers.find(item => item.id === element.dataset.target);
    if (!layer) return;
    const handle = event.target.closest('[data-handle]')?.dataset.handle || 'move';
    if (this.studio.layerId !== layer.id) {
      this.studio.layerId = layer.id;
      this.studio.tab = 'layers';
      this.studio.renderDock();
      this.targets.querySelectorAll('.designer-target').forEach(item =>
        item.classList.toggle('selected', item.dataset.target === layer.id));
    }
    this.drag = { id: layer.id, handle, geometry: { x: layer.x, y: layer.y, w: layer.w, h: layer.h },
      clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId, element, moved: false };
    this.targets.setPointerCapture(event.pointerId);
    this.stage.focus({ preventScroll: true });
    event.preventDefault();
  }

  pointermove(event) {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = this.stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const dx = 100 * (event.clientX - drag.clientX) / bounds.width;
    const dy = 100 * (event.clientY - drag.clientY) / bounds.height;
    const box = transformBox(drag.geometry, dx, dy, drag.handle, this.snap);
    const layer = this.studio.scene.layers.find(item => item.id === drag.id);
    if (!layer) return;
    Object.assign(layer, box);
    drag.moved = Object.keys(box).some(key => box[key] !== drag.geometry[key]);
    Object.assign(drag.element.style, {
      left: box.x + '%', top: box.y + '%', width: box.w + '%', height: box.h + '%',
    });
    for (const field of this.properties.querySelectorAll('[data-designer-field]')) {
      field.value = box[field.dataset.designerField];
    }
  }

  finish(event) {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    const moved = this.drag.moved;
    if (this.targets.hasPointerCapture(event.pointerId)) this.targets.releasePointerCapture(event.pointerId);
    this.drag = null;
    if (moved) this.studio.mark();
    this.studio.renderDock();
    this.refresh();
  }
}
