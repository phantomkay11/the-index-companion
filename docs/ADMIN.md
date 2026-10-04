# Guide for BFI staff

Everything here can be done in the app's review queue or the Supabase dashboard. No code needed.

## Roles

| Role | Can do |
| --- | --- |
| `neighbor` | Browse, follow farms, send inquiries, RSVP, save programs, read channels. |
| `grower` | Everything above, plus post in channels once their farm is verified. Set automatically when BFI approves their farm. |
| `coordinator` | Regional volunteers: approve farms and events, read reports, moderate. |
| `admin` | BFI staff: everything, including managing resources, channels and broadcasts. |

Make someone a coordinator (in the Supabase SQL editor):

```sql
update public.profiles set role = 'coordinator'
where id = (select id from auth.users where email = 'volunteer@example.com');
```

## Approving farms and events

Open the app, go to Discover, and tap **Review queue**.

- **Approve and verify** publishes the farm, gives it the "Verified by BFI" mark, and makes the owner a grower.
- **Decline** keeps it off the directory. Let the farmer know why by email.
- Member-submitted events stay hidden until approved.

## Reports

Reports from the "Report" buttons appear in the same queue. To hide a message, open Table Editor → `messages`, find it by `id`, and set `hidden` to true. To take down a listing, set the farm's `status` to `hidden`.

## Programs and deadlines

Table Editor → `resources`. Set `deadline` when an application window opens; members who saved the program see a countdown. Put BFI's own programs first with `is_bfi_program = true` and a low `sort_order`.

## Announcements

Table Editor → `broadcasts` → Insert row. Fill in `title`, `body`, and optionally `link_url` and `link_text`. It appears in Messages → From BFI. (Push and SMS delivery for broadcasts is planned next.)

## Channels

One channel per region and six topic groups are created automatically. Add a channel with Table Editor → `conversations` → Insert row, `kind = channel`, a `title` and `subtitle`. To pin a staff message, set its `pinned` column to true.
