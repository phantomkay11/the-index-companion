/** Lowercase, accents removed ("Kreyòl" → "kreyol"), so searches match however people type. */
export function fold(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** The words of a search, without punctuation or emoji: "Opelousas, LA" → ["opelousas", "la"]. */
export function searchWords(query: string) {
  return fold(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * True when every search word starts a word in `fields`. Matching word starts (not anywhere inside)
 * keeps "LA" from matching "Callaloo" while "hon" still finds "Honey" as people type.
 */
export function matchesAll(words: string[], fields: (string | null | undefined)[]) {
  if (!words.length) return true;
  const have = searchWords(fields.filter(Boolean).join(' '));
  return words.every((w) => have.some((h) => h.startsWith(w)));
}
