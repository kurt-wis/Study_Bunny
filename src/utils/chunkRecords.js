/**
 * chunkRecords — derive stable chunk metadata from a stored document.
 *
 * The frozen `documents` store keeps `chunks` as plain `string[]` and `pages`
 * as `string[]` (one entry per extracted PDF page). Tasks 7/14/15 require a
 * stable, document-local `chunkId`, a `tokenEstimate`, and a best-effort source
 * `page` for each chunk — without widening the frozen DB schema or the
 * `saveDocument` write path. This helper derives that metadata deterministically
 * at read time (decision D1 in the plan).
 *
 * Pure function. No DB calls.
 *
 * @typedef {object} ChunkRecord
 * @property {string} chunkId   Stable id, `${doc.id}-${index}`.
 * @property {string} text      The chunk text.
 * @property {number} index     Zero-based position within `doc.chunks`.
 * @property {number} tokenEstimate  Rough token count (~4 chars/token).
 * @property {number|undefined} page 1-based source page when resolvable, else undefined.
 */

/**
 * Build stable chunk records for a stored document.
 *
 * `tokenEstimate` reuses the extractor's ~4-chars-per-token heuristic.
 * `page` is best-effort: the 1-based index of the first page in `doc.pages`
 * whose text contains the chunk's opening ~40 characters. When a chunk spans
 * pages or normalization prevents a match, `page` is `undefined` and callers
 * should omit the page reference rather than show a wrong one.
 *
 * @param {{ id?: number, chunks?: string[], pages?: string[] }} doc
 * @returns {ChunkRecord[]}
 */
export function getChunkRecords(doc) {
  const chunks = doc?.chunks ?? [];
  const pages = doc?.pages ?? [];
  const docId = doc?.id;

  return chunks.map((text, index) => ({
    chunkId: `${docId}-${index}`,
    text,
    index,
    tokenEstimate: Math.ceil((text?.length ?? 0) / 4),
    page: resolvePage(text, pages),
  }));
}

/**
 * Best-effort resolution of a chunk's source page via substring match of its
 * opening fragment against each page's text.
 *
 * @param {string} text
 * @param {string[]} pages
 * @returns {number|undefined} 1-based page number, or undefined if unresolved.
 */
function resolvePage(text, pages) {
  if (!text || pages.length === 0) return undefined;
  const probe = text.slice(0, 40).trim();
  if (!probe) return undefined;
  for (let i = 0; i < pages.length; i++) {
    if (pages[i]?.includes(probe)) return i + 1;
  }
  return undefined;
}
