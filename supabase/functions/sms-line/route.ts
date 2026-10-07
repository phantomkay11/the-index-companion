// Decides what an incoming text is asking for. Kept free of I/O so it can be tested on its own.

export const STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'PR',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'VI', 'WA', 'WV', 'WI', 'WY', 'GU',
]);

// Carrier-required keywords (CTIA). Twilio's built-in opt-out still forwards these to the webhook.
export const OPT_OUT = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT', 'PARAR']);
export const OPT_IN = new Set(['START', 'UNSTOP', 'YES START', 'SUBSCRIBE', 'OPTIN']);

/** Longest text we pay any attention to (Twilio itself caps inbound texts at 1600 characters). */
export const MAX_BODY = 1600;

export type Route =
  | { type: 'optout' }
  | { type: 'optin' }
  | { type: 'help' }
  | { type: 'events' }
  | { type: 'search'; keyword: string; state?: string }
  /** Not a command: a reply to a conversation or check-in if the sender has one, otherwise a search. */
  | { type: 'reply'; text: string; fallback: { type: 'search'; keyword: string; state?: string } };

export function routeText(body: string): Route {
  const text = clean(body);
  // Words with surrounding punctuation removed, so "HELP!" and "Events." still work.
  const words = text.toUpperCase().split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
  const whole = words.join(' ');
  if (OPT_OUT.has(whole) || (words.length === 1 && OPT_OUT.has(words[0]))) return { type: 'optout' };
  if (OPT_IN.has(whole)) return { type: 'optin' };
  if (!words.length || words[0] === 'HELP' || words[0] === 'INFO' || words[0] === 'AYUDA') return { type: 'help' };
  if (words[0] === 'EVENTS' || words[0] === 'EVENTOS') return { type: 'events' };
  if (words[0] === 'FIND' || words[0] === 'BUSCAR') {
    const rest = words.slice(1);
    return rest.length ? search(rest) : { type: 'help' };
  }
  return { type: 'reply', text, fallback: search(words) };
}

/** Trims, caps the length on whole characters, and drops control characters. */
export function clean(body: string) {
  return Array.from((body ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()).slice(0, MAX_BODY).join('');
}

function search(words: string[]): { type: 'search'; keyword: string; state?: string } {
  // A state code counts only after the product word, so "OK" alone stays a word, not Oklahoma.
  const state = words.slice(1).find((w) => STATES.has(w));
  const keyword = words
    .filter((w) => w !== state && !/^\d{5}$/.test(w))
    .join(' ')
    .toLowerCase()
    // Only letters, digits, spaces and hyphens reach the database query.
    .replace(/[^\p{L}\p{N} -]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
  return state ? { type: 'search', keyword: singular(keyword), state } : { type: 'search', keyword: singular(keyword) };
}

/** "tomatoes" -> "tomato", "pecans" -> "pecan"; leaves "grass" and "molasses" alone. */
export function singular(w: string) {
  if (/(ss|us|is)$/.test(w) || /molasses$/.test(w)) return w;
  if (/oes$/.test(w)) return w.slice(0, -2);
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
  return w.replace(/s$/, '');
}
