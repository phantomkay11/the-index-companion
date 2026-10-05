# Importing BFI's directory

The app starts empty of real farms. BFI loads its own directory, which keeps the data BFI's and respects farmers' consent. Nothing here scrapes the website.

## 1. Export

Export BFI's farm list to a spreadsheet with one row per farm and these columns:

| Column | Example | Notes |
| --- | --- | --- |
| `name` | Golden Comb Apiary | Required |
| `city` | Opelousas | Required |
| `state` | LA | Required. Two-letter code. |
| `region_id` | 6 | Required. `1` to `11`, or `intl`. |
| `categories` | Beekeepers;Organic | BFI grower types, separated by semicolons |
| `attributes` | Women-owned | Optional |
| `how_to_buy` | Farm stand, Saturdays;CSA boxes | Optional |
| `website` | https://... | Optional |
| `story` | ... | Optional, a few sentences |
| `location_visibility` | city | `city` (default), `pickup_point` or `exact` |

Save it as CSV.

## 2. Import

Use the import script. It checks every row first and writes nothing until you add `--apply`:

```bash
export SUPABASE_URL=https://<project-ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...   # Project Settings → API. Keep it off shared machines; never commit it.

npm run import:directory -- farms.csv           # dry run: lists any problems by row number
npm run import:directory -- farms.csv --apply   # imports
```

Running it again with an updated export is safe: farms with the same name, city and state are updated rather than duplicated. Imported farms are approved and verified, since they were already vetted for the Index.

Extra columns the script understands: `products` (what's fresh, separated by semicolons), `languages`, `pickup_point`, and `lat` / `lon` (the map point; use the pickup point or town center, not a home address). Use semicolons inside list columns, for example `Beekeepers;Organic`.

Imported farms have no owner yet, so they show on the directory but can't receive messages. When a farmer signs up, link their account to their listing:

```sql
update public.farms set owner_id = (select id from auth.users where email = 'farmer@example.com')
where id = '<farm id>';
update public.profiles set role = 'grower'
where id = (select id from auth.users where email = 'farmer@example.com');
```

## 3. Remove sample data

If you loaded `seed.sql` for a demo, remove it before launch:

```sql
delete from public.farms where is_sample;
delete from public.events where is_sample;
```
