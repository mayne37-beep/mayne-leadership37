import { WIDTH, HEIGHT, VISUAL, clock, transitionProgress } from './model.js';
import { paintTransition } from './transitions.js';
import { timerText } from './timer.js';
import { DEFAULT_EMOJI, findEmoji } from './emojis.js';
import { paintMessageOverlay } from './message-styles.js';

const W = WIDTH, H = HEIGHT;
const stills = {
  studio: '/assets/mayne-studio/training-studio.webp',
  office: '/assets/live-classroom-backgrounds/office.jpg',
  reading: '/assets/live-classroom-backgrounds/reading-room.jpg',
};
const ink = '#0b111c';
const white = '#f5f6fa';
const accent = '#ffa975';
const font = '"Segoe UI", Arial, sans-serif';

function rect(ctx, x, y, w, h, color, radius = 0) {
  ctx.fillStyle = color;
  if (!radius) { ctx.fillRect(x, y, w, h); return; }
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(radius, w / 2, h / 2));
  ctx.fill();
}
function text(ctx, value, x, y, size, { color = white, weight = 600, width = W, align = 'left' } = {}) {
  if (!value) return;
  ctx.fillStyle = color;
  ctx.font = weight + ' ' + Math.round(size) + 'px ' + font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x, y, width);
}
function gradient(ctx, colors, start = [0, 0], end = [W, H]) {
  const fill = ctx.createLinearGradient(...start, ...end);
  colors.forEach(([stop, color]) => fill.addColorStop(stop, color));
  return fill;
}
function position(box) {
  return [W * box.x / 100, H * box.y / 100, W * box.w / 100, H * box.h / 100];
}
function canvas(width = W, height = H) {
  const node = document.createElement('canvas');
  node.width = width;
  node.height = height;
  return node;
}

export function drawImage(ctx, image, x, y, w, h, fit = 'cover', mirror = false) {
  const width = image.videoWidth || image.naturalWidth || image.displayWidth || image.width;
  const height = image.videoHeight || image.naturalHeight || image.displayHeight || image.height;
  if (!width || !height) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (mirror) { ctx.translate(x * 2 + w, 0); ctx.scale(-1, 1); }
  if (fit === 'stretch') ctx.drawImage(image, x, y, w, h);
  else {
    const scale = fit === 'contain' ? Math.min(w / width, h / height) : Math.max(w / width, h / height);
    const sw = width * scale, sh = height * scale;
    ctx.drawImage(image, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh);
  }
  ctx.restore();
}

function drawBackground(ctx, media, scene) {
  rect(ctx, 0, 0, W, H, scene.background === 'black' ? '#030508' : ink);
  const photo = scene.background === 'custom' ? media.photo(scene.backdrop, true) : media.photo(stills[scene.background]);
  if (photo) drawImage(ctx, photo, 0, 0, W, H);
  else if (scene.background !== 'black') {
    rect(ctx, 0, 0, W, H, gradient(ctx, [[0, '#0c1324'], [.68, '#152441'], [1, '#1f3c53']]));
    ctx.strokeStyle = '#9ed2e91e';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(W * 0.109 + 1200, H * 0.38, 120 + 115 * i, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function brand(ctx, x, y, scale = 1, caption = 'MAYNE LEADERSHIP') {
  rect(ctx, x, y - 22 * scale, 48 * scale, 44 * scale, accent, 9 * scale);
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(x + 16 * scale, y - 10 * scale);
  ctx.lineTo(x + 34 * scale, y);
  ctx.lineTo(x + 16 * scale, y + 10 * scale);
  ctx.closePath();
  ctx.fill();
  text(ctx, caption, x + 66 * scale, y, 30 * scale, { color: '#f6e9dc', weight: 700 });
}

function stageTitle(ctx, title, subtitle, template) {
  const x = 120;
  if (template === 'presenter') {
    if (!title && !subtitle) return;
    rect(ctx, 0, H - 365, W, 365, gradient(ctx, [[0, '#0b111c00'], [1, '#080d18f2']], [0, H - 365], [0, H]));
    rect(ctx, x, 843, 62, 7, accent, 3);
    text(ctx, title, x, 909, 70, { width: W - 240, weight: 700 });
    text(ctx, subtitle, x, 977, 33, { color: '#dbe3ec', width: W - 240, weight: 450 });
    return;
  }
  rect(ctx, 0, 0, W, H, gradient(ctx, [[0, '#0a1020fa'], [.49, '#0b132be8'], [1, '#10233a8a']]));
  brand(ctx, x, 125);
  rect(ctx, x, 377, 94, 7, accent, 3);
  text(ctx, title, x, 480, 106, { width: W * .86, weight: 680 });
  text(ctx, subtitle, x, 624, 40, { width: W * .84, color: '#c4d0df', weight: 450 });
  ctx.strokeStyle = '#deedff30';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(120, H - 136);
  ctx.lineTo(W - 120, H - 136);
  ctx.stroke();
  if (template === 'standby') {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(x + 10, H - 88, 7, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, 'STANDBY', x + 32, H - 88, 25, { color: '#e1d5cb', weight: 680 });
  }
}

function placeholder(ctx, label, x, y, w, h) {
  rect(ctx, x, y, w, h, '#101827e0', 15);
  ctx.save();
  ctx.strokeStyle = '#7385a26f';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 9]);
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, w - 2, h - 2, 14);
  ctx.stroke();
  ctx.restore();
  text(ctx, label, x + w / 2, y + h / 2, Math.min(34, h * .35), { align: 'center', color: '#c5d2e2', width: w * .78 });
}

function drawScene(ctx, medium, shot, now, preview, visited = new Set(), timer = null) {
  const { scene, sources } = shot;
  if (!scene || visited.has(scene.id) || visited.size >= 10) return;
  const path = new Set(visited);
  path.add(scene.id);
  drawBackground(ctx, medium, scene);
  const layers = scene.layers.filter(layer => layer.visible);
  const deck = layers.some(layer => ['powerpoint', 'screen', 'image'].includes(sources.get(layer.source)?.type));
  const camera = layers.some(layer => sources.get(layer.source)?.type === 'camera');
  if (scene.template === 'slides') {
    if (preview && !deck) placeholder(ctx, 'Add slides or a screen share', 96, 108, 1267, 810);
    if (preview && !camera) placeholder(ctx, 'Add a camera', 1421, 572, 422, 389);
    if (!preview && !deck && !camera) stageTitle(ctx, scene.title, scene.caption, scene.template);
  }
  if (['standby', 'discussion', 'activity', 'break'].includes(scene.template)) stageTitle(ctx, scene.title, scene.caption, scene.template);
  for (const layer of layers) {
    const source = sources.get(layer.source);
    // Timer layers only describe the live on-air layout. They are never
    // rendered as part of a scene, Preview, thumbnail, or editor canvas.
    if (!source || !VISUAL.has(source.type) || source.type === 'timer') continue;
    const bounds = position(layer);
    const [x, y, w, h] = bounds;
    ctx.save();
    ctx.globalAlpha *= layer.opacity / 100;
    if (source.type === 'scene') {
      const child = shot.scenes?.get(source.sceneId);
      if (child && !path.has(child.id)) {
        // Render an entire reusable composition into the selected rectangle.
        // A whiteboard or TV can be any aspect ratio, with either a letterboxed
        // 16:9 scene, cropped scene, or scene stretched to its layer bounds.
        ctx.beginPath();
        ctx.rect(x,y,w,h);
        ctx.clip();
        rect(ctx,x,y,w,h,'#030508');
        const scale = layer.fit === 'stretch' ? [w / W,h / H]
          : [layer.fit === 'cover' ? Math.max(w / W,h / H) : Math.min(w / W,h / H),
            layer.fit === 'cover' ? Math.max(w / W,h / H) : Math.min(w / W,h / H)];
        ctx.translate(x + (w - W * scale[0]) / 2,y + (h - H * scale[1]) / 2);
        ctx.scale(scale[0],scale[1]);
        drawScene(ctx,medium,{...shot,scene:child},now,preview,path,timer);
      } else if (preview) placeholder(ctx,source.name,x,y,w,h);
    } else if (source.type === 'title') {
      rect(ctx, x, y, w, h, '#0a111ee6', 10);
      rect(ctx, x, y, 9, h, accent, 4);
      text(ctx, source.text, x + 32, y + h * (source.sub ? .38 : .5), h * .37, { width: w * .9, weight: 700 });
      text(ctx, source.sub, x + 32, y + h * .75, h * .2, { width: w * .9, color: '#d8e2ee' });
    } else {
      const image = medium.drawable(source, layer, now);
      if (image) {
        if (scene.template === 'slides' && ['powerpoint', 'screen'].includes(source.type)) {
          rect(ctx, x - 5, y - 5, w + 10, h + 10, '#c3daea75', 8);
          rect(ctx, x, y, w, h, '#101522');
        }
        drawImage(ctx, image, ...bounds, layer.fit, layer.mirror);
      } else if (preview && (source.type !== 'camera' || layer.matte === 'off' || !medium.get(source.id)?.element)) {
        placeholder(ctx, source.name, ...bounds);
      }
    }
    ctx.restore();
  }
  if (scene.template === 'presenter' || scene.template === 'blank') stageTitle(ctx, scene.title, scene.caption, 'presenter');
}

function overlayMotion(ctx, box, motion, progress) {
  let [x, y, w, h] = box;
  if (motion === 'slide') y += H * .1 * (1 - progress);
  else if (motion === 'slide-down') y -= H * .1 * (1 - progress);
  else if (motion === 'slide-left') x += W * .09 * (1 - progress);
  else if (motion === 'slide-right') x -= W * .09 * (1 - progress);
  else if (motion === 'pop') {
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(.7 + .3 * progress, .7 + .3 * progress);
    x = -w / 2;
    y = -h / 2;
  }
  return [x, y, w, h];
}

/**
 * Render an independent overlay on the Preview or Program bus.
 * Motion applies only to the overlay; background and scene remain unchanged.
 */
export function drawOverlay(ctx, media, active, now) {
  const { overlay, start, end } = active;
  const entry = transitionProgress(start, 240, now).eased;
  const exit = end === undefined ? 1 : 1 - transitionProgress(end, 240, now).eased;
  const entering = end === undefined || entry < exit;
  const motion = entering ? overlay.animation : (overlay.exitAnimation ?? overlay.animation);
  const progress = motion === 'none' ? Number(end === undefined) : Math.min(entry, exit);
  if (!progress) return;
  ctx.save();
  try {
    ctx.globalAlpha = (overlay.opacity ?? 100) / 100 * progress;
    const [x, y, w, h] = overlayMotion(ctx, position(overlay), motion, progress);
    if (['graphic', 'image', 'video'].includes(overlay.type)) {
      const image = media.drawable(overlay, { page: 0 }, now);
      if (image) drawImage(ctx, image, x, y, w, h, overlay.fit ?? 'contain');
    } else if (overlay.type === 'emoji') {
      // The same native Unicode glyph is composited into the false Program
      // editor, Preview and recorded/live canvas. No text badge/background.
      const glyph = findEmoji(overlay.emoji)?.emoji || DEFAULT_EMOJI;
      ctx.beginPath();
      ctx.rect(x,y,w,h);
      ctx.clip();
      const size = Math.max(1,Math.floor(Math.min(w * .84, h * .84, 620)));
      ctx.font = size + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(glyph,x+w/2,y+h/2,w*.94);
    } else if (overlay.type === 'arrow') {
      ctx.fillStyle = accent;
      ctx.strokeStyle = '#111826';
      ctx.lineWidth = 8;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x + w * .1, y + h * .4);
      ctx.lineTo(x + w * .64, y + h * .4);
      ctx.lineTo(x + w * .64, y + h * .15);
      ctx.lineTo(x + w * .94, y + h * .5);
      ctx.lineTo(x + w * .64, y + h * .85);
      ctx.lineTo(x + w * .64, y + h * .6);
      ctx.lineTo(x + w * .1, y + h * .6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (overlay.type === 'lower') {
      rect(ctx, x, y, w, h, '#0c1525f3', 11);
      rect(ctx, x, y, 10, h, accent, 4);
      text(ctx, overlay.text, x + w * .048, y + h * (overlay.sub ? .39 : .5), h * .35, { width: w * .89, weight: 700 });
      text(ctx, overlay.sub, x + w * .048, y + h * .73, h * .19, { width: w * .89, color: '#d9e4f1' });
    } else if (overlay.type === 'message') {
      paintMessageOverlay(ctx,overlay,x,y,w,h);
    } else if (overlay.type === 'hand') {
      rect(ctx, x, y, w, h, '#0c1525f3', 18);
      text(ctx, '✋', x + w * .16, y + h * .5, h * .35, { align: 'center' });
      text(ctx, overlay.text, x + w * .3, y + h * .5, h * .24, { width: w * .66 });
    } else {
      rect(ctx, x, y, w, h, '#0c1525f3', 18);
      rect(ctx, x, y, w, 7, accent, 3);
      text(ctx, overlay.text, x + w / 2, y + h * (overlay.sub ? .38 : .54),
        h * (overlay.sub ? .30 : .36), { align: 'center', width: w * .89 });
      if (overlay.sub) text(ctx, overlay.sub, x + w / 2, y + h * .75, h * .19,
        { align: 'center', width: w * .89, color: '#d9e4f1' });
    }
  } finally {
    ctx.restore();
  }
}

// The Overlay Designer previews the exact on-air drawing without ever
// changing the real Program canvas or activating an actual overlay.
export function drawOverlayStill(ctx, media, draft, now) {
  drawOverlay(ctx, media, { overlay: { ...draft, id: 'preview:' + draft.id }, start: now - 1000 }, now);
}

/** Draw one styled timer layer in a regular scene composition. The layer
 * controls where it appears; the shared countdown never resets on a Take. */
export function drawTimer(ctx,timer,layer,now) {
  if (!timer?.visible) return;
  const config=timer.config||{};
  const [x,y,w,h]=position(layer);
  if(w<=0||h<=0)return;
  const style=layer.timerStyle||config.timerStyle||'digital';
  const remaining=Number.isFinite(timer.remaining)?timer.remaining:0;
  const finished=timer.finished || remaining<=0;
  const overtime=remaining<0;
  const color=finished?'#ef646a':remaining<=10?'#ef646a'
    :remaining<=30?'#f3b63f':config.timerColor||'#16a3a0';
  const progress=Math.max(0,Math.min(1,remaining/Math.max(1,timer.total||config.timerSeconds||300)));
  const digits=(overtime?'+':'')+timerText(overtime?Math.abs(remaining):Math.ceil(remaining),
    (timer.total||config.timerSeconds||0)>=3600);
  const bg=config.timerBackground==='transparent'?null
    :config.timerBackground==='glass'?'#111a2bb5':'#0c1525f2';
  const title=overtime?'OVERTIME':finished?'TIME’S UP':'CLASS TIMER';
  ctx.save();
  ctx.globalAlpha*=Math.max(.1,Math.min(1,(config.timerOpacity??100)/100))
    * Math.max(0,Math.min(1,(layer.opacity??100)/100));
  if(config.timerFlash && finished && now-(timer.completedAt||0)<4800) {
    ctx.globalAlpha*=.62+.38*Math.abs(Math.sin(now/175));
  }
  if(style==='fullscreen') {
    if(bg)rect(ctx,x,y,w,h,bg,Math.min(22,h*.02));
    else rect(ctx,x,y,w,h,'#0c152568');
    const cx=x+w/2;
    text(ctx,title,cx,y+h*.28,Math.min(h*.068,w*.055),
      {align:'center',color,width:w*.85,weight:700});
    text(ctx,digits,cx,y+h*.54,Math.min(h*.29,w*.175),
      {align:'center',width:w*.93,color:white,weight:750});
    rect(ctx,x+w*.12,y+h*.78,w*.76,Math.max(5,h*.023),'#ffffff28',8);
    rect(ctx,x+w*.12,y+h*.78,w*.76*progress,Math.max(5,h*.023),color,8);
  } else if(style==='ring') {
    if(bg)rect(ctx,x,y,w,h,bg,Math.min(18,h*.1));
    const radius=Math.min(w*.29,h*.39);
    const cx=x+w*.36,cy=y+h*.51;
    ctx.lineWidth=Math.max(5,radius*.17);
    ctx.strokeStyle='#a6bad03a';
    ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle=color;
    ctx.lineCap='round';
    ctx.beginPath();ctx.arc(cx,cy,radius,-Math.PI/2,-Math.PI/2+progress*Math.PI*2);
    ctx.stroke();
    text(ctx,title,x+w*.76,y+h*.36,Math.min(h*.12,w*.07),
      {align:'center',width:w*.39,color:'#dde7f1'});
    text(ctx,digits,x+w*.76,y+h*.61,Math.min(h*.20,w*.09),
      {align:'center',width:w*.43,weight:750});
  } else if(style==='traffic') {
    if(bg)rect(ctx,x,y,w,h,bg,Math.min(18,h*.09));
    const radius=Math.min(w*.083,h*.115);
    const px=x+w*.16;
    for(const [i,c] of ['#3ecc8f','#f2bd48','#f06b6b'].entries()){
      const on=i===(finished||remaining<=10?2:remaining<=30?1:0);
      ctx.fillStyle=on?c:'#53617575';
      ctx.beginPath();ctx.arc(px,y+h*(.24+i*.26),radius,0,2*Math.PI);ctx.fill();
    }
    text(ctx,title,x+w*.65,y+h*.33,Math.min(h*.14,w*.063),
      {align:'center',width:w*.65,color:'#dce8f3'});
    text(ctx,digits,x+w*.66,y+h*.64,Math.min(h*.30,w*.14),
      {align:'center',width:w*.67,weight:750});
  } else if(style==='bar') {
    if(bg)rect(ctx,x,y,w,h,bg,Math.min(16,h*.09));
    text(ctx,title,x+w*.5,y+h*.24,Math.min(h*.14,w*.09),
      {align:'center',width:w*.9,color:'#dae7f2'});
    text(ctx,digits,x+w*.5,y+h*.52,Math.min(h*.35,w*.22),
      {align:'center',width:w*.92,weight:750});
    const by=y+h*.79,bh=Math.max(6,h*.105);
    rect(ctx,x+w*.07,by,w*.86,bh,'#aab9cf32',bh*.4);
    if(progress>0)rect(ctx,x+w*.07,by,w*.86*progress,bh,color,bh*.4);
  } else {
    if(bg)rect(ctx,x,y,w,h,bg,Math.min(16,h*.09));
    rect(ctx,x,y,w,Math.max(4,h*.05),color,2);
    text(ctx,title,x+w*.5,y+h*.27,Math.min(h*.16,w*.095),
      {align:'center',width:w*.92,color:'#dce8f1'});
    text(ctx,digits,x+w*.5,y+h*.65,Math.min(h*.41,w*.24),
      {align:'center',width:w*.94,weight:750});
  }
  ctx.restore();
}

/** Resolve a timer assigned to the currently live scene, including
 * reusable nested scenes, into absolute Program-frame coordinates. This
 * describes only the timer placement; the actual countdown draws once, atop
 * the entire live composition, never in private Preview or scene thumbnails.
 */
export function liveTimerLayout(shot) {
  if (!shot?.scene) return null;
  const visit=(scene, originX, originY, scaleX, scaleY, seen)=>{
    if (!scene || seen.has(scene.id) || seen.size>=10) return null;
    const path=new Set(seen);path.add(scene.id);
    for(const layer of [...scene.layers].reverse()) {
      if (!layer.visible) continue;
      const source=shot.sources?.get(layer.source);
      if (!source) continue;
      if(source.type==='timer') {
        return {...layer,
          x:(originX+W*layer.x/100*scaleX)/W*100,
          y:(originY+H*layer.y/100*scaleY)/H*100,
          w:layer.w*scaleX, h:layer.h*scaleY};
      }
      if(source.type==='scene') {
        const child=shot.scenes?.get(source.sceneId);
        if(!child || path.has(child.id))continue;
        const [x,y,w,h]=position(layer);
        const ratio=layer.fit==='stretch'?[w/W,h/H]:
          [layer.fit==='cover'?Math.max(w/W,h/H):Math.min(w/W,h/H),
           layer.fit==='cover'?Math.max(w/W,h/H):Math.min(w/W,h/H)];
        const childX=originX+(x+(w-W*ratio[0])/2)*scaleX;
        const childY=originY+(y+(h-H*ratio[1])/2)*scaleY;
        const found=visit(child,childX,childY,scaleX*ratio[0],scaleY*ratio[1],path);
        if(found)return found;
      }
    }
    return null;
  };
  return visit(shot.scene,0,0,1,1,new Set());
}

/** With no scene-specific timer placement, Start still puts a countdown
 * directly on the live output. No scene layer or source is auto-created. */
export function liveTimerFallback(config = {}) {
  return config.timerStyle==='fullscreen'
    ? {x:0,y:0,w:100,h:100,timerStyle:'fullscreen'}
    : {x:75,y:7,w:22,h:19,timerStyle:config.timerStyle||'digital'};
}

export class StudioRenderer {
  constructor(preview, program, media) {
    this.media = media;
    this.preview = preview.getContext('2d', { alpha: false });
    this.program = program.getContext('2d', { alpha: false });
    this.outgoing = canvas().getContext('2d', { alpha: false });
    this.incoming = canvas().getContext('2d', { alpha: false });
    this.preview.scale(preview.width / W, preview.height / H);
  }

  draw({ preview, program, transition, previewOverlays, liveOverlays, timer }, now) {
    if (!preview || !program) return;
    drawScene(this.preview, this.media, preview, now, true,new Set(),timer);
    for (const overlay of previewOverlays.values()) drawOverlay(this.preview, this.media, overlay, now);
    if (!transition) drawScene(this.program, this.media, program, now, false,new Set(),timer);
    else {
      drawScene(this.outgoing, this.media, transition.previous, now, false,new Set(),timer);
      drawScene(this.incoming, this.media, program, now, false,new Set(),timer);
      this.mix(transition, now);
    }
    for (const overlay of liveOverlays.values()) drawOverlay(this.program, this.media, overlay, now);
    // Program is the only timer destination. Drawing after transitions and
    // overlays avoids duplicates and keeps the timer continuously on-air.
    if (timer?.visible) drawTimer(this.program,timer,
      liveTimerLayout(program) || liveTimerFallback(timer.config),now);
  }

  mix(transition, now) {
    const { eased } = transitionProgress(transition.start, transition.duration, now);
    paintTransition(this.program, transition.type, eased, this.outgoing.canvas, this.incoming.canvas);
  }

  thumbnail(node, scene, sources, now, scenes = new Map(), timer = null, preview = false) {
    const ctx = node.getContext('2d', { alpha: false });
    ctx.save();
    ctx.scale(node.width / W, node.height / H);
    drawScene(ctx, this.media, { scene, sources, scenes }, now, preview,new Set(),timer);
    ctx.restore();
  }
}
