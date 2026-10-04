/**
 * pptxExtractor — reads the text of a PowerPoint (.pptx) file on the device.
 *
 * A .pptx is a zip of XML files, one per slide. This reads the zip directory,
 * unpacks only the slide files with the browser's built-in DecompressionStream
 * (no extra library, works offline) and returns one "page" per slide in the
 * same shape as the PDF extractor.
 */
import { cleanModuleLines } from './cleanModule.js';
import { measureExtraction } from './extractionQuality.js';

export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_SLIDES = 300;
const MAX_CHARS = 1000000;
const NOT_PPTX = 'This file could not be read as a PowerPoint (.pptx) file. Try saving it again, or save it as a PDF.';

export function isPptxFile(file) {
  return file?.type === PPTX_MIME || /\.pptx$/i.test(file?.name ?? '');
}

/** Old binary PowerPoint files (.ppt) cannot be read in the browser. */
export function isLegacyPptFile(file) {
  return /\.ppt$/i.test(file?.name ?? '') || file?.type === 'application/vnd.ms-powerpoint';
}

/** Read the zip central directory: file name → where its data is. */
export function readZipDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error(NOT_PPTX);
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  if (p === 0xffffffff || count === 0xffff) throw new Error('This PowerPoint file is too large to read. Save it as a PDF and upload that instead.');
  const decoder = new TextDecoder();
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new Error(NOT_PPTX);
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    entries.set(name, { method, compressedSize, localOffset });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflateRaw(data) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot open PowerPoint files. Save the slides as a PDF and upload that instead.');
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Unpack one zip entry to text. */
export async function readZipText(bytes, entry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const p = entry.localOffset;
  if (p + 30 > bytes.length || view.getUint32(p, true) !== 0x04034b50) throw new Error(NOT_PPTX);
  const start = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  let out;
  if (entry.method === 0) out = data;
  else if (entry.method === 8) {
    try { out = await inflateRaw(data); } catch (error) {
      if (/cannot open PowerPoint/.test(error?.message ?? '')) throw error;
      throw new Error(NOT_PPTX);
    }
  } else throw new Error(NOT_PPTX);
  return new TextDecoder().decode(out);
}

function decodeXml(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function safeCodePoint(n) {
  try { return String.fromCodePoint(n); } catch { return ''; }
}

/** Text of each paragraph in a piece of slide XML (still XML-escaped). */
function paragraphs(xml) {
  const out = [];
  const body = xml.replace(/<a:p\s*\/>/g, '').replace(/<a:t\s*\/>/g, '');
  for (const para of body.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
    let text = '';
    for (const run of para[1].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/?>|<a:tab\b[^>]*\/?>/g)) {
      text += run[1] !== undefined ? run[1] : ' ';
    }
    out.push(text);
  }
  return out;
}

/**
 * The lines of one slide. Table rows become "cell<TAB>cell" so two-column
 * glossaries are read as term and meaning.
 */
export function slideLines(xml) {
  const rows = [];
  const withoutTables = String(xml ?? '').replace(/<a:tr\b[^>]*>[\s\S]*?<\/a:tr>/g, row => {
    const cells = [...row.matchAll(/<a:tc\b[^>]*>[\s\S]*?<\/a:tc>/g)]
      .map(cell => paragraphs(cell[0]).join(' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    rows.push(cells.join('\t'));
    return `<a:p><a:t>\u0000${rows.length - 1}\u0000</a:t></a:p>`;
  });
  return paragraphs(withoutTables)
    .map(text => text.replace(/\u0000(\d+)\u0000/g, (_, n) => rows[Number(n)] ?? ''))
    .map(text => decodeXml(text).split('\t').map(cell => cell.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\t'))
    .filter(Boolean);
}

/** Slide files in presentation order (falls back to slide1, slide2, …). */
export function slideOrder(entries, presentationXml, relsXml) {
  const numbered = [...entries.keys()]
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
  if (!presentationXml || !relsXml) return numbered;
  const targets = new Map();
  for (const rel of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = rel[0].match(/\bId="([^"]+)"/)?.[1];
    const target = rel[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `ppt/${target}`);
  }
  const ordered = [];
  for (const slide of presentationXml.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)) {
    const name = targets.get(slide[1]);
    if (name && entries.has(name) && !ordered.includes(name)) ordered.push(name);
  }
  // Trust the declared order only when it accounts for every slide file.
  return ordered.length === numbered.length ? ordered : numbered;
}

/**
 * Extract the text of a .pptx File, one page per slide.
 * Returns the same shape as extractTextFromPDF.
 *
 * @param {File|Blob} file
 * @param {(progress: { stage: string, page?: number, pageCount?: number }) => void} [onProgress]
 */
export async function extractTextFromPPTX(file, onProgress) {
  if (!file || !isPptxFile(file)) throw new Error('Please choose a PowerPoint (.pptx) file.');
  if (file.size > MAX_BYTES) throw new Error('Choose a PowerPoint file smaller than 50 MB, or save it as a PDF.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = readZipDirectory(bytes);
  const read = async name => (entries.has(name) ? readZipText(bytes, entries.get(name)) : null);
  const slides = slideOrder(entries, await read('ppt/presentation.xml'), await read('ppt/_rels/presentation.xml.rels'));
  if (slides.length === 0) throw new Error(NOT_PPTX);
  if (slides.length > MAX_SLIDES) throw new Error(`Choose a presentation with ${MAX_SLIDES} slides or fewer.`);

  const linePages = [];
  let characterCount = 0;
  for (let i = 0; i < slides.length; i++) {
    const lines = slideLines(await read(slides[i]));
    linePages.push(lines);
    characterCount += lines.join(' ').length;
    if (characterCount > MAX_CHARS) throw new Error('This presentation contains too much text. Split it into smaller files.');
    onProgress?.({ stage: 'extracting', page: i + 1, pageCount: slides.length });
  }

  // A slide with no text at all is a picture slide.
  const extraction = measureExtraction(linePages, 1);
  const cleaned = cleanModuleLines(linePages);
  const pages = cleaned.pages.map(lines => lines.join(' ').replace(/\s+/g, ' ').trim());
  const rawText = pages.join('\n\n');
  if (!rawText.trim()) {
    throw new Error('No readable text found in this presentation. The slides may be pictures of text.');
  }
  return {
    rawText,
    pages,
    lineText: cleaned.pages.map(lines => lines.join('\n')).join('\n\n'),
    cleanup: { removed: cleaned.removed, kinds: cleaned.kinds },
    extraction,
    sourceType: 'pptx',
  };
}
