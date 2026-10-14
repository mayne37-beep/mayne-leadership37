import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import handler from '../../api/interactive-studio.js';
import {demoProject} from '../../assets/interactive-model.js';
const secret='test-secret',verifier='b'.repeat(64),expiry=Math.floor(Date.now()/1000)+3600;
const cookie='__Host-mayne-access=v1.'+expiry+'.'+createHmac('sha256',secret).update('v1:'+expiry+':'+verifier).digest('hex');
function invoke(extra={}){
  const req={method:'POST',headers:{host:'example.invalid',origin:'https://example.invalid','content-type':'application/json',cookie},body:{action:'list',payload:{}},...extra};
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(x){this.data=x;return this;}};
  return handler(req,res).then(()=>res);
}
test('API verifies site access, method, origin and project content',async()=>{
  process.env.LEADERSHIP_ACCESS_SECRET=secret;process.env.LEADERSHIP_ACCESS_PIN_VERIFIER=verifier;
  assert.equal((await invoke({headers:{}})).statusCode,401);
  assert.equal((await invoke({method:'GET'})).statusCode,405);
  assert.equal((await invoke({headers:{cookie,host:'example.invalid',origin:'https://evil.invalid','content-type':'application/json'}})).statusCode,403);
  assert.equal((await invoke({body:{action:'create',payload:{id:'x',data:{}}}})).statusCode,400);
  assert.equal((await invoke({body:{action:'create',payload:{id:'different',data:demoProject()}}})).statusCode,400);
  delete process.env.LESSON_STUDIO_GATEWAY_KEY;assert.equal((await invoke()).statusCode,503);
});
