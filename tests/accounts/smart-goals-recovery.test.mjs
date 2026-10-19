import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const html=await readFile(new URL('../../smart-goals.html',import.meta.url),'utf8');
const account={id:'11111111-1111-4111-8111-111111111111',email:'synthetic@example.invalid'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function page({initialUser=null,delayedUser=false,updateError=null,fragment=''}={}){
 const dom=new JSDOM(html,{url:'https://www.mayneleadership.com/smart-goals.html'+fragment,runScripts:'outside-only'});
 const calls=[];let listener,resolveUser,user=initialUser;
 const sdk={auth:{
  getUser(){calls.push(['getUser']);return delayedUser?new Promise(resolve=>{resolveUser=()=>resolve({data:{user:account},error:null});}):Promise.resolve({data:{user},error:null});},
  onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){}}}};},
  async updateUser(payload){calls.push(['updateUser',payload]);return {data:{user:account},error:updateError};},
  async signOut(){calls.push(['signOut']);user=null;listener('SIGNED_OUT',null);return {error:null};},
  async signUp(payload){calls.push(['signUp',payload]);return {data:{session:null},error:null};},
  async resetPasswordForEmail(){return {error:null};}
 },from(table){calls.push(['from',table]);return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{goals:[]},error:null};}};}};
 dom.window.supabase={createClient(url){assert.equal(new URL(url).hostname,'vteamreihsunsllwcphw.supabase.co');return sdk;}};
 for(const script of dom.window.document.querySelectorAll('script:not([src])'))dom.window.eval(script.textContent);
 const doc=dom.window.document;
 return {dom,doc,calls,emit:()=>listener('PASSWORD_RECOVERY',{user:account}),resolveUser:()=>resolveUser(),submit(){doc.querySelector('#recoveryform').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));},passwords(a,b=a){doc.querySelector('#newGoalPassword').value=a;doc.querySelector('#confirmGoalPassword').value=b;}};
}
test('a normal anonymous visit hides the password-change form and cannot update a password',async()=>{
 const p=page();try{await tick();assert.equal(p.doc.querySelector('#recoverygate').hidden,true);assert.equal(p.doc.querySelector('#authgate').hidden,false);p.passwords('a-new-test-password');p.submit();await tick();assert.equal(p.calls.some(([name])=>name==='updateUser'),false);}finally{p.dom.window.close();}
});
test('a verified recovery event shows the new-password form and rejects short or mismatched entries',async()=>{
 const p=page();try{await tick();p.emit();await tick();assert.equal(p.doc.querySelector('#recoverygate').hidden,false);assert.equal(p.doc.querySelector('#authgate').hidden,true);assert.equal(p.doc.querySelector('#goalsapp').hidden,true);p.passwords('short');p.submit();assert.match(p.doc.querySelector('#recoverymessage').textContent,/12 characters/);p.passwords('a-new-test-password','different-test-password');p.submit();assert.match(p.doc.querySelector('#recoverymessage').textContent,/do not match/);assert.equal(p.calls.some(([name])=>name==='updateUser'),false);}finally{p.dom.window.close();}
});
test('successful recovery delegates the password to managed Auth, signs out, and returns to sign-in',async()=>{
 const p=page();try{await tick();p.emit();await tick();p.passwords('a-new-test-password');p.submit();await tick();assert.deepEqual(JSON.parse(JSON.stringify(p.calls.find(([name])=>name==='updateUser')[1])),{password:'a-new-test-password'});assert.equal(p.calls.filter(([name])=>name==='signOut').length,1);assert.equal(p.doc.querySelector('#recoverygate').hidden,true);assert.equal(p.doc.querySelector('#authgate').hidden,false);assert.match(p.doc.querySelector('#authmessage').textContent,/Password updated/);assert.equal(p.doc.querySelector('#newGoalPassword').value,'');assert.equal(p.doc.querySelector('#confirmGoalPassword').value,'');}finally{p.dom.window.close();}
});
test('an expired recovery session shows the provider error and clears password inputs without claiming success',async()=>{
 const p=page({updateError:{message:'Recovery session expired.'}});try{await tick();p.emit();await tick();p.passwords('a-new-test-password');p.submit();await tick();assert.equal(p.doc.querySelector('#recoverygate').hidden,false);assert.match(p.doc.querySelector('#recoverymessage').textContent,/expired/);assert.equal(p.calls.some(([name])=>name==='signOut'),false);assert.equal(p.doc.querySelector('#newGoalPassword').value,'');assert.equal(p.doc.querySelector('#recoveryform button').disabled,false);}finally{p.dom.window.close();}
});
test('a late initial identity lookup cannot replace the recovery form with private goal content',async()=>{
 const p=page({delayedUser:true});try{p.emit();await tick();p.resolveUser();await tick();assert.equal(p.doc.querySelector('#recoverygate').hidden,false);assert.equal(p.doc.querySelector('#goalsapp').hidden,true);assert.equal(p.calls.some(([name])=>name==='from'),false);}finally{p.dom.window.close();}
});
test('confirmation links use the configured page and expired recovery links give an actionable error',async()=>{
 const p=page({fragment:'#error_code=otp_expired'});try{await tick();assert.match(p.doc.querySelector('#authmessage').textContent,/could not be verified/);p.doc.querySelector('#authEmail').value='synthetic@example.invalid';p.doc.querySelector('#authPassword').value='a-new-test-password';await p.dom.window.createGoalsAccount();assert.equal(p.calls.find(([name])=>name==='signUp')[1].options.emailRedirectTo,'https://www.mayneleadership.com/smart-goals.html');}finally{p.dom.window.close();}
});
