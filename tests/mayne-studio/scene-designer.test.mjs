import test from 'node:test';
import assert from 'node:assert/strict';
import { transformBox } from '../../src/mayne-studio/scene-designer.js';

const box = { x: 10, y: 15, w: 30, h: 40 };

test('dragging moves only the layer and maintains its dimensions', () => {
  assert.deepEqual(transformBox(box, 8.4, -4.7), { x: 18.4, y: 10.3, w: 30, h: 40 });
  assert.deepEqual(box, { x: 10, y: 15, w: 30, h: 40 });
});
test('snapping rounds position and resize to the two-percent grid', () => {
  assert.deepEqual(transformBox(box, 8.4, -4.7, 'move', true), { x: 18, y: 10, w: 30, h: 40 });
  assert.deepEqual(transformBox(box, 11.2, 0, 'e', true), { x: 10, y: 15, w: 42, h: 40 });
});
test('each resize handle keeps the opposite edges anchored', () => {
  assert.deepEqual(transformBox(box, 10, 0, 'w'), { x: 20, y: 15, w: 20, h: 40 });
  assert.deepEqual(transformBox(box, 10, 0, 'e'), { x: 10, y: 15, w: 40, h: 40 });
  assert.deepEqual(transformBox(box, 0, 8, 'n'), { x: 10, y: 23, w: 30, h: 32 });
  assert.deepEqual(transformBox(box, 0, 8, 's'), { x: 10, y: 15, w: 30, h: 48 });
  assert.deepEqual(transformBox(box, 5, 5, 'sw'), { x: 15, y: 15, w: 25, h: 45 });
});
test('minimum sizes, percentage limits and off-canvas positions are safe', () => {
  assert.deepEqual(transformBox(box, -100, 0, 'e'), { x: 10, y: 15, w: 1, h: 40 });
  assert.deepEqual(transformBox(box, 100, 100, 'nw'), { x: 39, y: 54, w: 1, h: 1 });
  assert.deepEqual(transformBox(box, -300, 300), { x: -100, y: 100, w: 30, h: 40 });
  assert.deepEqual(transformBox({x: -90,y:-90,w:180,h:180}, 400, 400, 'se'),
    { x: -90, y: -90, w: 200, h: 200 });
});
