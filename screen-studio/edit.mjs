import {mergeRanges,subtractRanges} from './cleanup.mjs';
export function validateSegments(segments, duration) {
  if (!Array.isArray(segments) || segments.length > 500) throw new Error('Provide at most 500 transcript segments.');
  let end = 0;
  return segments.map(s => {
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < end - .001 || s.end <= s.start || s.end > duration + .1) throw new Error('Segments must be ordered, non-overlapping, and inside the recording.');
    if (typeof s.text !== 'string' || s.text.length > 4000 || !['keep', 'cut', 'replace'].includes(s.action)) throw new Error('Invalid text or segment action.');
    if (s.action === 'replace' && !s.text.trim()) throw new Error('Replacement speech cannot be empty.');
    end = s.end;
    return {...s, end: Math.min(s.end, duration)};
  });
}
export function planEdits(segments, duration, cleanupCuts=[]) {
  const cuts=mergeRanges(cleanupCuts,duration);
  const parts = []; let cursor = 0; let output = 0; const captions = [];
  for (const s of validateSegments(segments, duration)) {
    if (s.start > cursor + .001) {parts.push({start: cursor, end: s.start, action: 'keep'}); output += s.start - cursor;}
    if (s.action !== 'cut') {
      parts.push(s); captions.push({start: output, end: output + s.end - s.start, text: s.text}); output += s.end - s.start;
    }
    cursor = s.end;
  }
  if (cursor < duration - .001) parts.push({start: cursor, end: duration, action: 'keep'});
  if (!parts.length) throw new Error('At least some of the video must remain.');
  if(!cuts.length)return {parts,captions};
  const cleaned=[],shifted=[];let offset=0;
  for(const part of parts){
    if(part.action==='replace'&&cuts.some(c=>c.start<part.end-.00001&&c.end>part.start+.00001))throw new Error('Cleanup cannot cut replacement speech. Clear that cleanup selection first.');
    for(const range of subtractRanges(part,cuts)){
      const removedWord=w=>cuts.some(c=>c.start<w.end-.00001&&c.end>w.start+.00001);
      const words=part.words?.filter(w=>!removedWord(w)&&w.start<range.end-.00001&&w.end>range.start+.00001);
      const text=part.words?.length?words.map(w=>w.text).join(' '):part.text;
      cleaned.push({...part,...range,text,words});
      if(typeof text==='string'&&text.trim())shifted.push({start:offset,end:offset+range.end-range.start,text});
      offset+=range.end-range.start;
    }
  }
  if(!cleaned.length)throw new Error('At least some of the video must remain.');
  return {parts:cleaned,captions:shifted};
}
export function tempoFilter(ratio) {
  if (!(ratio > 0) || !Number.isFinite(ratio)) throw new Error('Invalid speech duration.');
  const filters = [];
  while (ratio > 2) {filters.push('atempo=2'); ratio /= 2;}
  while (ratio < .5) {filters.push('atempo=0.5'); ratio /= .5;}
  filters.push(`atempo=${ratio.toFixed(8)}`); return filters.join(',');
}
export function srt(captions) {
  const stamp = n => {const ms = Math.round(n * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2,'0')}:${String(Math.floor(ms / 60000) % 60).padStart(2,'0')}:${String(Math.floor(ms / 1000) % 60).padStart(2,'0')},${String(ms % 1000).padStart(3,'0')}`;};
  return captions.filter(s => s.text.trim()).map((s,i) => `${i+1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${s.text.replace(/\r?\n/g,' ').replace(/-->/g,'→')}\n`).join('\n');
}
