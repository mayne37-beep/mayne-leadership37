// Native Lesson Studio conversions. Original HTML stays available.
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {parseDocument} from 'htmlparser2';
import {findAll,textContent,getOuterHTML} from 'domutils';
import {newCourse,newLesson,newBlock,normalizeCourse,validatePublish} from '../assets/lesson-model.js';
const specs=[
 ['creative-thinking-foundations','Creative Thinking',[0,2,4,6,8,11,14,16,20,23,24],['Introduction and Impossible Redesign','Foundations and Assumptions','Explore','Reframe','Diverge','Connect and SCAMPER','Develop','Converge and Idea Tournament','Test','Full-Process Capstone','Reflection and Transfer']],
 ['systems-thinking-foundations','Systems Thinking: Foundations',[0,2,5,9,14,20,28,38],['The Productivity Mystery','Parts, Connections, Purpose, and Boundary','Inputs, Outputs, Stocks, and Flows','Events, Patterns, Structures, and Mental Models','Feedback, Polarity, and Delays','Archetypes and Leverage','Application: Build the System Story','Reflection and Transfer']],
 ['strategic-thinking-foundations','Strategic Thinking',[0,2,5,9,13,16,18],['Introduction and Opening Challenge','Expand the Frame','Strategic Habits and Competencies','Test the Story','Connect Today to Tomorrow','Think Beyond Your Lane','Reflection and Transfer']],
 ['strategic-leadership','Strategic Leadership',[0,2,7,8,9,10,11,12,13,18,19,21],['Introduction','Leadership at Scale','Mental Agility','Vision and Intent','Decision Shaping','Strategic Teams','Strategic Communication','Ethical Ambition','Hero to Architect: Influence and Application','Strategic Alignment Dashboard','Modernization Capstone and Brief','Reflection and Transfer']],
 ['metacognition','Metacognition',[0,2,7,14,19,22,24],['Introduction','Notice Your Thinking','Invite Dissent and Guide the Group','Application: Bike Trail Conflict','See the System','Portable Toolkit and Synthesis','Reflection and Transfer']],
 ['leading-like-lasso','Leading Like Lasso',[],[]]
];
export const stableID=key=>{const s=createHash('sha256').update('mayne-studio-conversion-v1:'+key).digest('hex');return `${s.slice(0,8)}-${s.slice(8,12)}-4${s.slice(13,16)}-a${s.slice(17,20)}-${s.slice(20,32)}`;};
const ids=Object.fromEntries(specs.map(s=>[s[0]+'.html',stableID(s[0])]));ids['critical-thinking-foundations.html']='3444cca8-d0d1-42e9-a30a-5857adafa036';
const all=(n,p)=>findAll(p,n.children||[]);const tag=(n,t)=>all(n,x=>x.name===t);
const txt=n=>n?textContent(n).replace(/\s+/g,' ').trim():'';
const has=(n,c)=>(n.attribs?.class||'').split(/\s+/).includes(c);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const p=s=>'<p>'+esc(s)+'</p>';
const rich=n=>getOuterHTML(n).replace(/href="([^"?#]+\.html)"/g,(m,url)=>ids[url.replace(/^\//,'')]?`href="/lesson-player.html?course=${ids[url.replace(/^\//,'')]}"`:m);
function literal(source,name){const re=new RegExp('(?:const|let)\\s+'+name+'\\s*=\\s*');const m=re.exec(source);if(!m)throw Error('Missing data: '+name);let start=m.index+m[0].length,end=start,quote='',escaped=false,stack=[];if(!['[','{'].includes(source[start]))throw Error('Not literal: '+name);for(;end<source.length;end++){const c=source[end];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';continue;}if(['"',"'",'`'].includes(c)){quote=c;continue;}if(c==='['||c==='{')stack.push(c);if(c===']'||c==='}'){stack.pop();if(!stack.length)break;}}return vm.runInNewContext('('+source.slice(start,end+1)+')',{},{timeout:100});}
const reports=[];
for(const [slug,title,bounds,names] of specs){
 const source=fs.readFileSync(slug+'.html','utf8');const doc=parseDocument(source.replace(/<br\s*\/?\s*>/gi,'<br> '));const main=tag(doc,'main')[0]||doc;let serial=0,lesson,currentSection;const doneFields=new Set(),doneDynamic=new Set(),adaptations=[];
 const uid=key=>stableID(slug+':'+key);const course=newCourse(title);course.id=ids[slug+'.html'];course.description='Editable version of the complete Mayne Leadership '+title+' course, including its original explanations, practice activities, application, and reflection prompts.';
 const cover=source.match(/url\(["']?([^)'"\s]+\.(?:jpg|png|webp))["']?\)/i)?.[1];if(cover&&!cover.startsWith('http'))course.cover='/'+cover.replace(/^\//,'');
 course.settings={navigation:slug==='leading-like-lasso'?'free':'restricted',showProgress:true,requirePass:false,resume:true};course.theme={preset:'executive-blue',accent:'#173B63',secondary:'#3377A7',highlight:'#D6AD60',background:'#DCEBF6',surface:'#FFFFFF',ink:'#17344B',muted:'#52697B',heading:'#173B63',callout:'#E7F1F8',font:'sans',coverStyle:'split'};
 course.lessons=names.map((name,i)=>({...newLesson(name),id:uid('lesson'+i)}));
 function add(type,title='',props={}){const b={...newBlock(type),id:uid('block'+serial++),title,...props};b.design={...b.design,useThemeSurface:true};lesson.blocks.push(b);return b;}
 function item(title,text){return {id:uid('item'+serial++),title,text,image:''};}
 function reflection(title,body='',required=true){return add('reflection',title,{body,required});}
 function gate(title='Continue'){if(lesson.blocks.at(-1)?.type!=='continue')add('continue',title,{gate:true});}
 function cards(name,rows,type='tabs'){return add(type,name,{required:true,items:rows.map(r=>{const title=typeof r==='string'?r:Array.isArray(r)?r[0]:r.name;const body=typeof r==='string'?'Consider how this applies to your work.':Array.isArray(r)?r.slice(1).join(' — '):r.detail;return type==='flashcards'?{id:uid('card'+serial++),front:title,back:body,image:''}:item(title,p(body));})});}
 function selection(title,rows,instruction='Choose the option or options that best fit your situation and explain your reasoning.'){reflection(title,p(instruction)+'<ul>'+rows.map(r=>'<li>'+esc(Array.isArray(r)?r.join(' — '):r)+'</li>').join('')+'</ul>');}
 function question(title,options,correct,body='',feedback=''){return add('mcq',title,{required:true,completion:'attempt',body,options:options.map((text,i)=>({id:uid('answer'+serial++),text,correct:i===correct,feedback:''})),feedbackCorrect:feedback||'Strong choice. '+options[correct],feedbackIncorrect:(feedback?feedback+' ':'')+'The strongest answer is: '+options[correct]});}
 function quiz(title,rows){const questions=rows.map(q=>{const b=question(q[0],q[1],q[2]);lesson.blocks.pop();return b;});add('quiz',title,{questions,required:true,passScore:0});}
 function sorting(title,rows){add('sorting',title,{required:true,completion:'attempt',categories:[...new Set(rows.map(r=>r[1]))],items:rows.map(r=>({id:uid('sort'+serial++),title:r[0],category:r[1]}))});}
 const data=name=>literal(source,name);const dynamic={};
 const bindCards=(container,name,title,type='tabs')=>dynamic[container]=()=>cards(title,data(name),type);
 const bindSelection=(container,name,title,instruction)=>dynamic[container]=()=>selection(title,data(name),instruction);
 if(slug==='creative-thinking-foundations'){
  dynamic.questionInputs=()=>{for(let i=1;i<=5;i++)reflection('Explore: Question '+i,p('Write a question, not a solution.'));};
  dynamic.reframeInputs=()=>{for(let i=1;i<=5;i++)reflection('Reframe '+i,p('How might we…? Create a meaningfully different problem frame.'));};
  dynamic.divergeInputs=()=>{for(let i=1;i<=20;i++)reflection('Diverge: Idea '+i,p('Generate another possibility before judging the ideas.'));};
  bindCards('lensGrid','lensData','Borrow a principle from another environment');
  dynamic.scamperGrid=()=>data('scamperData').forEach(r=>reflection(r[0]+' · '+r[1],p(r[2])));
  bindSelection('criteriaPool','criteriaData','Choose five criteria before narrowing ideas','Choose five criteria, explain their importance, and carry them into the tournament.');
  for(const [key,count,body] of [['round10Grid',10,'Review your 20 ideas. List the 10 you want to carry forward.'],['round6Grid',6,'From your 10 selected ideas, choose six and record why they survived.'],['tournamentGrid',3,'Choose three finalists using your criteria.'],['winnerGrid',1,'Choose the concept with the strongest potential against your criteria.']])dynamic[key]=()=>reflection('Tournament: Select '+count, p(body));
  adaptations.push('Idea tournament selections are recorded in native reflection blocks; learners refer to their earlier idea notes.');
 }
 if(slug==='systems-thinking-foundations'){
  bindCards('systemRail','systemData','Parts, connections, and purpose');
  for(const [key,name] of [['boundaryGrid','boundaryItems'],['appBoundaryChoices','appBoundaryItems']])dynamic[key]=()=>add('msq','Set a useful system boundary',{required:true,completion:'attempt',body:p('Include variables that can materially influence the outcome; exclude noise.'),options:data(name).map(r=>({id:uid('boundary'+serial++),text:r[0],correct:!!r[1],feedback:r[1]?'This can materially affect the work-processing system.':'This is outside the initial analytical boundary.'})),feedbackCorrect:'Strong boundary.',feedbackIncorrect:'Review which variables can materially affect the outcome.'});
  for(let i=1;i<=5;i++)dynamic['quiz'+i]=()=>quiz('Checkpoint '+i,data('quizzes')['q'+i]);
  bindCards('iopoLine','iopoData','Input → Process → Output → Outcome','process');
  bindCards('reworkFlips','reworkData','Rework and hidden inflow','flashcards');
  bindCards('icebergLayers','iceData','The iceberg model','process');
  dynamic.iceSortGrid=()=>sorting('Classify the evidence',data('iceSortData'));
  dynamic.polarityRows=()=>add('matching','Match each relationship to its polarity',{required:true,completion:'attempt',pairs:data('polarityData').map(r=>({id:uid('pair'+serial++),left:r[0]+' → '+r[1],right:r[2]})),feedbackCorrect:'Same direction is +; opposite direction is −.',feedbackIncorrect:'Polarity describes direction, not good or bad.'});
  dynamic.delayTimeline=()=>cards('Hiring takes time to produce capacity',data('delayData'),'timeline');
  dynamic.indicatorGrid=()=>sorting('Leading or lagging indicator?',data('indData'));
  bindCards('archetypeRail','archData','Recurring system archetypes');
  bindCards('mentalFlipGrid','mentalData','Mental models and their effects','flashcards');
  bindSelection('leverageGrid','leverageItems','Choose two interventions with structural leverage','Choose two interventions, explain their leverage, and identify any tradeoff.');
  adaptations.push('Backlog manipulation becomes a guided calculation activity; animated feedback chains become native process blocks.');
 }
 if(slug==='strategic-thinking-foundations'){
  for(const [key,name,title,type] of [['levelTrack','levels','Levels of thinking','process'],['mindGrid','minds','Four strategic habits','tabs'],['compGrid','comps','Six strategic-thinking competencies','tabs'],['biasGrid','biases','Recognize cognitive biases','flashcards'],['fallacyGrid','fallacies','Recognize logical fallacies','flashcards']])bindCards(key,name,title,type);
  bindSelection('enablerGrid','enablers','Three habits to strengthen','Choose three enablers you most need to strengthen and explain how you will practice them.');
  dynamic.scaleGrid=()=>data('diagItems').forEach(q=>add('survey',q,{required:true,scale:5,minLabel:'Rarely',maxLabel:'Consistently'}));
  bindSelection('blockGrid','blockers','Two strategic-thinking barriers','Choose two barriers most relevant to your work and explain what you will do about them.');
  dynamic.ladderGrid=()=>{const r=data('rungs');cards('Ladder of inference',r,'process');question('Where does interpretation begin?',r,2,'','Meaning is where interpretation begins to enter. Make the move from data to interpretation visible enough to test.');};
 }
 if(slug==='strategic-leadership'){
  for(const [key,name,title,type] of [['levelGrid','levelData','Leadership levels','process'],['ecqGrid','ecqs','Executive Core Qualifications','tabs'],['metaGrid','metaData','Six strategic-leader behaviors','tabs']])bindCards(key,name,title,type);
  bindSelection('shiftChoices','shifts','Your most difficult leadership transition','Select the transition you find most difficult.');
  bindSelection('requestType','requestTypes','What are you asking leadership for?','Choose the type of request you are preparing.');
  bindSelection('teamChecks','teamData','Two strategic-team conditions','Identify at least two conditions that most need attention.');
  bindSelection('failGrid','failData','Two strategic leadership failure risks','Choose two failure patterns most relevant to your situation.');
 }
 if(slug==='metacognition'){
  bindCards('loopGrid','loopData','Notice → Name → Navigate','process');
  bindSelection('factorGrid','factorData','Two influences suppressing dissent','Choose two influences relevant to your team.');
  bindCards('moveGrid','moveData','Make candor safer','tabs');
  bindSelection('gradGrid','gradData','Your gradient of agreement','Choose a position from 1 to 8. The rating opens conversation; it does not replace it.');
  bindSelection('voteOptions','voteData','Prioritize two options','Choose two options for deeper analysis. Voting does not establish truth.');
  bindCards('perspectiveGrid','perspectiveData','Preserve different stakeholder frames','tabs');
  bindSelection('criteriaPool','criteriaData','Criteria for the trail case','Select at least three criteria and explain their importance.');
  dynamic.caseVoteOptions=()=>reflection('Pre-commit to two response options',p('Refer to the four options you generated. Record your two leading options before hearing other views.'));
  bindCards('lensGrid','lensData','A systems lens','process');
  adaptations.push('Dot voting, gradients, criteria selection, and confidence percentages become native written or rating activities.');
 }
 const formTitle=n=>{let at=n;for(let depth=0;depth<3&&at?.parent;depth++,at=at.parent){const siblings=at.parent.children||[],i=siblings.indexOf(at);const before=siblings.slice(0,i).filter(x=>x.type==='tag');const label=before.filter(x=>['label','h3','h4','strong'].includes(x.name)).at(-1);if(label&&txt(label))return txt(label);}return n.attribs.placeholder||n.attribs.id||'Your reflection';};
 const ignored=new Set(['resume','systemDetail','iopoDetail','transferBox','scamperCount','questionCount','reframeCount','ideaCount','initialRecall','confValue','stockValue','inflowValue','outflowValue','levelFeedback','levelsFeedback']);
 const skipClasses=['num','number','appNo','status','badges','nav','rail','miniRail','step','ticker'];
 function walk(n){if(n.type!=='tag')return;const a=n.attribs||{};
  if(['nav','header','footer','script','style'].includes(n.name)||skipClasses.some(c=>has(n,c))||has(n,'kicker')||has(n,'eyebrow')||ignored.has(a.id))return;
  if(dynamic[a.id]){dynamic[a.id]();doneDynamic.add(a.id);return;}
  if(n.name==='div'&&/(?:Detail|Count|Result|Summary)$/.test(a.id||'')&&!txt(n))return;
  if(has(n,'gate')){const buttons=tag(n,'button');if(buttons.some(b=>/(continue|begin|finish|complete|unlock)/i.test(b.attribs.id||'')))gate('Continue');return;}
  if(n.name==='label'&&all(n.parent,x=>['input','select','textarea'].includes(x.name)).length)return;
  if(n.name==='button'){if(/^(begin|finish|roadmapContinue|.*Continue)$/.test(a.id||''))gate();return;}
  if(n.name==='textarea'||n.name==='select'||n.name==='input'){
   if(a.type==='hidden'||a.type==='file'||a.type==='checkbox')return;doneFields.add(a.id);
   if(a.type==='range'){reflection('Calibrate your confidence',p('Record your confidence as a percentage from '+a.min+' to '+a.max+' before revealing the answer.'));return;}
   const opts=n.name==='select'?tag(n,'option').map(txt).filter(v=>v&&!/choose|classify/i.test(v)):[];
   const body=(a.placeholder?p(a.placeholder):'')+(opts.length?'<ul>'+opts.map(o=>'<li>'+esc(o)+'</li>').join('')+'</ul>':'');
   const optional=slug==='creative-thinking-foundations'&&data('optionalIds').includes(a.id);reflection(formTitle(n),body,!optional);return;
  }
  if(a['data-rate']){add('survey',formTitle(n),{required:true,scale:5,minLabel:'Low influence',maxLabel:'High influence'});return;}
  if(slug==='systems-thinking-foundations'&&has(n,'stockLab')){add('table','Starting stock and flows',{rows:'Variable | Value\nBacklog | 100\nInflow (new work + rework) | 25\nOutflow (completed work) | 18'});reflection('Run the backlog calculation',p('Start with backlog 100. Add 10 incoming items, complete 10, then add 5 rework items. Record backlog after each change. Which changes increase demand?'));add('accordion','Check your calculation',{items:[item('Worked example',p('100 + 10 = 110; 110 − 10 = 100; 100 + 5 = 105. Backlog can grow even while output improves when total inflow exceeds outflow.'))]});return;}
  if(has(n,'simButtons'))return;
  if(a.id==='answerReveal'){gate('Reveal the answer');add('accordion','Check your calibration',{required:true,items:[item('Answer and debrief',rich(n))]});return;}
  if(slug==='strategic-thinking-foundations'&&/^f[1-4]$/.test(a.id||'')){add('accordion','Additional evidence',{required:true,items:[item('Reveal information '+a.id.slice(1),rich(n))]});return;}
  if(has(n,'loopCards')){cards('Explore each concept',tag(n,'h3').map(h=>[txt(h),txt(tag(h.parent,'p')[0])]),'flashcards');return;}
  const buttons=tag(n,'button');if(buttons.length&&buttons.every(b=>!has(b,'btn'))&&['div'].includes(n.name)&&(n.children||[]).filter(c=>c.type==='tag').every(c=>c.name==='button')&&buttons.every(b=>['answer','choice','appChoice','option','miniChoice','choiceBtn','toggleBtn'].some(c=>has(b,c)))){
   const correct=buttons.findIndex(b=>b.attribs['data-best']||b.attribs['data-correct']);const feedback=all(currentSection,x=>has(x,'feedback')).map(txt).filter(Boolean).join(' ');
   const headings=tag(currentSection,'h3');const title=txt(headings.at(-1))||txt(tag(currentSection,'h2')[0]);
   if(correct>=0)question(title,buttons.map(txt),correct,'',feedback);else selection(title,buttons.map(txt));return;
  }
  if(n.name==='img'){const src=a.src;if(src)add('image',a.alt||'',{image:src.startsWith('http')?src:'/'+src.replace(/^\//,''),alt:a.alt||''});return;}
  if(n.name==='iframe'||n.name==='video'){const url=a.src||tag(n,'source')[0]?.attribs.src;if(url)add('video',a.title||'Course video',{url,caption:'Imported from the original course. External video requires internet access.'});return;}
  if(n.name==='svg'){add('custom',a['aria-label']||'Course diagram',{html:rich(n),css:'body{margin:0;padding:16px;font-family:system-ui;background:#fff;color:#17344B}svg{width:100%;height:auto;max-height:380px}',js:'',height:380,required:false});adaptations.push('Original vector diagram retained in an editable custom HTML block.');return;}
  if(n.name==='table'){const rows=tag(n,'tr').map(r=>all(r,x=>x.name==='th'||x.name==='td').map(txt).join(' | '));add('table','',{rows:rows.join('\n')});return;}
  if(['h1','h2','h3','h4'].includes(n.name)){if(txt(n))add('heading',txt(n));return;}
  if(['p','ul','ol','blockquote'].includes(n.name)){if(txt(n))add(n.name==='blockquote'?'quote':'text','',{body:rich(n),attribution:''});return;}
  if(n.name==='details'){if(tag(n,'textarea').length||tag(n,'input').length||tag(n,'select').length){for(const c of n.children||[])walk(c);}else add('accordion',txt(tag(n,'summary')[0])||'Explore',{items:[item(txt(tag(n,'summary')[0])||'Read more',rich(n))]});return;}
  if(has(n,'chain')||has(n,'cascade')||has(n,'flowLine')||has(n,'modelFlow')){const nodes=all(n,x=>has(x,'chainNode')||has(x,'cnode')||has(x,'flowNode')||x.name==='span'&&!has(x,'arr')&&!has(x,'chainArrow'));if(nodes.length)add('process','Follow the sequence',{required:true,items:nodes.map((x,i)=>item(txt(x),p('Consider how this change affects the next step in the sequence.')))});else if(txt(n))add('note','',{body:p(txt(n))});return;}
  if(has(n,'principle')||has(n,'sources')||has(n,'systemEquation')||has(n,'metricRow')||has(n,'caseFacts')||has(n,'equation')){if(txt(n))add('note','',{body:rich(n)});return;}
  const meaningfulChildren=(n.children||[]).filter(x=>x.type==='tag');
  if(!meaningfulChildren.length&&txt(n)){add('text','',{body:p(txt(n))});return;}
  if(meaningfulChildren.every(x=>['strong','b','em','i','span','br','a','small'].includes(x.name))&&txt(n)){if(!has(n,'kicker')&&!has(n,'eyebrow'))add('note','',{body:rich(n)});return;}
  for(const c of n.children||[])walk(c);
 }
 if(slug==='leading-like-lasso'){
  const rows=JSON.parse(txt(all(doc,n=>n.name==='script'&&n.attribs?.id==='course-data')[0]));const config=JSON.parse(txt(all(doc,n=>n.name==='script'&&n.attribs?.id==='clip-config')[0]));
  for(const r of rows){lesson={...newLesson(r.title),id:uid('lasso-lesson'+r.id),description:r.competency};course.lessons.push(lesson);
   add('heading','Watch: '+r.scene);add('note','Episode and scene cue',{body:p(`Season ${r.episode.season} · Episode ${r.episode.number} · ${r.episode.title}`)+p(r.cue)});add('text','Before you watch',{body:p(r.watch)});
   const clips=config.lessons[r.id]||[];for(const clip of clips){const url=new URL(clip.url);if(clip.start)url.searchParams.set('t',String(clip.start));if(clip.end!=null)url.searchParams.set('end',String(clip.end));add('video',clip.label,{url:url.href,caption:[clip.kind,clip.note,`Start: ${clip.start||0}s${clip.end!=null?' · Pause at '+clip.end+'s':''}`].filter(Boolean).join(' · ')});}
   if(!clips.length)add('note','Video slot',{body:p(config.selection?.missing?.[r.id]||'Add an appropriate scene video using the studio’s Video block. The lesson remains available without a clip.')});
   if(clips.length&&clips.every(c=>c.kind==='companion'))add('note','Companion clip',{body:p('The selected clip is a related scene. The exact moment described in this lesson is still needed.')});
   add('text','Understand the scene',{body:p(r.summary)});add('list','What to observe',{items:r.behaviors.map(b=>item(b,'')),variant:'bullets'});add('text','Why this represents leadership',{body:p(r.why)});add('text','Apply it at work',{body:p(r.application)});add('list','Actions to practice',{items:r.actions.map(b=>item(b,'')),variant:'numbered'});add('quote','',{body:p(r.say),attribution:'A practical phrase to try'});add('note','Use judgment',{body:p(r.judgment)});add('text','What improvement might look like',{body:p(r.result)});
   for(const q of r.questions)reflection(q,p('Connect this scene to your own experience.'));reflection('One action I will take',p('What will you do, with whom, and by when?'));reflection('How I will check its effect',p('What change will you observe, and when will you review it?'));
   add('buttons','Episode references',{items:[...r.sources,{label:'Apple TV episode guide',url:'https://www.apple.com/tv-pr/originals/ted-lasso/episodes-images/'}].map(s=>({id:uid('source'+serial++),title:s.label,url:s.url}))});
  }
  adaptations.push('All 30 scene lessons and embedded clip selections preserved; existing missing and companion-clip notices retained.');
 }else{
  for(const sec of tag(main,'section')){if(!sec.attribs?.['data-flow'])continue;currentSection=sec;const step=Number(sec.attribs['data-flow']);let index=0;bounds.forEach((b,i)=>{if(step>=b)index=i;});lesson=course.lessons[index];walk(sec);}
  const fields=all(main,x=>['textarea','input','select'].includes(x.name)&&x.attribs.id&&x.attribs.type!=='hidden'&&x.attribs.type!=='file'&&x.attribs.type!=='checkbox');const missed=fields.filter(x=>!doneFields.has(x.attribs.id));if(missed.length)throw Error(slug+' missed fields: '+missed.map(x=>x.attribs.id));
  const missing=Object.keys(dynamic).filter(k=>!doneDynamic.has(k));if(missing.length)throw Error(slug+' missed generated content: '+missing.join(','));
 }
 const c=normalizeCourse(course);const errors=validatePublish(c);if(errors.length)throw Error(slug+': '+errors.join('\n'));fs.mkdirSync('courses',{recursive:true});fs.writeFileSync('courses/'+slug+'.lesson.json',JSON.stringify(c,null,2)+'\n');
 reports.push({slug,id:c.id,title:c.title,lessons:c.lessons.length,blocks:c.lessons.reduce((n,l)=>n+l.blocks.length,0),convertedStaticFields:doneFields.size,generatedContainers:doneDynamic.size,adaptations:[...new Set(adaptations)],source:slug+'.html',status:'draft'});
}
fs.writeFileSync('courses/site-conversion-report.json',JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports,null,2));
