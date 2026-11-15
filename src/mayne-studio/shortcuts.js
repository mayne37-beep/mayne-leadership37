/** Keyboard shortcuts use KeyboardEvent.code so the physical key stays stable across layout changes. */
const overlayKeys = 'QWERTYUI';
export const SHORTCUT_ACTIONS = [
  ['take', 'Take Preview to Program', 'Space'],
  ['cut', 'Cut Preview to Program', 'KeyC'],
  ['scenePrevious', 'Previous scene in Preview', 'BracketLeft'],
  ['sceneNext', 'Next scene in Preview', 'BracketRight'],
  ['programPrevious', 'Program PowerPoint: previous', 'PageUp'],
  ['programNext', 'Program PowerPoint: next', 'PageDown'],
  ['previewPrevious', 'Preview PowerPoint: previous', 'Comma'],
  ['previewNext', 'Preview PowerPoint: next', 'Period'],
  ...[...overlayKeys].map((key, index) => ['overlay' + index, 'Toggle live overlay ' + (index + 1), 'Key' + key]),
  ...Array.from({ length: 9 }, (_, index) => ['scene' + index, 'Cue scene ' + (index + 1), 'Digit' + (index + 1)]),
];
export const DEFAULT_SHORTCUTS = Object.freeze(Object.fromEntries(SHORTCUT_ACTIONS.map(([id,,key]) => [id, key])));
export const shortcutIds = new Set(SHORTCUT_ACTIONS.map(([id]) => id));
const codePattern = /^(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Space|PageUp|PageDown|BracketLeft|BracketRight|Minus|Equal|Comma|Period|Semicolon|Quote|Backslash|Backquote|Slash|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End|Insert)$/;
export const validShortcut = value => {
  if (typeof value !== 'string') return false;
  const tokens = value.split('+');
  const code = tokens.pop();
  return codePattern.test(code) && tokens.every((token, index) =>
    ['Ctrl','Alt','Shift','Meta'].includes(token) && tokens.indexOf(token) === index);
};
export function keyboardShortcut(event) {
  if (event.isComposing || !codePattern.test(event.code)) return '';
  return [event.ctrlKey && 'Ctrl', event.altKey && 'Alt',
    event.shiftKey && 'Shift', event.metaKey && 'Meta', event.code].filter(Boolean).join('+');
}
export function shortcutLabel(shortcut) {
  if (!shortcut) return 'Not assigned';
  return shortcut.split('+').map(part => part.startsWith('Key') ? part.slice(3)
    : part.startsWith('Digit') ? part.slice(5)
      : ({ Space: 'Space', BracketLeft: '[', BracketRight: ']', PageUp: 'PgUp', PageDown: 'PgDn',
        Comma: ',', Period: '.', Minus: '-', Equal: '=', Semicolon: ';', Quote: "'",
        Backslash: '\\', Backquote: '\`', Slash: '/' })[part] || part).join(' + ');
}
export function normalizeShortcuts(custom) {
  const result = { ...DEFAULT_SHORTCUTS };
  if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return result;
  const entries = Object.entries(custom).filter(([id,value]) => shortcutIds.has(id) && (value === '' || validShortcut(value)));
  // Treat a user's explicit custom bindings as authoritative and clear overlapping defaults.
  for (const [id,value] of entries) result[id] = value;
  const seen = new Set();
  for (const [id] of SHORTCUT_ACTIONS) {
    if (seen.has(result[id])) result[id] = '';
    if (result[id]) seen.add(result[id]);
  }
  return result;
}
export function shortcutAction(shortcuts, chord) {
  if (!chord) return '';
  return SHORTCUT_ACTIONS.find(([id]) => shortcuts[id] === chord)?.[0] || '';
}
