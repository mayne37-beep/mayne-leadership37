import assert from 'node:assert/strict';
import test from 'node:test';
import { drawPresenterScene, editSceneLayer, initialScene, moveSceneLayer } from '../../src/live-classroom/presenter-scene.js';
import { presentationOf } from '../../src/live-classroom/shared.js';

test('layer edits keep each layer on the scene and retain the other layers', () => {
  const moved = editSceneLayer(initialScene, 'camera', { x: -20, y: 100, size: 37 });
  assert.deepEqual(moved.layers.camera, { x: 0, y: 63, size: 37, visible: true, mirror: false, cutout: true });
  assert.equal(moved.layers.slides, initialScene.layers.slides);
  assert.equal(initialScene.layers.camera.x, 56);
});

test('the camera mirrors inside its own rectangle and respects layer order', () => {
  const sources = Object.fromEntries(['background', 'slides', 'camera'].map(id => [id, { id, width: 1280, height: 720 }]));
  const draws = [];
  let mirrored = false;
  const context = {
    fillRect() {}, beginPath() {}, rect() {}, clip() {}, translate() {},
    save() { mirrored = false; },
    restore() { mirrored = false; },
    scale(x) { mirrored = x === -1; },
    drawImage(source) { draws.push([source.id, mirrored]); },
  };
  const scene = moveSceneLayer(editSceneLayer(initialScene, 'camera', { mirror: true }), 'camera', -1);
  drawPresenterScene(context, scene, sources);
  assert.deepEqual(draws, [['background', false], ['camera', true], ['slides', false]]);
});

test('presenter settings distinguish a composed share from Weather view', () => {
  assert.deepEqual(presentationOf({ userData: { presentation: { layout: 'weather', side: 'left', mirror: true } } }),
    { layout: 'weather', side: 'left', mirror: true, composed: false });
  assert.equal(presentationOf({ userData: { presentation: { layout: 'studio' } } }).composed, true);
});
