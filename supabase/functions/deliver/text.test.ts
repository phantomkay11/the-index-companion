import { clip, isGsm7, smsText } from './text.ts';

function eq(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}\n     got ${JSON.stringify(actual)}`);
}
const segments = (s: string) => (isGsm7(s) ? (s.length <= 160 ? 1 : Math.ceil(s.length / 153)) : (Array.from(s).length <= 70 ? 1 : Math.ceil(Array.from(s).length / 67)));

Deno.test('texts stay within two segments, plain or Unicode', () => {
  const long = 'Okra and field peas ready this weekend. '.repeat(30);
  for (const body of [long, long + ' Fèm nan', '🍯🍯🍯 '.repeat(200), 'Fèm Kreyòl ' .repeat(60)]) {
    for (const kind of ['message', 'inquiry', 'checkin', 'broadcast']) {
      const t = smsText({ kind, title: 'Bayou Bloom Farm', body });
      if (segments(t) > 2) throw new Error(`${kind}: ${segments(t)} segments (${t.length} chars)`);
      if (!t.endsWith('(The Index. Reply STOP to opt out.)')) throw new Error('lost the STOP footer');
    }
  }
});

Deno.test('never cuts an emoji in half', () => {
  const t = clip('🍯'.repeat(50), 10);
  eq(Array.from(t).length, 10);
  if (t.includes('�') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(t)) throw new Error('split surrogate');
});

Deno.test('short texts are untouched and keep the reply hint', () => {
  eq(smsText({ kind: 'inquiry', title: 'New inquiry', body: '2 dozen eggs Saturday' }),
    'New inquiry: 2 dozen eggs Saturday Reply YES, PART or NO to answer. (The Index. Reply STOP to opt out.)');
});
