// Private course content is supplied as a local snapshot; keys are not bundled into the website.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM,VirtualConsole} from 'jsdom';
import {cleanCourse,calculate,completionRows,csv} from '../src/lms/model.js';

if(!process.argv[2])throw Error('Supply the private CT-201 course JSON snapshot.');
const c=cleanCourse(JSON.parse(await readFile(process.argv[2],'utf8')));
assert.equal(c.modules.length,8);assert.equal(c.items.length,32);
assert.equal(c.published,false);assert.equal(c.pass,70);
assert(c.syllabus&&c.instructor_guide);
assert.equal(c.items.reduce((n,i)=>n+i.points,0),1000);
const allIds=new Set();let questions=0;
for(const module of c.modules){
 const items=c.items.filter(i=>i.module===module.id);
 assert.equal(items.length,4);
 assert.deepEqual(items.map(i=>i.type),['lecture','discussion','assignment','quiz']);
 for(const i of items){assert(i.published&&i.required);assert(!allIds.has(i.id));allIds.add(i.id);if(i.rubric?.length)assert.equal(i.rubric.reduce((n,r)=>n+r.points,0),i.points);}
 const q=items.find(i=>i.type==='quiz');assert.equal(q.questions.length,10);assert.equal(q.points,30);assert(q.instructor_notes);
 for(const question of q.questions){assert(!allIds.has(question.id));allIds.add(question.id);assert.equal(question.points,3);assert.equal(question.options.length,4);assert(!Object.hasOwn(question,'why'));questions++;}
 const d=items.find(i=>i.type==='discussion');assert.equal(d.replies,2);assert.equal(d.postFirst,true);assert.equal(d.points,20);
}
assert.equal(questions,80);
const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>{throw error;});
const dom=new JSDOM('<main id="lesson"></main>',{url:'https://www.mayneleadership.com/lms-lesson.html',pretendToBeVisual:true,virtualConsole});
// jsdom has no layout engine; its missing scroll API is irrelevant to the completion contract.
dom.window.HTMLElement.prototype.scrollIntoView=function(){};
for(const key of ['window','document','DOMParser','localStorage','location'])globalThis[key]=dom.window[key];
const {mountCourse}=await import('../assets/lesson-player.js');
for(const i of c.items.filter(i=>i.type==='lecture')){
 let completed=false;const host=document.querySelector('#lesson');const player=mountCourse(host,i.lesson_data,{storageSuffix:i.id,onComplete:()=>{completed=true;}});
 assert.equal(host.querySelectorAll('details.interactive-details').length,4);
 assert(host.querySelectorAll('a[href^="https://"]').length>=2);
 const prose=[...host.querySelectorAll('.rich')].map(el=>el.textContent).join(' ');
 assert(prose.split(/\s+/).filter(Boolean).length>=1000,'Full lecture content missing: '+i.title);
 assert(!host.querySelector('script,object'));assert(!prose.includes('Correct answer:'));
 host.querySelector('.next-lesson').click();assert(completed);player.destroy();
}
const learner={id:'qa-student',user_id:'qa-global',external_id:'COLLEGE-QA',name:'QA Learner',email:'qa@example.invalid',active:true};
const data={course:{id:'qa-class',name:'QA College Course',data:c},enrollments:[learner],submissions:[],views:[],posts:[]};
for(const i of c.items){
 if(i.type==='lecture')data.views.push({enrollment_id:learner.id,item_id:i.id});
 else data.submissions.push({enrollment_id:learner.id,item_id:i.id,status:'graded',score:i.points,posted:true});
 if(i.type==='discussion'){const peer=i.id+':peer';data.posts.push({id:peer,item_id:i.id,enrollment_id:'qa-peer',parent_id:null},{id:i.id+':initial',item_id:i.id,enrollment_id:learner.id,parent_id:null},{id:i.id+':reply1',item_id:i.id,enrollment_id:learner.id,parent_id:peer},{id:i.id+':reply2',item_id:i.id,enrollment_id:learner.id,parent_id:peer});}
}
assert.deepEqual(calculate(data,learner.id),{current:100,final:100,required:32,done:32,progress:100,status:'completed'});
const rows=completionRows(data);assert.equal(rows[0].course_id,c.template_id);assert.equal(rows[0].external_student_id,'COLLEGE-QA');assert(csv(rows).includes('completed'));
data.submissions.find(s=>c.items.find(i=>i.id===s.item_id).type==='assignment').posted=false;
assert.equal(calculate(data,learner.id).status,'awaiting_grading');
console.log('PASS: 8 lecture displays and completion actions; 32 required activities; 80 question keys; 1,000-point gradebook; rubric totals; held grades; completion exports.');
