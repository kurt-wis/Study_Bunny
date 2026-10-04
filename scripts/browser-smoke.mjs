// Isolated production-build test. No access to the user's browser profile.
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root = resolve('dist');
const config = JSON.parse(await readFile('vercel.json', 'utf8'));
const headers = Object.fromEntries(config.headers[0].headers.map(h => [h.key, h.value]));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const route = url.pathname;
    const name = route === '/' || /^\/(student|auth)(\/|$)/.test(route) ? '/index.html' : route;
    const path = resolve(root, `.${decodeURIComponent(name)}`);
    if (!path.startsWith(`${root}/`) && !path.startsWith(`${root}\\`)) throw new Error('Invalid path');
    if (!(await stat(path)).isFile()) throw new Error('Not a file');
    response.writeHead(200, { ...headers, 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(await readFile(path));
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const deadline = setTimeout(() => { browser?.close(); }, 60000);
try {
  browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  const external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', req => { if (!req.url().startsWith(origin)) external.push(req.url()); });
  await page.goto(`${origin}/student`);
  await page.getByRole('button', { name: 'Upload PDF', exact: true }).waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload(); // Prompt-mode workers control new visits, not a live first-load session.
  assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), true);
  // Offline upload exercises PDF.js and its locally precached worker.
  await context.setOffline(true);
  const pdf = fixturePdf('Water boils at 100 degrees Celsius. Plants use sunlight for photosynthesis.');
  await page.getByLabel('Choose PDF file').setInputFiles({ name: 'test-notes.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.getByRole('button', { name: 'Check notes against a reference' }).click();
  await page.getByRole('heading', { name: 'Check my notes', exact: true }).waitFor();
  await page.getByLabel('Notes excerpt').fill('Name: Ana Santos\nEmail: ana@example.org\nWater boils at 100 degrees Celsius. Plants are made of cheese.');
  await page.getByLabel('Reference PDF', { exact: true }).setInputFiles({ name: 'test-reference.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.getByRole('button', { name: 'Compare offline', exact: true }).waitFor({ state: 'visible' });
  await page.getByText('Preview redacted notes and reference', { exact: true }).click();
  assert.ok(!(await page.locator('pre').first().innerText()).includes('Ana Santos'));
  assert.ok(!(await page.locator('pre').first().innerText()).includes('ana@example.org'));
  await page.getByRole('button', { name: 'Compare offline', exact: true }).click();
  const report = page.getByRole('region', { name: 'Note checking results' });
  await report.getByRole('heading', { name: 'Checking results', exact: true }).waitFor();
  await report.getByText('Supported by reference', { exact: true }).waitFor();
  await report.getByText('Insufficient evidence', { exact: true }).first().waitFor();
  assert.ok(!(await report.innerText()).includes('Ana Santos'));
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/notes-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'test-results/notes-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByText('Saved checks on this device (1)', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'mobile horizontal overflow');
  await page.getByLabel(/Use AI to interpret claims/).check();
  assert.equal(await page.getByRole('button', { name: 'Check with AI', exact: true }).isDisabled(), true, 'AI requires explicit preview review');
  await page.getByLabel(/I reviewed the redacted previews/).check();
  await page.getByLabel('Reference text or excerpt').fill('Water boils at 100 degrees Celsius.');
  assert.equal(await page.getByLabel(/I reviewed the redacted previews/).isChecked(), false, 'editing resets review');
  await page.getByLabel(/I reviewed the redacted previews/).check();
  await page.getByRole('button', { name: 'Check with AI', exact: true }).click();
  await page.getByRole('alert').getByText(/Turn on Cloud AI and enter your access code/).waitFor();
  await page.getByRole('button', { name: 'Back to document', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete test notes', exact: true }).click();
  await page.getByText('No documents yet', { exact: true }).waitFor();
  await context.setOffline(false);
  const unknownApi = await context.request.get(`${origin}/api/health`);
  assert.equal(unknownApi.status(), 404, 'static site never masquerades as a healthy API');
  assert.deepEqual(external, [], 'offline-only build makes no external content requests');
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log('Browser smoke passed: mobile UI, offline PDF/reference import, redaction, evidence, persistence, consent reset, access-code guard, deletion, and API 404.');
} finally {
  clearTimeout(deadline);
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}

function fixturePdf(text) {
  const stream = `BT /F1 12 Tf 40 740 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (const [i, object] of objects.entries()) { offsets.push(output.length); output += `${i + 1} 0 obj\n${object}\nendobj\n`; }
  const start = output.length;
  output += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(output);
}
