/**
 * Quiz scope helpers — which part of which modules a quiz is built from.
 * Pure: no network, no storage.
 */

/** Split text into pieces of about `size` characters, at sentence ends where possible. */
export function splitChunks(text, size = 1600) {
  const sentences = String(text ?? '').match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [];
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > size) { chunks.push(current.trim()); current = ''; }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/** Clamp a page range to the document. Returns null when there is nothing to narrow. */
export function normalizeRange(range, pageCount) {
  if (!range || !Number.isInteger(pageCount) || pageCount < 1) return null;
  let from = Number.parseInt(range.from, 10);
  let to = Number.parseInt(range.to, 10);
  if (!Number.isFinite(from) && !Number.isFinite(to)) return null;
  if (!Number.isFinite(from)) from = 1;
  if (!Number.isFinite(to)) to = pageCount;
  from = Math.min(Math.max(from, 1), pageCount);
  to = Math.min(Math.max(to, 1), pageCount);
  if (from > to) [from, to] = [to, from];
  if (from === 1 && to === pageCount) return null; // the whole module
  return { from, to };
}

/**
 * The text a quiz should be built from: the whole module, or only some pages.
 *
 * @param {object} doc    a stored document
 * @param {{ from?: number, to?: number }|null} [range]  1-based, inclusive
 * @returns {{ rawText: string, lineText: string, chunks: string[], items: object[]|null, range: {from:number,to:number}|null }}
 */
export function scopeDocument(doc, range = null) {
  const pages = Array.isArray(doc?.pages) ? doc.pages : [];
  const picked = normalizeRange(range, pages.length);
  if (!picked) {
    return {
      rawText: doc.rawText,
      lineText: doc.lineText || doc.rawText,
      chunks: doc.chunks ?? [doc.rawText],
      items: doc.items ?? null,
      range: null,
    };
  }
  const rawText = pages.slice(picked.from - 1, picked.to).join('\n\n').trim();
  if (!rawText) throw new Error('Those pages have no readable text. Choose a different part.');
  // lineText keeps one block per page, in the same order as `pages`.
  const linePages = typeof doc.lineText === 'string' ? doc.lineText.split('\n\n') : [];
  const lineText = linePages.length === pages.length
    ? linePages.slice(picked.from - 1, picked.to).join('\n\n').trim() || rawText
    : rawText;
  // Corrected cards cover the whole module: keep only those found in this part.
  const haystack = rawText.toLowerCase();
  const items = (Array.isArray(doc.items) ? doc.items : [])
    .filter(i => typeof i?.term === 'string' && i.term.trim() && haystack.includes(i.term.trim().toLowerCase()));
  return { rawText, lineText, chunks: splitChunks(rawText), items: items.length > 0 ? items : null, range: picked };
}

/**
 * Mix the questions of several modules into one quiz: take turns between the
 * modules, and alternate question types inside each one.
 *
 * @param {object[][]} lists  questions per module, already tagged with documentId
 * @param {number} [total]
 */
export function mixQuestions(lists, total = 5) {
  const queues = (Array.isArray(lists) ? lists : []).map(list => {
    const typed = (Array.isArray(list) ? list : []).filter(q => q?.type === 'fill_in_blank');
    const choice = (Array.isArray(list) ? list : []).filter(q => q && q.type !== 'fill_in_blank');
    const out = [];
    while (typed.length || choice.length) {
      if (typed.length) out.push(typed.shift());
      if (choice.length) out.push(choice.shift());
    }
    return out;
  });
  const mixed = [];
  while (mixed.length < total && queues.some(q => q.length > 0)) {
    for (const queue of queues) {
      if (mixed.length >= total) break;
      if (queue.length > 0) mixed.push(queue.shift());
    }
  }
  return mixed.map((q, i) => ({ ...q, id: i + 1 }));
}

/** Evenly sample at most `max` entries from a list, keeping their order. */
export function sampleEvenly(list, max) {
  if (!Array.isArray(list) || list.length <= max) return Array.isArray(list) ? list : [];
  const out = [];
  for (let i = 0; i < max; i++) out.push(list[Math.floor((i * list.length) / max)]);
  return out;
}

/** Which module a cloud question most likely came from (falls back to the first). */
export function attributeQuestion(question, sources) {
  const needles = [question?.correct_answer, question?.topic]
    .map(s => String(s ?? '').trim().toLowerCase())
    .filter(s => s.length >= 3);
  for (const needle of needles) {
    const hit = sources.find(s => String(s.rawText ?? '').toLowerCase().includes(needle));
    if (hit) return hit.documentId;
  }
  return sources[0]?.documentId;
}
