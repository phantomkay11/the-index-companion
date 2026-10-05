#!/usr/bin/env node
// Combines every migration into supabase/setup.sql, for pasting into the Supabase SQL editor in one go.
// Run after adding a migration: npm run build:setup-sql
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const parts = files.map((f) => `-- ===== ${f} =====\n\n${readFileSync(new URL(f, dir), 'utf8').trim()}\n`);
const header = `-- The Index: complete database setup.
-- Generated from supabase/migrations by scripts/build-setup-sql.mjs. Don't edit by hand.
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run. Run it once, on a new project.
-- For sample farms and events (demos only), run supabase/seed.sql afterwards.

`;
writeFileSync(new URL('../supabase/setup.sql', import.meta.url), header + parts.join('\n'));
console.log(`supabase/setup.sql written from ${files.length} migrations`);
