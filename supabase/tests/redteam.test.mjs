// Red-team checks for the Supabase schema. Run with: node supabase/tests/redteam.test.mjs
//
// Every check asserts the SECURE / CORRECT outcome:
//   ok    the attack was refused (or had no effect)
//   HOLE  the attack worked: a real security or correctness problem (exit code 1)
//   WARN  hardening / design gap worth knowing about, not counted as a failure
//
// Uses the same PGlite harness as policies.test.mjs: auth.uid() comes from the
// request.jwt.claim.sub setting, members run as role `authenticated`, visitors as `anon`,
// and "service role" is the superuser with no uid (auth.uid() is null), like the real service key.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const db = new PGlite();

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create publication supabase_realtime;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid());
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to anon, authenticated;
  grant all on storage.objects to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`);

try {
  const files = [
    ...readdirSync(`${root}/migrations`).filter((f) => f.endsWith('.sql')).sort().map((f) => `migrations/${f}`),
    'seed.sql',
  ];
  for (const f of files) await db.exec(readFileSync(`${root}/${f}`, 'utf8'));
} catch (e) { console.log('MIGRATION ERROR:', e.message, e.where ?? '', e.position ?? ''); process.exit(1); }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const q = async (sql, params) => (await db.query(sql, params)).rows;
const as = async (uid) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
};
const svc = async () => { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); };
const n = async (sql, params) => (await q(sql, params))[0].n;

const holes = [];
const warns = [];
let safeCount = 0;
const secure = (label, ok, detail = '') => {
  if (ok) { safeCount++; console.log('ok   ', label); }
  else { holes.push(`${label}${detail ? ` -- ${detail}` : ''}`); console.log('HOLE ', label, detail); process.exitCode = 1; }
};
const harden = (label, ok, detail = '') => {
  if (ok) { safeCount++; console.log('ok   ', label); }
  else { warns.push(`${label}${detail ? ` -- ${detail}` : ''}`); console.log('WARN ', label, detail); }
};
/** The statement must throw. */
const refused = async (label, fn) => {
  try { await fn(); secure(label, false, 'statement succeeded'); }
  catch (e) { secure(`${label}  [${e.message.split('\n')[0]}]`, true); }
};
/** The statement must throw or touch zero rows (pass SQL with `returning 1`). */
const noEffect = async (label, fn, report = secure) => {
  try { const r = await fn(); report(label, r.length === 0, `${r.length} row(s) affected`); }
  catch (e) { report(`${label}  [${e.message.split('\n')[0]}]`, true); }
};
const section = async (name, fn) => {
  console.log(`\n== ${name}`);
  try { await fn(); } catch (e) { holes.push(`TEST ERROR in "${name}": ${e.message}`); console.log('TEST ERROR', e.message); process.exitCode = 1; }
};

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------
const U = {
  buyer: '11111111-1111-4111-8111-111111111111',
  farmer: '22222222-2222-4222-8222-222222222222',
  coord: '33333333-3333-4333-8333-333333333333',
  outsider: '44444444-4444-4444-8444-444444444444',
  farmer2: '55555555-5555-4555-8555-555555555555',
  admin: '66666666-6666-4666-8666-666666666666',
  attacker: '77777777-7777-4777-8777-777777777777',
  intl: '88888888-8888-4888-8888-888888888888',
};
const FARM = 'f0000000-0000-4000-a000-000000000001'; // farmer's approved, real farm, region 6
const FARM2 = 'f0000000-0000-4000-a000-000000000002'; // farmer2's approved, real farm, region 4
const SAMPLE = '00000000-0000-4000-a000-000000000001';
const FARMER_PHONE = '+15555550100';
const FARMER2_PHONE = '+12079460958';

await svc();
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ${Object.entries(U).map(([k, id]) => `('${id}', '${k}@example.com', '{"display_name":"${k}"}')`).join(',')}`);
await db.exec(`update public.profiles set role = 'coordinator' where id = '${U.coord}'`);
await db.exec(`update public.profiles set role = 'admin' where id = '${U.admin}'`);
await db.exec(`insert into public.farms (id, owner_id, name, city, state, region_id, lat, lon, status, verified_at) values
  ('${FARM}', '${U.farmer}', 'Real Farm', 'Lafayette', 'LA', '6', 30.22, -92.02, 'approved', now()),
  ('${FARM2}', '${U.farmer2}', 'Second Farm', 'Hattiesburg', 'MS', '4', 31.33, -89.29, 'approved', now())`);
await db.exec(`update public.profiles set role = 'grower' where id in ('${U.farmer}', '${U.farmer2}')`);
await db.exec(`update public.contact_prefs set phone = '${FARMER_PHONE}', sms_opt_in = true, phone_verified_at = now(), push_token = 'tok-f' where user_id = '${U.farmer}'`);
await db.exec(`update public.contact_prefs set phone = '${FARMER2_PHONE}', sms_opt_in = true, phone_verified_at = now() where user_id = '${U.farmer2}'`);

// ===========================================================================
await section('RLS coverage', async () => {
  const off = await q(`select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
                       where s.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1`);
  secure('every public table has RLS enabled', off.length === 0, off.map((r) => r.relname).join(', '));
  const views = await q(`select c.relname, coalesce(array_to_string(c.reloptions, ','), '') opts from pg_class c
                         join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'v'`);
  secure('every public view is security_invoker', views.every((v) => v.opts.includes('security_invoker=true')),
    views.filter((v) => !v.opts.includes('security_invoker=true')).map((v) => v.relname).join(', '));
  const noPol = await q(`select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
                         where s.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
                           and not exists (select 1 from pg_policy p where p.polrelid = c.oid) order by 1`);
  console.log('      info: RLS on with no policies (service role / definer only):', noPol.map((r) => r.relname).join(', '));

  await as(null);
  for (const t of ['profiles', 'contact_prefs', 'messages', 'conversation_members', 'notifications', 'notification_deliveries',
    'survey_responses', 'checkin_responses', 'farm_private', 'posts', 'saved_alerts', 'follows', 'reports', 'checkins', 'surveys']) {
    secure(`anon reads nothing from ${t}`, (await n(`select count(*)::int n from public.${t}`)) === 0);
  }
  for (const [t, cols] of [
    ['farms', `(name, city, state, region_id) values ('x', 'x', 'LA', '6')`],
    ['events', `(title, starts_at, place, host_name) values ('x', now(), 'x', 'x')`],
    ['posts', `(author_id, kind, title) values ('${U.buyer}', 'need', 'xxxx')`],
    ['resources', `(name, org, url, kind, summary) values ('x', 'x', 'https://x', 'x', 'x')`],
    ['reports', `(target_type, target_id, reason) values ('farm', '${FARM}', 'x')`],
    ['broadcasts', `(title, body) values ('x', 'y')`],
    ['follows', `(user_id, farm_id) values ('${U.buyer}', '${FARM}')`],
  ]) await refused(`anon cannot insert into ${t}`, () => q(`insert into public.${t} ${cols}`));
  await noEffect('anon cannot update farms', () => q(`update public.farms set name = 'pwned' returning 1`));
  await noEffect('anon cannot delete events', () => q(`delete from public.events returning 1`));
});

// ===========================================================================
await section('Security-definer functions: search_path and grants', async () => {
  await svc();
  const fns = await q(`select p.oid::regprocedure::text sig, p.proname, coalesce(array_to_string(p.proconfig, ','), '') cfg,
                              pg_get_function_result(p.oid) res,
                              has_function_privilege('anon', p.oid, 'execute') anon_x,
                              has_function_privilege('authenticated', p.oid, 'execute') auth_x
                       from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                       where s.nspname = 'public' and p.prosecdef order by 1`);
  const noPath = fns.filter((f) => !/search_path=/.test(f.cfg));
  secure(`all ${fns.length} security-definer functions pin search_path`, noPath.length === 0, noPath.map((f) => f.sig).join(', '));
  for (const name of ['enqueue_notification', 'run_due_reminders', 'sms_inbound']) {
    const f = fns.find((x) => x.proname === name);
    secure(`${name} not executable by anon/authenticated`, f && !f.anon_x && !f.auth_x, f ? `anon=${f.anon_x} auth=${f.auth_x}` : 'missing');
  }
  const anonRpcs = fns.filter((f) => f.anon_x && f.res !== 'trigger').map((f) => f.proname);
  console.log('      info: definer RPCs anon may execute:', anonRpcs.join(', '));
  const mutable = await q(`select p.oid::regprocedure::text sig from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                           where s.nspname = 'public' and not p.prosecdef and p.prokind = 'f'
                             and not coalesce(array_to_string(p.proconfig, ','), '') ~ 'search_path=' order by 1`);
  harden('non-definer functions also pin search_path (Supabase linter: function_search_path_mutable)', mutable.length === 0,
    mutable.map((r) => r.sig).join(', '));

  // Every anon-callable RPC must validate the caller.
  await as(null);
  const id0 = '00000000-0000-4000-8000-000000000000';
  for (const [label, sql] of [
    ['start_conversation', `select public.start_conversation('${FARM}')`],
    ['send_inquiry', `select public.send_inquiry('${FARM}', 'x', 'x', null, 'x')`],
    ['answer_inquiry', `select public.answer_inquiry('${id0}', 'ready', 'x')`],
    ['review_farm', `select public.review_farm('${FARM}', 'hidden')`],
    ['review_event', `select public.review_event('${id0}', 'approved')`],
    ['start_post_conversation', `select public.start_post_conversation('${id0}')`],
    ['farm_insights', `select * from public.farm_insights('${FARM}')`],
    ['impact_stats', `select public.impact_stats()`],
    ['checkin_report', `select public.checkin_report('${id0}')`],
    ['enqueue_notification', `select public.enqueue_notification('${U.buyer}', 'x', 't', 'b')`],
    ['run_due_reminders', `select public.run_due_reminders()`],
    ['sms_inbound', `select public.sms_inbound('${FARMER_PHONE}', 'hi')`],
  ]) await refused(`anon cannot use ${label}`, () => q(sql));
  await as(U.buyer);
  for (const [label, sql] of [
    ['enqueue_notification', `select public.enqueue_notification('${U.farmer}', 'broadcast', 'Fake BFI', 'b', '{}', '{sms}')`],
    ['run_due_reminders', `select public.run_due_reminders()`],
    ['sms_inbound', `select public.sms_inbound('${FARMER_PHONE}', 'hi')`],
    ['review_farm', `select public.review_farm('${FARM2}', 'hidden')`],
    ['impact_stats', `select public.impact_stats()`],
  ]) await refused(`member cannot use ${label}`, () => q(sql));
  await as(null);
  let leak = { a: false, b: false };
  try { leak = (await q(`select public.in_audience('${U.farmer}', 'growers') a, public.in_audience('${U.farmer}', 'region:6') b`))[0]; } catch { /* refused */ }
  harden('anon cannot probe a member\'s role/region through in_audience()', !(leak.a || leak.b),
    'anon reads farms.owner_id, then in_audience(owner, \'growers\'|\'region:N\') answers true');
});

// ===========================================================================
await section('Profiles and roles', async () => {
  await as(U.buyer);
  await refused('member cannot make self admin', () => q(`update public.profiles set role = 'admin' where id = $1`, [U.buyer]));
  await refused('member cannot make self grower', () => q(`update public.profiles set role = 'grower' where id = $1`, [U.buyer]));
  await noEffect('member cannot edit another profile', () => q(`update public.profiles set display_name = 'hacked' where id = $1 returning 1`, [U.farmer]));
  await noEffect('member cannot change own id', () => q(`update public.profiles set id = $1 where id = $2 returning 1`, [U.outsider, U.buyer]));
  await refused('member cannot insert a profile', () => q(`insert into public.profiles (id, role) values (gen_random_uuid(), 'admin')`));
  await noEffect('member cannot delete a profile', () => q(`delete from public.profiles where id = $1 returning 1`, [U.farmer]));
  const r = await q(`update public.profiles set region_id = '6' where id = $1 returning region_id`, [U.buyer]);
  console.log('      info: members choose their own region (intended); this also opts them into that region\'s surveys/check-ins:', r[0]?.region_id === '6');
  await svc(); await db.exec(`update public.profiles set region_id = null where id = '${U.buyer}'`);

  // Coordinators are regional volunteers (docs/ADMIN.md). Role management is not on their list.
  await as(U.coord);
  let promoted = false;
  try { await q(`update public.profiles set role = 'admin' where id = $1`, [U.coord]); promoted = (await q(`select role from public.profiles where id = $1`, [U.coord]))[0].role === 'admin'; } catch { /* refused */ }
  secure('coordinator cannot promote self to admin', !promoted);
  let minted = false;
  try { await q(`update public.profiles set role = 'coordinator' where id = $1`, [U.attacker]); minted = (await q(`select role from public.profiles where id = $1`, [U.attacker]))[0].role === 'coordinator'; } catch { /* refused */ }
  secure('coordinator cannot hand staff access to another member', !minted);
  let demoted = false;
  try { await q(`update public.profiles set role = 'neighbor' where id = $1`, [U.admin]); demoted = (await q(`select role from public.profiles where id = $1`, [U.admin]))[0].role === 'neighbor'; } catch { /* refused */ }
  secure('coordinator cannot demote an admin', !demoted);
  await svc();
  await db.exec(`update public.profiles set role = 'coordinator' where id = '${U.coord}'; update public.profiles set role = 'admin' where id = '${U.admin}';
                 update public.profiles set role = 'neighbor' where id = '${U.attacker}'`);
});

// ===========================================================================
await section('Contact details', async () => {
  await as(U.buyer);
  secure('member cannot read others\' contact prefs', (await n(`select count(*)::int n from public.contact_prefs where user_id <> $1`, [U.buyer])) === 0);
  await noEffect('member cannot edit others\' contact prefs', () => q(`update public.contact_prefs set sms_opt_in = false where user_id = $1 returning 1`, [U.farmer]));
  await refused('member cannot insert contact prefs for someone else', () => q(`insert into public.contact_prefs (user_id) values ($1)`, [U.outsider]));

  // Claiming someone else's number: nothing ties contact_prefs.phone to a verified number.
  await as(U.attacker);
  let claimed = false;
  try {
    const r = await q(`update public.contact_prefs set phone = $1, sms_opt_in = true, updated_at = '2100-01-01' where user_id = $2 returning 1`, [FARMER_PHONE, U.attacker]);
    claimed = r.length === 1;
  } catch { /* refused */ }
  await svc();
  const dup = await n(`select count(*)::int n from public.contact_prefs where sms_opt_in and phone_verified_at is not null and phone = public.normalize_phone($1)`, [FARMER_PHONE]);
  const selfVerified = (await q(`select phone_verified_at from public.contact_prefs where user_id = $1`, [U.attacker]))[0].phone_verified_at;
  secure('a member cannot claim a phone number another member already verified', dup <= 1 && selfVerified === null, `verified rows for that number: ${dup}, claimed=${claimed}`);
  await as(U.attacker);
  await refused('the claimer cannot get a code confirmed for a number verified elsewhere', () => q(`select public.request_phone_code()`));
  await svc();
  const futureTs = await n(`select count(*)::int n from public.contact_prefs where user_id = $1 and updated_at > now() + interval '1 day'`, [U.attacker]);
  secure('member cannot set contact_prefs.updated_at (it decides which member a shared number maps to in sms_inbound)', futureTs === 0);
  // keep the claimed phone for the sms_inbound hijack demo below, but switch it off for now
  await db.exec(`update public.contact_prefs set sms_opt_in = false where user_id = '${U.attacker}'`);

  await as(U.coord);
  const before = await n(`select count(*)::int n from public.contact_prefs where user_id = $1`, [U.outsider]);
  await noEffect('coordinator cannot delete a member\'s contact prefs', () => q(`delete from public.contact_prefs where user_id = $1 returning 1`, [U.outsider]), harden);
  await svc();
  if (before && !(await n(`select count(*)::int n from public.contact_prefs where user_id = $1`, [U.outsider]))) await db.exec(`insert into public.contact_prefs (user_id) values ('${U.outsider}')`);
});

// ===========================================================================
await section('Farms, products, private details', async () => {
  await as(U.outsider);
  const ins = (await q(`insert into public.farms (name, city, state, region_id, status, verified_at, verified_by, is_sample, owner_id)
                        values ('Spoof', 'x', 'LA', '6', 'approved', now(), $1, true, $2) returning *`, [U.admin, U.farmer]))[0];
  secure('new farm: owner, status, verified, verified_by, is_sample all forced',
    ins.owner_id === U.outsider && ins.status === 'pending' && ins.verified_at === null && ins.verified_by === null && ins.is_sample === false);
  await q(`update public.farms set status = 'approved', verified_at = now(), verified_by = $2, is_sample = true, owner_id = $3 where id = $1`, [ins.id, U.admin, U.buyer]);
  const after = (await q(`select * from public.farms where id = $1`, [ins.id]))[0];
  secure('owner cannot approve/verify/sample/re-own own farm by update',
    after && after.status === 'pending' && after.verified_at === null && !after.is_sample && after.owner_id === U.outsider);
  await noEffect('non-owner cannot edit another farm', () => q(`update public.farms set name = 'pwned' where id = $1 returning 1`, [FARM]));
  await noEffect('non-owner cannot delete another farm', () => q(`delete from public.farms where id = $1 returning 1`, [FARM]));
  secure('non-owner cannot read farm_private', (await n(`select count(*)::int n from public.farm_private`)) === 0);
  await refused('non-owner cannot write farm_private', () => q(`insert into public.farm_private (farm_id, phone) values ($1, 'x')`, [FARM]));
  await refused('non-owner cannot add products to another farm', () => q(`insert into public.farm_products (farm_id, name) values ($1, 'Fake')`, [FARM]));
  await q(`insert into public.farm_products (farm_id, name) values ($1, 'Mine')`, [ins.id]);
  await refused('owner cannot move a product onto another farm', () => q(`update public.farm_products set farm_id = $1 where farm_id = $2`, [FARM, ins.id]));
  await refused('owner cannot add photo rows to another farm', () => q(`insert into public.farm_photos (farm_id, path, alt_text, farmer_consent) values ($1, $2, 'xxxx', true)`, [FARM, `${FARM}/x.jpg`]));

  await as(U.farmer);
  await q(`insert into public.farm_products (farm_id, name) values ($1, 'Okra')`, [FARM]);
  let jsOk = false;
  try { await q(`update public.farms set website = 'javascript:alert(document.cookie)' where id = $1`, [FARM]); jsOk = (await q(`select website from public.farms where id = $1`, [FARM]))[0].website.startsWith('javascript'); } catch { /* refused */ }
  secure('farm website must be https (like order_url); it is opened with WebBrowser.openBrowserAsync', !jsOk, 'javascript: URL saved');
  await svc(); await db.exec(`update public.farms set website = null where id = '${FARM}'`);

  // Near-me alerts: product names are used as LIKE patterns.
  await as(U.outsider);
  await q(`insert into public.saved_alerts (user_id, keyword, lat, lon, radius_miles) values ($1, 'honey', 30.3, -92.1, 25)`, [U.outsider]);
  await as(U.farmer);
  try { await q(`insert into public.farm_products (farm_id, name) values ($1, '%')`, [FARM]); } catch { /* refused */ }
  await svc();
  const spam = await n(`select count(*)::int n from public.notifications where user_id = $1 and kind = 'near_me'`, [U.outsider]);
  secure('a product named "%" does not match every near-me alert (LIKE wildcards not escaped)', spam === 0, `"honey" alert fired ${spam}x for product "%" (push+sms)`);
  await as(U.attacker);
  await q(`insert into public.saved_alerts (user_id, keyword, lat, lon, radius_miles) values ($1, 'pecans', 31.3, -89.3, 25)`, [U.attacker]);
  await as(U.farmer2);
  let emptyOk = true;
  try { await q(`insert into public.farm_products (farm_id, name) values ($1, '')`, [FARM2]); } catch { emptyOk = false; }
  await svc();
  const spam2 = await n(`select count(*)::int n from public.notifications where user_id = $1 and kind = 'near_me'`, [U.attacker]);
  secure('an empty product name is refused and does not match every near-me alert', !emptyOk && spam2 === 0, `empty name accepted=${emptyOk}, alerts fired=${spam2}`);
});

// ===========================================================================
let conv; let inquiryId;
await section('Messaging', async () => {
  await as(U.buyer);
  conv = (await q(`select public.start_conversation($1) id`, [FARM]))[0].id;
  await q(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hi')`, [conv, U.buyer]);
  await refused('forged sender_id refused', () => q(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'x')`, [conv, U.farmer]));
  await refused('null sender_id refused', () => q(`insert into public.messages (conversation_id, sender_id, body) values ($1, null, 'x')`, [conv]));
  await refused('member cannot insert system messages', () => q(`insert into public.messages (conversation_id, sender_id, kind, body) values ($1, $2, 'system', 'BFI: verified')`, [conv, U.buyer]));

  // Columns only staff or the service role should set.
  const m = (await q(`insert into public.messages (conversation_id, sender_id, body, pinned) values ($1, $2, 'pin me', true) returning pinned`, [conv, U.buyer]).catch(() => [{ pinned: false }]))[0];
  secure('member cannot pin a message on insert (pinning is a staff action)', !m.pinned);
  const v = (await q(`insert into public.messages (conversation_id, sender_id, kind, audio_path, transcript) values ($1, $2, 'voice', $3, 'Wire $500 to this account') returning transcript`, [conv, U.buyer, `${conv}/t.m4a`]).catch(() => [{ transcript: null }]))[0];
  secure('member cannot supply a voice-note transcript (written by the transcribe function only; it never overwrites one)', v.transcript === null, `stored transcript: ${v.transcript}`);
  const t = (await q(`insert into public.messages (conversation_id, sender_id, body, created_at) values ($1, $2, 'from the future', '2100-01-01') returning created_at`, [conv, U.buyer]).catch(() => [{ created_at: new Date() }]))[0];
  secure('member cannot backdate/future-date a message (also pins conversation via last_message_at)', new Date(t.created_at) < new Date(Date.now() + 60_000), `created_at=${new Date(t.created_at).toISOString()}`);
  const s = (await q(`insert into public.messages (conversation_id, sender_id, body, via) values ($1, $2, 'not really a text', 'sms') returning via`, [conv, U.buyer]).catch(() => [{ via: 'app' }]))[0];
  harden('member cannot mark an app message as sent by SMS', s.via === 'app', 'via=sms accepted (cosmetic "sent by text" label)');
  await svc(); await db.exec(`delete from public.messages where body in ('pin me', 'from the future', 'not really a text') or transcript is not null`);
  await db.exec(`update public.conversations set last_message_at = now() where id = '${conv}'`);

  await as(U.buyer);
  await noEffect('member cannot delete own messages', () => q(`delete from public.messages where sender_id = $1 returning 1`, [U.buyer]));
  await noEffect('member cannot edit messages', () => q(`update public.messages set body = 'edited' where conversation_id = $1 returning 1`, [conv]));
  await refused('neighbor cannot post in a channel', async () => {
    const ch = (await q(`select id from public.conversations where kind = 'channel' limit 1`))[0].id;
    await q(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'x')`, [ch, U.buyer]);
  });

  await as(U.outsider);
  secure('outsider cannot see the thread', (await n(`select count(*)::int n from public.conversations where id = $1`, [conv])) === 0);
  secure('outsider cannot read thread messages', (await n(`select count(*)::int n from public.messages where conversation_id = $1`, [conv])) === 0);
  secure('outsider cannot read thread membership', (await n(`select count(*)::int n from public.conversation_members where conversation_id = $1`, [conv])) === 0);
  await refused('outsider cannot post into the thread', () => q(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'x')`, [conv, U.outsider]));
  await refused('outsider cannot join the thread', () => q(`insert into public.conversation_members (conversation_id, user_id) values ($1, $2)`, [conv, U.outsider]));
  await refused('member cannot create conversations directly', () => q(`insert into public.conversations (kind, farm_id) values ('direct', $1)`, [FARM]));
  await noEffect('member cannot delete conversations', () => q(`delete from public.conversations returning 1`));
  await svc();
  const lr0 = (await q(`select last_read_at from public.conversation_members where conversation_id = $1 and user_id = $2`, [conv, U.farmer]))[0].last_read_at;
  await as(U.outsider);
  await q(`select public.mark_read($1)`, [conv]);
  await as(U.buyer);
  await noEffect('member cannot write the other party\'s read receipt', () => q(`update public.conversation_members set last_read_at = now() + interval '1 year' where conversation_id = $1 and user_id = $2 returning 1`, [conv, U.farmer]));
  await noEffect('member cannot remove the other party from a thread', () => q(`delete from public.conversation_members where conversation_id = $1 and user_id = $2 returning 1`, [conv, U.farmer]));
  await svc();
  const lr1 = (await q(`select last_read_at from public.conversation_members where conversation_id = $1 and user_id = $2`, [conv, U.farmer]))[0].last_read_at;
  secure('mark_read by an outsider changes nobody\'s receipt', +lr0 === +lr1);

  await as(U.buyer);
  await q(`select public.send_inquiry($1, 'Okra', '2 lb', null, 'Pickup', '')`, [FARM]);
  inquiryId = (await q(`select id from public.messages where conversation_id = $1 and kind = 'inquiry'`, [conv]))[0].id;
  await as(U.farmer2);
  await refused('another farmer cannot answer the inquiry', () => q(`select public.answer_inquiry($1, 'ready', 'x')`, [inquiryId]));
});

// ===========================================================================
await section('Notifications and outbox', async () => {
  await as(U.buyer);
  secure('member cannot read others\' notifications', (await n(`select count(*)::int n from public.notifications where user_id <> $1`, [U.buyer])) === 0);
  await refused('member cannot create notifications', () => q(`insert into public.notifications (user_id, kind, title) values ($1, 'broadcast', 'Fake BFI alert')`, [U.farmer]));
  await refused('member cannot queue deliveries', async () => {
    const id = (await q(`select id from public.notifications limit 1`))[0]?.id ?? '00000000-0000-4000-8000-000000000000';
    await q(`insert into public.notification_deliveries (notification_id, channel) values ($1, 'sms')`, [id]);
  });
  secure('member cannot read delivery outbox', (await n(`select count(*)::int n from public.notification_deliveries`)) === 0);
  await noEffect('member cannot mark deliveries sent', () => q(`update public.notification_deliveries set status = 'sent' returning 1`));
  await as(U.farmer);
  // Critical for sms_inbound: the route in a notification decides which thread a texted reply is posted to.
  await noEffect('member cannot rewrite own notification route', () => q(`update public.notifications set data = '{"route":"/thread/00000000-0000-4000-8000-000000000000"}' where user_id = $1 returning 1`, [U.farmer]));
  await noEffect('member cannot delete notifications', () => q(`delete from public.notifications returning 1`));
  await as(U.buyer);
  const ids = (await (async () => { await svc(); return q(`select array_agg(id) a from public.notifications where user_id = $1 and read_at is null`, [U.farmer]); })())[0].a;
  await as(U.buyer);
  await q(`select public.mark_notifications_read($1)`, [ids]);
  await svc();
  secure('mark_notifications_read cannot mark someone else\'s', (await n(`select count(*)::int n from public.notifications where user_id = $1 and read_at is not null`, [U.farmer])) === 0);
  await as(U.buyer);
  await refused('member cannot write reminders_sent', () => q(`insert into public.reminders_sent (user_id, ref_type, ref_id, offset_days) values ($1, 'event', gen_random_uuid(), 1)`, [U.farmer]));
  await refused('member cannot write farm_view_days directly', () => q(`insert into public.farm_view_days (farm_id, views) values ($1, 100000)`, [FARM]));
  await noEffect('member cannot inflate farm_view_days by update', () => q(`update public.farm_view_days set views = 100000 returning 1`));
  harden('note: log_farm_view counts every call (anon too), so views/impact numbers can be inflated by a loop', false,
    'by design per policies.test.mjs (two calls = two views); consider one view per viewer per day');
});

// ===========================================================================
await section('Surveys', async () => {
  await as(U.admin);
  const mk = async (title, audience, status, extra = '') =>
    (await q(`insert into public.surveys (title, questions, audience, status${extra ? ', closes_at' : ''}) values ($1, '[{"id":"q1","type":"text","prompt":"?"}]', $2, $3${extra ? `, ${extra}` : ''}) returning id`, [title, audience, status]))[0].id;
  const draft = await mk('Draft survey', 'everyone', 'draft');
  const open = await mk('Open survey', 'everyone', 'open');
  const growers = await mk('Growers survey', 'growers', 'open');
  const region4 = await mk('Region 4 survey', 'region:4', 'open');
  const closed = await mk('Closed survey', 'everyone', 'closed');
  const expired = await mk('Expired survey', 'everyone', 'open', `now() + interval '1 hour'`);
  await svc(); await q(`update public.surveys set closes_at = now() - interval '1 hour' where id = $1`, [expired]); await as(U.admin);
  await refused('a draft cannot be opened with a closing date in the past', () => q(`insert into public.surveys (title, status, closes_at) values ('Stale', 'open', now() - interval '1 day')`));
  const big = await mk('Big answers survey', 'everyone', 'open');

  await as(U.buyer);
  secure('draft surveys invisible to members', (await n(`select count(*)::int n from public.surveys where id = $1`, [draft])) === 0);
  await refused('cannot answer a draft survey', () => q(`insert into public.survey_responses (survey_id, answers) values ($1, '{}')`, [draft]));
  await refused('cannot answer a closed survey', () => q(`insert into public.survey_responses (survey_id, answers) values ($1, '{}')`, [closed]));
  await refused('cannot answer after closes_at', () => q(`insert into public.survey_responses (survey_id, answers) values ($1, '{}')`, [expired]));
  await refused('neighbor cannot answer a growers survey', () => q(`insert into public.survey_responses (survey_id, answers) values ($1, '{}')`, [growers]));
  await refused('cannot answer another region\'s survey', () => q(`insert into public.survey_responses (survey_id, answers) values ($1, '{}')`, [region4]));
  await refused('cannot answer on behalf of someone else', () => q(`insert into public.survey_responses (survey_id, user_id, answers) values ($1, $2, '{}')`, [open, U.outsider]));
  await q(`insert into public.survey_responses (survey_id, answers, consent_share) values ($1, '{"q1":"mine"}', false)`, [open]);
  await refused('cannot answer twice', () => q(`insert into public.survey_responses (survey_id, answers) values ($1, '{}')`, [open]));
  await noEffect('cannot reassign own answer to someone else', () => q(`update public.survey_responses set user_id = $1 where survey_id = $2 returning 1`, [U.outsider, open]).catch((e) => { throw e; }));
  await refused('cannot move an answer onto a closed survey', () => q(`update public.survey_responses set survey_id = $1 where survey_id = $2`, [closed, open]).then(async () => {
    if ((await n(`select count(*)::int n from public.survey_responses where survey_id = $1`, [closed])) === 0) throw new Error('no effect');
  }));
  await noEffect('member cannot reopen/edit a survey', () => q(`update public.surveys set status = 'open' where id = $1 returning 1`, [closed]));
  await as(U.outsider);
  await q(`insert into public.survey_responses (survey_id, answers, consent_share) values ($1, '{"q1":"theirs"}', true)`, [open]);
  secure('member reads only own answers', (await n(`select count(*)::int n from public.survey_responses where user_id <> $1`, [U.outsider])) === 0);
  await noEffect('member cannot edit others\' answers', () => q(`update public.survey_responses set answers = '{}' where user_id = $1 returning 1`, [U.buyer]));
  await noEffect('member cannot delete others\' answers', () => q(`delete from public.survey_responses where user_id = $1 returning 1`, [U.buyer]));
  await as(U.coord);
  await noEffect('staff cannot flip a member\'s consent_share', () => q(`update public.survey_responses set consent_share = true where user_id = $1 returning 1`, [U.buyer]));
  await noEffect('staff cannot alter answers', () => q(`update public.survey_responses set answers = '{"q1":"edited"}' returning 1`));

  const huge = 'x'.repeat(2_000_000);
  await as(U.buyer);
  let bigOk = false;
  try { await q(`insert into public.survey_responses (survey_id, answers) values ($1, jsonb_build_object('q1', $2::text))`, [big, huge]); bigOk = true; } catch { /* refused */ }
  harden('survey answers have a size limit / are checked against the survey\'s question ids', !bigOk, '2 MB answer accepted');

  await as(U.admin);
  await q(`update public.surveys set status = 'closed' where id = $1`, [open]);
  await as(U.buyer);
  await q(`update public.survey_responses set consent_share = true, answers = '{}' where survey_id = $1`, [open]);
  const mine = (await q(`select consent_share, answers from public.survey_responses where survey_id = $1`, [open]))[0];
  secure('answers and consent lock when a survey closes', mine && mine.consent_share === false && mine.answers.q1 === 'mine');
  await noEffect('answers cannot be withdrawn after the survey closes (ADMIN.md: "until the survey closes")',
    () => q(`delete from public.survey_responses where survey_id = $1 returning 1`, [open]));
});

// ===========================================================================
let c1;
await section('Check-ins', async () => {
  await as(U.admin);
  c1 = (await q(`insert into public.checkins (title, audience) values ('Storm region 6', 'region:6') returning id`))[0].id;
  const closedC = (await q(`insert into public.checkins (title, audience, closes_at) values ('Old storm', 'region:6', now() - interval '1 day') returning id`))[0].id;
  await as(U.farmer);
  await q(`insert into public.checkin_responses (checkin_id, status) values ($1, 'ok')`, [c1]);
  await refused('cannot answer a check-in for someone else', () => q(`insert into public.checkin_responses (checkin_id, user_id, status) values ($1, $2, 'need_help')`, [c1, U.buyer]));
  await refused('app answers cannot claim via=sms', () => q(`update public.checkin_responses set via = 'sms' where checkin_id = $1`, [c1]).then(async () => {
    if ((await n(`select count(*)::int n from public.checkin_responses where via = 'sms'`)) === 0) throw new Error('no effect');
  }));
  await refused('cannot answer a closed check-in', () => q(`insert into public.checkin_responses (checkin_id, status) values ($1, 'ok')`, [closedC]));
  await refused('members cannot send check-ins', () => q(`insert into public.checkins (title, audience) values ('Fake storm', 'everyone')`));
  await as(U.buyer);
  await refused('cannot answer another region\'s check-in', () => q(`insert into public.checkin_responses (checkin_id, status) values ($1, 'ok')`, [c1]));
  secure('members cannot read others\' check-in answers', (await n(`select count(*)::int n from public.checkin_responses`)) === 0);
  await refused('members cannot read the check-in report', () => q(`select public.checkin_report($1)`, [c1]));
  await noEffect('members cannot change others\' answers', () => q(`update public.checkin_responses set status = 'need_help' returning 1`));
  await as(U.admin);
  await q(`update public.checkins set closes_at = now() - interval '1 minute' where id = $1`, [closedC]);
  const tmp = (await q(`insert into public.checkins (title, audience) values ('Short storm', 'region:6') returning id`))[0].id;
  await as(U.farmer);
  await q(`insert into public.checkin_responses (checkin_id, status) values ($1, 'ok')`, [tmp]);
  await as(U.admin);
  await q(`update public.checkins set closes_at = now() - interval '1 minute' where id = $1`, [tmp]);
  await as(U.farmer);
  await noEffect('cannot change a check-in answer after it closes', () => q(`update public.checkin_responses set status = 'need_help' where checkin_id = $1 returning 1`, [tmp]));
});

// ===========================================================================
await section('sms_inbound (two-way texting)', async () => {
  await svc();
  const fx = await q(`select has_function_privilege('anon', 'public.sms_inbound(text,text)', 'execute') a,
                             has_function_privilege('authenticated', 'public.sms_inbound(text,text)', 'execute') b`);
  secure('sms_inbound: no EXECUTE for anon or authenticated', !fx[0].a && !fx[0].b);
  await as(null); await refused('anon cannot call sms_inbound', () => q(`select public.sms_inbound($1, 'SAFE')`, [FARMER_PHONE]));
  await as(U.farmer); await refused('a member cannot call sms_inbound (would let anyone post as the number\'s owner)', () => q(`select public.sms_inbound($1, 'hi')`, [FARMER_PHONE]));

  const sent = async () => { await svc(); await db.exec(`update public.notification_deliveries set status = 'sent' where channel = 'sms'`); };
  const inbound = async (from, body) => { await svc(); return (await q(`select public.sms_inbound($1, $2) r`, [from, body]))[0].r; };
  await sent();

  for (const fmt of ['+15555550100', '+1 555 555 0100', '+1 (555) 555-0100', '555-555-0100', '5555550100', '15555550100', '555.555.0100']) {
    const r = await inbound(fmt, `hello from ${fmt}`);
    secure(`phone format "${fmt}" reaches the farmer's thread`, r.handled === true && r.conversation_id === conv, JSON.stringify(r));
  }
  for (const [fmt, why] of [['555-0100', '7 digits'], ['', 'empty'], [null, 'null'], ['not a phone', 'letters']]) {
    secure(`phone "${fmt}" (${why}) is not matched`, (await inbound(fmt, 'hello')).handled === false);
  }
  secure('empty body ignored', (await inbound(FARMER_PHONE, '')).handled === false);
  // sms-line's routeText() JS-trims first and answers HELP for blank texts, so this is defence in depth only.
  harden('whitespace/newline-only body ignored (Postgres trim() only strips spaces)', (await inbound(FARMER_PHONE, '   \n ')).handled === false, 'a "\\n" message is posted');
  secure('null body ignored', (await inbound(FARMER_PHONE, null)).handled === false);

  const sqlish = `'); delete from public.messages; drop table public.profiles; --`;
  const r1 = await inbound(FARMER_PHONE, sqlish);
  secure('SQL-looking text is stored verbatim and harmless', r1.handled && (await n(`select count(*)::int n from public.messages where body = $1`, [sqlish])) === 1
    && (await n(`select count(*)::int n from public.profiles`)) === Object.keys(U).length);

  await inbound(FARMER_PHONE, 'y'.repeat(100_000));
  secure('huge text truncated to 2000 chars (plain reply)', (await n(`select max(length(body))::int n from public.messages where via = 'sms'`)) <= 2000);
  await sent(); // the inquiry notification
  const ri = await inbound(FARMER_PHONE, 'YES ' + 'z'.repeat(100_000));
  const zl = await n(`select coalesce(max(length(body)), 0)::int n from public.messages where via = 'sms' and body like 'zzz%'`);
  // Twilio caps inbound bodies at 1600 chars, so only reachable if something else calls sms_inbound.
  harden('huge text truncated to 2000 chars (YES/PART/NO inquiry answer)', zl <= 2000, `stored ${zl} chars (v_rest is not truncated) ${JSON.stringify(ri).slice(0, 60)}`);

  // Thread context must be a text we actually sent, recently, about a thread they're in.
  await as(U.outsider);
  const conv2 = (await q(`select public.start_conversation($1) id`, [FARM2]))[0].id;
  await q(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Pecans?')`, [conv2, U.outsider]);
  secure('reply is not routed to a thread whose text was never sent', (await inbound(FARMER2_PHONE, 'yes I have some')).handled === false);
  await svc();
  await db.exec(`update public.notification_deliveries d set status = 'sent' from public.notifications n where n.id = d.notification_id and n.user_id = '${U.farmer2}';
                 update public.notifications set created_at = now() - interval '4 days' where user_id = '${U.farmer2}'`);
  secure('reply is not routed when the last text is older than 3 days', (await inbound(FARMER2_PHONE, 'yes I have some')).handled === false);
  await db.exec(`update public.notifications set created_at = now() where user_id = '${U.farmer2}'`);
  const ok2 = await inbound(FARMER2_PHONE, 'yes I have some');
  secure('(control) a fresh, sent text does route the reply', ok2.handled === true && ok2.conversation_id === conv2, JSON.stringify(ok2));
  secure('sms reply never lands in a thread the texter is not a member of',
    (await n(`select count(*)::int n from public.messages m where m.via = 'sms' and not exists (select 1 from public.conversation_members x where x.conversation_id = m.conversation_id and x.user_id = m.sender_id)`)) === 0);

  // Check-in keywords vs. ordinary replies. c1 (region 6) is open and the farmer (farm in region 6) is in it.
  await sent();
  const okReply = await inbound(FARMER_PHONE, 'OK see you Saturday at 9');
  secure('an ordinary "OK ..." reply to a buyer reaches the buyer (not swallowed as a storm check-in answer)',
    okReply.conversation_id === conv, `went to check-in ${okReply.checkin_id ?? '-'}; buyer never sees it`);
  const before = (await q(`select status from public.checkin_responses where checkin_id = $1 and user_id = $2`, [c1, U.farmer]))[0]?.status;
  // Ambiguous "Need ..." during an open check-in: safety first, but the confirmation must say how to reach the thread,
  // and "REPLY ..." must always reach the buyer.
  const needReply = await inbound(FARMER_PHONE, 'Need to know if you want them washed');
  secure('an ambiguous "Need ..." text gets a confirmation that explains REPLY',
    needReply.conversation_id === conv || /REPLY/.test(needReply.reply ?? ''), JSON.stringify(needReply));
  const forced = await inbound(FARMER_PHONE, 'REPLY Need to know if you want them washed');
  const lastBody = (await q(`select body from public.messages where conversation_id = $1 order by created_at desc limit 1`, [conv]))[0]?.body;
  secure('"REPLY ..." always reaches the conversation, with the keyword stripped',
    forced.conversation_id === conv && lastBody === 'Need to know if you want them washed', `${JSON.stringify(forced)} / ${lastBody}`);
  await svc(); await db.exec(`update public.checkin_responses set status = 'ok' where checkin_id = '${c1}' and user_id = '${U.farmer}'`);

  // Numbers are matched on their last 10 digits only.
  await svc();
  secure('phone_key distinguishes +1 207 946 0958 from +44 20 7946 0958', (await q(`select public.phone_key('+12079460958') a, public.phone_key('+442079460958') b`))[0].a !== (await q(`select public.phone_key('+442079460958') b`))[0].b);
  await db.exec(`update public.contact_prefs set phone = '+442079460958', sms_opt_in = true, updated_at = now() + interval '1 minute' where user_id = '${U.intl}'`);
  await as(U.admin);
  const c3 = (await q(`insert into public.checkins (title, audience) values ('National check-in', 'everyone') returning id`))[0].id;
  await inbound(FARMER2_PHONE, 'SAFE all good');
  await svc();
  const who = (await q(`select user_id from public.checkin_responses where checkin_id = $1 and via = 'sms'`, [c3]))[0]?.user_id;
  secure('a US farmer\'s SAFE is recorded for that farmer, not a UK member with the same last 10 digits', who === U.farmer2,
    `recorded for ${Object.entries(U).find(([, id]) => id === who)?.[0] ?? who}`);
  await db.exec(`update public.contact_prefs set sms_opt_in = false where user_id = '${U.intl}'; delete from public.checkin_responses where checkin_id = '${c3}'`);

  // A member who typed someone else's number (and a far-future updated_at) captures their texts.
  await db.exec(`update public.contact_prefs set sms_opt_in = true where user_id = '${U.attacker}'`);
  const hijackOn = (await q(`select phone from public.contact_prefs where user_id = $1`, [U.attacker]))[0].phone === FARMER_PHONE;
  if (hijackOn) {
    await inbound(FARMER_PHONE, 'SAFE');
    const who2 = (await q(`select user_id from public.checkin_responses where checkin_id = $1 and via = 'sms'`, [c3]))[0]?.user_id;
    await sent();
    const lost = await inbound(FARMER_PHONE, 'Saturday works');
    secure('the farmer\'s own texts resolve to the farmer when another member claims the same number',
      who2 === U.farmer && lost.handled === true, `SAFE recorded for ${Object.entries(U).find(([, id]) => id === who2)?.[0]}; thread reply handled=${lost.handled}`);
  } else {
    secure('the farmer\'s own texts resolve to the farmer when another member claims the same number', true);
  }
  await db.exec(`update public.contact_prefs set phone = null, sms_opt_in = false, updated_at = now() where user_id = '${U.attacker}'`);
});

// ===========================================================================
await section('Storage', async () => {
  await as(U.buyer);
  await q(`insert into storage.objects (bucket_id, name) values ('voice-notes', $1)`, [`${conv}/a.m4a`]);
  await refused('voice note owner cannot be forged', () => q(`insert into storage.objects (bucket_id, name, owner) values ('voice-notes', $1, $2)`, [`${conv}/b.m4a`, U.farmer]));
  await refused('voice note outside a uuid folder refused', () => q(`insert into storage.objects (bucket_id, name) values ('voice-notes', 'loose.m4a')`));
  const conv2 = (await (async () => { await svc(); return q(`select id from public.conversations where farm_id = $1`, [FARM2]); })())[0].id;
  await as(U.buyer);
  await refused('member cannot upload into a thread they are not in', () => q(`insert into storage.objects (bucket_id, name) values ('voice-notes', $1)`, [`${conv2}/x.m4a`]));
  for (const who of ['outsider', 'farmer2']) {
    await as(U[who]);
    secure(`${who} cannot read another thread's voice notes`, (await n(`select count(*)::int n from storage.objects where bucket_id = 'voice-notes' and name like $1`, [`${conv}/%`])) === 0);
    await noEffect(`${who} cannot delete another thread's voice notes`, () => q(`delete from storage.objects where bucket_id = 'voice-notes' returning 1`));
    await noEffect(`${who} cannot rename/move voice notes`, () => q(`update storage.objects set name = $1 where bucket_id = 'voice-notes' returning 1`, [`${conv2}/stolen.m4a`]));
  }
  await as(null);
  secure('anon cannot list voice notes', (await n(`select count(*)::int n from storage.objects where bucket_id = 'voice-notes'`)) === 0);
  await refused('anon cannot upload voice notes', () => q(`insert into storage.objects (bucket_id, name) values ('voice-notes', $1)`, [`${conv}/anon.m4a`]));
  await refused('anon cannot upload farm photos', () => q(`insert into storage.objects (bucket_id, name) values ('farm-photos', $1)`, [`${FARM}/anon.jpg`]));

  await as(U.farmer);
  await q(`insert into storage.objects (bucket_id, name) values ('farm-photos', $1)`, [`${FARM}/1.jpg`]);
  await refused('owner cannot upload into another farm\'s folder', () => q(`insert into storage.objects (bucket_id, name) values ('farm-photos', $1)`, [`${FARM2}/1.jpg`]));
  await refused('farm photo outside a farm folder refused', () => q(`insert into storage.objects (bucket_id, name) values ('farm-photos', 'root.jpg')`));
  await as(U.farmer2);
  await noEffect('non-owner cannot delete farm photos', () => q(`delete from storage.objects where bucket_id = 'farm-photos' and name like $1 returning 1`, [`${FARM}/%`]));
  await noEffect('non-owner cannot move a farm photo into own folder', () => q(`update storage.objects set name = $1 where bucket_id = 'farm-photos' returning 1`, [`${FARM2}/stolen.jpg`]));
  await refused('cannot drop files into another bucket', () => q(`insert into storage.objects (bucket_id, name) values ('avatars', 'x/y.jpg')`));
});

// ===========================================================================
await section('guard_photo_path', async () => {
  await as(U.farmer);
  await refused('real farm cannot link an external https photo', () => q(`insert into public.farm_photos (farm_id, path, alt_text, farmer_consent, credit) values ($1, 'https://evil.example/x.jpg', 'xxxx', true, 'me')`, [FARM]));
  await refused('real farm cannot link an http photo', () => q(`insert into public.farm_photos (farm_id, path, alt_text, farmer_consent, credit) values ($1, 'http://evil.example/x.jpg', 'xxxx', true, 'me')`, [FARM]));
  const ph = (await q(`insert into public.farm_photos (farm_id, path, alt_text, farmer_consent) values ($1, $2, 'Rows at dawn', true) returning id`, [FARM, `${FARM}/1.jpg`]))[0].id;
  await refused('cannot switch an uploaded photo to an external link later', () => q(`update public.farm_photos set path = 'https://evil.example/x.jpg', credit = 'x' where id = $1`, [ph]));
  await refused('cannot move a photo row to another farm', () => q(`update public.farm_photos set farm_id = $1 where id = $2`, [FARM2, ph]));
  await refused('cannot add photos to a sample farm you do not own', () => q(`insert into public.farm_photos (farm_id, path, alt_text, farmer_consent, credit) values ($1, 'https://x.example/a.jpg', 'xxxx', true, 'me')`, [SAMPLE]));
  let cross = false;
  try { await q(`insert into public.farm_photos (farm_id, path, alt_text, farmer_consent) values ($1, $2, 'Their photo', true)`, [FARM, `${FARM2}/1.jpg`]); cross = true; } catch { /* refused */ }
  secure('a farm\'s photo path must be inside its own folder (cannot show another farm\'s uploads as its own)', !cross, `path ${FARM2}/1.jpg accepted on ${FARM}`);
  for (const p of ['HTTPS://evil.example/x.jpg', ' https://evil.example/x.jpg', 'data:image/svg+xml,<svg/>', '//evil.example/x.jpg']) {
    let ok = false;
    try { await q(`insert into public.farm_photos (farm_id, path, alt_text, farmer_consent) values ($1, $2, 'xxxx', true)`, [FARM, p]); ok = true; } catch { /* refused */ }
    harden(`non-storage path "${p}" refused on a real farm`, !ok, 'accepted; the app\'s photoUrl() treats it as a bucket path today, so not rendered as an external URL');
  }
  await as(U.admin);
  let emptyCredit = false;
  try { await q(`insert into public.farm_photos (farm_id, path, alt_text, farmer_consent, credit) values ($1, 'https://x.example/b.jpg', 'xxxx', true, '  ')`, [SAMPLE]); emptyCredit = true; } catch { /* refused */ }
  harden('linked photos need a non-blank credit', !emptyCredit, 'credit "  " accepted');
});

// ===========================================================================
await section('Events, resources, posts, reports, shifts', async () => {
  await as(U.outsider);
  const ev = (await q(`insert into public.events (title, starts_at, place, host_name, host_farm_id, is_sample, submitted_by)
                       values ('My day', now() + interval '5 days', 'Here', 'Me', $1, true, $2) returning *`, [FARM, U.buyer]))[0];
  secure('event submitter/status/is_sample forced', ev.submitted_by === U.outsider && ev.status === 'pending' && !ev.is_sample);
  harden('member cannot attribute an event to a farm they do not own (host_farm_id)', ev.host_farm_id !== FARM, 'host_farm_id = another farmer\'s farm accepted');
  await as(U.buyer);
  await noEffect('member cannot edit another\'s event', () => q(`update public.events set title = 'x' where title = 'Collard Green Gala' returning 1`));
  await noEffect('member cannot delete events', () => q(`delete from public.events returning 1`));
  await noEffect('member cannot edit resources', () => q(`update public.resources set url = 'https://evil.example' returning 1`));
  await noEffect('member cannot delete resources', () => q(`delete from public.resources returning 1`));
  await refused('member cannot add resources', () => q(`insert into public.resources (name, org, url, kind, summary) values ('x', 'x', 'https://x', 'x', 'x')`));
  let rsvp = false;
  try { await q(`insert into public.event_rsvps (event_id, user_id) values ($1, $2)`, [ev.id, U.buyer]); rsvp = true; } catch { /* refused */ }
  harden('cannot RSVP to an event you cannot see (pending)', !rsvp);

  await as(U.admin);
  await q(`select public.review_event($1, 'approved')`, [ev.id]);
  await as(U.outsider);
  let jsTicket = false;
  try { await q(`update public.events set ticket_url = 'javascript:alert(1)' where id = $1`, [ev.id]); jsTicket = (await q(`select ticket_url from public.events where id = $1`, [ev.id]))[0].ticket_url?.startsWith('javascript'); } catch { /* refused */ }
  secure('event ticket_url must be https (opened with WebBrowser.openBrowserAsync)', !jsTicket, 'javascript: URL saved on an approved event');
  const edited = await q(`update public.events set title = 'Totally different', place = 'Elsewhere', starts_at = now() + interval '1 day' where id = $1 returning status`, [ev.id]);
  harden('editing an approved event sends it back for review', edited[0]?.status !== 'approved', 'title/place/time changed, still approved');
  await as(U.farmer);
  const fe = await q(`update public.farms set name = 'Renamed Farm', story = 'new story' where id = $1 returning status`, [FARM]);
  harden('editing an approved farm\'s public listing re-queues it (or at least name/region)', fe[0]?.status !== 'approved', 'still approved after rename');

  // Board.
  await as(U.outsider);
  const post = (await q(`insert into public.posts (kind, title, body) values ('offer', 'Free seedlings', 'x') returning id`))[0].id;
  await refused('post as someone else refused', () => q(`insert into public.posts (author_id, kind, title) values ($1, 'offer', 'xxxx')`, [U.buyer]));
  await refused('cannot create a post already hidden/closed-by-staff state', () => q(`insert into public.posts (kind, title, status) values ('offer', 'xxxx', 'hidden')`));
  await as(U.buyer);
  await noEffect('member cannot edit another\'s post', () => q(`update public.posts set title = 'hijacked' where id = $1 returning 1`, [post]));
  await noEffect('member cannot delete another\'s post', () => q(`delete from public.posts where id = $1 returning 1`, [post]));
  await as(U.admin);
  await q(`update public.posts set status = 'hidden' where id = $1`, [post]);
  await as(U.outsider);
  await q(`update public.posts set status = 'open' where id = $1`, [post]).catch(() => {});
  await svc();
  secure('author cannot un-hide a post staff took down', (await q(`select status from public.posts where id = $1`, [post]))[0].status === 'hidden');
  await as(U.outsider);
  await q(`update public.posts set author_id = $1 where id = $2`, [U.buyer, post]).catch(() => {});
  await svc();
  secure('author cannot reassign a post to another member', (await q(`select author_id from public.posts where id = $1`, [post]))[0].author_id === U.outsider);
  await as(U.outsider);
  const p2 = (await q(`insert into public.posts (kind, title, expires_at) values ('offer', 'Forever post', '2999-01-01') returning expires_at`))[0];
  harden('posts cannot set their own expiry far beyond 45 days', new Date(p2.expires_at) < new Date(Date.now() + 60 * 86400_000), 'expires 2999');

  // Reports.
  await as(U.buyer);
  let preResolved = false;
  try { const r = await q(`insert into public.reports (target_type, target_id, reason, resolved_at, resolved_by) values ('farm', $1, 'spam', now(), $2) returning resolved_at`, [post, U.admin]); preResolved = r[0].resolved_at !== null; } catch { /* refused */ }
  harden('reporter cannot file a report as already resolved (by staff)', !preResolved, 'resolved_at/resolved_by accepted from member');
  await refused('report as someone else refused', () => q(`insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, 'farm', $2, 'x')`, [U.farmer, FARM]));
  secure('members cannot read reports', (await n(`select count(*)::int n from public.reports`)) === 0);

  // Broadcasts (texts cost money).
  await refused('member cannot send a broadcast', () => q(`insert into public.broadcasts (title, body, channels) values ('x', 'y', '{sms}')`));
  await as(U.coord);
  let coordBroadcast = false;
  try { await q(`insert into public.broadcasts (title, body, channels) values ('Coord note', 'y', '{push}')`); coordBroadcast = true; } catch { /* refused */ }
  harden('only admins send broadcasts / manage resources and channels (ADMIN.md role table)', !coordBroadcast,
    'coordinators pass is_staff() everywhere; the app also treats them as staff, so docs and code disagree');

  // Shifts.
  await as(U.buyer);
  const shift = (await q(`select id from public.volunteer_shifts limit 1`))[0].id;
  await refused('cannot sign someone else up for a shift', () => q(`insert into public.shift_signups (shift_id, user_id) values ($1, $2)`, [shift, U.farmer]));
  await as(U.farmer);
  await q(`insert into public.shift_signups (shift_id, user_id) values ($1, $2)`, [shift, U.farmer]);
  await as(U.buyer);
  await noEffect('cannot cancel someone else\'s shift', () => q(`delete from public.shift_signups where user_id = $1 returning 1`, [U.farmer]));
  await as(null);
  harden('anon cannot list which member ids signed up for which shift', (await n(`select count(*)::int n from public.shift_signups`)) === 0,
    '"signups readable" policy has no role; shift_availability only needs counts');
});

// ---------------------------------------------------------------------------
console.log(`\n${safeCount} checks secure, ${holes.length} holes, ${warns.length} warnings`);
if (holes.length) { console.log('\nHOLES:'); holes.forEach((h, i) => console.log(` ${i + 1}. ${h}`)); }
if (warns.length) { console.log('\nWARNINGS:'); warns.forEach((h, i) => console.log(` ${i + 1}. ${h}`)); }
