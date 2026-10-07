#!/usr/bin/env node
// Import Black Farmers Index's own directory from a CSV export into Supabase.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/import-directory.mjs farms.csv            # dry run: checks every row, writes nothing
//   ... node scripts/import-directory.mjs farms.csv --apply    # writes the rows
//
// Columns (header row required; see docs/IMPORTING.md):
//   name, city, state, region_id, categories, attributes, how_to_buy, products, website, story,
//   location_visibility, pickup_point, lat, lon, languages
// List columns use semicolons: "Beekeepers;Organic". Rows that match an existing farm
// (same name, city and state) are updated instead of duplicated.
// Imported farms are approved and verified (they were vetted for the Index already) and have no
// owner until the farmer signs up and BFI links their account.

import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

const [file, ...flags] = process.argv.slice(2);
const apply = flags.includes('--apply');
if (!file) {
  console.error('Usage: node scripts/import-directory.mjs <file.csv> [--apply]');
  process.exit(1);
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Project Settings → API). Never commit the service role key.');
  process.exit(1);
}

/** RFC 4180 CSV: quoted fields, escaped quotes, commas and newlines inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const STATES = new Set(
  'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA PR RI SC SD TN TX UT VT VA VI WA WV WI WY GU'.split(' '),
);
const list = (v) => (v ?? '').split(';').map((x) => x.trim()).filter(Boolean);

const db = createClient(url, key, { auth: { persistSession: false } });
const { data: regions, error: regErr } = await db.from('regions').select('id');
if (regErr) {
  console.error('Could not reach Supabase:', regErr.message);
  process.exit(1);
}
const regionIds = new Set(regions.map((r) => r.id));

const [header, ...rows] = parseCsv(readFileSync(file, 'utf8').replace(/^﻿/, ''));
const cols = header.map((h) => h.trim().toLowerCase());
for (const required of ['name', 'city', 'state', 'region_id']) {
  if (!cols.includes(required)) {
    console.error(`Missing required column: ${required}`);
    process.exit(1);
  }
}

const problems = [];
const farms = rows.map((r, i) => {
  const get = (c) => (r[cols.indexOf(c)] ?? '').trim();
  const line = i + 2;
  const farm = {
    name: get('name'),
    city: get('city'),
    state: get('state').toUpperCase(),
    region_id: get('region_id').toLowerCase(),
    categories: list(get('categories')),
    attributes: list(get('attributes')),
    how_to_buy: list(get('how_to_buy')),
    languages: list(get('languages')).length ? list(get('languages')) : ['English'],
    website: get('website') || null,
    story: get('story') || null,
    location_visibility: get('location_visibility') || 'city',
    pickup_point: get('pickup_point') || null,
    lat: get('lat') ? Number(get('lat')) : null,
    lon: get('lon') ? Number(get('lon')) : null,
    status: 'approved',
    verified_at: new Date().toISOString(),
    is_sample: false,
  };
  const products = list(get('products'));
  if (!farm.name) problems.push(`Row ${line}: name is empty`);
  if (!farm.city) problems.push(`Row ${line}: city is empty`);
  if (!STATES.has(farm.state)) problems.push(`Row ${line}: "${farm.state}" is not a two-letter state code`);
  if (!regionIds.has(farm.region_id)) problems.push(`Row ${line}: region "${farm.region_id}" doesn't exist (use 1–11 or intl)`);
  if (!['city', 'pickup_point', 'exact'].includes(farm.location_visibility)) problems.push(`Row ${line}: location_visibility must be city, pickup_point or exact`);
  if ((farm.lat != null && Number.isNaN(farm.lat)) || (farm.lon != null && Number.isNaN(farm.lon))) problems.push(`Row ${line}: lat/lon must be numbers`);
  if (farm.website && !/^https:\/\/\S+$/.test(farm.website)) problems.push(`Row ${line}: website must start with https:// and have no spaces`);
  for (const p of products) if (p.trim().length < 2 || p.trim().length > 80) problems.push(`Row ${line}: product "${p}" must be 2 to 80 characters`);
  return { farm, products, line };
});

console.log(`${farms.length} rows read from ${file}`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s) to fix first:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
if (!apply) {
  console.log('Every row looks good. Dry run only: run again with --apply to import.');
  process.exit(0);
}

let created = 0;
let updated = 0;
for (const { farm, products, line } of farms) {
  const { data: existing } = await db.from('farms').select('id').eq('name', farm.name).eq('city', farm.city).eq('state', farm.state).maybeSingle();
  let id = existing?.id;
  if (id) {
    const { error } = await db.from('farms').update(farm).eq('id', id);
    if (error) {
      console.error(`Row ${line}: ${error.message}`);
      continue;
    }
    updated++;
  } else {
    const { data, error } = await db.from('farms').insert(farm).select('id').single();
    if (error) {
      console.error(`Row ${line}: ${error.message}`);
      continue;
    }
    id = data.id;
    created++;
  }
  if (products.length) {
    const { error: pErr } = await db.from('farm_products').upsert(products.map((name) => ({ farm_id: id, name: name.trim(), in_season: true })), { onConflict: 'farm_id,name' });
    if (pErr) console.error(`Row ${line}: products not saved: ${pErr.message}`);
  }
}
console.log(`Done: ${created} added, ${updated} updated.`);
