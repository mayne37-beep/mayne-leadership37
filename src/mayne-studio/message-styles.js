/** Presets and safe custom appearance for live Message overlays.
 * Other overlay types retain their existing renderer and saved properties. */
export const MESSAGE_STYLES = Object.freeze({
  classic: {
    name:'Classic', description:'Dark title with a warm top accent',
    font:'sans', weight:'700', size:100, align:'center',
    textColor:'#f5f6fa', subColor:'#d9e4f1',
    background:'#0c1525', backgroundOpacity:95,
    accent:'#ffa975', accentEdge:'top', border:'#57718e', borderWidth:0,
    radius:18, shadow:false,
  },
  minimal: {
    name:'Minimal', description:'Clean type over the picture',
    font:'sans', weight:'700', size:108, align:'center',
    textColor:'#ffffff', subColor:'#e5f1ff',
    background:'#0c1525', backgroundOpacity:0,
    accent:'#ffffff', accentEdge:'none', border:'#ffffff', borderWidth:0,
    radius:0, shadow:true,
  },
  lowerthird: {
    name:'Lower Third', description:'Presenter-name style with a left bar',
    font:'sans', weight:'700', size:100, align:'left',
    textColor:'#ffffff', subColor:'#d1e8f3',
    background:'#10253b', backgroundOpacity:95,
    accent:'#26c6b5', accentEdge:'left', border:'#4c94aa', borderWidth:0,
    radius:12, shadow:false,
  },
  announcement: {
    name:'Announcement', description:'Bright classroom announcement banner',
    font:'display', weight:'700', size:105, align:'center',
    textColor:'#ffffff', subColor:'#eaf4ff',
    background:'#245f9c', backgroundOpacity:96,
    accent:'#83d6ff', accentEdge:'top', border:'#b2dbff', borderWidth:2,
    radius:14, shadow:false,
  },
  alert: {
    name:'Alert', description:'High-contrast important notice',
    font:'sans', weight:'800', size:103, align:'center',
    textColor:'#ffffff', subColor:'#ffe6d6',
    background:'#772b32', backgroundOpacity:96,
    accent:'#ffd36a', accentEdge:'left', border:'#ffd36a', borderWidth:3,
    radius:10, shadow:true,
  },
  glass: {
    name:'Glass', description:'Soft translucent panel',
    font:'sans', weight:'600', size:100, align:'center',
    textColor:'#ffffff', subColor:'#dfebff',
    background:'#203c57', backgroundOpacity:64,
    accent:'#94d9fa', accentEdge:'none', border:'#9fd3ed', borderWidth:2,
    radius:28, shadow:true,
  },
});

export const MESSAGE_FONTS = Object.freeze({
  sans:'Modern sans-serif', display:'Display sans-serif',
  serif:'Classic serif', mono:'Monospace',
});
export const MESSAGE_WEIGHTS = Object.freeze({
  '400':'Regular', '500':'Medium', '600':'Semibold',
  '700':'Bold', '800':'Extra bold',
});
export const MESSAGE_ALIGNMENTS = Object.freeze({
  left:'Left', center:'Center', right:'Right',
});
export const MESSAGE_ACCENT_EDGES = Object.freeze({
  none:'None', top:'Top stripe', left:'Left stripe',
});

export const isMessageStyle = value => Object.hasOwn(MESSAGE_STYLES,value);
export const messageStyleId = id => isMessageStyle(id) ? id : 'classic';

export function messageStyleDefaults(style='classic') {
  const {name,description,...values}=MESSAGE_STYLES[messageStyleId(style)];
  return { ...values };
}
const isColor = value => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
const bounded = (value,min,max,fallback) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min,Math.min(max,value)) : fallback;
const allowed = (value,group,fallback) => Object.hasOwn(group,value) ? value : fallback;

/** Reject invalid colors, CSS/font injections, and out-of-range numbers from
 * project backups while retaining customized values in existing projects. */
export function normalizeMessageAppearance(input,style='classic') {
  const base=messageStyleDefaults(style);
  const data=input && typeof input==='object' && !Array.isArray(input) ? input : {};
  return {
    font:allowed(data.font,MESSAGE_FONTS,base.font),
    weight:allowed(data.weight,MESSAGE_WEIGHTS,base.weight),
    size:bounded(data.size,55,160,base.size),
    align:allowed(data.align,MESSAGE_ALIGNMENTS,base.align),
    textColor:isColor(data.textColor)?data.textColor:base.textColor,
    subColor:isColor(data.subColor)?data.subColor:base.subColor,
    background:isColor(data.background)?data.background:base.background,
    backgroundOpacity:bounded(data.backgroundOpacity,0,100,base.backgroundOpacity),
    accent:isColor(data.accent)?data.accent:base.accent,
    accentEdge:allowed(data.accentEdge,MESSAGE_ACCENT_EDGES,base.accentEdge),
    border:isColor(data.border)?data.border:base.border,
    borderWidth:bounded(data.borderWidth,0,12,base.borderWidth),
    radius:bounded(data.radius,0,60,base.radius),
    shadow:data.shadow===true || (data.shadow!==false && base.shadow),
  };
}

const FONT_FAMILIES={
  sans:'"Segoe UI",Arial,sans-serif',
  display:'"Trebuchet MS","Segoe UI",Arial,sans-serif',
  serif:'Georgia,"Times New Roman",serif',
  mono:'Consolas,"Courier New",monospace',
};

function wrapText(ctx,value,width) {
  const groups=String(value||'').split(/\r?\n/);
  const lines=[];
  for (const paragraph of groups) {
    const words=paragraph.trim().split(/\s+/).filter(Boolean);
    let line='';
    if (!words.length) {lines.push('');continue;}
    for (const word of words) {
      const test=line ? line+' '+word : word;
      if (line && ctx.measureText(test).width>width) {
        lines.push(line);
        line=word;
      } else line=test;
    }
    lines.push(line);
  }
  return lines;
}

function paintText(ctx,value,x,y,width,height,fontSize,config,color,maxLines=3) {
  if (!value || height<=0 || width<=0) return;
  ctx.fillStyle=color;
  ctx.textAlign=config.align;
  ctx.textBaseline='middle';
  let size=Math.max(11,fontSize);
  let lines=[];
  do {
    ctx.font=config.weight+' '+Math.round(size)+'px '+FONT_FAMILIES[config.font];
    lines=wrapText(ctx,value,width);
    if ((lines.length<=maxLines && lines.length*size*1.16<=height) || size<=12) break;
    size-=2;
  } while(size>10);
  lines=lines.slice(0,maxLines);
  const spacing=Math.min(size*1.16,height/Math.max(1,lines.length));
  const start=y-(lines.length-1)*spacing/2;
  lines.forEach((line,index)=>ctx.fillText(line,x,start+index*spacing,width));
}

/** Draw message appearance in video-frame coordinates using the same canvas
 * path in editor preview, private Preview, recording, and live Program. */
export function paintMessageOverlay(ctx,overlay,x,y,w,h) {
  if (!(w>0&&h>0)) return;
  const config=normalizeMessageAppearance(overlay.messageAppearance,overlay.messageStyle);
  const oldAlpha=ctx.globalAlpha;
  const radius=Math.max(0,Math.min(config.radius,w/2,h/2));
  ctx.save();
  try {
    ctx.beginPath();
    ctx.roundRect(x,y,w,h,radius);
    ctx.clip();
    if (config.backgroundOpacity>0) {
      ctx.globalAlpha=oldAlpha*config.backgroundOpacity/100;
      ctx.fillStyle=config.background;
      ctx.fillRect(x,y,w,h);
    }
    ctx.globalAlpha=oldAlpha;
    if (config.accentEdge==='top') {
      ctx.fillStyle=config.accent;
      ctx.fillRect(x,y,w,Math.max(4,Math.min(9,h*.06)));
    } else if (config.accentEdge==='left') {
      ctx.fillStyle=config.accent;
      ctx.fillRect(x,y,Math.max(5,Math.min(15,w*.018)),h);
    }
    if (config.borderWidth>0) {
      const half=config.borderWidth/2;
      ctx.strokeStyle=config.border;
      ctx.lineWidth=config.borderWidth;
      ctx.beginPath();
      ctx.roundRect(x+half,y+half,w-config.borderWidth,h-config.borderWidth,
        Math.max(0,radius-half));
      ctx.stroke();
    }
    const inset=Math.max(12,Math.min(w*.055,h*.14));
    const padX=config.accentEdge==='left'?Math.max(inset,w*.075):inset;
    const usable=Math.max(1,w-padX-inset);
    const anchor=config.align==='center'?x+padX+usable/2:
      config.align==='right'?x+padX+usable:x+padX;
    const hasSub=!!overlay.sub;
    ctx.save();
    if (config.shadow) {
      ctx.shadowColor='#000000b0';
      ctx.shadowBlur=14;
      ctx.shadowOffsetY=4;
    }
    const base=h*(hasSub?.30:.36)*config.size/100;
    paintText(ctx,overlay.text,anchor,y+h*(hasSub?.38:.53),usable,
      h*(hasSub?.48:.80),base,config,config.textColor,hasSub?2:3);
    if (hasSub) {
      ctx.font=config.weight+' '+Math.round(base*.58)+'px '+FONT_FAMILIES[config.font];
      paintText(ctx,overlay.sub,anchor,y+h*.76,usable,h*.24,
        Math.max(12,base*.58),config,config.subColor,2);
    }
    ctx.restore();
  } finally {
    ctx.restore();
  }
}
