# The Index

A free companion app for [Black Farmers Index](https://blackfarmersindex.com), the largest free directory of Black farmers. It turns the directory into a living network: neighbors find growers and send them requests, growers talk to each other in regional channels, everyone sees events, and farmers find programs and deadlines that apply to them.

Built as a gift to Black Farmers Index by Kerry Laster. The intent is for BFI to own the code, the data and the app store listings. See [Handing it over](#handing-it-over).

> **Status:** working v1 codebase, not yet deployed. It runs on iOS, Android and the web from one Expo project, with Supabase as the backend.

## What's in v1

| Area | What works |
| --- | --- |
| **Discover** | Browse approved farms by BFI's grower types and its 11 regions plus International. Search by name, town or product. Farm profiles show what's fresh this week, how to buy, languages, and a privacy-safe location. |
| **Trust** | "Verified by BFI" marks, last-updated stamps, "listed since" dates, a report button on every listing and message, and "Sample" labels on demo data. |
| **Messaging** | Structured inquiries (product, amount, date, pickup or delivery) that farmers answer in one tap. Direct threads update live. One channel per BFI region plus topic groups. An official "From BFI" announcements feed. |
| **Events** | Upcoming events, RSVP with push, text or email reminder preferences, and volunteer shifts with capacity limits. Members submit events; BFI approves them. |
| **Resources** | BFI's own programs first, then public programs. Filter by farm type and stage. Save programs to a deadline tracker. |
| **Growers** | List a farm (reviewed by BFI before it goes live), toggle what's fresh, harvest mode, choose whether to accept messages and how much location to show. |
| **BFI staff** | A review queue to approve and verify farms, approve events and resolve reports. |
| **Accessibility** | Atkinson Hyperlegible type, in-app text size up to 160% on top of the phone's own setting, high contrast, reduce motion, read-aloud buttons, English and Spanish, 44-point tap targets and screen-reader labels throughout. |
| **Text line** | A Supabase function that answers SMS searches ("HONEY LA", "EVENTS") through Twilio, for people without smartphones. |

Content that comes from blackfarmersindex.com (regions, stats, mission, timeline, programs, contacts, the Collard Green Gala) lives in `src/lib/bfi.ts` and `supabase/migrations/20261004000100_bfi_reference_data.sql`. BFI should review it and keep it current.

## Getting started

You need Node.js 20 or newer, a free [Supabase](https://supabase.com) account, and the Expo Go app on a phone (or a browser).

### 1. Install

```bash
git clone https://github.com/<owner>/the-index-companion.git
cd the-index-companion
npm install
```

### 2. Create the database

1. Create a Supabase project. Note its project ref (the part before `.supabase.co`).
2. Install the Supabase CLI and link the project:
   ```bash
   npx supabase init        # creates supabase/config.toml; keeps the existing migrations
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push     # creates every table, policy and BFI's reference data
   ```
3. **Demo only:** load the sample farms and events by pasting `supabase/seed.sql` into the Supabase SQL editor. Skip this for the real BFI project.
4. **Sign-in codes:** in Supabase, open Authentication → Emails → Magic Link and make sure the template includes `{{ .Token }}`, so members receive a 6-digit code. For production, connect your own email sender under Authentication → SMTP.

### 3. Connect the app

```bash
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from Project Settings → API. Never put the service role key in the app.

### 4. Run it

```bash
npx expo start
```

Scan the QR code with Expo Go, or press `w` for the web version.

### 5. Make yourself staff

Sign in once in the app, then run this in the Supabase SQL editor with your email:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

The review queue then appears on the Discover screen. See [docs/ADMIN.md](docs/ADMIN.md) for the full staff guide.

## Checks

```bash
npm run typecheck   # TypeScript
npm run test:db     # runs the migrations in an in-memory Postgres and checks 30+ security rules
npx expo lint
```

`test:db` checks things like: new listings can't approve themselves, members can't make themselves staff, private threads stay private, only verified growers post in channels, and volunteer shifts can't overfill.

## How it's put together

```
src/app/                 screens (Expo Router: every file is a route)
  (tabs)/                Discover, Messages, Events, Resources
  farm/[id].tsx          farm profile
  inquiry/[farmId].tsx   structured inquiry form
  thread/[id].tsx        live conversation
  my-farm.tsx            list or manage a farm
  review.tsx             BFI staff review queue
  settings.tsx, about.tsx, sign-in.tsx, post-event.tsx
src/components/          shared UI (ui.tsx) and the farm card
src/constants/theme.ts   colors (BFI green #007640), fonts, spacing, high-contrast palettes
src/lib/                 Supabase client, types, BFI content, strings (English and Spanish)
src/providers/           accessibility settings and sign-in state
supabase/migrations/     schema, row level security, BFI reference data
supabase/seed.sql        sample farms and events (demo only)
supabase/functions/      the SMS text line
supabase/tests/          database security checks
```

Security lives in the database, not the app. Every table has row level security. Approvals, inquiries and replies go through database functions (`review_farm`, `send_inquiry`, `answer_inquiry`, `start_conversation`) so the rules hold no matter which client calls them. Farm street addresses and exact coordinates sit in a separate `farm_private` table that only the owner and staff can read.

## The text line

1. Buy a phone number in Twilio (check whether Twilio.org nonprofit credits apply) and register it for A2P 10DLC messaging.
2. Deploy the function and set its secrets:
   ```bash
   npx supabase functions deploy sms-line --no-verify-jwt
   npx supabase secrets set TWILIO_AUTH_TOKEN=... TWILIO_WEBHOOK_URL=https://<project-ref>.supabase.co/functions/v1/sms-line
   ```
3. In Twilio, set the number's "A message comes in" webhook to that URL (HTTP POST).

The function checks Twilio's signature on every request and ignores anything else.

## Releasing to the app stores

Use [EAS](https://docs.expo.dev/eas/): `npx eas-cli@latest build` and `npx eas-cli@latest submit`. Create the Apple and Google developer accounts in BFI's name. Apple offers fee waivers for nonprofits. Replace the placeholder icon and splash images in `assets/` with BFI-approved artwork first, and update `ios.bundleIdentifier` and `android.package` in `app.json` if BFI prefers different identifiers.

## What's next

These are planned in the concept document and have room in the schema already:

- Push notifications for new messages, inquiry replies, followed farms and event reminders (Expo Notifications plus a Supabase function)
- Broadcast composer for staff, with push, SMS and email delivery
- Voice notes with automatic transcripts (`messages.audio_path` and `transcript` exist)
- Translation on demand, and French, Haitian Creole and Portuguese
- Map view, distance sorting and "near me" alerts
- Farm photos through Supabase Storage, uploaded with each farmer's permission
- Offline caching of saved farms and resources
- Importing BFI's full directory ([docs/IMPORTING.md](docs/IMPORTING.md))

## Handing it over

The app is meant to belong to Black Farmers Index:

- Transfer this repository to a BFI GitHub organization (Settings → Danger Zone → Transfer).
- Create the Supabase project, Twilio account, Expo account and app store accounts under BFI's name and email, and add volunteers as collaborators.
- BFI decides what's public, who is staff, and what gets listed.

## License

MIT. See [LICENSE](LICENSE).
