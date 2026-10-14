import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHmac} from 'node:crypto';
import handler from '../../api/escape-studio.js';
import {validateDraft,validatePublished,learnerProject} from '../../src/escape/model.js';
const example=JSON.parse(fs.readFileSync(new URL('../../assets/escape-room/example.project.json',import.meta.url),'utf8'));
const secret='escape-test-secret',verifier='b'.repeat(64),expires=Math.floor(Date.now()/1000)+3600;
const cookie='__Host-mayne-access=v1.'+expires+'.'+createHmac('sha256',secret).update('v1:'+expires+':'+verifier).digest('hex');
async function invoke(overrides={}){const req={method:'POST',headers:{cookie,host:'www.mayneleadership.com',origin:'https://www.mayneleadership.com','content-type':'application/json'},body:{action:'list',payload:{}},query:{},...overrides};const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;},send(data){this.data=data;return this;}};await handler(req,res);return res;}
test('draft validation permits unfinished authoring, publication requires valid puzzles',()=>{
 assert.deepEqual(validateDraft(example),[]);assert.deepEqual(validatePublished(example),[]);
 const draft=structuredClone(example);draft.scenes[2].objects=draft.scenes[2].objects.filter(o=>o.type!=='finish');
 assert.deepEqual(validateDraft(draft),[]);assert.ok(validatePublished(draft).some(x=>x.includes('Finish')));
 draft.scenes[0].background.data='https://unrelated.invalid/image.jpg';assert.ok(validateDraft(draft).length);
});
test('API separates instructor access, learner tokens, origins, payloads and methods',async()=>{
 process.env.LEADERSHIP_ACCESS_SECRET=secret;process.env.LEADERSHIP_ACCESS_PIN_VERIFIER=verifier;process.env.LESSON_STUDIO_GATEWAY_KEY='c'.repeat(64);
 assert.equal((await invoke({headers:{},body:{action:'get',payload:{id:example.id}}})).statusCode,401);
 assert.equal((await invoke({method:'GET',headers:{},query:{action:'list'}})).statusCode,401);
 assert.equal((await invoke({headers:{...{cookie},host:'www.mayneleadership.com',origin:'https://evil.invalid','content-type':'application/json'}})).statusCode,403);
 assert.equal((await invoke({headers:{cookie,host:'www.mayneleadership.com',origin:'https://www.mayneleadership.com','content-type':'text/plain'}})).statusCode,415);
 assert.equal((await invoke({method:'DELETE'})).statusCode,405);
 assert.equal((await invoke({body:{action:'published',payload:{room:'not-a-token'}},headers:{}})).statusCode,400);
 assert.equal((await invoke({body:{action:'save',payload:{id:'other',version:0,data:example}}})).statusCode,400);
 assert.equal((await invoke({body:{action:'progress',payload:{room:'a'.repeat(48),proof:'b'.repeat(48),progress:{finished:true}}}})).statusCode,400);
});
test('published player gets room-scoped assets and has a separate progress identity',()=>{
 const p=structuredClone(example),asset='/api/escape-studio?action=asset&id=asset-'+'a'.repeat(64);p.scenes[0].background.data=asset;
 const copy=learnerProject(p,'b'.repeat(48),8);
 assert.equal(copy.id,p.id+'-v8');assert.equal(copy.scenes[0].background.data,asset+'&room='+'b'.repeat(48));assert.equal(p.scenes[0].background.data,asset);
});
test('instructor save, publish and learner fetch use the existing gateway without exposing its secret',async()=>{
 const originalFetch=globalThis.fetch;let calls=[];
 globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);const data=body.p_action==='get'?{data:example,version:1}:body.p_action==='published'?{data:example,version:1}:{id:example.id,version:1,token:'d'.repeat(48)};return {ok:true,json:async()=>data};};
 try{
  const saved=await invoke({body:{action:'save',payload:{id:example.id,version:0,data:example}}});assert.equal(saved.statusCode,200);assert.equal(calls.at(-1).p_key,'c'.repeat(64));
  const pub=await invoke({body:{action:'publish',payload:{id:example.id,version:1}}});assert.equal(pub.statusCode,200);assert.equal(calls.at(-1).p_action,'publish');
  const learner=await invoke({method:'GET',headers:{},query:{action:'published',room:'d'.repeat(48)}});assert.equal(learner.statusCode,200);assert.equal(learner.data.data.id,example.id+'-v1');assert.ok(!JSON.stringify(learner.data).includes('c'.repeat(64)));
 }finally{globalThis.fetch=originalFetch;}
});
