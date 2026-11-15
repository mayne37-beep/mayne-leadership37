import { VISUAL } from './model.js';
import { transformBox } from './scene-designer.js';
import { e } from './ui.js';

const handles = ['nw','n','ne','e','se','s','sw','w'];
/** Quick visual adjustment directly on the private Preview monitor.
 * The on-air Program canvas is never made interactive or modified here. */
export class InlinePreviewEditor {
  constructor(studio) {
    this.studio = studio;
    this.root = document.getElementById('preview-layer-controls');
    this.stage = this.root.parentElement;
    this.enabled = false;
    this.drag = null;
    this.root.addEventListener('pointerdown', event => this.down(event));
    this.root.addEventListener('pointermove', event => this.move(event));
    this.root.addEventListener('pointerup', event => this.up(event));
    this.root.addEventListener('pointercancel', event => this.up(event));
  }

  toggle() {
    this.enabled = !this.enabled;
    this.root.hidden = !this.enabled;
    const button = document.getElementById('arrange-preview');
    button.setAttribute('aria-pressed', String(this.enabled));
    button.classList.toggle('active', this.enabled);
    this.refresh();
  }

  refresh() {
    if (!this.enabled || this.drag || !this.studio.project) return;
    this.root.innerHTML = this.studio.scene.layers.filter(layer => layer.visible).map(layer => {
      const source = this.studio.source(layer.source);
      if (!source || !VISUAL.has(source.type)) return '';
      return '<div class="inline-preview-target' + (this.studio.layerId === layer.id ? ' selected' : '') +
        '" data-preview-layer="' + layer.id + '" style="left:' + layer.x + '%;top:' + layer.y +
        '%;width:' + layer.w + '%;height:' + layer.h + '%" title="' + e(source.name) + '">' +
        '<span class="inline-preview-tag">' + e(source.name) + '</span>' +
        handles.map(handle => '<span class="inline-preview-handle handle-' + handle +
        '" data-preview-handle="' + handle + '" title="Resize ' + handle + '"></span>').join('') + '</div>';
    }).join('');
  }

  down(event) {
    if (!this.enabled || event.button !== 0) return;
    const target = event.target.closest('[data-preview-layer]');
    if (!target) return;
    const layer = this.studio.scene.layers.find(item => item.id === target.dataset.previewLayer);
    if (!layer) return;
    const handle = event.target.closest('[data-preview-handle]')?.dataset.previewHandle ?? 'move';
    this.studio.layerId = layer.id;
    this.studio.tab = 'layers';
    this.root.querySelectorAll('.inline-preview-target').forEach(node =>
      node.classList.toggle('selected', node.dataset.previewLayer === layer.id));
    this.drag = {
      pointerId: event.pointerId, id: layer.id, handle, sceneId: this.studio.scene.id,
      box: { x: layer.x, y: layer.y, w: layer.w, h: layer.h },
      x: event.clientX, y: event.clientY, node: target, changed: false,
    };
    this.root.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  move(event) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (this.studio.scene.id !== drag.sceneId) return this.up(event);
    const frame = this.stage.getBoundingClientRect();
    if (!frame.width || !frame.height) return;
    const dx = 100 * (event.clientX - drag.x) / frame.width;
    const dy = 100 * (event.clientY - drag.y) / frame.height;
    const geom = transformBox(drag.box, dx, dy, drag.handle, event.shiftKey);
    const layer = this.studio.scene.layers.find(item => item.id === drag.id);
    if (!layer) return;
    Object.assign(layer, geom);
    drag.changed = Object.keys(geom).some(key => geom[key] !== drag.box[key]);
    Object.assign(drag.node.style, {
      left: geom.x + '%', top: geom.y + '%', width: geom.w + '%', height: geom.h + '%',
    });
  }

  up(event) {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    if (this.root.hasPointerCapture(event.pointerId)) this.root.releasePointerCapture(event.pointerId);
    const changed = this.drag.changed;
    this.drag = null;
    if (changed) this.studio.mark();
    this.refresh();
    if (this.studio.tools?.open) this.studio.renderDock();
  }
}
