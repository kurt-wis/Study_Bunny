/** Shared, local-only detection. Heuristics miss unlabelled names and addresses. */
const RULES = [
  ['email', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ['phone', /(?<!\w)(?:\+?63[\s.-]?|0)9\d{2}[\s.-]?\d{3}[\s.-]?\d{4}(?!\w)/g],
  ['phone', /(?<!\w)\+\d[\d ()-]{8,18}\d(?!\w)/g],
  ['student ID', /\b(?:student\s*(?:id|number|no\.?)|learner\s*(?:id|number)|LRN)\s*[:#=-]?\s*[A-Z0-9][A-Z0-9-]{3,24}\b/gi],
  ['name', /\b(?:student\s*name|full\s*name|name|pangalan)\s*:\s*[^\n\r,;:.]{2,80}/gi],
  ['address', /\b(?:home\s*address|address|tirahan)\s*:\s*[^\n\r;]{3,160}/gi],
];

export function detectPersonalData(text = '') {
  if (typeof text !== 'string') return [];
  const found = [];
  for (const [type, expression] of RULES) {
    for (const match of text.matchAll(new RegExp(expression.source, expression.flags))) {
      found.push({ type, start: match.index, end: match.index + match[0].length });
    }
  }
  // Merge overlapping detections without ever returning the original personal value.
  return found.sort((a, b) => a.start - b.start || b.end - a.end).reduce((out, item) => {
    const last = out.at(-1);
    if (last && item.start < last.end) last.end = Math.max(last.end, item.end);
    else out.push({ ...item });
    return out;
  }, []);
}

export function redactPersonalData(text = '', customTerms = []) {
  if (typeof text !== 'string') return '';
  const spans = detectPersonalData(text);
  let clean = text;
  for (const { start, end } of spans.slice().reverse()) {
    clean = clean.slice(0, start) + '[REDACTED]' + clean.slice(end);
  }
  for (const term of customTerms) {
    if (typeof term !== 'string' || !term.trim()) continue;
    const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp(escaped, 'gi'), '[REDACTED]');
  }
  return clean;
}

/** Redact all content strings; retain wire IDs so citation mapping survives. */
export function sanitizePayload(value, key = '') {
  if (typeof value === 'string') return ['chunkId', 'claimId'].includes(key) ? value : redactPersonalData(value);
  if (Array.isArray(value)) return value.map(item => sanitizePayload(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([name, item]) => [name, sanitizePayload(item, name)]),
  );
  return value;
}
