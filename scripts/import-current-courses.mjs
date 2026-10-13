// Offline conversion prepares reviewable LMS data; database writes are separate.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {CURRENT_COURSES,convertAuthoring} from '../src/lms/import-authoring.js';
const sourceDir=process.argv[2],outDir=process.argv[3];if(!sourceDir||!outDir)throw Error('Usage: node scripts/import-current-courses.mjs SOURCE_DIRECTORY OUTPUT_DIRECTORY');await mkdir(outDir,{recursive:true});const manifest=[];
for(const spec of CURRENT_COURSES){const data=JSON.parse(await readFile(path.join(sourceDir,spec.id+'.json'),'utf8'));const course=convertAuthoring({id:spec.id,title:data.title,version:1,data});await writeFile(path.join(outDir,spec.id+'.json'),JSON.stringify(course));manifest.push({id:spec.id,title:course.title,code:course.code,...course.import_summary,items:course.items.length});}
await writeFile(path.join(outDir,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest,null,2));
