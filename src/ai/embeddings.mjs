/**
 * Universal polyglot text embedding for FLASH AI modules.
 * Handles Latin, Arabic, CJK, and space-less scripts via character n-grams.
 * @param {string} text
 * @param {number} [dimensions=64]
 * @returns {Float32Array}
 */
export function flashEmbed(text, dimensions = 64) {
  const normalized = (text || "").toLowerCase().trim();
  const vec = new Float32Array(dimensions);
  if (!normalized) return vec;

  const words = normalized.split(/\s+/).filter(Boolean);
  const tokens = [...words];
  const n = normalized.replace(/\s+/g, "");
  for (let i = 0; i < n.length - 1; i++) {
    tokens.push(n.slice(i, i + 2));
    if (i < n.length - 2) tokens.push(n.slice(i, i + 3));
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    let hash = 0x811c9dc5;
    for (let j = 0; j < token.length; j++) {
      hash ^= token.charCodeAt(j);
      hash = Math.imul(hash, 0x01000193);
    }
    vec[Math.abs(hash) % dimensions] += 1.0 / Math.sqrt(i + 1);
  }

  let norm = 0;
  for (let i = 0; i < dimensions; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) vec[i] /= norm;
  }
  return vec;
}
