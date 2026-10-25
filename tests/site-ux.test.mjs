import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const pages=['index.html','learning.html','assessments.html','tools.html','facilitation.html','create.html','about.html','services.html','contact.html','testimonials.html','demo-center.html','leadership-101-quizzes.html','leadership-escape-lab.html','simulations.html','catalog.html'];
test('unified navigation and footer on category and landing pages',()=>{
 for(const path of pages){
  const doc=new JSDOM(read(path)).window.document;
  assert.equal(doc.querySelectorAll('header nav#nav').length,1,path);
  assert.ok(doc.querySelector('header nav a[href="assessments.html"]'),path);
  assert.ok(doc.querySelector('footer nav a[href="catalog.html"]'),path);
  assert.ok(doc.querySelector('a.skip[href="#main"]'),path);
  assert.ok(doc.querySelector('main#main'),path);
  for(const a of doc.querySelectorAll('a[href]')){
   const href=a.getAttribute('href');
   if(!href||/^(?:#|https?:|mailto:|tel:|javascript:|data:)/i.test(href))continue;
   const dest=href.split(/[?#]/)[0].replace(/^\//,'');
   if(dest) assert.ok(existsSync(join(root,dest)),path+': '+href);
  }
 }
});
test('homepage has six quick launches and an all-resources path',()=>{
 const doc=new JSDOM(read('index.html')).window.document;
 assert.equal(doc.querySelectorAll('.quick-launch-grid > a').length,6);
 assert.ok(doc.querySelector('.catalog-promo a[href="catalog.html"]'));
});
test('catalog covers five categories, contains only working links and searches correctly',()=>{
 const dom=new JSDOM(read('catalog.html'),{url:'https://mayneleadership.com/catalog.html',runScripts:'outside-only'});
 const doc=dom.window.document;
 assert.equal(doc.querySelectorAll('.catalog-card').length,45);
 assert.equal(doc.querySelectorAll('.catalog-filter').length,6);
 const paths=new Set();
 for(const card of doc.querySelectorAll('.catalog-card')){
  const href=card.querySelector('a')?.getAttribute('href');
  assert.ok(href&&existsSync(join(root,href.split('?')[0])),href);
  assert.ok(!paths.has(href),'duplicate catalog link: '+href);paths.add(href);
 }
 dom.window.eval(read('assets/catalog.js'));
 assert.equal(doc.getElementById('catalog-count').textContent,'45 resources found');
 const assessments=doc.querySelector('[data-catalog-filter="assessments"]');
 assessments.click();
 assert.equal(doc.getElementById('catalog-count').textContent,'5 resources found');
 assert.equal(assessments.getAttribute('aria-pressed'),'true');
 const input=doc.getElementById('catalog-search');
 input.value='360';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 assert.equal(doc.getElementById('catalog-count').textContent,'1 resource found');
 assert.ok(dom.window.location.search.includes('category=assessments'));
 doc.getElementById('catalog-reset').click();
 assert.equal(doc.getElementById('catalog-count').textContent,'45 resources found');
 assert.equal(input.value,'');
 dom.window.close();
});
test('mobile and accessibility layout rules are present',()=>{
 const css=read('assets/styles.css');
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(css,/@media\(max-width:1180px\)/);
 assert.match(css,/\.catalog-card\[hidden\]\{display:none!important\}/);
 for(const p of ['index.html','catalog.html']){
  const doc=new JSDOM(read(p)).window.document;
  const menu=doc.getElementById('menu-btn');
  assert.equal(menu.getAttribute('aria-controls'),'nav');
  assert.equal(menu.getAttribute('aria-expanded'),'false');
  assert.ok(doc.querySelector('label[for="catalog-search"]')||p==='index.html');
 }
});
