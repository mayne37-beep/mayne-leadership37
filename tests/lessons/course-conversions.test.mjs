import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseDocument} from 'htmlparser2';
import {findAll,textContent} from 'domutils';
import {normalizeCourse,validatePublish} from '../../assets/lesson-model.js';
import {videoSource} from '../../assets/lesson-player.js';
const report=JSON.parse(fs.readFileSync('courses/site-conversion-report.json'));
const norm=s=>s.replace(/\s+/g,' ').trim();
const strings=o=>typeof o==='string'?[norm(textContent(parseDocument(o)))]:o&&typeof o==='object'?Object.values(o).flatMap(strings):[];
for(const r of report)test(r.title+' preserves original lesson content and passes studio validation',()=>{
 const course=JSON.parse(fs.readFileSync('courses/'+r.slug+'.lesson.json'));
 assert.deepEqual(validatePublish(normalizeCourse(course)),[]);assert.equal(course.lessons.length,r.lessons);assert.equal(course.lessons.reduce((n,l)=>n+l.blocks.length,0),r.blocks);
 for(const lesson of course.lessons)assert(lesson.blocks.length>0&&lesson.blocks.length<=500);
 const blocks=course.lessons.flatMap(l=>l.blocks);assert(!blocks.some(b=>b.type==='embed'),'Course must be editable content, rather than an iframe of the old page.');
 for(const b of blocks){if(b.type==='custom')assert(!b.js&&b.html.includes('<svg'),'Only the original vector diagram should use custom code.');if(b.type==='image'&&b.image.startsWith('/'))assert(fs.existsSync('.'+b.image));}
 if(r.slug==='leading-like-lasso')return;
 const source=parseDocument(fs.readFileSync(r.source,'utf8').replace(/<br\s*\/?\s*>/gi,'<br> '));const main=findAll(n=>n.name==='main',source.children)[0];const output=strings(course);
 for(const el of findAll(n=>n.name==='p'||n.name==='h2',main.children)){const text=norm(textContent(el));if(text.length>25)assert(output.some(s=>s.includes(text)),'Missing source text: '+text);}
 assert.equal(course.settings.navigation,'restricted');
});
test('Systems Thinking keeps all five four-question checkpoints and boundary answer keys',()=>{
 const course=JSON.parse(fs.readFileSync('courses/systems-thinking-foundations.lesson.json'));const blocks=course.lessons.flatMap(l=>l.blocks);const quizzes=blocks.filter(b=>b.type==='quiz');assert.equal(quizzes.length,5);assert(quizzes.every(b=>b.questions.length===4));assert(quizzes.flatMap(b=>b.questions).every(q=>q.options.filter(o=>o.correct).length===1));assert.equal(blocks.filter(b=>b.type==='msq').length,2);assert(blocks.filter(b=>b.type==='msq').every(b=>b.options.filter(o=>o.correct).length===6));
});
test('Creative Thinking preserves the 20-idea exercise, five questions, five reframes, and seven SCAMPER prompts',()=>{
 const course=JSON.parse(fs.readFileSync('courses/creative-thinking-foundations.lesson.json'));const blocks=course.lessons.flatMap(l=>l.blocks);assert.equal(blocks.filter(b=>b.type==='reflection'&&/^Diverge: Idea /.test(b.title)).length,20);assert.equal(blocks.filter(b=>b.type==='reflection'&&/^Explore: Question /.test(b.title)).length,5);assert.equal(blocks.filter(b=>b.type==='reflection'&&/^Reframe \d/.test(b.title)).length,5);assert.equal(blocks.filter(b=>b.type==='reflection'&&/^[SCAMPER] · /.test(b.title)).length,7);assert(blocks.some(b=>b.type==='reflection'&&!b.required),'Optional source labs remain optional.');
});
test('Lasso keeps all 30 scene lessons, selected clips, and missing-clip notices',()=>{
 const source=parseDocument(fs.readFileSync('leading-like-lasso.html','utf8'));const get=id=>JSON.parse(textContent(findAll(n=>n.name==='script'&&n.attribs.id===id,source.children)[0]));const original=get('course-data'),clips=get('clip-config');const course=JSON.parse(fs.readFileSync('courses/leading-like-lasso.lesson.json'));
 assert.equal(course.lessons.length,30);let count=0;
 original.forEach((r,i)=>{const l=course.lessons[i],content=strings(l);assert.equal(l.title,r.title);for(const text of [r.summary,r.why,r.application,r.judgment,r.result,...r.behaviors,...r.actions,...r.questions])assert(content.some(s=>s.includes(norm(text))),'Missing Lasso content: '+r.id);assert.equal(l.blocks.filter(b=>b.type==='video').length,(clips.lessons[r.id]||[]).length);count+=l.blocks.filter(b=>b.type==='video').length;});
 assert.equal(count,Object.values(clips.lessons).reduce((n,c)=>n+c.length,0));
 for(const text of Object.values(clips.selection.missing))assert(strings(course).includes(text));
});
test('YouTube video cues survive playback URL conversion',()=>{
 globalThis.location={href:'https://www.mayneleadership.com/lesson-player.html'};
 assert.equal(videoSource('https://www.youtube.com/watch?v=9DbW8ZKhZ3Q&t=78&end=294').embed,'https://www.youtube-nocookie.com/embed/9DbW8ZKhZ3Q?start=78&end=294');
 assert.equal(videoSource('https://youtu.be/9DbW8ZKhZ3Q?t=78s').embed,'https://www.youtube-nocookie.com/embed/9DbW8ZKhZ3Q?start=78');
 assert.equal(videoSource('https://www.youtube.com/watch?v=9DbW8ZKhZ3Q').embed,'https://www.youtube-nocookie.com/embed/9DbW8ZKhZ3Q');
 assert.equal(videoSource('javascript:alert(1)').file,'');
});
