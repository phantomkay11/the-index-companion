import { routeText } from './route.ts';

function eq(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e}\n     got ${a}`);
}

Deno.test('commands', () => {
  eq(routeText(''), { type: 'help' });
  eq(routeText(' help '), { type: 'help' });
  eq(routeText('Events'), { type: 'events' });
  eq(routeText('FIND'), { type: 'help' });
});

Deno.test('FIND always searches', () => {
  eq(routeText('find honey la'), { type: 'search', keyword: 'honey', state: 'LA' });
  eq(routeText('FIND sweet potatoes'), { type: 'search', keyword: 'sweet potatoe', raw: 'sweet potatoes' });
  eq(routeText('FIND beekeepers'), { type: 'search', keyword: 'beekeeper', raw: 'beekeepers' });
});

Deno.test('opt-out and opt-in words, only as the whole text', () => {
  eq(routeText('STOP'), { type: 'optout' });
  eq(routeText('stop.'), { type: 'optout' });
  eq(routeText('Unsubscribe'), { type: 'optout' });
  eq(routeText('START'), { type: 'optin' });
  eq(routeText('Stop by the stand Saturday').type, 'reply');
});

Deno.test('HELP and EVENTS are commands only on their own', () => {
  eq(routeText('Help is on the way').type, 'reply');
  eq(routeText('Events at the farm moved to Sunday').type, 'reply');
  eq(routeText('help?'), { type: 'help' });
});

Deno.test('anything else may be a reply, with search as the fallback', () => {
  eq(routeText('HONEY LA'), { type: 'reply', text: 'HONEY LA', fallback: { type: 'search', keyword: 'honey', state: 'LA' } });
  eq(routeText('honeys'), { type: 'reply', text: 'honeys', fallback: { type: 'search', keyword: 'honey', raw: 'honeys' } });
  eq(routeText('Yes ready at 9'), { type: 'reply', text: 'Yes ready at 9', fallback: { type: 'search', keyword: 'yes ready at 9' } });
  eq(routeText('OK'), { type: 'reply', text: 'OK', fallback: { type: 'search', keyword: 'ok' } });
  eq(routeText('okra 70801'), { type: 'reply', text: 'okra 70801', fallback: { type: 'search', keyword: 'okra' } });
});
