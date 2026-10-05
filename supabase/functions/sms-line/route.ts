// Decides what an incoming text is asking for. Kept free of I/O so it can be tested on its own.

export const STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'PR',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'VI', 'WA', 'WV', 'WI', 'WY', 'GU',
]);

export type Route =
  | { type: 'help' }
  | { type: 'events' }
  | { type: 'search'; keyword: string; state?: string }
  /** Not a command: a reply to a conversation or check-in if the sender has one, otherwise a search. */
  | { type: 'reply'; text: string; fallback: { type: 'search'; keyword: string; state?: string } };

export function routeText(body: string): Route {
  const text = body.trim();
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  if (!words.length || words[0] === 'HELP' || words[0] === 'INFO' || words[0] === 'AYUDA') return { type: 'help' };
  if (words[0] === 'EVENTS' || words[0] === 'EVENTOS') return { type: 'events' };
  if (words[0] === 'FIND' || words[0] === 'BUSCAR') {
    const rest = words.slice(1);
    return rest.length ? search(rest) : { type: 'help' };
  }
  return { type: 'reply', text, fallback: search(words) };
}

function search(words: string[]): { type: 'search'; keyword: string; state?: string } {
  // A state code counts only after the product word, so "OK" alone stays a word, not Oklahoma.
  const state = words.slice(1).find((w) => STATES.has(w));
  const keyword = words
    .filter((w) => w !== state && !/^\d{5}$/.test(w))
    .join(' ')
    .toLowerCase()
    .replace(/s$/, '');
  return state ? { type: 'search', keyword, state } : { type: 'search', keyword };
}
