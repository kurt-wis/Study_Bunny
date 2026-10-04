/**
 * How much real text an upload had. A PDF made of scanned pages or pictures of
 * text has little or none, and Study Bunny cannot read text inside images, so
 * the student is warned that quizzes and cards may be incomplete.
 * Pure: no network, no storage.
 */

/** A page with fewer characters than this is counted as "mostly a picture". */
export const LOW_TEXT_CHARS = 50;

/**
 * @param {string[][]} linePages  lines of each page or slide, before clean-up
 * @param {number} [minChars]
 * @returns {{ pageCount: number, lowTextPages: number }}
 */
export function measureExtraction(linePages, minChars = LOW_TEXT_CHARS) {
  const pages = Array.isArray(linePages) ? linePages : [];
  const lowTextPages = pages.filter(lines => (Array.isArray(lines) ? lines : []).join(' ').trim().length < minChars).length;
  return { pageCount: pages.length, lowTextPages };
}

/** True when at least half of the pages had almost no readable text. */
export function isMostlyImages(extraction) {
  const pageCount = extraction?.pageCount ?? 0;
  const low = extraction?.lowTextPages ?? 0;
  return pageCount > 0 && low > 0 && low / pageCount >= 0.5;
}
