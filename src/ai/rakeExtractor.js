/**
 * RAKE (Rapid Automatic Keyword Extraction)
 * Pure JS, zero dependencies, works 100% offline.
 * Implements the algorithm from: Rose et al. (2010) "Automatic Keyword Extraction from Individual Documents"
 */

const STOPWORDS = new Set([
  'a','about','above','after','again','against','all','am','an','and','any','are',
  'as','at','be','because','been','before','being','below','between','both','but',
  'by','can','did','do','does','doing','down','during','each','few','for','from',
  'further','get','got','had','has','have','having','he','her','here','hers',
  'herself','him','himself','his','how','i','if','in','into','is','it','its',
  'itself','just','know','let','like','make','me','might','more','most','my',
  'myself','no','nor','not','now','of','off','on','once','only','or','other',
  'our','ours','ourselves','out','over','own','same','she','should','so','some',
  'such','than','that','the','their','theirs','them','themselves','then','there',
  'these','they','this','those','through','to','too','under','until','up','very',
  'was','we','were','what','when','where','which','while','who','whom','why',
  'will','with','would','you','your','yours','yourself','yourselves',
  'also','however','therefore','thus','hence','moreover','furthermore','although',
  'though','since','unless','whereas','whether','yet','still','already','always',
  'never','often','sometimes','usually','generally','specifically','particularly',
]);

/**
 * Extract top keywords using RAKE algorithm.
 * @param {string} text - raw text to extract from
 * @param {number} topN - maximum number of keywords to return (must be >= 1)
 * @returns {{ phrase: string, score: number }[]}
 */
export function extractKeywords(text, topN = 10) {
  if (!text || topN < 1) return [];

  const normalized = text.toLowerCase();

  // Step 1: Split into candidate phrases (split on stopwords and punctuation)
  const sentences = normalized.split(/[.!?,;:\n]+/);
  const phrases = [];

  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);
    let currentPhrase = [];

    for (const word of words) {
      const clean = word.replace(/[^a-z0-9'-]/g, '');
      // Exclude stopwords and words shorter than 3 characters
      if (clean && clean.length >= 3 && !STOPWORDS.has(clean)) {
        currentPhrase.push(clean);
      } else if (currentPhrase.length > 0) {
        phrases.push(currentPhrase.join(' '));
        currentPhrase = [];
      }
    }
    if (currentPhrase.length > 0) {
      phrases.push(currentPhrase.join(' '));
    }
  }

  if (phrases.length === 0) return [];

  // Step 2: Calculate word scores (degree / frequency)
  const wordFreq = {};
  const wordDegree = {};

  for (const phrase of phrases) {
    const words = phrase.split(/\s+/);
    const degree = words.length - 1;
    for (const word of words) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
      wordDegree[word] = (wordDegree[word] || 0) + degree;
    }
  }

  const wordScore = {};
  for (const word of Object.keys(wordFreq)) {
    wordScore[word] = (wordDegree[word] + wordFreq[word]) / wordFreq[word];
  }

  // Step 3: Score phrases and deduplicate
  const phraseScores = {};
  const uniquePhrases = [...new Set(phrases)];

  for (const phrase of uniquePhrases) {
    const words = phrase.split(/\s+/);
    phraseScores[phrase] = words.reduce((sum, w) => sum + (wordScore[w] || 0), 0);
  }

  // Step 4: Return top N sorted by score descending
  return Object.entries(phraseScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([phrase, score]) => ({ phrase, score }));
}

/**
 * Extract the top N sentences by keyword density.
 * Preserves original document order for equal-scoring sentences.
 *
 * @param {string} text
 * @param {{ phrase: string }[]} keywords
 * @param {number} topN
 * @returns {string[]}
 */
export function extractTopSentences(text, keywords, topN = 5) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  if (sentences.length === 0) return [];

  const keywordSet = new Set(keywords.map(k => k.phrase.toLowerCase()));

  const scored = sentences.map((sentence, originalIndex) => {
    const lower = sentence.toLowerCase();
    let score = 0;
    for (const kw of keywordSet) {
      if (lower.includes(kw)) score++;
    }
    return { sentence: sentence.trim(), score, originalIndex };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex) // desc score, then original order
    .slice(0, topN)
    .sort((a, b) => a.originalIndex - b.originalIndex) // restore document order
    .map(s => s.sentence);
}
