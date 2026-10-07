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

Deno.test('punctuation, filler words and states', () => {
  const fb = (s: string) => {
    const r = routeText(s);
    return r.type === 'reply' ? r.fallback : r;
  };
  eq(fb('Honey?'), { type: 'search', keyword: 'honey' });
  eq(fb('okra.'), { type: 'search', keyword: 'okra' });
  eq(fb('honey, LA'), { type: 'search', keyword: 'honey', state: 'LA' });
  eq(fb('HONEY LA.'), { type: 'search', keyword: 'honey', state: 'LA' });
  eq(fb('Honey in LA'), { type: 'search', keyword: 'honey', state: 'LA' });
  eq(fb('eggs or honey'), { type: 'search', keyword: 'egg', raw: 'eggs' });
  eq(routeText('find okra in la'), { type: 'search', keyword: 'okra', state: 'LA' });
  eq(routeText('find me honey'), { type: 'search', keyword: 'honey' });
  eq(routeText('find %'), { type: 'search', keyword: '' }); // an empty search answers with HELP
  eq(fb('LA'), { type: 'search', keyword: 'la' });
  eq(fb('honey near ME'), { type: 'search', keyword: 'honey', state: 'ME' });
  eq('state' in fb('thanks for getting back to me'), false);
  eq(fb('okra in'), { type: 'search', keyword: 'okra', state: 'IN' });
  eq(fb('FIND HONEY 70801-1234'), { type: 'search', keyword: 'honey' });
});

Deno.test('YES alone may re-subscribe an opted-out number, and is otherwise a reply', () => {
  eq(routeText('yes'), { type: 'reply', text: 'yes', fallback: { type: 'search', keyword: 'ye', raw: 'yes' }, maybeOptIn: true });
  eq(routeText('YES!').type, 'reply');
  eq('maybeOptIn' in routeText('Yes ready at 9'), false);
  eq(routeText('unstop'), { type: 'optin' });
});
