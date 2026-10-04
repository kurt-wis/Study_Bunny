/**
 * Tier 3 Summarization — fully deterministic, works 100% offline.
 * Uses RAKE keyword extraction, then keeps the result SHORT and structured:
 * three key points, up to five key ideas (each with one line from the notes),
 * and a short study order. Long summaries do not get read.
 */
import { extractKeywords, extractTopSentences } from '../../ai/rakeExtractor.js';
import { extractDefinitions, itemsToDefinitions } from '../../ai/definitions.js';

/** Bump when the summary shape changes so cached summaries are rebuilt. */
export const SUMMARY_VERSION = 3;

const MAX_POINTS = 3;
const MAX_IDEAS = 5;
const MAX_TOPICS = 6;
const MAX_OUTLINE = 3;

/** Collapse whitespace and trim a sentence to a readable length. */
export function shorten(sentence, max = 150) {
  const clean = String(sentence ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, clean.lastIndexOf(' ', max))}…`;
}

/** Split text into at most `limit` short sentences (used for older/cloud overviews). */
export function toKeyPoints(text, limit = MAX_POINTS) {
  const sentences = String(text ?? '').match(/[^.!?]+[.!?]+/g) || (text ? [String(text)] : []);
  return sentences.map(s => shorten(s)).filter(Boolean).slice(0, limit);
}

/**
 * Generate a structured summary from raw text using RAKE.
 *
 * @param {string} rawText
 * @returns {Promise<{ tier: string, format: string, content: object }>}
 */
export async function summarizeTier3(rawText, { items = null } = {}) {
  // Cards the student corrected always win over what was detected automatically.
  const custom = itemsToDefinitions(items);
  if (custom.length > 0) return summarizeDefinitions(custom);

  // A handout that defines terms is summarised as its terms and meanings.
  const definitions = extractDefinitions(rawText);
  if (definitions.length >= 3) return summarizeDefinitions(definitions);

  const keywords = extractKeywords(rawText, 10);
  const topSentences = extractTopSentences(rawText, keywords, MAX_POINTS);
  const keyPoints = topSentences.map(s => shorten(s));
  const sentences = rawText.match(/[^.!?]+[.!?]+/g) || [];

  // One line from the notes per key idea; never repeat the same line twice.
  const used = new Set();
  const keyConcepts = [];
  for (const k of keywords) {
    if (keyConcepts.length >= MAX_IDEAS) break;
    const source = sentences.find(s => s.toLowerCase().includes(k.phrase.toLowerCase()) && !used.has(s));
    if (!source) continue;
    used.add(source);
    keyConcepts.push({ term: k.phrase, explanation: shorten(source), importance: '', commonMistakes: '' });
  }

  return {
    tier: 'deterministic',
    format: 'template',
    content: {
      version: SUMMARY_VERSION,
      overview: keyPoints.join(' '),
      keyPoints,
      keyTopics: keywords.slice(0, MAX_TOPICS).map(k => k.phrase),
      studyOutline: detectTopics(rawText, keywords).slice(0, MAX_OUTLINE),
      topSentences,
      keyConcepts,
    },
  };
}

const MAX_TERMS_SHOWN = 8;

function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function summarizeDefinitions(definitions) {
  const terms = definitions.map(d => d.term);
  const shown = definitions.slice(0, MAX_TERMS_SHOWN);
  const more = definitions.length - shown.length;
  const keyPoints = [
    `This handout explains ${definitions.length} terms.`,
    `Start with: ${terms.slice(0, 4).join(', ')}.`,
    more > 0
      ? `${more} more term${more === 1 ? '' : 's'} are in your flashcards and quizzes.`
      : 'Cover the meaning and try to say each term from memory.',
  ];
  // Study order: the handout's own order, a few terms at a time.
  const studyOutline = [];
  for (let i = 0; i < terms.length && studyOutline.length < MAX_OUTLINE; i += 4) {
    studyOutline.push({ name: terms.slice(i, i + 4).join(', '), keywords: [] });
  }
  return {
    tier: 'deterministic',
    format: 'template',
    content: {
      version: SUMMARY_VERSION,
      overview: keyPoints.join(' '),
      keyPoints,
      keyTopics: terms.slice(0, MAX_TOPICS),
      studyOutline,
      topSentences: [],
      keyConcepts: shown.map(d => ({ term: d.term, explanation: capitalize(shorten(d.definition)), importance: '', commonMistakes: '' })),
    },
  };
}

/**
 * Group keywords into topic clusters based on sentence co-occurrence.
 */
function detectTopics(text, keywords) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  if (sentences.length === 0 || keywords.length === 0) return [];

  const topics = [];
  let currentTopic = {
    name: keywords[0]?.phrase || 'Main Topic',
    keywords: [],
  };

  for (const kw of keywords) {
    const appearsIn = sentences.filter(s =>
      s.toLowerCase().includes(kw.phrase.toLowerCase())
    );
    if (appearsIn.length > 0) {
      currentTopic.keywords.push(kw.phrase);
    }
    if (currentTopic.keywords.length >= 3) {
      topics.push({ ...currentTopic });
      currentTopic = { name: kw.phrase, keywords: [] };
    }
  }

  if (currentTopic.keywords.length > 0) {
    topics.push(currentTopic);
  }

  return topics;
}
