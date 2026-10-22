import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ffmpeg from 'ffmpeg-static';
const root=fileURLToPath(new URL('../',import.meta.url));
const data=path.join(root,'recordings');
const run=args=>new Promise((resolve,reject)=>{const p=spawn(ffmpeg,args,{windowsHide:true});let err='';p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',c=>c?reject(new Error(err)):resolve());});
test('local API uploads, renders silent video to MP4, serves ranges, and rejects cross-origin writes',async()=>{
  process.env.PORT='4318';const {server}=await import('../server.mjs');
  const dir=await mkdtemp(path.join(tmpdir(),'screen-studio-api-'));const port=Number(process.env.PORT);const base=`http://127.0.0.1:${port}`;let id,output,gapId;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  try {
    assert.equal((await fetch(base+'/')).status,200);
    const hostile=await fetch(base+'/api/render',{method:'POST',headers:{Origin:'https://example.org','Content-Type':'application/json'},body:'{}'});assert.equal(hostile.status,403);
    const source=path.join(dir,'silent.webm');await run(['-y','-f','lavfi','-i','testsrc=size=160x90:rate=30','-t','1','-c:v','libvpx',source]);
    const uploaded=await fetch(base+'/api/recordings',{method:'POST',body:await readFile(source)});assert.equal(uploaded.status,200);const uploadedBody=await uploaded.json();id=uploadedBody.id;assert.ok(Number.isFinite(uploadedBody.duration));
    const noAudio=await fetch(base+'/api/analyze-gaps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});assert.equal(noAudio.status,400);assert.match((await noAudio.json()).error,/no audio/);
    const invalidOptions=await fetch(base+'/api/analyze-gaps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,threshold:0})});assert.equal(invalidOptions.status,400);
    const response=await fetch(base+'/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,segments:[]})});assert.equal(response.status,200);output=(await response.json()).filename;
    const media=await fetch(base+'/media/'+output,{headers:{Range:'bytes=0-99'}});assert.equal(media.status,206);assert.equal((await media.arrayBuffer()).byteLength,100);assert.equal(media.headers.get('content-type'),'video/mp4');
    const invalid=await fetch(base+'/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,segments:[{start:0,end:5,text:'bad',action:'cut'}]})});assert.equal(invalid.status,400);
    const invalidCuts=await fetch(base+'/api/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,segments:[],cleanupCuts:[{start:0,end:5}]})});assert.equal(invalidCuts.status,400);
    const audio=path.join(dir,'gaps.webm');await run(['-y','-f','lavfi','-i','testsrc=size=160x90:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-af',"volume=0:enable='between(t,1,2.5)'",'-t','3','-c:v','libvpx','-c:a','libopus',audio]);
    const gapUpload=await fetch(base+'/api/recordings',{method:'POST',body:await readFile(audio)});gapId=(await gapUpload.json()).id;
    const analysis=await fetch(base+'/api/analyze-gaps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:gapId,minimum:.6,padding:.1})});assert.equal(analysis.status,200);const analyzed=await analysis.json();assert.equal(analyzed.candidates.length,1);assert.ok(analyzed.candidates[0].start>1&&analyzed.candidates[0].end<2.5);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    if(id)await unlink(path.join(data,`${id}.webm`)).catch(()=>{});
    if(gapId)await unlink(path.join(data,`${gapId}.webm`)).catch(()=>{});
    if(output){await unlink(path.join(data,output)).catch(()=>{});const tag=output.slice(37,-4);const work=path.resolve(data,tag);assert.ok(work.startsWith(path.resolve(data)+path.sep));await rm(work,{recursive:true,force:true});}
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep));await rm(dir,{recursive:true,force:true});
  }
});
