/**
 * documentProcessor — PDF text extraction and chunking.
 * Uses PDF.js (pdfjs-dist) for extraction.
 * Chunks near 400 tokens with 50-token overlap, respecting sentence boundaries.
 */

// PDF.js worker must be configured before use. Importing it as a Vite asset
// keeps extraction available offline and avoids a third-party CDN dependency.
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let pdfjsLib = null;

async function getPdfjsLib() {
  if (pdfjsLib) return pdfjsLib;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
  pdfjsLib = pdfjs;
  return pdfjs;
}

/**
 * Extract raw text from a PDF File object.
 * @param {File} file - PDF File from input or drag-and-drop
 * @param {(progress: { stage: string, page?: number, pageCount?: number }) => void} [onProgress]
 *   Optional progress callback, invoked once per extracted page. Omitting it
 *   preserves the original behavior exactly.
 * @returns {Promise<{ rawText: string, pages: string[] }>}
 */
export async function extractTextFromPDF(file, onProgress) {
  const pdfjs = await getPdfjsLib();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const pageCount = pdf.numPages;
  const pages = [];
  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map(item => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (pageText) pages.push(pageText);
    onProgress?.({ stage: 'extracting', page: pageNum, pageCount });
  }

  const rawText = pages.join('\n\n');
  if (!rawText.trim()) {
    throw new Error('No readable text found in this PDF. It may be a scanned image or protected document.');
  }

  return { rawText, pages };
}

/**
 * Split text into overlapping chunks of ~400 tokens with 50-token overlap.
 * Attempts to split at sentence boundaries.
 *
 * @param {string} text
 * @param {object} opts
 * @param {number} opts.chunkTokens - target tokens per chunk (default 400)
 * @param {number} opts.overlapTokens - overlap tokens between chunks (default 50)
 * @returns {string[]}
 */
export function chunkText(text, { chunkTokens = 400, overlapTokens = 50 } = {}) {
  if (!text?.trim()) return [];

  // Split into sentences using regex (handles . ! ? with optional space)
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [text];

  const chunks = [];
  let currentChunk = [];
  let currentTokenCount = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);

    // If adding this sentence exceeds target, flush and start new chunk with overlap
    if (currentTokenCount + sentenceTokens > chunkTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' ').trim());

      // Keep last N tokens worth of sentences as overlap
      const overlapSentences = [];
      let overlapCount = 0;
      for (let i = currentChunk.length - 1; i >= 0; i--) {
        const t = estimateTokens(currentChunk[i]);
        if (overlapCount + t > overlapTokens) break;
        overlapSentences.unshift(currentChunk[i]);
        overlapCount += t;
      }

      currentChunk = [...overlapSentences];
      currentTokenCount = overlapCount;
    }

    currentChunk.push(sentence.trim());
    currentTokenCount += sentenceTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' ').trim());
  }

  return chunks.filter(Boolean);
}

/**
 * Rough token estimator: ~4 chars per token (GPT-like approximation).
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Full pipeline: extract text from PDF and return structured document data.
 * @param {File} file
 * @param {(progress: { stage: string, page?: number, pageCount?: number }) => void} [onProgress]
 *   Optional progress callback. Receives per-page `{ stage: 'extracting', page, pageCount }`
 *   events, then `{ stage: 'chunking' }` and finally `{ stage: 'done' }`.
 *   Omitting it preserves the original behavior exactly.
 * @returns {Promise<{ title: string, rawText: string, chunks: string[], pages: string[] }>}
 */
export async function processDocument(file, onProgress) {
  const { rawText, pages } = await extractTextFromPDF(file, onProgress);
  onProgress?.({ stage: 'chunking' });
  const chunks = chunkText(rawText);
  const title = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
  onProgress?.({ stage: 'done' });
  return { title, rawText, chunks, pages };
}
