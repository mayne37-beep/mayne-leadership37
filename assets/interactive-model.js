export const FORMAT = 'mayne-interactive-course';
export const SCHEMA = 1;
export const uid = () => crypto.randomUUID();
export const clone = value => structuredClone(value);
export const clamp = (v, min, max) => Math.min(max, Math.max(min, Number(v) || 0));
export const OBJECT_TYPES = ['text', 'shape', 'button', 'image'];
export const EVENTS = ['click', 'enter', 'time', 'timeline-end', 'variable-change'];
export const ACTIONS = ['show-layer', 'hide-layer', 'state', 'navigate', 'variable', 'complete', 'play', 'pause'];
export function newObject(type = 'text', extra = {}) {
  return {id:uid(), name:type[0].toUpperCase()+type.slice(1), type, text:type==='button'?'Continue':type==='text'?'Double-click to edit':'',
    x:100,y:100,w:type==='button'?250:480,h:type==='button'?68:type==='text'?110:180,
    rotation:0, fill:type==='shape'?'#e5eff8':type==='button'?'#174a74':'transparent',
    color:type==='button'?'#ffffff':'#173653', fontSize:type==='text'?34:24, bold:false, align:'left',radius:12,
    start:0,duration:10,locked:false,hidden:false,alt:'',decorative:false,
    initialState:'normal',states:{normal:{},hover:{},visited:{},disabled:{},hidden:{}},src:'',...extra};
}
export function newSlide(title='New slide') {
  return {id:uid(),title,duration:10,background:'#ffffff',notes:'',revisit:'resume',
    layers:[{id:uid(),name:'Base',modal:false,objects:[]}],triggers:[]};
}
export function newProject(title='Untitled course') {
  const slide=newSlide('Welcome');
  slide.layers[0].objects.push(newObject('text',{name:'Welcome title',text:'Your next learning experience',x:90,y:100,w:1080,h:110,fontSize:54,bold:true}),
    newObject('text',{name:'Welcome instructions',text:'Build an interactive course with slides, layers, states, and decisions.',x:94,y:235,w:940,h:125,fontSize:30}));
  return {format:FORMAT,schemaVersion:SCHEMA,id:uid(),title,description:'',width:1280,height:720,
    startSlideId:slide.id,theme:{primary:'#174a74',accent:'#b38b36',background:'#edf4fa'},
    variables:[],scenes:[{id:uid(),title:'Scene 1',slides:[slide]}],updatedAt:new Date().toISOString()};
}
export const slidesOf=p=>p.scenes.flatMap(s=>s.slides);
export const slideById=(p,id)=>slidesOf(p).find(s=>s.id===id);
export function duplicateSlide(slide) {
  const copy=clone(slide),map=new Map();
  const remap=id=>{if(!map.has(id))map.set(id,uid());return map.get(id);};
  remap(slide.id);
  for(const l of copy.layers){remap(l.id);for(const o of l.objects)remap(o.id);}
  copy.id=map.get(slide.id);copy.title+=' (copy)';
  for(const l of copy.layers){l.id=map.get(l.id);for(const o of l.objects)o.id=map.get(o.id);}
  for(const t of copy.triggers){t.id=uid();if(map.has(t.source))t.source=map.get(t.source);if(map.has(t.target))t.target=map.get(t.target);}
  return copy;
}
export function safeImage(src) {
  if(typeof src!=='string')return '';
  if(/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(src))return src;
  try{const u=new URL(src);return u.protocol==='https:'?u.href:'';}catch{return '';}
}
export function validateProject(p) {
  const issues=[];
  if(!p||p.format!==FORMAT||p.schemaVersion!==SCHEMA)return ['Unsupported project format or schema version.'];
  if(typeof p.id!=='string'||!p.id.trim())issues.push('Project ID is missing.');
  if(typeof p.title!=='string'||!p.title.trim()||p.title.length>200)issues.push('Enter a project title of 1–200 characters.');
  if(!Number.isFinite(p.width)||!Number.isFinite(p.height)||p.width<320||p.height<240||p.width>3840||p.height>2160)issues.push('Slide dimensions are outside the supported range.');
  if(!Array.isArray(p.scenes)||!p.scenes.length||p.scenes.length>50)return [...issues,'A project needs 1–50 scenes.'];
  if(!Array.isArray(p.variables)||p.variables.length>100)return [...issues,'Invalid project variables.'];
  const ids=new Set(),variables=new Map();
  const unique=(id,label)=>{if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)||ids.has(id))issues.push(label+' needs a unique UUID.');else ids.add(id);};
  unique(p.id,'Project');
  const names=new Set();
  for(const v of p.variables){
    unique(v.id,'Variable');
    if(!/^[a-z][a-z0-9_]*$/i.test(v.name)||names.has(v.name))issues.push('Variable names must be unique letters, numbers, and underscores.');
    names.add(v.name);variables.set(v.id,v);
    if(!['text','number','boolean'].includes(v.type))issues.push('Unsupported variable type.');
    if(v.type==='number'&&!Number.isFinite(v.initial))issues.push('A number variable needs a finite initial value.');
    if(v.type==='boolean'&&typeof v.initial!=='boolean')issues.push('A boolean variable needs a true/false value.');
    if(v.type==='text'&&typeof v.initial!=='string')issues.push('A text variable needs a text value.');
  }
  const allSlides=[],allObjects=new Map();
  for(const scene of p.scenes){
    unique(scene.id,'Scene');if(!Array.isArray(scene.slides)||!scene.slides.length){issues.push('Every scene needs at least one slide.');continue;}
    for(const s of scene.slides){
      allSlides.push(s);unique(s.id,'Slide');
      if(!Number.isFinite(s.duration)||s.duration<.1||s.duration>3600)issues.push('Slide duration must be between 0.1 and 3,600 seconds.');
      if(!['resume','reset'].includes(s.revisit))issues.push('Unsupported slide revisit behavior.');
      if(!Array.isArray(s.layers)||!s.layers.length||s.layers.length>30){issues.push('Every slide needs 1–30 layers.');continue;}
      const objects=new Map();allObjects.set(s.id,objects);
      for(const l of s.layers){
        unique(l.id,'Layer');if(!Array.isArray(l.objects)||l.objects.length>150){issues.push('A layer supports up to 150 objects.');continue;}
        for(const o of l.objects){
          unique(o.id,'Object');objects.set(o.id,o);
          if(!OBJECT_TYPES.includes(o.type))issues.push('Unsupported object type.');
          for(const key of ['x','y','w','h','rotation','fontSize','start','duration'])if(!Number.isFinite(o[key]))issues.push('Invalid '+key+' on '+(o.name||'object')+'.');
          if(o.w<12||o.h<12||o.w>7680||o.h>4320||o.start<0||o.duration<=0)issues.push('Invalid object size or timing.');
          if(typeof o.text!=='string'||o.text.length>20000)issues.push('Object text is too long or invalid.');
          if(!o.states||typeof o.states!=='object'||!Object.hasOwn(o.states,o.initialState))issues.push('Invalid initial object state.');
          if(o.states&&Object.keys(o.states).some(name=>['__proto__','constructor','prototype'].includes(name)))issues.push('Unsupported state name.');
          if(o.type==='image'&&!safeImage(o.src))issues.push('An image needs a supported uploaded file or HTTPS address.');
        }
      }
      if(!Array.isArray(s.triggers)||s.triggers.length>300)issues.push('A slide supports up to 300 triggers.');
    }
  }
  if(allSlides.length>200)issues.push('A project supports up to 200 slides in this release.');
  const slideIds=new Set(allSlides.map(s=>s.id));
  if(!slideIds.has(p.startSlideId))issues.push('The starting slide is missing.');
  for(const s of allSlides){
    const objects=allObjects.get(s.id)||new Map(),layers=new Set((s.layers||[]).map(l=>l.id));
    for(const t of s.triggers||[]){
      unique(t.id,'Trigger');if(!EVENTS.includes(t.event)||!ACTIONS.includes(t.action))issues.push('Unsupported trigger event or action.');
      if(t.event==='click'&&!objects.has(t.source))issues.push('A click trigger references a missing object.');
      if(t.event==='variable-change'&&!variables.has(t.source))issues.push('A variable trigger references a missing variable.');
      if(t.event==='time'&&(!Number.isFinite(t.at)||t.at<0||t.at>s.duration))issues.push('A timed trigger is outside the slide timeline.');
      if(t.action==='navigate'&&!slideIds.has(t.target))issues.push('A navigation trigger references a missing slide.');
      if(['show-layer','hide-layer'].includes(t.action)&&(!layers.has(t.target)||t.target===s.layers[0].id))issues.push('A layer trigger needs an overlay layer.');
      if(t.action==='state'&&(!objects.has(t.target)||!Object.hasOwn(objects.get(t.target).states,t.value)))issues.push('A state trigger references a missing object or state.');
      if(t.action==='variable'&&!variables.has(t.target))issues.push('A trigger references a missing variable.');
      if(t.action==='variable'&&t.operation==='add'&&variables.get(t.target)?.type!=='number')issues.push('Only number variables support addition.');
      if(t.action==='variable'&&variables.get(t.target)?.type==='number'&&!Number.isFinite(Number(t.value)))issues.push('A number trigger needs a finite value.');
      if(t.condition&&!variables.has(t.condition.variable))issues.push('A condition references a missing variable.');
      if(t.condition&&!['eq','ne','gt','gte','lt','lte'].includes(t.condition.op))issues.push('Unsupported condition operator.');
      if(t.condition&&variables.get(t.condition.variable)?.type==='number'&&!Number.isFinite(Number(t.condition.value)))issues.push('A numeric condition needs a finite comparison value.');
    }
  }
  return [...new Set(issues)];
}
export function learnerProject(p) {
  const copy=clone(p);delete copy.updatedAt;
  for(const s of slidesOf(copy)){delete s.notes;for(const l of s.layers)for(const o of l.objects)delete o.authorNotes;}
  return copy;
}
export function demoProject() {
  const p=newProject('Evidence before action'),s=p.scenes[0].slides[0],base=s.layers[0];
  p.description='An editable leadership decision demonstrating states, layers, variables, and conditional branching.';
  const score={id:uid(),name:'evidence',type:'number',initial:0};p.variables.push(score);
  base.objects[0].text='Evidence before action';
  base.objects[1].text='A team is missing deadlines. What would you do first?';
  const good=newObject('button',{name:'Investigate causes',text:'Gather evidence with the team',x:94,y:410,w:510,h:85,duration:10});
  const quick=newObject('button',{name:'Increase monitoring',text:'Increase monitoring immediately',x:650,y:410,w:530,h:85,duration:10,fill:'#f1eadc',color:'#604818'});
  base.objects.push(good,quick);
  const layer={id:uid(),name:'Decision feedback',modal:true,objects:[
    newObject('shape',{name:'Feedback card',x:140,y:135,w:1000,h:420,fill:'#ffffff'}),
    newObject('text',{name:'Feedback title',text:'Start by testing the explanation.',x:190,y:175,w:880,h:80,fontSize:38,bold:true}),
    newObject('text',{name:'Feedback explanation',text:'Ask about priorities, capacity, and system problems. Compare evidence before choosing a response.\n\nEvidence points: {{evidence}}',x:190,y:285,w:870,h:155,fontSize:28})]};
  const close=newObject('button',{name:'Continue after feedback',text:'Continue',x:790,y:455,w:285,h:65});layer.objects.push(close);s.layers.push(layer);
  const end=newSlide('Reflect on your decision');end.layers[0].objects.push(
    newObject('text',{name:'Reflection heading',text:'What would change your mind?',x:90,y:110,w:1100,h:100,fontSize:52,bold:true}),
    newObject('text',{name:'Decision summary',text:'Your evidence points: {{evidence}}\nName an assumption, the evidence you would seek, and your next action.',x:95,y:260,w:1060,h:200,fontSize:32}));
  const done=newObject('button',{name:'Finish course',text:'Finish',x:95,y:530,w:260,h:72});end.layers[0].objects.push(done);
  p.scenes[0].slides.push(end);
  const trigger=(event,source,action,target,value,extra={})=>({id:uid(),event,source,action,target,value,operation:'set',enabled:true,at:0,...extra});
  s.triggers.push(trigger('click',good.id,'variable',score.id,1,{operation:'add'}),trigger('click',good.id,'show-layer',layer.id,''),
    trigger('click',quick.id,'show-layer',layer.id,''),trigger('click',close.id,'navigate',end.id,''));
  end.triggers.push(trigger('click',done.id,'complete','',''));
  return p;
}
