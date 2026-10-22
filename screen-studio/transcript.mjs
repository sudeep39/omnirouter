const tokens = text => text.match(/\S+/gu) || [];
const normalized = text => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function attachWordTimings(rawSegments, rawWords, duration) {
  let cursor = 0;
  return rawSegments.map(s => {
    const start = Math.max(cursor, Math.max(0, s.start));
    const end = Math.min(duration, s.end);
    cursor = end;
    const text = s.text.trim();
    const candidates = rawWords.filter(w => (w.start + w.end) / 2 >= start && (w.start + w.end) / 2 < end);
    const textTokens = tokens(text);
    const aligned = candidates.length === textTokens.length && candidates.every((w, i) => normalized(w.word) === normalized(textTokens[i]) && w.end > w.start);
    const words = aligned ? candidates.map((w, i) => ({ text: textTokens[i], start: Math.max(start, w.start), end: Math.min(end, w.end) })) : [];
    return { start, end, text, action: 'keep', words };
  }).filter(s => s.end > s.start);
}

export function correctCaption(segment, text) {
  const nextTokens = tokens(text);
  const words = segment.words?.length === nextTokens.length ? segment.words.map((w, i) => ({ ...w, text: nextTokens[i] })) : [];
  return { ...segment, text, words };
}

export function correctOccurrences(segments, find, replacement, all = true) {
  if (!find.trim()) throw new Error('Enter the word or phrase to correct.');
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu');
  let changed = 0;
  const next = segments.map(s => correctCaption(s, s.text.replace(pattern, match => {
    if (!all && changed) return match;
    changed++; return replacement;
  })));
  return { segments: next, changed };
}

export function editWordRange(segments, selection, action, replacement = '') {
  if (!['cut', 'replace'].includes(action)) throw new Error('Select trim or replacement speech.');
  const first = segments[selection?.first?.segment]?.words?.[selection?.first?.word];
  const last = segments[selection?.last?.segment]?.words?.[selection?.last?.word];
  if (!first || !last || last.end <= first.start) throw new Error('Select words with AI timestamps first.');
  const from = first.start, to = last.end;
  if (action === 'replace' && !replacement.trim()) throw new Error('Enter replacement words.');
  const before = [], after = []; let selectedText = [];
  for (const s of segments) {
    if (s.end <= from + .00001) { before.push(structuredClone(s)); continue; }
    if (s.start >= to - .00001) { after.push(structuredClone(s)); continue; }
    if (s.action !== 'keep' || !s.words?.length) throw new Error('Selection overlaps an existing edit or words without timestamps. Undo or select an unedited phrase.');
    const left = s.words.filter(w => w.end <= from + .00001);
    const right = s.words.filter(w => w.start >= to - .00001);
    selectedText.push(...s.words.filter(w => w.end > from + .00001 && w.start < to - .00001).map(w => w.text));
    if (s.start < from - .001) before.push({ ...s, end: from, text: left.map(w => w.text).join(' '), words: left });
    if (s.end > to + .001) after.push({ ...s, start: to, text: right.map(w => w.text).join(' '), words: right });
  }
  const edit = { start: from, end: to, text: action === 'replace' ? replacement.trim() : selectedText.join(' '), action, words: [] };
  return [...before, edit, ...after];
}

export class EditHistory {
  constructor(limit = 100) { this.limit = limit; this.undoStack = []; this.redoStack = []; }
  push(segments) { this.undoStack.push(structuredClone(segments)); if (this.undoStack.length > this.limit) this.undoStack.shift(); this.redoStack = []; }
  undo(segments) { if (!this.undoStack.length) return segments; this.redoStack.push(structuredClone(segments)); return this.undoStack.pop(); }
  redo(segments) { if (!this.redoStack.length) return segments; this.undoStack.push(structuredClone(segments)); return this.redoStack.pop(); }
}

export function webvtt(captions) {
  const stamp = seconds => { const ms = Math.round(seconds * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; };
  return 'WEBVTT\n\n' + captions.filter(s => s.text.trim()).map(s => `${stamp(s.start)} --> ${stamp(s.end)}\n${s.text.replace(/[<>]/g, '').replace(/\r?\n/g, ' ').replace(/-->/g, '→')}\n`).join('\n');
}
