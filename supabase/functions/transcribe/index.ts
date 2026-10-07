// Writes a transcript for a voice note so it can be read as well as heard.
// Called by the app right after a voice note is sent: { message_id }.
// Uses any OpenAI-compatible speech-to-text endpoint:
//   TRANSCRIBE_API_KEY     required
//   TRANSCRIBE_API_URL     default https://api.openai.com/v1/audio/transcriptions
//   TRANSCRIBE_MODEL       default whisper-1
// Deployed with JWT verification on (the default): only signed-in members can call it,
// and only for a voice note they sent.

import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const { message_id } = await req.json();
    if (!message_id) return json({ error: 'message_id is required' }, 400);

    const url = Deno.env.get('SUPABASE_URL')!;
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: userData } = await asUser.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return json({ error: 'Sign in first' }, 401);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: msg } = await admin
      .from('messages')
      .select('id, sender_id, kind, audio_path, transcript, conversation_id')
      .eq('id', message_id)
      .maybeSingle();
    if (!msg || msg.kind !== 'voice' || !msg.audio_path) return json({ error: 'Not a voice note' }, 404);
    if (msg.sender_id !== uid) return json({ error: 'Only the sender can request a transcript' }, 403);
    // The recording must be a plain file in this conversation's own folder (no "../" tricks).
    if (!new RegExp(`^${msg.conversation_id}/[A-Za-z0-9_-]+\\.[A-Za-z0-9]{1,5}$`).test(msg.audio_path)) {
      return json({ error: 'Not a voice note' }, 404);
    }
    if (msg.transcript !== null) return json({ transcript: msg.transcript });

    const key = Deno.env.get('TRANSCRIBE_API_KEY');
    if (!key) return json({ error: 'Transcription is not set up yet' }, 501);

    const { data: audio, error: dlErr } = await admin.storage.from('voice-notes').download(msg.audio_path);
    if (dlErr || !audio) return json({ error: 'Could not read the recording' }, 500);

    const form = new FormData();
    form.append('file', new File([audio], msg.audio_path.split('/').pop() ?? 'note.m4a', { type: audio.type || 'audio/m4a' }));
    form.append('model', Deno.env.get('TRANSCRIBE_MODEL') ?? 'whisper-1');
    const res = await fetch(Deno.env.get('TRANSCRIBE_API_URL') ?? 'https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) return json({ error: `Transcription failed (${res.status})` }, 502);
    const { text } = await res.json();
    const transcript = String(text ?? '').trim();

    await admin.from('messages').update({ transcript }).eq('id', message_id);
    return json({ transcript });
  } catch (e) {
    console.error(e);
    return json({ error: 'Transcription failed' }, 500);
  }
});

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}
