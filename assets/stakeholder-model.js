/* Shared project model for Stakeholder Mapping Studio. No network or third-party dependencies. */
export const WIDTH=1200,HEIGHT=760,MAX_STAKEHOLDERS=120,MAX_MAPS=50;
export const SHAPES=['rounded','rectangle','circle','diamond','hexagon','pill'];
export const COLORS=[
 {id:'blue',fill:'#dceeff',line:'#397cbb',text:'#163d67'},
 {id:'gold',fill:'#fff0cc',line:'#bb8d35',text:'#70501b'},
 {id:'coral',fill:'#ffe2df',line:'#cb7269',text:'#6e3533'},
 {id:'mint',fill:'#def6e9',line:'#3c9675',text:'#205643'},
 {id:'violet',fill:'#eee5ff',line:'#8b70c5',text:'#51396f'},
 {id:'teal',fill:'#d9f2f7',line:'#4294a3',text:'#245b67'},
 {id:'rose',fill:'#ffe6f0',line:'#c36e99',text:'#723953'},
 {id:'slate',fill:'#e8edf3',line:'#74869a',text:'#384e63'},
 {id:'orange',fill:'#ffead8',line:'#ca844a',text:'#744927'}
];
export const MATRICES=[
 {id:'power-interest',name:'Power × Interest',x:'Interest',y:'Power',quadrants:['Keep satisfied','Manage closely','Monitor','Keep informed'],descriptions:['High power · lower interest','High power · high interest','Lower power · lower interest','Lower power · high interest']},
 {id:'influence-impact',name:'Influence × Impact',x:'Impact',y:'Influence',quadrants:['Engage strategically','Partner closely','Observe','Consult actively'],descriptions:['High influence · lower impact','High influence · high impact','Lower influence · lower impact','Lower influence · high impact']},
 {id:'support-influence',name:'Support × Influence',x:'Support',y:'Influence',quadrants:['Engage skeptics','Mobilize champions','Monitor concerns','Build advocates'],descriptions:['High influence · lower support','High influence · high support','Lower influence · lower support','Lower influence · high support']},
 {id:'blank',name:'Freeform canvas',x:'',y:'',quadrants:[],descriptions:[]}
];
export const SHAPE_LABELS={rounded:'Rounded',rectangle:'Rectangle',circle:'Circle',diamond:'Diamond',hexagon:'Hexagon',pill:'Pill'};
export const uid=()=>globalThis.crypto?.randomUUID?.()||'sm-'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
export const copy=v=>JSON.parse(JSON.stringify(v));
export const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const bounded=(v,low,high,def=low)=>{const n=Number(v);return Number.isFinite(n)?Math.max(low,Math.min(high,n)):def};
const text=(s,n=1000)=>String(s??'').slice(0,n);
export function createMap(name='Untitled stakeholder map'){
 return {version:1,id:uid(),name,description:'',matrix:'power-interest',nodes:[],links:[],created:new Date().toISOString(),updated:new Date().toISOString()};
}
export function createNode(label,x=600,y=375,settings={}){
 return {id:uid(),label:text(label||'New stakeholder',92),role:text(settings.role||'',110),group:text(settings.group||'',90),notes:text(settings.notes||'',2300),approach:text(settings.approach||'',1300),
 shape:SHAPES.includes(settings.shape)?settings.shape:'rounded',
 color:COLORS.some(c=>c.id===settings.color)?settings.color:'blue',
 stance:['Supportive','Neutral','Concerned','Opposed','Unknown'].includes(settings.stance)?settings.stance:'Unknown',
 x:bounded(x,45,WIDTH-45,600),y:bounded(y,42,HEIGHT-42,375),
 w:bounded(settings.w,112,310,182),h:bounded(settings.h,72,225,96),
 created:new Date().toISOString()};
}
export function fitNode(node){const halfX=node.w/2,halfY=node.h/2;node.x=bounded(node.x,halfX+12,WIDTH-halfX-12,node.x);node.y=bounded(node.y,halfY+12,HEIGHT-halfY-12,node.y);return node;}
export function placeNode(map,node){if(map.nodes.length>=MAX_STAKEHOLDERS)throw Error('Maximum of '+MAX_STAKEHOLDERS+' stakeholders per map.');if(!node.id)node.id=uid();fitNode(node);map.nodes.push(node);return node;}
export function moveNode(map,id,x,y){const n=map.nodes.find(x=>x.id===id);if(!n)return false;n.x=bounded(x,-WIDTH,WIDTH*2,n.x);n.y=bounded(y,-HEIGHT,HEIGHT*2,n.y);fitNode(n);return true;}
export function resizeNode(map,id,w,h){const n=map.nodes.find(x=>x.id===id);if(!n)return false;n.w=bounded(w,112,310,n.w);n.h=bounded(h,72,225,n.h);fitNode(n);return true;}
export function removeNode(map,id){if(!map.nodes.some(x=>x.id===id))return false;map.nodes=map.nodes.filter(x=>x.id!==id);map.links=map.links.filter(x=>x.from!==id&&x.to!==id);return true;}
export function linkNodes(map,from,to,label=''){if(!from||!to||from===to)throw Error('Choose two different stakeholders.');if(!map.nodes.some(x=>x.id===from)||!map.nodes.some(x=>x.id===to))throw Error('A stakeholder is missing.');if(map.links.some(x=>x.from===from&&x.to===to))throw Error('That relationship already exists.');if(map.links.length>=250)throw Error('Too many relationships.');const link={id:uid(),from,to,label:text(label,70)};map.links.push(link);return link;}
export function quadrantOf(node){const upper=node.y<HEIGHT/2,right=node.x>=WIDTH/2;return upper?(right?1:0):(right?3:2);}
export function mapStats(map){const counts=[0,0,0,0];map.nodes.forEach(n=>counts[quadrantOf(n)]++);const groups=new Map();for(const n of map.nodes){const key=n.group||'Unassigned';groups.set(key,(groups.get(key)||0)+1)}return {total:map.nodes.length,counts,groups:[...groups].sort((a,b)=>b[1]-a[1]),links:map.links.length,stance:map.nodes.reduce((a,n)=>(a[n.stance]=(a[n.stance]||0)+1,a),{})};}
export function normalizeMap(raw,{regenerate=false}={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid stakeholder mapping file.');
 if(raw.version!=null&&raw.version!==1)throw Error('Unsupported stakeholder map version.');
 const map=createMap(text(raw.name,130)||'Imported stakeholder map');
 if(!regenerate&&typeof raw.id==='string'&&raw.id.length<120)map.id=raw.id;
 map.description=text(raw.description,2400);
 map.matrix=MATRICES.some(x=>x.id===raw.matrix)?raw.matrix:'power-interest';
 if(!Array.isArray(raw.nodes)||raw.nodes.length>MAX_STAKEHOLDERS)throw Error('Invalid stakeholder list or node limit exceeded.');
 const ids=new Map(),used=new Set();
 map.nodes=raw.nodes.map(n=>{
  const obj=createNode(n.label,n.x,n.y,n);
  const old=text(n.id,120),newId=!regenerate&&old&&!used.has(old)?old:uid();
  obj.id=newId;used.add(newId);if(old)ids.set(old,newId);fitNode(obj);return obj;
 });
 const existing=new Set(map.nodes.map(x=>x.id));
 if(raw.links!=null&&!Array.isArray(raw.links))throw Error('Invalid relationships list.');
 if((raw.links||[]).length>250)throw Error('Relationship limit exceeded.');
 map.links=(raw.links||[]).flatMap(l=>{
  const from=ids.get(text(l.from,120)),to=ids.get(text(l.to,120));
  if(!from||!to||from===to||!existing.has(from)||!existing.has(to))return [];
  return [{id:regenerate?uid():text(l.id,120)||uid(),from,to,label:text(l.label,70)}];
 });
 if(!regenerate&&typeof raw.created==='string')map.created=text(raw.created,55);
 return map;
}
export function sampleMap(){
 const map=createMap('Stakeholder example · Organizational change');
 map.description='Illustrative change management example. Positions are conversation starters, not research conclusions.';
 const samples=[
 ['Executive sponsor','Decision maker','Leadership',945,135,'violet','hexagon','Supportive'],
 ['Division director','Program owner','Leadership',770,170,'blue','rounded','Supportive'],
 ['Frontline supervisors','Implementation partners','Operations',835,330,'teal','rectangle','Neutral'],
 ['Team members','Impacted workforce','Operations',1010,560,'mint','pill','Concerned'],
 ['IT support','Technical enablement','Support',410,530,'gold','diamond','Neutral'],
 ['Finance analyst','Budget oversight','Support',300,220,'coral','circle','Unknown'],
 ['External partners','Outside collaborators','External',490,640,'rose','rounded','Unknown']
 ];
 for(const [label,role,group,x,y,color,shape,stance] of samples)placeNode(map,createNode(label,x,y,{role,group,color,shape,stance}));
 linkNodes(map,map.nodes[0].id,map.nodes[1].id,'Sponsor');
 linkNodes(map,map.nodes[1].id,map.nodes[2].id,'Coordinates');
 linkNodes(map,map.nodes[2].id,map.nodes[3].id,'Supports');
 return map;
}
export function quadrantSummary(map){
 const mat=MATRICES.find(m=>m.id===map.matrix);
 if(mat?.id==='blank')return [];
 const stats=mapStats(map);
 return mat.quadrants.map((name,i)=>({name,description:mat.descriptions[i],count:stats.counts[i]}));
}
