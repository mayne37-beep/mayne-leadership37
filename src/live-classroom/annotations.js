import { cleanText, reactions } from './shared.js';

export const annotationColors = {
  yellow: '#ffdb69', mint: '#70e2bc', blue: '#91b8ff', pink: '#ff9eba', white: '#fff',
};
export const annotationModes = ['off', 'presenter', 'everyone'];
export const annotationEmoji = [...reactions, ['✅', 'Check mark'], ['❌', 'X']];
export const annotationTools = [
  ['pen', 'Pen', 'pen'], ['highlighter', 'Highlighter', 'highlight'], ['note', 'Sticky note', 'note'],
  ['text', 'Text box', 'text'], ['emoji', 'Emoji', 'react'], ['erase', 'Eraser', 'erase'],
];
export const maxAnnotationText = 160;
export const maxStrokePoints = 128;
export const maxMarks = 40;
const chunkSize = 4;
export const presentationId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const participantId = value => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const coordinate = value => Number.isInteger(value) && value >= 0 && value <= 1000;

export function containedSize(width, height, sourceWidth, sourceHeight) {
  if (!(width > 0 && height > 0 && sourceWidth > 0 && sourceHeight > 0)) return null;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  return { width: sourceWidth * scale, height: sourceHeight * scale };
}

export function encodeStroke(points) {
  return points.flat().map(value => value.toString(36).padStart(2, '0')).join('');
}

export function decodeStroke(path) {
  const values = path.match(/.{2}/g).map(pair => parseInt(pair, 36));
  return Array.from({ length: values.length / 2 }, (_, index) => values.slice(index * 2, index * 2 + 2));
}

function readMark(value, author) {
  if (!presentationId(value?.id) || !participantId(author) || typeof value.color !== 'string' ||
      !Object.hasOwn(annotationColors, value.color)) return null;
  const mark = { id: value.id, author, kind: value.kind, color: value.color };
  if (value.kind === 'pen' || value.kind === 'highlighter') {
    const path = value.path;
    if (typeof path !== 'string' || path.length > maxStrokePoints * 4 || !/^(?:[0-9a-z]{4})+$/.test(path) ||
        !decodeStroke(path).every(point => point.every(coordinate))) return null;
    return { ...mark, path };
  }
  if (!coordinate(value.x) || !coordinate(value.y)) return null;
  const position = { ...mark, x: value.x, y: value.y };
  if (value.kind === 'emoji') return annotationEmoji.some(([emoji]) => emoji === value.emoji)
    ? { ...position, emoji: value.emoji } : null;
  if (value.kind === 'note' || value.kind === 'text') {
    const text = cleanText(value.text, maxAnnotationText).replace(/[\uD800-\uDFFF]/gu, '\uFFFD');
    if (text) return { ...position, text };
  }
  return null;
}

export function changeMarks(marks, action, author, presenter) {
  if (action.kind === 'clear' && presenter) return marks.length ? [] : marks;
  if (action.kind === 'add') {
    const mark = readMark(action.mark, author);
    if (mark && marks.length < maxMarks && !marks.some(item => item.id === mark.id)) return [...marks, mark];
    return marks;
  }
  const target = action.kind === 'undo' ? marks.findLast(mark => mark.author === author)?.id : action.id;
  if (action.kind !== 'erase' && action.kind !== 'undo') return marks;
  const index = marks.findIndex(mark => mark.id === target && (mark.author === author || presenter));
  return index < 0 ? marks : marks.filter((_, i) => i !== index);
}

// Keep every Daily message below 4 KB, including for long strokes and multibyte text.
export function annotationSnapshot(board) {
  const { marks, ...state } = board;
  const count = Math.max(1, Math.ceil(marks.length / chunkSize));
  return Array.from({ length: count }, (_, index) => ({
    state, index, count, marks: marks.slice(index * chunkSize, (index + 1) * chunkSize),
  }));
}

export function readAnnotationSnapshot(message, id) {
  const { state, count, index, marks } = message;
  if (state?.id !== id || !Number.isSafeInteger(state.revision) || state.revision < 0 ||
      !Number.isSafeInteger(state.pageVersion) || state.pageVersion < 0 ||
      !annotationModes.includes(state.mode) || !Number.isInteger(state.pages) || state.pages < 0 || state.pages > 200 ||
      !Number.isInteger(state.page) || (state.pages ? state.page < 0 || state.page >= state.pages : state.page !== -1) ||
      (state.controller !== '' && (!state.pages || !participantId(state.controller) || !presentationId(state.controlKey))) ||
      (state.controller === '' && state.controlKey !== '') ||
      !Number.isInteger(count) || count < 1 || count > Math.ceil(maxMarks / chunkSize) ||
      !Number.isInteger(index) || index < 0 || index >= count || !Array.isArray(marks) || marks.length > chunkSize) return null;
  const validated = marks.map(mark => readMark(mark, mark?.author));
  if (validated.some(mark => !mark)) return null;
  const { revision, pageVersion, mode, page, pages, controller, controlKey } = state;
  return { state: { id, revision, pageVersion, mode, page, pages, controller, controlKey }, count, index, marks: validated };
}

export function readSlideCommand(board, message, senderId) {
  const page = message.target;
  if (board.controller !== senderId || !board.pages || board.controlKey !== message.controlKey ||
      board.page !== message.page || board.pageVersion !== message.pageVersion ||
      !Number.isInteger(page) || page < 0 || page >= board.pages ||
      Math.abs(page - board.page) !== 1) return null;
  return page;
}
