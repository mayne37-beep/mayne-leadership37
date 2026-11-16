import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProject, makeScene, makeSource, makeLayer, linkReusedDecks,
  linkSceneDecks, syncLinkedDecks, normalizeProject, visibleSceneLayers } from '../../src/mayne-studio/model.js';

function threeStudioProject(){
  const project=makeProject('Leadership training studios');
  const deck=makeSource('powerpoint','Leadership 101',{page:0,sync:false});
  const sharedScene=makeScene('blank','PowerPoint slides');
  const studio1=makeScene('blank','Classroom studio');
  const studio2=makeScene('blank','News studio');
  const studio3=makeScene('blank','Standing studio');
  const ref=makeSource('scene','Shared presentation',{sceneId:sharedScene.id});
  const ppt=makeLayer(deck.id);
  ppt.page=4;
  sharedScene.layers.push(ppt);
  for (const scene of [studio1,studio2,studio3])
    scene.layers.push(makeLayer(ref.id,{x:10,y:6,w:66,h:60}));
  project.sources.push(deck,ref);
  project.scenes.push(sharedScene,studio1,studio2,studio3);
  return {project,deck,sharedScene,studios:[studio1,studio2,studio3]};
}

const snapshot=(project,id)=>({
  scene:structuredClone(project.scenes.find(s=>s.id===id)),
  scenes:new Map(project.scenes.map(s=>[s.id,structuredClone(s)])),
  sources:new Map(project.sources.map(s=>[s.id,structuredClone(s)])),
});

test('automatically link an existing shared PPT scene across three studios',()=>{
  const {project,deck,sharedScene,studios}=threeStudioProject();
  assert.equal(deck.sync,false,'legacy project has no manual sync flag');
  const program=snapshot(project,studios[0].id),previous=snapshot(project,studios[2].id);
  const linked=linkReusedDecks(project);
  assert.deepEqual([...linked],[deck.id]);
  assert.equal(deck.sync,true);
  assert.equal(deck.page,4,'take initial slide from the original PowerPoint scene');
  syncLinkedDecks(project,[program,previous]);
  assert.equal(program.scenes.get(sharedScene.id).layers[0].page,4);
  assert.equal(previous.scenes.get(sharedScene.id).layers[0].page,4);
  deck.page=7;
  syncLinkedDecks(project,[program,previous]);
  for(const scene of project.scenes){
    const ppt=scene.layers.find(layer=>layer.source===deck.id);
    if(ppt)assert.equal(ppt.page,7);
  }
  for(const shot of [program,previous]){
    assert.equal(shot.scenes.get(sharedScene.id).layers[0].page,7);
    assert.equal(visibleSceneLayers(shot)[0].layer.page,7);
  }
  const saved=normalizeProject(JSON.parse(JSON.stringify(project)));
  assert.equal(saved.sources.find(s=>s.id===deck.id).page,7);
  assert.equal(saved.sources.find(s=>s.id===deck.id).sync,true);
  assert.equal(saved.scenes[0].layers[0].page,7);
});

test('adding a PowerPoint later to a previously embedded scene starts sharing automatically',()=>{
  const {project,sharedScene,studios}=threeStudioProject();
  const deck=project.sources.find(s=>s.type==='powerpoint');
  sharedScene.layers=[];
  syncLinkedDecks(project);
  assert.equal(deck.sync,false,'no PowerPoint was available to link yet');
  const newDeck=makeLayer(deck.id);
  newDeck.page=3;
  sharedScene.layers.push(newDeck);
  const live=snapshot(project,studios[1].id);
  syncLinkedDecks(project,[live]);
  assert.equal(deck.sync,true,'shared scene discovers the new slide deck');
  assert.equal(deck.page,3);
  assert.equal(live.scenes.get(sharedScene.id).layers[0].page,3);
  deck.page=6;
  syncLinkedDecks(project,[live]);
  assert.equal(live.scenes.get(sharedScene.id).layers[0].page,6);
});

test('when sharing a currently live deck keep its on-air page instead of resetting to saved edit page',()=>{
  const project=makeProject('Live studio');
  const deck=makeSource('powerpoint','Course',{page:0,sync:false});
  const one=makeScene('blank','Main screen');
  const two=makeScene('blank','Studio inset');
  const first=makeLayer(deck.id);first.page=1;one.layers.push(first);
  project.sources.push(deck);
  project.scenes.push(one,two);
  const live=snapshot(project,one.id);
  live.scene.layers[0].page=5;
  live.scenes.get(one.id).layers[0].page=5;
  const second=makeLayer(deck.id);second.page=1;two.layers.push(second);
  syncLinkedDecks(project,[live]);
  assert.equal(deck.page,5,'in-progress Program slide has priority at link time');
  assert.equal(one.layers[0].page,5);
  assert.equal(two.layers[0].page,5);
  assert.equal(live.scene.layers[0].page,5);
});

test('directly reused PPT inputs also share; a standalone deck remains independent',()=>{
  const project=makeProject();
  const deck=makeSource('powerpoint','Project deck');
  const slides=makeScene('blank','Slides');
  slides.layers.push(makeLayer(deck.id));
  project.sources.push(deck);
  project.scenes.push(slides);
  assert.equal(linkReusedDecks(project).size,0);
  syncLinkedDecks(project);
  assert.equal(deck.sync,false,'ordinary Preview and Program navigation remains independent');
  const another=makeScene('blank','Studio camera plus slides');
  another.layers.push(makeLayer(deck.id));
  project.scenes.push(another);
  assert.ok(linkReusedDecks(project).has(deck.id));
  assert.equal(deck.sync,true);
});

test('deeply nested PPT scenes propagate through reused studios without a cycle',()=>{
  const {project,deck,sharedScene,studios}=threeStudioProject();
  const outer=makeScene('blank','Intermediate view');
  const ref=project.sources.find(s=>s.type==='scene');
  outer.layers.push(makeLayer(ref.id));
  const middle=makeSource('scene','Intermediate',{sceneId:outer.id});
  project.sources.push(middle);
  project.scenes.push(outer);
  studios[2].layers=[makeLayer(middle.id)];
  assert.equal(linkReusedDecks(project).has(deck.id),true);
  const shot=snapshot(project,studios[2].id);
  deck.page=9;
  syncLinkedDecks(project,[shot]);
  assert.equal(visibleSceneLayers(shot)[0].layer.page,9);
  assert.equal(shot.scenes.get(sharedScene.id).layers[0].page,9);
  assert.equal(canSave(project),true);
});
function canSave(project){
  return normalizeProject(JSON.parse(JSON.stringify(project))).scenes.length===project.scenes.length;
}
