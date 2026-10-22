const EPS = .00001;
const normalized = text => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export const BASIC_FILLERS = ['um','uh','ah','uhm','umm','erm','er','hmm'];
export const EXTENDED_FILLERS = [...BASIC_FILLERS,'you know','i mean','sort of','kind of','basically','actually','literally','like'];

export function mergeRanges(ranges, duration) {
  if (!Array.isArray(ranges) || ranges.length > 500) throw new Error('Use at most 500 cleanup cuts.');
  const ordered = ranges.map(r => {
    if (!r || !Number.isFinite(r.start) || !Number.isFinite(r.end) || r.start < 0 || r.end <= r.start || r.end > duration + .1) throw new Error('Cleanup cuts must be inside the recording.');
    return {start:r.start,end:Math.min(duration,r.end)};
  }).sort((a,b) => a.start-b.start);
  const result = [];
  for (const r of ordered) {const last=result.at(-1);if(last&&r.start<=last.end+EPS)last.end=Math.max(last.end,r.end);else result.push({...r});}
  return result;
}
export function subtractRanges(range, blockers) {
  let result = [{start:range.start,end:range.end}];
  for (const b of blockers) {
    result = result.flatMap(r => {
      if (b.end <= r.start + EPS || b.start >= r.end - EPS) return [r];
      const parts=[];if(b.start>r.start+EPS)parts.push({start:r.start,end:Math.min(r.end,b.start)});if(b.end<r.end-EPS)parts.push({start:Math.max(r.start,b.end),end:r.end});return parts;
    });
  }
  return result;
}
export function cleanupRanges(candidates, segments, duration) {
  // Existing replacements and cuts are not analyzed again or shortened.
  const blockers=segments.filter(s=>s.action!=='keep').map(s=>({start:s.start,end:s.end}));
  return mergeRanges(candidates.filter(c=>c.selected!==false).flatMap(c=>subtractRanges(c,blockers)),duration);
}
export function silenceOptions({minimum=1,threshold=-35,padding=.12}={}) {
  if (!Number.isFinite(minimum)||minimum<.2||minimum>10||!Number.isFinite(threshold)||threshold < -80||threshold > -10||!Number.isFinite(padding)||padding<0||padding>.5||2*padding>=minimum) throw new Error('Use a gap duration of 0.2–10 seconds, threshold of -80 to -10 dB, and padding less than half the gap duration.');
  return {minimum,threshold,padding};
}
export function parseSilences(log, duration, options={}) {
  const {minimum,padding}=silenceOptions(options);const result=[];let start=null;
  const add = end => {if(start!==null&&end-start>=minimum-.002){const from=Math.max(0,start)+padding,to=Math.min(duration,end)-padding;if(to>from+.02)result.push({start:from,end:to,kind:'gap',text:'Quiet audio gap',selected:true});}start=null;};
  for (const match of log.matchAll(/silence_(start|end):\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi)) {
    const value=Number(match[2]);if(!Number.isFinite(value))continue;if(match[1]==='start')start=value;else add(value);
  }
  if(start!==null)add(duration);
  if(result.length>500)throw new Error('More than 500 gaps detected. Increase the minimum gap duration.');
  return result;
}
export function protectGapCandidates(gaps, segments, duration, minimumCut=.02) {
  const blockers=segments.flatMap(s=>s.action!=='keep'?[{start:s.start,end:s.end}]:(s.words||[]).map(w=>({start:Math.max(0,w.start-.04),end:Math.min(duration,w.end+.04)})));
  return gaps.flatMap(g=>subtractRanges(g,blockers).filter(r=>r.end-r.start>=minimumCut-EPS).map(r=>({...g,...r})));
}
export function findFillers(segments, {preset='basic',custom='',repeats=false}={}) {
  if(!['basic','extended','custom'].includes(preset))throw new Error('Choose a filler preset.');
  if(typeof custom!=='string'||custom.length>1000)throw new Error('Custom filler list is too long.');
  const terms=(preset==='custom'?custom.split(','):preset==='extended'?EXTENDED_FILLERS:BASIC_FILLERS).map(t=>t.trim().split(/\s+/u).map(normalized).filter(Boolean)).filter(t=>t.length&&t.length<=5).sort((a,b)=>b.length-a.length);
  if(!terms.length&&!repeats)throw new Error('Enter comma-separated filler words or phrases.');
  const words=segments.flatMap((s,segment)=>s.action==='keep'?(s.words||[]).map(w=>({...w,segment})):[]);
  const candidates=[];
  for(let i=0;i<words.length;i++) {
    const w=words[i];if(!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.end<=w.start)continue;
    const term=terms.find(t=>t.every((token,k)=>words[i+k]&&normalized(words[i+k].text)===token&&(k===0||words[i+k].start-words[i+k-1].end<=.35)));
    const repeated=repeats&&words[i+1]&&normalized(w.text)===normalized(words[i+1].text)&&words[i+1].start-w.end<=.25;
    if(!term&&!repeated)continue;
    const count=term?.length||1,last=words[i+count-1];
    const overlap=segments.some(s=>s.action!=='keep'&&s.start<last.end-EPS&&s.end>w.start+EPS);
    if(!overlap)candidates.push({start:w.start,end:last.end,kind:'filler',text:words.slice(i,i+count).map(w=>w.text).join(' '),reason:term?'Filler match':'Immediate repeat',selected:true});
    i+=count-1;
  }
  return candidates;
}
