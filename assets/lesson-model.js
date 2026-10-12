export const uid=()=>crypto.randomUUID();
export const clone=v=>JSON.parse(JSON.stringify(v));
export const CATALOG=[
 ['heading','Heading','Text','H','Introduce a new idea with a clear heading.'],
 ['text','Paragraph','Text','¶','Rich text, links, and lists.'],
 ['columns','Two columns','Text','▥','Compare two ideas side by side.'],
 ['table','Table','Text','▦','Organize information in rows and columns.'],
 ['statement','Statement','Text','!','Make an important idea stand out.'],
 ['note','Note / callout','Text','i','Highlight guidance or a takeaway.'],
 ['quote','Quote','Text','❝','Feature a quotation and attribution.'],
 ['list','List / checklist','Text','☷','Bullets, numbered lists, or checkboxes.'],
 ['image','Image','Media','▧','Upload an image with a caption and alt text.'],
 ['imageText','Image and text','Media','◧','Combine an image with an explanation.'],
 ['gallery','Image gallery','Media','▦','An image grid or carousel.'],
 ['video','Video','Media','▶','Upload a video or embed YouTube / Vimeo.'],
 ['audio','Audio','Media','♫','Upload audio or record narration.'],
 ['attachment','Attachment','Media','↓','Add a downloadable resource.'],
 ['embed','Website / tool embed','Media','↗','Embed another website or one of your site tools.'],
 ['code','Code snippet','Media','<>','Display formatted source code.'],
 ['accordion','Accordion','Interactive','≡','Expandable panels with editable content.'],
 ['tabs','Tabs','Interactive','▱','Let learners explore related topics.'],
 ['flashcards','Flip cards','Interactive','◈','Cards with editable fronts, backs, and images.'],
 ['process','Process','Interactive','➜','Guide learners through ordered steps.'],
 ['timeline','Timeline','Interactive','⋮','Present events in a visual timeline.'],
 ['labeled','Labeled graphic','Interactive','⊕','Place interactive markers on your own image.'],
 ['scenario','Branching scenario','Interactive','◇','Write scenes, choices, feedback, and destinations.'],
 ['sorting','Sorting activity','Interactive','⇄','Sort cards into categories, with feedback.'],
 ['buttons','Buttons','Interactive','↗','Add links to resources and tools.'],
 ['custom','Custom interaction','Interactive','✧','Edit HTML, CSS, and JavaScript in a sandboxed block.'],
 ['mcq','Multiple choice','Assessment','✓','One correct answer with feedback.'],
 ['msq','Multiple response','Assessment','☑','Select every correct answer.'],
 ['fill','Fill in the blank','Assessment','_','Accept one or more text answers.'],
 ['matching','Matching','Assessment','⇌','Match prompts to answers.'],
 ['quiz','Graded quiz','Assessment','?','Build a question bank and set a passing score.'],
 ['reflection','Reflection','Assessment','✎','Invite a written response learners can download.'],
 ['survey','Rating / survey','Assessment','☆','A rating scale with a personal reflection.'],
 ['chart','Chart','Visual','▥','Bar, line, or pie charts from editable values.'],
 ['divider','Divider','Structure','—','Separate sections with a line or number.'],
 ['spacer','Spacer','Structure','↕','Add breathing room between blocks.'],
 ['continue','Continue gate','Structure','→','Require the interactions above before proceeding.']
].map(([type,label,category,icon,hint])=>({type,label,category,icon,hint}));
export const meta=t=>CATALOG.find(x=>x.type===t)||CATALOG[1];
export function newBlock(type){
 const b={id:uid(),type,title:meta(type).label,body:'',design:{background:'#ffffff',useThemeSurface:true,padding:36,width:'standard',align:'left'},required:false};
 const item=(title,text)=>({id:uid(),title,text,image:''});
 if(['accordion','tabs','process','timeline'].includes(type))b.items=[item('First idea','Add your explanation here.'),item('Second idea','Add another explanation.')];
 if(type==='flashcards')b.items=[{id:uid(),front:'Key concept',back:'Explain the concept here.',image:''},{id:uid(),front:'Put it into practice',back:'Describe an example here.',image:''}];
 if(type==='list'){b.items=[item('First point',''),item('Second point','')];b.variant='bullets';}
 if(type==='table')b.rows='Topic | Key idea\nFirst topic | Add your explanation\nSecond topic | Add your explanation';
 if(type==='columns'){b.left='<p>Add the first idea.</p>';b.right='<p>Add the second idea.</p>';}
 if(['text','statement','note','quote','imageText'].includes(type))b.body='<p>Write your content here.</p>';
 if(type==='quote')b.attribution='Author / source';
 if(['image','imageText','labeled'].includes(type)){b.image='';b.alt='';b.caption='';}
 if(type==='gallery'){b.items=[{id:uid(),image:'',caption:'',alt:''}];b.variant='grid';}
 if(['video','audio','embed','attachment'].includes(type)){b.url='';b.caption='';b.height=420;}
 if(type==='labeled')b.markers=[{id:uid(),x:30,y:40,title:'First marker',text:'Describe this part of the image.'}];
 if(type==='scenario')b.nodes=[{id:uid(),title:'Opening scene',text:'Set the scene. What decision does the learner face?',image:'',choices:[{id:uid(),label:'Explore the situation',feedback:'Consider the people, evidence, and consequences.',next:'end'},{id:uid(),label:'Act immediately',feedback:'What assumptions are you making?',next:'end'}]}];
 if(type==='sorting'){b.categories=['Helpful','Unhelpful'];b.items=[{id:uid(),title:'Ask for evidence',category:'Helpful'},{id:uid(),title:'Jump to conclusions',category:'Unhelpful'}];}
 if(type==='buttons')b.items=[{id:uid(),title:'Open resource',url:'https://www.mayneleadership.com/tools.html'}];
 if(['mcq','msq'].includes(type)){b.title='What would you do?';b.options=[{id:uid(),text:'Gather evidence',correct:true,feedback:'A useful first step.'},{id:uid(),text:'Assume you know the answer',correct:false,feedback:'Check your assumptions first.'}];b.feedbackCorrect='Well done. Use the feedback to reinforce the concept.';b.feedbackIncorrect='Review the explanation and try again.';b.required=true;}
 if(type==='fill'){b.title='Complete the statement.';b.answers='evidence|facts';b.feedbackCorrect='Correct.';b.feedbackIncorrect='Try again.';b.required=true;}
 if(type==='matching'){b.pairs=[{id:uid(),left:'Evidence',right:'Information supporting a claim'},{id:uid(),left:'Assumption',right:'An idea treated as true without verification'}];b.required=true;}
 if(type==='quiz'){b.questions=[newBlock('mcq'),newBlock('fill')];b.passScore=80;b.scorePolicy='best';b.randomize=false;b.maxAttempts=0;b.required=true;}
 if(type==='reflection')b.title='How will you use this in your work?';
 if(type==='survey'){b.title='How confident do you feel?';b.minLabel='Not confident';b.maxLabel='Very confident';b.scale=5;}
 if(type==='chart'){b.variant='bar';b.items=[{id:uid(),title:'Clarity',value:65},{id:uid(),title:'Trust',value:80},{id:uid(),title:'Alignment',value:55}];}
 if(type==='spacer')b.height=60;
 if(type==='divider')b.variant='line';
 if(type==='continue'){b.title='Continue';b.gate=true;}
 if(type==='code')b.code='// Add a code example here';
 if(type==='custom'){b.html='<div class="card"><h2>Your custom interaction</h2><p>Edit the HTML, CSS, and JavaScript fields to build your own block.</p><button onclick="this.textContent=\'You did it!\'">Try it</button></div>';b.css='body{font-family:system-ui;padding:24px;color:#163654}.card{padding:32px;background:#edf6ff;border-radius:16px}button{padding:12px 20px;background:#185d93;color:white;border:0;border-radius:8px}';b.js='';b.height=320;}
 return b;
}
export const newLesson=(title='New lesson')=>({id:uid(),title,description:'',blocks:[]});
export function newCourse(title='Untitled course'){
 return {schemaVersion:1,id:uid(),title,description:'',author:'Joshua Mayne',cover:'',theme:{accent:'#176599',background:'#ffffff',font:'sans',coverStyle:'split'},settings:{navigation:'free',showProgress:true,requirePass:true,resume:true},lessons:[newLesson('Your first lesson')]};
}
export function demoCourse(){
 const c=newCourse('Build your first leadership lesson');c.description='An editable sample showing how content, practice, and feedback fit together. Replace any block with your own ideas.';c.cover='/assets/ct-hero.jpg';
 const l=c.lessons[0];l.title='A better conversation';
 const t=newBlock('text');t.title='Start with curiosity';t.body='<p>A team member has missed two deadlines. Before choosing a response, separate what you observed from what you assumed.</p><p>This sample is yours to edit. Select a block, then change its fields in the content panel.</p>';
 const f=newBlock('flashcards');f.title='Observation or assumption?';f.items=[{id:uid(),front:'“The report arrived two days late.”',back:'Observation: a statement you can check against the record.',image:''},{id:uid(),front:'“They do not care about the work.”',back:'Assumption: an interpretation that still needs to be tested.',image:''}];f.required=true;
 const s=newBlock('scenario');s.title='Choose your opening';s.nodes[0].text='You meet with the team member. How do you begin?';s.nodes[0].choices=[{id:uid(),label:'“Help me understand what got in the way.”',feedback:'An open question gives you a chance to learn before deciding.',next:'end'},{id:uid(),label:'“Why do you keep letting the team down?”',feedback:'This frames an interpretation as a fact. Try opening with the observed behavior.',next:'end'}];s.required=true;
 const q=newBlock('mcq');q.title='Which statement is an observation?';q.options[0].text='The report arrived two days late.';q.options[1].text='The person does not care.';
 const g=newBlock('continue');g.title='Continue to your action plan';
 const r=newBlock('reflection');r.title='Write one question you will ask before making an assumption.';
 l.blocks=[t,f,s,q,g,r];
 const last=newLesson('Put it into practice');const a=newBlock('accordion');a.title='A three-step habit';a.items=[{id:uid(),title:'Notice',text:'Name what you actually observed.',image:''},{id:uid(),title:'Ask',text:'Use an open question to understand the context.',image:''},{id:uid(),title:'Agree',text:'Clarify the next step and how you will follow up.',image:''}];last.blocks=[a,newBlock('reflection')];c.lessons.push(last);return c;
}
export function normalizeCourse(data){
 if(!data||data.schemaVersion!==1||!Array.isArray(data.lessons)||!data.lessons.length||data.lessons.length>100)throw Error('Choose a Lesson Studio JSON backup with at least one lesson.');
 if(JSON.stringify(data).length>3500000)throw Error('This course exceeds the content limit. Store large media using the upload controls.');
 const known=new Set(CATALOG.map(x=>x.type));const ids=new Set();
 const fixId=o=>{if(typeof o.id!=='string'||ids.has(o.id)||!/^[a-f0-9-]{36}$/i.test(o.id))o.id=uid();ids.add(o.id);};
 const d=clone(data);fixId(d);d.theme={...newCourse().theme,...d.theme};d.settings={...newCourse().settings,...d.settings};
 for(const l of d.lessons){fixId(l);if(!Array.isArray(l.blocks)||l.blocks.length>500)throw Error('Invalid lesson blocks.');for(const b of l.blocks){if(!known.has(b.type))throw Error('Unsupported block: '+b.type);fixId(b);const legacyMode=b.design?.useThemeSurface;b.design={...newBlock(b.type).design,...b.design};if(legacyMode===undefined)b.design.useThemeSurface=(String(b.design.background||'').toLowerCase()==='#ffffff');if(b.type==='scenario'&&(!Array.isArray(b.nodes)||!b.nodes.length))throw Error('A scenario needs at least one scene.');}}
 return d;
}
export function validatePublish(c){
 const errors=[];if(!c.title.trim())errors.push('Add a course title.');
 for(const l of c.lessons){if(!l.title.trim())errors.push('Add a lesson title.');if(!l.blocks.length)errors.push(l.title+': add at least one block.');
 for(const b of l.blocks){const prefix=l.title+' / '+(b.title||meta(b.type).label)+': ';
 if(['mcq','msq'].includes(b.type)&&(!b.options?.length||!b.options.some(o=>o.correct)))errors.push(prefix+'choose a correct answer.');
 if(b.type==='mcq'&&b.options?.filter(o=>o.correct).length!==1)errors.push(prefix+'choose exactly one correct answer.');
 if(b.type==='fill'&&!b.answers?.trim())errors.push(prefix+'add an accepted answer.');
 if(b.type==='quiz'){if(!b.questions?.length)errors.push(prefix+'add a question.');for(const q of b.questions||[]){if(['mcq','msq'].includes(q.type)&&!q.options?.some(o=>o.correct))errors.push(prefix+'a question needs a correct answer.');if(q.type==='fill'&&!q.answers?.trim())errors.push(prefix+'a question needs an accepted answer.');}}
 if(['image','imageText','labeled'].includes(b.type)&&!b.image)errors.push(prefix+'add an image.');
 if(['video','audio','attachment','embed'].includes(b.type)&&!b.url)errors.push(prefix+'add a file or link.');
 if(b.type==='scenario'){const ids=new Set(b.nodes.map(n=>n.id));for(const n of b.nodes)for(const choice of n.choices||[])if(choice.next!=='end'&&!ids.has(choice.next))errors.push(prefix+'a choice points to a missing scene.');}
 if(b.type==='sorting')for(const item of b.items)if(!b.categories.includes(item.category))errors.push(prefix+'assign every item to a category.');
 }}return [...new Set(errors)];
}
