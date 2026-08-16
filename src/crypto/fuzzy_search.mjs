/**
 * FLASH Encrypted Fuzzy & Phonetic Search Engine (FlashFuzzyEngine)
 * Enables Levenshtein edit-distance and phonetic soundex matching over Zero-Knowledge encrypted documents.
 */
export class FlashFuzzyEngine {
  /**
   * Computes Levenshtein edit distance between two strings
   * @param {string} a
   * @param {string} b
   * @returns {number}
   */
  static levenshtein(a, b) {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Computes Soundex phonetic hash of a word
   * @param {string} word
   * @returns {string} 4-character phonetic code
   */
  static soundex(word) {
    if (!word || typeof word !== 'string') return '';
    const clean = word.toUpperCase().replace(/[^A-Z]/g, '');
    if (clean.length === 0) return '';

    const mapping = {
      B: '1', F: '1', P: '1', V: '1',
      C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
      D: '3', T: '3',
      L: '4',
      M: '5', N: '5',
      R: '6'
    };

    let result = clean[0];
    let prev = mapping[clean[0]] || '0';

    for (let i = 1; i < clean.length && result.length < 4; i++) {
      const code = mapping[clean[i]] || '0';
      if (code !== '0' && code !== prev) {
        result += code;
      }
      prev = code;
    }

    return (result + '0000').slice(0, 4);
  }
}
