/**
 * cleanModule — removes the parts of a handout that are not the lesson before
 * anything is saved or shown: name / section / date / score fields, page
 * numbers, repeated headers and footers, blank answer lines, links and
 * copyright lines. Summaries, quizzes, flashcards and chat then only ever see
 * subject content.
 *
 * Works line by line and is deliberately careful: a line is removed only when
 * it clearly matches one of the rules below, and if cleaning would throw away
 * most of a document the original text is kept instead.
 */

/** Labels that are always paperwork, whatever follows them. */
const ADMIN_LABELS = [
  'name', 'full name', 'student name', 'name of student', 'pangalan', 'section', 'seksyon', 'grade and section',
  'grade & section', 'grade level', 'grade', 'year and section', 'year & section', 'year level', 'date', 'petsa',
  'date submitted', 'due date', 'deadline', 'score', 'iskor', 'rating', 'teacher', 'guro', 'instructor',
  'professor', 'adviser', 'student no', 'student number', 'student id', 'id no', 'id number', 'lrn',
  'prepared by', 'submitted by', 'submitted to', 'checked by', 'approved by', 'noted by', 'reviewed by',
  'signature', 'parent signature', "parent's signature", 'school', 'school year', 'paaralan', 'schedule',
  'room', 'contact', 'contact number', 'email', 'address', 'group no', 'group number', 'group members', 'members',
];
/** Labels that are paperwork only when the value is empty, a number or very short. */
const SOFT_LABELS = [
  'subject', 'course', 'course code', 'class', 'time', 'week', 'quarter', 'semester', 'term', 'module', 'module no',
  'module number', 'lesson', 'lesson no', 'lesson number', 'activity', 'activity no', 'activity number', 'unit',
  'worksheet', 'worksheet no', 'handout', 'handout no', 'title', 'topic', 'duration', 'units',
];

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*');
const labelPattern = labels => labels.slice().sort((a, b) => b.length - a.length).map(esc).join('|');
const ADMIN_RE = new RegExp(`^(?:${labelPattern(ADMIN_LABELS)})\\.?\\s*(?:no\\.?|#)?\\s*[:\\-–—]\\s*(.*)$`, 'i');
const ADMIN_BARE_RE = new RegExp(`^(?:${labelPattern(ADMIN_LABELS)})\\s*[:\\-–—]?\\s*[_.\\s]*$`, 'i');
const SOFT_RE = new RegExp(`^(?:${labelPattern(SOFT_LABELS)})\\.?\\s*(?:no\\.?|#)?\\s*[:\\-–—]\\s*(.*)$`, 'i');
const ANY_LABEL_RE = new RegExp(`\\b(?:${labelPattern([...ADMIN_LABELS, ...SOFT_LABELS])})\\s*[:\\-–—]`, 'i');

const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_RES = [
  new RegExp(`^(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\\s*)?${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s*\\d{2,4}$`, 'i'),
  new RegExp(`^\\d{1,2}\\s+${MONTH}\\.?,?\\s*\\d{2,4}$`, 'i'),
  /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/,
  /^(?:s\.?y\.?|a\.?y\.?|school year|academic year)\s*\d{4}\s*[-–]\s*\d{2,4}$/i,
  /^\d{4}\s*[-–]\s*\d{4}$/,
];
const PAGE_RES = [/^(?:page|pahina|p\.?)\s*\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i, /^\d{1,4}\s*(?:of|\/)\s*\d{1,4}$/i, /^[-–—|]?\s*\d{1,4}\s*[-–—|]?$/];
const NOISE_RES = [
  /^(?:https?:\/\/|www\.)\S+$/i,
  /^\S+@\S+\.\S+$/,
  /(?:©|\(c\)\s*\d{4}|copyright\b|all rights reserved)/i,
  /^(?:directions?|instructions?|panuto|note to (?:the )?(?:teacher|student)s?)\s*[:\-–—]/i,
  /^(?:for (?:classroom|educational) use only|not for sale|do not (?:copy|reproduce|write on this))\b/i,
  /^[\s_.\-–—•·*|=~]+$/,
];

function tidy(line) {
  return String(line ?? '').replace(/\t/g, ' ').replace(/\s+/g, ' ').trim();
}

function words(text) {
  return text.split(' ').filter(Boolean);
}

/** Why a single line is not lesson content, or null when it should be kept. */
export function junkReason(line) {
  const text = tidy(line);
  if (!text) return 'blank';
  if (NOISE_RES.some(re => re.test(text))) return 'noise';
  if (PAGE_RES.some(re => re.test(text))) return 'page number';
  if (DATE_RES.some(re => re.test(text))) return 'date';
  // A school or office name standing alone as a letterhead line.
  if (words(text).length <= 8 && /\b(?:school|university|college|academy|institute|deped|department of education|division of|republic of the philippines)\b/i.test(text)
    && !/\b(?:is|are|was|were|means|refers)\b|\s[-–—]\s|:/i.test(text) && !/[.!?]$/.test(text)) return 'school name';

  // Blank lines to write on: "Name: ______  Section: ____", "1. __________".
  if (/_{3,}/.test(text)) {
    const rest = words(text.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim());
    if (ANY_LABEL_RE.test(text) || rest.length <= 3) return 'blank to fill in';
  }
  // Several form fields on one line: "Name: Ana  Section: B  Date: Oct 3".
  if ((text.match(new RegExp(ANY_LABEL_RE.source, 'gi')) ?? []).length >= 2 && words(text).length <= 14) return 'form field';

  if (ADMIN_BARE_RE.test(text)) return 'form field';
  const admin = text.match(ADMIN_RE);
  if (admin && words(admin[1]).length <= 8) return 'form field';

  const soft = text.match(SOFT_RE);
  if (soft) {
    const value = soft[1].replace(/_+/g, '').trim();
    const count = words(value).length;
    // "Time: a measure of how long…" is a definition; "Time: 60 mins" is not.
    const looksLikeMeaning = /^(?:a|an|the|any|one|to)\s/i.test(value) || count > 4;
    if (!value || (!looksLikeMeaning && (count <= 3 || /^\d/.test(value)))) return 'form field';
  }
  return null;
}

/**
 * Remove non-lesson lines from a document.
 *
 * @param {string[][]} pages  lines of each page, in order
 * @returns {{ pages: string[][], removed: number, kinds: Record<string, number> }}
 */
export function cleanModuleLines(pages) {
  const input = (Array.isArray(pages) ? pages : []).map(p => (Array.isArray(p) ? p : []).map(l => String(l ?? '')));
  const kinds = {};
  const note = kind => { kinds[kind] = (kinds[kind] ?? 0) + 1; };

  // Headers and footers: the same line (numbers ignored) at the top or bottom
  // of several pages, such as a school name or a running title.
  const edgeCount = new Map();
  const edgeKey = line => tidy(line).toLowerCase().replace(/\d+/g, '#');
  if (input.length >= 3) {
    for (const page of input) {
      const edges = new Set([...page.slice(0, 2), ...page.slice(-2)].map(edgeKey).filter(Boolean));
      for (const key of edges) edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    }
  }
  const repeated = new Set([...edgeCount].filter(([, n]) => n >= Math.max(3, Math.ceil(input.length * 0.5))).map(([k]) => k));

  const cleaned = input.map(page => page.filter((line, i) => {
    const atEdge = i < 2 || i >= page.length - 2;
    if (atEdge && repeated.has(edgeKey(line))) { note('header or footer'); return false; }
    const reason = junkReason(line);
    if (reason === 'blank') return false;
    if (reason) { note(reason); return false; }
    return true;
  }));

  const size = p => p.reduce((n, page) => n + page.join(' ').length, 0);
  const before = size(input);
  const removed = Object.values(kinds).reduce((a, b) => a + b, 0);
  // Safety net: never throw away most of a document.
  if (before > 0 && size(cleaned) < before * 0.3) return { pages: input, removed: 0, kinds: {} };
  return { pages: cleaned, removed, kinds };
}
