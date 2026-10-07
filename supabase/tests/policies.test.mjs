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
// Acting as the service role / server: no member identity, full rights.
const svc = async () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
const expectFail = async (label, fn) => {
  try { await fn(); console.log('FAIL (should have errored):', label); process.exitCode = 1; }
  catch (e) { console.log('ok refused:', label, '-', e.message.split('\n')[0]); }
};
const check = (label, cond) => { console.log(cond ? 'ok' : 'FAIL', label); if (!cond) process.exitCode = 1; };

const buyer = '11111111-1111-4111-8111-111111111111';
const farmer = '22222222-2222-4222-8222-222222222222';
const staff = '33333333-3333-4333-8333-333333333333';
await svc();
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
await svc();
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
await svc();
await db.exec(`update public.contact_prefs set push_token = 'ExponentPushToken[farmer]', phone = '+15555550100', sms_opt_in = true, phone_verified_at = now() where user_id = '${farmer}'`);
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
await svc();
const deliveries = await one(`select d.channel from public.notification_deliveries d join public.notifications n on n.id = d.notification_id where n.user_id = $1 and n.kind = 'message' order by channel`, [farmer]);
check('message queues push and sms for opted-in farmer', deliveries.map((d) => d.channel).join(',') === 'push,sms');

// Harvest mode keeps notifications in the inbox only.
await db.exec(`update public.farms set harvest_mode = true where id = '${mine.id}'`);
await as(buyer);
await one(`insert into public.messages (conversation_id, sender_id, body) values ($1, $2, 'One more thing')`, [conv, buyer]);
await svc();
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
await svc();
check('growers broadcast reaches only growers', (await one(`select count(*)::int n from public.notifications where kind = 'broadcast'`))[0].n === 1
  && (await one(`select user_id from public.notifications where kind = 'broadcast'`))[0].user_id === farmer);

// Reviews notify the submitter.
check('farm approval notified the farmer', (await one(`select count(*)::int n from public.notifications where kind = 'review' and user_id = $1`, [farmer]))[0].n === 1);

// Reminders: event tomorrow and a deadline in 7 days.
await db.exec(`update public.events set starts_at = now() + interval '24 hours' where title = 'Collard Green Gala'`);
await db.exec(`update public.resources set deadline = current_date + 7 where id = (select resource_id from public.saved_resources where user_id = '${buyer}' limit 1)`);
await as(buyer);
await expectFail('members cannot trigger reminders', () => one(`select public.run_due_reminders()`));
await svc();
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


// ---------------------------------------------------------------------------
// Round 3: photo credits, ordering links, two-way texting, surveys, check-ins
// ---------------------------------------------------------------------------
await as(staff);
await one(`insert into public.farm_photos (farm_id, path, alt_text, farmer_consent, credit, credit_url)
           values ('00000000-0000-4000-a000-000000000001', 'https://example.com/a.jpg', 'Rows of greens at sunrise', true, 'Jane Doe / Unsplash', 'https://unsplash.com')`);
check('sample farms can use credited linked photos', (await one(`select count(*)::int n from public.farm_photos where credit is not null`))[0].n === 1);
await expectFail('linked photo without credit refused', () => one(`insert into public.farm_photos (farm_id, path, alt_text, farmer_consent)
           values ('00000000-0000-4000-a000-000000000001', 'https://example.com/b.jpg', 'Greens', true)`));
await expectFail('real farms cannot use linked photos', () => one(`insert into public.farm_photos (farm_id, path, alt_text, farmer_consent, credit)
           values ($1, 'https://example.com/c.jpg', 'Greens', true, 'x')`, [mine.id]));

await as(farmer);
await one(`update public.farms set order_url = 'https://shop.example.com', order_label = 'Join our CSA' where id = $1`, [mine.id]);
check('farmer sets an ordering link', (await one(`select order_label from public.farms where id = $1`, [mine.id]))[0].order_label === 'Join our CSA');
await as(staff);
check('a new ordering link goes to BFI for review first', (await one(`select status from public.farms where id = $1`, [mine.id]))[0].status === 'pending');
await one(`select public.review_farm($1, 'approved')`, [mine.id]);
await as(farmer);
await expectFail('ordering link must be https', () => one(`update public.farms set order_url = 'javascript:alert(1)' where id = $1`, [mine.id]));

// Two-way texting. The farmer was texted about the buyer's message; mark that text sent.
await svc();
await db.exec(`update public.notification_deliveries set status = 'sent' where channel = 'sms'`);
await expectFail('members cannot call sms_inbound', async () => { await as(buyer); await one(`select public.sms_inbound('+15555550100', 'hi')`); });
await svc();
const sms1 = (await one(`select public.sms_inbound('(555) 555-0100', 'See you Saturday at 9') as r`))[0].r;
check('farmer text reply lands in the thread', sms1.handled === true && sms1.conversation_id === conv
  && (await one(`select count(*)::int n from public.messages where conversation_id = $1 and via = 'sms' and body = 'See you Saturday at 9'`, [conv]))[0].n === 1);
check('buyer is notified of the texted reply', (await one(`select count(*)::int n from public.notifications where user_id = $1 and body = 'See you Saturday at 9'`, [buyer]))[0].n === 1);
const unknown = (await one(`select public.sms_inbound('+15550000000', 'HONEY') as r`))[0].r;
check('unknown numbers fall back to search', unknown.handled === false);
// A fresh inquiry, answered by text.
await as(buyer);
await one(`select public.send_inquiry($1, 'Okra', '5 lb', '2026-10-12', 'Farm stand', '')`, [mine.id]);
await svc();
await db.exec(`update public.notification_deliveries set status = 'sent' where channel = 'sms'`);
const sms2 = (await one(`select public.sms_inbound('+1 555 555 0100', 'part I have 3 lb') as r`))[0].r;
check('farmer answers an inquiry with PART', sms2.handled === true
  && (await one(`select inquiry_status from public.messages where conversation_id = $1 and kind = 'inquiry' order by created_at desc limit 1`, [conv]))[0].inquiry_status === 'partial'
  && (await one(`select count(*)::int n from public.messages where body = 'I have 3 lb'`))[0].n === 1);
await db.exec(`update public.contact_prefs set sms_opt_in = false where user_id = '${farmer}'`);
check('opted-out numbers are not matched', (await one(`select public.sms_inbound('+15555550100', 'hello') as r`))[0].r.handled === false);
await db.exec(`update public.contact_prefs set sms_opt_in = true where user_id = '${farmer}'`);

// Surveys.
await as(buyer);
await expectFail('members cannot create surveys', () => one(`insert into public.surveys (title, status) values ('Mine', 'open')`));
await as(staff);
const survey = (await one(`insert into public.surveys (title, intro, questions, audience) values ('Growing season check', 'Three questions',
  '[{"id":"q1","type":"scale","prompt":"How was the season?"},{"id":"q2","type":"text","prompt":"What would help?"}]', 'growers') returning id`))[0].id;
await as(farmer);
check('draft surveys are hidden', (await one(`select count(*)::int n from public.surveys`))[0].n === 0);
await as(staff);
await one(`update public.surveys set status = 'open' where id = $1`, [survey]);
await svc();
check('opening a survey notifies its audience only', (await one(`select count(*)::int n from public.notifications where kind = 'survey'`))[0].n === 1
  && (await one(`select user_id from public.notifications where kind = 'survey'`))[0].user_id === farmer);
await as(farmer);
await one(`insert into public.survey_responses (survey_id, answers, consent_share) values ($1, '{"q1":4,"q2":"A cooler"}', true)`, [survey]);
await one(`update public.survey_responses set answers = '{"q1":5,"q2":"A walk-in cooler"}' where survey_id = $1`, [survey]);
check('farmer can change answers while open', (await one(`select answers->>'q2' a from public.survey_responses where survey_id = $1`, [survey]))[0].a === 'A walk-in cooler');
await as(buyer);
await expectFail('people outside the audience cannot answer', () => one(`insert into public.survey_responses (survey_id, answers) values ($1, '{}')`, [survey]));
check('members cannot read others’ answers', (await one(`select count(*)::int n from public.survey_responses`))[0].n === 0);
await as(staff);
check('staff can read answers', (await one(`select count(*)::int n from public.survey_responses where consent_share`))[0].n === 1);
await one(`update public.surveys set status = 'closed' where id = $1`, [survey]);
await as(farmer);
await one(`update public.survey_responses set answers = '{}' where survey_id = $1`, [survey]);
check('answers lock when a survey closes', (await one(`select answers->>'q1' a from public.survey_responses where survey_id = $1`, [survey]))[0].a === '5');

// Storm check-ins.
await svc();
await db.exec(`update public.profiles set region_id = '6' where id = '${buyer}'`);
await as(farmer);
await expectFail('members cannot send check-ins', () => one(`insert into public.checkins (title, audience) values ('x', 'everyone')`));
await as(staff);
const checkin = (await one(`insert into public.checkins (title, message, audience) values ('Hurricane check-in', 'Hurricane Delta passed through Louisiana.', 'region:6') returning id`))[0].id;
await svc();
const ciNotes = await one(`select n.user_id, array_agg(d.channel order by d.channel) ch from public.notifications n left join public.notification_deliveries d on d.notification_id = n.id where n.kind = 'checkin' group by n.user_id`);
check('check-in reaches the region by push and text', ciNotes.length === 2 && ciNotes.find((r) => r.user_id === farmer)?.ch.join(',') === 'push,sms');
await as(buyer);
await one(`insert into public.checkin_responses (checkin_id, status, note) values ($1, 'need_help', 'Tree on the barn road')`, [checkin]);
await as(other);
check('people outside the region do not see the check-in', (await one(`select count(*)::int n from public.checkins`))[0].n === 0);
await expectFail('outsiders cannot answer', () => one(`insert into public.checkin_responses (checkin_id, status) values ($1, 'ok')`, [checkin]));
await svc();
const sms3 = (await one(`select public.sms_inbound('+15555550100', 'SAFE all good here') as r`))[0].r;
check('farmer answers the check-in by text', sms3.handled === true && sms3.checkin_id === checkin);
await as(buyer);
await expectFail('members cannot read the check-in report', () => one(`select public.checkin_report($1)`, [checkin]));
await as(staff);
const report = (await one(`select public.checkin_report($1) as r`, [checkin]))[0].r;
check('report counts answers and lists who needs help with a phone', report.reached === 2 && report.ok === 1 && report.need_help === 1
  && report.needs[0].name === 'Marcus' && report.needs[0].note === 'Tree on the barn road');


// ---------------------------------------------------------------------------
// Hardening (October 2026 review): each of these was an attack that used to work.
// ---------------------------------------------------------------------------
const attacker = '55555555-5555-4555-8555-555555555555';
await svc();
await db.exec(`insert into auth.users (id, email) values ('${attacker}', 'attacker@example.com')`);

// Phone hijack: claiming the farmer's number no longer routes their texts to you.
await as(attacker);
await one(`update public.contact_prefs set phone = '(555) 555-0100', sms_opt_in = true, updated_at = '2999-01-01', phone_verified_at = now() where user_id = $1`, [attacker]);
const atk = (await one(`select phone_verified_at, updated_at from public.contact_prefs where user_id = $1`, [attacker]))[0];
check('members cannot mark their own number verified or set the clock', atk.phone_verified_at === null && new Date(atk.updated_at).getFullYear() < 2999);
await expectFail('a number confirmed elsewhere cannot get a code', () => one(`select public.request_phone_code()`));
await svc();
const hij = (await one(`select public.sms_inbound('+15555550100', 'Gate code is 4411') as r`))[0].r;
const hijConv = hij.conversation_id ?? null;
check('texts from the farmer still reach the farmer, not the claimant',
  (await one(`select count(*)::int n from public.messages where body = 'Gate code is 4411' and sender_id = $1`, [attacker]))[0].n === 0 && (hij.handled === false || hijConv === conv));
check('no texts are queued to an unproven number', (await one(`select count(*)::int n from public.notification_deliveries d join public.notifications n on n.id = d.notification_id where n.user_id = $1 and d.channel = 'sms'`, [attacker]))[0].n === 0);

// Proving a number: the code goes only to the phone, never to the inbox.
await as(buyer);
await one(`update public.contact_prefs set phone = '+1 555 555 0177', sms_opt_in = true where user_id = $1`, [buyer]);
await one(`select public.request_phone_code()`);
const inbox = (await one(`select body from public.notifications where kind = 'verify' and user_id = $1`, [buyer]))[0];
check('verification inbox entry hides the code', inbox && !/\d{6}/.test(inbox.body));
await expectFail('members cannot read the code table', async () => { const r = await one(`select count(*)::int n from public.phone_codes`); if (r[0].n === 0) throw new Error('hidden'); });
check('wrong code is refused', (await one(`select public.confirm_phone_code('000000') as ok`))[0].ok === false);
await svc();
const sms = (await one(`select d.body_override from public.notification_deliveries d join public.notifications n on n.id = d.notification_id where n.user_id = $1 and n.kind = 'verify'`, [buyer]))[0].body_override;
const code = sms.match(/\d{6}/)[0];
await as(buyer);
check('right code verifies the number', (await one(`select public.confirm_phone_code($1) as ok`, [code]))[0].ok === true
  && (await one(`select phone_verified_at from public.contact_prefs where user_id = $1`, [buyer]))[0].phone_verified_at !== null);
await one(`update public.contact_prefs set phone = '+15555550188' where user_id = $1`, [buyer]);
check('changing the number clears verification', (await one(`select phone_verified_at from public.contact_prefs where user_id = $1`, [buyer]))[0].phone_verified_at === null);
for (let i = 0; i < 3; i++) await one(`select public.request_phone_code()`);
await expectFail('codes to one number are rate limited', () => one(`select public.request_phone_code()`));

// "OK" in a normal reply is a reply, not a check-in answer.
await svc();
await db.exec(`update public.notification_deliveries set status = 'sent' where channel = 'sms'`);
const okReply = (await one(`select public.sms_inbound('+15555550100', 'Ok see you Saturday at 9') as r`))[0].r;
check('"Ok see you…" goes to the thread while a check-in is open', okReply.handled === true && !okReply.checkin_id);

// Messages: no backdating, pinning, fake "by text", planted transcripts or path tricks.
await as(buyer);
await one(`insert into public.messages (conversation_id, sender_id, body, created_at, pinned, hidden, via, transcript) values ($1, $2, 'forged', '2000-01-01', true, true, 'sms', 'fake')`, [conv, buyer]);
const forged = (await one(`select created_at, pinned, hidden, via, transcript from public.messages where body = 'forged'`))[0];
check('message inserts ignore created_at, pinned, hidden, via and transcript',
  new Date(forged.created_at).getFullYear() > 2020 && !forged.pinned && !forged.hidden && forged.via === 'app' && forged.transcript === null);
await expectFail('voice paths cannot climb out of the folder', () => one(`insert into public.messages (conversation_id, sender_id, kind, audio_path) values ($1, $2, 'voice', $3)`, [conv, buyer, `${conv}/../x/y.m4a`]));
await one(`insert into public.messages (conversation_id, sender_id, kind, audio_path) values ($1, $2, 'voice', $3)`, [conv, buyer, `${conv}/abc123.m4a`]);
check('normal voice paths still work', (await one(`select count(*)::int n from public.messages where audio_path = $1`, [`${conv}/abc123.m4a`]))[0].n === 1);

// Events: editing an approved event sends it back to review; ticket links must be https.
await as(other);
await one(`insert into public.events (title, starts_at, place, type, host_name) values ('Edit me', now() + interval '3 days', 'Lafayette', 'Market', 'Me')`);
const ev = (await one(`select id from public.events where title = 'Edit me'`))[0].id;
await as(staff);
await one(`select public.review_event($1, 'approved')`, [ev]);
await as(other);
await one(`update public.events set starts_at = now() + interval '9 days' where id = $1`, [ev]);
await as(staff);
check('edited approved event goes back to review', (await one(`select status from public.events where id = $1`, [ev]))[0].status === 'pending');
await as(other);
await expectFail('ticket links must be https', () => one(`update public.events set ticket_url = 'javascript:alert(1)' where id = $1`, [ev]));

// Posts: authors can't un-hide what staff hid.
await as(farmer);
await one(`insert into public.posts (kind, title, body, region_id) values ('offer', 'Hide me please', '', '6')`);
const hp = (await one(`select id from public.posts where title = 'Hide me please'`))[0].id;
await as(staff);
await one(`update public.posts set status = 'hidden' where id = $1`, [hp]);
await as(farmer);
await one(`update public.posts set status = 'open' where id = $1`, [hp]);
await as(staff);
check('authors cannot un-hide a hidden post', (await one(`select status from public.posts where id = $1`, [hp]))[0].status === 'hidden');

// Near-me alerts: a product called "%" no longer matches every alert.
await svc();
const nearBefore = (await one(`select count(*)::int n from public.notifications where kind = 'near_me'`))[0].n;
await as(farmer);
await one(`insert into public.farm_products (farm_id, name, in_season) values ($1, '%', true)`, [mine.id]);
await svc();
check('wildcard product names do not spam near-me alerts', (await one(`select count(*)::int n from public.notifications where kind = 'near_me'`))[0].n === nearBefore);

// Smaller leaks and privileges.
await as(null);
check('signed-out visitors cannot read who signed up for shifts', (await one(`select count(*)::int n from public.shift_signups`))[0].n === 0);
await expectFail('signed-out visitors cannot pad profile views', () => one(`select public.log_farm_view($1)`, [mine.id]));
await as(buyer);
check('open spots still count everyone', (await one(`select open_spots from public.shift_availability where id = $1`, [shift]))[0].open_spots === 0);
await expectFail('members cannot probe other people with in_audience', () => one(`select public.in_audience($1, 'growers')`, [farmer]));
await svc();
const coord = '66666666-6666-4666-8666-666666666666';
await db.exec(`insert into auth.users (id, email) values ('${coord}', 'coord@example.com')`);
await db.exec(`update public.profiles set role = 'coordinator' where id = '${coord}'`);
await as(coord);
await expectFail('coordinators cannot make themselves admin', () => one(`update public.profiles set role = 'admin' where id = $1`, [coord]));
await one(`update public.profiles set role = 'grower' where id = $1`, [other]);
check('coordinators can still promote growers', (await one(`select role from public.profiles where id = $1`, [other]))[0].role === 'grower');
await as(staff);
await one(`insert into public.farms (name, city, state, region_id) values ('Staff Farm', 'Tyler', 'TX', '6')`);
check('staff who list a farm own it', (await one(`select owner_id from public.farms where name = 'Staff Farm'`))[0].owner_id === staff);

// Round 2: switching numbers while the code text waits can't confirm a stranger's number.
const switcher = '77777777-7777-4777-8777-777777777777';
await svc();
await db.exec(`insert into auth.users (id, email) values ('${switcher}', 'switch@example.com')`);
await as(switcher);
await one(`update public.contact_prefs set phone = '+15555550123' where user_id = $1`, [switcher]); // the victim's number
await one(`select public.request_phone_code()`);
await svc();
const dest = (await one(`select d.to_phone, d.body_override from public.notification_deliveries d join public.notifications n on n.id = d.notification_id where n.user_id = $1 and n.kind = 'verify'`, [switcher]))[0];
check('a code is addressed to the number it was issued for', dest.to_phone === '+15555550123');
const stolen = dest.body_override.match(/\d{6}/)[0];
await as(switcher);
await one(`update public.contact_prefs set phone = '+15555550999' where user_id = $1`, [switcher]); // their own phone
await one(`update public.contact_prefs set phone = '+15555550123' where user_id = $1`, [switcher]); // and back
await expectFail('a code dies when the number changes', () => one(`select public.confirm_phone_code($1)`, [stolen]));
check('the stranger’s number stays unconfirmed', (await one(`select phone_verified_at from public.contact_prefs where user_id = $1`, [switcher]))[0].phone_verified_at === null);

// Whole numbers: a +91 number no longer matches a +1 member with the same last 10 digits.
await svc();
check('foreign numbers with the same last 10 digits do not match', (await one(`select public.sms_inbound('+915555550100', 'SAFE') as r`))[0].r.handled === false);
check('phone_key keeps the country code', (await one(`select public.phone_key('+44 5555550177') <> public.phone_key('+1 555 555 0177') as ok`))[0].ok === true);

// Buyers can't fake "Farmer says: ready" on their own messages.
await as(buyer);
await one(`insert into public.messages (conversation_id, sender_id, body, inquiry_status) values ($1, $2, 'fake ready', 'ready')`, [conv, buyer]);
check('only real inquiries carry an inquiry status', (await one(`select inquiry_status from public.messages where body = 'fake ready'`))[0].inquiry_status === null);

// Posts can't be pinned to the top by choosing their dates.
await as(farmer);
await one(`insert into public.posts (kind, title, body, region_id, created_at, expires_at) values ('offer', 'Forever post', '', '6', '2099-01-01', '2099-02-01')`);
const fp = (await one(`select created_at, expires_at from public.posts where title = 'Forever post'`))[0];
check('posts keep a real creation date and at most 45 days', new Date(fp.created_at).getFullYear() < 2099 && new Date(fp.expires_at) <= new Date(Date.now() + 46 * 864e5));
await as(staff);
await one(`update public.posts set status = 'hidden' where title = 'Forever post'`);
await as(farmer);
await one(`delete from public.posts where title = 'Forever post'`);
await as(staff);
check('authors cannot delete a post staff hid', (await one(`select count(*)::int n from public.posts where title = 'Forever post'`))[0].n === 1);

// A verified farm that changes its name or links goes back to BFI.
await as(farmer);
await one(`update public.farms set story = 'New story' where id = $1`, [mine.id]);
check('everyday edits keep the farm live', (await one(`select status from public.farms where id = $1`, [mine.id]))[0].status === 'approved');
await one(`update public.farms set website = 'https://phish.example' where id = $1`, [mine.id]);
await as(staff);
check('a new website sends the farm back to review', (await one(`select status from public.farms where id = $1`, [mine.id]))[0].status === 'pending');
await one(`select public.review_farm($1, 'approved')`, [mine.id]);
await as(farmer);
await expectFail('websites must be https', () => one(`update public.farms set website = 'http://plain.example' where id = $1`, [mine.id]));

// Deliveries are claimed once.
await svc();
await db.exec(`update public.notification_deliveries set status = 'pending'`);
const first = (await one(`select count(*)::int n from public.claim_deliveries(1000)`))[0].n;
const second = (await one(`select count(*)::int n from public.claim_deliveries(1000)`))[0].n;
check('a second run cannot claim deliveries already being sent', first > 0 && second === 0);
await db.exec(`update public.notification_deliveries set claimed_at = now() - interval '11 minutes', attempts = 2 where status = 'sending'`);
await one(`select count(*) from public.claim_deliveries(0)`);
check('deliveries stuck mid-send count as tries and stop after three', (await one(`select count(*)::int n from public.notification_deliveries where status = 'sending'`))[0].n === 0
  && (await one(`select count(*)::int n from public.notification_deliveries where status = 'failed' and last_error is not null`))[0].n > 0);
await as(buyer);
await expectFail('members cannot claim deliveries', () => one(`select * from public.claim_deliveries(10)`));

console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
