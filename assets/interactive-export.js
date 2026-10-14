import {learnerProject,validateProject} from './interactive-model.js';
import {createEngine} from './interactive-engine.js';
import {mountPlayer,PLAYER_CSS} from './interactive-player.js';
export function exportHTML(project) {
  const issues=validateProject(project);if(issues.length)throw Error(issues.join('\n'));
  const data=JSON.stringify(learnerProject(project)).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(project.title)+'</title><style>body{margin:0;padding:20px;background:#edf4fa}main{max-width:1280px;margin:auto}'+PLAYER_CSS+'</style></head><body><main id="course"></main><script type="application/json" id="project">'+data+'</script><script>'+createEngine.toString()+'\n'+mountPlayer.toString()+'\nmountPlayer(document.getElementById("course"),JSON.parse(document.getElementById("project").textContent),{persist:true});</script></body></html>';
}
