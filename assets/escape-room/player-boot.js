(async function(){
 'use strict';
 const app=document.getElementById('app'),params=new URLSearchParams(location.search),room=params.get('room');
 app.innerHTML='<main style="max-width:660px;margin:80px auto;padding:30px"><h1>Escape Room Studio</h1><p>Opening your learning mission…</p></main>';
 try{
  if(!/^[a-f0-9]{48}$/.test(room||''))throw new Error('Open the learner link shared by your instructor.');
  const result=await EscapeCloud.published(room);window.ESCAPE_PACKAGE=result.data;window.ESCAPE_REMOTE_ROOM=room;
  const script=document.createElement('script');script.src='/assets/escape-room/app.js';script.onerror=()=>{app.textContent='The player could not load. Refresh to try again.';};document.body.appendChild(script);
 }catch(error){app.innerHTML='<main style="max-width:660px;margin:80px auto;padding:30px"><h1>This room is unavailable</h1><p id="playerError"></p><p>Ask your instructor for a current published room link.</p></main>';document.getElementById('playerError').textContent=error.message;}
})();
