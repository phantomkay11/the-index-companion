// Sends queued notifications by push (Expo), text message (Twilio) and email (Resend),
// and queues due event and deadline reminders first.
//
// Run it every minute with pg_cron + pg_net (see docs/NOTIFICATIONS.md), deployed with --no-verify-jwt.
// Secrets:
//   CRON_SECRET                         required; callers send it as the x-cron-secret header
//   EXPO_ACCESS_TOKEN                   optional; only if "enhanced push security" is on in Expo
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM   optional; SMS is skipped without them
//   RESEND_API_KEY, EMAIL_FROM          optional; email is skipped without them
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';

type Delivery = {
  id: string;
  channel: 'push' | 'sms' | 'email';
  attempts: number;
  notification: { id: string; user_id: string; kind: string; title: string; body: string; data: Record<string, unknown> };
};

const MAX_ATTEMPTS = 3;
const BATCH = 300;

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('Forbidden', { status: 403 });
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: reminders, error: remErr } = await db.rpc('run_due_reminders');
  if (remErr) console.error('reminders', remErr.message);

  const { data, error } = await db
    .from('notification_deliveries')
    .select('id, channel, attempts, notification:notifications(id, user_id, kind, title, body, data)')
    .eq('status', 'pending')
    .order('created_at')
    .limit(BATCH);
  if (error) return json({ error: error.message }, 500);
  const deliveries = (data ?? []) as unknown as Delivery[];

  const userIds = [...new Set(deliveries.map((d) => d.notification.user_id))];
  const { data: prefs } = userIds.length
    ? await db.from('contact_prefs').select('user_id, push_token, phone, sms_opt_in, email_opt_in').in('user_id', userIds)
    : { data: [] };
  const prefsByUser = new Map((prefs ?? []).map((p) => [p.user_id as string, p]));

  const results: { id: string; ok: boolean; skip?: boolean; error?: string }[] = [];

  // Push: Expo accepts up to 100 messages per request.
  const pushes = deliveries.filter((d) => d.channel === 'push');
  for (let i = 0; i < pushes.length; i += 100) {
    const chunk = pushes.slice(i, i + 100).map((d) => ({ d, token: prefsByUser.get(d.notification.user_id)?.push_token as string | null }));
    const sendable = chunk.filter((c) => c.token);
    chunk.filter((c) => !c.token).forEach((c) => results.push({ id: c.d.id, ok: false, skip: true, error: 'no push token' }));
    if (!sendable.length) continue;
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(Deno.env.get('EXPO_ACCESS_TOKEN') ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` } : {}),
        },
        body: JSON.stringify(
          sendable.map((c) => ({
            to: c.token,
            title: c.d.notification.title,
            body: c.d.notification.body,
            data: c.d.notification.data,
            sound: 'default',
            channelId: 'default',
          })),
        ),
      });
      const body = await res.json();
      const tickets: { status: string; message?: string; details?: { error?: string } }[] = body.data ?? [];
      for (let j = 0; j < sendable.length; j++) {
        const t = tickets[j];
        if (t?.status === 'ok') results.push({ id: sendable[j].d.id, ok: true });
        else {
          results.push({ id: sendable[j].d.id, ok: false, error: t?.message ?? `HTTP ${res.status}` });
          if (t?.details?.error === 'DeviceNotRegistered') {
            await db.from('contact_prefs').update({ push_token: null }).eq('user_id', sendable[j].d.notification.user_id);
          }
        }
      }
    } catch (e) {
      sendable.forEach((c) => results.push({ id: c.d.id, ok: false, error: String(e) }));
    }
  }

  // SMS
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_FROM');
  for (const d of deliveries.filter((x) => x.channel === 'sms')) {
    const p = prefsByUser.get(d.notification.user_id);
    if (!sid || !token || !from || !p?.sms_opt_in || !p?.phone) {
      results.push({ id: d.id, ok: false, skip: true, error: 'sms not configured or not opted in' });
      continue;
    }
    const text = `${d.notification.title}: ${d.notification.body}`.slice(0, 280) + ' (The Index. Reply STOP to opt out.)';
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + btoa(`${sid}:${token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: p.phone as string, From: from, Body: text }),
      });
      results.push(res.ok ? { id: d.id, ok: true } : { id: d.id, ok: false, error: `Twilio ${res.status}: ${await res.text()}` });
    } catch (e) {
      results.push({ id: d.id, ok: false, error: String(e) });
    }
  }

  // Email
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const emailFrom = Deno.env.get('EMAIL_FROM');
  for (const d of deliveries.filter((x) => x.channel === 'email')) {
    const p = prefsByUser.get(d.notification.user_id);
    if (!resendKey || !emailFrom || !p?.email_opt_in) {
      results.push({ id: d.id, ok: false, skip: true, error: 'email not configured or not opted in' });
      continue;
    }
    const { data: user } = await db.auth.admin.getUserById(d.notification.user_id);
    const to = user?.user?.email;
    if (!to) {
      results.push({ id: d.id, ok: false, skip: true, error: 'no email on account' });
      continue;
    }
    const link = typeof d.notification.data?.link_url === 'string' ? `\n\n${d.notification.data.link_url}` : '';
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: emailFrom,
          to,
          subject: d.notification.title,
          text: `${d.notification.body}${link}\n\nOpen The Index app to see more. You can change email settings in the app under Settings.`,
        }),
      });
      results.push(res.ok ? { id: d.id, ok: true } : { id: d.id, ok: false, error: `Resend ${res.status}: ${await res.text()}` });
    } catch (e) {
      results.push({ id: d.id, ok: false, error: String(e) });
    }
  }

  // Record outcomes. Failures retry on later runs until MAX_ATTEMPTS.
  const byId = new Map(deliveries.map((d) => [d.id, d]));
  for (const r of results) {
    const attempts = (byId.get(r.id)?.attempts ?? 0) + 1;
    const status = r.ok ? 'sent' : r.skip ? 'skipped' : attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    await db
      .from('notification_deliveries')
      .update({ status, attempts, last_error: r.error ?? null, sent_at: r.ok ? new Date().toISOString() : null })
      .eq('id', r.id);
  }

  return json({
    reminders_queued: reminders ?? 0,
    processed: results.length,
    sent: results.filter((r) => r.ok).length,
    skipped: results.filter((r) => r.skip).length,
    failed: results.filter((r) => !r.ok && !r.skip).length,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
