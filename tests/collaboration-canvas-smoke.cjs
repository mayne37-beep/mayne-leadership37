// Collaboration Canvas Studio — zero-dependency source regression checks.
// Run: node tests/collaboration-canvas-smoke.cjs
// This is NOT a substitute for real multi-browser classroom testing.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const js=read('assets/collaboration-canvas.js');
const css=read('assets/collaboration-canvas.css');
const host=read('collaboration-canvas.html');
const guest=read('collaboration-join.html');
new vm.Script(js,{filename:'collaboration-canvas.js'});
assert.match(host, /data-entry="owner"/);
assert.match(guest, /data-entry="guest"/);
assert.match(host, /vendor\/qrcode\.min\.js/);
assert.match(host,/id="pro-toolbar"/);
assert.match(guest,/id="pro-toolbar"/);
const staticIds=new Set([...host.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]));
const ids=[...js.matchAll(/\$\('#([^']+)'\)/g)].map(x=>x[1]);
for(const id of ids){
 const dynamicallyCreated=js.includes("id='"+id+"'");
 assert.ok(staticIds.has(id)||dynamicallyCreated,'Undefined element '+id);
}
for(const feature of ['function resizeGeometry(','function groupSelection(','function openDecisionMatrix(','function startPresence(','function submitPrivateIdea(','function createBreakoutRoom(','function mergeBreakoutRoom(','function clusterByColor('])
 assert.ok(js.includes(feature),'Missing feature '+feature);
assert.ok(css.includes('.canvas-resize-handle'),'Resize handle styles missing');
assert.ok(css.includes('.pro-matrix-table'),'Matrix styles missing');
const start=js.indexOf('function resizeGeometry('),end=js.indexOf('function beginResize(',start);
const calculate=new Function(js.slice(start,end)+';return resizeGeometry')();
const base={x:100,y:100,w:200,h:100};
const expected=[['se',40,25,240,125],['nw',20,10,180,90],['e',80,0,280,100],['s',0,100,200,200]];
for(const [side,dx,dy,w,h] of expected){
 const result=calculate(base,side,dx,dy);
 assert.equal(result.w,w,side+' width');assert.equal(result.h,h,side+' height');
}
assert.ok(read('assets/vendor/QRCode-LICENSE.txt').includes('MIT License'),'QRCode MIT license missing');
console.log('Canvas smoke tests passed: JS syntax, HTML controls, asset references, feature presence, resize geometry.');
