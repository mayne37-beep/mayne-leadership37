// Converts the original course into native, form-editable Lesson Studio blocks.
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {parseDocument} from 'htmlparser2';
import {findAll,textContent,getOuterHTML} from 'domutils';
import {newCourse,newLesson,newBlock,normalizeCourse,validatePublish} from '../assets/lesson-model.js';
const source=fs.readFileSync('critical-thinking-foundations.html','utf8');
const doc=parseDocument(source.replace(/<br\s*\/?\s*>/gi,'<br> '));let serial=0;
const id=key=>{const s=createHash('sha256').update('mayne-ct-studio-v1:'+key).digest('hex');return `${s.slice(0,8)}-${s.slice(8,12)}-4${s.slice(13,16)}-a${s.slice(17,20)}-${s.slice(20,32)}`;};
const all=(n,p)=>findAll(p,n.children||[]);const tag=(n,t)=>all(n,x=>x.name===t);const cls=(n,c)=>all(n,x=>(x.attribs?.class||'').split(/\s+/).includes(c));
const has=(n,c)=>(n.attribs?.class||'').split(/\s+/).includes(c);
const txt=n=>n?textContent(n).replace(/\s+/g,' ').trim():'';
const html=n=>n?getOuterHTML(n):'';
const escape=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function array(name){const start=source.indexOf('const '+name+'=')+('const '+name+'=').length;let end=start,depth=0,quote='',slash=false;for(;end<source.length;end++){const c=source[end];if(quote){if(slash)slash=false;else if(c==='\\')slash=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='[')depth++;if(c===']'&&!--depth)break;}return vm.runInNewContext(source.slice(start,end+1));}
const data=Object.fromEntries(['scenarios','qs','stageCopy','sortData','rq','toolData','toolSituations','matches','principles','fq'].map(n=>[n,array(n)]));
const course=newCourse('Critical Thinking: Foundations');course.id=id('course');course.description='A six-chapter guided course on disciplined reasoning, thinking traps, the eight-step process, tool selection, Project Relay, and personal transfer.';
course.cover='/assets/ct-hero.jpg';course.theme={preset:'executive-blue',accent:'#173B63',secondary:'#3377A7',highlight:'#D6AD60',background:'#DCEBF6',surface:'#FFFFFF',ink:'#17344B',muted:'#52697B',heading:'#173B63',callout:'#E7F1F8',font:'sans',coverStyle:'split'};
course.settings={navigation:'restricted',showProgress:true,requirePass:false,resume:true};course.lessons=['Foundations','Barriers to Clear Thinking','The Critical Thinking Process','Critical Thinking Toolkit','Application: Project Relay','Reflection and Transfer'].map((t,i)=>({...newLesson(t),id:id('lesson'+i)}));
let lesson=course.lessons[0];
function block(type,title='',props={}){const b={...newBlock(type),id:id('block'+serial++),title,...props};b.design={...b.design,useThemeSurface:true};lesson.blocks.push(b);return b;}
function item(title,text){return {id:id('item'+serial++),title,text,image:''};}
function gate(title='Continue'){block('continue',title,{gate:true});}
function mcq(title,options,correct,feedback='',body=''){return block('mcq',title,{body,required:true,completion:'attempt',options:options.map((text,i)=>({id:id('option'+serial++),text,correct:i===correct,feedback:i===correct?feedback:''})),feedbackCorrect:feedback||'Correct. Your choice is supported by the evidence.',feedbackIncorrect:'Review the explanation and compare each option with the evidence. '+feedback});}
function checks(name,title){const qs=data[name];block('quiz',title,{passScore:0,required:true,questions:qs.map(q=>{const b=mcq(q[0],q[1],q[2],`The strongest answer is: ${q[1][q[2]]}`);lesson.blocks.pop();return b;})});}
const dynamics={
 trapChallenge:()=>data.scenarios.forEach((s,i)=>mcq('Thinking trap '+(i+1),s.a,s.c,s.f,'<p>'+escape(s.t)+'</p>')),
 checkpoint:()=>checks('qs','Foundations Checkpoint'),
 processJourney:()=>block('process','The eight-step journey',{required:true,items:['DEFINE','UNDERSTAND','QUESTION','ANALYZE','EXPLORE','EVALUATE','DECIDE','REFLECT'].map((t,i)=>item(t,data.stageCopy[i]))}),
 understand:()=>block('sorting','Sort the evidence',{required:true,completion:'attempt',categories:['Fact','Inference','Unknown'],items:data.sortData.map(x=>({id:id('sort'+serial++),title:x[0],category:{fact:'Fact',inference:'Inference',unknown:'Unknown'}[x[1]]}))}),
 reasoningCheck:()=>checks('rq','Reasoning Check'),
 toolIntro:()=>block('tabs','When, why, and how to use each tool',{required:true,items:data.toolData.map(t=>item(t.name,`<p><strong>When:</strong> ${escape(t.use)}</p><p><strong>How it helps:</strong> ${escape(t.helps)}</p><p><strong>Watch for:</strong> ${escape(t.dont)}</p>`))}),
 toolFlipLab:()=>block('flashcards','Every tool has a useful side—and a misuse',{required:true,items:data.toolData.map(t=>({id:id('flip'+serial++),front:'<h3>'+escape(t.name)+'</h3><p>'+escape(t.use)+'</p>',back:'<h3>'+escape(t.name)+'</h3><p>'+escape(t.dont)+'</p>',image:''}))}),
 toolChallenge:()=>data.toolSituations.forEach(t=>mcq(t.title,t.answers,t.correct,t.feedback,'<p>'+escape(t.text)+'</p>')),
 toolCheckpoint:()=>block('matching','Match the reasoning need to the tool',{required:true,completion:'attempt',pairs:data.matches.map(m=>({id:id('pair'+serial++),left:m[0],right:m[1]})),feedbackCorrect:'Strong tool selection.',feedbackIncorrect:'Revisit the purpose of each tool—not just its name.'}),
 fivePrinciples:()=>block('flashcards','Five principles to carry forward',{required:true,items:data.principles.map(p=>({id:id('principle'+serial++),front:p[0],back:p[1],image:''}))}),
 finalCheck:()=>checks('fq','Final Knowledge Check')
};
const dynamicPlace={trapChallenge:'scenario',checkpoint:'checkpointQuestions',processJourney:'processTrack',understand:'sortItems',reasoningCheck:'reasonQuestions',toolIntro:'toolRailWrap',toolFlipLab:'toolFlipGrid',toolChallenge:'toolScenario',toolCheckpoint:'matchGrid',fivePrinciples:'principleRail',finalCheck:'finalQuestions'};
const omit=new Set(['heroArt','orbit','status','tick','num','stageNo','appNum','trapIcon','processExplain','sortBoard','toolDetail','principleDetail','recallAnswer','decisionSummary','completionRow','appFinishGrid','finalActions','transferSaved']);
const feedbackClasses=['feedback','stageFeedback','appFeedback','scenarioFeedback','toolFeedback','reasonResult','checkResult'];
let currentSection,dynamicDone=false;
function walk(n){
 if(n.type!=='tag')return;const a=n.attribs||{},classes=(a.class||'').split(/\s+/);
 if(classes.some(c=>omit.has(c))||['script','style','nav'].includes(n.name))return;
 const target=dynamicPlace[currentSection];if(target&&!dynamicDone&&(a.id===target||classes.includes(target))){dynamics[currentSection]();dynamicDone=true;return;}
 if(feedbackClasses.some(c=>has(n,c)))return;
 if(has(n,'gate')){gate();return;}
 if(has(n,'cards')||has(n,'notgrid')||has(n,'trapgrid')||has(n,'barrierRows')){const cards=all(n,x=>['card','flip','trap','barrierItem'].some(c=>has(x,c)));block('flashcards',has(n,'cards')?'Four habits':has(n,'notgrid')?'Critical thinking is not…':has(n,'trapgrid')?'Six thinking traps':'Environmental barriers',{required:true,items:cards.map(c=>({id:id('flash'+serial++),front:txt(tag(c,'h3')[0]||tag(c,'strong')[0]),back:txt(cls(c,'detail')[0]||tag(c,'p')[0]),image:''}))});return;}
 if(has(n,'answers')||a.id==='defineChoice'||has(n,'appChoices')){const options=tag(n,'button');const fb=all(currentSectionNode,x=>feedbackClasses.some(c=>has(x,c)))[0];const headings=tag(currentSectionNode,'h3');mcq(txt(headings.at(-1))||txt(tag(currentSectionNode,'h2')[0]),options.map(txt),options.findIndex(x=>x.attribs['data-correct']||x.attribs['data-best']),txt(fb));return;}
 if(has(n,'choices')){block('reflection','When are you most likely to stop examining your thinking?',{required:true,body:'<p>Choose the tendency you most want to watch for and explain why.</p><ul>'+tag(n,'button').map(b=>'<li>'+escape(txt(b))+'</li>').join('')+'</ul>'});return;}
 if(has(n,'ideaInputs')||has(n,'optionBuilder')){block('reflection',has(n,'ideaInputs')?'Generate three plausible explanations':'Create three distinct response options',{required:true,body:has(n,'ideaInputs')?'<p>Write three possible explanations for the increase in processing time. Delay commitment until you have considered alternatives.</p>':'<p>Write three distinct response options for Project Relay. Aim for different approaches, then explain how each addresses the evidence.</p>'});return;}
 if(has(n,'criteriaPool')||has(n,'criteriaChecks')){block('reflection','Choose three criteria before comparing options',{required:true,body:'<p>Choose exactly three criteria and explain why each matters.</p><ul>'+tag(n,'button').map(b=>'<li>'+escape(txt(b))+'</li>').join('')+'</ul>'});return;}
 if(a.id==='contradiction'||a.id==='caseEvidence'){block('accordion','Reveal new evidence',{required:true,items:[item('New evidence',html(n))]});if(a.id==='contradiction')block('survey','Reassess your confidence after reviewing the evidence',{required:true,scale:10,minLabel:'Low confidence',maxLabel:'High confidence',body:'<p>Adjust your confidence if the evidence changes what the conclusion deserves.</p>'});return;}
 if(n.name==='textarea'){const labels={assumption:'What assumption would you most want someone to challenge?',processReflection:'What reasoning habit will you carry into your next decision?',appDecision:'Your Project Relay recommendation',appTradeoff:'What tradeoff are you accepting?',appReflection:'What did this case reveal about your own reasoning?',warningSign:'My warning sign',resetQuestion:'My reset question'};block('reflection',labels[a.id]||a.placeholder,{required:true,body:'<p>'+escape(a.placeholder||'Capture your reasoning.')+'</p>'});return;}
 if(n.name==='input'){if(a.type==='range')block('survey','How confident are you in your current judgment?',{required:true,scale:10,minLabel:'Low confidence',maxLabel:'High confidence'});return;}
 if(n.name==='button'){if(has(n,'btn')&&!a.id?.startsWith('reveal')&&a.id!=='showOptions'&&a.id!=='buildDecision')gate();if(a.id==='showOptions'){gate('Compare the options');block('table','Compare options against your criteria',{rows:'Option | Your three selected criteria\nImprove the routing procedure | Assess evidence and tradeoffs\nAdd temporary staffing | Assess evidence and tradeoffs\nTargeted process coaching | Assess evidence and tradeoffs'});block('note','',{body:'<p>The criteria should exist before the options are compared. The dots in the original demonstration were illustrative; use evidence to justify your comparison.</p>'});}return;}
 if(n.name==='h1'||n.name==='h2'||n.name==='h3'){if(txt(n))block('heading',txt(n));return;}
 if(n.name==='p'||n.name==='ul'||n.name==='ol'){if(txt(n)){if(currentSection==='recall'&&txt(n).startsWith('You said'))block('text','',{body:'<p>Revisit the tendency you identified in Foundations. What should you watch for when pressure or confidence takes over?</p>'});else if(a.id!=='scenarioText'&&a.id!=='toolScenarioText'&&!has(n,'local-note')&&!txt(n).startsWith('Confidence:'))block('text','',{body:html(n)});}return;}
 if(has(n,'principle')||has(n,'formula')||has(n,'equation')||has(n,'evidenceStack')||has(n,'questionWall')){block('note','',{body:html(n)});return;}
 for(const child of n.children||[])walk(child);
}
let currentSectionNode;
for(const sec of tag(doc,'section')){currentSectionNode=sec;currentSection=sec.attribs.id;dynamicDone=false;const step=Number(sec.attribs['data-flow']);lesson=course.lessons[step<6?0:step<10?1:step<22?2:step<28?3:step<37?4:5];
 if(currentSection==='definitionIntro')block('image','Critical thinking',{image:'/assets/ct-definition.jpg',alt:'Visual illustration for examining thinking.'});
 if(currentSection==='foundationBanner')block('image','Foundations',{image:'/assets/ct-foundations-banner.jpg',alt:'Critical Thinking Foundations banner.'});
 walk(sec);
 if(dynamics[currentSection]&&!dynamicDone)dynamics[currentSection]();
}
// Native practice questions complete on engagement; graded checks have no passing threshold.
const normalized=normalizeCourse(course);const errors=validatePublish(normalized);if(errors.length)throw Error(errors.join('\n'));
fs.mkdirSync('courses',{recursive:true});fs.writeFileSync('courses/critical-thinking-foundations.lesson.json',JSON.stringify(normalized,null,2)+'\n');
console.log(JSON.stringify({id:course.id,lessons:course.lessons.length,blocks:course.lessons.reduce((n,l)=>n+l.blocks.length,0),types:[...new Set(course.lessons.flatMap(l=>l.blocks.map(b=>b.type)))]}));
