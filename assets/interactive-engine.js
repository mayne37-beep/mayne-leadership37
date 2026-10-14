// Shared, deterministic interaction engine. No DOM or authoring UI dependencies.
export function createEngine(project, options={}) {
  const copy=x=>JSON.parse(JSON.stringify(x));
  const slides=project.scenes.flatMap(s=>s.slides),definition=new Map(project.variables.map(v=>[v.id,v]));
  const fresh=()=>({slideId:project.startSlideId,time:0,playing:true,completed:false,visited:[],variables:Object.fromEntries(project.variables.map(v=>[v.id,v.initial])),memory:{},log:[]});
  let data=fresh(),depth=0,stopped=false;
  function slide(){return slides.find(s=>s.id===data.slideId)||slides[0];}
  function initialMemory(s){return {states:Object.fromEntries(s.layers.flatMap(l=>l.objects.map(o=>[o.id,o.initialState]))),layers:[],fired:[],ended:false,time:0};}
  function memory(){return data.memory[data.slideId] ||= initialMemory(slide());}
  function change(){options.onChange?.(snapshot());}
  function cast(id,value) {const v=definition.get(id);if(!v)return value;if(v.type==='number'){const n=Number(value);if(!Number.isFinite(n))throw Error('A number variable needs a finite value.');return n;}if(v.type==='boolean')return value===true||String(value)==='true';return String(value??'');}
  function condition(c){if(!c)return true;const left=data.variables[c.variable],right=cast(c.variable,c.value);return {eq:()=>left===right,ne:()=>left!==right,gt:()=>left>right,gte:()=>left>=right,lt:()=>left<right,lte:()=>left<=right}[c.op]?.()??false;}
  function goto(id,quiet=false) {
    const s=slides.find(s=>s.id===id);if(!s)return;
    data.slideId=id;
    if(!data.memory[id]||s.revisit==='reset')data.memory[id]=initialMemory(s);
    data.time=memory().time;data.playing=true;
    if(!data.visited.includes(id))data.visited.push(id);
    if(!quiet)fire('enter',s.id);change();
  }
  function action(t) {
    const m=memory();
    if(t.action==='show-layer'){if(!m.layers.includes(t.target))m.layers.push(t.target);}
    else if(t.action==='hide-layer')m.layers=m.layers.filter(id=>id!==t.target);
    else if(t.action==='state')m.states[t.target]=t.value;
    else if(t.action==='navigate')goto(t.target);
    else if(t.action==='variable'){
      const old=data.variables[t.target],value=t.operation==='add'?Number(old)+Number(t.value):t.value;
      data.variables[t.target]=cast(t.target,value);
      if(old!==data.variables[t.target])fire('variable-change',t.target);
    }
    else if(t.action==='complete'&&!data.completed){data.completed=true;options.onComplete?.(snapshot());}
    else if(t.action==='play')data.playing=true;
    else if(t.action==='pause')data.playing=false;
  }
  function fire(event,source,only=null) {
    if(stopped)return;
    if(++depth>40){depth--;data.playing=false;throw Error('Interaction loop detected. Review variable-change triggers.');}
    const atSlide=data.slideId;
    try{
      const matches=slide().triggers.filter(t=>t.enabled!==false&&t.event===event&&(event==='enter'||event==='timeline-end'||event==='time'||t.source===source)&&(!only||t.id===only));
      for(const t of matches){
        if(data.slideId!==atSlide)break;
        const passed=condition(t.condition);
        data.log.push({event,trigger:t.id,action:t.action,passed,time:data.time,slide:atSlide});
        if(data.log.length>30)data.log.shift();
        if(passed)action(t);
      }
    }finally{depth--;change();}
  }
  function click(id) {
    const o=slide().layers.flatMap(l=>l.objects).find(o=>o.id===id),state=memory().states[id];
    if(!o||state==='disabled'||state==='hidden'||o.hidden)return;
    fire('click',id);
    if(data.slideId===slide().id&&data.memory[data.slideId]?.states[id]==='normal'&&o.states.visited)memory().states[id]='visited';
    change();
  }
  function advance(delta) {
    if(!data.playing||stopped)return;
    const s=slide(),m=memory(),from=data.time;
    if(s.layers.some(l=>l.modal&&m.layers.includes(l.id)))return;
    data.time=Math.min(s.duration,Math.max(0,from+delta));m.time=data.time;
    for(const t of s.triggers){
      if(t.event==='time'&&!m.fired.includes(t.id)&&t.at>=from&&t.at<=data.time){
        m.fired.push(t.id);fire('time',s.id,t.id);if(data.slideId!==s.id)return;
      }
    }
    if(data.time>=s.duration&&!m.ended){m.ended=true;data.playing=false;fire('timeline-end',s.id);}
    change();
  }
  function snapshot(){return copy(data);}
  function restore(saved) {
    if(!saved||!slides.some(s=>s.id===saved.slideId))return false;
    data=fresh();data.slideId=saved.slideId;data.completed=!!saved.completed;
    data.visited=(saved.visited||[]).filter(id=>slides.some(s=>s.id===id));
    for(const v of project.variables)if(Object.hasOwn(saved.variables||{},v.id))data.variables[v.id]=cast(v.id,saved.variables[v.id]);
    for(const s of slides){
      const raw=saved.memory?.[s.id];if(!raw)continue;
      const m=initialMemory(s);
      for(const l of s.layers)for(const o of l.objects)if(Object.hasOwn(o.states,raw.states?.[o.id]))m.states[o.id]=raw.states[o.id];
      m.layers=(raw.layers||[]).filter(id=>s.layers.some(l=>l.id===id&&id!==s.layers[0].id));
      m.fired=(raw.fired||[]).filter(id=>s.triggers.some(t=>t.id===id));m.ended=!!raw.ended;
      m.time=Math.min(s.duration,Math.max(0,Number(raw.time)||0));data.memory[s.id]=m;
    }
    data.time=memory().time;data.playing=false;change();return true;
  }
  function text(value){return String(value??'').replace(/\{\{([a-z][a-z0-9_]*)\}\}/gi,(_,name)=>{const v=project.variables.find(v=>v.name===name);return v?String(data.variables[v.id]):'{{'+name+'}}';});}
  function style(o){const name=memory().states[o.id]||o.initialState;return {...o,...o.states[name],state:name};}
  function setState(id,name){const o=slide().layers.flatMap(l=>l.objects).find(o=>o.id===id);if(o&&Object.hasOwn(o.states,name)){memory().states[id]=name;change();}}
  const api={slide,snapshot,restore,goto,fire,click,advance,text,style,setState,
    pause:()=>{data.playing=false;change();},play:()=>{data.playing=true;change();},
    seek:time=>{data.time=Math.min(slide().duration,Math.max(0,Number(time)||0));memory().time=data.time;change();},
    restart:()=>{data=fresh();goto(project.startSlideId);},
    hideLayer:id=>{memory().layers=memory().layers.filter(x=>x!==id);change();},
    destroy:()=>{stopped=true;},
  };
  if(options.saved)restore(options.saved);else goto(project.startSlideId,true);
  return api;
}
