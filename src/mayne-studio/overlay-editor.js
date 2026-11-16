import { clamp, clone, makeOverlay, OVERLAY_MOTIONS } from './model.js';
import { drawOverlay, drawOverlayStill } from './render.js';
import { transformBox } from './scene-designer.js';
import { discardFile } from './projects.js';
import { e, option } from './ui.js';

const handles = ['nw','n','ne','e','se','s','sw','w'];
const geometry = ['x','y','w','h'];
const numeric = (key, label, d, min, max) => '<label>' + label + '<input data-oe-field="' + key +
  '" type="number" min="' + min + '" max="' + max + '" step=".1" value="' + d[key] + '"></label>';
const select = (label, field, values, chosen) => '<label>' + label + '<select data-oe-field="' + field + '">' +
  Object.entries(values).map(([id, name]) => option(id, name, chosen)).join('') + '</select></label>';

/** An offline design surface. The live Program canvas is never manipulated here. */
export class OverlayEditor {
  constructor(studio) {
    this.studio = studio;
    this.drag = null;
    this.draft = null;
    this.previewStart = null;
    this.dialog = document.createElement('dialog');
    this.dialog.id = 'overlay-editor';
    this.dialog.className = 'overlay-editor';
    this.dialog.setAttribute('aria-labelledby', 'overlay-editor-title');
    this.dialog.innerHTML = '<div class="oe-shell"><header class="oe-head"><div>' +
      '<strong id="overlay-editor-title">Overlay Designer</strong>' +
      '<span>Offline 16:9 workspace · only goes live when you cue it</span></div>' +
      '<div class="oe-head-actions"><button type="button" class="button" data-oe-action="cancel">Cancel</button>' +
      '<button type="button" class="button primary" data-oe-action="save">Save overlay</button></div></header>' +
      '<div class="oe-body"><div class="oe-workspace"><div class="oe-stage" id="oe-stage" tabindex="0"' +
      ' role="group" aria-label="False Program canvas. Drag overlay to move. Drag handles to resize.">' +
      '<canvas id="oe-canvas" width="1280" height="720" aria-label="Reference 16:9 Program scene"></canvas>' +
      '<div class="oe-target" id="oe-target" aria-label="Drag to position overlay"><span class="oe-target-label" id="oe-target-label">Overlay</span>' +
      handles.map(h => '<span class="oe-handle handle-' + h + '" data-oe-handle="' + h +
        '" title="Resize ' + h + '" aria-hidden="true"></span>').join('') +
      '</div></div><div class="oe-hint"><span>Drag to move · drag handles to resize · arrow keys to nudge</span>' +
      '<button type="button" class="button" data-oe-action="preview">▶ Preview pop up/down</button></div>' +
      '</div><aside class="oe-inspector" id="oe-inspector" aria-label="Overlay properties"></aside></div></div>';
    studio.root.append(this.dialog);
    this.stage = this.dialog.querySelector('#oe-stage');
    this.canvas = this.dialog.querySelector('#oe-canvas');
    this.target = this.dialog.querySelector('#oe-target');
    this.inspector = this.dialog.querySelector('#oe-inspector');
    this.dialog.addEventListener('click', event => this.click(event));
    this.dialog.addEventListener('input', event => this.input(event));
    this.dialog.addEventListener('change', event => this.change(event));
    this.dialog.addEventListener('keydown', event => this.keydown(event));
    this.target.addEventListener('pointerdown', event => this.pointerdown(event));
    this.target.addEventListener('pointermove', event => this.pointermove(event));
    this.target.addEventListener('pointerup', event => this.finish(event));
    this.target.addEventListener('pointercancel', event => this.finish(event));
    this.dialog.addEventListener('close', () => {
      // Uploading creates a temporary media record for the editor. Cancel/Escape
      // should not quietly leave an unwanted overlay or large video behind.
      if (this.pendingCreated && !this.committed && this.draft && this.studio.project) {
        const { id, asset } = this.draft;
        this.studio.project.overlays = this.studio.project.overlays.filter(item => item.id !== id);
        this.studio.previewOverlays.delete(id);
        this.studio.liveOverlays.delete(id);
        this.studio.media.dispose('preview:' + id);
        this.studio.media.dispose('program:' + id);
        this.studio.mark();
        this.studio.renderWorkspacePanel();
        if (asset) discardFile(this.studio.project.id, asset).catch(() =>
          this.studio.notify('The canceled overlay file could not be cleaned up from browser storage.', true));
      }
      this.pendingCreated = false;
      this.drag = null;
      this.previewStart = null;
      this.draft = null;
    });
  }

  get open() { return this.dialog.open; }

  show(id = null, type = 'message', pendingCreated = false) {
    const existing = id ? this.studio.overlay(id) : null;
    if (id && !existing) return;
    if (this.open) this.dialog.close();
    this.isNew = !existing || pendingCreated;
    this.pendingCreated = pendingCreated;
    this.committed = false;
    this.draft = clone(existing || makeOverlay(type));
    this.previewStart = null;
    this.dialog.querySelector('#overlay-editor-title').textContent =
      (this.isNew ? 'Create ' : 'Edit ') + this.typeLabel() + ' overlay';
    this.refresh();
    this.dialog.showModal();
    this.stage.focus();
    this.draw(performance.now());
  }

  typeLabel() {
    if (['image','video'].includes(this.draft.type)) return this.draft.type;
    if (this.draft.type === 'graphic') return 'media';
    return 'message';
  }

  refresh() {
    if (!this.draft) return;
    const d = this.draft;
    const message = !['image','video','graphic'].includes(d.type);
    this.inspector.innerHTML =
      '<div class="oe-section"><h3>' + e(this.typeLabel()) + ' settings</h3>' +
      '<label>Overlay name<input data-oe-field="name" maxlength="120" value="' + e(d.name) + '"></label>' +
      (message
        ? '<label>Message text<textarea data-oe-field="text" maxlength="160" rows="3">' + e(d.text) + '</textarea></label>' +
          '<label>Second line (optional)<input data-oe-field="sub" maxlength="160" value="' + e(d.sub) + '"></label>'
        : '<p class="oe-muted">Your image or video will appear at this exact position above the live scene.</p>' +
          '<button type="button" class="button" data-oe-action="replace-media">Replace file</button>' +
          select('Fill behavior','fit',{contain:'Fit entire file',cover:'Fill and crop',stretch:'Stretch'},d.fit ?? 'contain') +
          (d.type === 'video' || d.type === 'graphic'
            ? '<label class="oe-check"><input data-oe-field="loop" type="checkbox" ' +
              (d.loop === false ? '' : 'checked') + '> Loop video while visible</label>' : '')) +
      '</div><div class="oe-section"><h3>Size and position</h3>' +
      '<p class="oe-muted">Percentages of a 1920 × 1080 video frame; drag or enter precise values.</p>' +
      '<div class="oe-numbers">' +
      numeric('x','Left %',d,-100,100) + numeric('y','Top %',d,-100,100) +
      numeric('w','Width %',d,1,200) + numeric('h','Height %',d,1,200) + '</div>' +
      '<div class="oe-presets">' +
      '<button type="button" class="button" data-oe-action="center">Center</button>' +
      '<button type="button" class="button" data-oe-action="bottom">Lower third</button>' +
      '<button type="button" class="button" data-oe-action="reset">Default size</button></div>' +
      '<label>Opacity <input type="range" min="0" max="100" step="1" data-oe-field="opacity" value="' +
      (d.opacity ?? 100) + '"><output id="oe-opacity">' + (d.opacity ?? 100) + '%</output></label></div>' +
      '<div class="oe-section"><h3>Appear and disappear</h3>' +
      select('Pop up / entrance','animation',OVERLAY_MOTIONS,d.animation) +
      select('Pop down / exit','exitAnimation',OVERLAY_MOTIONS,d.exitAnimation ?? d.animation) +
      '<label>Auto-hide after (seconds)<input type="number" min="0" max="3600" step="1"' +
      ' data-oe-field="seconds" value="' + d.seconds + '"></label>' +
      '<p class="oe-muted">0 stays on air until you click Hide live. The animation restarts every time you show it.</p></div>';
    this.updateTarget();
  }

  updateTarget() {
    if (!this.draft) return;
    const d = this.draft;
    Object.assign(this.target.style,{left:d.x+'%',top:d.y+'%',width:d.w+'%',height:d.h+'%'});
    this.dialog.querySelector('#oe-target-label').textContent = d.name || 'Overlay';
    for (const field of this.inspector.querySelectorAll('[data-oe-field]'))
      if (geometry.includes(field.dataset.oeField)) field.value = d[field.dataset.oeField];
  }

  draw(now) {
    if (!this.open || !this.draft || !this.studio.program) return;
    this.studio.renderer.thumbnail(this.canvas, this.studio.program.scene,
      this.studio.program.sources, now, this.studio.program.scenes,
      {...this.studio.timer,config:this.studio.project});
    const ctx = this.canvas.getContext('2d');
    ctx.save();
    ctx.scale(this.canvas.width / 1920, this.canvas.height / 1080);
    if (this.previewStart !== null) {
      const elapsed = now - this.previewStart;
      if (elapsed > 2800) this.previewStart = null;
      else {
        const active = {overlay:{...this.draft,id:'preview:'+this.draft.id},start:this.previewStart};
        if (elapsed > 1700) active.end = this.previewStart + 1700;
        drawOverlay(ctx,this.studio.media,active,now);
      }
    } else drawOverlayStill(ctx,this.studio.media,this.draft,now);
    ctx.restore();
  }

  save() {
    if (!this.draft) return;
    const d = this.draft;
    if (!d.name.trim()) { this.studio.notify('Enter an overlay name.',true); return; }
    if (['image','video','graphic'].includes(d.type) && !d.asset) {
      this.studio.notify('Upload a file before saving.',true); return;
    }
    const existing = this.studio.overlay(d.id);
    if (existing) Object.assign(existing,clone(d));
    else {
      if (this.studio.project.overlays.length >= 8) {
        this.studio.notify('This project already has eight overlay slots.',true); return;
      }
      this.studio.project.overlays.push(clone(d));
    }
    this.committed = true;
    this.dialog.close();
    this.studio.mark();
    this.studio.renderWorkspacePanel();
    this.studio.notify('Overlay saved. Preview or Go live from the Overlays tab.');
  }

  click(event) {
    const button = event.target.closest('[data-oe-action]');
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.oeAction;
    if (action === 'cancel') { this.dialog.close(); return; }
    if (action === 'save') { this.save(); return; }
    if (action === 'preview') {
      this.previewStart = performance.now();
      if (['video','graphic'].includes(this.draft.type)) this.studio.media.playGraphic('preview:'+this.draft.id);
      return;
    }
    if (action === 'replace-media') {
      const kind = this.draft.type === 'graphic' ? 'overlay-media' : 'overlay-' + this.draft.type;
      const id = this.draft.id;
      // Keep the edited position and motion settings when replacing media.
      this.save();
      if (this.committed) this.studio.pickFile(kind,{id});
      return;
    }
    const d = this.draft;
    if (action === 'center') { d.x = Math.round((100-d.w)/2); d.y = Math.round((100-d.h)/2); }
    else if (action === 'bottom') Object.assign(d,{x:5,y:79,w:50,h:16});
    else if (action === 'reset') Object.assign(d,['image','video','graphic'].includes(d.type)
      ? {x:68,y:66,w:27,h:29} : {x:22,y:6,w:56,h:12});
    else return;
    this.updateTarget();
    this.draw(performance.now());
  }

  input(event) {
    const field = event.target.dataset.oeField;
    if (!this.draft || !field || geometry.includes(field)) return;
    if (['name','text','sub'].includes(field)) {
      this.draft[field] = event.target.value.slice(0,field === 'name' ? 120 : 160);
      if (field === 'name') this.updateTarget();
    } else if (field === 'opacity') {
      this.draft.opacity = Number(event.target.value);
      this.inspector.querySelector('#oe-opacity').textContent = this.draft.opacity+'%';
    }
    this.draw(performance.now());
  }

  change(event) {
    const field = event.target.dataset.oeField;
    if (!this.draft || !field) return;
    if (geometry.includes(field)) {
      const target = event.target;
      const n = Number(target.value);
      if (target.value.trim() !== '' && Number.isFinite(n))
        this.draft[field] = clamp(n,Number(target.min),Number(target.max),this.draft[field]);
      this.updateTarget();
    } else if (field === 'seconds') {
      this.draft.seconds = clamp(Number(event.target.value),0,3600,0);
      event.target.value = this.draft.seconds;
    } else if (field === 'loop') this.draft.loop = event.target.checked;
    else if (['animation','exitAnimation','fit'].includes(field)) this.draft[field] = event.target.value;
    this.draw(performance.now());
  }

  keydown(event) {
    event.stopPropagation();
    if (event.target.closest('input,textarea,select,button')) return;
    const delta = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if (!delta || !this.draft) return;
    const size = event.shiftKey ? 5 : 1;
    Object.assign(this.draft,transformBox(this.draft,delta[0]*size,delta[1]*size));
    this.updateTarget();
    event.preventDefault();
  }

  pointerdown(event) {
    if (event.button !== 0 || !this.draft) return;
    const handle = event.target.closest('[data-oe-handle]')?.dataset.oeHandle || 'move';
    this.drag = {id:event.pointerId,handle,x:event.clientX,y:event.clientY,
      box:{x:this.draft.x,y:this.draft.y,w:this.draft.w,h:this.draft.h}};
    this.target.setPointerCapture(event.pointerId);
    this.stage.focus({preventScroll:true});
    event.preventDefault();
  }

  pointermove(event) {
    const d = this.drag;
    if (!d || d.id !== event.pointerId || !this.draft) return;
    const frame = this.stage.getBoundingClientRect();
    if (!frame.width || !frame.height) return;
    Object.assign(this.draft,transformBox(d.box,100*(event.clientX-d.x)/frame.width,
      100*(event.clientY-d.y)/frame.height,d.handle,event.shiftKey));
    this.updateTarget();
  }

  finish(event) {
    if (!this.drag || this.drag.id !== event.pointerId) return;
    if (this.target.hasPointerCapture(event.pointerId)) this.target.releasePointerCapture(event.pointerId);
    this.drag = null;
    this.updateTarget();
  }
}
