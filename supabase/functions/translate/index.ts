// Translates a message or listing into the member's language on request: { text, target }.
// target is one of: en, es, fr, ht, pt.
// Provider (pick one):
//   DEEPL_API_KEY            DeepL (free or pro key). Note: DeepL does not support Haitian Creole.
//   LIBRETRANSLATE_URL       a LibreTranslate server (self-hosted or hosted), plus LIBRETRANSLATE_API_KEY if it needs one
// Deployed with JWT verification on (the default). That alone only proves the caller has the app's public
// key, so the function also checks for a signed-in member and a daily character quota.

import { createClient } from 'npm:@supabase/supabase-js@2';

const LANGS = ['en', 'es', 'fr', 'ht', 'pt'];
const MAX_CHARS = 2000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const { text, target } = await req.json();
    if (typeof text !== 'string' || !text.trim()) return json({ error: 'text is required' }, 400);
    if (!LANGS.includes(target)) return json({ error: `target must be one of ${LANGS.join(', ')}` }, 400);
    const input = Array.from(text).slice(0, MAX_CHARS).join('');

    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: userData } = await asUser.auth.getUser();
    if (!userData.user) return json({ error: 'Sign in first' }, 401);
    const { data: allowed, error: quotaErr } = await asUser.rpc('use_translation_quota', { p_chars: input.length });
    if (quotaErr) throw quotaErr;
    if (!allowed) return json({ error: 'You have reached today\'s translation limit. Try again tomorrow.' }, 429);

    const deepl = Deno.env.get('DEEPL_API_KEY');
    const libre = Deno.env.get('LIBRETRANSLATE_URL');

    if (deepl && target !== 'ht') {
      const host = deepl.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
      const res = await fetch(`${host}/v2/translate`, {
        method: 'POST',
        headers: { Authorization: `DeepL-Auth-Key ${deepl}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: [input], target_lang: target === 'en' ? 'EN-US' : target === 'pt' ? 'PT-BR' : target.toUpperCase() }),
      });
      if (!res.ok) return json({ error: `Translation failed (${res.status})` }, 502);
      const body = await res.json();
      const t = body.translations?.[0];
      return json({ translation: t?.text ?? '', detected: String(t?.detected_source_language ?? '').toLowerCase() });
    }

    if (libre) {
      const res = await fetch(`${libre.replace(/\/$/, '')}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: input, source: 'auto', target, format: 'text', api_key: Deno.env.get('LIBRETRANSLATE_API_KEY') ?? undefined }),
      });
      if (!res.ok) return json({ error: `Translation failed (${res.status})` }, 502);
      const body = await res.json();
      return json({ translation: body.translatedText ?? '', detected: body.detectedLanguage?.language ?? '' });
    }

    return json({ error: 'Translation is not set up yet' }, 501);
  } catch (e) {
    console.error(e);
    return json({ error: 'Translation failed. Please try again.' }, 500);
  }
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}
