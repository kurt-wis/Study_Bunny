/**
 * Tier 3 Summarization — fully deterministic, works 100% offline.
 * Uses RAKE keyword extraction + template formatting.
 */
import { extractKeywords, extractTopSentences } from '../../ai/rakeExtractor.js';

/**
 * Generate a structured summary from raw text using RAKE.
 *
 * @param {string} rawText
 * @returns {Promise<{ tier: string, format: string, content: object }>}
 */
export async function summarizeTier3(rawText) {
  const keywords = extractKeywords(rawText, 10);
  const topSentences = extractTopSentences(rawText, keywords, 5);
  const topics = detectTopics(rawText, keywords);

  return {
    tier: 'deterministic',
    format: 'template',
    content: {
      overview: topSentences.join(' '),
      keyTopics: keywords.map(k => k.phrase),
      studyOutline: topics,
      topSentences,
      // Populate keyConcepts in a compatible shape for the UI
      keyConcepts: keywords.slice(0, 6).map(k => ({
        term: k.phrase,
        explanation: `Key concept from your notes (score: ${k.score.toFixed(1)})`,
        importance: 'Identified by keyword analysis',
        commonMistakes: '',
      })),
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
