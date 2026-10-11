import {mountCourse,esc} from './lesson-player.js';
const root=document.querySelector('#course-player');
try{
 const id=new URLSearchParams(location.search).get('course');if(!id)throw Error('Open a published course link from the lesson library.');
 const res=await fetch('/api/lesson-studio?action=published&id='+encodeURIComponent(id));
 if(!res.ok)throw Error('This lesson is unavailable or has not been published.');
 const data=await res.json();document.title=data.data.title+' · Mayne Leadership';mountCourse(root,data.data);
}catch(e){root.innerHTML='<div class="loading"><h1>Lesson unavailable</h1><p>'+esc(e.message)+'</p><a href="/learning.html">Return to the learning library →</a></div>';}
