import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, makeOverlay, normalizeProject } from '../../src/mayne-studio/model.js';
import { MESSAGE_STYLES, MESSAGE_FONTS, messageStyleDefaults,
  normalizeMessageAppearance, messageStyleId } from '../../src/mayne-studio/message-styles.js';

test('Message overlays offer six distinct, editable visual style presets',()=>{
  assert.deepEqual(Object.keys(MESSAGE_STYLES),
    ['classic','minimal','lowerthird','announcement','alert','glass']);
  assert.ok(Object.keys(MESSAGE_FONTS).length>=3);
  for (const [id,style] of Object.entries(MESSAGE_STYLES)) {
    assert.ok(style.description && style.name,'Style '+id+' has a label and description');
    const config=messageStyleDefaults(id);
    assert.equal(config.font,style.font);
    assert.equal(config.textColor,style.textColor);
    assert.equal(normalizeMessageAppearance(config,id).backgroundOpacity,style.backgroundOpacity);
  }
});

test('New and older message overlays preserve appearance and scene geometry',()=>{
  const project=makeProject('Overlay styles');
  const original=makeOverlay('message',{name:'Leadership welcome',text:'Welcome to class',
    messageStyle:'glass',messageAppearance:{
      ...messageStyleDefaults('glass'),font:'serif',weight:'800',
      size:135,align:'left',textColor:'#bada55',
      background:'#123abc',backgroundOpacity:74,
      accentEdge:'left',borderWidth:6,radius:32,shadow:false,
    },x:21,y:12,w:53,h:16});
  project.overlays.push(original);
  const saved=normalizeProject(JSON.parse(JSON.stringify(project)));
  const styled=saved.overlays.find(o=>o.id===original.id);
  assert.equal(styled.messageStyle,'glass');
  assert.deepEqual([styled.messageAppearance.font,styled.messageAppearance.weight,
    styled.messageAppearance.size,styled.messageAppearance.align,
    styled.messageAppearance.textColor,styled.messageAppearance.background,
    styled.messageAppearance.backgroundOpacity,styled.messageAppearance.accentEdge,
    styled.messageAppearance.borderWidth,styled.messageAppearance.radius,
    styled.messageAppearance.shadow],
    ['serif','800',135,'left','#bada55','#123abc',74,'left',6,32,false]);
  assert.deepEqual([styled.x,styled.y,styled.w,styled.h],[21,12,53,16]);
  const old=makeOverlay('message',{text:'Old message'});
  delete old.messageStyle;
  delete old.messageAppearance;
  project.overlays.push(old);
  const legacy=normalizeProject(project).overlays.find(o=>o.id===old.id);
  assert.equal(legacy.messageStyle,'classic');
  assert.deepEqual(legacy.messageAppearance,messageStyleDefaults('classic'));
});

test('Imported message appearance settings are strictly sanitized and isolated',()=>{
  const bad=normalizeMessageAppearance({
    font:'url(https://attacker)',weight:'1000',size:5000,align:'wrong',
    textColor:'red; color:evil',subColor:'#ab12ff',
    background:'#000000',backgroundOpacity:999,
    accent:'javascript:alert(1)',accentEdge:'script',border:'red',
    borderWidth:999,radius:-8,shadow:'yes',
  },'alert');
  assert.equal(bad.font,'sans');
  assert.equal(bad.weight,'800');
  assert.equal(bad.size,160);
  assert.equal(bad.align,'center');
  assert.equal(bad.textColor,MESSAGE_STYLES.alert.textColor);
  assert.equal(bad.subColor,'#ab12ff');
  assert.equal(bad.background,'#000000');
  assert.equal(bad.backgroundOpacity,100);
  assert.equal(bad.accent,MESSAGE_STYLES.alert.accent);
  assert.equal(bad.accentEdge,'left');
  assert.equal(bad.borderWidth,12);
  assert.equal(bad.radius,0);
  assert.equal(bad.shadow,true);
  assert.equal(messageStyleId('__proto__'),'classic');
  const project=makeProject('Safe import');
  project.overlays.push(makeOverlay('emoji',{name:'Emoji',emoji:'👍'}));
  project.overlays.push(makeOverlay('message',{messageStyle:'<script>',messageAppearance:bad}));
  const normalized=normalizeProject(project);
  assert.equal(normalized.overlays.find(o=>o.type==='emoji').messageAppearance,undefined);
  assert.equal(normalized.overlays.find(o=>o.type==='message').messageStyle,'classic');
});
