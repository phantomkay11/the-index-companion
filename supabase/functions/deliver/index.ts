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
  body_override: string | null;
  to_phone: string | null;
  notification: { id: string; user_id: string; kind: string; title: string; body: string; data: Record<string, unknown> };
};

type Result = { id: string; ok: boolean; skip?: boolean; error?: string };

/** Expo push tokens look like ExponentPushToken[...] or ExpoPushToken[...]; anything else poisons a batch. */
export const isExpoToken = (t: unknown): t is string => typeof t === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(t);

const MAX_ATTEMPTS = 3;
const BATCH = 100; // small enough to finish well inside the function's time limit

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

  // Claim a batch atomically, so an overlapping run can't send the same message twice.
  const { data: claimed, error: claimErr } = await db.rpc('claim_deliveries', { p_limit: BATCH });
  if (claimErr) return json({ error: 'Could not claim deliveries' }, 500);
  const claimedRows = (claimed ?? []) as {
    id: string;
    channel: Delivery['channel'];
    attempts: number;
    body_override: string | null;
    to_phone: string | null;
    notification_id: string;
  }[];
  const noteIds = [...new Set(claimedRows.map((d) => d.notification_id))];
  const { data: notes, error: notesErr } = noteIds.length
    ? await db.from('notifications').select('id, user_id, kind, title, body, data').in('id', noteIds)
    : { data: [], error: null };
  if (notesErr) {
    // Hand the batch straight back rather than leaving it stuck until the 10-minute reset.
    await db.from('notification_deliveries').update({ status: 'pending' }).in('id', claimedRows.map((d) => d.id));
    return json({ error: 'Could not load notifications' }, 500);
  }
  const notesById = new Map((notes ?? []).map((n) => [n.id as string, n as Delivery['notification']]));
  const deliveries: Delivery[] = claimedRows
    .filter((d) => notesById.has(d.notification_id))
    .map((d) => ({
      id: d.id,
      channel: d.channel,
      attempts: d.attempts,
      body_override: d.body_override,
      to_phone: d.to_phone,
      notification: notesById.get(d.notification_id)!,
    }));

  const userIds = [...new Set(deliveries.map((d) => d.notification.user_id))];
  const { data: prefs } = userIds.length
    ? await db.from('contact_prefs').select('user_id, push_token, phone, sms_opt_in, email_opt_in, phone_verified_at').in('user_id', userIds)
    : { data: [] };
  const prefsByUser = new Map((prefs ?? []).map((p) => [p.user_id as string, p]));

  const results: Result[] = [];
  // Record each outcome as soon as it's known. Failures go back to pending until MAX_ATTEMPTS.
  const byId = new Map(deliveries.map((d) => [d.id, d]));
  const record = async (r: Result) => {
    results.push(r);
    const attempts = (byId.get(r.id)?.attempts ?? 0) + 1;
    const status = r.ok ? 'sent' : r.skip ? 'skipped' : attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
    const patch = { status, attempts, last_error: r.error?.slice(0, 500) ?? null, sent_at: r.ok ? new Date().toISOString() : null };
    // If the write fails, try once more; a row left "sending" is retried only after the 10-minute reset,
    // which counts it as an attempt, so a sent message can't loop.
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      const { error } = await db.from('notification_deliveries').update(patch).eq('id', r.id);
      if (!error) return;
      console.error('could not record delivery', r.id, error.message);
    }
  };

  // Push: Expo accepts up to 100 messages per request.
  const pushes = deliveries.filter((d) => d.channel === 'push');
  const sendPush = async (batch: { d: Delivery; token: string }[]) => {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(Deno.env.get('EXPO_ACCESS_TOKEN') ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` } : {}),
      },
      body: JSON.stringify(
        batch.map((c) => ({ to: c.token, title: c.d.notification.title, body: c.d.notification.body, data: c.d.notification.data, sound: 'default', channelId: 'default' })),
      ),
    });
    const body = await res.json().catch(() => ({}));
    return { res, tickets: (Array.isArray(body?.data) ? body.data : []) as { status: string; message?: string; details?: { error?: string } }[] };
  };
  for (let i = 0; i < pushes.length; i += 100) {
    const chunk = pushes.slice(i, i + 100).map((d) => ({ d, token: prefsByUser.get(d.notification.user_id)?.push_token as unknown }));
    const sendable = chunk.filter((c): c is { d: Delivery; token: string } => isExpoToken(c.token));
    for (const c of chunk.filter((c) => !isExpoToken(c.token))) await record({ id: c.d.id, ok: false, skip: true, error: 'no valid push token' });
    if (!sendable.length) continue;
    try {
      const { res, tickets } = await sendPush(sendable);
      // A whole-request rejection (one odd token can cause it): send one by one so the rest still go.
      if (!res.ok && tickets.length !== sendable.length && sendable.length > 1) {
        for (const one of sendable) {
          const r = await sendPush([one]).catch((e) => ({ res: null, tickets: [], err: String(e) }));
          const t = r.tickets[0];
          if (t?.status === 'ok') await record({ id: one.d.id, ok: true });
          else await record({ id: one.d.id, ok: false, error: t?.message ?? `push ${r.res?.status ?? 'error'}` });
        }
        continue;
      }
      for (let j = 0; j < sendable.length; j++) {
        const t = tickets[j];
        if (t?.status === 'ok') await record({ id: sendable[j].d.id, ok: true });
        else if (!t && !res.ok) {
          // Expo was down or busy (5xx, 429): nothing was sent, so try again next run.
          await record({ id: sendable[j].d.id, ok: false, error: `push service error (HTTP ${res.status})` });
        } else if (!t) {
          // A success response without this message's ticket: we can't tell whether it went, so don't risk a duplicate.
          await record({ id: sendable[j].d.id, ok: false, skip: true, error: `no ticket (HTTP ${res.status})` });
        } else {
          await record({ id: sendable[j].d.id, ok: false, error: t.message ?? `HTTP ${res.status}` });
          if (t.details?.error === 'DeviceNotRegistered') {
            await db.from('contact_prefs').update({ push_token: null }).eq('user_id', sendable[j].d.notification.user_id);
          }
        }
      }
    } catch (e) {
      for (const c of sendable) await record({ id: c.d.id, ok: false, error: String(e) });
    }
  }

  // SMS
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_FROM');
  for (const d of deliveries.filter((x) => x.channel === 'sms')) {
    const p = prefsByUser.get(d.notification.user_id);
    // Codes go to the number being confirmed; everything else only to a proven, opted-in number.
    const isCode = d.notification.kind === 'verify';
    const to = isCode ? d.to_phone : (p?.phone as string | null | undefined);
    const allowed = isCode ? !!d.to_phone : !!(p?.sms_opt_in && p?.phone && p?.phone_verified_at);
    if (!sid || !token || !from || !allowed) {
      await record({ id: d.id, ok: false, skip: true, error: 'sms not configured, not opted in or number not confirmed' });
      continue;
    }
    const text = d.body_override ?? smsText(d.notification);
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + btoa(`${sid}:${token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: to as string, From: from, Body: text }),
      });
      if (res.ok) await record({ id: d.id, ok: true });
      else {
        const detail = await res.text();
        let code: number | undefined;
        try {
          code = JSON.parse(detail)?.code;
        } catch {
          code = undefined;
        }
        // 21610: the person texted STOP. Don't retry, and stop texting them.
        if (code === 21610) {
          await db.from('contact_prefs').update({ sms_opt_in: false }).eq('user_id', d.notification.user_id);
          await record({ id: d.id, ok: false, skip: true, error: 'recipient opted out (STOP)' });
        } else await record({ id: d.id, ok: false, error: `Twilio ${res.status}: ${detail}` });
      }
    } catch (e) {
      await record({ id: d.id, ok: false, error: String(e) });
    }
  }

  // Email
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const emailFrom = Deno.env.get('EMAIL_FROM');
  for (const d of deliveries.filter((x) => x.channel === 'email')) {
    const p = prefsByUser.get(d.notification.user_id);
    if (!resendKey || !emailFrom || !p?.email_opt_in) {
      await record({ id: d.id, ok: false, skip: true, error: 'email not configured or not opted in' });
      continue;
    }
    let to: string | undefined;
    try {
      const { data: user } = await db.auth.admin.getUserById(d.notification.user_id);
      to = user?.user?.email;
    } catch (e) {
      await record({ id: d.id, ok: false, error: String(e) });
      continue;
    }
    if (!to) {
      await record({ id: d.id, ok: false, skip: true, error: 'no email on account' });
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
          subject: d.notification.title.replace(/[\r\n]+/g, ' ').slice(0, 150),
          text: `${d.notification.body}${link}\n\nOpen The Index app to see more. You can change email settings in the app under Settings.`,
        }),
      });
      await record(res.ok ? { id: d.id, ok: true } : { id: d.id, ok: false, error: `Resend ${res.status}: ${await res.text()}` });
    } catch (e) {
      await record({ id: d.id, ok: false, error: String(e) });
    }
  }

  return json({
    reminders_queued: reminders ?? 0,
    processed: results.length,
    sent: results.filter((r) => r.ok).length,
    skipped: results.filter((r) => r.skip).length,
    failed: results.filter((r) => !r.ok && !r.skip).length,
  });
});

/** Texts about a conversation invite a reply; the sms-line function posts the reply in that thread. */
function smsText(n: Delivery['notification']) {
  const hint =
    n.kind === 'inquiry'
      ? ' Reply YES, PART or NO to answer.'
      : n.kind === 'message' || n.kind === 'board'
        ? ' Reply to this text to answer.'
        : '';
  // Cut by characters, not UTF-16 units, so an emoji is never split in half.
  const main = Array.from(`${n.title}: ${n.body}`);
  return (main.length > 280 ? main.slice(0, 279).join('') + '…' : main.join('')) + hint + ' (The Index. Reply STOP to opt out.)';
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
