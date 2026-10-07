import { smsText, usNumber } from './text.ts';

function eq(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e}\n     got ${a}`);
}

Deno.test('texts go to US numbers only', () => {
  eq(usNumber('+15555550100'), '+15555550100');
  eq(usNumber('+1 (555) 555-0100'), '+15555550100');
  eq(usNumber('555 555 0100'), '+15555550100');
  eq(usNumber('15555550100'), '+15555550100');
  eq(usNumber('+501 600 1234'), null); // Belize, not +1 501…
  eq(usNumber('+882345678901'), null);
  eq(usNumber('+44 20 7946 0958'), null);
  eq(usNumber(''), null);
  eq(usNumber(null), null);
});

Deno.test('conversation texts say which code to reply with', () => {
  const inquiry = smsText({ kind: 'inquiry', title: 'New inquiry: Okra', body: 'Marcus asked for 2 lb' }, 'K7P');
  if (!inquiry.includes('reply starting with #K7P') || !inquiry.includes('#K7P YES')) throw new Error(inquiry);
  const message = smsText({ kind: 'message', title: 'Marcus', body: 'See you Saturday' }, 'K7P');
  if (!message.includes('reply starting with #K7P')) throw new Error(message);
  eq(smsText({ kind: 'fresh', title: 'F', body: 'B' }, null), 'F: B (The Index. Reply STOP to opt out.)');
  // A malformed code is left out rather than sent.
  if (smsText({ kind: 'message', title: 'M', body: 'B' }, '<x>').includes('#')) throw new Error('bad code used');
});
