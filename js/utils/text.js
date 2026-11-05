/**
 * Normalise text for comparison: lower case, punctuation and extra spaces removed.
 * Unicode-aware, so Bengali and other scripts compare correctly.
 */
export function norm(value) {
  return String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
