import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import handler from '../api/video-ai.js';

const before={
 secret:process.env.LEADERSHIP_ACCESS_SECRET,
 verifier:process.env.LEADERSHIP_ACCESS_PIN_VERIFIER,
 eleven:process.env.ELEVENLABS_API_KEY,
 heygen:process.env.HEYGEN_API_KEY
};
const SECRET='video-test-secret';
const VERIFIER='e'.repeat(64);
function cookie(){
 const expires=Math.floor(Date.now()/1000)+1800;
 const signature=createHmac('sha256',SECRET).update('v1:'+expires+':'+VERIFIER).digest('hex');
 return '__Host-mayne-access=v1.'+expires+'.'+signature;
}
function response(){
 return {
  statusCode:200,headers:{},payload:null,
  setHeader(name,value){this.headers[name.toLowerCase()]=value;},
  status(n){this.statusCode=n;return this;},
  json(body){this.payload=body;return this;},
  send(body){this.payload=body;return this;}
 };
}
function req(method,action,body={},origin='https://www.mayneleadership.com'){
 return {
  method,headers:{cookie:cookie(),host:'www.mayneleadership.com',origin,'content-type':'application/json'},
  query:{action},body:{action,...body}
 };
}
test('Video AI gateway requires site access',async()=>{
 process.env.LEADERSHIP_ACCESS_SECRET=SECRET;process.env.LEADERSHIP_ACCESS_PIN_VERIFIER=VERIFIER;
 const r=response(),q=req('GET','status');q.headers.cookie='';
 await handler(q,r);assert.equal(r.statusCode,401);
});
test('connection status reports missing optional providers without exposing keys',async()=>{
 process.env.LEADERSHIP_ACCESS_SECRET=SECRET;process.env.LEADERSHIP_ACCESS_PIN_VERIFIER=VERIFIER;
 delete process.env.HEYGEN_API_KEY;delete process.env.ELEVENLABS_API_KEY;
 const r=response();await handler(req('GET','status'),r);
 assert.equal(r.statusCode,200);assert.deepEqual(r.payload,{speech:false,avatars:false});
});
test('speech generation fails safely without a configured provider',async()=>{
 process.env.LEADERSHIP_ACCESS_SECRET=SECRET;process.env.LEADERSHIP_ACCESS_PIN_VERIFIER=VERIFIER;
 delete process.env.ELEVENLABS_API_KEY;
 const r=response();await handler(req('POST','speech',{text:'Hello world',voiceId:'speaker-2026'}),r);
 assert.equal(r.statusCode,503);assert.match(r.payload.error,/not connected/i);
});
test('AI generation refuses cross-origin requests before any provider call',async()=>{
 process.env.LEADERSHIP_ACCESS_SECRET=SECRET;process.env.LEADERSHIP_ACCESS_PIN_VERIFIER=VERIFIER;
 const r=response();await handler(req('POST','avatar-generate',{},'https://evil.test'),r);
 assert.equal(r.statusCode,403);
});
test('avatar catalog fails safely without a key',async()=>{
 process.env.LEADERSHIP_ACCESS_SECRET=SECRET;process.env.LEADERSHIP_ACCESS_PIN_VERIFIER=VERIFIER;
 delete process.env.HEYGEN_API_KEY;
 const r=response();await handler(req('GET','avatar-options'),r);
 assert.equal(r.statusCode,503);
});
test.after(()=>{
 for(const [k,v] of Object.entries({LEADERSHIP_ACCESS_SECRET:before.secret,LEADERSHIP_ACCESS_PIN_VERIFIER:before.verifier,
 ELEVENLABS_API_KEY:before.eleven,HEYGEN_API_KEY:before.heygen})){
  if(v===undefined)delete process.env[k];else process.env[k]=v;
 }
});
