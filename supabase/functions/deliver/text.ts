// Text-message wording, kept free of I/O so it can be tested on its own.

type Notice = { kind: string; title: string; body: string };

/** Texts about a conversation invite a reply; the sms-line function posts the reply in that thread. */
export function smsText(n: Notice) {
  const hint =
    n.kind === 'inquiry'
      ? ' Reply YES, PART or NO to answer.'
      : n.kind === 'message' || n.kind === 'board'
        ? ' Reply to this text to answer.'
        : '';
  const footer = hint + ' (The Index. Reply STOP to opt out.)';
  const main = `${n.title}: ${n.body}`.replace(/\s+/g, ' ').trim();
  // Keep texts to about two segments: 306 characters in GSM-7, 134 when any character forces Unicode.
  const budget = (isGsm7(main + footer) ? 306 : 134) - footer.length;
  return clip(main, budget) + footer;
}

const GSM7 = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\\[~\]|€]*$/;
export function isGsm7(s: string) {
  return GSM7.test(s);
}

/** Cuts on whole characters (never half an emoji) and marks the cut with "..." (an ellipsis character would force Unicode). */
export function clip(s: string, max: number) {
  const chars = Array.from(s);
  return chars.length <= max ? s : chars.slice(0, Math.max(0, max - 3)).join('').trimEnd() + '...';
}

