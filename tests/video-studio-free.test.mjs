import test from 'node:test';
import assert from 'node:assert/strict';
import {splitNarration,pcmToWav,validLocalVoice,LOCAL_VOICES,MAX_LOCAL_SCRIPT} from '../assets/video-studio-free-core.js';

test('speaker catalog includes distinct accents and validates selections',()=>{
 assert.ok(LOCAL_VOICES.length>=6);
 assert.equal(validLocalVoice('af_heart'),true);
 assert.equal(validLocalVoice('bm_george'),true);
 assert.equal(validLocalVoice('unknown'),false);
});
test('short narration remains intact and longer text splits at sentence and word boundaries',()=>{
 assert.deepEqual(splitNarration('Hello world.  How are you?'),['Hello world.','How are you?']);
 const input='Our leaders encourage people to listen carefully and collaborate across teams.';
 const chunks=splitNarration(input,32);
 assert.ok(chunks.length>1);assert.ok(chunks.every(c=>c.length<=32));
 assert.equal(chunks.join(' '),input);
 assert.throws(()=>splitNarration('X'.repeat(MAX_LOCAL_SCRIPT+1)),/1,200/);
 assert.deepEqual(splitNarration(''),[]);
});
test('speech PCM is encoded as a standard playable 16-bit mono WAV',()=>{
 const wav=pcmToWav([new Float32Array([0,1,-1]),new Float32Array([0.5])],24000);
 const data=new DataView(wav);
 assert.equal(wav.byteLength,52);
 assert.equal(String.fromCharCode(...new Uint8Array(wav.slice(0,4))),'RIFF');
 assert.equal(String.fromCharCode(...new Uint8Array(wav.slice(8,12))),'WAVE');
 assert.equal(data.getUint16(22,true),1);
 assert.equal(data.getUint32(24,true),24000);
 assert.equal(data.getUint32(40,true),8);
 assert.equal(data.getInt16(46,true),32767);
 assert.equal(data.getInt16(48,true),-32768);
 assert.throws(()=>pcmToWav([],24000),/No voice data/);
});
