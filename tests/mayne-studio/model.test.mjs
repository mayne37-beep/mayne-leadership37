import assert from 'node:assert/strict';
import test from 'node:test';
import { TRANSITIONS, DEFAULT_FAVORITE_TRANSITIONS, normalizeFavoriteTransitions } from '../../src/mayne-studio/transitions.js';
import { assetIds, audioWeights, clock, dbGain, makeLayer, makeProject, makeSource, normalizeProject, assignDeviceToScene, isDefaultSharedCameraInset,
  transitionProgress, uid } from '../../src/mayne-studio/model.js';

test('a classroom project has ready-to-cue scenes and overlay shortcuts', () => {
  const project = makeProject();
  assert.deepEqual(project.scenes.map(scene => scene.template), ['standby', 'presenter', 'slides', 'discussion', 'activity', 'break']);
  assert.deepEqual(project.overlays.map(overlay => overlay.type), ['message']);
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

test('new transition choices survive project restore and old wipe projects stay valid', () => {
  const project = makeProject();
  for (const choice of Object.keys(TRANSITIONS)) {
    project.transition = choice;
    assert.equal(normalizeProject(project).transition, choice, choice);
  }
  project.transition = 'unknown-transition';
  assert.equal(normalizeProject(project).transition, 'fade');
  project.transition = 'wipe';
  assert.equal(normalizeProject(project).transition, 'wipe');
});

test('five distinct favorite transitions default, restore, and validate on legacy projects', () => {
  const project = makeProject();
  assert.deepEqual(project.favoriteTransitions, DEFAULT_FAVORITE_TRANSITIONS);
  const custom = ['iris', 'slide-down', 'push-up', 'wipe-left', 'zoom-out'];
  project.favoriteTransitions = custom;
  assert.deepEqual(normalizeProject(project).favoriteTransitions, custom);
  delete project.favoriteTransitions;
  assert.deepEqual(normalizeProject(project).favoriteTransitions, DEFAULT_FAVORITE_TRANSITIONS,
    'Old projects without favorites acquire five distinct defaults');
  const repaired = normalizeFavoriteTransitions(['wipe', 'wipe', 'fake-transition', 'zoom-out', 'iris']);
  assert.equal(repaired.length, 5);
  assert.equal(new Set(repaired).size, 5);
  assert.equal(repaired[0], 'wipe');
  assert.equal(repaired[3], 'zoom-out');
  assert.equal(repaired[4], 'iris');
  assert.ok(repaired.every(type => Object.hasOwn(TRANSITIONS, type)));
  assert.deepEqual(normalizeFavoriteTransitions('bad data'), DEFAULT_FAVORITE_TRANSITIONS);
});

test('image, video, and message overlays persist independent layout and pop-up/down effects', () => {
  const project = makeProject();
  const base = project.overlays[0];
  project.overlays = [
    { ...base, id: 'message', type: 'message', text: 'Update', sub: 'Secondary',
      x: 17, y: 23, w: 41, h: 16, animation: 'pop', exitAnimation: 'slide-left', opacity: 77, seconds: 6 },
    { ...base, id: 'image', type: 'image', asset: 'file-img', animation: 'slide-right',
      exitAnimation: 'fade', x: 5, y: 40, w: 40, h: 38, fit: 'cover', opacity: 65 },
    { ...base, id: 'video', type: 'video', asset: 'file-video', animation: 'fade',
      exitAnimation: 'pop', x: 18, y: 3, w: 30, h: 50, fit: 'contain', loop: false },
  ];
  const restored = normalizeProject(project);
  assert.deepEqual(restored.overlays.map(o => o.type), ['message','image','video']);
  assert.equal(restored.overlays[0].exitAnimation,'slide-left');
  assert.equal(restored.overlays[0].opacity,77);
  assert.equal(restored.overlays[0].x,17);
  assert.equal(restored.overlays[1].fit,'cover');
  assert.equal(restored.overlays[1].asset,'file-img');
  assert.equal(restored.overlays[2].loop,false);
  assert.ok(assetIds(restored).includes('file-video'));
  assert.ok(assetIds(restored).includes('file-img'));

  const { exitAnimation: _ignored, ...legacyBase } = base;
  project.overlays = [{ ...legacyBase, id:'legacy', type:'hand', text:'Raise your hand',
    animation:'pop' }, {...legacyBase,id:'old-media',type:'graphic',asset:'old-asset'}];
  const legacy = normalizeProject(project);
  assert.deepEqual(legacy.overlays.map(o => o.type),['hand','graphic']);
  assert.equal(legacy.overlays[0].exitAnimation,'pop');
  assert.ok(assetIds(legacy).includes('old-asset'));
});


test('connected camera is assigned only to explicitly selected scenes, reusing one source ID', () => {
  const project = makeProject();
  const cameraA = makeSource('camera', 'Camera A');
  const cameraB = makeSource('camera', 'Camera B');
  const cameraC = makeSource('camera', 'Camera C');
  const mic = makeSource('mic', 'Instructor microphone');
  project.sources.push(cameraA,cameraB,cameraC,mic);
  const [one,two,three,four,five,six] = project.scenes;
  const originalA=makeLayer(cameraA.id, {x:19,y:18,w:47,h:67});
  one.layers.push(originalA);
  assignDeviceToScene(project,two,cameraB);
  assignDeviceToScene(project,three,cameraC);
  assignDeviceToScene(project,five,cameraA);
  assignDeviceToScene(project,six,cameraA);
  assignDeviceToScene(project,one,mic);

  assert.deepEqual(project.scenes.map(scene => scene.layers
    .filter(layer => [cameraA.id,cameraB.id,cameraC.id].includes(layer.source))
    .map(layer => layer.source)),[
      [cameraA.id],[cameraB.id],[cameraC.id],[],[cameraA.id],[cameraA.id],
    ], 'Camera A is only used by scenes 1/5/6; B only scene 2; C only scene 3');
  assert.equal(assignDeviceToScene(project,five,cameraA).id,five.layers[0].id,
    'Reassigning a shared camera never duplicates the layer');
  assert.equal(originalA.x,19,'Original camera geometry remains independent');
  assert.equal(assignDeviceToScene(project,four,cameraA).x,74,
    'Adding an explicit camera layer starts with an editable inset');
  four.layers=four.layers.filter(layer=>layer.source!==cameraA.id);
  assert.equal(four.layers.length,0,'Removing from one scene does not affect other camera assignments');
  assert.equal(project.sources.filter(source=>source.type==='camera').length,3,
    'Only three logical camera sources exist regardless of scene assignments');
  assert.equal(mic.route,'always','The instructor microphone uses one global audio channel');
  assert.deepEqual(project.scenes.map(scene=>scene.layers.filter(l=>l.source===mic.id).length),
    [1,0,0,0,0,0],'Microphone does not need an automatic layer in every scene');
  const restored=normalizeProject(project);
  assert.deepEqual(restored.scenes.map(scene=>scene.layers
    .filter(layer=>layer.source===cameraA.id).length),[1,0,0,0,1,1],
    'Only explicit camera scene assignments persist');
});

test('candidate cleanup identifies untouched default camera insets but never removes them automatically', () => {
  const project=makeProject();
  const camera=makeSource('camera','Camera');
  project.sources.push(camera);
  const inset=assignDeviceToScene(project,project.scenes[1],camera);
  assert.equal(isDefaultSharedCameraInset(inset,camera),true);
  inset.w=32;
  assert.equal(isDefaultSharedCameraInset(inset,camera),false,
    'A manually resized inset is not suggested for cleanup');
  assert.equal(isDefaultSharedCameraInset(makeLayer(camera.id,{x:74,y:53,w:22,h:36}),camera),true);
  const before=project.scenes.map(s=>s.layers.length);
  assert.deepEqual(project.scenes.map(s=>s.layers.length),before,
    'Detection does not modify any stored layers');
  assert.throws(()=>assignDeviceToScene(project,project.scenes[0],makeSource('camera','Missing')),
    /Choose an existing camera/);
  const extra=project.scenes[2];
  for(let i=0;i<40;i++) extra.layers.push(makeLayer('fill-'+i));
  assert.throws(()=>assignDeviceToScene(project,extra,camera),/already has 40 layers/);
  assert.equal(extra.layers.length,40,'Capacity error does not alter other scenes');
});
