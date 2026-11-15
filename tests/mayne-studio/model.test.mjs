import assert from 'node:assert/strict';
import test from 'node:test';
import { assetIds, audioWeights, clock, dbGain, makeLayer, makeProject, makeSource, normalizeProject,
  transitionProgress, uid } from '../../src/mayne-studio/model.js';

test('a classroom project has ready-to-cue scenes and overlay shortcuts', () => {
  const project = makeProject();
  assert.deepEqual(project.scenes.map(scene => scene.template), ['standby', 'presenter', 'slides', 'discussion', 'activity', 'break']);
  assert.deepEqual(project.overlays.map(overlay => overlay.type), ['lower', 'message', 'arrow', 'hand']);
  assert.deepEqual(normalizeProject(project), project);
});

test('project restore keeps layouts, slide positions, and device-local media references', () => {
  const project = makeProject();
  const source = makeSource('powerpoint', 'Slides', { asset: uid() });
  project.sources.push(source);
  const layer = { ...makeLayer(source.id), page: 4, matte: 'person', w: 70 };
  project.scenes[2].layers.push(layer, makeLayer(uid()));
  project.scenes[2].backdrop = uid();
  const restored = normalizeProject(project);
  assert.deepEqual(restored.scenes[2].layers, [layer]);
  assert.deepEqual(assetIds(restored), [source.asset, project.scenes[2].backdrop]);
  assert.throws(() => normalizeProject({ version: 1, scenes: [] }), /no valid scenes/);
});

test('scene-follow audio crossfades and shared inputs stay at full gain', () => {
  const old = { layers: [{ source: 'music', visible: true }, { source: 'camera', visible: true },
    { source: 'hidden', visible: false }] };
  const next = { layers: [{ source: 'camera', visible: true }, { source: 'slides', visible: true }] };
  assert.deepEqual(Object.fromEntries(audioWeights(next, old, 0.25)), { music: 0.75, camera: 1, slides: 0.25 });
  assert.deepEqual(transitionProgress(100, 500, 350), { progress: 0.5, eased: 0.5 });
  assert.equal(transitionProgress(100, 500, 900).progress, 1);
  assert.equal(dbGain(0), 1);
  assert.equal(dbGain(-60), 0);
  assert.equal(clock(3702, true), '01:01:42');
});
