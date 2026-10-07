// The hardening migration must run on messy real-world data: blank or spaced-out links, http://,
// uppercase schemes, bare domains, junk product names. Loads the earlier migrations, inserts that data
// as the service role, then applies the rest.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create publication supabase_realtime;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid());
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`);
const files = readdirSync(`${root}/migrations`).filter((f) => f.endsWith('.sql')).sort();
const last = files.pop();
for (const f of files) await db.exec(readFileSync(`${root}/migrations/${f}`, 'utf8'));
await db.exec(readFileSync(`${root}/seed.sql`, 'utf8'));

const sites = ['', '   ', 'https://x.com ', 'HTTPS://UPPER.COM', 'http://plain.org', 'facebook.com/golden comb', 'goldencomb.com', 'javascript:alert(1)', 'ftp://old.net', '\nhttps://nl.com\n'];
for (const [i, w] of sites.entries()) {
  await db.query(`insert into public.farms (name, city, state, region_id, categories, website, status) values ($1, 'X', 'LA', '6', '{Row crops}', $2, 'approved')`, [`Messy ${i}`, w]);
}
const farm = (await db.query(`select id from public.farms where name = 'Messy 0'`)).rows[0].id;
for (const n of ['x', ' ', 'Okra', '  Sweet   potatoes  ', 'y'.repeat(120)]) await db.query(`insert into public.farm_products (farm_id, name) values ($1, $2)`, [farm, n]);
await db.query(`insert into public.events (title, type, starts_at, place, host_name, ticket_url, status) values ('E', 'market', now() + interval '3 days', 'P', 'H', 'https://t.co/x\n', 'approved')`);
await db.query(`insert into public.contact_prefs (user_id, phone, sms_opt_in) select id, null, false from public.profiles on conflict do nothing`);

let failed = 0;
try {
  await db.exec(readFileSync(`${root}/migrations/${last}`, 'utf8'));
  console.log('ok', last, 'applies to messy data');
} catch (e) {
  console.log('FAIL', last, 'did not apply:', e.message);
  process.exit(1);
}
const got = Object.fromEntries((await db.query(`select name, website from public.farms where name like 'Messy %'`)).rows.map((r) => [r.name, r.website]));
const want = [null, null, 'https://x.com', 'https://UPPER.COM', 'https://plain.org', null, 'https://goldencomb.com', null, null, 'https://nl.com'];
want.forEach((w, i) => {
  const ok = got[`Messy ${i}`] === w;
  if (!ok) failed++;
  console.log(ok ? 'ok' : 'FAIL', JSON.stringify(sites[i]), '->', JSON.stringify(got[`Messy ${i}`]), ok ? '' : `(wanted ${JSON.stringify(w)})`);
});
const names = (await db.query(`select name from public.farm_products where farm_id = $1 order by name`, [farm])).rows.map((r) => r.name);
const namesOk = names.length === 3 && names.includes('Okra') && names.includes('Sweet potatoes') && names.some((n) => n.length === 80);
if (!namesOk) failed++;
console.log(namesOk ? 'ok' : 'FAIL', 'product names tidied:', JSON.stringify(names.map((n) => n.slice(0, 20))));
const t = (await db.query(`select ticket_url from public.events where title = 'E'`)).rows[0].ticket_url;
if (t !== 'https://t.co/x') failed++;
console.log(t === 'https://t.co/x' ? 'ok' : 'FAIL', 'ticket link trimmed:', JSON.stringify(t));
console.log(failed ? 'SOME CHECKS FAILED' : 'ALL CHECKS PASSED');
process.exitCode = failed ? 1 : 0;
