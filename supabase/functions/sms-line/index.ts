// The Index text line: lets anyone with a basic phone search the directory by SMS.
//
// Point a Twilio phone number's "A message comes in" webhook (HTTP POST) at this function:
//   https://<project-ref>.supabase.co/functions/v1/sms-line
// Required secrets (supabase secrets set ...):
//   TWILIO_AUTH_TOKEN      used to verify that requests really come from Twilio
//   TWILIO_WEBHOOK_URL     the exact public URL above (Twilio signs the URL it called)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
//
// Texts it understands:
//   HONEY            growers with honey in season, most recently verified first
//   HONEY LA         limited to a state (two-letter code)
//   EVENTS           the next three approved events
//   HELP             how to use the line
//   FIND HONEY       always searches, even for members with an open conversation
// Two-way texting: a member who opted in to texts can simply reply to a text from The Index.
//   - a reply to a message or inquiry text is posted in that conversation (farmers can answer
//     an inquiry with YES, PART or NO plus an optional note)
//   - SAFE or NEED <what you need> answers an open storm check-in
//   - REPLY <message> always goes to the conversation (useful while a check-in is open)
// Anything that isn't one of those falls back to a search.
// STOP / START: Twilio's built-in opt-out sends the carrier reply and blocks further texts, and still
// forwards the keyword here; we record it (sms_opt_in) and answer with an empty response.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { clean, routeText } from './route.ts';

type FarmHit = { name: string; city: string; state: string; how_to_buy: string[]; replies_by_sms: boolean };

const HELP =
  'The Index text line from Black Farmers Index. Text a product to find Black growers, like HONEY or OKRA. ' +
  'Add a state to narrow it: SHRIMP LA. Text EVENTS for what is coming up. If we texted you about a message, just reply to answer. Reply STOP to opt out.';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (Number(req.headers.get('content-length') ?? 0) > 16_384) return new Response('Too large', { status: 413 });

  const params: Record<string, string> = {};
  try {
    const raw = await req.text();
    if (raw.length > 16_384) return new Response('Too large', { status: 413 });
    for (const [k, v] of new URLSearchParams(raw)) params[k] = v;
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  if (!(await isFromTwilio(req.headers.get('X-Twilio-Signature'), params))) {
    return new Response('Forbidden', { status: 403 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const route = routeText(params.Body ?? '');
  const bare = clean(params.Body ?? '').toUpperCase().replace(/[^\p{L}]+/gu, '');
  // Twilio's Advanced Opt-Out tags opt-in texts with OptOutType=START, and YES is on its default opt-in
  // list. So a farmer's bare "YES" to an inquiry can arrive tagged as an opt-in: record the opt-in, then
  // still treat the text as the answer it is.
  const optOut = params.OptOutType === 'STOP' || route.type === 'optout';
  const optIn = !optOut && (params.OptOutType === 'START' || route.type === 'optin' || bare === 'YES');
  let reply: string | null;

  try {
    if (optOut || optIn) {
      // Twilio sends the carrier-required confirmation itself; we only record the choice.
      const { error } = await supabase.rpc('sms_set_opt_in', { p_from: params.From ?? '', p_opt_in: optIn });
      if (error) throw error;
    }
    if (optOut || route.type === 'optin') {
      reply = null;
    } else if (route.type === 'help') {
      reply = HELP;
    } else if (route.type === 'events') {
      reply = await upcomingEvents(supabase);
    } else if (route.type === 'search') {
      reply = await searchGrowers(supabase, route.keyword, route.state);
    } else {
      const { data, error } = await supabase.rpc('sms_inbound', { p_from: params.From ?? '', p_body: route.text });
      if (error) throw error;
      const result = data as { handled: boolean; reply?: string };
      reply = result.handled && result.reply ? result.reply : await searchGrowers(supabase, route.fallback.keyword, route.fallback.state);
    }
  } catch (e) {
    console.error(e);
    reply = 'Sorry, the Index text line is having trouble. Please try again in a few minutes.';
  }

  const body = reply === null ? '<Response/>' : `<Response><Message>${xml(reply)}</Message></Response>`;
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { 'Content-Type': 'text/xml' } });
});

async function upcomingEvents(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('events')
    .select('title, starts_at, place')
    .eq('status', 'approved')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at')
    .limit(3);
  if (error) throw error;
  return data?.length
    ? 'Coming up:\n' + data.map((e, i) => `${i + 1}) ${shortDate(e.starts_at)} ${e.title}, ${e.place}`).join('\n')
    : 'No upcoming events yet. Check back soon.';
}

async function searchGrowers(supabase: SupabaseClient, keyword: string, state?: string) {
  if (keyword.length < 2) return HELP;
  // Match a product that is in season, or a grower type. routeText() has already reduced the keyword
  // to letters, digits, spaces and hyphens, so it can't carry % or _ wildcards.
  const { data: products, error: pErr } = await supabase
    .from('farm_products')
    .select('farm_id')
    .eq('in_season', true)
    .ilike('name', `%${keyword}%`)
    .limit(200);
  if (pErr) throw pErr;
  const ids = [...new Set((products ?? []).map((p) => p.farm_id as string))];

  // Two plain queries rather than a hand-built or() filter, so nothing from the text is parsed as syntax.
  const select = 'id, name, city, state, how_to_buy, replies_by_sms, verified_at';
  const base = () => {
    let q = supabase.from('farms').select(select).eq('status', 'approved').order('verified_at', { ascending: false, nullsFirst: false }).limit(3);
    if (state) q = q.eq('state', state);
    return q;
  };
  const [byProduct, byCategory] = await Promise.all([
    ids.length ? base().in('id', ids) : Promise.resolve({ data: [], error: null }),
    base().overlaps('categories', [cap(keyword)]),
  ]);
  if (byProduct.error) throw byProduct.error;
  if (byCategory.error) throw byCategory.error;
  const seen = new Set<string>();
  const data = [...(byProduct.data ?? []), ...(byCategory.data ?? [])]
    .filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)))
    .slice(0, 3) as (FarmHit & { id: string })[];

  if (!data.length) {
    return `No growers found for ${keyword.toUpperCase()}${state ? ` in ${state}` : ''}. Try another word, or text HELP.`;
  }
  const lines = data.map((f, i) => {
    const how = f.how_to_buy[0];
    return `${i + 1}) ${f.name}, ${f.city} ${f.state}${how ? `. ${how}` : ''}`;
  });
  return `Black growers with ${keyword.toUpperCase()}${state ? ` in ${state}` : ''}:\n${lines.join('\n')}\nFind more on the Index app or blackfarmersindex.com`;
}

/** Twilio signs the full URL plus every POST parameter, sorted by name, with HMAC-SHA1. */
async function isFromTwilio(signature: string | null, params: Record<string, string>) {
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const url = Deno.env.get('TWILIO_WEBHOOK_URL');
  if (!token || !url || !signature) return false;
  const payload = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function cap(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function xml(s: string) {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}
