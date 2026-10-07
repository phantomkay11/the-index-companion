// Plain-logic tests for the app's helpers: dates, CSV export and phone numbers.
// Run: node --experimental-strip-types --test tests/lib.test.ts   (or npm run test:lib)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { daysUntil, localDate, nextSaturday, shortDate, toE164, validDate, validTime } from '../src/lib/format.ts';
import { toCsv } from '../src/lib/survey.ts';

test('date-only values show the same calendar day in every US time zone', () => {
  // TZ is set per run in package.json (America/Chicago and Pacific/Honolulu).
  assert.equal(shortDate('2026-10-10'), 'Oct 10');
  assert.equal(shortDate('2026-01-01'), 'Jan 1');
});

test('next Saturday is a local date, never tomorrow-in-UTC', () => {
  const fri9pm = new Date(2026, 9, 9, 21, 30); // Friday Oct 9, 9:30 pm local
  assert.equal(nextSaturday(fri9pm), '2026-10-10');
  const sat = new Date(2026, 9, 10, 23, 0);
  assert.equal(nextSaturday(sat), '2026-10-17');
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('days until a deadline counts calendar days', () => {
  assert.equal(daysUntil('2026-11-15', new Date(2026, 10, 3, 22, 0)), 12);
  assert.equal(daysUntil('2026-11-15', new Date(2026, 10, 15, 0, 5)), 0);
});

test('impossible dates and times are refused', () => {
  for (const bad of ['2026-02-31', '2026-13-01', '2026-00-10', '26-10-10', 'tomorrow', '']) assert.equal(validDate(bad), false, bad);
  assert.equal(validDate('2028-02-29'), true);
  assert.equal(validDate('2027-02-29'), false);
  assert.equal(validDate('2020-01-01', { notPast: true }), false);
  for (const bad of ['24:00', '9:60', '9', 'noon']) assert.equal(validTime(bad), false, bad);
  assert.equal(validTime('09:30'), true);
  assert.equal(validTime('9:05'), true);
});

test('CSV export: formulas are defused, quotes and line breaks survive, Excel sees UTF-8', () => {
  const qs = [{ id: 'q1', type: 'text' as const, prompt: '=Prompt, with "quotes"' }];
  const rs = [
    { survey_id: 's', user_id: 'u', answers: { q1: '=HYPERLINK("http://x","click")' }, consent_share: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
    { survey_id: 's', user_id: 'u2', answers: { q1: 'line one\nline two' }, consent_share: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
    { survey_id: 's', user_id: 'u3', answers: { q1: '+cmd|calc' }, consent_share: false, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
    { survey_id: 's', user_id: 'u4', answers: { q1: 'Kreyòl, español' }, consent_share: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const csv = toCsv(qs as any, rs as any);
  assert.ok(csv.startsWith('﻿'), 'byte-order mark');
  assert.ok(csv.includes(`"'=Prompt, with ""quotes"""`), 'header prompt defused and quoted');
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"",""click"")"`), 'formula answer defused');
  assert.ok(csv.includes('"line one\nline two"'), 'line break quoted');
  assert.ok(csv.includes('(not shared)'), 'unconsented text withheld');
  assert.ok(!csv.includes('+cmd'), 'unconsented text never appears');
  assert.ok(csv.includes('"Kreyòl, español"'));
  assert.ok(!/u2|u3|u4/.test(csv), 'no member ids');
});

test('phone numbers match the server\'s normalize_phone()', () => {
  assert.equal(toE164('(504) 555-0100'), '+15045550100');
  assert.equal(toE164('1 504 555 0100'), '+15045550100');
  assert.equal(toE164('+44 20 7946 0958'), '+442079460958');
  for (const bad of ['+', '+12', '555-0100', '+0123456789', 'call me']) assert.equal(toE164(bad), null, bad);
});
