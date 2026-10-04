/**
 * Definition extraction — finds "term → meaning" pairs in a handout so the
 * offline quiz, flashcards and summary are built from what the handout actually
 * teaches, instead of from loose keyword statistics.
 *
 * Recognised shapes (one per line, or run together on one line):
 *   Men - a male person          (dash with spaces: -, –, —)
 *   Men: a male person           (colon)
 *   Photosynthesis is the process by which plants make food.
 *   Osmosis refers to / means / is defined as / is called …
 *
 * Pure and total: never throws; returns [] when nothing matches.
 */

const DASH = '[-–—]';
const BULLET = /^\s*(?:[•●▪■◦·*○‣►➤✓✔-]|\(?\d{1,3}[.)]|\(?[a-zA-Z][.)])\s+/;
const NOT_A_TERM = /^(?:it|this|that|these|those|they|there|he|she|we|you|i|here|what|which|who|when|where|why|how|note|example|examples|e\.g|i\.e|figure|table|page|chapter|source|reference|references|answer|question)$/i;
const VERBS = ['is defined as', 'are defined as', 'refers to', 'refer to', 'is called', 'are called', 'is known as', 'are known as', 'means', 'is', 'are'];
const MAX_TERM_WORDS = 6;
const MAX_TERM_CHARS = 60;
const MIN_DEF_WORDS = 2;
const MAX_DEF_CHARS = 260;

function clean(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function validTerm(term) {
  const t = clean(term).replace(/[.,;:]+$/, '');
  if (!t || t.length > MAX_TERM_CHARS) return null;
  const words = t.split(' ');
  if (words.length > MAX_TERM_WORDS) return null;
  if (NOT_A_TERM.test(words[0]) && words.length === 1) return null;
  if (/^(?:it|this|that|these|those|they|there|he|she|we|you)\b/i.test(t)) return null;
  if (!/[A-Za-z]/.test(t)) return null;
  if (/^\d+$/.test(t)) return null;
  // "Jose Rizal achieved - academic excellence" is a sentence with a dash in
  // it, not a term and its meaning: a real term does not end in a verb or a
  // joining word.
  if (words.length > 1 && endsLikeSentence(words[words.length - 1])) return null;
  return t;
}

const TRAILING_WORDS = new Set(['is', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'from', 'with', 'into', 'and', 'or', 'but', 'the', 'a', 'an', 'that', 'which', 'who', 'whose', 'when', 'where', 'because', 'became', 'made', 'wrote', 'led', 'won', 'said', 'gave', 'took', 'went', 'began', 'found', 'built', 'fought', 'also', 'then']);
const ED_NOUNS = /^(?:hundred|kindred|sacred|hatred|shed|breed|creed|greed|speed|steed|tweed)$/;

/** Whether a term's last word shows it is a cut-off sentence ("… achieved", "… was"). */
function endsLikeSentence(word) {
  const w = String(word ?? '').replace(/[^A-Za-z']/g, '');
  if (!w || w !== w.toLowerCase()) return false; // capitalised words are names or headings
  if (TRAILING_WORDS.has(w)) return true;
  return w.length >= 6 && /ed$/.test(w) && !/eed$/.test(w) && !ED_NOUNS.test(w);
}

function validDefinition(definition) {
  let d = clean(definition);
  if (d.split(' ').length < MIN_DEF_WORDS) return null;
  if (d.length > MAX_DEF_CHARS) d = `${d.slice(0, d.lastIndexOf(' ', MAX_DEF_CHARS))}…`;
  return d;
}

/** Try to read one line as "term <sep> definition". */
function parseLine(line) {
  // Table rows and two-column glossaries arrive as "Term<TAB>meaning".
  if (line.includes('\t')) {
    const cells = line.split('\t').map(clean).filter(Boolean);
    if (cells.length > 2 && /^\(?\d{1,3}[.)]?$/.test(cells[0])) cells.shift(); // leading row number
    if (cells.length >= 2) {
      const term = validTerm(cells[0].replace(BULLET, ''));
      const definition = validDefinition(cells.slice(1).join(' '));
      if (term && definition) return { term, definition, joiner: '-', kind: 'separator' };
    }
  }
  const text = clean(line.replace(/\t/g, ' ').replace(BULLET, ''));
  if (!text) return null;

  // 1. Term - definition   /   Term: definition
  const sep = text.match(new RegExp(`^(.{1,${MAX_TERM_CHARS}}?)\\s+(${DASH})\\s+(.+)$`)) ??
    text.match(new RegExp(`^([^:]{1,${MAX_TERM_CHARS}}?)(:)\\s+(.+)$`));
  if (sep) {
    const term = validTerm(sep[1]);
    const definition = validDefinition(sep[3]);
    if (term && definition) return { term, definition, joiner: sep[2] === ':' ? ':' : '-', kind: 'separator' };
  }

  // 2. Term is / are / means / refers to … definition
  for (const verb of VERBS) {
    const m = text.match(new RegExp(`^(.{1,${MAX_TERM_CHARS}}?)\\s+${verb}\\s+(.+)$`, 'i'));
    if (!m) continue;
    const term = validTerm(m[1]);
    const definition = validDefinition(m[2]);
    // "is/are" are common words: require a real definition, not a short remark.
    const longEnough = (verb !== 'is' && verb !== 'are') || definition?.split(' ').length >= 4;
    if (term && definition && longEnough && term.split(' ').length <= 4) {
      return { term, definition, joiner: verb, kind: 'sentence' };
    }
  }
  return null;
}

/** A short heading-like line that could be a term on its own line. */
function isTermLine(line) {
  const t = clean(String(line ?? '').replace(/\t/g, ' ').replace(BULLET, ''));
  if (!t || t.length > 50 || /[.!?,;]$/.test(t)) return false;
  const words = t.replace(/:$/, '').split(' ');
  return words.length <= 5 && /^[A-Z0-9(]/.test(t) && validTerm(t.replace(/:$/, '')) != null;
}

/** A longer line that reads like the meaning of the term above it. */
function isMeaningLine(line, termLine) {
  const t = clean(String(line ?? '').replace(/\t/g, ' '));
  return t.split(' ').length >= 3 && t.length > clean(termLine).length && !isTermLine(line);
}

/** Split text that lost its line breaks into candidate lines. */
function splitFlattened(text) {
  // Break before each "Term - " / "Term: " that starts with a capital letter,
  // and after sentence-ending punctuation.
  const marked = text
    .replace(new RegExp(`\\s+(?=[A-Z][A-Za-z0-9()'/ ]{0,40}?\\s${DASH}\\s)`, 'g'), '\n')
    .replace(/([.!?])\s+(?=[A-Z])/g, '$1\n');
  return marked.split('\n');
}

/**
 * @param {string} text  handout text, ideally with line breaks kept
 * @returns {Array<{ term: string, definition: string, joiner: string, kind: 'separator'|'sentence', source: string }>}
 */
export function extractDefinitions(text) {
  const raw = String(text ?? '');
  if (!raw.trim()) return [];
  const hasLines = /\n/.test(raw.trim()) && raw.split('\n').filter(l => l.trim()).length >= 3;
  const lines = (hasLines ? raw.split('\n') : splitFlattened(raw)).flatMap(line =>
    // A physical line can still hold several sentences.
    /[.!?]\s+[A-Z]/.test(line) && !new RegExp(`\\s${DASH}\\s|:\\s`).test(line.slice(0, MAX_TERM_CHARS))
      ? line.split(/(?<=[.!?])\s+(?=[A-Z])/)
      : [line],
  );

  // "Term" on one line with its meaning on the next. Only trusted when the
  // handout does it at least twice, so a lone heading is not mistaken for a term.
  const stacked = new Set();
  for (let i = 0; i < lines.length - 1; i++) {
    if (isTermLine(lines[i]) && isMeaningLine(lines[i + 1], lines[i]) && !parseLine(lines[i]) && !parseLine(lines[i + 1])) {
      stacked.add(i);
      i += 1;
    }
  }
  const useStacked = stacked.size >= 2;

  const found = [];
  const seen = new Set();
  let last = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let parsed = parseLine(line);
    if (!parsed && useStacked && stacked.has(i)) {
      const term = validTerm(clean(line.replace(BULLET, '')).replace(/:$/, ''));
      const definition = validDefinition(lines[i + 1]);
      if (term && definition) { parsed = { term, definition, joiner: '-', kind: 'separator' }; i += 1; }
    }
    if (parsed) {
      const key = parsed.term.toLowerCase();
      if (seen.has(key)) { last = null; continue; }
      seen.add(key);
      last = { ...parsed };
      found.push(last);
      continue;
    }
    // A wrapped line continues the previous definition when that definition is
    // not finished yet and this line starts in lower case.
    const text2 = clean(line);
    if (last && text2 && /^[a-z(]/.test(text2) && !/[.!?]$/.test(last.definition) && last.definition.length + text2.length < MAX_DEF_CHARS) {
      last.definition = `${last.definition} ${text2}`;
    } else {
      last = null;
    }
  }

  return found.map(d => {
    const definition = d.definition.replace(/\s+/g, ' ').trim();
    const sourceSep = d.kind === 'separator' ? (d.joiner === ':' ? ': ' : ' - ') : ` ${d.joiner} `;
    return { ...d, definition, source: `${d.term}${sourceSep}${definition}` };
  });
}

/** The same line with the term replaced by a blank: "________ - a male person". */
export function blankedDefinition(d) {
  const sep = d.kind === 'separator' ? (d.joiner === ':' ? ': ' : ' - ') : ` ${d.joiner} `;
  return `________${sep}${d.definition}`;
}

/** Spellings to accept for a term (case is ignored by the quiz already). */
export function acceptableAnswers(term) {
  const t = clean(term);
  const out = new Set([t]);
  const noParens = clean(t.replace(/\([^)]*\)/g, ''));
  if (noParens) out.add(noParens);
  const inParens = t.match(/\(([^)]+)\)/);
  if (inParens) out.add(clean(inParens[1]));
  for (const v of [...out]) {
    if (/s$/i.test(v) && v.length > 3) out.add(v.slice(0, -1)); else out.add(`${v}s`);
    out.add(v.replace(/^(?:the|a|an)\s+/i, ''));
  }
  return [...out].filter(Boolean);
}

/** Turn the student's corrected cards into the same shape as extracted definitions. */
export function itemsToDefinitions(items) {
  return (Array.isArray(items) ? items : [])
    .map(i => ({ term: clean(i?.term), definition: clean(i?.definition) }))
    .filter(i => i.term && i.definition)
    .map(i => ({ ...i, joiner: '-', kind: 'separator', source: `${i.term} - ${i.definition}` }));
}
