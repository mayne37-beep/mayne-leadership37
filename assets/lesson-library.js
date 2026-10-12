const section=document.getElementById('authored-course-section');
try{
 const response=await fetch('/api/lesson-studio?action=list');if(!response.ok)throw Error();
 const courses=(await response.json()).filter(c=>c.published&&!document.querySelector('[data-course-id="'+c.id+'"]'));
 if(courses.length){section.hidden=false;const grid=document.getElementById('authored-courses');for(const course of courses){const card=document.createElement('article');card.className='page-card';const icon=document.createElement('div');icon.className='icon';icon.textContent='✧';icon.setAttribute('aria-hidden','true');const title=document.createElement('h3');title.textContent=course.title;const desc=document.createElement('p');desc.textContent=course.description||course.lessons+' lessons from Lesson Authoring Studio.';const link=document.createElement('a');link.className='text-link';link.href='lesson-player.html?course='+encodeURIComponent(course.id);link.textContent='Start course →';card.append(icon,title,desc,link);grid.append(card);}}
}catch{/* Existing learning resources remain available when shared storage is unavailable. */}
