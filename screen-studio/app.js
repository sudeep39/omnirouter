import {createStudioUI} from './studio-ui.mjs';
import {createTeleprompter} from './teleprompter.mjs';
import {srt, planEdits} from './edit.mjs';
import {correctCaption, correctOccurrences, editWordRange, EditHistory, webvtt} from './transcript.mjs';
import {RecorderClock} from './recorder-clock.mjs';
import {cleanupRanges,protectGapCandidates,findFillers} from './cleanup.mjs';

const $ = id => document.getElementById(id);
const prompter = createTeleprompter($('teleprompter'));
const studioUI = createStudioUI();
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const clock = new RecorderClock();
let state = 'ready', busy = false, screen, presenter, audioContext, mixed, recorder, recognizer, ticker, timer;
let recordingDuration = 0, blob, originalURL, id, output, segments = [], baseline = [], finalCaptions = [];
let synthetic = false, aiEnabled = false, speechStart = 0, recognitionStopped = false, disposition = 'save';
let history = new EditHistory(), selection = null, anchor = null, trackURL = null, hasRecordedAudio = false;
let cleanupCandidates = [];
let playbackIsOriginal = true, previewEnd = null, previewing = false, drag = false, captionTrack = null;
let bubble = {x: 136, y: 584, radius: 112};
try { const saved = JSON.parse(localStorage.getItem('screen-studio-bubble')); if (saved && ['x','y','radius'].every(k => Number.isFinite(saved[k]))) bubble = saved; } catch {}
$('bubble-size').value = Math.min(160, Math.max(64, bubble.radius));
const active = () => ['recording', 'paused', 'stopping'].includes(state);
const editable = () => !!blob && !active() && !busy;
const notify = message => {$('status').textContent = message;};
const elapsed = () => clock.seconds();
const stamp = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const ordered = (a, b) => a.segment < b.segment || (a.segment === b.segment && a.word <= b.word);

function updateControls() {
  prompter.sync(state);
  const recording = active(), canEdit = editable(), mode = $('mode').value;
  $('record').disabled = busy || recording;
  ['stop','pause','restart','cancel'].forEach(k => $(k).disabled = busy || !['recording','paused'].includes(state));
  $('pause').textContent = state === 'paused' ? 'Resume' : 'Pause';
  ['mode','mic','system','camera-device','mic-device','devices','language','auto-transcribe','use-speaker-notes'].forEach(k => $(k).disabled = busy || recording);
  if (!recording) { $('system').disabled = busy || mode === 'camera'; $('camera-device').disabled = busy || mode === 'screen'; $('mic-device').disabled = busy || !$('mic').checked; }
  ['bubble-position','bubble-size','hide-camera'].forEach(k => $(k).disabled = busy || mode !== 'screen-camera');
  ['add','reset','apply','captions','correct-one','correct-all','find','correction'].forEach(k => $(k).disabled = !canEdit);
  $('transcribe').disabled = !canEdit || !id || !aiEnabled || !hasRecordedAudio;
  $('original').disabled = !canEdit; $('download').disabled = busy || !output;
  $('voice').disabled = busy || recording;
  $('undo').disabled = !canEdit || !history.undoStack.length; $('redo').disabled = !canEdit || !history.redoStack.length;
  ['trim-selection','clear-selection'].forEach(k => $(k).disabled = !canEdit || !selection);
  $('replace-selection').disabled = !canEdit || !selection || !aiEnabled;
  $('save-replacement').disabled = !canEdit || !selection || !aiEnabled;
  $('replacement-text').disabled = !canEdit;
  ['gap-minimum','gap-threshold','gap-padding','filler-preset','custom-fillers','filler-repeats','scan-fillers'].forEach(k=>$(k).disabled=!canEdit);
  $('scan-gaps').disabled=!canEdit||!id||!hasRecordedAudio;
  $('clear-cleanup').disabled=!canEdit||!cleanupCandidates.length;
  document.querySelectorAll('#cleanup-candidates input,#cleanup-candidates button').forEach(el=>el.disabled=!canEdit);
  document.querySelectorAll('.segment input,.segment textarea,.segment select,.segment button').forEach(el => el.disabled = !canEdit);
  studioUI.sync(state,!!blob,busy);
  $('phase').textContent = busy ? 'Processing…' : state === 'recording' ? '● Recording' : state === 'paused' ? 'Paused' : state === 'ready' ? 'Ready to record' : 'Ready to edit';
}
function invalidate() {
  output = null; finalCaptions = []; $('download').disabled = true;
  $('export-note').textContent = 'Apply changes to save and preview your edited MP4.'; clearPreview();
  if(blob&&originalURL){$('playback').pause();$('playback').src=originalURL;playbackIsOriginal=true;setCaptions(segments.filter(s=>s.action!=='cut'));}
}
function clearPreview() { previewEnd = null; previewing = false; }
function change(next, {remember = true} = {}) {
  if (remember) history.push(editSnapshot());
  segments = next; selection = null; anchor = null; $('replacement-editor').hidden = true;
  invalidate(); renderSegments();
}
function editSnapshot(){return {segments:structuredClone(segments),cleanupCandidates:structuredClone(cleanupCandidates)};}
function restoreSnapshot(snapshot){cleanupCandidates=snapshot.cleanupCandidates;change(snapshot.segments,{remember:false});}
function activeCleanupCuts(){return cleanupRanges(cleanupCandidates,segments,recordingDuration);}
function selectionWords() {
  if (!selection) return [];
  const result = [];
  segments.forEach((s, si) => s.words?.forEach((w, wi) => {
    const point = {segment: si, word: wi};
    if (ordered(selection.first, point) && ordered(point, selection.last)) result.push(w);
  })); return result;
}
function updateSelection() {
  document.querySelectorAll('.word').forEach(el => {
    const point = {segment: Number(el.dataset.segment), word: Number(el.dataset.word)};
    const selected = !!selection && ordered(selection.first, point) && ordered(point, selection.last);
    el.classList.toggle('selected', selected); el.setAttribute('aria-pressed', String(selected));
  });
  const words = selectionWords();
  $('selection-note').textContent = words.length ? `Selected ${words.length} word${words.length === 1 ? '' : 's'}: “${words.map(w => w.text).join(' ')}”` : 'Select timed words after AI transcription to trim or replace a phrase.';
  updateControls();
}
function chooseWord(point, extend) {
  if (extend && anchor) selection = ordered(anchor, point) ? {first: anchor, last: point} : {first: point, last: anchor};
  else {anchor = point; selection = {first: point, last: point};}
  $('replacement-editor').hidden = true; updateSelection();
  const word = segments[point.segment].words[point.word];
  previewOriginal(word.start, null, false).catch(e => notify(e.message));
}
function renderSegments() {
  const scroll = $('segments').scrollTop; $('segments').replaceChildren();
  if (!segments.length) {const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = state === 'recording' ? 'Listening…' : 'No transcript yet. Regenerate with AI or add timed segments manually.'; $('segments').append(empty);}
  segments.forEach((segment, index) => {
    const row = document.createElement('div'); row.className = `segment ${segment.action === 'cut' ? 'cut' : ''}`; row.dataset.index = index;
    const head = document.createElement('div'); head.className = 'segment-head';
    const timestamp = document.createElement('button'); timestamp.textContent = `${stamp(segment.start)}–${stamp(segment.end)}`; timestamp.className = 'timestamp'; timestamp.setAttribute('aria-label', `Preview segment ${index + 1}`);
    timestamp.onclick = () => previewOriginal(segment.start, segment.end).catch(e => notify(e.message)); head.append(timestamp);
    const actionLabel = document.createElement('span'); actionLabel.className = 'action-label'; actionLabel.textContent = segment.action === 'cut' ? 'Trimmed' : segment.action === 'replace' ? 'AI speech' : 'Original audio'; head.append(actionLabel); row.append(head);
    if (segment.words?.length && segment.action === 'keep') {
      const words = document.createElement('div'); words.className = 'word-list';
      segment.words.forEach((word, wi) => {const button = document.createElement('button'); button.className = 'word'; button.textContent = word.text; button.dataset.segment = index; button.dataset.word = wi; button.dataset.start = word.start; button.dataset.end = word.end; button.setAttribute('aria-label', `Select ${word.text} at ${word.start.toFixed(2)} seconds`); button.onclick = e => chooseWord({segment: index, word: wi}, e.shiftKey); words.append(button, document.createTextNode(' '));}); row.append(words);
    } else {const text = document.createElement('p'); text.className = 'segment-text'; text.textContent = segment.text || '(No caption text)'; row.append(text);}
    const correction = document.createElement('details'); correction.className = 'segment-details'; const summary = document.createElement('summary'); summary.textContent = 'Correct captions / segment controls'; correction.append(summary);
    const text = document.createElement('textarea'); text.value = segment.text; text.setAttribute('aria-label', `Transcript segment ${index + 1}`);
    text.onchange = () => {if (text.value !== segment.text) {const next = structuredClone(segments); next[index] = correctCaption(segment, text.value); change(next);}}; correction.append(text);
    const timing = document.createElement('div'); timing.className = 'segment-head';
    for (const key of ['start','end']) {
      const label = document.createElement('label'); label.textContent = key === 'start' ? 'From' : 'To'; const input = document.createElement('input'); input.type = 'number'; input.step = '.01'; input.min = '0'; input.value = segment[key].toFixed(2); input.setAttribute('aria-label', `${key} seconds for segment ${index + 1}`);
      input.onchange = () => {const next = structuredClone(segments); next[index][key] = Number(input.value); next[index].words = []; change(next);}; label.append(input); timing.append(label);
    }
    const action = document.createElement('select'); action.setAttribute('aria-label', `Action for segment ${index + 1}`);
    for (const [value, title] of [['keep','Captions only · keep audio'],['replace','AI speech · replace audio'],['cut','Trim segment · remove audio + video']]) action.add(new Option(title,value));
    action.value = segment.action; action.onchange = () => {const next = structuredClone(segments); next[index].action = action.value; change(next);}; correction.append(timing, action); row.append(correction); $('segments').append(row);
  }); $('segments').scrollTop = scroll; updateSearch(); updateSelection();renderCleanup();
}
function updateSearch() {
  const query = $('find').value.trim().toLocaleLowerCase(); let count = 0;
  document.querySelectorAll('.segment').forEach(row => {const matches = !!query && segments[Number(row.dataset.index)].text.toLocaleLowerCase().includes(query); row.classList.toggle('search-match', matches); if (matches) count++;});
  $('matches').textContent = query ? `${count} matching segment${count === 1 ? '' : 's'}` : '';
}
function renderCleanup(){
  $('cleanup-candidates').replaceChildren();let cuts=[];
  try{cuts=activeCleanupCuts();}catch(e){$('cleanup-summary').textContent=e.message;return;}
  const seconds=cuts.reduce((sum,c)=>sum+c.end-c.start,0);
  $('cleanup-summary').textContent=cuts.length?`${cuts.length} cut${cuts.length===1?'':'s'} selected · ${seconds.toFixed(2)} seconds shorter after applying.`:'No cleanup cuts selected.';
  cleanupCandidates.forEach((candidate,index)=>{
    const row=document.createElement('div');row.className='cleanup-candidate';const label=document.createElement('label');
    const input=document.createElement('input');input.type='checkbox';input.checked=candidate.selected!==false;input.setAttribute('aria-label',`Remove ${candidate.kind} at ${candidate.start.toFixed(2)} seconds`);
    input.onchange=()=>{history.push(editSnapshot());candidate.selected=input.checked;invalidate();renderCleanup();};
    const text=document.createElement('span');text.textContent=`${candidate.kind==='gap'?'Gap':'Filler'} ${candidate.start.toFixed(2)}–${candidate.end.toFixed(2)}s · ${candidate.text}`;
    label.append(input,text);const preview=document.createElement('button');preview.textContent='▶';preview.setAttribute('aria-label',`Preview cleanup suggestion ${index+1}`);preview.onclick=()=>previewOriginal(Math.max(0,candidate.start-.15),Math.min(recordingDuration,candidate.end+.15)).catch(e=>notify(e.message));
    row.append(label,preview);$('cleanup-candidates').append(row);
  });
  document.querySelectorAll('.word').forEach(el=>el.classList.toggle('cleanup-cut',cuts.some(c=>c.start<Number(el.dataset.end)-.00001&&c.end>Number(el.dataset.start)+.00001)));
  updateControls();
}
function stageCleanup(kind,candidates){
  const next=[...cleanupCandidates.filter(c=>c.kind!==kind),...candidates].sort((a,b)=>a.start-b.start);
  if(next.length>500)throw new Error('More than 500 cleanup suggestions. Increase the minimum gap duration or use a narrower filler list.');
  cleanupRanges(next,segments,recordingDuration);
  history.push(editSnapshot());cleanupCandidates=next;invalidate();renderCleanup();
  notify(candidates.length?`${candidates.length} ${kind==='gap'?'audio gap':'filler'} suggestion${candidates.length===1?'':'s'} ready. Preview or deselect cuts, then apply changes.`:`No ${kind==='gap'?'audio gaps':'matching timed filler words'} found. Adjust settings or review the transcript.`);
}
$('scan-gaps').onclick=()=>task(async()=>{
  notify('Analyzing recorded audio locally for quiet gaps…');
  const minimum=Number($('gap-minimum').value),padding=Number($('gap-padding').value);
  const result=await post('/api/analyze-gaps',{id,minimum,threshold:Number($('gap-threshold').value),padding});
  stageCleanup('gap',protectGapCandidates(result.candidates,segments,recordingDuration,Math.max(.02,minimum-2*padding)));
});
$('scan-fillers').onclick=()=>{
  try{
    if(!segments.some(s=>s.action==='keep'&&s.words?.length))throw new Error('Filler removal needs transcript word timestamps. Regenerate the transcript with AI first.');
    const candidates=findFillers(segments,{preset:$('filler-preset').value,custom:$('custom-fillers').value,repeats:$('filler-repeats').checked});
    stageCleanup('filler',candidates);
  }catch(e){notify(e.message);}
};
$('filler-preset').onchange=()=>{$('custom-fillers-label').hidden=$('filler-preset').value!=='custom';};
$('clear-cleanup').onclick=()=>{history.push(editSnapshot());cleanupCandidates=[];invalidate();renderCleanup();notify('Cleanup cuts cleared. Manual transcript edits are preserved.');};
async function api(url, options = {}) {const response = await fetch(url, options); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Request failed.'); return result;}
const post = (url, value) => api(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value)});
async function task(fn) {if (busy) return; busy = true; updateControls(); try {await fn();} catch (e) {notify(e.message);} finally {busy = false; updateControls();}}
function download(url, name) {const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();}
function cleanup() {
  ticker?.terminate(); ticker = null; clearInterval(timer); recognitionStopped = true;
  try {recognizer?.abort();} catch {}
  [screen, presenter, mixed].forEach(s => s?.getTracks().forEach(t => t.stop())); audioContext?.close().catch(() => {});
  $('live').pause(); $('live').srcObject = null; $('live').hidden = true;
}
async function videoFor(stream) {const v = document.createElement('video'); v.srcObject = stream; v.muted = true; v.playsInline = true; await v.play(); return v;}
function setCaptions(captions) {
  $('playback').querySelectorAll('track').forEach(t => t.remove()); if (trackURL) URL.revokeObjectURL(trackURL);
  trackURL = URL.createObjectURL(new Blob([webvtt(captions)], {type: 'text/vtt'}));
  const track = document.createElement('track'); track.kind = 'subtitles'; track.label = 'Transcript'; track.srclang = $('language').value === 'auto' ? 'en' : $('language').value; track.src = trackURL; track.default = true; captionTrack=track;track.onload=synchronizeCaptionTracks;$('playback').append(track);synchronizeCaptionTracks();
}
function synchronizeCaptionTracks(){for(const track of $('playback').textTracks)track.mode=captionTrack&&track===captionTrack.track?'showing':'disabled';}
$('playback').addEventListener('loadedmetadata',synchronizeCaptionTracks);
$('playback').addEventListener('loadeddata',synchronizeCaptionTracks);
$('playback').textTracks.addEventListener('addtrack',synchronizeCaptionTracks);
async function previewOriginal(start, end = null, play = true) {
  const v = $('playback'); clearPreview(); v.pause();
  if (!playbackIsOriginal || !v.getAttribute('src')) {
    v.src = originalURL; playbackIsOriginal = true; setCaptions(segments.filter(s => s.action !== 'cut'));
    await new Promise((resolve,reject) => {v.addEventListener('loadedmetadata', resolve, {once:true}); v.addEventListener('error', () => reject(new Error('Could not load original playback.')), {once:true});});
  }
  v.hidden = false; v.currentTime = start; previewEnd = end; previewing = end !== null;
  if (play) await v.play();
}
$('playback').ontimeupdate = () => {
  const time = $('playback').currentTime;
  if (previewing && previewEnd !== null && time >= previewEnd) {$('playback').pause(); clearPreview();}
  document.querySelectorAll('.word').forEach(el => el.classList.toggle('playing', playbackIsOriginal && time >= Number(el.dataset.start) && time < Number(el.dataset.end)));
};
function recognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition || !$('mic').checked || $('language').value === 'auto') {$('transcript-state').textContent = 'Transcript after recording'; return;}
  recognizer = new Recognition(); recognizer.continuous = true; recognizer.interimResults = true;
  recognizer.lang = {en:'en-US',es:'es-ES',fr:'fr-FR',de:'de-DE',pt:'pt-BR',hi:'hi-IN',ja:'ja-JP'}[$('language').value]; recognitionStopped = false; speechStart = elapsed();
  recognizer.onspeechstart = () => {speechStart = elapsed();};
  recognizer.onresult = e => {
    if (state !== 'recording') return; let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]; if (r.isFinal) {
        const end = elapsed(), start = Math.max(segments.at(-1)?.end || 0, Math.min(speechStart, end - .05));
        if (end > start) segments.push({start, end, text: r[0].transcript.trim(), action: 'keep', words: []});
        speechStart = end; renderSegments(); $('segments').scrollTop = $('segments').scrollHeight;
      } else interim += r[0].transcript;
    } $('interim').textContent = interim;
  };
  recognizer.onerror = e => {if (['not-allowed','service-not-allowed','audio-capture','network'].includes(e.error)) {recognitionStopped = true; $('transcript-state').textContent = 'Live transcript unavailable'; notify(`Recording continues. Speech recognition: ${e.error}. AI can transcribe after recording.`);}};
  recognizer.onend = () => {if (state === 'recording' && !recognitionStopped) {try {recognizer.start();} catch {}}};
  try {recognizer.start(); $('transcript-state').textContent = 'Live · approximate timing';} catch {recognitionStopped = true; $('transcript-state').textContent = 'Unavailable';}
}
async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  for (const [element, kind, label] of [['camera-device','videoinput','camera'],['mic-device','audioinput','microphone']]) {
    const previous = $(element).value; $(element).replaceChildren(new Option(`Default ${label}`, ''));
    devices.filter(d => d.kind === kind).forEach((d,i) => $(element).add(new Option(d.label || `${label} ${i+1}`, d.deviceId)));
    if ([...$(element).options].some(o => o.value === previous)) $(element).value = previous;
  }
}
function rememberBubble() {try {localStorage.setItem('screen-studio-bubble', JSON.stringify(bubble));} catch {}}
function clampBubble() {bubble.radius = Math.min(160, Math.max(64, bubble.radius)); bubble.x = Math.min(1280-bubble.radius-8, Math.max(bubble.radius+8,bubble.x)); bubble.y = Math.min(720-bubble.radius-8,Math.max(bubble.radius+8,bubble.y));}
$('bubble-position').onchange = () => {const position = $('bubble-position').value; bubble.x = position.endsWith('left') ? bubble.radius + 24 : 1280-bubble.radius-24; bubble.y = position.startsWith('top') ? bubble.radius+24 : 720-bubble.radius-24; rememberBubble();};
$('bubble-size').oninput = () => {bubble.radius = Number($('bubble-size').value); clampBubble(); rememberBubble();};
const pointInCanvas = e => {const box = canvas.getBoundingClientRect(); return {x:(e.clientX-box.left)*1280/box.width, y:(e.clientY-box.top)*720/box.height};};
canvas.onpointerdown = e => {if (!['recording','paused'].includes(state) || $('hide-camera').checked || $('mode').value !== 'screen-camera') return; const p=pointInCanvas(e); if (Math.hypot(p.x-bubble.x,p.y-bubble.y) <= bubble.radius) {drag=true; canvas.setPointerCapture(e.pointerId);}};
canvas.onpointermove = e => {if (drag) {Object.assign(bubble,pointInCanvas(e));clampBubble();}};
canvas.onpointerup = () => {drag=false;rememberBubble();}; canvas.onpointercancel = () => {drag=false;};
async function capture() {
  const mode = $('mode').value;
  if (mode !== 'camera') screen = await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30}, audio:$('system').checked}); else screen = null;
  const camera = mode !== 'screen'; const mic = $('mic').checked;
  presenter = camera || mic ? await navigator.mediaDevices.getUserMedia({video:camera ? {width:1280,height:720,...($('camera-device').value ? {deviceId:{exact:$('camera-device').value}} : {})} : false, audio:mic ? {echoCancellation:true,noiseSuppression:true,...($('mic-device').value ? {deviceId:{exact:$('mic-device').value}} : {})} : false}) : null;
  hasRecordedAudio = [screen,presenter].some(s => s?.getAudioTracks().length);
  audioContext = new AudioContext(); await audioContext.resume(); const destination = audioContext.createMediaStreamDestination();
  for (const stream of [screen,presenter]) if (stream?.getAudioTracks().length) audioContext.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(destination);
  let videoTrack;
  $('canvas').hidden = mode !== 'screen-camera'; $('live').hidden = mode === 'screen-camera';
  if (mode === 'screen-camera') {
    const sv = await videoFor(screen), cv = await videoFor(presenter); const canvasStream = canvas.captureStream(0); videoTrack = canvasStream.getVideoTracks()[0];
    const draw = () => {
      ctx.fillStyle = '#171d2e'; ctx.fillRect(0,0,1280,720); const ratio = Math.min(1280/sv.videoWidth,720/sv.videoHeight), w=sv.videoWidth*ratio, h=sv.videoHeight*ratio; ctx.drawImage(sv,(1280-w)/2,(720-h)/2,w,h);
      if (!$('hide-camera').checked) {clampBubble();const {x,y,radius:r}=bubble; ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip();const side=Math.min(cv.videoWidth,cv.videoHeight);ctx.drawImage(cv,(cv.videoWidth-side)/2,(cv.videoHeight-side)/2,side,side,x-r,y-r,2*r,2*r);ctx.restore();ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();}
      videoTrack.requestFrame();
    }; draw(); ticker = new Worker('/ticker.js'); ticker.onmessage = draw;
  } else {const source = mode === 'screen' ? screen : presenter; videoTrack = source.getVideoTracks()[0]; $('live').srcObject = source; await $('live').play();}
  mixed = new MediaStream([videoTrack,...destination.stream.getAudioTracks()]);
  [screen,presenter].forEach(s => s?.getVideoTracks().forEach(t => t.onended = finish));
  await refreshDevices();
}
function startRecorder() {
  const mime = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  if (!mime) throw new Error('This browser cannot create WebM recordings. Use Chrome or Edge.');
  recorder = new MediaRecorder(mixed,{mimeType:mime,videoBitsPerSecond:4000000}); const chunks = [];
  recorder.ondataavailable = e => {if (e.data.size) chunks.push(e.data);};
  recorder.onstop = () => {
    if (disposition === 'restart') {disposition='save';startRecorder();notify('Recording restarted. The discarded take was not saved.');return;}
    if (disposition === 'cancel') {cleanup();state='ready';segments=[];baseline=[];cleanupCandidates=[];history=new EditHistory();$('placeholder').hidden=false;$('canvas').hidden=false;$('clock').textContent='00:00';$('interim').textContent='';renderSegments();notify('Recording cancelled. No video was saved.');return;}
    blob = new Blob(chunks,{type:mime});state='editing';cleanup();$('interim').textContent='';
    if (originalURL?.startsWith('blob:')) URL.revokeObjectURL(originalURL);originalURL=URL.createObjectURL(blob);
    $('playback').src=originalURL;playbackIsOriginal=true;$('playback').hidden=false;$('placeholder').hidden=true;
    segments=segments.map(s=>({...s,end:Math.min(s.end,recordingDuration)})).filter(s=>s.end>s.start);baseline=structuredClone(segments);renderSegments();$('transcript-state').textContent='Editable';
    task(async () => {
      notify('Saving your recording…');const result=await api('/api/recordings',{method:'POST',headers:{'Content-Type':mime},body:blob});id=result.id;
      if(Number.isFinite(result.duration))recordingDuration=result.duration;
      URL.revokeObjectURL(originalURL);originalURL=`/media/${id}.webm`;$('playback').src=originalURL;
      let transcriptError='';
      if (aiEnabled && hasRecordedAudio && $('auto-transcribe').checked) {try {await regenerate();} catch(e) {transcriptError=` Automatic transcription failed: ${e.message}`;}}
      await renderCurrent();notify(`Recording saved and MP4 ready. Review the transcript, edit, and apply changes.${transcriptError}`);
    });
  };
  recorder.onerror = () => {notify('The browser recorder failed. Finish and download any recoverable video.');finish();};
  id=null;blob=null;segments=[];baseline=[];cleanupCandidates=[];history=new EditHistory();selection=null;anchor=null;invalidate();clearPreview();$('playback').pause();$('playback').hidden=true;$('placeholder').hidden=true;
  disposition='save';state='recording';prompter.restart();clock.reset();recorder.start(1000);clearInterval(timer);timer=setInterval(()=>$('clock').textContent=stamp(elapsed()),250);
  recognition();renderSegments();
}
$('record').onclick = () => task(async () => {
  if (blob && !confirm('Start a new recording? Download your current video and captions first.')) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || ($('mode').value !== 'camera' && !navigator.mediaDevices.getDisplayMedia)) throw new Error('Recording is unavailable. Use desktop Chrome or Edge at localhost.');
  if(await prompter.prepareForRecording($('use-speaker-notes').checked)){notify('Speaker notes opened. Move the floating window onto your presentation display, then click Start recording again to choose what to share.');return;}
  try {await capture();startRecorder();notify('Recording started. Pause, restart, or finish whenever you are ready.');}
  catch(e) {cleanup();state=blob?'editing':'ready';throw e;}
});
function finish() {
  if (!['recording','paused'].includes(state)) return;
  recordingDuration=elapsed();state='stopping';recognitionStopped=true;try{recognizer?.abort();}catch{}
  recorder.stop();$('clock').textContent=stamp(recordingDuration);updateControls();
}
$('stop').onclick = finish;
$('pause').onclick = () => {
  if (state === 'recording') {recorder.pause();clock.pause();state='paused';recognitionStopped=true;try{recognizer?.abort();}catch{};$('interim').textContent='';notify('Recording paused. Paused time is excluded from your video.');}
  else if (state === 'paused') {recorder.resume();clock.resume();state='recording';recognition();notify('Recording resumed.');}
  updateControls();
};
$('restart').onclick = () => {if(confirm('Discard this take and restart using the same screen and devices?')) {disposition='restart';finish();}};
$('cancel').onclick = () => {if(confirm('Cancel and discard this recording?')) {disposition='cancel';finish();}};
$('devices').onclick = () => task(async()=>{await refreshDevices();notify('Device list refreshed. Browser permission determines whether names are visible.');});
$('mode').onchange = updateControls; $('mic').onchange = updateControls;
async function regenerate() {
  notify('Generating a transcript with word timestamps…');const result=await post('/api/transcribe',{id,language:$('language').value});
  segments=result.segments;baseline=structuredClone(segments);cleanupCandidates=[];history=new EditHistory();selection=null;anchor=null;invalidate();renderSegments();$('transcript-state').textContent='Word timestamps ready';
}
$('transcribe').onclick = () => task(async()=>{if(segments.length&&!confirm('Replace transcript edits with a fresh AI transcript?'))return;await regenerate();setCaptions(segments);notify('Transcript ready. Click a word and Shift-click to select a phrase.');});
$('add').onclick = () => {const start=segments.at(-1)?.end||0;if(start>=recordingDuration)return notify('No time remains after the last segment. Adjust its end timestamp first.');change([...segments,{start,end:Math.min(start+5,recordingDuration),text:'',action:'keep',words:[]}]);};
$('reset').onclick = () => {history.push(editSnapshot());cleanupCandidates=[];change(structuredClone(baseline),{remember:false});notify('Original transcript, audio, and gaps restored. Apply changes to export.');};
$('undo').onclick = () => {restoreSnapshot(history.undo(editSnapshot()));notify('Edit undone. Apply changes to export.');};
$('redo').onclick = () => {restoreSnapshot(history.redo(editSnapshot()));notify('Edit restored. Apply changes to export.');};
$('find').oninput = updateSearch;
function correct(all) {try {const result=correctOccurrences(segments,$('find').value,$('correction').value,all);if(!result.changed)return notify('No matching words found.');change(result.segments);notify(`Corrected ${result.changed} occurrence${result.changed===1?'':'s'} in transcript and captions. Original audio is preserved.`);}catch(e){notify(e.message);}}
$('correct-one').onclick = () => correct(false); $('correct-all').onclick = () => correct(true);
$('clear-selection').onclick = () => {selection=null;anchor=null;$('replacement-editor').hidden=true;updateSelection();};
$('trim-selection').onclick = () => {try {change(editWordRange(segments,selection,'cut'));notify('Selected words marked for trimming from video and audio. Apply changes to save.');}catch(e){notify(e.message);}};
$('replace-selection').onclick = () => {$('replacement-text').value=selectionWords().map(w=>w.text).join(' ');$('replacement-editor').hidden=false;$('replacement-text').focus();};
$('save-replacement').onclick = () => {try {const next=editWordRange(segments,selection,'replace',$('replacement-text').value);if(next.filter(s=>s.action==='replace').length>10)throw new Error('Use at most 10 speech replacements per video.');change(next);notify('Replacement speech saved as an edit. Apply changes to generate and listen.');}catch(e){notify(e.message);}};
async function renderCurrent() {
  const cleanupCuts=activeCleanupCuts();planEdits(segments,recordingDuration,cleanupCuts);const replacements=segments.filter(s=>s.action==='replace');
  if(replacements.length&&!aiEnabled)throw new Error('Set OPENAI_API_KEY in .env and restart the server to generate replacement speech.');
  notify(replacements.length?'Generating synthetic speech and rendering your MP4…':'Preparing your MP4…');
  const result=await post('/api/render',{id,segments,voice:$('voice').value,cleanupCuts});output=`/media/${result.filename}`;finalCaptions=result.captions;synthetic=result.synthetic;
  clearPreview();$('playback').pause();$('playback').src=output;playbackIsOriginal=false;$('playback').hidden=false;setCaptions(finalCaptions);
  $('export-note').textContent=synthetic?'Includes AI-generated speech. Captions included.':'MP4 ready. Captions included.';
}
$('apply').onclick = () => task(async()=>{if(!id){const result=await api('/api/recordings',{method:'POST',body:blob});id=result.id;if(Number.isFinite(result.duration))recordingDuration=result.duration;}await renderCurrent();notify('Changes saved. Play the edited video to review, then download the MP4.');});
$('voice').onchange = () => {if(segments.some(s=>s.action==='replace'))invalidate();};
$('original').onclick = () => download(originalURL,'screen-studio-original.webm');
$('download').onclick = () => download(output,synthetic?'screen-studio-ai-speech.mp4':'screen-studio.mp4');
$('captions').onclick = () => {try{const captions=finalCaptions.length?finalCaptions:planEdits(segments,recordingDuration,activeCleanupCuts()).captions;const url=URL.createObjectURL(new Blob([srt(captions)],{type:'text/plain'}));download(url,'screen-studio.srt');setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){notify(e.message);}};
window.addEventListener('beforeunload',e=>{if(active()||busy||blob){e.preventDefault();e.returnValue='';}});
api('/api/status').then(s=>{aiEnabled=s.ai;$('ai-note').textContent=s.ai?'AI connected · transcript and speech generation incur API charges':'AI not configured. Set OPENAI_API_KEY in .env for word timestamps and replacement speech.';updateControls();}).catch(e=>notify(e.message));
refreshDevices().catch(()=>{});updateControls();

$('cleanup-tab').onclick=()=>{const panel=document.querySelector('.audio-cleanup');panel.open=true;panel.scrollIntoView({behavior:'smooth',block:'nearest'});};
