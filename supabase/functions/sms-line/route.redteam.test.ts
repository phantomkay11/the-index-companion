// Red-team cases for routeText, written to break it. Each one asserts the safe behaviour.
import { clean, MAX_BODY, routeText } from './route.ts';

function eq(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e}\n     got ${a}`);
}

Deno.test('carrier opt-out and opt-in keywords are recognised, never posted as replies', () => {
  for (const kw of ['STOP', 'stop', 'Stop ', 'STOP.', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'STOPALL', 'REVOKE', 'OPTOUT']) {
    eq([kw, routeText(kw).type], [kw, 'optout']);
  }
  for (const kw of ['START', 'unstop', 'Start!']) eq([kw, routeText(kw).type], [kw, 'optin']);
  // A sentence that merely starts with "end" or "stop" is a normal reply.
  eq(routeText('Stop by Saturday after 9').type, 'reply');
  eq(routeText('End of the row has okra').type, 'reply');
});

Deno.test('HELP / EVENTS with punctuation still work', () => {
  eq(routeText('HELP!').type, 'help');
  eq(routeText('help?').type, 'help');
  eq(routeText('Events.').type, 'events');
});

Deno.test('unicode whitespace is treated as whitespace', () => {
  eq(routeText(' HELP '), { type: 'help' });
  eq(routeText('　'), { type: 'help' });
});

Deno.test('query metacharacters never reach the keyword', () => {
  eq(routeText('FIND honey},state.eq.LA'), { type: 'search', keyword: 'honeystateeqla' });
  eq(routeText('FIND %'), { type: 'help' });
  eq(routeText('FIND _'), { type: 'help' });
  eq(routeText('FIND sweet-potato (red)'), { type: 'search', keyword: 'sweet-potato red' });
});

Deno.test('accented text survives; emoji are dropped from search keywords', () => {
  eq(routeText('FIND 🍯 miel'), { type: 'search', keyword: 'miel' });
  eq(routeText('Sí, lo tengo'), { type: 'reply', text: 'Sí, lo tengo', fallback: { type: 'search', keyword: 'sí lo tengo' } });
});

Deno.test('huge bodies are capped, on whole characters', () => {
  const r = routeText('FIND ' + 'a'.repeat(100_000));
  if (r.type !== 'search' || r.keyword.length > 40) throw new Error(`keyword not capped: ${r.type}`);
  const emoji = clean('🍯'.repeat(5000));
  eq(Array.from(emoji).length, MAX_BODY);
  if (emoji.includes('�') || /[\uD800-\uDBFF]$/.test(emoji)) throw new Error('split a surrogate pair');
});

Deno.test('control characters are stripped (they would break the TwiML reply)', () => {
  eq(clean('hi\u0000\u0007 there\u001b'), 'hi there');
});

Deno.test('plurals: common produce works and words ending in -ss are left alone', () => {
  const kw = (t: string) => (routeText(t) as { keyword: string }).keyword;
  eq(kw('FIND grass'), 'grass');
  eq(kw('FIND molasses'), 'molasses');
  eq(kw('FIND tomatoes'), 'tomato');
  eq(kw('FIND berries'), 'berry');
  eq(kw('FIND pecans'), 'pecan');
});
