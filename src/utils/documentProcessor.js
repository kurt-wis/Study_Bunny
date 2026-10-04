/**
 * documentProcessor — PDF text extraction and chunking.
 * Uses PDF.js (pdfjs-dist) for extraction.
 * Chunks near 400 tokens with 50-token overlap, respecting sentence boundaries.
 */

// PDF.js worker must be configured before use
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { cleanModuleLines } from './cleanModule.js';
let pdfjsLib = null;

async function getPdfjsLib() {
  if (pdfjsLib) return pdfjsLib;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  pdfjsLib = pdfjs;
  return pdfjs;
}

/**
 * Extract raw text from a PDF File object.
 * @param {File} file - PDF File from input or drag-and-drop
 * @param {(progress: { stage: string, page?: number, pageCount?: number }) => void} [onProgress]
 *   Optional progress callback, invoked once per extracted page. Omitting it
 *   preserves the original behavior exactly.
 * @returns {Promise<{ rawText: string, pages: string[], lineText: string, cleanup: { removed: number, kinds: object } }>}
 */
export async function extractTextFromPDF(file, onProgress) {
  if (!file || !(file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? ''))) throw new Error('Please choose a PDF file.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a PDF smaller than 20 MB.');
  const pdfjs = await getPdfjsLib();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  try {
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    if (pageCount > 300) throw new Error('Choose a PDF with 300 pages or fewer.');
    const linePages = []; // lines of each page, with the handout's line breaks kept
    let characterCount = 0;
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const lines = pageLines(textContent.items);
      linePages.push(lines);
      characterCount += lines.join(' ').length;
      page.cleanup();
      if (characterCount > 1000000) throw new Error('This PDF contains too much text. Split it into smaller files.');
      onProgress?.({ stage: 'extracting', page: pageNum, pageCount });
    }
    // Remove what is not the lesson (name/date/score fields, page numbers,
    // repeated headers and footers) before anything is saved or shown.
    const cleaned = cleanModuleLines(linePages);
    // One flattened string per page; empty pages are kept so page numbers stay right.
    const pages = cleaned.pages.map(lines => lines.join(' ').replace(/\s+/g, ' ').trim());
    const rawText = pages.join('\n\n');
    if (!rawText.trim()) {
      throw new Error('No readable text found in this PDF. It may be a scanned image or protected document.');
    }
    return {
      rawText,
      pages,
      lineText: cleaned.pages.map(lines => lines.join('\n')).join('\n\n'),
      cleanup: { removed: cleaned.removed, kinds: cleaned.kinds },
    };
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * Rebuild the visual lines of a page from PDF.js text items. Glossary-style
 * handouts ("Term - meaning", one per line) only make sense line by line, so
 * the quiz and summary read this version. A new line starts when PDF.js marks
 * the end of a line or the text moves to a different height on the page.
 */
export function pageLines(items) {
  const lines = [];
  let current = '';
  let lastY = null;
  let lastEndX = null;
  const flush = () => {
    // Keep tabs (column gaps) but tidy the spaces inside each cell.
    const line = current.split('\t').map(cell => cell.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\t');
    if (line) lines.push(line);
    current = '';
    lastEndX = null;
  };
  for (const item of items ?? []) {
    if (typeof item?.str !== 'string') continue;
    const x = Array.isArray(item.transform) ? item.transform[4] : null;
    const y = Array.isArray(item.transform) ? item.transform[5] : null;
    if (lastY != null && y != null && Math.abs(y - lastY) > 2) flush();
    if (item.str.trim()) {
      // A wide horizontal jump on the same line is a table or column gap.
      const gap = lastEndX != null && x != null ? x - lastEndX : 0;
      current += `${current ? (gap > COLUMN_GAP ? '\t' : ' ') : ''}${item.str}`;
      if (x != null) lastEndX = x + (Number.isFinite(item.width) ? item.width : 0);
    }
    if (y != null) lastY = y;
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

/** Horizontal gap (PDF points) that counts as a new table cell or column. */
const COLUMN_GAP = 24;

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
  const { rawText, pages, lineText, cleanup } = await extractTextFromPDF(file, onProgress);
  onProgress?.({ stage: 'chunking' });
  const chunks = chunkText(rawText);
  const title = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
  onProgress?.({ stage: 'done' });
  return { title, rawText, chunks, pages, lineText, cleanup };
}
