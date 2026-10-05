// Translates a message or listing into the member's language on request: { text, target }.
// target is one of: en, es, fr, ht, pt.
// Provider (pick one):
//   DEEPL_API_KEY            DeepL (free or pro key). Note: DeepL does not support Haitian Creole.
//   LIBRETRANSLATE_URL       a LibreTranslate server (self-hosted or hosted), plus LIBRETRANSLATE_API_KEY if it needs one
// Deployed with JWT verification on (the default), so only signed-in members can call it.

const LANGS = ['en', 'es', 'fr', 'ht', 'pt'];
const MAX_CHARS = 2000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const { text, target } = await req.json();
    if (typeof text !== 'string' || !text.trim()) return json({ error: 'text is required' }, 400);
    if (!LANGS.includes(target)) return json({ error: `target must be one of ${LANGS.join(', ')}` }, 400);
    const input = text.slice(0, MAX_CHARS);

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
    return json({ error: String(e) }, 500);
  }
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}
