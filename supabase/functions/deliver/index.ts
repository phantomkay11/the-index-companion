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

import { smsText } from './text.ts';

type Notice = { id: string; user_id: string; kind: string; title: string; body: string; data: Record<string, unknown> };
type Delivery = { id: string; channel: 'push' | 'sms' | 'email'; attempts: number; notification: Notice };
type Prefs = { user_id: string; push_token: string | null; phone: string | null; phone_verified_at: string | null; sms_opt_in: boolean; email_opt_in: boolean };
type Result = { id: string; ok: boolean; skip?: boolean; error?: string };

const MAX_ATTEMPTS = 4;
const BATCH = 300;
// Stop starting new sends after this long so a run finishes well inside the edge function limit;
// anything unsent goes back to the queue for the next run.
const TIME_BUDGET_MS = 45_000;

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || !sameSecret(req.headers.get('x-cron-secret') ?? '', secret)) {
    return new Response('Forbidden', { status: 403 });
  }
  const started = Date.now();

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: reminders, error: remErr } = await db.rpc('run_due_reminders');
  if (remErr) console.error('reminders', remErr.message);

  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_FROM');
  const twilio = (to: string, body: string) =>
    fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + btoa(`${sid}:${token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: to, From: from!, Body: body }),
    });

  // Phone confirmation codes go first: someone is waiting on the settings screen.
  let codesSent = 0;
  if (sid && token && from) {
    const { data: codes, error: codeErr } = await db.rpc('claim_phone_codes');
    if (codeErr) console.error('codes', codeErr.message);
    for (const c of (codes ?? []) as { user_id: string; phone: string; code: string }[]) {
      try {
        const res = await twilio(c.phone, `${c.code} is your code to confirm this number on The Index. It expires in 10 minutes. If you did not ask for it, ignore this text.`);
        if (res.ok) codesSent++;
        else await db.from('phone_verifications').update({ send_status: 'failed', last_error: short(`Twilio ${res.status}: ${await res.text()}`) }).eq('user_id', c.user_id);
      } catch (e) {
        await db.from('phone_verifications').update({ send_status: 'failed', last_error: short(String(e)) }).eq('user_id', c.user_id);
      }
    }
  }

  // Claim a batch. Claimed rows are 'sending', so an overlapping run can't pick them up too.
  const { data: claimed, error } = await db.rpc('claim_deliveries', { p_limit: BATCH });
  if (error) return json({ error: 'Could not read the queue' }, 500, error.message);
  const claimedRows = (claimed ?? []) as { id: string; notification_id: string; channel: Delivery['channel']; attempts: number }[];
  if (!claimedRows.length) return json({ reminders_queued: reminders ?? 0, codes_sent: codesSent, processed: 0 });

  const release = async (ids: string[]) => {
    if (ids.length) await db.from('notification_deliveries').update({ status: 'pending', claimed_at: null }).in('id', ids);
  };

  const { data: notes, error: nErr } = await db
    .from('notifications')
    .select('id, user_id, kind, title, body, data')
    .in('id', [...new Set(claimedRows.map((r) => r.notification_id))]);
  if (nErr) {
    await release(claimedRows.map((r) => r.id));
    return json({ error: 'Could not read notifications' }, 500, nErr.message);
  }
  const noteById = new Map((notes ?? []).map((n) => [n.id as string, n as Notice]));
  const deliveries: Delivery[] = claimedRows
    .filter((r) => noteById.has(r.notification_id))
    .map((r) => ({ id: r.id, channel: r.channel, attempts: r.attempts, notification: noteById.get(r.notification_id)! }));

  const userIds = [...new Set(deliveries.map((d) => d.notification.user_id))];
  const { data: prefs, error: prefsErr } = await db
    .from('contact_prefs')
    .select('user_id, push_token, phone, phone_verified_at, sms_opt_in, email_opt_in')
    .in('user_id', userIds);
  if (prefsErr) {
    // Never skip a whole batch because of a passing database error: put it back and try next minute.
    await release(claimedRows.map((r) => r.id));
    return json({ error: 'Could not read contact preferences' }, 500, prefsErr.message);
  }
  const prefsByUser = new Map(((prefs ?? []) as Prefs[]).map((p) => [p.user_id, p]));

  const counts = { sent: 0, skipped: 0, failed: 0, retry: 0 };
  const done = new Set<string>();
  const record = async (d: Delivery, r: Result) => {
    done.add(d.id);
    const attempts = d.attempts + 1;
    const status = r.ok ? 'sent' : r.skip ? 'skipped' : attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    counts[r.ok ? 'sent' : r.skip ? 'skipped' : status === 'failed' ? 'failed' : 'retry']++;
    await db
      .from('notification_deliveries')
      .update({
        status,
        attempts,
        claimed_at: null,
        last_error: r.error ? short(r.error) : null,
        sent_at: r.ok ? new Date().toISOString() : null,
        // Back off 2, 4, 8 minutes between tries so a short outage doesn't burn every attempt.
        next_attempt_at: new Date(Date.now() + 2 ** attempts * 60_000).toISOString(),
      })
      .eq('id', d.id);
  };
  const outOfTime = () => Date.now() - started > TIME_BUDGET_MS;

  // Push: Expo accepts up to 100 messages per request.
  const pushes = deliveries.filter((d) => d.channel === 'push');
  for (let i = 0; i < pushes.length && !outOfTime(); i += 100) {
    const chunk = pushes.slice(i, i + 100).map((d) => ({ d, token: prefsByUser.get(d.notification.user_id)?.push_token ?? null }));
    for (const c of chunk.filter((c) => !c.token)) await record(c.d, { id: c.d.id, ok: false, skip: true, error: 'no push token' });
    const sendable = chunk.filter((c) => c.token);
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
      const body = await res.json().catch(() => ({}));
      const tickets: { status: string; message?: string; details?: { error?: string } }[] = body.data ?? [];
      for (let j = 0; j < sendable.length; j++) {
        const t = tickets[j];
        const d = sendable[j].d;
        if (t?.status === 'ok') await record(d, { id: d.id, ok: true });
        else if (t?.details?.error === 'DeviceNotRegistered') {
          await db.from('contact_prefs').update({ push_token: null }).eq('user_id', d.notification.user_id);
          await record(d, { id: d.id, ok: false, skip: true, error: 'device no longer registered' });
        } else await record(d, { id: d.id, ok: false, error: t?.message ?? `HTTP ${res.status}` });
      }
    } catch (e) {
      for (const c of sendable) await record(c.d, { id: c.d.id, ok: false, error: String(e) });
    }
  }

  // SMS: verified numbers only.
  for (const d of deliveries.filter((x) => x.channel === 'sms')) {
    if (outOfTime()) break;
    const p = prefsByUser.get(d.notification.user_id);
    if (!sid || !token || !from) {
      await record(d, { id: d.id, ok: false, skip: true, error: 'sms not configured' });
      continue;
    }
    if (!p?.sms_opt_in || !p.phone || !p.phone_verified_at) {
      await record(d, { id: d.id, ok: false, skip: true, error: 'not opted in or number not confirmed' });
      continue;
    }
    try {
      const res = await twilio(p.phone, smsText(d.notification));
      if (res.ok) await record(d, { id: d.id, ok: true });
      else {
        const text = await res.text();
        // 21610: the member texted STOP. Respect it everywhere, not just at Twilio.
        if (/"code"\s*:\s*21610/.test(text)) {
          await db.from('contact_prefs').update({ sms_opt_in: false }).eq('user_id', d.notification.user_id);
          await record(d, { id: d.id, ok: false, skip: true, error: 'member opted out (STOP)' });
        } else await record(d, { id: d.id, ok: false, error: `Twilio ${res.status}: ${text}` });
      }
    } catch (e) {
      await record(d, { id: d.id, ok: false, error: String(e) });
    }
  }

  // Email
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const emailFrom = Deno.env.get('EMAIL_FROM');
  for (const d of deliveries.filter((x) => x.channel === 'email')) {
    if (outOfTime()) break;
    const p = prefsByUser.get(d.notification.user_id);
    if (!resendKey || !emailFrom || !p?.email_opt_in) {
      await record(d, { id: d.id, ok: false, skip: true, error: 'email not configured or not opted in' });
      continue;
    }
    const { data: user, error: userErr } = await db.auth.admin.getUserById(d.notification.user_id);
    if (userErr) {
      await record(d, { id: d.id, ok: false, error: `account lookup failed: ${userErr.message}` }); // retried later
      continue;
    }
    const to = user?.user?.email;
    if (!to) {
      await record(d, { id: d.id, ok: false, skip: true, error: 'no email on account' });
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
          subject: d.notification.title.replace(/[\r\n]+/g, ' ').slice(0, 200),
          text: `${d.notification.body}${link}\n\nOpen The Index app to see more. You can change email settings in the app under Settings.`,
        }),
      });
      await record(d, res.ok ? { id: d.id, ok: true } : { id: d.id, ok: false, error: `Resend ${res.status}: ${await res.text()}` });
    } catch (e) {
      await record(d, { id: d.id, ok: false, error: String(e) });
    }
  }

  // Anything not attempted (out of time, or a missing notification) goes back to the queue.
  await release(claimedRows.map((r) => r.id).filter((id) => !done.has(id)));

  return json({ reminders_queued: reminders ?? 0, codes_sent: codesSent, processed: done.size, ...counts });
});

function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function short(s: string) {
  return s.slice(0, 500);
}

function json(body: unknown, status = 200, log?: string) {
  if (log) console.error(log);
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
