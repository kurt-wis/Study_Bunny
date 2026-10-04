import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { extractTextFromPPTX, slideLines, isPptxFile, isLegacyPptFile } from './pptxExtractor.js';
import { measureExtraction, isMostlyImages } from './extractionQuality.js';

/** Build a small zip in memory (deflate or stored), like PowerPoint writes. */
function zip(files, { store = false } = {}) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = store ? raw : deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(store ? 0 : 8, 10);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBytes, end]);
}

const slide = (...paras) => `<p:sld><p:cSld><p:spTree>${paras.map(p => `<p:sp><p:txBody><a:bodyPr/><a:p><a:pPr lvl="0"/>${p}</a:p></p:txBody></p:sp>`).join('')}</p:spTree></p:cSld></p:sld>`;
const run = text => `<a:r><a:rPr lang="en-US"/><a:t>${text}</a:t></a:r>`;
const asFile = (buffer, name = 'Week 6 Lesson.pptx') => new File([buffer], name);

const deck = {
  '[Content_Types].xml': '<Types/>',
  'ppt/presentation.xml': '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>',
  'ppt/_rels/presentation.xml.rels': '<Relationships><Relationship Id="rId1" Type="x/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="x/slide" Target="slides/slide1.xml"/><Relationship Target="slides/slide2.xml" Type="x/slide" Id="rId3"/></Relationships>',
  'ppt/slides/slide1.xml': slide(run('Procurement - the whole process of getting goods &amp; services'), run('Purchasing') + run(' - the act of buying')),
  'ppt/slides/slide2.xml': slide(run('Acquisition and Sourcing'), run('Sourcing is the process of finding suppliers for the things a company needs.')),
};

test('reads slide text in presentation order', async () => {
  const out = await extractTextFromPPTX(asFile(zip(deck)));
  assert.equal(out.pages.length, 2);
  assert.match(out.pages[0], /Sourcing is the process/, 'slide2 is shown first by the presentation');
  assert.match(out.pages[1], /Procurement - the whole process of getting goods & services/);
  assert.match(out.lineText, /Purchasing - the act of buying/, 'runs of one paragraph are joined');
  assert.equal(out.sourceType, 'pptx');
  assert.deepEqual(out.extraction, { pageCount: 2, lowTextPages: 0 });
  assert.equal(out.rawText, out.pages.join('\n\n'));
});

test('works for stored (uncompressed) entries and without presentation.xml', async () => {
  const { 'ppt/presentation.xml': _a, 'ppt/_rels/presentation.xml.rels': _b, ...slidesOnly } = deck;
  const out = await extractTextFromPPTX(asFile(zip(slidesOnly, { store: true })));
  assert.match(out.pages[0], /Procurement/);
  assert.match(out.pages[1], /Sourcing/);
});

test('reports progress per slide', async () => {
  const seen = [];
  await extractTextFromPPTX(asFile(zip(deck)), p => seen.push(`${p.page}/${p.pageCount}`));
  assert.deepEqual(seen, ['1/2', '2/2']);
});

test('table rows become tab-separated lines, breaks become spaces', () => {
  const xml = `<a:tbl><a:tr h="1"><a:tc><a:txBody><a:p>${run('Term')}</a:p></a:txBody></a:tc><a:tc><a:txBody><a:p>${run('a word')}<a:br/>${run('with meaning')}</a:p><a:p/></a:txBody></a:tc></a:tr></a:tbl><a:p>${run('After &lt;table&gt; &#233;')}</a:p><a:p><a:endParaRPr/></a:p>`;
  assert.deepEqual(slideLines(xml), ['Term\ta word with meaning', 'After <table> é']);
});

test('clear errors for files that are not presentations', async () => {
  await assert.rejects(extractTextFromPPTX(asFile(Buffer.from('not a zip at all, just some text'))), /could not be read as a PowerPoint/);
  await assert.rejects(extractTextFromPPTX(asFile(zip({ 'word/document.xml': '<w/>' }))), /could not be read as a PowerPoint/);
  await assert.rejects(extractTextFromPPTX(asFile(zip({ 'ppt/slides/slide1.xml': slide() }))), /No readable text/);
  await assert.rejects(extractTextFromPPTX(asFile(zip(deck), 'notes.pdf')), /Please choose a PowerPoint/);
});

test('file type detection', () => {
  assert.equal(isPptxFile({ name: 'A.PPTX', type: '' }), true);
  assert.equal(isPptxFile({ name: 'a.pdf', type: 'application/pdf' }), false);
  assert.equal(isLegacyPptFile({ name: 'old.ppt', type: '' }), true);
  assert.equal(isLegacyPptFile({ name: 'new.pptx', type: '' }), false);
});

test('image-heavy uploads are detected', () => {
  const long = ['x'.repeat(80)];
  assert.equal(isMostlyImages(measureExtraction([long, long, long])), false);
  assert.equal(isMostlyImages(measureExtraction([long, ['Fig. 1'], []])), true);
  assert.equal(isMostlyImages(measureExtraction([long, long, long, []])), false);
  assert.equal(isMostlyImages(null), false);
  assert.equal(isMostlyImages(measureExtraction([])), false);
});
