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
| `categories` | {Beekeepers} | Postgres array: `{Row crops,Organic}` |
| `attributes` | {Women-owned} | Optional |
| `how_to_buy` | {"Farm stand, Saturdays"} | Optional |
| `website` | https://... | Optional |
| `story` | ... | Optional, a few sentences |
| `location_visibility` | city | `city` (default), `pickup_point` or `exact` |

Save it as CSV.

## 2. Import

In Supabase, open Table Editor → `farms` → Insert → Import data from CSV. Then mark the imported farms approved and verified (they were already vetted for the Index):

```sql
update public.farms
set status = 'approved', verified_at = now()
where status = 'pending' and owner_id is null and is_sample = false;
```

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
