// Who gets a text and what it says. Kept free of I/O so it can be tested on its own.

/**
 * Texts go to US numbers only (+1 and 10 digits), written the way Twilio wants them.
 * Same reading as the database's phone_key(): a bare 10-digit number is North American, and a number
 * typed with "+" keeps its own country code. Returns null for anything else.
 */
export function usNumber(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  const d = t.replace(/\D/g, '');
  const e164 = t.startsWith('+') ? `+${d}` : d.length === 10 ? `+1${d}` : `+${d}`;
  return /^\+1\d{10}$/.test(e164) ? e164 : null;
}

/**
 * Texts about a conversation invite a reply; the sms-line function posts the reply in that thread.
 * The reply code tells it which thread, so the reply can't land in someone else's conversation.
 */
export function smsText(n: { kind: string; title: string; body: string }, replyCode?: string | null) {
  const code = replyCode && /^[A-Z0-9]{3}$/.test(replyCode) ? `#${replyCode}` : null;
  const hint =
    n.kind === 'inquiry'
      ? code
        ? ` To answer, reply starting with ${code}, then YES, PART or NO. Example: ${code} YES ready Saturday.`
        : ' Reply YES, PART or NO to answer.'
      : n.kind === 'message' || n.kind === 'board'
        ? code
          ? ` To answer, reply starting with ${code}.`
          : ' Reply to this text to answer.'
        : '';
  // Cut by characters, not UTF-16 units, so an emoji is never split in half.
  const main = Array.from(`${n.title}: ${n.body}`);
  return (main.length > 280 ? main.slice(0, 279).join('') + '…' : main.join('')) + hint + ' (The Index. Reply STOP to opt out.)';
}
