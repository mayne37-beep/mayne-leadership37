import { DEFAULT_SHORTCUTS, normalizeShortcuts } from './shortcuts.js';
import { TRANSITIONS, DEFAULT_FAVORITE_TRANSITIONS, normalizeFavoriteTransitions } from './transitions.js';

export const WIDTH = 1920;
export const HEIGHT = 1080;
export const VERSION = 1;
export const SHORTCUTS = 'QWERTYUI';
export const SOURCES = {
  camera: 'Camera', mic: 'Microphone', screen: 'Screen share', powerpoint: 'PowerPoint',
  image: 'Image', video: 'Video', audio: 'Audio', title: 'Text',
};
export const BACKGROUNDS = {
  studio: 'Training studio', office: 'Sunlit office', reading: 'Reading room',
  navy: 'Midnight blue', black: 'Black', custom: 'Uploaded image',
};
export const TEMPLATES = {
  standby: 'Standby', presenter: 'Presenter', slides: 'Slides + presenter',
  discussion: 'Discussion', activity: 'Activity', break: 'Break', blank: 'Blank',
};
// Legacy overlay types remain readable, but new overlays use only Image, Video or Message.
export const OVERLAYS = {
  image: 'Image', video: 'Video', message: 'Message',
  lower: 'Lower third (legacy)', arrow: 'Arrow (legacy)', hand: 'Raised hand (legacy)', graphic: 'Media (legacy)',
};
export const OVERLAY_CHOICES = { image: 'Image', video: 'Video', message: 'Message' };
export const OVERLAY_MOTIONS = {
  fade: 'Fade', pop: 'Pop (zoom)', slide: 'Slide up', 'slide-left': 'Slide left',
  'slide-right': 'Slide right', 'slide-down': 'Slide down', none: 'Instant',
};
export const AUDIO = new Set(['mic', 'screen', 'audio', 'video']);
export const VISUAL = new Set(['camera', 'screen', 'powerpoint', 'image', 'video', 'title']);
export const PLACE = {
  full: { x: 0, y: 0, w: 100, h: 100 },
  slides: { x: 5, y: 10, w: 66, h: 75 },
  inset: { x: 74, y: 53, w: 22, h: 36 },
  graphic: { x: 68, y: 66, w: 27, h: 29 },
  title: { x: 5, y: 80, w: 90, h: 15 },
  arrow: { x: 51, y: 42, w: 16, h: 22 },
};
export const uid = () => crypto.randomUUID();
export const clone = value => structuredClone(value);

const choices = (value, options, fallback) => Object.hasOwn(options, value) ? value : fallback;
const oneOf = (value, options, fallback) => options.includes(value) ? value : fallback;
const string = (value, fallback = '', size = 120) => typeof value === 'string' ? value.slice(0, size) : fallback;
const identifier = (value, fallback = '') => typeof value === 'string' && /^[a-z0-9_-]{1,64}$/i.test(value) ? value : fallback;
export function clamp(value, min, max, fallback = min) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
export const dbGain = db => db <= -60 ? 0 : Math.pow(10, db / 20);
export const gainDb = gain => gain > 0.0001 ? 20 * Math.log10(gain) : -80;
export const clock = (seconds, long = false) => {
  const total = Math.max(0, Math.floor(seconds));
  const pair = value => String(value).padStart(2, '0');
  const hours = Math.floor(total / 3600);
  return (long || hours ? pair(hours) + ':' : '') + pair(Math.floor(total / 60) % 60) + ':' + pair(total % 60);
};

export function makeSource(type, name, options = {}) {
  return { id: uid(), type, name: name || SOURCES[type], asset: '', device: '', text: 'On-screen title',
    sub: '', gain: 0, mute: false, route: type === 'mic' ? 'always' : 'scene',
    loop: false, autoplay: true, ...options };
}
export function makeLayer(source, placement = PLACE.full) {
  return { id: uid(), source, ...placement, opacity: 100, visible: true, fit: 'cover',
    page: 0, matte: 'off', key: '#00a040', coverage: 'balanced', mirror: false };
}
export function makeOverlay(type, options = {}) {
  const presets = {
    lower: { name: 'Instructor name', text: 'Instructor', sub: 'Mayne Leadership', seconds: 0, x: 5, y: 79, w: 50, h: 16 },
    message: { name: 'Class prompt', text: 'Share your thoughts in chat', seconds: 8, x: 22, y: 6, w: 56, h: 12 },
    arrow: { name: 'Pointer arrow', seconds: 4, ...PLACE.arrow },
    hand: { name: 'Raise hand', text: 'Raise your hand', seconds: 6, x: 64, y: 72, w: 31, h: 21 },
    graphic: { name: 'Graphic', seconds: 0, ...PLACE.graphic },
    image: { name: 'Image overlay', seconds: 0, ...PLACE.graphic },
    video: { name: 'Video overlay', seconds: 0, ...PLACE.graphic },
  };
  return { id: uid(), type, name: OVERLAYS[type], text: '', sub: '', asset: '', seconds: 0,
    animation: type === 'arrow' || type === 'hand' ? 'pop' : 'slide',
    exitAnimation: type === 'arrow' || type === 'hand' ? 'pop' : 'slide',
    fit: 'contain', opacity: 100, loop: true, ...presets[type], ...options };
}

export function makeScene(template, name = TEMPLATES[template]) {
  const defaults = {
    standby: ['studio', 'Class begins shortly', 'Get settled and check your audio.'],
    presenter: ['studio', 'Leadership Classroom', ''],
    slides: ['navy', 'Slides + Presenter', ''],
    discussion: ['reading', 'Let’s discuss', 'What stood out to you?'],
    activity: ['navy', 'Classroom activity', 'Follow the instructions from your facilitator.'],
    break: ['office', 'We’ll be right back', 'Take a moment to recharge.'],
    blank: ['black', '', ''],
  };
  const [background, title, caption] = defaults[template] ?? defaults.blank;
  return { id: uid(), name, template, background, title, caption, backdrop: '', layers: [] };
}

export function makeProject(name = 'Leadership Classroom') {
  return {
    id: uid(), name, version: VERSION, updated: Date.now(),
    scenes: ['standby', 'presenter', 'slides', 'discussion', 'activity', 'break'].map(key => makeScene(key)),
    sources: [], overlays: [makeOverlay('message')],
    transition: 'fade', duration: 450, master: 0, masterMute: false, timerSeconds: 300,
    shortcuts: { ...DEFAULT_SHORTCUTS }, favoriteTransitions: [...DEFAULT_FAVORITE_TRANSITIONS],
  };
}

function placement(input) {
  return {
    x: clamp(input.x, -100, 100, 0), y: clamp(input.y, -100, 100, 0),
    w: clamp(input.w, 1, 200, 100), h: clamp(input.h, 1, 200, 100),
  };
}

function unique(items, limit, toValue) {
  const results = new Map();
  for (const item of Array.isArray(items) ? items.slice(0, limit) : []) {
    if (!item || !identifier(item.id) || results.has(item.id)) continue;
    const value = toValue(item);
    if (value) results.set(item.id, value);
  }
  return [...results.values()];
}

export function normalizeProject(input) {
  if (!input || input.version !== VERSION || !Array.isArray(input.scenes)) {
    throw new Error('Choose a Mayne Studio project created with this version.');
  }
  const sources = unique(input.sources, 100, s => Object.hasOwn(SOURCES, s.type) ? {
    id: s.id, type: s.type, name: string(s.name, SOURCES[s.type]),
    asset: identifier(s.asset), device: string(s.device, '', 256),
    text: string(s.text, '', 180), sub: string(s.sub, '', 240),
    gain: clamp(s.gain, -60, 6, 0), mute: s.mute === true,
    route: oneOf(s.route, ['always', 'scene'], s.type === 'mic' ? 'always' : 'scene'),
    loop: s.loop === true, autoplay: s.autoplay !== false,
  } : null);
  const sourceIds = new Set(sources.map(s => s.id));
  const scenes = unique(input.scenes, 40, scene => ({
    id: scene.id, name: string(scene.name, 'Scene'), template: choices(scene.template, TEMPLATES, 'blank'),
    background: choices(scene.background, BACKGROUNDS, 'black'), title: string(scene.title, '', 100),
    caption: string(scene.caption, '', 200), backdrop: identifier(scene.backdrop),
    layers: unique(scene.layers, 40, layer => sourceIds.has(layer.source) ? {
      id: layer.id, source: layer.source, ...placement(layer),
      opacity: clamp(layer.opacity, 0, 100, 100), visible: layer.visible !== false,
      fit: oneOf(layer.fit, ['cover', 'contain', 'stretch'], 'cover'), page: Math.floor(clamp(layer.page, 0, 199, 0)),
      matte: oneOf(layer.matte, ['off', 'chroma', 'person'], 'off'),
      key: /^#[a-f0-9]{6}$/i.test(layer.key) ? layer.key : '#00a040',
      coverage: oneOf(layer.coverage, ['balanced', 'more', 'most'], 'balanced'), mirror: layer.mirror === true,
    } : null),
  }));
  if (!scenes.length) throw new Error('The project has no valid scenes.');
  return {
    id: identifier(input.id, uid()), name: string(input.name, 'Studio project', 90).trim() || 'Studio project',
    version: VERSION, updated: clamp(input.updated, 0, Number.MAX_SAFE_INTEGER, Date.now()), sources, scenes,
    overlays: unique(input.overlays, SHORTCUTS.length, overlay => Object.hasOwn(OVERLAYS, overlay.type) ? {
      id: overlay.id, type: overlay.type, name: string(overlay.name, OVERLAYS[overlay.type]),
      text: string(overlay.text, '', 160), sub: string(overlay.sub, '', 160), asset: identifier(overlay.asset),
      seconds: clamp(overlay.seconds, 0, 3600, 0),
      animation: choices(overlay.animation, OVERLAY_MOTIONS, 'slide'),
      exitAnimation: choices(overlay.exitAnimation, OVERLAY_MOTIONS, choices(overlay.animation, OVERLAY_MOTIONS, 'slide')),
      fit: oneOf(overlay.fit, ['contain', 'cover', 'stretch'], 'contain'),
      opacity: clamp(overlay.opacity, 0, 100, 100), loop: overlay.loop !== false, ...placement(overlay),
    } : null),
    transition: choices(input.transition, TRANSITIONS, 'fade'),
    duration: clamp(input.duration, 100, 2500, 450),
    master: clamp(input.master, -60, 6, 0), masterMute: input.masterMute === true,
    timerSeconds: clamp(input.timerSeconds, 1, 5400, 300),
    shortcuts: normalizeShortcuts(input.shortcuts),
    favoriteTransitions: normalizeFavoriteTransitions(input.favoriteTransitions),
  };
}

export function assetIds(project) {
  return [...new Set([...project.sources.map(s => s.asset), ...project.scenes.map(s => s.backdrop),
    ...project.overlays.map(o => o.asset)].filter(Boolean))];
}

export function transitionProgress(start, duration, now) {
  const progress = duration ? clamp((now - start) / duration, 0, 1) : 1;
  return { progress, eased: progress * progress * (3 - 2 * progress) };
}

export function audioWeights(incoming, outgoing, progress) {
  const weights = new Map();
  if (outgoing) for (const layer of outgoing.layers) if (layer.visible) weights.set(layer.source, 1 - progress);
  if (incoming) for (const layer of incoming.layers) {
    if (layer.visible) weights.set(layer.source, Math.min(1, (weights.get(layer.source) ?? 0) + progress));
  }
  return weights;
}
