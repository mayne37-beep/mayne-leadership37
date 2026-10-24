import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ids=Array.from({length:8},(_,i)=>'l101-'+String(i+2).padStart(2,'0'));
for(const id of ids){
 test(id+' has a complete immersive branching graph',()=>{
  const story=JSON.parse(readFileSync(new URL('../data/leadership101-phase5/'+id+'.json',import.meta.url),'utf8'));
  assert.equal(story.version,2);assert.ok(story.nodes[story.start]);assert.equal(Object.keys(story.nodes).length,15);
  const visited=new Set(),pending=[story.start];
  while(pending.length){const at=pending.pop();if(visited.has(at))continue;assert.ok(story.nodes[at],id+' missing '+at);visited.add(at);const node=story.nodes[at];if(node.ending)continue;
   assert.ok(node.choices.length>=2,at);for(const choice of node.choices){assert.ok(choice.text.length>24);assert.ok(choice.reaction);assert.ok(choice.coaching);assert.ok(Number.isInteger(choice.trust));assert.ok(Number.isInteger(choice.pressure));if(choice.next==='__ending__')pending.push('ending-strong','ending-fragile','ending-damaged');else pending.push(choice.next)}
  }
  assert.equal(visited.size,15);
  for(const outcome of ['strong','fragile','damaged'])assert.equal(story.nodes['ending-'+outcome].ending,true);
  assert.ok(story.injectChoices.length>=2);
 });
}
