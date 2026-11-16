import test from 'node:test';
import assert from 'node:assert/strict';
import { writeBackdropMask } from '../../src/live-classroom/backdrop-mask.js';
import { makeProject, makeScene, makeSource, makeLayer, normalizeProject } from '../../src/mayne-studio/model.js';

const frame=(r,g,b)=>new Uint8ClampedArray([r,g,b,255]);
const apply=(r,g,b,settings)=>{
  const pixels=frame(r,g,b);
  writeBackdropMask(pixels,'#00a040',0.49,settings);
  return pixels;
};

test('default chroma settings remove the key color while preserving a contrasting presenter',()=>{
  assert.ok(apply(0,160,64,{keyStrength:50,keySoftness:50,keyDespill:0})[3]<5);
  assert.ok(apply(255,70,30,{keyStrength:50,keySoftness:50,keyDespill:0})[3]>230);
  const legacy=frame(0,160,64);
  writeBackdropMask(legacy,'#00a040',0.49);
  assert.deepEqual(legacy,apply(0,160,64,{keyStrength:50,keySoftness:50,keyDespill:0}),
    'Existing Classroom Response Studio key masks keep their original defaults');
});

test('zero key strength shows the original and increasing strength removes more colors',()=>{
  const raw=apply(0,160,64,{keyStrength:0});
  assert.equal(raw[3],255);
  const candidate=[45,171,76];
  const soft=apply(...candidate,{keyStrength:10,keySoftness:40});
  const strong=apply(...candidate,{keyStrength:90,keySoftness:40});
  assert.ok(strong[3]<=soft[3],
    'Higher key strength never restores color that was already removed');
  const noSpill=apply(...candidate,{keyStrength:55,keySoftness:80,keyDespill:0});
  const spill=apply(...candidate,{keyStrength:55,keySoftness:80,keyDespill:90});
  assert.ok(spill[1]<=noSpill[1],
    'Despill reduces the keyed channel at semitransparent edges');
});

test('camera chroma settings save, load, and sanitize independently per layer',()=>{
  const project=makeProject();
  const source=makeSource('camera','Instructor camera');
  const scene=makeScene('blank','Studio');
  const layer=makeLayer(source.id);
  Object.assign(layer,{matte:'chroma',key:'#3366cc',keyStrength:83,keySoftness:32,keyDespill:61,
    x:64,w:30});
  scene.layers.push(layer);
  project.sources.push(source);
  project.scenes.push(scene);
  const loaded=normalizeProject(JSON.parse(JSON.stringify(project)));
  assert.equal(loaded.scenes[0].layers[0].key,'#3366cc');
  assert.equal(loaded.scenes[0].layers[0].keyStrength,83);
  assert.equal(loaded.scenes[0].layers[0].keySoftness,32);
  assert.equal(loaded.scenes[0].layers[0].keyDespill,61);
  assert.equal(loaded.scenes[0].layers[0].x,64);
  assert.equal(loaded.scenes[0].layers[0].w,30);
  const legacy=JSON.parse(JSON.stringify(project));
  const oldLayer=legacy.scenes[0].layers[0];
  delete oldLayer.keyStrength;
  delete oldLayer.keySoftness;
  delete oldLayer.keyDespill;
  const backward=normalizeProject(legacy).scenes[0].layers[0];
  assert.deepEqual([backward.keyStrength,backward.keySoftness,backward.keyDespill],[50,50,0]);
  oldLayer.keyStrength=200;
  oldLayer.keySoftness=-20;
  oldLayer.keyDespill=NaN;
  const sanitized=normalizeProject(legacy).scenes[0].layers[0];
  assert.deepEqual([sanitized.keyStrength,sanitized.keySoftness,sanitized.keyDespill],[100,0,0]);
});
