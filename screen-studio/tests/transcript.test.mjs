import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attachWordTimings,correctCaption,correctOccurrences,editWordRange,EditHistory,webvtt} from '../transcript.mjs';
import {planEdits} from '../edit.mjs';
import {RecorderClock} from '../recorder-clock.mjs';
const fixture = () => [{start:0,end:4,text:'Hello wrong world again.',action:'keep',words:[{text:'Hello',start:.2,end:.6},{text:'wrong',start:.8,end:1.2},{text:'world',start:1.4,end:2},{text:'again.',start:2.5,end:3}]}];
test('word trimming removes only the selected time range and preserves adjacent audio',()=>{
  const result=editWordRange(fixture(),{first:{segment:0,word:1},last:{segment:0,word:2}},'cut');
  assert.deepEqual(result.map(s=>[s.start,s.end,s.text,s.action]),[[0,.8,'Hello','keep'],[.8,2,'wrong world','cut'],[2,4,'again.','keep']]);
  const plan=planEdits(result,4);assert.deepEqual(plan.parts.map(s=>[s.start,s.end]),[[0,.8],[2,4]]);assert.equal(plan.captions[1].start,.8);
});
test('replacement spans selected words across segments and keeps outside words',()=>{
  const segments=[...fixture(),{start:4,end:6,text:'Next step.',action:'keep',words:[{text:'Next',start:4.2,end:4.7},{text:'step.',start:5,end:5.5}]}];
  const result=editWordRange(segments,{first:{segment:0,word:3},last:{segment:1,word:0}},'replace','Updated instructions');
  assert.deepEqual(result.map(s=>[s.start,s.end,s.text,s.action]),[[0,2.5,'Hello wrong world','keep'],[2.5,4.7,'Updated instructions','replace'],[4.7,6,'step.','keep']]);
  assert.throws(()=>editWordRange(result,{first:{segment:0,word:2},last:{segment:2,word:0}},'cut'),/existing edit/);
});
test('word correction preserves timings and only matches whole words',()=>{
  const sample=[{...fixture()[0],text:'Loom loom blooming LOOM.'}];const all=correctOccurrences(sample,'loom','Studio');assert.equal(all.changed,3);assert.equal(all.segments[0].text,'Studio Studio blooming Studio.');assert.equal(all.segments[0].action,'keep');
  assert.equal(correctOccurrences(sample,'loom','Studio',false).changed,1);
  assert.equal(correctCaption(fixture()[0],'Hello correct world again.').words[1].start,.8);
  assert.deepEqual(correctCaption(fixture()[0],'Changed number of words here.').words,[]);
  assert.equal(correctOccurrences([{text:'a+b a+b',action:'keep'}],'a+b','x').segments[0].text,'x x');
});
test('provider timing alignment rejects fabricated timestamps and clamps recording boundaries',()=>{
  const result=attachWordTimings([{start:0,end:5,text:'Hello world.'}],[{word:'Hello',start:.1,end:.6},{word:'world.',start:1,end:2}],4);
  assert.equal(result[0].end,4);assert.equal(result[0].words.length,2);
  assert.deepEqual(attachWordTimings([{start:0,end:2,text:'Hello world.'}],[{word:'wrong',start:.1,end:.6}],2)[0].words,[]);
});
test('undo and redo restore edits without mutating snapshots',()=>{
  const history=new EditHistory();const original=fixture();history.push(original);const next=correctCaption(original[0],'Hello correct world again.');const restored=history.undo([next]);assert.equal(restored[0].text,original[0].text);restored[0].text='mutation';assert.equal(history.redo(restored)[0].text,next.text);
  history.push(fixture());assert.equal(history.redoStack.length,0);
});
test('recording timeline excludes multiple pauses and resets for restarts',()=>{
  let now=1000;const clock=new RecorderClock(()=>now);now=3000;clock.pause();now=15000;assert.equal(clock.seconds(),2);clock.resume();now=16000;assert.equal(clock.seconds(),3);clock.pause();now=20000;clock.resume();now=22000;assert.equal(clock.seconds(),5);clock.reset();assert.equal(clock.seconds(),0);
});
test('browser caption preview uses WebVTT timestamps and escapes markup',()=>{
  assert.equal(webvtt([{start:.2,end:1.5,text:'hello <b>world</b>'}]),'WEBVTT\n\n00:00:00.200 --> 00:00:01.500\nhello bworld/b\n');
});
