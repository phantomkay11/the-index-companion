import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

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
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`);

try {
for (const f of ['migrations/20261004000000_init.sql', 'migrations/20261004000100_bfi_reference_data.sql', 'seed.sql']) {
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

console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
