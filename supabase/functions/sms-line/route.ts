// Decides what an incoming text is asking for. Kept free of I/O so it can be tested on its own.

export const STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'PR',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'VI', 'WA', 'WV', 'WI', 'WY', 'GU',
]);

// Carrier opt-out and opt-in words (Twilio blocks sending after STOP, but still forwards the text).
const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE']);
const START_WORDS = new Set(['START', 'UNSTOP']);

export type Route =
  | { type: 'optout' }
  | { type: 'optin' }
  | { type: 'help' }
  | { type: 'events' }
  | { type: 'search'; keyword: string; state?: string; raw?: string }
  /** Not a command: a reply to a conversation or check-in if the sender has one, otherwise a search. */
  | { type: 'reply'; text: string; fallback: { type: 'search'; keyword: string; state?: string; raw?: string } };

export function routeText(body: string): Route {
  const text = body.trim();
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  // Commands count only when they're the whole text, so "Help is on the way" is still a reply.
  const whole = words.length === 1 ? words[0].replace(/[.!?]+$/, '') : null;
  if (whole && STOP_WORDS.has(whole)) return { type: 'optout' };
  if (whole && START_WORDS.has(whole)) return { type: 'optin' };
  if (!words.length || whole === 'HELP' || whole === 'INFO' || whole === 'AYUDA') return { type: 'help' };
  if (whole === 'EVENTS' || whole === 'EVENTOS') return { type: 'events' };
  if (words[0] === 'FIND' || words[0] === 'BUSCAR') {
    const rest = words.slice(1);
    return rest.length ? search(rest) : { type: 'help' };
  }
  return { type: 'reply', text, fallback: search(words) };
}

function search(words: string[]): { type: 'search'; keyword: string; state?: string; raw?: string } {
  // A state code counts only after the product word, so "OK" alone stays a word, not Oklahoma.
  const state = words.slice(1).find((w) => STATES.has(w));
  const raw = words
    .filter((w) => w !== state && !/^\d{5}$/.test(w))
    .join(' ')
    .toLowerCase();
  // "Honeys" finds honey; the raw word is kept so plural grower types ("Beekeepers") still match.
  const keyword = raw.replace(/s$/, '');
  const out: { type: 'search'; keyword: string; state?: string; raw?: string } = { type: 'search', keyword };
  if (state) out.state = state;
  if (raw !== keyword) out.raw = raw;
  return out;
}
