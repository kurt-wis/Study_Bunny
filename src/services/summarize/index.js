/**
 * Summarize orchestrator — routes to correct tier and caches results.
 */
import { resolveTier, TIER } from '../../utils/tierDetection.js';
import { summarizeTier3, SUMMARY_VERSION } from './summarizeTier3.js';
import db, { saveSummary, getSummary, getDocument } from '../../db/database.js';
import { getChunkRecords } from '../../utils/chunkRecords.js';

/**
 * Generate or retrieve a cached summary for a document.
 *
 * @param {number} documentId
 * @param {{ preference?: string }} opts
 * @returns {Promise<{ tier: string, format: string, content: object }>}
 */
export async function summarize(documentId, opts = {}) {
  const { tier } = await resolveTier({ feature: 'summarize', preference: opts.preference ?? null });

  // Check cache first
  // Reuse the cached summary unless a fresh one was asked for (`opts.force`)
  // or it was made in the older, longer format.
  const cached = await getSummary(documentId, tier);
  if (cached && !opts.force && cached.content?.version === SUMMARY_VERSION) return cached;
  if (cached) await db.summaries.delete(cached.id);

  const doc = await getDocument(documentId);
  if (!doc) throw new Error('Document not found');

  let result;

  if (tier === TIER.CLOUD) {
    try {
      const { summarizeTier2 } = await import('./summarizeTier2.js');
      result = await summarizeTier2(doc.rawText, getChunkRecords(doc));
    } catch (error) {
      console.error('[Summarize] Cloud tier failed, falling back to deterministic:', error);
      result = await summarizeTier3(doc.lineText || doc.rawText, { items: doc.items });
    }
  } else if (tier === TIER.EDGE) {
    try {
      const { summarizeTier1 } = await import('./summarizeTier1.js');
      result = await summarizeTier1(doc.rawText, doc.chunks);
    } catch (error) {
      console.error('[Summarize] Edge tier failed, falling back to deterministic:', error);
      result = await summarizeTier3(doc.lineText || doc.rawText, { items: doc.items });
    }
  } else {
    result = await summarizeTier3(doc.lineText || doc.rawText, { items: doc.items });
  }

  // Persist result to cache
  await saveSummary({
    documentId,
    tier: result.tier,
    content: result.content,
    format: result.format,
    createdAt: new Date(),
  });

  return result;
}
