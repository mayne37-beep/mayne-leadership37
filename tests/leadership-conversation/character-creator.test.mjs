import test from 'node:test';
import assert from 'node:assert/strict';
import {makeProject,starterLibrary,templateProject,startSession,choose,normalizeProject} from '../../assets/leadership-conversation-model.js';
import {
 CHARACTER_STYLES,CHARACTER_EXPRESSIONS,CHARACTER_LIMIT,CHOICES,createCharacter,makeLegacyCharacter,
 normalizeCharacters,createLibrary,characterPersona,assignCharacter,syncCharacter,updateCharacter,
 setPhoto,duplicateCharacter,behaviorEffects,portraitHTML,hasPhoto
} from '../../assets/leadership-characters.js';
import {characterStudioHTML} from '../../assets/leadership-character-view.js';
import {practiceHTML,avatarSVG} from '../../assets/leadership-conversation-render.js';

const onePixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l2YAAAAASUVORK5CYII=';

test('Migrates the six original simulator scenarios into reusable linked characters without changing dialogue',()=>{
 const projects=starterLibrary();
 const firstLine=projects[0].nodes[0].line;
 const original=projects[0].persona.name;
 const library=createLibrary(projects);
 assert.equal(library.length,6);
 assert.equal(projects[0].nodes[0].line,firstLine);
 assert.equal(projects[0].persona.name,original);
 assert.ok(library.every(c=>CHARACTER_STYLES.includes(c.style)));
 assert.ok(library.some(c=>c.style==='illustrated'));
 assert.ok(library.some(c=>c.style==='three-d'));
 assert.ok(projects.every(p=>library.some(c=>c.id===p.characterId)));
 const recovered=createLibrary(projects,library);
 assert.equal(recovered.length,6,'Reload must not create duplicate profiles.');
 assert.equal(projects[0].characterId,library[0].id);
 assert.match(avatarSVG(projects[0].persona,'frustrated'),/portrait-svg/);
});

test('Every supported character appearance can be edited and safely normalized',()=>{
 const c=createCharacter({name:'Alex',role:'Instructor',style:'three-d'});
 for(const [key,values] of Object.entries(CHOICES)){
  if(!['age','presentation','hairstyle','hair','skin','clothing','outfit','accessories','beard'].includes(key))continue;
  updateCharacter(c,'appearance.'+key,values.at(-1));
  assert.equal(c.appearance[key],values.at(-1));
 }
 updateCharacter(c,'identity.name','Alexis');
 updateCharacter(c,'identity.role','Training supervisor');
 updateCharacter(c,'identity.temperament','Quiet, thoughtful and clear.');
 updateCharacter(c,'style.style','illustrated');
 updateCharacter(c,'behavior.reactivity',5);
 updateCharacter(c,'behavior.openness',1);
 updateCharacter(c,'behavior.directness',4);
 updateCharacter(c,'behavior.communication','Analytical');
 assert.equal(c.style,'illustrated');
 assert.equal(c.behavior.reactivity,5);
 assert.equal(c.name,'Alexis');
 assert.equal(c.appearance.hair,CHOICES.hair.at(-1));
 assert.throws(()=>updateCharacter(c,'appearance.secret','x'),/Unknown appearance/);
 assert.throws(()=>updateCharacter(c,'identity.script','x'),/not editable/);
 assert.equal(createCharacter({...c,style:'malicious'}).style,'illustrated');
});

test('Illustrated and 3D-styled characters render distinct SVG portraits and eight moods',()=>{
 const c=createCharacter({name:'Jordan',style:'illustrated'});
 const flat=portraitHTML(c,'frustrated');
 assert.match(flat,/character-style-illustrated/);
 assert.match(flat,/svg/);
 assert.match(flat,/frustrated/);
 c.style='three-d';
 const dimensional=portraitHTML(c,'frustrated');
 assert.match(dimensional,/character-style-three-d/);
 assert.match(dimensional,/skin"/);
 assert.notEqual(dimensional,flat);
 for(const mood of CHARACTER_EXPRESSIONS){
  const html=portraitHTML(c,mood);
  assert.ok(html.includes('aria-label='));
  assert.ok(html.includes(mood));
 }
 updateCharacter(c,'appearance.hairstyle','Locs');
 updateCharacter(c,'appearance.accessories','Glasses & earrings');
 assert.match(portraitHTML(c,'neutral'),/stroke-width="3"/);
 assert.match(portraitHTML(c,'neutral'),/portrait-svg/);
});

test('Photo mode displays an honest upload placeholder until a valid photo is supplied',()=>{
 const c=createCharacter({name:'Dana',style:'photo'});
 const placeholder=portraitHTML(c,'frustrated');
 assert.match(placeholder,/Upload a real image/);
 assert.ok(!placeholder.includes('<img'));
 assert.equal(hasPhoto(c),false);
 setPhoto(c,'neutral',onePixel);
 assert.equal(hasPhoto(c),true);
 const normal=portraitHTML(c,'neutral');
 assert.match(normal,/class="character-photo"/);
 assert.match(portraitHTML(c,'frustrated'),/class="character-photo"/,'Neutral photo is fallback for other moods');
 setPhoto(c,'frustrated',onePixel);
 assert.match(portraitHTML(c,'frustrated'),/frustrated portrait/);
 setPhoto(c,'frustrated','');
 assert.equal(c.photos.frustrated,undefined);
 assert.throws(()=>setPhoto(c,'neutral','data:image/svg+xml;base64,PHN2Zy8+'),/JPEG, PNG or WebP/);
 assert.throws(()=>setPhoto(c,'neutral','javascript:alert(1)'),/JPEG, PNG or WebP/);
 assert.throws(()=>setPhoto(c,'ghost',onePixel),/Unknown expression/);
 assert.equal(createCharacter({...c,photos:{neutral:onePixel,guarded:'javascript:bad()'}}).photos.guarded,undefined);
});

test('Swapping a saved character into any scenario changes portraits while preserving decision branches',()=>{
 const a=templateProject('defensive'),b=templateProject('conflict');
 const before=a.nodes.map(n=>({id:n.id,choices:n.choices.map(c=>c.nextId)}));
 const original=a.persona.name;
 const replacement=createCharacter({name:'Morgan Blake',role:'Project lead',style:'three-d',
  appearance:{hairstyle:'Bob',skin:'#865642',outfit:'#9b6576'}});
 assignCharacter(a,replacement);assignCharacter(b,replacement);
 assert.equal(a.persona.name,'Morgan Blake');
 assert.equal(b.persona.name,'Morgan Blake');
 assert.notEqual(original,a.persona.name);
 assert.deepEqual(a.nodes.map(n=>({id:n.id,choices:n.choices.map(c=>c.nextId)})),before);
 updateCharacter(replacement,'identity.name','Morgan B.');
 updateCharacter(replacement,'appearance.hairstyle','Curly');
 syncCharacter([a,b],replacement);
 assert.equal(a.persona.name,'Morgan B.');
 assert.equal(b.persona.appearance.hairstyle,'Curly');
 assert.equal(a.nodes[0].line,'You keep saying my performance is slipping, but nobody acknowledges how much work I’ve been doing.');
 startSession(a);
 assert.match(practiceHTML(a),/Morgan B/);
 const backup=normalizeProject(JSON.parse(JSON.stringify(a)));
 assert.equal(backup.characterId,replacement.id);
 assert.equal(backup.persona.style,'three-d');
 assert.equal(backup.persona.appearance.hairstyle,'Curly');
});

test('Character behavior modifies scripted indicator changes but no dialogue content',()=>{
 const a=templateProject('defensive');
 const neutral={trust:10,safety:-10,clarity:10,commitment:8};
 const base=behaviorEffects(neutral,a.persona);
 assert.deepEqual(base,neutral);
 const reactive=createCharacter({behavior:{reactivity:5,openness:1,directness:5}});
 const shifted=behaviorEffects(neutral,reactive);
 assert.ok(shifted.safety<-10);
 assert.ok(shifted.trust<10);
 assert.ok(shifted.clarity>base.clarity);
 assignCharacter(a,reactive);
 const originalLine=a.nodes[0].line;
 startSession(a);
 const response=choose(a,a.nodes[0].choices[1].id);
 assert.equal(response.employee,originalLine);
 assert.ok(response.effects.safety<-12);
 assert.ok(response.after.safety<38);
});

test('Character library supports independent duplicates, imports and benign data limits',()=>{
 const c=createCharacter({name:'Jordan',style:'photo',photos:{neutral:onePixel}});
 const clone=duplicateCharacter(c);
 assert.notEqual(clone.id,c.id);
 assert.equal(clone.photos.neutral,onePixel);
 assert.match(clone.name,/copy/);
 const normalized=normalizeCharacters([c,clone,{...c,id:c.id}]);
 assert.equal(new Set(normalized.map(x=>x.id)).size,3);
 assert.ok(normalized.length<=CHARACTER_LIMIT);
 const escaped=createCharacter({name:'<script>alert(1)</script>',style:'three-d'});
 assert.ok(!portraitHTML(escaped,'open').includes('<script>'));
 assert.match(portraitHTML(escaped,'open'),/&lt;script&gt;/);
});

test('Character workbench renders editable controls, mixed gallery, mood previews, and clear photo limitations',()=>{
 const projects=starterLibrary(),library=createLibrary(projects);
 const first=library[0];
 let html=characterStudioHTML(library,first.id,projects[0]);
 assert.match(html,/Character Library/);
 assert.match(html,/data-character-assign/);
 assert.match(html,/data-character-field="identity.name"/);
 assert.match(html,/data-character-swatch="appearance.skin"/);
 assert.match(html,/data-character-style="three-d"/);
 assert.match(html,/data-character-style="photo"/);
 assert.match(html,/data-character-emotion="frustrated"/);
 assert.match(html,/✓ Assigned/);
 const picture=createCharacter({name:'Studio Portrait',style:'photo'});
 library.push(picture);
 html=characterStudioHTML(library,picture.id,projects[0],'skeptical');
 assert.match(html,/Upload skeptical photo/);
 assert.match(html,/No automatic photorealistic generation/);
 assert.match(html,/Upload a real image/);
 assert.match(html,/data-character-import/);
 assert.match(html,/data-character-export/);
});
