import test from 'node:test';
import assert from 'node:assert/strict';
import {WIDTH,HEIGHT,SHAPES,COLORS,MATRICES,createMap,createNode,placeNode,moveNode,resizeNode,removeNode,linkNodes,mapStats,normalizeMap,sampleMap,quadrantOf,quadrantSummary,MAX_STAKEHOLDERS} from '../../assets/stakeholder-model.js';
import {renderMapSVG,exportSVGMarkup,svgPointFromClient} from '../../assets/stakeholder-svg.js';

test('stakeholders can be positioned, moved and resized with safe bounds',()=>{
 const m=createMap('Leadership project');
 const n=placeNode(m,createNode('Supervisors',850,150,{color:'teal',shape:'hexagon',w:190,h:110}));
 assert.equal(n.x,850);assert.equal(n.y,150);assert.equal(n.shape,'hexagon');
 assert.equal(quadrantOf(n),1);
 assert.equal(moveNode(m,n.id,985,445),true);
 assert.equal(n.x,985);assert.equal(n.y,445);
 assert.equal(quadrantOf(n),3);
 resizeNode(m,n.id,300,170);
 assert.equal(n.w,300);assert.equal(n.h,170);
 moveNode(m,n.id,WIDTH*5,-600);
 assert.ok(n.x<=WIDTH-n.w/2-12);
 assert.ok(n.y>=n.h/2+12);
 resizeNode(m,n.id,9999,-9999);
 assert.equal(n.w,310);assert.equal(n.h,72);
 assert.ok(COLORS.some(x=>x.id===n.color));
});

test('shapes, color palette and matrix framework render as editable SVG without escaping hazards',()=>{
 const m=createMap('Executive <script>alert(1)</script>');
 for(const [i,shape] of SHAPES.entries())placeNode(m,createNode('<img src=x onerror=alert(1)>',130+i*184,250,{shape,color:COLORS[i].id,role:'Team member'}));
 const html=renderMapSVG(m,m.nodes[0].id);
 assert.equal((html.match(/data-node=/g)||[]).length,SHAPES.length);
 assert.match(html,/<ellipse /);
 assert.match(html,/<polygon /);
 assert.match(html,/<rect /);
 assert.match(html,/data-resize=/);
 assert.match(html,/viewBox="0 0 1200 760"/);
 assert.match(html,/Keep satisfied/);
 assert.ok(!html.includes('<img src=x'));
 assert.match(html,/&lt;img/);
 assert.match(exportSVGMarkup(m),/width="1200" height="760"/);
 m.matrix='blank';
 assert.ok(!renderMapSVG(m).includes('Keep satisfied'));
 m.matrix='influence-impact';
 assert.match(renderMapSVG(m),/Partner closely/);
});

test('quadrant classification and dynamic summary reflect placements',()=>{
 const m=createMap();
 for(const [x,y] of [[290,210],[935,195],[290,540],[905,590]])placeNode(m,createNode('Test',x,y));
 assert.deepEqual(mapStats(m).counts,[1,1,1,1]);
 assert.equal(quadrantSummary(m)[1].name,'Manage closely');
 assert.equal(quadrantSummary(m).length,4);
 m.matrix='blank';assert.equal(quadrantSummary(m).length,0);
 assert.equal(MATRICES.length,4);
});

test('relationship linking validates references and cleans up after removal',()=>{
 const m=createMap();const a=placeNode(m,createNode('A')),b=placeNode(m,createNode('B'));
 const link=linkNodes(m,a.id,b.id,'Coordinates with');
 assert.equal(m.links.length,1);assert.match(renderMapSVG(m),/Coordinates with/);
 assert.throws(()=>linkNodes(m,a.id,a.id),/different/);
 assert.throws(()=>linkNodes(m,a.id,b.id),/already exists/);
 assert.ok(removeNode(m,b.id));
 assert.equal(m.links.length,0);
});

test('map library serialization retains shape and links; duplication remaps identifiers',()=>{
 const c=sampleMap();
 assert.equal(c.nodes.length,7);assert.ok(c.links.length>0);
 const clone=normalizeMap(JSON.parse(JSON.stringify(c)));
 assert.equal(clone.nodes[0].id,c.nodes[0].id);
 assert.equal(clone.nodes[0].shape,c.nodes[0].shape);
 const other=normalizeMap(c,{regenerate:true});
 assert.notEqual(other.id,c.id);
 assert.notEqual(other.nodes[0].id,c.nodes[0].id);
 assert.equal(other.links[0].from,other.nodes[0].id);
 assert.equal(other.links[0].to,other.nodes[1].id);
 assert.throws(()=>normalizeMap({...c,version:3}),/Unsupported/);
 assert.throws(()=>normalizeMap({...c,nodes:Array(MAX_STAKEHOLDERS+1).fill({})}),/limit/);
});

test('client to SVG coordinates handle responsive viewBox and non-square panels',()=>{
 const svg={
  getScreenCTM(){return null},
  getBoundingClientRect(){return {left:50,top:100,width:800,height:600}},
  viewBox:{baseVal:{x:0,y:0,width:1200,height:760}}
 };
 const pt=svgPointFromClient(svg,50+400,100+300);
 assert.equal(Math.round(pt.x),600);assert.equal(Math.round(pt.y),380);
 const zero=svgPointFromClient({...svg,getBoundingClientRect(){return {left:0,top:0,width:0,height:0}}},0,0);
 assert.equal(zero.x,600);assert.equal(zero.y,380);
});
