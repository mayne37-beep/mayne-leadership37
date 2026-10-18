import {CHARACTER_STYLES,CHARACTER_EXPRESSIONS,CHOICES,portraitHTML,displayStyle,hasPhoto,CHARACTER_LIMIT} from './leadership-characters.js';
const e=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
const title=s=>s.split('-').map(w=>w==='d'?'D':w[0].toUpperCase()+w.slice(1)).join(' ');
const select=(options,current)=>options.map(x=>'<option value="'+e(x)+'"'+(x===current?' selected':'')+'>'+e(x)+'</option>').join('');
const input=(label,path,value,max=120)=>'<label>'+e(label)+'<input data-character-field="'+e(path)+'" maxlength="'+max+'" value="'+e(value)+'"></label>';
const dropdown=(label,path,opts,value)=>'<label>'+e(label)+'<select data-character-field="'+e(path)+'">'+select(opts,value)+'</select></label>';
const range=(label,path,value,descriptions)=>'<label class="character-range"><span><strong>'+e(label)+'</strong><small>'+e(descriptions)+'</small></span>'+
 '<span class="character-range-control"><input type="range" data-character-field="'+e(path)+'" min="1" max="5" step="1" value="'+value+'">'+
 '<output>'+value+' / 5</output></span></label>';
const swatches=(label,path,opts,active)=>'<div class="character-swatches"><strong>'+e(label)+'</strong><div class="swatch-row">'+
 opts.map(color=>'<button type="button" data-character-swatch="'+e(path)+'" data-swatch-color="'+color+'"'+
 (color===active?' aria-pressed="true" class="active"':' aria-pressed="false"')+' title="'+color+
 '" aria-label="'+e(label+' '+color)+'" style="--swatch-color:'+color+'"><span></span></button>').join('')+
 '</div></div>';
export function characterStudioHTML(characters,currentId,project,previewEmotion='neutral'){
 const chosen=characters.find(c=>c.id===currentId)||characters[0];
 const styleName=chosen?displayStyle(chosen.style):'';
 const activeId=project?.characterId||'';
 return '<div class="character-studio">'+
 '<div class="character-head"><div><span class="eyebrow">CHARACTER CREATOR · REUSABLE ROLEPLAY CAST</span>'+
 '<h3>Build your classroom cast.</h3><p>Create different looks, personalities, and expressions. Reuse a saved character in any scenario without changing the lesson script.</p></div>'+
 '<div class="character-head-actions"><button type="button" data-character-create="1" class="primary">＋ New character</button>'+
 '<button type="button" data-character-import="1">↥ Import character</button><button type="button" data-character-export="1">↧ Export character</button></div></div>'+
 '<div class="character-workspace"><div class="character-library">'+
 '<div class="panel-title"><h3>Character Library</h3><span>'+characters.length+' / '+CHARACTER_LIMIT+'</span></div>'+
 '<div class="character-tiles">'+characters.map(c=>
 '<button type="button" class="character-tile'+(c.id===chosen?.id?' selected':'')+'" data-character-select="'+e(c.id)+'" aria-pressed="'+(c.id===chosen?.id?'true':'false')+'">'+
 '<span class="character-tile-art">'+portraitHTML(c,c.style==='photo'?'neutral':'thoughtful')+'</span>'+
 '<span class="character-tile-copy"><strong>'+e(c.name)+'</strong><small>'+e(c.role)+'</small><em>'+e(displayStyle(c.style))+'</em></span>'+
 (c.id===activeId?'<span class="character-in-use" title="Assigned to this scenario">✓ Assigned</span>':'')+'</button>').join('')+'</div>'+
 '<p class="muted">These profiles live in your browser’s local project library. Changes to an assigned character update any linked scenarios.</p></div>'+
 (chosen?'<div class="character-editor">'+
 '<div class="character-editor-head"><div><span class="eyebrow">SELECTED CHARACTER</span><h3>'+e(chosen.name)+'</h3><p>'+e(chosen.role)+'</p></div>'+
 '<div class="character-editor-actions"><button type="button" data-character-duplicate="1">Duplicate</button>'+
 '<button type="button" data-character-delete="1" class="danger">Delete</button></div></div>'+
 '<div class="character-creator-body"><div class="character-visual">'+
 '<div class="character-style-toggle" role="group" aria-label="Portrait style">'+
 CHARACTER_STYLES.map(style=>'<button type="button" data-character-style="'+style+'" aria-pressed="'+(chosen.style===style?'true':'false')+'" class="'+(chosen.style===style?'active':'')+'">'+e(displayStyle(style))+'</button>').join('')+'</div>'+
 '<div class="character-portrait-main">'+portraitHTML(chosen,previewEmotion)+
 '<span class="character-style-caption">'+e(styleName)+' · '+e(title(previewEmotion))+'</span></div>'+
 '<div class="character-expression-heading"><span class="eyebrow">LIVE EXPRESSION PREVIEW</span><small>Choose a mood</small></div>'+
 '<div class="character-expressions">'+CHARACTER_EXPRESSIONS.map(ex=>
 '<button data-character-emotion="'+e(ex)+'" type="button" aria-pressed="'+(previewEmotion===ex?'true':'false')+'" class="'+(previewEmotion===ex?'active':'')+'">'+e(title(ex))+'</button>').join('')+'</div>'+
 (chosen.style==='photo'?'<div class="character-photo-tools"><h4>Photorealistic portrait images</h4>'+
 '<p>Upload your own photos or licensed portraits. The neutral photo is the fallback. To change the face when emotions change, upload a separate image for each expression. Photos stay on this device until you export the library or delete them.</p>'+
 '<div class="photo-action-row"><button type="button" class="primary" data-photo-upload="'+e(previewEmotion)+'">↥ Upload '+e(previewEmotion)+' photo</button>'+
 (chosen.photos?.[previewEmotion]?'<button type="button" data-photo-remove="'+e(previewEmotion)+'" class="danger">Remove photo</button>':'')+'</div>'+
 '<small>JPEG, PNG or WebP; resized locally. No automatic photorealistic generation or voice cloning.</small></div>':
 '<p class="character-visual-help">Adjust features below to update the '+e(styleName.toLowerCase())+' portrait instantly. Expressions change in response to the lesson’s scripted conversation.</p>')+
 '<div class="character-use-box"><strong>'+e(activeId===chosen.id?'✓ Assigned to current scenario':'Assign this character to your scenario')+'</strong>'+
 '<p>Current scenario: '+e(project?.title||'None selected')+'</p>'+
 '<button type="button" data-character-assign="'+e(chosen.id)+'" class="primary"'+(activeId===chosen.id?' disabled':'')+'>'+
 (activeId===chosen.id?'Already assigned':'Use in this scenario →')+'</button></div></div>'+
 '<div class="character-fields"><div class="character-form-section"><div class="panel-title"><h3>Identity</h3><span>Reusable profile</span></div>'+
 input('Character name','identity.name',chosen.name,100)+input('Job / role','identity.role',chosen.role,120)+
 '<label>Personality notes<textarea rows="3" maxlength="300" data-character-field="identity.temperament">'+e(chosen.temperament)+'</textarea></label></div>'+
 '<div class="character-form-section"><div class="panel-title"><h3>Appearance</h3><span>Portrait design</span></div>'+
 '<div class="two-fields">'+dropdown('Age range','appearance.age',CHOICES.age,chosen.appearance.age)+
 dropdown('Presentation','appearance.presentation',CHOICES.presentation,chosen.appearance.presentation)+
 dropdown('Hair style','appearance.hairstyle',CHOICES.hairstyle,chosen.appearance.hairstyle)+
 dropdown('Facial hair','appearance.beard',CHOICES.beard,chosen.appearance.beard)+
 dropdown('Clothing','appearance.clothing',CHOICES.clothing,chosen.appearance.clothing)+
 dropdown('Accessories','appearance.accessories',CHOICES.accessories,chosen.appearance.accessories)+'</div>'+
 swatches('Skin tone','appearance.skin',CHOICES.skin,chosen.appearance.skin)+
 swatches('Hair color','appearance.hair',CHOICES.hair,chosen.appearance.hair)+
 swatches('Outfit color','appearance.outfit',CHOICES.outfit,chosen.appearance.outfit)+'</div>'+
 '<div class="character-form-section"><div class="panel-title"><h3>Conversation personality</h3><span>Illustrative behavior</span></div>'+
 '<p class="muted">These sliders modify authored indicator changes only. They do not create new AI dialogue or measure actual employee reactions.</p>'+
 dropdown('Communication style','behavior.communication',CHOICES.communication,chosen.behavior.communication)+
 dropdown('Interaction difficulty','behavior.difficulty',CHOICES.difficulty,chosen.behavior.difficulty)+
 range('Reactivity','behavior.reactivity',chosen.behavior.reactivity,'How strongly tense choices affect the scripted outcome')+
 range('Openness','behavior.openness',chosen.behavior.openness,'How positively collaborative responses affect the scripted outcome')+
 range('Directness','behavior.directness',chosen.behavior.directness,'How strongly clarity changes during direct feedback')+
 '</div></div></div></div>':
 '<div class="empty"><strong>No characters saved</strong><p>Create your first character to begin designing the cast.</p><button data-character-create="1">＋ New character</button></div>')+
 '</div><p class="character-storage-note">Character profiles are local to this browser. Export character JSON to reuse profiles on another device. Uploaded portraits increase browser storage requirements.</p></div>';
}
