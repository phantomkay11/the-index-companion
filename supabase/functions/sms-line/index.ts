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
// Anything that isn't one of those falls back to a search.
// STOP / START are handled by Twilio's built-in opt-out before they reach this function.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { routeText } from './route.ts';

// BFI's grower types (src/lib/bfi.ts).
const GROWER_TYPES = ['Row crops', 'Ranchers', 'Vegetables & fruit', 'Beekeepers', 'Fisherfolk', 'Foragers', 'Vintners', 'Organic'];

type FarmHit = { name: string; city: string; state: string; how_to_buy: string[]; replies_by_sms: boolean };

const HELP =
  'The Index text line from Black Farmers Index. Text a product to find Black growers, like HONEY or OKRA. ' +
  'Add a state to narrow it: SHRIMP LA. Text EVENTS for what is coming up. If we texted you about a message, just reply to answer. Reply STOP to opt out.';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const pairs: [string, string][] = [];
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    pairs.push([k, String(v)]);
    params[k] = String(v);
  }

  if (!(await isFromTwilio(req.headers.get('X-Twilio-Signature'), pairs))) {
    return new Response('Forbidden', { status: 403 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const route = routeText(params.Body ?? '');
  let reply: string;

  // STOP / START: record the choice. Twilio sends its own confirmation, so reply with nothing.
  if (route.type === 'optout' || route.type === 'optin') {
    const { error } = await supabase.rpc('sms_opt_out', { p_from: params.From ?? '', p_opt_in: route.type === 'optin' });
    if (error) console.error(error);
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
  }

  try {
    if (route.type === 'help') {
      reply = HELP;
    } else if (route.type === 'events') {
      reply = await upcomingEvents(supabase);
    } else if (route.type === 'search') {
      reply = await searchGrowers(supabase, route.keyword, route.state, route.raw);
    } else {
      const { data, error } = await supabase.rpc('sms_inbound', { p_from: params.From ?? '', p_body: route.text });
      if (error) throw error;
      const result = data as { handled: boolean; reply?: string };
      reply = result.handled && result.reply ? result.reply : await searchGrowers(supabase, route.fallback.keyword, route.fallback.state, route.fallback.raw);
    }
  } catch (e) {
    console.error(e);
    reply = 'Sorry, the Index text line is having trouble. Please try again in a few minutes.';
  }

  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xml(reply)}</Message></Response>`, {
    headers: { 'Content-Type': 'text/xml' },
  });
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

async function searchGrowers(supabase: SupabaseClient, keyword: string, state?: string, raw?: string) {
  if (!keyword) return HELP;
  // Match a product that is in season, or a grower type.
  const { data: products, error: pErr } = await supabase
    .from('farm_products')
    .select('farm_id')
    .eq('in_season', true)
    .ilike('name', `%${keyword}%`)
    .limit(200);
  if (pErr) throw pErr;
  const ids = [...new Set((products ?? []).map((p) => p.farm_id as string))];

  let q = supabase
    .from('farms')
    .select('name, city, state, how_to_buy, replies_by_sms')
    .eq('status', 'approved')
    .order('verified_at', { ascending: false, nullsFirst: false })
    .limit(3);
  // Grower types come from a fixed list; match the text against it, ignoring case and plurals.
  const words = [raw, keyword].filter(Boolean).map((w) => w!.toLowerCase());
  const kinds = GROWER_TYPES.filter((g) => {
    const name = g.toLowerCase();
    return words.some((w) => name === w || name === `${w}s` || name.replace(/s$/, '') === w || (w.length >= 4 && name.startsWith(w)));
  });
  const kindList = kinds.map((k) => `"${k}"`).join(',');
  if (ids.length && kinds.length) q = q.or(`id.in.(${ids.join(',')}),categories.ov.{${kindList}}`);
  else if (ids.length) q = q.in('id', ids);
  else if (kinds.length) q = q.overlaps('categories', kinds);
  else return `No growers found for ${keyword.toUpperCase()}${state ? ` in ${state}` : ''}. Try another word, or text HELP.`;
  if (state) q = q.eq('state', state);
  const { data: rows, error } = await q;
  if (error) throw error;
  const data = (rows ?? []) as FarmHit[];

  if (!data.length) {
    return `No growers found for ${keyword.toUpperCase()}${state ? ` in ${state}` : ''}. Try another word, or text HELP.`;
  }
  const lines = data.map((f, i) => {
    const how = f.how_to_buy[0];
    return `${i + 1}) ${f.name}, ${f.city} ${f.state}${how ? `. ${how}` : ''}`;
  });
  return `Black growers with ${keyword.toUpperCase()}${state ? ` in ${state}` : ''}:\n${lines.join('\n')}\nFind more on the Index app or blackfarmersindex.com`;
}

/** Twilio signs the full URL plus every POST parameter (repeated keys included), sorted by name, with HMAC-SHA1. */
async function isFromTwilio(signature: string | null, pairs: [string, string][]) {
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const url = Deno.env.get('TWILIO_WEBHOOK_URL');
  if (!token || !url || !signature) return false;
  const sorted = pairs.map((p, i) => [p, i] as const).sort((a, b) => (a[0][0] < b[0][0] ? -1 : a[0][0] > b[0][0] ? 1 : a[1] - b[1]));
  const payload = url + sorted.map(([[k, v]]) => k + v).join('');
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

function xml(s: string) {
  // Drop control characters XML can't carry, then escape.
  // deno-lint-ignore no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}
