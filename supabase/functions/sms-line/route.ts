// Decides what an incoming text is asking for. Kept free of I/O so it can be tested on its own.

export const STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'PR',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'VI', 'WA', 'WV', 'WI', 'WY', 'GU',
]);

// Carrier opt-out and opt-in words (Twilio blocks sending after STOP, but still forwards the text).
const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE']);
const START_WORDS = new Set(['START', 'UNSTOP']);
// Words that carry no product: "find me honey near LA" searches for honey in LA.
const FILLER = new Set(['IN', 'OR', 'ME', 'NEAR', 'FIND', 'FOR', 'THE', 'ANY', 'SOME', 'A', 'AN', 'I', 'NEED', 'WANT', 'LOOKING']);

export type Route =
  | { type: 'optout' }
  | { type: 'optin' }
  | { type: 'help' }
  | { type: 'events' }
  | { type: 'search'; keyword: string; state?: string; raw?: string }
  /**
   * Not a command: a reply to a conversation or check-in if the sender has one, otherwise a search.
   * maybeOptIn: the text is just "YES", which turns texts back on for a number that is opted out
   * (Twilio treats YES as an opt-in word). For everyone else YES stays an answer to an inquiry.
   */
  | { type: 'reply'; text: string; fallback: { type: 'search'; keyword: string; state?: string; raw?: string }; maybeOptIn?: true };

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
  if (whole === 'YES') return { type: 'reply', text, fallback: search(words), maybeOptIn: true };
  return { type: 'reply', text, fallback: search(words) };
}

function search(input: string[]): { type: 'search'; keyword: string; state?: string; raw?: string } {
  // Punctuation never matters ("Honey?", "honey, LA"), and dropping it keeps % and _ out of the search.
  let words = input.map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, '').replace(/^['-]+|['-]+$/g, '')).filter(Boolean);
  // "eggs or honey": search for the first thing asked for.
  const or = words.indexOf('OR');
  if (or > 0) words = words.slice(0, or);
  // A state code counts only as the last word after a product, so "OK", "IN" or "ME" mid-text stay words.
  const last = words[words.length - 1];
  const rest = words.slice(0, -1).filter((w) => !FILLER.has(w));
  // "ME" ends plenty of sentences ("get back to me"): it means Maine only as "honey ME" or "honey in ME".
  const prev = words[words.length - 2];
  const looksLikeState = STATES.has(last) && (last !== 'ME' || words.length === 2 || prev === 'IN' || prev === 'NEAR');
  const state = words.length > 1 && looksLikeState && rest.length ? last : undefined;
  const raw = (state ? rest : words.filter((w) => !FILLER.has(w)))
    .filter((w) => !/^\d{5}(-\d{4})?$/.test(w))
    .join(' ')
    .toLowerCase();
  // "Honeys" finds honey; the raw word is kept so plural grower types ("Beekeepers") still match.
  const keyword = raw.replace(/s$/, '');
  const out: { type: 'search'; keyword: string; state?: string; raw?: string } = { type: 'search', keyword };
  if (state) out.state = state;
  if (raw !== keyword) out.raw = raw;
  return out;
}
