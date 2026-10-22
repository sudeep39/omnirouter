import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import {render,analyzeGaps} from '../server.mjs';
import {findFillers,cleanupRanges,protectGapCandidates} from '../cleanup.mjs';
const run=(bin,args)=>new Promise((resolve,reject)=>{const p=spawn(bin,args,{windowsHide:true});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',c=>c?reject(new Error(err)):resolve(out));});
test('real MP4 rendering cuts video, replaces audio, and embeds shifted captions',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'screen-studio-test-')); const base=path.join(dir,'fixture');
  try {
    await run(ffmpeg,['-y','-f','lavfi','-i','testsrc=size=320x180:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','4','-c:v','libvpx','-c:a','libopus',`${base}.webm`]);
    const silence=path.join(dir,'replacement.wav');await run(ffmpeg,['-y','-f','lavfi','-i','anullsrc=r=48000:cl=mono','-t','1.5',silence]);
    let calls=0;const fakeAI=async(endpoint,payload)=>{calls++;assert.equal(endpoint,'speech');assert.equal(payload.input,'Corrected words');return new Response(await readFile(silence));};
    const result=await render(base,[{start:0,end:1,text:'Opening',action:'keep'},{start:1,end:2,text:'Remove',action:'cut'},{start:2,end:3,text:'Corrected words',action:'replace'}],'coral',fakeAI);
    const output=path.join(dir,result.filename);const info=JSON.parse(await run(ffprobe.path,['-v','error','-show_format','-show_streams','-of','json',output]));
    assert.equal(calls,1);assert.equal(result.synthetic,true);assert.ok(Math.abs(Number(info.format.duration)-3)<.15);assert.ok(info.streams.some(s=>s.codec_name==='h264'));assert.ok(info.streams.some(s=>s.codec_name==='aac'));assert.ok(info.streams.some(s=>s.codec_name==='mov_text'));assert.match(info.format.tags.comment,/AI-generated/);
    assert.deepEqual(result.captions.map(s=>[s.start,s.end]),[[0,1],[1,2]]);
    // Replacement actually silences the source tone, while untouched audio survives.
    // Use a file for binary inspection instead of decoding bytes as text.
    const samples=path.join(dir,'samples.raw');await run(ffmpeg,['-y','-v','error','-ss','1.2','-t','0.5','-i',output,'-vn','-f','f32le','-ac','1','-ar','8000',samples]);
    const bytes=await readFile(samples);let energy=0;for(let i=0;i<bytes.length;i+=4)energy+=bytes.readFloatLE(i)**2;assert.ok(Math.sqrt(energy/(bytes.length/4))<.001);
    const before=path.join(dir,'before.raw');await run(ffmpeg,['-y','-v','error','-ss','0.2','-t','0.5','-i',output,'-vn','-f','f32le','-ac','1','-ar','8000',before]);const original=await readFile(before);energy=0;for(let i=0;i<original.length;i+=4)energy+=original.readFloatLE(i)**2;assert.ok(Math.sqrt(energy/(original.length/4))>.03);
    // A 10 ms retained interval still includes a picture and must not corrupt
    // the concatenation or introduce encoder padding at every audio join.
    const short=await render(base,[],'coral',undefined,[{start:1,end:1.2},{start:1.21,end:2}]);const shortFile=path.join(dir,short.filename);const shortInfo=JSON.parse(await run(ffprobe.path,['-v','error','-show_format','-show_streams','-of','json',shortFile]));assert.ok(Math.abs(Number(shortInfo.format.duration)-3.01)<.1);assert.ok(shortInfo.streams.some(s=>s.codec_type==='video'));await run(ffmpeg,['-v','error','-i',shortFile,'-f','null','-']);
  } finally {assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));await rm(dir,{recursive:true,force:true});}
});
test('real audio-gap and filler cleanup shortens MP4, keeps spoken audio, and retimes subtitles',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'screen-studio-cleanup-'));const base=path.join(dir,'fixture');
  try{
    await run(ffmpeg,['-y','-f','lavfi','-i','testsrc=size=320x180:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-af',"volume=0:enable='between(t,1,3)+between(t,4,5)'",'-t','6','-c:v','libvpx','-c:a','libopus',`${base}.webm`]);
    const detection=await analyzeGaps(`${base}.webm`,{minimum:.6,threshold:-35,padding:.1});assert.equal(detection.candidates.length,2);assert.ok(Math.abs(detection.candidates[0].start-1.1)<.08);assert.ok(Math.abs(detection.candidates[0].end-2.9)<.08);
    const words=[{text:'Hello',start:.2,end:.6},{text:'um',start:.7,end:.9},{text:'world',start:3.2,end:3.7},{text:'end',start:5.2,end:5.7}];
    const segments=[{start:0,end:6,text:'Hello um world end',action:'keep',words}];
    const gaps=protectGapCandidates(detection.candidates,segments,detection.duration);
    const cuts=cleanupRanges([...gaps,...findFillers(segments)],segments,detection.duration);
    const result=await render(base,segments,'coral',undefined,cuts);const output=path.join(dir,result.filename);
    const info=JSON.parse(await run(ffprobe.path,['-v','error','-show_format','-show_streams','-of','json',output]));
    const expected=detection.duration-cuts.reduce((sum,c)=>sum+c.end-c.start,0);
    assert.ok(Math.abs(Number(info.format.duration)-expected)<.15,`Rendered duration ${info.format.duration}; expected ${expected}; cuts ${JSON.stringify(cuts)}`);
    assert.ok(info.streams.some(s=>s.codec_name==='mov_text'));assert.ok(!result.captions.some(s=>s.text.split(' ').includes('um')));assert.ok(result.captions.some(s=>s.text==='world'&&s.start<2));
    const after=await analyzeGaps(output,{minimum:.5,threshold:-35,padding:.1});assert.equal(after.candidates.length,0);
    const samples=path.join(dir,'kept.raw');await run(ffmpeg,['-y','-v','error','-ss','0.2','-t','0.3','-i',output,'-vn','-f','f32le','-ac','1','-ar','8000',samples]);const bytes=await readFile(samples);let energy=0;for(let i=0;i<bytes.length;i+=4)energy+=bytes.readFloatLE(i)**2;assert.ok(Math.sqrt(energy/(bytes.length/4))>.03);
  }finally{assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));await rm(dir,{recursive:true,force:true});}
});
