import assert from 'node:assert/strict';
import test from 'node:test';
import { writePortraitMask } from '../../src/live-classroom/portrait-mask.js';
import { cameraPresentationSettings, coverageOption, validBackdropColor } from '../../src/live-classroom/camera-settings.js';
import { writeBackdropMask } from '../../src/live-classroom/backdrop-mask.js';
import { createPortraitEdgeRefiner } from '../../src/live-classroom/portrait-edges.js';

function maskFixture() {
  const width = 12;
  const height = 5;
  const image = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  const history = new Float32Array(width * height);
  const alpha = (x, y = 2) => image.data[(y * width + x) * 4 + 3];
  const render = (values, elapsed = 33, coverage = 'balanced', motionImage, previousMotionImage) => {
    const confidence = Float32Array.from({ length: width * height }, (_, i) => values[i % width]);
    writePortraitMask(confidence, history, image, elapsed, coverageOption(coverage).threshold, motionImage, previousMotionImage);
  };
  return { alpha, render };
}

test('small confidence changes along a steady outline are damped over consecutive frames', () => {
  const { alpha, render } = maskFixture();
  render([0, 0, 0, 0, 0.48, 1, 1, 1, 1, 1, 1, 1], Infinity);
  const initial = alpha(4);
  render([0, 0, 0, 0, 0.58, 1, 1, 1, 1, 1, 1, 1]);
  assert.ok(alpha(4) > initial && alpha(4) - initial < 40);
  render([0, 0, 0, 0, 0.38, 1, 1, 1, 1, 1, 1, 1]);
  assert.ok(Math.abs(alpha(4) - initial) < 40);
  assert.equal(alpha(1), 0);
  assert.equal(alpha(8), 255);
});

test('a changing camera edge follows motion sooner than a stationary edge', () => {
  const before = [0, 0, 0, 0, 0.76, 1, 1, 1, 1, 1, 1, 1];
  const after = [0, 0, 0, 0, 0.21, 1, 1, 1, 1, 1, 1, 1];
  const stationary = maskFixture();
  const moving = maskFixture();
  const dark = new Uint8ClampedArray(12 * 5 * 4).fill(24);
  const movingImage = dark.slice();
  for (let y = 0; y < 5; y++) {
    const pixel = (y * 12 + 4) * 4;
    movingImage.fill(114, pixel, pixel + 3);
  }
  stationary.render(before, Infinity);
  moving.render(before, Infinity);
  stationary.render(after, 33, 'balanced', dark, dark);
  moving.render(after, 33, 'balanced', movingImage, dark);
  assert.equal(moving.alpha(4), 0);
  assert.ok(stationary.alpha(4) > 20);
});

test('the refined mask follows a camera boundary between model samples', () => {
  const mask = { width: 2, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0]) };
  const output = { width: 8, height: 1, data: new Uint8ClampedArray(32) };
  const camera = new Uint8ClampedArray(32);
  camera.fill(30, 0, 16);
  camera.fill(210, 16);
  const refine = createPortraitEdgeRefiner(mask, output);
  refine(camera);
  assert.ok(output.data[15] > 200);
  assert.ok(output.data[19] < 55);
  assert.equal(output.data[3], 255);
  assert.equal(output.data[31], 0);
});

test('a moving foreground and a resumed feed clear stale mask pixels', () => {
  const { alpha, render } = maskFixture();
  render([0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0], Infinity);
  render([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0]);
  assert.equal(alpha(3), 0);
  assert.equal(alpha(8), 255);
  render([0, 0, 0, 0, 0, 0, 0.48, 1, 1, 1, 0, 0], 250);
  const balanced = alpha(6);
  render([0, 0, 0, 0, 0, 0, 0.48, 1, 1, 1, 0, 0], 33, 'most');
  assert.ok(alpha(6) > balanced);
  assert.equal(alpha(2), 0);
});

test('solid backdrop removes the sampled hue in light and shadow and preserves a soft boundary', () => {
  const pixels = new Uint8ClampedArray([
    30, 160, 80, 255, // Backdrop in even light.
    14, 72, 36, 255, // The same backdrop in shadow.
    74, 158, 87, 255, // Boundary with a mix of foreground and backdrop.
    185, 124, 93, 255, // Skin.
    25, 38, 70, 255, // Dark blue clothing.
  ]);
  writeBackdropMask(pixels, '#1ea050', coverageOption('balanced').threshold);
  assert.equal(pixels[3], 0);
  assert.equal(pixels[7], 0);
  assert.ok(pixels[11] > 0 && pixels[11] < 255);
  assert.equal(pixels[15], 255);
  assert.equal(pixels[19], 255);
  const dark = new Uint8ClampedArray([2, 3, 3, 255, 100, 95, 87, 255]);
  writeBackdropMask(dark, '#000000', coverageOption('balanced').threshold);
  assert.deepEqual([dark[3], dark[7]], [0, 255]);
});

test('Weather view only receives the solid backdrop color for an unprocessed camera feed', () => {
  const settings = { coverage: 'most', backdropMode: 'solid', backdropColor: '#1ea050' };
  assert.deepEqual(cameraPresentationSettings(settings, null), { cameraCoverage: 'most', cameraBackdrop: '#1ea050' });
  assert.equal(cameraPresentationSettings(settings, { id: 'office' }).cameraBackdrop, null);
  assert.equal(cameraPresentationSettings({ ...settings, backdropMode: 'automatic' }, null).cameraBackdrop, null);
  assert.equal(validBackdropColor('green'), false);
  assert.equal(validBackdropColor('#1EA050'), true);
});
