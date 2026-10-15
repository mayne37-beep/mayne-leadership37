import test from 'node:test';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';
import handler from '../../api/systems-studio.js';import {template} from '../../assets/systems/templates.js';
import middleware from '../../middleware.js';
const secret='test-systems-secret',verifier='b'.repeat(64),expiry=Math.floor(Date.now()/1000)+3600;
const cookie='__Host-mayne-access=v1.'+expiry+'.'+createHmac('sha256',secret).update('v1:'+expiry+':'+verifier).digest('hex');
process.env.LEADERSHIP_ACCESS_SECRET=secret;process.env.LEADERSHIP_ACCESS_PIN_VERIFIER=verifier;
async function invoke(action='list',payload={},extra={}){const req={method:'POST',headers:{host:'example.invalid',origin:'https://example.invalid','content-type':'application/json',cookie},body:{action,payload},...extra};const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(d){this.data=d;return this;}};await handler(req,res);return res;}
test('API PIN, origin, method, malformed projects and classroom proof protection',async()=>{
 assert.equal((await invoke('list',{}, {headers:{host:'example.invalid',origin:'https://example.invalid','content-type':'application/json'}})).statusCode,401);
 assert.equal((await invoke('list',{}, {method:'GET'})).statusCode,405);
 assert.equal((await invoke('list',{}, {headers:{cookie,origin:'https://evil.invalid',host:'example.invalid','content-type':'application/json'}})).statusCode,403);
 assert.equal((await invoke('save',{id:crypto.randomUUID(),version:0,data:{}})).statusCode,400);
 assert.equal((await invoke('session-save',{room:'a'.repeat(48),id:crypto.randomUUID(),version:1,data:template('burnout')})).statusCode,400);
 assert.equal((await invoke('session-reflect',{room:'a'.repeat(48),member:crypto.randomUUID(),proof:'bad',reflection:'hello'})).statusCode,400);
 delete process.env.LESSON_STUDIO_GATEWAY_KEY;assert.equal((await invoke()).statusCode,503);
});
test('API forwards only validated requests and maps database conflicts / locks',async()=>{
 const original=globalThis.fetch;process.env.LESSON_STUDIO_GATEWAY_KEY='c'.repeat(64);let passed;
 try{globalThis.fetch=async(url,opt)=>{passed=JSON.parse(opt.body);return {ok:true,json:async()=>({version:1})};};const p=template('burnout');assert.equal((await invoke('save',{id:p.id,version:0,data:p})).statusCode,200);assert.equal(passed.p_action,'save');
  await invoke('session-create',{id:p.id});assert.match(passed.p_payload.room,/^[a-f0-9]{48}$/);assert(passed.p_payload.session);
  globalThis.fetch=async()=>({ok:false,json:async()=>({code:'40001'})});assert.equal((await invoke('save',{id:p.id,version:1,data:p})).statusCode,409);
  globalThis.fetch=async()=>({ok:false,json:async()=>({code:'42501'})});assert.equal((await invoke('session-get',{room:'a'.repeat(48)})).statusCode,403);
 }finally{globalThis.fetch=original;delete process.env.LESSON_STUDIO_GATEWAY_KEY;}
});
test('middleware exposes student modules while retaining instructor and other app protection',async()=>{
 for(const path of ['/systems-mapping-join.html','/api/systems-studio','/assets/systems/model.js','/assets/systems/storage.js','/collaboration-join.html','/assets/collaboration-canvas.js'])assert.equal((await middleware(new Request('https://example.invalid'+path))).status,200,path);
 for(const path of ['/systems-mapping-studio.html','/tools.html','/collaboration-canvas.html','/escape-room-studio.html'])assert.equal((await middleware(new Request('https://example.invalid'+path))).status,302,path);
});
