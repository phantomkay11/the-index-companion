import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const db = new PGlite();

// Minimal stand-ins for what Supabase provides.
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
for (const f of files) {
  await db.exec(readFileSync(`${root}/${f}`, 'utf8'));
  console.log('ok', f);
}
} catch (e) { console.log('MIGRATION ERROR:', e.message, e.where ?? '', e.position ?? ''); process.exit(1); }

const one = async (sql, params) => (await db.query(sql, params)).rows;
const as = async (uid) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  if (uid) await db.exec('set role authenticated');
  else await db.exec('set role anon');
};
const expectFail = async (label, fn) => {
  try { await fn(); console.log('FAIL (should have errored):', label); process.exitCode = 1; }
  catch (e) { console.log('ok refused:', label, '-', e.message.split('\n')[0]); }
};
const check = (label, cond) => { console.log(cond ? 'ok' : 'FAIL', label); if (!cond) process.exitCode = 1; };

const buyer = '11111111-1111-4111-8111-111111111111';
const farmer = '22222222-2222-4222-8222-222222222222';
const staff = '33333333-3333-4333-8333-333333333333';
await db.exec('reset role');
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${buyer}', 'buyer@example.com', '{"display_name":"Marcus"}'),
  ('${farmer}', 'farmer@example.com', '{}'),
  ('${staff}', 'staff@example.com', '{}')`);
await db.exec(`update public.profiles set role = 'admin' where id = '${staff}'`);
check('profiles created by trigger', (await one('select count(*)::int n from public.profiles'))[0].n === 3);

// Anonymous visitors see approved farms, resources, regions and the gala.
await as(null);
check('anon sees 8 sample farms', (await one('select count(*)::int n from public.farms'))[0].n === 8);
check('anon sees 12 regions', (await one('select count(*)::int n from public.regions'))[0].n === 12);
check('anon sees 8 resources', (await one('select count(*)::int n from public.resources'))[0].n === 8);
check('anon sees 5 events', (await one('select count(*)::int n from public.events'))[0].n === 5);
check('anon cannot read channels', (await one('select count(*)::int n from public.conversations'))[0].n === 0);

// A farmer lists a farm: forced to pending, owned by them, invisible to others.
await as(farmer);
await one(`insert into public.farms (name, city, state, region_id, categories, status, verified_at, is_sample)
           values ('Test Farm', 'Lafayette', 'LA', '6', '{Row crops}', 'approved', now(), true)`);
const mine = (await one(`select * from public.farms where name = 'Test Farm'`))[0];
check('new farm forced to pending', mine.status === 'pending' && mine.verified_at === null && mine.is_sample === false);
check('new farm owned by submitter', mine.owner_id === farmer);
await one(`update public.farms set status = 'approved' where id = $1`, [mine.id]);
check('owner cannot self-approve', (await one(`select status from public.farms where id = $1`, [mine.id]))[0].status === 'pending');
await expectFail('member cannot promote self', () => one(`update public.profiles set role = 'admin' where id = $1`, [farmer]));
await one(`insert into public.farm_products (farm_id, name) values ($1, 'Okra')`, [mine.id]);

await as(buyer);
check('buyer cannot see pending farm', (await one(`select count(*)::int n from public.farms where id = $1`, [mine.id]))[0].n === 0);
await expectFail('cannot message unapproved farm', () => one(`select public.start_conversation($1)`, [mine.id]));
await expectFail('cannot message farm without owner', () => one(`select public.start_conversation('00000000-0000-4000-a000-000000000001')`));

// Staff approve.
await as(staff);
await one(`select public.review_farm($1, 'approved')`, [mine.id]);
const approved = (await one(`select status, verified_at from public.farms where id = $1`, [mine.id]))[0];
check('staff approval verifies farm', approved.status === 'approved' && approved.verified_at !== null);
check('farmer promoted to grower', (await one(`select role from public.profiles where id = $1`, [farmer]))[0].role === 'grower');

// Buyer sends an inquiry; farmer answers.
await as(buyer);
const conv = (await one(`select public.send_inquiry($1, 'Okra', '2 lb', '2026-10-10', 'Farm stand', 'Thanks!') as id`, [mine.id]))[0].id;
const again = (await one(`select public.start_conversation($1) as id`, [mine.id]))[0].id;
check('reopening returns the same thread', again === conv);
await one(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hello')`, [conv, buyer]);
await expectFail('cannot forge another sender', () => one(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'x')`, [conv, farmer]));
await expectFail('cannot insert inquiry directly', () => one(`insert into public.messages (conversation_id, sender_id, kind, body) values ($1, $2, 'inquiry', 'x')`, [conv, buyer]));
const inq = (await one(`select id from public.messages where conversation_id = $1 and kind = 'inquiry'`, [conv]))[0].id;
await expectFail('buyer cannot answer own inquiry', () => one(`select public.answer_inquiry($1, 'ready', 'yes')`, [inq]));

await as(farmer);
await one(`select public.answer_inquiry($1, 'ready', 'Ready Saturday')`, [inq]);
check('farmer sees 3 messages', (await one(`select count(*)::int n from public.messages where conversation_id = $1`, [conv]))[0].n === 3);
check('inquiry marked ready', (await one(`select inquiry_status from public.messages where id = $1`, [inq]))[0].inquiry_status === 'ready');

// A third member can't read the private thread.
await as(staff); // staff can, for moderation
check('staff can read thread for moderation', (await one(`select count(*)::int n from public.messages where conversation_id = $1`, [conv]))[0].n === 3);
const other = '44444444-4444-4444-8444-444444444444';
await db.exec('reset role');
await db.exec(`insert into auth.users (id, email) values ('${other}', 'other@example.com')`);
await as(other);
check('outsider cannot read thread', (await one(`select count(*)::int n from public.messages where conversation_id = $1`, [conv]))[0].n === 0);
check('outsider can read channels', (await one(`select count(*)::int n from public.conversations where kind = 'channel'`))[0].n === 18);
const ch = (await one(`select id from public.conversations where kind = 'channel' and region_id = '6'`))[0].id;
await expectFail('unverified member cannot post in channel', () => one(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'hi')`, [ch, other]));
check('outsider cannot read farm private details', (await one(`select count(*)::int n from public.farm_private`))[0].n === 0);

await as(farmer);
await one(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Hauling Saturday?')`, [ch, farmer]);
check('verified grower can post in channel', true);

// Events: member submission is pending; shifts enforce capacity.
await as(other);
await one(`insert into public.events (title, type, starts_at, place, host_name, status) values ('My event', 'Farm day', now() + interval '3 days', 'Here', 'Me', 'approved')`);
check('member event forced to pending', (await one(`select status from public.events where title = 'My event'`))[0].status === 'pending');
await as(buyer);
check('others cannot see pending event', (await one(`select count(*)::int n from public.events where title = 'My event'`))[0].n === 0);
const shift = (await one(`select id from public.volunteer_shifts where capacity = 2`))[0].id;
await one(`insert into public.shift_signups (shift_id, user_id) values ($1, $2)`, [shift, buyer]);
await as(other);
await one(`insert into public.shift_signups (shift_id, user_id) values ($1, $2)`, [shift, other]);
await as(farmer);
await expectFail('full shift refuses sign-up', () => one(`insert into public.shift_signups (shift_id, user_id) values ($1, $2)`, [shift, farmer]));
check('availability view shows 0 open', (await one(`select open_spots from public.shift_availability where id = $1`, [shift]))[0].open_spots === 0);

await as(buyer);
await one(`insert into public.event_rsvps (event_id, user_id) select id, $1 from public.events where title = 'Collard Green Gala'`, [buyer]);
await one(`insert into public.saved_resources (resource_id, user_id) select id, $1 from public.resources limit 1`, [buyer]);
await one(`insert into public.reports (target_type, target_id, reason) values ('farm', $1, 'test')`, [mine.id]);
check('member cannot read reports', (await one(`select count(*)::int n from public.reports`))[0].n === 0);
await expectFail('member cannot send broadcast', () => one(`insert into public.broadcasts (title, body) values ('x', 'y')`));
check('can_post true for direct member', (await one(`select public.can_post($1) as ok`, [conv]))[0].ok === true);

// ---------------------------------------------------------------------------
// v2: notifications, alerts, voice notes, photos, board, insights, impact
// ---------------------------------------------------------------------------
await db.exec('reset role');
await db.exec(`update public.contact_prefs set push_token = 'ExponentPushToken[farmer]', phone = '+15555550100', sms_opt_in = true where user_id = '${farmer}'`);
await db.exec(`update public.contact_prefs set push_token = 'ExponentPushToken[buyer]' where user_id = '${buyer}'`);

await as(buyer);
await one(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'Is Saturday still good?')`, [conv, buyer]);
await as(farmer);
const fn = await one(`select * from public.notifications where kind = 'message' order by created_at desc limit 1`);
check('farmer gets a message notification', fn.length === 1 && fn[0].data.route === `/thread/${conv}`);
await as(buyer);
check('buyer cannot read farmer notifications', (await one(`select count(*)::int n from public.notifications where user_id = $1`, [farmer]))[0].n === 0);
await expectFail('member cannot call enqueue_notification', () => one(`select public.enqueue_notification($1, 'x', 't', 'b')`, [buyer]));
await expectFail('member cannot read delivery outbox', async () => {
  const r = await one(`select count(*)::int n from public.notification_deliveries`);
  if (r[0].n === 0) throw new Error('no rows visible');
});
await db.exec('reset role');
const deliveries = await one(`select d.channel from public.notification_deliveries d join public.notifications n on n.id = d.notification_id where n.user_id = $1 and n.kind = 'message' order by channel`, [farmer]);
check('message queues push and sms for opted-in farmer', deliveries.map((d) => d.channel).join(',') === 'push,sms');

// Harvest mode keeps notifications in the inbox only.
await db.exec(`update public.farms set harvest_mode = true where id = '${mine.id}'`);
await as(buyer);
await one(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'One more thing')`, [conv, buyer]);
await db.exec('reset role');
const harvestDeliveries = await one(`select count(*)::int n from public.notification_deliveries d join public.notifications n on n.id = d.notification_id where n.user_id = $1 and n.body = 'One more thing'`, [farmer]);
check('harvest mode skips push and sms', harvestDeliveries[0].n === 0);
await db.exec(`update public.farms set harvest_mode = false, lat = 30.22, lon = -92.02 where id = '${mine.id}'`);

// Followers and near-me alerts when a product turns fresh.
await as(buyer);
await one(`insert into public.follows (user_id, farm_id) values ($1, $2)`, [buyer, mine.id]);
await as(other);
await one(`insert into public.saved_alerts (user_id, keyword, lat, lon, radius_miles) values ($1, 'okra', 30.3, -92.1, 25)`, [other]);
await one(`insert into public.saved_alerts (user_id, keyword, lat, lon, radius_miles) values ($1, 'honey', 30.3, -92.1, 25)`, [other]);
await as(farmer);
await one(`update public.farm_products set in_season = false where farm_id = $1`, [mine.id]);
await one(`update public.farm_products set in_season = true where farm_id = $1`, [mine.id]);
await as(buyer);
check('follower notified of fresh product', (await one(`select count(*)::int n from public.notifications where kind = 'fresh'`))[0].n === 1);
await as(other);
check('near-me alert matched once', (await one(`select count(*)::int n from public.notifications where kind = 'near_me'`))[0].n === 1);
await as(farmer);
await one(`insert into public.farm_products (farm_id, name) values ($1, 'Collards')`, [mine.id]);
await as(buyer);
check('repeat fresh updates within 12 hours are not re-sent', (await one(`select count(*)::int n from public.notifications where kind = 'fresh'`))[0].n === 1);
await one(`select public.mark_notifications_read()`);
check('mark read works', (await one(`select count(*)::int n from public.notifications where read_at is null`))[0].n === 0);

// Broadcasts fan out by audience.
await as(staff);
await one(`insert into public.broadcasts (title, body, audience, channels) values ('Growers only', 'Hi growers', 'growers', '{push,email}')`);
await expectFail('broadcast audience is validated', () => one(`insert into public.broadcasts (title, body, audience) values ('x', 'y', 'nobody')`));
await db.exec('reset role');
check('growers broadcast reaches only growers', (await one(`select count(*)::int n from public.notifications where kind = 'broadcast'`))[0].n === 1
  && (await one(`select user_id from public.notifications where kind = 'broadcast'`))[0].user_id === farmer);

// Reviews notify the submitter.
check('farm approval notified the farmer', (await one(`select count(*)::int n from public.notifications where kind = 'review' and user_id = $1`, [farmer]))[0].n === 1);

// Reminders: event tomorrow and a deadline in 7 days.
await db.exec(`update public.events set starts_at = now() + interval '24 hours' where title = 'Collard Green Gala'`);
await db.exec(`update public.resources set deadline = current_date + 7 where id = (select resource_id from public.saved_resources where user_id = '${buyer}' limit 1)`);
await as(buyer);
await expectFail('members cannot trigger reminders', () => one(`select public.run_due_reminders()`));
await db.exec('reset role');
const sent = (await one(`select public.run_due_reminders() as n`))[0].n;
const again2 = (await one(`select public.run_due_reminders() as n`))[0].n;
check('event and deadline reminders sent once', sent === 2 && again2 === 0);

// Voice notes: audio must live in the thread's folder.
await as(buyer);
await one(`insert into public.messages (conversation_id, sender_id, kind, audio_path) values ($1, $2, 'voice', $3)`, [conv, buyer, `${conv}/a.m4a`]);
await expectFail('voice note path must match its thread', () => one(`insert into public.messages (conversation_id, sender_id, kind, audio_path) values ($1, $2, 'voice', 'elsewhere/a.m4a')`, [conv, buyer]));
await one(`insert into storage.objects (bucket_id, name) values ('voice-notes', $1)`, [`${conv}/a.m4a`]);
await as(other);
await expectFail('outsider cannot upload into a private thread', () => one(`insert into storage.objects (bucket_id, name) values ('voice-notes', $1)`, [`${conv}/b.m4a`]));
check('outsider cannot see thread audio', (await one(`select count(*)::int n from storage.objects where bucket_id = 'voice-notes'`))[0].n === 0);
await as(buyer);
await expectFail('messages cannot be edited', () => one(`update public.messages set body = 'changed' where sender_id = $1`, [buyer]).then(async () => {
  const r = await one(`select count(*)::int n from public.messages where body = 'changed'`);
  if (r[0].n === 0) throw new Error('not editable');
}));

await as(staff);
await expectFail('staff can hide but not rewrite messages', () => one(`update public.messages set body = 'rewritten' where conversation_id = $1`, [conv]));
await one(`update public.messages set hidden = true where conversation_id = $1 and body = 'One more thing'`, [conv]);
check('staff can hide a message', (await one(`select hidden from public.messages where body = 'One more thing'`))[0].hidden === true);

// Farm photos need consent and alt text, and only the owner can add them.
await as(farmer);
await one(`insert into public.farm_photos (farm_id, path, alt_text, farmer_consent) values ($1, $2, 'Rows of okra at sunrise', true)`, [mine.id, `${mine.id}/1.jpg`]);
await expectFail('photo requires consent', () => one(`insert into public.farm_photos (farm_id, path, alt_text, farmer_consent) values ($1, 'x', 'Some words', false)`, [mine.id]));
await expectFail('photo requires alt text', () => one(`insert into public.farm_photos (farm_id, path, alt_text, farmer_consent) values ($1, 'x', '', true)`, [mine.id]));
await one(`insert into storage.objects (bucket_id, name) values ('farm-photos', $1)`, [`${mine.id}/1.jpg`]);
await as(buyer);
await expectFail('non-owner cannot add farm photos', () => one(`insert into public.farm_photos (farm_id, path, alt_text, farmer_consent) values ($1, 'x', 'Some words', true)`, [mine.id]));
await expectFail('non-owner cannot upload to farm folder', () => one(`insert into storage.objects (bucket_id, name) values ('farm-photos', $1)`, [`${mine.id}/2.jpg`]));
await as(null);
check('anyone can see approved farm photos', (await one(`select count(*)::int n from public.farm_photos`))[0].n === 1);

// Community board.
await as(other);
const post = (await one(`insert into public.posts (kind, title, body, region_id) values ('need', 'Hands for harvest Saturday', 'Two hours', '6') returning id`))[0].id;
await expectFail('cannot post as someone else', () => one(`insert into public.posts (author_id, kind, title) values ($1, 'offer', 'Free seedlings')`, [buyer]));
await as(buyer);
check('members see open posts', (await one(`select count(*)::int n from public.posts`))[0].n === 1);
const pc = (await one(`select public.start_post_conversation($1) as id`, [post]))[0].id;
check('replying reopens the same thread', (await one(`select public.start_post_conversation($1) as id`, [post]))[0].id === pc);
await one(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'I can help')`, [pc, buyer]);
await expectFail('cannot edit someone else\'s post', async () => {
  await one(`update public.posts set title = 'hijacked' where id = $1`, [post]);
  const r = await one(`select title from public.posts where id = $1`, [post]);
  if (r[0].title !== 'hijacked') throw new Error('unchanged');
});
await as(other);
check('post author notified of reply', (await one(`select count(*)::int n from public.notifications where kind = 'board'`))[0].n === 1);
await one(`update public.posts set status = 'closed' where id = $1`, [post]);
await as(buyer);
check('closed posts disappear for others', (await one(`select count(*)::int n from public.posts`))[0].n === 0);
await as(null);
check('anonymous visitors cannot read the board', (await one(`select count(*)::int n from public.posts`))[0].n === 0);

// Insights and impact.
await as(buyer);
await one(`select public.log_farm_view($1)`, [mine.id]);
await one(`select public.log_farm_view($1)`, [mine.id]);
await expectFail('non-owner cannot see farm insights', () => one(`select * from public.farm_insights($1)`, [mine.id]));
await expectFail('member cannot see impact report', () => one(`select public.impact_stats()`));
await as(farmer);
await one(`select public.log_farm_view($1)`, [mine.id]);
const ins = (await one(`select * from public.farm_insights($1)`, [mine.id]))[0];
check('farm insights count views (not own), followers and inquiries', ins.views_30d === 2 && ins.followers === 1 && ins.inquiries_30d === 1);
await as(staff);
const impact = (await one(`select public.impact_stats() as s`))[0].s;
check('impact report counts inquiries and regions', impact.inquiries_total === 1 && impact.farms_by_region['6'] === 1 && impact.members === 4);
check('miles() is accurate', Math.abs((await one(`select public.miles(30.22, -92.02, 29.95, -90.07) as m`))[0].m - 118.5) < 2);

console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
