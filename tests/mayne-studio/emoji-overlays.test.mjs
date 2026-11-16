import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, makeOverlay, normalizeProject, OVERLAY_CHOICES } from '../../src/mayne-studio/model.js';
import { EMOJI_GROUPS, EMOJI_LIST, DEFAULT_EMOJI, findEmoji, emojiOptions } from '../../src/mayne-studio/emojis.js';

test('a large curated set of emoji reactions can be selected without external calls',()=>{
  assert.ok(EMOJI_LIST.length>=120,'Offer many emojis, not just a few fixed reactions');
  assert.ok(Object.keys(EMOJI_GROUPS).length>=6,'Several useful classroom emoji categories');
  assert.equal(EMOJI_LIST.length,new Set(EMOJI_LIST.map(x=>x.emoji)).size,'Emoji entries are unique');
  assert.equal(findEmoji('👏').label,'Clapping hands');
  assert.equal(findEmoji('😎').label,'Cool sunglasses');
  assert.equal(findEmoji('🎯').category,'classroom');
  assert.equal(findEmoji('<script>'),null);
  assert.ok(emojiOptions('gestures','thumb').some(x=>x.emoji==='👍'));
  assert.equal(emojiOptions('celebration','thumb').length,0);
  assert.ok(emojiOptions('all','fire').some(x=>x.emoji==='🔥'));
  assert.equal(emojiOptions('all','this is not an emoji').length,0);
});

test('Emoji is a first-class overlay in addition to image/video/message',()=>{
  assert.deepEqual(Object.keys(OVERLAY_CHOICES),['image','video','message','emoji']);
  const overlay=makeOverlay('emoji');
  assert.equal(overlay.type,'emoji');
  assert.equal(overlay.emoji,DEFAULT_EMOJI);
  assert.equal(overlay.animation,'pop');
  assert.equal(overlay.exitAnimation,'fade');
  assert.equal(overlay.seconds,5);
  assert.deepEqual([overlay.x,overlay.y,overlay.w,overlay.h],[73,12,19,27]);
});

test('Emoji choice, animation and geometry survive project save/load, bad values are sanitized',()=>{
  const project=makeProject('Emoji Classroom');
  const overlay=makeOverlay('emoji',{name:'Awesome reaction',emoji:'🤩',x:41,y:17,w:24,h:29,
    animation:'slide-left',exitAnimation:'fade',seconds:8,opacity:84});
  project.overlays.push(overlay);
  const saved=normalizeProject(project);
  const after=saved.overlays.find(o=>o.id===overlay.id);
  assert.deepEqual([after.type,after.name,after.emoji,after.animation,after.exitAnimation,
    after.seconds,after.opacity,after.x,after.y,after.w,after.h],
    ['emoji','Awesome reaction','🤩','slide-left','fade',8,84,41,17,24,29]);
  const tampered=structuredClone(project);
  tampered.overlays.find(o=>o.id===overlay.id).emoji='<script>alert(1)</script>';
  assert.equal(normalizeProject(tampered).overlays.find(o=>o.id===overlay.id).emoji,DEFAULT_EMOJI);
  assert.equal(saved.scenes.length,0,'Adding an emoji overlay creates no template scenes');
  assert.equal(saved.sources.length,0,'No camera, input or media needed');
});
