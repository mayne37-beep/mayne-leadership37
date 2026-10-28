import test from 'node:test';
import assert from 'node:assert/strict';
import {splitNarration,pcmToWav,validLocalVoice,LOCAL_VOICES,MAX_LOCAL_SCRIPT,DEFAULT_SPEECH,normalizeSpeechOptions,finishNarration} from '../assets/video-studio-free-core.js';

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

test('Voice Director validates speech settings',()=>{
 assert.equal(normalizeSpeechOptions({}).voiceSpeed,DEFAULT_SPEECH.voiceSpeed);
 assert.equal(normalizeSpeechOptions({voiceSpeed:9}).voiceSpeed,1.2);
 assert.equal(normalizeSpeechOptions({voicePauseMs:5000}).voicePauseMs,1000);
 assert.equal(normalizeSpeechOptions({voiceNormalize:false}).voiceNormalize,false);
});
test('Narration mastering creates real pauses, tail and fades',()=>{
 const samples=finishNarration([new Float32Array(1000).fill(.2),new Float32Array(500).fill(-.2)],1000,
 {voicePauseMs:400,voiceTailMs:450,voiceNormalize:false}).samples;
 assert.equal(samples.length,2350);
 assert.ok(samples[0]<.02);
 assert.equal(samples[999],.2);
 assert.equal(samples[1300],0);
 assert.equal(samples[1900],0);
 assert.ok(Math.abs(samples[1899])<.02);
 const a=finishNarration([new Float32Array(500).fill(.07)],1000,{voiceNormalize:true,voiceTailMs:0}).samples;
 const b=finishNarration([new Float32Array(500).fill(.07)],1000,{voiceNormalize:false,voiceTailMs:0}).samples;
 assert.ok(a[200]>b[200]);
 assert.ok(a.every(n=>Math.abs(n)<=.9));
});
