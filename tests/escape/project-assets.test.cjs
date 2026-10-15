const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const JSZip=require('jszip');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'../..');
require('../../assets/escape-room/project-assets.js');
const A=globalThis.EscapeProjectAssets;
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Zi0AAAAASUVORK5CYII=';
const first='asset-'+'a'.repeat(64),second='asset-'+'b'.repeat(64);
function pack(){const p=JSON.parse(fs.readFileSync(path.join(root,'assets/escape-room/example.project.json'),'utf8'));p.id='asset-library-test';p.assetLibrary=[{id:first,path:'assets/scenes/room.png',name:'Room background',kind:'background',category:'Atrium',image:png},{id:second,path:'assets/objects/key.png',name:'Special key',kind:'object',category:'Workshop',image:png,svg:'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h5"/></svg>',vectorPath:'assets/objects/key.svg'}];p.assetDocuments=[{path:'assets/README.txt',text:'Original artwork notes'}];p.originalGame={htmlTemplate:'<!doctype html><html><head><title>Original</title></head><body><img src="__ESCAPE_ASSET_'+'a'.repeat(64)+'__"><script>document.body.dataset.started="yes";</script></body></html>'};return p;}
const wait=async check=>{for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw new Error('UI condition timed out');};

test('original-game reconstruction embeds exact image bytes and isolates the preview',()=>{
 const p=pack(),html=A.originalHTML(p);
 assert.ok(html.includes(png));assert.ok(!html.includes('__ESCAPE_ASSET_'));
 const preview=A.originalHTML(p,true);assert.ok(preview.includes('Content-Security-Policy'));assert.ok(preview.includes("connect-src 'none'"));assert.ok(preview.includes('Object.defineProperty(window,"localStorage"'));
 p.assetLibrary[0].image='/api/escape-studio?action=asset&id='+first;
 assert.throws(()=>A.originalHTML(p),/missing an image/);
});

test('all-assets ZIP is readable by a standard ZIP library and preserves PNG, SVG and document bytes',async()=>{
 const p=pack(),zip=await JSZip.loadAsync(Buffer.from(await A.assetZip(p).arrayBuffer()),{checkCRC32:true});
 assert.deepEqual(Object.keys(zip.files).sort(),['assets/README.txt','assets/objects/key.png','assets/objects/key.svg','assets/scenes/room.png'].sort());
 assert.equal(await zip.file('assets/objects/key.svg').async('string'),p.assetLibrary[1].svg);
 assert.equal(await zip.file('assets/README.txt').async('string'),'Original artwork notes');
 assert.equal(await zip.file('assets/scenes/room.png').async('base64'),png.split(',')[1]);
 assert.throws(()=>A.zipFiles([{path:'../outside.txt',data:'bad'}]),/invalid filename/);
});

test('server draft checks include asset-library images and learner delivery excludes original authoring files',async()=>{
 const {validateDraft,assetIds,learnerProject}=await import('../../src/escape/model.js');
 const p=pack();for(const a of p.assetLibrary)a.image='/api/escape-studio?action=asset&id='+a.id;
 assert.deepEqual(validateDraft(p),[]);assert.deepEqual(new Set(assetIds(p)),new Set([first,second]));
 const student=learnerProject(p,'c'.repeat(48),1);assert.equal(student.assetLibrary,undefined);assert.equal(student.assetDocuments,undefined);assert.equal(student.originalGame,undefined);
 p.assetLibrary[0].image='https://other.example/image.png';assert.match(validateDraft(p)[0],/artwork/);
});

test('portable backups embed reusable artwork once and retain SVG files and the original game',async t=>{
 const dom=new JSDOM('',{url:'https://studio.test/',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
 const requests=[];w.fetch=async source=>{requests.push(source);return {ok:true,blob:async()=>new w.Blob([Buffer.from(png.split(',')[1],'base64')],{type:'image/png'})};};
 w.eval(fs.readFileSync(path.join(root,'assets/escape-room/cloud.js'),'utf8'));
 const p=pack();for(const a of p.assetLibrary)a.image='/api/escape-studio?action=asset&id='+a.id;
 p.scenes[0].objects[0].image=p.assetLibrary[0].image;
 const copy=await w.EscapeCloud.embed(p);assert.equal(requests.length,2);assert.equal(copy.assetLibrary[0].image,png);assert.equal(copy.assetLibrary[1].image,png);assert.equal(copy.scenes[0].objects[0].image,png);assert.equal(copy.assetLibrary[1].svg,p.assetLibrary[1].svg);assert.equal(copy.originalGame.htmlTemplate,p.originalGame.htmlTemplate);
});

test('asset browser filters collections and applies artwork to editable objects and backgrounds',async t=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<div id="app"></div><dialog id="modal"></dialog><div id="toast"></div><input id="fileInput" type="file">',{url:'https://studio.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;
 t.after(()=>{w.close();assert.deepEqual(errors,[]);});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.HTMLElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:800,height:500});
 const p=pack();for(const a of p.assetLibrary)a.image='/api/escape-studio?action=asset&id='+a.id;p._cloud={version:1};let saved;
 w.ESCAPE_HOSTED=true;w.EscapeCloud={list:async()=>[{id:p.id,title:p.title,scenes:p.scenes.length,updated_at:new Date().toISOString()}],get:async()=>structuredClone(p),save:async value=>{saved=structuredClone(value);return {version:2};}};
 for(const f of ['engine.js','panorama.js','template.js','project-assets.js','app.js'])w.eval(fs.readFileSync(path.join(root,'assets/escape-room',f),'utf8'));
 const click=selector=>{const el=d.querySelector(selector);assert.ok(el,'Missing '+selector);el.click();};
 await wait(()=>d.querySelector('[data-action="library"]'));click('[data-action="library"]');await wait(()=>d.querySelector('[data-open-project]'));click('[data-open-project]');await wait(()=>d.querySelector('[data-action="project-assets"]'));
 click('[data-action="project-assets"]');assert.equal(d.querySelectorAll('.asset-card').length,2);
 const search=d.querySelector('#assetSearch');search.value='special';search.dispatchEvent(new w.Event('input',{bubbles:true}));assert.ok(d.querySelector('.asset-card').hidden);
 click('[data-asset-add="1"]');const selected=d.querySelector('.prop.selected');assert.ok(selected);assert.equal(selected.querySelector('img').getAttribute('src'),'/api/escape-studio?action=asset&id='+second);assert.equal(d.querySelector('[data-field="object.name"]').value,'Special key');
 click('[data-action="project-assets"]');click('[data-asset-background="0"]');assert.equal(d.querySelector('[data-field="scene.background.type"]').value,'photo');
 await wait(()=>saved?.scenes[0].background.data==='/api/escape-studio?action=asset&id='+first);assert.equal(saved.assetLibrary.length,2);assert.ok(saved.originalGame.htmlTemplate);
});
