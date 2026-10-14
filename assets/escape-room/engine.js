(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const normalized = value => String(value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const objects = project => project.scenes.flatMap(scene => scene.objects);
  const find = (project, id) => objects(project).find(object => object.id === id);
  function newRun(project) {
    return {sceneId:project.startSceneId || project.scenes[0].id, solved:[], taken:[], inventory:[], revealed:[], placed:{}, hints:{}, attempts:0, started:Date.now(), pausedMs:0, finished:false, ended:null, log:[]};
  }
  function available(run, object) { return (object.requires || []).every(id => run.solved.includes(id)); }
  function visible(run, object) { return (!object.hidden || run.revealed.includes(object.id)) && !run.taken.includes(object.id); }
  function record(run, event, object) { run.log.push({event,objectId:object.id,name:object.name,elapsed:Date.now()-run.started-run.pausedMs}); }
  function collect(project, run, id) {
    const object = find(project,id);
    if (!object || object.type !== 'item' || !visible(run,object) || !available(run,object)) return {ok:false,message:'This item is not available yet.'};
    if (!run.inventory.includes(id)) { run.inventory.push(id); run.taken.push(id); record(run,'collected',object); }
    return {ok:true,message:object.name+' added to your inventory.'};
  }
  function solve(project,run,object) {
    if (!run.solved.includes(object.id)) { run.solved.push(object.id); record(run,'solved',object); }
    for (const id of object.reveal || []) if (!run.revealed.includes(id)) run.revealed.push(id);
    if (object.type === 'finish') {run.finished=true;run.ended=Date.now();record(run,'completed',object);}
    if (object.destination && project.scenes.some(scene => scene.id === object.destination)) run.sceneId=object.destination;
    return {ok:true,message:object.success || 'Puzzle solved.',destination:object.destination || '',finished:run.finished};
  }
  function answer(project,run,id,value) {
    const object=find(project,id);
    if (!object || !['code','finish'].includes(object.type)) return {ok:false,message:'This object is not an answer puzzle.'};
    if (run.finished || !visible(run,object)) return {ok:false,message:'This puzzle is not available.'};
    if (!available(run,object)) return {ok:false,message:object.locked || 'Solve the connected puzzles first.'};
    run.attempts++;
    const choices=[object.answer,...(object.alternatives || [])].filter(value => String(value ?? '').trim());
    if (!choices.length || !choices.some(answer => normalized(answer)===normalized(value))) {record(run,'incorrect answer',object);return {ok:false,message:object.incorrect || 'That answer does not fit the evidence. Try again.'};}
    return solve(project,run,object);
  }
  function drop(project,run,itemId,targetId) {
    const item=find(project,itemId), target=find(project,targetId);
    if (!item || item.type!=='item' || !target || target.type!=='target') return {ok:false,message:'Choose a drop target for this item.'};
    if ((!run.inventory.includes(itemId) && !visible(run,item)) || (!run.inventory.includes(itemId) && !available(run,item))) return {ok:false,message:'This item is not available yet.'};
    if (!visible(run,target) || !available(run,target)) return {ok:false,message:target.locked || 'This target is not ready yet.'};
    if (run.solved.includes(targetId)) return {ok:false,message:'This puzzle is already complete.'};
    run.attempts++;
    if (target.accepts!==itemId) {record(run,'incorrect item',target);return {ok:false,message:target.incorrect || 'That item does not fit here.'};}
    if (!run.taken.includes(itemId)) run.taken.push(itemId);
    if (target.placement === 'keep') {if (!run.inventory.includes(itemId)) run.inventory.push(itemId);}
    else {run.inventory=run.inventory.filter(id=>id!==itemId);if (target.placement==='attach') run.placed[targetId]=itemId;}
    return solve(project,run,target);
  }
  function activate(project,run,id) {
    const object=find(project,id);
    if (!object || run.finished || !visible(run,object) || !available(run,object)) return {ok:false,message:object?.locked || 'Solve the connected puzzles first.'};
    if (object.type==='portal' || (object.type==='target' && run.solved.includes(id))) return solve(project,run,object);
    if (object.type==='finish' && !object.answer) return solve(project,run,object);
    return {ok:false,message:'Inspect this object to continue.'};
  }
  function validate(project) {
    const errors=[];
    if (!project || project.schemaVersion!==1 || !Array.isArray(project.scenes) || !project.scenes.length) return ['This is not an Escape Room Studio project.'];
    const all=objects(project), ids=all.map(o=>o.id), scenes=project.scenes.map(s=>s.id);
    if (new Set(ids).size!==ids.length || new Set(scenes).size!==scenes.length) errors.push('Scene and object IDs must be unique.');
    if (!scenes.includes(project.startSceneId)) errors.push('Select an existing starting scene.');
    if (!all.some(o=>o.type==='finish')) errors.push('Add a Finish object so learners can complete the room.');
    for (const o of all) {
      if (o.type==='target' && !all.some(x=>x.id===o.accepts && x.type==='item')) errors.push(o.name+': select an item this target accepts.');
      if (o.type==='code' && !String(o.answer || '').trim()) errors.push(o.name+': enter a correct answer.');
      if (o.destination && !scenes.includes(o.destination)) errors.push(o.name+': destination scene is missing.');
      if (o.type==='portal' && !o.destination) errors.push(o.name+': select a destination scene.');
      for (const id of [...(o.requires||[]),...(o.reveal||[])]) if (!ids.includes(id)) errors.push(o.name+': a connected object was removed.');
      if ((o.requires||[]).includes(o.id)) errors.push(o.name+': an object cannot require itself.');
      for (const id of o.requires||[]) if (ids.includes(id) && !['code','target','finish'].includes(find(project,id).type)) errors.push(o.name+': prerequisites must be solvable puzzles.');
    }
    const visited=new Set(),visiting=new Set();
    function visit(id){if(visiting.has(id))return true;if(visited.has(id))return false;visiting.add(id);const cycle=(find(project,id)?.requires||[]).some(next=>ids.includes(next)&&visit(next));visiting.delete(id);visited.add(id);return cycle;}
    if(all.some(o=>visit(o.id)))errors.push('A prerequisite loop makes the room unsolvable. Remove one of the circular requirements.');
    return errors;
  }
  const api={clone,normalized,objects,find,newRun,available,visible,collect,answer,drop,activate,validate};
  root.EscapeEngine=api;
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
})(typeof window === 'undefined' ? globalThis : window);
