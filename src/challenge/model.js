export const AUTH_URL='https://vteamreihsunsllwcphw.supabase.co';
export const AUTH_KEY='sb_publishable_dFlcGsz0Fu1TifebqIu4fQ_6aLjG7ud';
export const LIVE_URL='https://vteamreihsunsllwcphw.supabase.co';
export const LIVE_KEY='sb_publishable_dFlcGsz0Fu1TifebqIu4fQ_6aLjG7ud';
export const TYPES={choice:'Multiple choice',truefalse:'True or false',text:'Type the answer',order:'Puzzle / correct order',image:'Image answers',poll:'Poll',cloud:'Word cloud',open:'Open response',rank:'Ranking',scale:'Scale / slider',pin:'Pin on image',number:'Numerical answer',info:'Information slide'};
export const MODES={classic:'Classic',team:'Team',accuracy:'Accuracy',challenge:'Self-paced challenge',practice:'Practice',discussion:'Discussion'};
export const DEFAULTS={mode:'classic',speed:true,streak:true,leaderboard:true,reveal:true,explanations:true,studentQuestions:true,anonymous:false,lateJoin:true,shuffleQuestions:false,shuffleAnswers:false,autoProgress:false,music:false,sound:false,animations:true,reducedMotion:false,teams:4,teamAssignment:'auto',teamScoring:'average',tieRule:'shared',retentionDays:90,questionTime:30,nicknamePrompt:'First name or nickname',nicknameMin:2,nicknameMax:40,fullName:false};
export const id=()=>crypto.randomUUID();
export function newQuestion(type='choice'){
 const choices=(type==='truefalse'?['True','False']:['Answer A','Answer B','Answer C','Answer D']).map(label=>({id:id(),label,image:''}));
 return {id:id(),type,text:'',choices,correct:type==='truefalse'?[choices[0].id]:[],acceptable:[],caseSensitive:false,manualReview:false,partialCredit:false,timer:30,points:['poll','cloud','open','rank','scale','info'].includes(type)?0:1000,explanation:'',media:'',mediaType:'image',alt:'',video:'',body:'',min:1,max:5,step:1,lowLabel:'Strongly disagree',highLabel:'Strongly agree',number:0,tolerance:0,target:{x:.5,y:.5,radius:.12},tags:[]};
}
export function newGame(){return {id:id(),title:'Untitled game',description:'',cover:'',folder:'Leadership',tags:[],questions:[],settings:{...DEFAULTS}};}
export function validateGame(g,publish=false){
 const errors=[];if(!g||typeof g!=='object')return ['A game must be an object.'];
 if(typeof g.title!=='string'||!g.title.trim()||g.title.length>200)errors.push('Enter a game title (1–200 characters).');
 if(!Array.isArray(g.questions))return [...errors,'Questions must be a list.'];
 if(publish&&g.questions.length===0)errors.push('Add at least one question before publishing.');
 const ids=new Set();g.questions.forEach((q,i)=>{
 const prefix='Question '+(i+1)+': ';if(!q||!TYPES[q.type]){errors.push(prefix+'unsupported question type.');return;}
 if(!/^[0-9a-f-]{36}$/i.test(q.id)||ids.has(q.id))errors.push(prefix+'missing or duplicate identifier.');ids.add(q.id);
 if(!Number.isFinite(Number(q.timer))||Number(q.timer)<0||Number(q.timer)>86400)errors.push(prefix+'timer must be 0–86,400 seconds (0 = untimed).');
 if(!Number.isFinite(Number(q.points))||Number(q.points)<0||Number(q.points)>1000000)errors.push(prefix+'points must be between 0 and 1,000,000.');
 if(publish&&(!q.text?.trim()||q.text.length>5000))errors.push(prefix+'enter question text (up to 5,000 characters).');
 if(['choice','truefalse','image','poll','order','rank'].includes(q.type)){
 const min=2,max=['choice','image'].includes(q.type)?6:12;
 if(!Array.isArray(q.choices)||q.choices.length<min||q.choices.length>max||q.type==='truefalse'&&q.choices.length!==2)errors.push(prefix+'requires '+min+'–'+max+' choices.');
 else{const cids=q.choices.map(c=>c.id);if(new Set(cids).size!==cids.length)errors.push(prefix+'choice identifiers must be unique.');
 if(publish&&q.choices.some(c=>!c.label?.trim()))errors.push(prefix+'every choice needs a label, including image answers.');
 if(publish&&['choice','truefalse','image','order'].includes(q.type)){
 if(!Array.isArray(q.correct)||!q.correct.length||q.correct.some(x=>!cids.includes(x))||new Set(q.correct).size!==q.correct.length)errors.push(prefix+'select valid correct answers.');
 if(q.type==='order'&&q.correct?.length!==cids.length)errors.push(prefix+'correct order must include every item once.');
 if(q.type==='truefalse'&&q.correct?.length!==1)errors.push(prefix+'select one correct answer.');}
 if(publish&&q.type==='image'&&q.choices.some(c=>!c.image))errors.push(prefix+'upload an image for each answer.');}
 }
 if(publish&&q.type==='text'&&!q.acceptable?.some(a=>a.trim())&&!q.manualReview)errors.push(prefix+'enter acceptable answers or enable instructor review.');
 if(q.type==='number'&&(!Number.isFinite(Number(q.number))||!Number.isFinite(Number(q.tolerance))||Number(q.tolerance)<0))errors.push(prefix+'enter a valid number and nonnegative tolerance.');
 if(q.type==='scale'&&(![q.min,q.max,q.step].every(n=>Number.isFinite(Number(n)))||Number(q.max)<=Number(q.min)||Number(q.step)<=0))errors.push(prefix+'scale maximum must exceed its minimum; step must be positive.');
 if(q.type==='pin'&&(!q.target||![q.target.x,q.target.y,q.target.radius].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||q.target.radius<=0))errors.push(prefix+'select a target and positive radius.');
 if(q.type==='pin'&&q.mediaType!=='image')errors.push(prefix+'pin questions require image media.');
 if(publish&&q.type==='pin'&&!q.media)errors.push(prefix+'upload the target image.');
 if(q.media&&(!safeMedia(q.media)))errors.push(prefix+'media must use a secure HTTPS URL or this site’s assets.');
 });
 return errors;
}
export function safeMedia(s){return typeof s==='string'&&(/^(https:\/\/[^\s]+|\/assets\/[^\s]+)$/.test(s));}
export function cloneGame(g){const c=structuredClone(g);c.id=id();c.title+=' (copy)';for(const q of c.questions){q.id=id();const mapping={};for(const x of q.choices||[])mapping[x.id]=id();q.choices=(q.choices||[]).map(x=>({...x,id:mapping[x.id]}));q.correct=(q.correct||[]).map(x=>mapping[x]||x);}return c;}
export function gameRows(g){return g.questions.map(q=>({type:q.type,question:q.text,choices:(q.choices||[]).map(c=>c.label).join('|'),correct:(q.correct||[]).map(x=>(q.choices||[]).findIndex(c=>c.id===x)+1).join('|'),acceptable:(q.acceptable||[]).join('|'),timer:q.timer,points:q.points,explanation:q.explanation,number:q.number,tolerance:q.tolerance,min:q.min,max:q.max,step:q.step,media:q.media,mediaType:q.mediaType,alt:q.alt,body:q.body,video:q.video,lowLabel:q.lowLabel,highLabel:q.highLabel,tags:(q.tags||[]).join('|'),partialCredit:q.partialCredit,caseSensitive:q.caseSensitive,manualReview:q.manualReview,targetX:q.target?.x,targetY:q.target?.y,targetRadius:q.target?.radius,choiceImages:(q.choices||[]).map(c=>c.image||'').join('|')}));}
export function rowsToGame(rows){const g=newGame(),errors=[];const allowed=new Set(Object.keys(gameRows({...g,questions:[newQuestion() ]})[0]));for(const [i,r] of rows.entries()){
 const unknown=Object.keys(r).filter(k=>!allowed.has(k)&&r[k]!==''&&r[k]!=null);if(unknown.length)errors.push('Row '+(i+2)+': unsupported columns '+unknown.join(', ')+'.');
 if(!TYPES[r.type]){errors.push('Row '+(i+2)+': unsupported type '+r.type);continue;}
 const q=newQuestion(r.type);q.text=String(r.question||'');q.choices=String(r.choices||'').split('|').filter(Boolean).map(label=>({id:id(),label,image:''}));
 const correct=String(r.correct??'').split('|').filter(Boolean).map(Number);q.correct=correct.map(n=>q.choices[n-1]?.id||'invalid');q.acceptable=String(r.acceptable||'').split('|').filter(Boolean);
 for(const k of ['timer','points','number','tolerance','min','max','step'])if(r[k]!==''&&r[k]!=null){const n=Number(r[k]);if(!Number.isFinite(n))errors.push('Row '+(i+2)+': '+k+' must be a number.');q[k]=n;}
 for(const k of ['explanation','media','mediaType','alt','body','video','lowLabel','highLabel'])if(r[k]!=null)q[k]=String(r[k]);
 for(const k of ['partialCredit','caseSensitive','manualReview'])if(r[k]!=null&&r[k]!==''){if(!['true','false','1','0'].includes(String(r[k]).toLowerCase()))errors.push('Row '+(i+2)+': '+k+' must be true or false.');q[k]=['true','1'].includes(String(r[k]).toLowerCase());}
 for(const [key,col] of [['x','targetX'],['y','targetY'],['radius','targetRadius']])if(r[col]!==''&&r[col]!=null)q.target[key]=Number(r[col]);
 if(r.choiceImages)String(r.choiceImages).split('|').forEach((image,j)=>{if(q.choices[j])q.choices[j].image=image;else if(image)errors.push('Row '+(i+2)+': extra image without a choice.');});
 q.tags=String(r.tags||'').split('|').filter(Boolean);g.questions.push(q);
 }errors.push(...validateGame(g,true));return {game:g,errors};}
