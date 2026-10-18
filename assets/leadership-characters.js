/* Reusable local Character Creator: editable appearance, scripted behavior and
   optional user-supplied photographic portraits. No image generation service is used. */
export const CHARACTER_STYLES=['illustrated','three-d','photo'];
export const CHARACTER_EXPRESSIONS=['neutral','guarded','frustrated','skeptical','thoughtful','open','hopeful','disappointed'];
export const CHARACTER_LIMIT=48;
export const CHARACTER_PHOTO_LIMIT=220000; // encoded characters, about 165KB / photo
export const CHOICES={
 age:['Young adult','Adult','Mature','Senior'],
 presentation:['Masculine','Feminine','Androgynous'],
 hairstyle:['Short','Wavy','Curly','Long','Bob','Bun','Locs','Buzz','Bald'],
 hair:['#302923','#554136','#88634b','#b18a66','#d8c7a6','#252a34','#8d9296'],
 skin:['#f3d5b8','#e9b991','#d5a079','#ac7557','#865642','#603c30'],
 clothing:['Blazer','Polo','Uniform','Sweater','Blouse','Business casual'],
 outfit:['#345f81','#427c89','#6b705e','#9b6576','#6f627e','#3e4857','#ab8157'],
 accessories:['None','Glasses','Earrings','Glasses & earrings'],
 beard:['None','Stubble','Short beard','Full beard'],
 expression:CHARACTER_EXPRESSIONS,
 communication:['Calm and direct','Reserved','Assertive','Warm and collaborative','Analytical','Skeptical'],
 difficulty:['Supportive','Balanced','Challenging']
};
const safe=(v,max=120)=>String(v??'').slice(0,max);
const num=(v,min,max,def)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Math.round(Number(v)))):def;
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const pick=(options,value,fallback=options[0])=>options.includes(value)?value:fallback;
const stamp=()=>new Date().toISOString();
const id=()=>globalThis.crypto?.randomUUID?.()||'character-'+Date.now().toString(36)+Math.random().toString(36).slice(2,9);
const isPhoto=s=>typeof s==='string'&&s.length<CHARACTER_PHOTO_LIMIT&&/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(s);
const tone=(key,value)=>pick(CHOICES[key],value);
export function createCharacter(raw={}){
 const appearance=raw.appearance||{},behavior=raw.behavior||{},photos=raw.photos||{};
 const profile={
  id:safe(raw.id,95)||id(),name:safe(raw.name||'New employee',100),role:safe(raw.role||'Team member',120),
  temperament:safe(raw.temperament||'Thoughtful about the situation',300),
  style:pick(CHARACTER_STYLES,raw.style,'illustrated'),avatar:pick(['olive','blue','sand','rose','slate'],raw.avatar,'blue'),
  appearance:{
   age:tone('age',appearance.age||'Adult'),
   presentation:tone('presentation',appearance.presentation||'Androgynous'),
   hairstyle:tone('hairstyle',appearance.hairstyle||'Short'),
   hair:tone('hair',appearance.hair||'#302923'),
   skin:tone('skin',appearance.skin||'#d5a079'),
   clothing:tone('clothing',appearance.clothing||'Blazer'),
   outfit:tone('outfit',appearance.outfit||'#345f81'),
   accessories:tone('accessories',appearance.accessories||'None'),
   beard:tone('beard',appearance.beard||'None')
  },
  behavior:{
   communication:tone('communication',behavior.communication||'Calm and direct'),
   difficulty:tone('difficulty',behavior.difficulty||'Balanced'),
   reactivity:num(behavior.reactivity,1,5,3),
   openness:num(behavior.openness,1,5,3),
   directness:num(behavior.directness,1,5,3)
  },
  photos:Object.fromEntries(CHARACTER_EXPRESSIONS.filter(k=>isPhoto(photos[k])).map(k=>[k,photos[k]])),
  created:safe(raw.created||stamp(),60),updated:safe(raw.updated||stamp(),60)
 };
 return profile;
}
export function normalizeCharacters(raw=[]){
 const arr=Array.isArray(raw)?raw:[],out=[],used=new Set();
 for(const entry of arr.slice(0,CHARACTER_LIMIT)){
  const c=createCharacter(entry);
  if(used.has(c.id))c.id=id();
  used.add(c.id);out.push(c);
 }
 return out;
}
export function makeLegacyCharacter(persona={},index=0){
 const seeds=[
  {style:'illustrated',skin:'#ac7557',hair:'#302923',hairstyle:'Short',clothing:'Polo',outfit:'#6b705e',presentation:'Masculine'},
  {style:'three-d',skin:'#e9b991',hair:'#554136',hairstyle:'Bob',clothing:'Blazer',outfit:'#9b6576',presentation:'Feminine'},
  {style:'three-d',skin:'#d5a079',hair:'#252a34',hairstyle:'Wavy',clothing:'Sweater',outfit:'#427c89',presentation:'Masculine'},
  {style:'illustrated',skin:'#ac7557',hair:'#302923',hairstyle:'Long',clothing:'Business casual',outfit:'#3e4857',presentation:'Feminine'},
  {style:'illustrated',skin:'#865642',hair:'#252a34',hairstyle:'Bun',clothing:'Blazer',outfit:'#6f627e',presentation:'Feminine'},
  {style:'three-d',skin:'#e9b991',hair:'#554136',hairstyle:'Curly',clothing:'Blouse',outfit:'#ab8157',presentation:'Feminine'}
 ][index%6];
 return createCharacter({...persona,id:id(),style:seeds.style,appearance:{skin:seeds.skin,hair:seeds.hair,
  hairstyle:seeds.hairstyle,clothing:seeds.clothing,outfit:seeds.outfit,presentation:seeds.presentation}});
}
export function createLibrary(projects=[],existing=[]){
 const characters=normalizeCharacters(existing);
 for(let i=0;i<projects.length;i++){
  const p=projects[i];
  const current=characters.find(c=>c.id===p.characterId);
  if(current){p.persona=characterPersona(current);continue;}
  const persona=p.persona||{};
  const reused=characters.find(c=>c.name===persona.name&&c.role===persona.role);
  let candidate=reused;
  if(!candidate&&characters.length<CHARACTER_LIMIT){
   candidate=makeLegacyCharacter(persona,i);characters.push(candidate);
  }
  if(candidate){p.characterId=candidate.id;p.persona=characterPersona(candidate);}
 }
 return characters;
}
export function characterPersona(character){
 const c=createCharacter(character);
 return {name:c.name,role:c.role,temperament:c.temperament,avatar:c.avatar,
  style:c.style,appearance:{...c.appearance},behavior:{...c.behavior},photos:{...c.photos}};
}
export function assignCharacter(project,character){
 if(!character)throw Error('Select a saved character.');
 project.characterId=character.id;project.persona=characterPersona(character);return project;
}
export function syncCharacter(projects,character){
 for(const p of projects)if(p.characterId===character.id)p.persona=characterPersona(character);
}
export function updateCharacter(character,path,value){
 const [section,key]=String(path||'').split('.');
 if(section==='identity'){
  if(!['name','role','temperament'].includes(key))throw Error('Field is not editable.');
  character[key]=safe(value,key==='name'?100:key==='role'?120:300);
 }else if(section==='style'){
  character.style=pick(CHARACTER_STYLES,value,'illustrated');
 }else if(section==='appearance'){
  if(!Object.hasOwn(CHOICES,key))throw Error('Unknown appearance field.');
  character.appearance[key]=tone(key,value);
 }else if(section==='behavior'){
  if(key==='communication'||key==='difficulty')character.behavior[key]=tone(key,value);
  else if(['reactivity','openness','directness'].includes(key))character.behavior[key]=num(value,1,5,3);
  else throw Error('Unknown behavior field.');
 }else throw Error('Unknown character setting.');
 character.updated=stamp();return character;
}
export function setPhoto(character,emotion,data){
 if(!CHARACTER_EXPRESSIONS.includes(emotion))throw Error('Unknown expression.');
 if(data!==''&&!isPhoto(data))throw Error('Use a small JPEG, PNG or WebP photo. SVG and external URLs are not supported.');
 if(data)character.photos[emotion]=data;else delete character.photos[emotion];
 character.updated=stamp();return character;
}
export function duplicateCharacter(character){
 const c=createCharacter({...character,id:id(),name:safe(character.name+' (copy)',100),created:stamp(),updated:stamp()});
 return c;
}
export const displayStyle=s=>s==='three-d'?'3D-style':s==='photo'?'Photorealistic photo':'Illustrated';
export const hasPhoto=c=>Object.keys(c.photos||{}).some(k=>isPhoto(c.photos[k]));
export function behaviorEffects(effects,character){
 const b=createCharacter(character).behavior;
 // Cosmetic roleplay adjustments, explicitly illustrative rather than validated psychology.
 return Object.fromEntries(Object.entries(effects||{}).map(([k,v])=>{
  const original=Math.max(-25,Math.min(25,Number(v)||0));
  const isNegative=original<0;
  const factor=isNegative?1+(b.reactivity-3)*0.16:1+(b.openness-3)*0.13;
  const directness=k==='clarity'?1+(b.directness-3)*0.09:1;
  return [k,Math.max(-25,Math.min(25,Math.round(original*factor*directness)))];
 }));
}
const e=escapeHTML;
const hairPath={
 Short:'M79 132 Q66 55 132 56 Q210 53 186 143 L175 118 Q166 101 142 108 Q100 112 88 128Z',
 Wavy:'M76 143 Q62 87 80 64 Q95 42 112 53 Q140 40 166 55 Q200 66 188 143 L179 194 L165 166 L171 115 Q141 105 110 116 L90 145Z',
 Curly:'M76 143 Q54 108 73 87 Q57 56 88 55 Q95 35 122 48 Q148 31 164 52 Q196 41 200 79 Q221 97 190 126 L181 157 L174 111 Q122 112 91 132Z',
 Long:'M82 106 Q69 62 117 54 Q171 43 192 100 L204 236 Q181 248 169 216 L169 119 L92 126 L92 210 Q84 247 63 228Z',
 Bob:'M78 131 Q70 69 111 55 Q169 37 190 97 L192 198 L162 192 L167 114 L94 114 L97 190 L70 196Z',
 Bun:'M86 127 Q75 89 86 71 Q97 44 137 55 Q181 54 184 123 L172 112 L94 115Z M142 50 Q131 28 146 21 Q180 14 190 36 Q196 58 180 71Z',
 Locs:'M87 131 Q70 65 120 51 Q181 43 188 129 L194 234 L185 239 L179 140 L173 235 L162 235 L167 122 L97 122 L96 241 L85 241Z',
 Buzz:'M87 129 Q78 73 115 63 Q166 54 183 113 L175 104 Q148 88 103 104Z',
 Bald:'M88 101 Q101 64 137 63 Q172 64 180 111 L172 103 L95 106Z'
};
const paths={neutral:'M118 174 Q136 176 154 174',guarded:'M118 174 L154 174',
 frustrated:'M116 180 Q135 162 155 179',skeptical:'M116 173 Q137 166 155 173',
 thoughtful:'M120 175 Q135 178 154 174',open:'M119 171 Q136 188 154 171',
 hopeful:'M118 171 Q136 193 155 171',disappointed:'M118 180 Q134 162 153 180'};
function specular(c){return c.style==='three-d'}
export function portraitHTML(character,emotion='neutral'){
 const c=createCharacter(character),mood=CHARACTER_EXPRESSIONS.includes(emotion)?emotion:'neutral';
 if(c.style==='photo'){
  const photo=c.photos[mood]||c.photos.neutral||Object.values(c.photos)[0]||'';
  if(isPhoto(photo))return '<div class="character-photo-wrap"><img class="character-photo" alt="'+e(c.name+' · '+mood+' portrait')+'" src="'+photo+'" loading="lazy" decoding="async"></div>';
  return '<div class="photo-placeholder" role="img" aria-label="'+e(c.name+' photorealistic portrait not added yet')+'"><span class="photo-placeholder-icon" aria-hidden="true">▧</span><strong>Photo portrait</strong><small>Upload a real image in Character Creator</small></div>';
 }
 const a=c.appearance,three=specular(c),g='lcchar-'+c.id.replace(/[^a-zA-Z0-9]/g,'').slice(-11);
 const leftEye=mood==='skeptical'?'M109 132 Q117 128 125 131':'M108 132 Q116 128 125 132';
 const rightEye='M147 132 Q155 128 164 132';
 const brows=mood==='frustrated'?['M104 112 L123 120','M146 120 L166 112']:
 mood==='skeptical'?['M105 114 L125 110','M145 116 L165 109']:
 mood==='disappointed'?['M105 114 L125 111','M145 111 L165 114']:
 ['M106 113 L125 111','M145 111 L164 113'];
 const beard=a.beard==='None'?'':a.beard==='Stubble'?'<path d="M97 164 Q98 204 137 210 Q171 203 176 166" fill="none" stroke="'+a.hair+'" stroke-width="8" opacity=".13"/>':
 '<path d="M96 169 Q94 217 135 228 Q181 217 177 169 L166 193 Q135 209 106 191Z" fill="'+a.hair+'" opacity="'+(a.beard==='Short beard'?'.64':'.95')+'"/>';
 const glasses=a.accessories.includes('Glasses')?'<rect x="99" y="123" width="33" height="27" rx="11" fill="#e7f4fa11" stroke="#4d515c" stroke-width="3"/><rect x="143" y="123" width="33" height="27" rx="11" fill="#e7f4fa11" stroke="#4d515c" stroke-width="3"/><path d="M132 134 L143 134 M97 130 L88 126 M177 130 L185 127" stroke="#4d515c" stroke-width="3" fill="none"/>':'';
 const earrings=a.accessories.includes('earrings')?'<circle cx="88" cy="164" r="5" fill="#c5a04e"/><circle cx="186" cy="164" r="5" fill="#c5a04e"/>':'';
 const lines=a.age==='Senior'?'<path d="M103 158 L114 160 M155 160 L168 158 M111 176 L119 178 M154 178 L161 175" fill="none" stroke="#633d2f" stroke-width="1.5" opacity=".22"/>':
 a.age==='Mature'?'<path d="M101 160 L111 163 M160 163 L170 161" fill="none" stroke="#633d2f" stroke-width="1.3" opacity=".18"/>':'';
 const shirt=a.clothing==='Polo'?'<path d="M112 213 L137 247 L161 213 L148 220 L135 231 L125 219Z" fill="#f7f9f9"/>':
 a.clothing==='Uniform'?'<path d="M105 218 L135 234 L165 218" fill="none" stroke="#e5e9e3" stroke-width="12"/>':
 '<path d="M111 212 L136 236 L161 211 L152 207 L135 218 L122 207Z" fill="#f8faf8"/>';
 const rightLight=three?'<ellipse cx="157" cy="122" rx="29" ry="65" fill="#fff" opacity=".105"/><path d="M89 150 Q93 192 114 203" fill="none" stroke="#fff" opacity=".24" stroke-width="6" stroke-linecap="round"/>':'';
 const m=paths[mood]||paths.neutral;
 const skinShadow=three?'url(#'+g+'-skin)':'url(#'+g+'-skin-flat)';
 return '<svg class="portrait-svg character-style-'+c.style+'" role="img" aria-label="'+e(c.name+' · '+mood+' · '+displayStyle(c.style))+'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 270 300">'+
 '<defs><radialGradient id="'+g+'-bg"><stop stop-color="#fff"/><stop offset="1" stop-color="'+(three?'#d8e7ef':'#e6f2fa')+'"/></radialGradient>'+
 '<linearGradient id="'+g+'-coat" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+a.outfit+'"/><stop offset="1" stop-color="#2c3c4e"/></linearGradient>'+
 '<linearGradient id="'+g+'-skin" x1="0" y1="0" x2="1" y2=".3"><stop stop-color="#fbe6d7"/><stop offset=".34" stop-color="'+a.skin+'"/><stop offset="1" stop-color="#765044"/></linearGradient>'+
 '<linearGradient id="'+g+'-skin-flat" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+a.skin+'"/><stop offset="1" stop-color="'+a.skin+'"/></linearGradient></defs>'+
 '<ellipse cx="135" cy="149" rx="124" ry="130" fill="url(#'+g+'-bg)" stroke="#c9deea" stroke-width="2"/>'+
 (three?'<ellipse cx="137" cy="280" rx="89" ry="12" fill="#215c7b" opacity=".17"/>':'')+
 '<path d="M17 303 C21 249 59 228 104 221 L120 209 L154 209 L175 224 C226 231 251 258 255 303Z" fill="url(#'+g+'-coat)"/>'+
 (three?'<path d="M20 299 Q44 244 91 229" stroke="#fff" stroke-opacity=".21" stroke-width="9" fill="none"/>':'')+
 shirt+
 '<path d="M117 181 L114 214 Q132 236 156 213 L155 183Z" fill="'+skinShadow+'"/>'+
 '<ellipse cx="88" cy="155" rx="10" ry="14" fill="'+a.skin+'"/><ellipse cx="184" cy="155" rx="10" ry="14" fill="'+a.skin+'"/>'+
 '<path d="M89 112 Q92 68 133 68 Q180 69 183 117 L180 163 Q179 197 150 210 Q136 215 118 209 Q93 195 91 164Z" fill="'+skinShadow+'" stroke="#b9887130" stroke-width="'+(three?'2':'1')+'"/>'+
 rightLight+'<path d="'+hairPath[a.hairstyle]+'" fill="'+(a.hairstyle==='Bald'?a.skin:a.hair)+'" opacity="'+(a.hairstyle==='Bald'?'.65':'1')+'"/>'+
 (three?'<path d="M97 91 Q110 58 147 67" stroke="#fff" stroke-opacity=".21" stroke-width="8" stroke-linecap="round" fill="none"/>':'')+
 '<path d="'+brows[0]+'" stroke="'+a.hair+'" stroke-width="4" fill="none" stroke-linecap="round"/>'+
 '<path d="'+brows[1]+'" stroke="'+a.hair+'" stroke-width="4" fill="none" stroke-linecap="round"/>'+
 '<path d="'+leftEye+'" stroke="#413a39" stroke-width="2" fill="none"/><path d="'+rightEye+'" stroke="#413a39" stroke-width="2" fill="none"/>'+
 '<ellipse cx="116" cy="135" rx="4.2" ry="5.0" fill="#222c35"/><ellipse cx="155" cy="135" rx="4.2" ry="5" fill="#222c35"/>'+
 (three?'<circle cx="117" cy="134" r="1.3" fill="#fff"/><circle cx="156" cy="134" r="1.3" fill="#fff"/>':'')+
 '<path d="M135 141 Q131 158 138 165 L143 164" stroke="#865e50" stroke-width="2" fill="none" stroke-linecap="round"/>'+
 beard+'<path d="'+m+'" stroke="#854f4c" stroke-width="3.2" fill="none" stroke-linecap="round"/>'+
 lines+glasses+earrings+'</svg>';
}
