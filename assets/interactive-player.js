import {createEngine} from './interactive-engine.js';
export const PLAYER_CSS = '.ic-player{font-family:Arial,sans-serif;color:#173653;background:#edf4fa;border-radius:14px;overflow:hidden}.ic-bar{display:flex;align-items:center;gap:10px;padding:12px 18px;background:white;border-bottom:1px solid #d7e4ef}.ic-bar h2{font-size:17px;margin:0;flex:1}.ic-bar button,.ic-footer button{border:1px solid #b8cfdf;border-radius:8px;background:white;color:#174a74;padding:9px 14px;font:inherit;cursor:pointer}.ic-player button:focus-visible,.ic-object:focus-visible{outline:3px solid #b38b36;outline-offset:3px}.ic-viewport{position:relative;overflow:hidden;margin:auto;background:#d9e6f0}.ic-slide{position:relative;transform-origin:top left}.ic-object{position:absolute;box-sizing:border-box;overflow:hidden;white-space:pre-wrap;overflow-wrap:anywhere;display:flex;align-items:center;padding:12px;border:0;font-family:inherit}.ic-object img{width:100%;height:100%;object-fit:contain}.ic-object[data-interactive=true]{cursor:pointer}.ic-object[data-state=visited]{box-shadow:inset 0 0 0 3px #b38b36}.ic-object[data-state=disabled]{opacity:.55;cursor:default}.ic-overlay{position:absolute;inset:0;z-index:100}.ic-overlay[role=dialog]{background:#16304c99}.ic-footer{display:flex;align-items:center;gap:12px;padding:12px 18px;background:white}.ic-footer input{flex:1;min-width:80px}.ic-footer span{font-size:13px}.ic-complete{padding:12px;background:#e4f3e9;color:#225338;text-align:center;font-weight:bold}.ic-debug{padding:14px;background:#f6f9fc;border-top:1px solid #d7e4ef;font-size:13px;max-height:200px;overflow:auto}.ic-debug pre{white-space:pre-wrap;margin:8px 0}.ic-player :disabled{opacity:.5;cursor:default}@media(max-width:600px){.ic-bar,.ic-footer{padding:10px;flex-wrap:wrap}.ic-footer span{font-size:11px}}';
// This function deliberately contains its DOM helpers so it can also run in a standalone HTML export.
export function mountPlayer(host,project,options={}) {
  const doc=host.ownerDocument,win=doc.defaultView;
  let engine,frame,last,disposed=false,lastRender='',lastSave=0,priorFocus=null,activeDialog='';
  const key='mayne-course-progress:'+project.id,allSlides=project.scenes.flatMap(s=>s.slides);
  host.className='ic-player';host.replaceChildren();
  function element(tag,cls,text){const e=doc.createElement(tag);e.className=cls||'';if(text!==undefined)e.textContent=text;return e;}
  function button(text,fn,label){const e=element('button','',text);e.type='button';if(label)e.setAttribute('aria-label',label);e.onclick=fn;return e;}
  const bar=element('div','ic-bar'),title=element('h2','',project.title),viewport=element('div','ic-viewport'),stage=element('div','ic-slide');
  const footer=element('div','ic-footer'),prev=button('← Previous',()=>navigate(-1)),toggle=button('Pause',()=>engine.snapshot().playing?engine.pause():engine.play());
  const seek=element('input');seek.type='range';seek.min='0';seek.step='.05';seek.setAttribute('aria-label','Slide timeline');seek.oninput=()=>engine.seek(Number(seek.value));
  const count=element('span'),next=button('Next →',()=>navigate(1)),restart=button('Restart',()=>{try{win.localStorage.removeItem(key);}catch{}engine.restart();});
  const complete=element('div','ic-complete','Course complete'),debug=element('div','ic-debug');complete.hidden=true;
  bar.append(title,restart);viewport.append(stage);footer.append(prev,toggle,seek,count,next);host.append(bar,viewport,footer,complete);
  if(options.debug)host.append(debug);
  function navigate(delta){const i=allSlides.findIndex(s=>s.id===engine.snapshot().slideId);if(allSlides[i+delta])engine.goto(allSlides[i+delta].id);}
  function size(){const width=Math.min(host.clientWidth||960,project.width);viewport.style.width=width+'px';viewport.style.height=(width/project.width*project.height)+'px';stage.style.width=project.width+'px';stage.style.height=project.height+'px';stage.style.transform='scale('+(width/project.width)+')';}
  function safeImage(src){if(/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(src||''))return src;try{const u=new URL(src);return u.protocol==='https:'?u.href:'';}catch{return '';}}
  function object(o,parent,interactive=true){
    const v=engine.style(o),s=engine.snapshot();
    if(o.hidden||v.state==='hidden'||s.time<o.start||s.time>o.start+o.duration)return;
    const clickable=interactive&&(o.type==='button'||engine.slide().triggers.some(t=>t.event==='click'&&t.source===o.id&&t.enabled!==false));
    const e=element(clickable?'button':'div','ic-object');e.dataset.id=o.id;e.dataset.state=v.state;e.dataset.interactive=String(clickable);
    if(clickable){e.type='button';e.disabled=v.state==='disabled';e.onclick=()=>{try{engine.click(o.id);}catch(error){options.onError?.(error);}};}
    if(o.decorative)e.setAttribute('aria-hidden','true');
    if(o.type==='image'){const img=element('img');img.src=safeImage(v.src);img.alt=o.decorative?'':(o.alt||o.name);e.style.padding='0';e.append(img);}
    else if(o.type!=='shape')e.textContent=engine.text(v.text);
    else if(!o.decorative&&o.alt){e.setAttribute('role','img');e.setAttribute('aria-label',o.alt);}
    function appearance(value){
      Object.assign(e.style,{left:value.x+'px',top:value.y+'px',width:value.w+'px',height:value.h+'px',transform:'rotate('+value.rotation+'deg)',background:value.fill,color:value.color,
        fontSize:value.fontSize+'px',fontWeight:value.bold?'700':'400',borderRadius:value.radius+'px',textAlign:value.align,justifyContent:value.align==='center'?'center':value.align==='right'?'flex-end':'flex-start'});
      if(o.type==='text'||o.type==='button')e.textContent=engine.text(value.text);
    }
    appearance(v);
    if(clickable&&v.state!=='disabled'&&o.states.hover){
      e.onmouseenter=e.onfocus=()=>appearance({...v,...o.states.hover});
      e.onmouseleave=e.onblur=()=>appearance(v);
    }
    parent.append(e);
  }
  function render(state){
    if(disposed||!engine)return;
    const s=engine.slide(),m=state.memory[s.id],i=allSlides.findIndex(sl=>sl.id===s.id);
    title.textContent=project.title+' · '+s.title;seek.max=s.duration;seek.value=state.time;toggle.textContent=state.playing?'Pause':'Play';
    prev.disabled=i===0;next.disabled=i===allSlides.length-1;count.textContent=(i+1)+' / '+allSlides.length+' · '+state.time.toFixed(1)+'s';
    complete.hidden=!state.completed;
    const signature=JSON.stringify({slide:s.id,states:m.states,layers:m.layers,variables:state.variables,visible:s.layers.flatMap(l=>l.objects.map(o=>[o.id,state.time>=o.start&&state.time<=o.start+o.duration]))});
    if(signature!==lastRender){
      const focused=stage.contains(doc.activeElement)?doc.activeElement.dataset.id:null;
      stage.replaceChildren();stage.style.background=s.background;
      const modalLayers=s.layers.filter(l=>l.modal&&m.layers.includes(l.id)),topModal=modalLayers.at(-1);
      for(const o of s.layers[0].objects)object(o,stage,!topModal);
      for(const l of s.layers.slice(1).filter(l=>m.layers.includes(l.id))){
        const overlay=element('div','ic-overlay');overlay.dataset.layer=l.id;
        if(l.modal){overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',l.name);}
        for(const o of l.objects)object(o,overlay,!topModal||l.id===topModal.id);
        if(l.modal){const dismiss=button('×',()=>engine.hideLayer(l.id),'Close '+l.name);Object.assign(dismiss.style,{position:'absolute',top:'15px',right:'15px',fontSize:'28px',zIndex:200});overlay.append(dismiss);}
        stage.append(overlay);
      }
      bar.inert=!!topModal;footer.inert=!!topModal;
      if(topModal&&activeDialog!==topModal.id){priorFocus=focused;activeDialog=topModal.id;const el=stage.querySelector('[data-layer="'+topModal.id+'"] button');el?.focus();}
      else if(!topModal&&activeDialog){activeDialog='';stage.querySelector('[data-id="'+priorFocus+'"]')?.focus();}
      else if(focused)stage.querySelector('[data-id="'+focused+'"]')?.focus();
      lastRender=signature;size();
    }
    if(options.debug){debug.replaceChildren(element('strong','', 'Live variables and trigger execution'));const values=element('pre','',project.variables.map(v=>v.name+' = '+state.variables[v.id]).join('\n')||'No variables defined.');const log=element('pre','',state.log.slice(-6).map(l=>l.event+' → '+l.action+(l.passed?'':' (condition false)')).join('\n'));debug.append(values,log);}
    if(options.persist&&Date.now()-lastSave>750){try{win.localStorage.setItem(key,JSON.stringify(state));lastSave=Date.now();}catch{}}
    options.onChange?.(state);
  }
  let saved;try{if(options.persist)saved=JSON.parse(win.localStorage.getItem(key)||'null');}catch{}
  engine=createEngine(project,{saved,onChange:render,onComplete:state=>{
    try{if(options.persist)win.localStorage.setItem(key,JSON.stringify(state));}catch{}
    host.dispatchEvent(new win.CustomEvent('mayne-course-complete',{bubbles:true,detail:{projectId:project.id,completed:true}}));options.onComplete?.(state);
  }});
  if(!saved)engine.fire('enter',project.startSlideId);render(engine.snapshot());
  const onKey=e=>{
    const dialogs=stage.querySelectorAll('[role=dialog]'),dialog=dialogs[dialogs.length-1];if(!dialog)return;
    if(e.key==='Escape'){e.preventDefault();engine.hideLayer(dialog.dataset.layer);return;}if(e.key!=='Tab')return;
    const buttons=[...dialog.querySelectorAll('button:not(:disabled)')];if(!buttons.length){e.preventDefault();return;}
    const at=buttons.indexOf(doc.activeElement);
    if(e.shiftKey&&at<=0){e.preventDefault();buttons.at(-1).focus();}else if(!e.shiftKey&&(at<0||at===buttons.length-1)){e.preventDefault();buttons[0].focus();}
  };
  host.addEventListener('keydown',onKey);win.addEventListener('resize',size);
  const resize=win.ResizeObserver?new win.ResizeObserver(size):null;resize?.observe(host);size();
  function tick(now){if(disposed)return;const delta=last===undefined?0:Math.min(.1,(now-last)/1000);last=now;try{engine.advance(delta);}catch(error){options.onError?.(error);}frame=win.requestAnimationFrame(tick);}
  frame=win.requestAnimationFrame(tick);
  return {engine,destroy(){disposed=true;win.cancelAnimationFrame(frame);resize?.disconnect();win.removeEventListener('resize',size);host.removeEventListener('keydown',onKey);engine.destroy();}};
}
