/**
 * Tier 2 Summarization — Cloud AI (the hosted model behind this site's /api routes).
 * Calls POST /api/summarize with document chunks (chunks only — never raw
 * filenames, titles, or student identifiers).
 */
import { apiPost } from '../../utils/apiTransport.js';
import { SUMMARY_VERSION, toKeyPoints } from './summarizeTier3.js';

/**
 * Generate a cloud-AI summary from document chunk records.
 *
 * Sends the frozen `/api/summarize` shape `{ chunks:[{ text, page? }], language? }`.
 * `page` is the chunk record's best-effort source page and is omitted when
 * unknown rather than guessed.
 *
 * @param {string} rawText - full document text (fallback when no chunks exist)
 * @param {Array<{ text: string, page?: number }>} [chunkRecords] - derived chunk records
 * @param {string} [language] - optional language hint
 * @returns {Promise<{ tier: string, format: string, content: object }>}
 */
export async function summarizeTier2(rawText, chunkRecords, language) {
  const records = (chunkRecords && chunkRecords.length > 0)
    ? chunkRecords
    : [{ text: rawText }];

  const payload = {
    chunks: records.map(r => ({
      text: r.text,
      ...(r.page ? { page: r.page } : {}),
    })),
    ...(language ? { language } : {}),
  };

  const response = await apiPost('/api/summarize', payload);

  return {
    tier: 'cloud',
    format: 'ai',
    content: {
      version: SUMMARY_VERSION,
      overview: response.overview ?? '',
      keyPoints: toKeyPoints(response.overview ?? ''),
      keyConcepts: (response.keyConcepts ?? []).slice(0, 5),
      studyOutline: (response.studyOutline ?? []).slice(0, 5).map(name => ({ name, keywords: [] })),
      keyTopics: (response.keyConcepts ?? []).map(c => c.term),
      topSentences: [],
    },
  };
}
