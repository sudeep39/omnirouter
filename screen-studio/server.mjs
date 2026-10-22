import http from 'node:http';
import {readFile, writeFile, mkdir, stat, unlink} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import {planEdits, tempoFilter, srt} from './edit.mjs';
import {attachWordTimings} from './transcript.mjs';
import {parseSilences,silenceOptions} from './cleanup.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const data = path.join(root,'recordings'); await mkdir(data,{recursive:true});
const port = Number(process.env.PORT || 4310);
const run = (binary, args, collectStderr=false) => new Promise((resolve,reject) => {
  const child = spawn(binary,args,{windowsHide:true}); let out = ''; let err = '';
  const timer = setTimeout(() => {child.kill(); reject(new Error('Media processing timed out.'));}, 30 * 60 * 1000);
  child.stdout.on('data',d => out += d); child.stderr.on('data',d => {err = collectStderr ? err+d : (err + d).slice(-6000);});
  child.on('error',e => {clearTimeout(timer); reject(e);});
  child.on('close',code => {clearTimeout(timer); code === 0 ? resolve(collectStderr?err:out) : reject(new Error(`Media processing failed: ${err.slice(-1800)}`));});
});
const probe = async file => JSON.parse(await run(process.env.FFPROBE_PATH || ffprobe.path,['-v','error','-show_format','-show_streams','-of','json',file]));
const encode = args => run(process.env.FFMPEG_PATH || ffmpeg,['-y', ...args]);
const mediaDuration = info => {
  const video=info.streams.find(s=>s.codec_type==='video');
  if(video&&Number.isFinite(Number(video.duration)))return Number(video.duration);
  const tag=video?.tags?.DURATION?.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if(tag)return Number(tag[1])*3600+Number(tag[2])*60+Number(tag[3])-(Number(video.start_time)||0);
  return Number(info.format.duration);
};
const idPath = id => {if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid recording ID.'); return path.join(data,id);};
async function body(req, limit = 1024 * 1024) {let size = 0; const chunks = []; for await (const chunk of req) {size += chunk.length; if (size > limit) throw new Error('Upload exceeds size limit.'); chunks.push(chunk);} return Buffer.concat(chunks);}
async function ai(endpoint, payload, multipart = false) {
  if (!process.env.OPENAI_API_KEY) throw new Error('Set OPENAI_API_KEY in screen-studio/.env and restart the server to enable AI.');
  const response = await fetch(`https://api.openai.com/v1/audio/${endpoint}`,{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,...(multipart ? {} : {'Content-Type':'application/json'})},body:multipart ? payload : JSON.stringify(payload),signal:AbortSignal.timeout(180000)});
  if (!response.ok) {await response.text(); throw new Error(`AI provider returned HTTP ${response.status}. Check your key, billing, and model access.`);}
  return response;
}
let rendering = false;
export async function analyzeGaps(file, options={}) {
  const settings=silenceOptions(options),info=await probe(file),duration=mediaDuration(info);
  if(!Number.isFinite(duration))throw new Error('Recording duration is unavailable.');
  if(!info.streams.some(s=>s.codec_type==='audio'))throw new Error('This recording has no audio to analyze.');
  const log=await run(process.env.FFMPEG_PATH||ffmpeg,['-hide_banner','-nostats','-i',file,'-vn','-af',`silencedetect=noise=${settings.threshold}dB:d=${settings.minimum}`,'-f','null','-'],true);
  return {duration,candidates:parseSilences(log,duration,settings),settings};
}
export async function render(base, segments, voice, speechProvider = ai, cleanupCuts=[]) {
  const source = `${base}.webm`; const info = await probe(source);
  const duration = mediaDuration(info); if (!Number.isFinite(duration)) throw new Error('Video duration is unavailable.');
  const {parts, captions} = planEdits(segments,duration,cleanupCuts);
  if (parts.filter(p => p.action === 'replace').length > 10) throw new Error('Use at most 10 speech replacements per video.');
  const hasAudio = info.streams.some(s => s.codec_type === 'audio');
  const tag = randomUUID(); const work = path.join(path.dirname(base),tag); await mkdir(work);
  const files = [];
  for (let i=0; i<parts.length; i++) {
    const p = parts[i]; const length = p.end-p.start; const target = path.join(work,`${i}.mkv`);
    // Sub-frame retained intervals still need a picture. Read the preceding
    // frame for these intervals, while trimming audio at its exact start.
    const lead=length<1/30?Math.min(.05,p.start):0;
    const args = ['-ss',String(p.start-lead),'-t',String(length+lead+.04),'-i',source];
    let filter;
    if (p.action === 'replace') {
      const response = await speechProvider('speech',{model:'gpt-4o-mini-tts',voice,input:p.text,response_format:'wav'});
      const speech = path.join(work,`${i}.wav`); await writeFile(speech,Buffer.from(await response.arrayBuffer()));
      const speechInfo = await probe(speech); const ratio = Number(speechInfo.format.duration)/length;
      if (ratio > 3 || ratio < .33) throw new Error('Replacement text is too different in length. Shorten or expand it, or adjust segment timestamps.');
      args.push('-i',speech); filter = `[1:a]${tempoFilter(ratio)},apad,atrim=duration=${length},asetpts=PTS-STARTPTS[a]`;
    } else if (hasAudio) {filter = `[0:a]apad,atrim=start=${lead}:duration=${length},asetpts=PTS-STARTPTS[a]`;}
    else {args.push('-f','lavfi','-i','anullsrc=r=48000:cl=stereo'); filter = `[1:a]atrim=duration=${length},asetpts=PTS-STARTPTS[a]`;}
    args.push('-filter_complex',`[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2,setpts=PTS-STARTPTS[v];${filter}`,'-map','[v]','-map','[a]','-t',String(length),'-r','30','-c:v','libx264','-bf','0','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','pcm_s16le','-ar','48000','-ac','2',target);
    await encode(args); files.push(target);
  }
  // Generated filenames only; forward slashes work with FFmpeg on Windows.
  const list = path.join(work,'concat.txt'); await writeFile(list,files.map((f,i) => `file '${f.replaceAll('\\','/').replaceAll("'", "'\\''")}'\nduration ${parts[i].end-parts[i].start}`).join('\n'));
  const subtitles = path.join(work,'captions.srt'); const captionText = srt(captions); await writeFile(subtitles,captionText);
  const output = `${base}-${tag}.mp4`; const args = ['-f','concat','-safe','0','-i',list];
  if (captionText) args.push('-i',subtitles,'-map','0:v','-map','0:a','-map','1:0','-c:s','mov_text','-metadata:s:s:0','language=eng');
  args.push('-c:v','copy','-c:a','aac','-b:a','192k','-metadata',`comment=${parts.some(p=>p.action==='replace')?'Contains AI-generated replacement speech.':'Edited with Screen Studio.'}`,'-movflags','+faststart',output); await encode(args);
  return {filename:path.basename(output),captions,synthetic:parts.some(p=>p.action==='replace')};
}
export const server = http.createServer(async (req,res) => {
  const json = (value,status=200) => {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(value));};
  try {
    if (!['localhost:'+port,'127.0.0.1:'+port].includes(req.headers.host)) return json({error:'Invalid host'},403);
    if (req.headers.origin && ![`http://localhost:${port}`,`http://127.0.0.1:${port}`].includes(req.headers.origin)) return json({error:'Invalid origin'},403);
    const url = new URL(req.url,`http://localhost:${port}`);
    if (req.method === 'GET' && url.pathname === '/api/status') return json({ai:!!process.env.OPENAI_API_KEY});
    if (req.method === 'POST' && url.pathname === '/api/recordings') {
      const id = randomUUID(); const base = idPath(id); const bytes = await body(req,500*1024*1024); await writeFile(`${base}.upload`,bytes);
      try {
        // MediaRecorder WebM often has no duration/cues. Remux to finalize both.
        await encode(['-i',`${base}.upload`,'-map','0:v:0','-map','0:a?','-c','copy',`${base}.webm`]);
        const info = await probe(`${base}.webm`); if (!info.streams.some(s => s.codec_type==='video')) throw new Error('Upload must contain video.'); return json({id,duration:mediaDuration(info)});
      } finally {await unlink(`${base}.upload`).catch(()=>{});}
    }
    if (req.method === 'POST' && url.pathname === '/api/transcribe') {
      const {id,language='en'} = JSON.parse(await body(req)); const base = idPath(id);
      if (!['en','es','fr','de','pt','hi','ja','auto'].includes(language)) throw new Error('Unsupported transcription language.');
      const info = await probe(`${base}.webm`);
      if (!info.streams.some(s=>s.codec_type==='audio')) throw new Error('This recording has no audio to transcribe.');
      await encode(['-i',`${base}.webm`,'-vn','-ac','1','-ar','16000','-c:a','libmp3lame',`${base}.mp3`]);
      const audio = await readFile(`${base}.mp3`); if(audio.length>24*1024*1024) throw new Error('Recording is too long for this transcription request.');
      const form = new FormData(); form.append('file',new Blob([audio],{type:'audio/mpeg'}),'recording.mp3'); form.append('model','whisper-1'); form.append('response_format','verbose_json'); form.append('timestamp_granularities[]','segment'); form.append('timestamp_granularities[]','word');
      if(language!=='auto')form.append('language',language);
      const result = await (await ai('transcriptions',form,true)).json(); return json({segments:attachWordTimings(result.segments||[],result.words||[],mediaDuration(info)),language:result.language});
    }
    if (req.method === 'POST' && url.pathname === '/api/analyze-gaps') {
      const {id,...options}=JSON.parse(await body(req));const base=idPath(id);
      return json(await analyzeGaps(`${base}.webm`,options));
    }
    if (req.method === 'POST' && url.pathname === '/api/render') {
      if (rendering) return json({error:'Another render is running. Please wait.'},409);
      const {id,segments,voice='coral',cleanupCuts=[]} = JSON.parse(await body(req));
      if (!['coral','alloy','sage'].includes(voice)) throw new Error('Unsupported voice.');
      const base = idPath(id); rendering = true;
      try {return json(await render(base,segments,voice,ai,cleanupCuts));} finally {rendering=false;}
    }
    if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
      const name = url.pathname.slice(7); if (!/^[a-f0-9-]+\.(webm|mp4)$/.test(name)) return json({error:'Not found'},404);
      const file = path.join(data,name); const meta = await stat(file); const type = name.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      if (range) {const start=Number(range[1]); const end=Math.min(range[2]?Number(range[2]):meta.size-1,meta.size-1); if(start>end) {res.writeHead(416,{'Content-Range':`bytes */${meta.size}`}); return res.end();} res.writeHead(206,{'Content-Type':type,'Content-Range':`bytes ${start}-${end}/${meta.size}`,'Accept-Ranges':'bytes','Content-Length':end-start+1}); return createReadStream(file,{start,end}).pipe(res);}
      res.writeHead(200,{'Content-Type':type,'Content-Length':meta.size,'Accept-Ranges':'bytes'}); return createReadStream(file).pipe(res);
    }
    const pages = {'/':'index.html','/app.js':'app.js','/style.css':'style.css','/edit.mjs':'edit.mjs','/transcript.mjs':'transcript.mjs','/recorder-clock.mjs':'recorder-clock.mjs','/ticker.js':'ticker.js','/cleanup.mjs':'cleanup.mjs','/teleprompter.mjs':'teleprompter.mjs','/studio-ui.mjs':'studio-ui.mjs'};
    if(req.method === 'GET' && pages[url.pathname]) {res.writeHead(200,{'Content-Type':url.pathname.endsWith('.css')?'text/css':url.pathname==='/'?'text/html':'text/javascript'}); return res.end(await readFile(path.join(root,pages[url.pathname])));}
    json({error:'Not found'},404);
  } catch(e) {json({error:e.code==='ENOENT'?'Recording not found.':e.message},400);}
});
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) server.listen(port,'127.0.0.1',()=>console.log(`Screen Studio: http://localhost:${port}`));
