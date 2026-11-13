import assert from 'node:assert/strict';
import test from 'node:test';
import { annotationSnapshot, changeMarks, containedSize, encodeStroke, maxMarks, maxStrokePoints,
  readAnnotationSnapshot, readSlideCommand } from '../../src/live-classroom/annotations.js';

const id = 'a'.repeat(32);
const controlKey = 'b'.repeat(32);
const state = { id, revision: 5, pageVersion: 2, page: 1, pages: 3, mode: 'everyone', controller: 'guest', controlKey };

test('annotation snapshots fit Daily messages and round-trip complex marks', () => {
  const path = encodeStroke(Array.from({ length: maxStrokePoints }, (_, index) => [index, 1000 - index]));
  const marks = Array.from({ length: maxMarks }, (_, index) => ({
    id: index.toString(16).padStart(32, '0'), author: 'x'.repeat(128), color: 'yellow', kind: 'pen', path,
  }));
  for (const chunk of annotationSnapshot({ ...state, marks })) {
    assert.ok(Buffer.byteLength(JSON.stringify({ app: 'mayne-live-classroom', type: 'presentation-board', ...chunk })) < 4096);
    assert.deepEqual(readAnnotationSnapshot(chunk, id), chunk);
  }
  assert.equal(readAnnotationSnapshot({ ...annotationSnapshot({ ...state, marks })[0], index: -1 }, id), null);
  assert.equal(readAnnotationSnapshot(annotationSnapshot({ ...state, marks })[0], 'other'), null);
});

test('attendees can undo and erase their own marks while the presenter can clear the page', () => {
  const note = { id, kind: 'note', color: 'pink', x: 5, y: 10, text: '  Try this  ', author: 'forged' };
  const action = { kind: 'add', mark: note };
  const marks = changeMarks([], action, 'guest', false);
  assert.deepEqual(marks, [{ ...note, text: 'Try this', author: 'guest' }]);
  assert.equal(changeMarks(marks, action, 'guest', false), marks);
  assert.equal(changeMarks(marks, { kind: 'erase', id }, 'other', false), marks);
  assert.equal(changeMarks(marks, { kind: 'clear' }, 'guest', false), marks);
  assert.deepEqual(changeMarks(marks, { kind: 'undo' }, 'guest', false), []);
  assert.deepEqual(changeMarks(marks, { kind: 'erase', id }, 'owner', true), []);
  assert.deepEqual(changeMarks([], { kind: 'add', mark: { ...note, x: 1001 } }, 'guest', false), []);
});

test('slide commands require the current approved participant, grant and page version', () => {
  const message = { page: 1, pageVersion: 2, target: 2, controlKey };
  assert.equal(readSlideCommand(state, message, 'guest'), 2);
  assert.equal(readSlideCommand(state, message, 'other'), null);
  assert.equal(readSlideCommand({ ...state, controller: '', controlKey: '' }, message, 'guest'), null);
  assert.equal(readSlideCommand({ ...state, pageVersion: 4 }, message, 'guest'), null);
  assert.equal(readSlideCommand(state, { ...message, target: 3 }, 'guest'), null);
  assert.equal(readSlideCommand(state, { ...message, controlKey: id }, 'guest'), null);
});

test('the annotation frame follows the visible share when it is letterboxed', () => {
  assert.deepEqual(containedSize(400, 800, 1920, 1080), { width: 400, height: 225 });
  assert.deepEqual(containedSize(800, 400, 1080, 1920), { width: 225, height: 400 });
  assert.equal(containedSize(800, 400, 0, 0), null);
});
