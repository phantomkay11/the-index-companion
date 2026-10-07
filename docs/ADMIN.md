# Guide for BFI staff

Everything here can be done in the app's review queue or the Supabase dashboard. No code needed.

## Roles

| Role | Can do |
| --- | --- |
| `neighbor` | Browse, follow farms, send inquiries, RSVP, save programs, read channels. |
| `grower` | Everything above, plus post in channels once their farm is verified. Set automatically when BFI approves their farm. |
| `coordinator` | Regional volunteers and staff: approve farms and events, read reports, moderate, send announcements, surveys and check-ins, manage resources and channels. |
| `admin` | BFI staff: everything a coordinator can do, plus changing anyone's role. Only admins can make someone a coordinator or an admin. |

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

## Surveys

Settings → BFI staff → **Surveys** → **Write a survey**. Pick who it goes to and how long it stays open, then **Open survey now** (members get a phone notification and email) or **Save as draft**. Five questions or fewer gets the most answers.

- Members can change or withdraw their answers until the survey closes.
- Staff can see each member's answers in the database, so you can follow up when someone asks for help. In reports, share totals only.
- Written answers are only shown on the results screen, and only included in the CSV, when the member said BFI may quote them. Even then, quote them without names.
- **Results** shows totals for each question and a **Download CSV** with no names or member ids.

## Storm and disaster check-ins

Settings → BFI staff → **Storm check-in** → **Send a check-in**. Pick the region, keep the default title or write your own, and add a line about what happened. Everyone in that region (members who chose it, plus farms listed there) gets a phone notification and, if they opted in, a text. Check-ins always go out, even to members who turned off announcements.

Members answer **I'm OK** or **I need help** with a note, in the app or by replying SAFE or NEED to the text. The check-in screen shows staff how many are OK, how many need help, how many haven't answered, and each request with the member's phone number and a **Call** button. Check-ins close after 3, 7 or 14 days. The app tells members to call 911 in an emergency; make sure someone at BFI is watching the list while a check-in is open.

## Moderation

- **Messages:** staff see a **Hide** link on every message. Hidden messages disappear for members and stay visible to staff, marked as hidden. Messages can't be edited by anyone.
- **Community board:** posts can be reported. To take one down, set its `status` to `hidden` in Table Editor → `posts`.
- **Photos:** farmers confirm they have permission before a photo goes up, and must describe it for screen readers. Remove a photo by deleting its row in `farm_photos` and the file in Storage → `farm-photos`. Sample farms can link a stock photo by full https URL instead, and those must carry a credit (`credit`, `credit_url`); real farms always upload.
- **Ordering links:** farmers add their own store or CSA link under My farm. It must be an https address. Orders and payment happen on the farm's own site; the app never handles money.

## Impact report

Settings → BFI staff → **Impact report** shows live counts for funder updates and grant reports: farms live and verified, inquiries sent and answered, profile views, members, events, RSVPs, volunteer sign-ups and farms by region. Sample data is left out. **Share as CSV** sends the figures by email or to a spreadsheet.

## Channels

One channel per region and six topic groups are created automatically. Add a channel with Table Editor → `conversations` → Insert row, `kind = channel`, a `title` and `subtitle`. To pin a staff message, set its `pinned` column to true.
