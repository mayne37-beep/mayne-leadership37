import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {THEME_PRESETS,THEME_COLOR_FIELDS,resolveTheme,themeVars,blockHTML} from '../assets/lesson-player.js';
import {newCourse,newBlock,normalizeCourse} from '../assets/lesson-model.js';

test('all six coordinated palettes have valid colors and readable button text',()=>{
 assert.equal(THEME_PRESETS.length,6);
 assert.equal(THEME_COLOR_FIELDS.length,7);
 for(const preset of THEME_PRESETS){
  for(const [key] of THEME_COLOR_FIELDS)assert.match(preset.palette[key],/^#[a-f0-9]{6}$/i,preset.name+' '+key);
  const css=themeVars(preset.palette);
  assert.match(css,/--accent:#[0-9a-f]{6}/i);
  assert.match(css,/--on-accent:#(?:172C3B|FFFFFF)/);
 }
});

test('existing courses are normalized without losing their legacy accent and background',()=>{
 const course=newCourse('Existing course');
 course.theme={accent:'#165F91',background:'#F8F8F8',font:'serif'};
 const loaded=normalizeCourse(course);
 assert.equal(loaded.theme.accent,'#165F91');
 assert.equal(loaded.theme.background,'#F8F8F8');
 assert.equal(resolveTheme(loaded.theme).surface,'#FFFFFF');
 assert.equal(resolveTheme(loaded.theme).font,'serif');
});

test('lesson palette overrides its course, individual block overrides lesson',()=>{
 const course=normalizeCourse(newCourse('Themed course'));
 Object.assign(course.theme,THEME_PRESETS[0].palette);
 const lesson=course.lessons[0];
 lesson.theme={...THEME_PRESETS[4].palette,preset:'coastal-teal'};
 const block=newBlock('text');
 block.design.background=THEME_PRESETS[2].palette.surface;
 block.design.theme={...THEME_PRESETS[2].palette,preset:'warm-leadership'};
 lesson.blocks.push(block);
 const inherited=resolveTheme(course.theme,lesson.theme);
 assert.equal(inherited.accent,'#145C65');
 assert.equal(inherited.highlight,'#E0B56D');
 const themed=blockHTML(block,inherited);
 assert.match(themed,/--accent:#72523C/);
 assert.match(themed,/--highlight:#A6A86E/);
 assert.match(themed,/--block-bg:#FFFFFF/);
 assert.deepEqual(JSON.parse(JSON.stringify(course)).lessons[0].theme,lesson.theme);
});

test('resetting lesson and block overrides restores inherited colors',()=>{
 const c=newCourse();
 c.theme={...THEME_PRESETS[3].palette,preset:'slate-gold'};
 const l=c.lessons[0];
 l.theme={...THEME_PRESETS[2].palette};
 const b=newBlock('note');
 b.design.theme={...THEME_PRESETS[5].palette};
 delete l.theme;
 delete b.design.theme;
 assert.equal(resolveTheme(c.theme,l.theme).accent,'#313F51');
 assert.match(blockHTML(b,resolveTheme(c.theme,l.theme)),/--accent:#313F51/);
});

test('invalid saved color values cannot inject CSS into learner player',()=>{
 const t=resolveTheme({accent:'red;--bad:true',ink:'url(http://evil)'});
 assert.equal(t.accent,'#176599');
 assert.equal(t.ink,'#20364A');
 assert.doesNotMatch(themeVars(t),/--bad|url\(/);
});

test('author script parses and includes theme scope controls',async()=>{
 const script=await readFile(new URL('../assets/lesson-author.js',import.meta.url),'utf8');
 assert.match(script,/data-theme-preset/);
 assert.match(script,/data-theme-color/);
 assert.match(script,/scope==='lesson'/);
 assert.match(script,/scope==='block'/);
 execFileSync(process.execPath,['--check',new URL('../assets/lesson-author.js',import.meta.url).pathname]);
});
