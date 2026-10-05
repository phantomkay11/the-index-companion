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

In the app: Settings → BFI staff → **Send an announcement**. Pick who gets it (everyone, growers, neighbors or one region) and how (phone notification, email, text). It appears in Messages → From BFI and in each member's inbox, and goes out on the channels they allow. Texts cost money per message, so save them for urgent news.

## Moderation

- **Messages:** staff see a **Hide** link on every message. Hidden messages disappear for members and stay visible to staff, marked as hidden. Messages can't be edited by anyone.
- **Community board:** posts can be reported. To take one down, set its `status` to `hidden` in Table Editor → `posts`.
- **Photos:** farmers confirm they have permission before a photo goes up, and must describe it for screen readers. Remove a photo by deleting its row in `farm_photos` and the file in Storage → `farm-photos`.

## Impact report

Settings → BFI staff → **Impact report** shows live counts for funder updates and grant reports: farms live and verified, inquiries sent and answered, profile views, members, events, RSVPs, volunteer sign-ups and farms by region. Sample data is left out. **Share as CSV** sends the figures by email or to a spreadsheet.

## Channels

One channel per region and six topic groups are created automatically. Add a channel with Table Editor → `conversations` → Insert row, `kind = channel`, a `title` and `subtitle`. To pin a staff message, set its `pinned` column to true.
