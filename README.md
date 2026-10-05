# The Index

A free companion app for [Black Farmers Index](https://blackfarmersindex.com), the largest free directory of Black farmers. It turns the directory into a living network: neighbors find growers and send them requests, growers talk to each other in regional channels, everyone sees events, and farmers find programs and deadlines that apply to them.

Built as a gift to Black Farmers Index by Kerry Laster. The intent is for BFI to own the code, the data and the app store listings. See [Handing it over](#handing-it-over).

> **Status:** working codebase, not yet deployed. It runs on iOS, Android and the web from one Expo project, with Supabase as the backend.

## What's in it

| Area | What works |
| --- | --- |
| **Discover** | Browse approved farms by BFI's grower types and its 11 regions plus International. Search by name, town or product. Sort nearest first from your location or a typed town or ZIP. Switch between a list and a map (Apple Maps on iPhone, Google Maps on Android, a plotted map on the web). |
| **Farm profiles** | What's fresh this week, how to buy, languages, a privacy-safe location, farm photos with descriptions for screen readers, and a Translate button on the farm's story. |
| **Trust** | "Verified by BFI" marks, last-updated stamps, "listed since" dates, report buttons on listings, messages and posts, "Sample" labels on demo data, and staff tools to hide messages. |
| **Messaging** | Structured inquiries that farmers answer in one tap, live direct threads, voice notes with transcripts, Translate and Listen on every message, one channel per BFI region plus topic groups, and an official "From BFI" feed. |
| **Notifications** | An in-app inbox plus phone notifications, texts and email for new messages, inquiries, fresh products from followed farms, near-me alerts, event reminders, program deadlines, review decisions and BFI announcements. Members choose channels and topics. |
| **Near-me alerts** | "Tell me when honey is fresh within 25 miles." Matched automatically when a farm marks a product fresh. |
| **Community board** | Needs and offers, equipment sharing, rides and hauling, buying together and mentoring, by region, with private replies. |
| **Events** | RSVP with push, text or email reminders, volunteer shifts with capacity limits, and member-submitted events held for BFI approval. |
| **Resources** | BFI's own programs first, then public programs, filtered by farm type and stage, with a deadline tracker and reminders. |
| **Growers** | List a farm (reviewed by BFI), toggle what's fresh, add photos, harvest mode, and a monthly snapshot of profile views, followers and inquiries. |
| **BFI staff** | A review queue, an announcement composer (by audience and channel), and an impact report for funders that can be shared as CSV. |
| **Accessibility** | Atkinson Hyperlegible type, text size up to 160% on top of the phone's setting, high contrast, reduce motion, save-data mode, read-aloud, five languages (English, Spanish, French, Haitian Creole, Portuguese), 44-point tap targets and screen-reader labels throughout. |
| **Offline** | The directory, farm profiles, events, resources, announcements and board are saved on the phone and shown when there's no signal, with an offline banner. |
| **Text line** | A Supabase function that answers SMS searches ("HONEY LA", "EVENTS") through Twilio, for people without smartphones. |

Content that comes from blackfarmersindex.com (regions, stats, mission, timeline, programs, contacts, the Collard Green Gala) lives in `src/lib/bfi.ts` and `supabase/migrations/20261004000100_bfi_reference_data.sql`. BFI should review it and keep it current. The Haitian Creole and Portuguese text was drafted for the pilot; have native speakers in the Index review it before launch.

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

Expo Go is fine for trying most of the app. Phone notifications (on Android) and native maps need an installed build: `npx eas-cli@latest build --profile development`. In Expo Go the map falls back to the plotted map.

### 5. Make yourself staff

Sign in once in the app, then run this in the Supabase SQL editor with your email:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

The review queue then appears on the Discover screen. See [docs/ADMIN.md](docs/ADMIN.md) for the full staff guide.

## Checks

```bash
npm run typecheck        # TypeScript
npm run test:db          # runs every migration in an in-memory Postgres and checks 75+ rules
npm run check:functions  # type-checks the Supabase functions with Deno
npx expo lint
```

`test:db` checks things like: new listings can't approve themselves, members can't make themselves staff, private threads and voice notes stay private, only verified growers post in channels, notifications go only to the right people on the channels they allowed, harvest mode holds pushes, reminders send once, photos need consent and a description, and only staff see impact numbers.

## How it's put together

```
src/app/                 screens (Expo Router: every file is a route)
  (tabs)/                Discover, Messages, Community, Events, Resources
  farm/[id].tsx          farm profile
  inquiry/[farmId].tsx   structured inquiry form
  thread/[id].tsx        live conversation with voice notes and translation
  notifications.tsx      inbox
  alerts.tsx             near-me alerts
  new-post.tsx           community board post
  my-farm.tsx            list or manage a farm, photos, insights
  review.tsx, compose-broadcast.tsx, impact.tsx    BFI staff tools
  settings.tsx, about.tsx, sign-in.tsx, post-event.tsx
src/components/          shared UI, farm card, maps, voice notes, translation, offline banner
src/constants/theme.ts   colors (BFI green #007640), fonts, spacing, high-contrast palettes
src/lib/                 Supabase client, types, BFI content, five languages, location, push, files
src/providers/           accessibility settings, sign-in state, notifications
supabase/migrations/     schema, row level security, BFI reference data, v2 features
supabase/seed.sql        sample farms and events (demo only)
supabase/functions/      deliver (push, text, email), transcribe, translate, sms-line
supabase/tests/          database security checks
scripts/                 import-directory.mjs for loading BFI's directory
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

## Setting up delivery, transcripts and translation

See [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md): push credentials, Twilio, email, the every-minute delivery job, and the keys for transcripts and translation. Each piece is optional and can be switched on separately.

## What's next

- Two-way SMS for farmers who reply by text (replies from a phone number land in the right thread)
- Pre-orders and CSA sign-ups through a farm e-commerce partner
- Surveys for BFI's data and reporting work, with consent built in
- Weather and disaster check-ins by region
- More languages, based on who's in the Index

## Handing it over

The app is meant to belong to Black Farmers Index:

- Transfer this repository to a BFI GitHub organization (Settings → Danger Zone → Transfer).
- Create the Supabase project, Twilio account, Expo account and app store accounts under BFI's name and email, and add volunteers as collaborators.
- BFI decides what's public, who is staff, and what gets listed.

## License

MIT. See [LICENSE](LICENSE).
