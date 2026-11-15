/**
 * Studio transitions are rendered on the 1920 x 1080 Program canvas.
 * Preview is never mutated while these effects run.
 *
 * All effects compose two pre-rendered frames. This makes the transitions
 * deterministic and lets the recording and detached Program window see the
 * same picture as the on-screen Program monitor.
 */
export const TRANSITION_GROUPS = Object.freeze([
  { name: 'Standard', choices: [
    ['cut', 'Cut (instant)'], ['fade', 'Crossfade'], ['dip', 'Dip to black'],
  ] },
  { name: 'Wipes', choices: [
    ['wipe', 'Wipe right →'], ['wipe-left', 'Wipe left ←'],
    ['wipe-up', 'Wipe up ↑'], ['wipe-down', 'Wipe down ↓'],
  ] },
  { name: 'Slides', choices: [
    ['slide-left', 'Slide in from right ←'], ['slide-right', 'Slide in from left →'],
    ['slide-up', 'Slide in from bottom ↑'], ['slide-down', 'Slide in from top ↓'],
  ] },
  { name: 'Pushes', choices: [
    ['push-left', 'Push left ←'], ['push-right', 'Push right →'],
    ['push-up', 'Push up ↑'], ['push-down', 'Push down ↓'],
  ] },
  { name: 'Special', choices: [
    ['zoom-in', 'Zoom in'], ['zoom-out', 'Zoom out'], ['iris', 'Iris open'],
  ] },
]);
export const TRANSITIONS = Object.freeze(Object.fromEntries(
  TRANSITION_GROUPS.flatMap(group => group.choices),
));

/** Five independently selectable one-click transition slots per project. */
export const DEFAULT_FAVORITE_TRANSITIONS = Object.freeze([
  'fade', 'wipe', 'push-left', 'zoom-in', 'dip',
]);

export function normalizeFavoriteTransitions(value) {
  const provided = Array.isArray(value) ? value.slice(0, DEFAULT_FAVORITE_TRANSITIONS.length) : [];
  const used = new Set();
  return DEFAULT_FAVORITE_TRANSITIONS.map((fallback, index) => {
    const candidate = provided[index];
    const chosen = typeof candidate === 'string' && Object.hasOwn(TRANSITIONS, candidate) && !used.has(candidate)
      ? candidate : [fallback, ...DEFAULT_FAVORITE_TRANSITIONS, ...Object.keys(TRANSITIONS)]
        .find(type => !used.has(type));
    used.add(chosen);
    return chosen;
  });
}

function direction(type) {
  switch (type.split('-')[1]) {
    case 'left': return [-1, 0];
    case 'right': return [1, 0];
    case 'up': return [0, -1];
    case 'down': return [0, 1];
    default: return [-1, 0];
  }
}

function drawScaled(ctx, image, scale, opacity, width, height) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(width / 2, height / 2);
  ctx.scale(scale, scale);
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}

/**
 * Paint the intermediate Program frame for a transition.
 * Progress is eased 0..1. At the endpoints this always draws the exact
 * outgoing or incoming frame, regardless of transition type.
 */
export function paintTransition(ctx, type, progress, outgoing, incoming) {
  const width = ctx.canvas.width, height = ctx.canvas.height;
  const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  ctx.save();
  try {
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, width, height);
    if (type === 'cut' || p >= 1) { ctx.drawImage(incoming, 0, 0, width, height); return; }
    if (p <= 0) { ctx.drawImage(outgoing, 0, 0, width, height); return; }

    if (type === 'fade') {
      ctx.drawImage(outgoing, 0, 0, width, height);
      ctx.globalAlpha = p;
      ctx.drawImage(incoming, 0, 0, width, height);
    } else if (type === 'dip') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = p < .5 ? 1 - p * 2 : (p - .5) * 2;
      ctx.drawImage(p < .5 ? outgoing : incoming, 0, 0, width, height);
    } else if (type === 'wipe' || type.startsWith('wipe-')) {
      ctx.drawImage(outgoing, 0, 0, width, height);
      const vector = type === 'wipe' ? [1, 0] : direction(type);
      let x = 0, y = 0, w = width, h = height;
      if (vector[0]) { w = p * width; if (vector[0] < 0) x = width - w; }
      else { h = p * height; if (vector[1] < 0) y = height - h; }
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.drawImage(incoming, 0, 0, width, height);
    } else if (type.startsWith('slide-') || type.startsWith('push-')) {
      const [dx, dy] = direction(type);
      if (type.startsWith('slide-')) {
        ctx.drawImage(outgoing, 0, 0, width, height);
      } else {
        ctx.drawImage(outgoing, dx * p * width, dy * p * height, width, height);
      }
      ctx.drawImage(incoming, -dx * (1 - p) * width, -dy * (1 - p) * height, width, height);
    } else if (type === 'zoom-in' || type === 'zoom-out') {
      ctx.drawImage(outgoing, 0, 0, width, height);
      const scale = type === 'zoom-in' ? .65 + .35 * p : 1.4 - .4 * p;
      drawScaled(ctx, incoming, scale, p, width, height);
    } else if (type === 'iris') {
      ctx.drawImage(outgoing, 0, 0, width, height);
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, Math.hypot(width, height) * p / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(incoming, 0, 0, width, height);
    } else {
      // Unknown saved transition values safely render as a standard crossfade.
      ctx.drawImage(outgoing, 0, 0, width, height);
      ctx.globalAlpha = p;
      ctx.drawImage(incoming, 0, 0, width, height);
    }
  } finally {
    ctx.restore();
  }
}
