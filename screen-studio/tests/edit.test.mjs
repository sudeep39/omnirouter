import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planEdits,validateSegments,tempoFilter,srt} from '../edit.mjs';
test('cuts shift captions while preserving untranscribed screen footage',()=>{
  const plan=planEdits([{start:1,end:2,text:'Hello',action:'keep'},{start:3,end:5,text:'Remove',action:'cut'},{start:6,end:7,text:'Replaced',action:'replace'}],8);
  assert.deepEqual(plan.parts.map(p=>[p.start,p.end,p.action]),[[0,1,'keep'],[1,2,'keep'],[2,3,'keep'],[5,6,'keep'],[6,7,'replace'],[7,8,'keep']]);
  assert.deepEqual(plan.captions,[{start:1,end:2,text:'Hello'},{start:4,end:5,text:'Replaced'}]);
});
test('invalid edit boundaries and empty replacements are rejected',()=>{
  for(const segments of [[{start:-1,end:1,text:'x',action:'keep'}],[{start:0,end:11,text:'x',action:'cut'}],[{start:0,end:2,text:'x',action:'keep'},{start:1,end:3,text:'x',action:'keep'}],[{start:0,end:1,text:'',action:'replace'}]])assert.throws(()=>validateSegments(segments,10));
  assert.throws(()=>planEdits([{start:0,end:10,text:'',action:'cut'}],10));
});
test('tempo chains stay within FFmpeg supported bounds',()=>{
  for(const ratio of [.1,.5,1,2,8]){const values=tempoFilter(ratio).split(',').map(s=>Number(s.split('=')[1]));assert.ok(values.every(v=>v>=.5&&v<=2));assert.ok(Math.abs(values.reduce((a,b)=>a*b,1)-ratio)<1e-7);}
});
test('captions produce valid millisecond timestamps and neutralize extra cue lines',()=>{
  assert.equal(srt([{start:61.234,end:62.999,text:'hello\nworld -->'}]),'1\n00:01:01,234 --> 00:01:02,999\nhello world →\n');
});
