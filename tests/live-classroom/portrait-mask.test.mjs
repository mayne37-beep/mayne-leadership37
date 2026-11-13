import assert from 'node:assert/strict';
import test from 'node:test';
import { writePortraitMask } from '../../src/live-classroom/portrait-mask.js';
import { coverageOption } from '../../src/live-classroom/camera-settings.js';

function maskFixture() {
  const width = 12;
  const height = 5;
  const image = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  const history = new Float32Array(width * height);
  const alpha = (x, y = 2) => image.data[(y * width + x) * 4 + 3];
  const render = (values, elapsed = 33, coverage = 'balanced') => {
    const confidence = Float32Array.from({ length: width * height }, (_, i) => values[i % width]);
    writePortraitMask(confidence, history, image, elapsed, coverageOption(coverage).threshold);
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
