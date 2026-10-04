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
// STOP / START are handled by Twilio's built-in opt-out before they reach this function.

import { createClient } from 'npm:@supabase/supabase-js@2';

const STATES: Record<string, string> = {
  AL: 'AL', AK: 'AK', AZ: 'AZ', AR: 'AR', CA: 'CA', CO: 'CO', CT: 'CT', DE: 'DE', DC: 'DC', FL: 'FL', GA: 'GA', HI: 'HI',
  ID: 'ID', IL: 'IL', IN: 'IN', IA: 'IA', KS: 'KS', KY: 'KY', LA: 'LA', ME: 'ME', MD: 'MD', MA: 'MA', MI: 'MI', MN: 'MN',
  MS: 'MS', MO: 'MO', MT: 'MT', NE: 'NE', NV: 'NV', NH: 'NH', NJ: 'NJ', NM: 'NM', NY: 'NY', NC: 'NC', ND: 'ND', OH: 'OH',
  OK: 'OK', OR: 'OR', PA: 'PA', PR: 'PR', RI: 'RI', SC: 'SC', SD: 'SD', TN: 'TN', TX: 'TX', UT: 'UT', VT: 'VT', VA: 'VA',
  VI: 'VI', WA: 'WA', WV: 'WV', WI: 'WI', WY: 'WY', GU: 'GU',
};

const HELP =
  'The Index text line from Black Farmers Index. Text a product to find Black growers, like HONEY or OKRA. ' +
  'Add a state to narrow it: SHRIMP LA. Text EVENTS for what is coming up. Reply STOP to opt out.';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  if (!(await isFromTwilio(req.headers.get('X-Twilio-Signature'), params))) {
    return new Response('Forbidden', { status: 403 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const words = (params.Body ?? '').trim().toUpperCase().split(/\s+/).filter(Boolean);
  let reply: string;

  try {
    if (!words.length || words[0] === 'HELP' || words[0] === 'INFO') {
      reply = HELP;
    } else if (words[0] === 'EVENTS' || words[0] === 'EVENTOS') {
      const { data, error } = await supabase
        .from('events')
        .select('title, starts_at, place')
        .eq('status', 'approved')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
        .limit(3);
      if (error) throw error;
      reply = data?.length
        ? 'Coming up:\n' + data.map((e, i) => `${i + 1}) ${shortDate(e.starts_at)} ${e.title}, ${e.place}`).join('\n')
        : 'No upcoming events yet. Check back soon.';
    } else {
      const state = words.find((w) => STATES[w]);
      const keyword = words.filter((w) => w !== state && !/^\d{5}$/.test(w)).join(' ').toLowerCase().replace(/s$/, '');
      reply = await searchGrowers(supabase, keyword, state);
    }
  } catch (e) {
    console.error(e);
    reply = 'Sorry, the Index text line is having trouble. Please try again in a few minutes.';
  }

  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xml(reply)}</Message></Response>`, {
    headers: { 'Content-Type': 'text/xml' },
  });
});

async function searchGrowers(supabase: ReturnType<typeof createClient>, keyword: string, state?: string) {
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
  q = ids.length ? q.or(`id.in.(${ids.join(',')}),categories.cs.{${cap(keyword)}}`) : q.contains('categories', [cap(keyword)]);
  if (state) q = q.eq('state', state);
  const { data, error } = await q;
  if (error) throw error;

  if (!data?.length) {
    return `No growers found for ${keyword.toUpperCase()}${state ? ` in ${state}` : ''}. Try another word, or text HELP.`;
  }
  const lines = data.map((f, i) => {
    const how = (f.how_to_buy as string[])[0];
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
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}
