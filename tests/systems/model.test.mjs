import test from 'node:test';import assert from 'node:assert/strict';
import {blank,node,edge,validate,analyze,trace,simulate,removeItems,duplicate,copy,fromCollaboration} from '../../assets/systems/model.js';
import {template,TEMPLATES} from '../../assets/systems/templates.js';
import {svg,report,csv,collaboration,participantCSV} from '../../assets/systems/exports.js';
import {JSDOM} from 'jsdom';
import {pdfReport} from '../../src/systems-pdf.js';import {PDFDocument} from 'pdf-lib';
function cycle(signs){const p=blank();p.nodes=signs.map((_,i)=>({...node(),label:'v'+i,x:i*300}));p.edges=signs.map((s,i)=>({...edge(p.nodes[i].id,p.nodes[(i+1)%signs.length].id),polarity:s}));return p;}
test('loop sign parity, unknowns, delays, rotations, and self-loops',()=>{
 for(const [signs,type] of [[['+','+','+'],'reinforcing'],[['-','+','+'],'balancing'],[['-','-','+'],'reinforcing'],[['-','-','-'],'balancing'],[['?','-'],'uncertain'],[['-'],'balancing'],[['+'],'reinforcing']]){
  const p=cycle(signs);p.edges[0].delayed=true;const a=analyze(p);assert.equal(a.loops.length,1);assert.equal(a.loops[0].type,type);assert.equal(a.loops[0].delays,1);
 }
 const p=cycle(['+','+']);p.edges[0].kind='information';assert.equal(analyze(p).loops.length,0);
});
test('directed elementary cycles match an independent permutation oracle',()=>{
 const p=cycle(['+','+','+','+']);p.edges=[];
 for(const a of p.nodes)for(const b of p.nodes)if(a!==b)p.edges.push(edge(a.id,b.id));
 // K4 without self loops: 6 length-two + 8 length-three + 6 length-four.
 const a=analyze(p);assert.equal(a.loops.length,20);assert.equal(new Set(a.loops.map(l=>l.id)).size,20);assert(!a.truncated);
 const bound=analyze(p,{cycles:3});assert.equal(bound.loops.length,3);assert(bound.truncated);
 const short=analyze(p,{cycleLength:2});assert.equal(short.loops.length,6);assert(short.depthLimited);
 const dense=blank();dense.nodes=Array.from({length:25},()=>node());dense.edges=dense.nodes.flatMap(a=>dense.nodes.filter(b=>a!==b).map(b=>edge(a.id,b.id)));assert(analyze(dense).truncated);
});
test('templates, path signs, deletion, duplication and stock-flow math',()=>{
 for(const key of Object.keys(TEMPLATES))assert.deepEqual(validate(template(key)),[],key);
 const p=cycle(['-','-','+']);const paths=trace(p,p.nodes[0].id);assert.deepEqual(paths.paths.map(x=>x.sign),[-1,1]);assert.equal(trace(p,p.nodes[0].id,3,-1).paths[0].sign,1);
 const n=p.nodes[0];const added=duplicate(p,p.nodes.map(x=>x.id));assert.equal(added.length,3);assert.equal(p.edges.length,6);removeItems(p,[n.id]);assert(!p.edges.some(e=>e.from===n.id||e.to===n.id));assert.deepEqual(validate(p),[]);
 const s=template('stock'),sim=simulate(s);assert.equal(sim.rows.at(-1)[s.nodes.find(n=>n.label==='Work backlog').id],160);assert.equal(sim.rows.at(-1)[s.nodes.find(n=>n.label==='Completed work').id],100);
});
test('source validates IDs, dangling relationships, types, size, and finite values',()=>{
 const p=template('burnout');const bad=copy(p);bad.nodes[0].x=Infinity;assert(validate(bad).length);bad.nodes[0].x=1;bad.edges[0].to='missing';assert(validate(bad).length);bad.edges[0].to=bad.nodes[0].id;bad.nodes[0].type='<script>';assert(validate(bad).length);assert.deepEqual(validate(JSON.parse(JSON.stringify(p))),[]);
});
test('SVG and HTML exports are complete, escaped and independently parsed',()=>{
 const p=template('burnout');p.title='<img src=x onerror=alert(1)>';p.issue='Deadline reliability';p.reflection='Investigate fatigue';p.actions=[{id:crypto.randomUUID(),text:'Test scheduling',owner:'Team A',due:'2026-11-01',measure:'Fewer errors',status:'planned'}];
 const vector=new JSDOM(svg(p),{contentType:'image/svg+xml'});assert.equal(vector.window.document.querySelectorAll('parsererror').length,0);assert(vector.window.document.querySelectorAll('rect').length>=p.nodes.length);vector.window.close();
 const r=new JSDOM(report(p));assert(!r.window.document.querySelector('img'));assert(r.window.document.body.textContent.includes('Test scheduling'));assert(r.window.document.body.textContent.includes('balancing'));assert(r.window.document.querySelector('button').textContent.includes('PDF'));r.window.close();
 p.nodes[0].label='=1+2';assert(csv(p).includes("'=1+2"));assert(participantCSV([{name:'=cmd',team:'A',contributions:1,reflection:'hi'}]).includes("'=cmd"));const imported=fromCollaboration(collaboration(p));assert.equal(imported.nodes.length,p.nodes.length);assert.deepEqual(validate(imported),[]);
});
test('native PDF contains the map and multipage report with metadata',async()=>{
 const p=template('burnout');p.reflection='Review fatigue and rework';const bytes=await pdfReport(p);assert.equal(Buffer.from(bytes).subarray(0,4).toString(),'%PDF');const pdf=await PDFDocument.load(bytes);assert(pdf.getPageCount()>=2);assert.equal(pdf.getTitle(),p.title);assert.equal(pdf.getPage(0).getWidth(),792);
});
