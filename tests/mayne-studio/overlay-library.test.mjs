import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, makeOverlay, normalizeProject, OVERLAY_LIMIT, OVERLAY_GROUPS,
  overlayGroup } from '../../src/mayne-studio/model.js';
import { DEFAULT_SHORTCUTS, normalizeExtraShortcuts, shortcutAction,
  overlayShortcutLabel, EXTRA_SHORTCUT_LIMIT } from '../../src/mayne-studio/shortcuts.js';

const identity = number => 'example-overlay-'+number;
const shortcut = (id,action,key) => ({id,action,key});

test('up to 100 overlays survive normalization and a backup round-trip',()=>{
  assert.equal(OVERLAY_LIMIT,100);
  const project=makeProject('Large overlay library');
  project.overlays=Array.from({length:105},(_,i)=>makeOverlay(i%2?'emoji':'message',
    {id:identity(i),name:'Overlay '+i,group:i%2?'emojis':'announcements'}));
  const result=normalizeProject(JSON.parse(JSON.stringify(project)));
  assert.equal(result.overlays.length,100);
  assert.equal(result.overlays[99].id,identity(99));
  assert.equal(result.overlays[98].group,'announcements');
  assert.equal(result.overlays[99].group,'emojis');
  assert.equal(Object.keys(OVERLAY_GROUPS).length>=6,true);
  assert.equal(overlayGroup('unsafe-category','arrow'),'pointers');
  assert.equal(overlayGroup('__proto__','emoji'),'emojis');
  const reloaded=normalizeProject(JSON.parse(JSON.stringify(result)));
  assert.equal(reloaded.overlays.length,100);
});

test('additional keyboard assignments can target overlay 9 through 100 by stable ID',()=>{
  const project=makeProject();
  project.overlays=Array.from({length:100},(_,i)=>makeOverlay('message',
    {id:identity(i),name:'Message '+i}));
  project.extraShortcuts=[
    shortcut('extra-a','overlay:'+identity(8),'Ctrl+Shift+KeyJ'),
    shortcut('extra-b','overlay:'+identity(99),'Alt+KeyL'),
    shortcut('extra-c','take','Shift+F10'),
  ];
  const result=normalizeProject(project);
  assert.equal(shortcutAction(result.shortcuts,'Ctrl+Shift+KeyJ',result.extraShortcuts),
    'overlay:'+identity(8));
  assert.equal(shortcutAction(result.shortcuts,'Alt+KeyL',result.extraShortcuts),
    'overlay:'+identity(99));
  assert.equal(shortcutAction(result.shortcuts,'Shift+F10',result.extraShortcuts),'take');
  assert.equal(overlayShortcutLabel(result,8),'Ctrl + Shift + J');
  assert.equal(overlayShortcutLabel(result,99),'Alt + L');
  assert.equal(overlayShortcutLabel(result,0),'Q');
  result.overlays.splice(1,1); // A deletion cannot retarget stable-ID custom bindings
  assert.equal(shortcutAction(result.shortcuts,'Alt+KeyL',result.extraShortcuts),
    'overlay:'+identity(99));
});

test('custom assignments are validated, deduplicated and trimmed safely',()=>{
  const overlays=['overlay-x','overlay-y'];
  const cases=[
    shortcut('one','overlay:overlay-x','Ctrl+Shift+KeyJ'),
    shortcut('two','overlay:overlay-y','Ctrl+Shift+KeyJ'),
    shortcut('three','take','Space'),
    shortcut('four','not-a-command','Alt+KeyA'),
    shortcut('five','overlay:missing','Alt+KeyB'),
    shortcut('six','take','javascript:evil'),
    shortcut('seven','cut',''),
  ];
  const normalized=normalizeExtraShortcuts(cases,DEFAULT_SHORTCUTS,overlays);
  assert.deepEqual(normalized,[
    shortcut('one','overlay:overlay-x','Ctrl+Shift+KeyJ'),
    shortcut('two','overlay:overlay-y',''),
    shortcut('three','take',''),
    shortcut('six','take',''),
    shortcut('seven','cut',''),
  ]);
  assert.equal(normalizeExtraShortcuts(Array.from({length:EXTRA_SHORTCUT_LIMIT+40},(_,i)=>
    shortcut('x'+i,'take','')),DEFAULT_SHORTCUTS,overlays).length,EXTRA_SHORTCUT_LIMIT);
});

test('older projects without additional shortcuts still normalize safely',()=>{
  const project=makeProject();
  delete project.extraShortcuts;
  const output=normalizeProject(project);
  assert.deepEqual(output.extraShortcuts,[]);
  assert.equal(output.shortcuts.overlay0,'KeyQ');
});
