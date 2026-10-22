import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeRanges,cleanupRanges,parseSilences,protectGapCandidates,findFillers,silenceOptions} from '../cleanup.mjs';
import {planEdits} from '../edit.mjs';
const segment=(words,action='keep')=>({start:0,end:6,text:words.map(w=>w.text).join(' '),words,action});
test('silence detection parses multiple gaps, handles trailing silence, and keeps edge padding',()=>{
  const log='silence_start: 0\nsilence_end: 1.5 | silence_duration: 1.5\nsilence_start: 4\n';
  const ranges=parseSilences(log,6,{minimum:1,padding:.12});assert.deepEqual(ranges.map(r=>[r.start,r.end]),[[.12,1.38],[4.12,5.88]]);
  assert.deepEqual(parseSilences('silence_start: 1\nsilence_end: 1.3',6),[]);
  assert.throws(()=>silenceOptions({minimum:.2,padding:.12}),/padding/);
  assert.throws(()=>silenceOptions({threshold:0}),/threshold/);
});
test('gap suggestions protect known words, manual cuts, and synthetic replacement audio',()=>{
  const segments=[{start:0,end:4,action:'keep',words:[{text:'quiet',start:1.5,end:2}]},{start:4,end:5,action:'replace',text:'new'},{start:5,end:6,action:'cut',text:'cut'}];
  const safe=protectGapCandidates([{start:1,end:6,kind:'gap'}],segments,6);
  assert.deepEqual(safe.map(r=>[r.start,r.end]),[[1,1.46],[2.04,4]]);
});
test('basic filler removal recognizes punctuation and preserves meaningful words',()=>{
  const words=['Um,','Hello','actually','uh','human','world.'].map((text,i)=>({text,start:i,end:i+.4}));
  assert.deepEqual(findFillers([segment(words)]).map(c=>c.text),['Um,','uh']);
  assert.deepEqual(findFillers([segment(words)],{preset:'extended'}).map(c=>c.text),['Um,','actually','uh']);
  assert.deepEqual(findFillers([segment(words,'replace')]),[]);
});
test('filler phrases and immediate repeats require adjacent timed words',()=>{
  const words=[{text:'you',start:0,end:.2},{text:'know,',start:.25,end:.45},{text:'the',start:.5,end:.7},{text:'the',start:.75,end:.95},{text:'you',start:2,end:2.2},{text:'know',start:4,end:4.2}];
  const found=findFillers([segment(words)],{preset:'custom',custom:'you know',repeats:true});assert.deepEqual(found.map(c=>[c.text,c.start,c.end]),[['you know,',0,.45],['the',.5,.7]]);
  assert.throws(()=>findFillers([segment(words)],{preset:'custom',custom:''}),/Enter/);
});
test('cleanup overlay merges overlap, shifts captions, and does not mutate the baseline transcript',()=>{
  const words=[{text:'Hello',start:.2,end:.6},{text:'um',start:.8,end:1},{text:'world',start:3.2,end:3.7}];const segments=[segment(words)];const before=structuredClone(segments);
  const candidates=[{start:.8,end:1,kind:'filler'},{start:1.2,end:2.8,kind:'gap'},{start:1.5,end:2,kind:'gap'},{start:4,end:5,selected:false}];
  const cuts=cleanupRanges(candidates,segments,6);assert.deepEqual(cuts,[{start:.8,end:1},{start:1.2,end:2.8}]);
  const plan=planEdits(segments,6,cuts);assert.deepEqual(segments,before);assert.ok(!plan.captions.some(s=>s.text.includes('um')));assert.ok(plan.captions.some(s=>s.text==='world'));assert.ok(Math.abs(plan.parts.reduce((sum,p)=>sum+p.end-p.start,0)-4.2)<1e-8);
});
test('cleanup leaves prior replacements and cuts intact and prevents invalid exports',()=>{
  const segments=[{start:0,end:1,text:'new',action:'replace'},{start:1,end:2,text:'old',action:'cut'}];
  assert.deepEqual(cleanupRanges([{start:.5,end:3}],segments,4),[{start:2,end:3}]);
  assert.throws(()=>planEdits(segments,4,[{start:.5,end:1.5}]),/replacement speech/);
  assert.throws(()=>planEdits([],4,[{start:0,end:4}]),/must remain/);
  assert.throws(()=>mergeRanges([{start:-1,end:2}],4),/inside/);
});
