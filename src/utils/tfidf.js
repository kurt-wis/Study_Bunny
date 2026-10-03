/**
 * TF-IDF Search Utility
 * Pure JS, zero dependencies, works 100% offline.
 * Used by Tier 3 chat to retrieve relevant document chunks.
 *
 * IDF formula: log₂(N / df)
 */

const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'is','it','as','be','was','are','from','this','that','its','not',
]);

/**
 * Tokenize text: lowercase, strip non-alphanumeric, split on whitespace,
 * filter stopwords and tokens shorter than 3 chars.
 */
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Retrieve the top-K most relevant chunks for a query using TF-IDF scoring.
 *
 * @param {string} query
 * @param {string[]} chunks - array of text chunks
 * @param {number} topK - number of results to return (must be a positive integer)
 * @returns {{ text: string, chunkIndex: number, score: number }[]}
 */
export function tfidfSearch(query, chunks, topK = 3) {
  if (!Number.isInteger(topK) || topK < 1) return [];
  if (!chunks || chunks.length === 0) return [];

  const effectiveK = Math.min(topK, chunks.length);
  const queryTokens = tokenize(query);

  // Empty query after tokenization — return first K chunks with score 0
  if (queryTokens.length === 0) {
    return chunks.slice(0, effectiveK).map((text, i) => ({ text, chunkIndex: i, score: 0 }));
  }

  const N = chunks.length;

  // Tokenize all chunks once
  const tokenizedChunks = chunks.map(chunk => tokenize(chunk));

  // Compute IDF for each query token: log₂(N / df)
  const idf = {};
  for (const token of queryTokens) {
    const df = tokenizedChunks.filter(chunkTokens => chunkTokens.includes(token)).length;
    idf[token] = df > 0 ? Math.log2(N / df) : 0;
  }

  // Score each chunk
  const scored = tokenizedChunks.map((chunkTokens, index) => {
    if (chunkTokens.length === 0) return { text: chunks[index], chunkIndex: index, score: 0 };

    // Build term frequency map for this chunk
    const tf = {};
    for (const token of chunkTokens) {
      tf[token] = (tf[token] || 0) + 1;
    }

    // Score = sum of (TF * IDF) for each query token present
    let score = 0;
    for (const token of queryTokens) {
      if (tf[token]) {
        const termFreq = tf[token] / chunkTokens.length;
        score += termFreq * (idf[token] || 0);
      }
    }

    return { text: chunks[index], chunkIndex: index, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, effectiveK);
}
