# Notifications, voice notes and translation: setup

The app works without any of this; these steps switch on delivery outside the app. Every notification always lands in the in-app inbox (the bell), whichever channels are set up.

## How it fits together

```
something happens (new message, fresh product, broadcast, approval)
  → a database trigger calls enqueue_notification()
  → a row in notifications (the inbox) + one row per channel in notification_deliveries
  → every minute, the deliver function sends pending rows by push, text and email
```

Reminders work the same way: each `deliver` run first calls `run_due_reminders()`, which queues tomorrow's event reminders and program deadlines 30, 7 and 1 day out, once each.

Members control all of it in Settings → Notification settings: phone notifications, email, texts (with their number), and which kinds of news they want. Farmers in harvest mode keep messages in the inbox without a push.

## 1. Push notifications (Expo)

1. Create an Expo account for BFI and run `npx eas-cli@latest init` in the project. Put the printed project id in `.env` as `EAS_PROJECT_ID`.
2. Push needs an installed build, not Expo Go on Android: `npx eas-cli@latest build --profile development` (or a store build).
3. Follow Expo's push credentials steps for iOS (an Apple push key) and Android (Firebase FCM v1 credentials). EAS walks you through both during `eas build`.
4. Optional: if you turn on enhanced push security in Expo, set the access token as `EXPO_ACCESS_TOKEN` (step 4).

## 2. Text messages (Twilio)

Use the same Twilio number as the text line or a second one. Register it for A2P 10DLC messaging before sending to US numbers.

**Numbers are confirmed before anything is texted.** In Settings a member types their number and taps "Text me a code"; `deliver` texts a 6-digit code (it expires in 10 minutes, at most 5 a day per member, one a minute), and the member types it in. Codes and texts go to US and Canadian numbers (+1, which includes Puerto Rico, the US Virgin Islands and Guam); members elsewhere use phone notifications and email. If two other accounts have already asked for a code for a number that day, a third is refused and told to contact BFI. That stops anyone using the code text to pester someone. In Twilio, also turn off Geo Permissions for countries BFI doesn't text. Until then nothing is texted to that number and texts from it aren't matched to anyone, so nobody can sign a stranger up for texts or pose as another member by typing their number. A confirmed number belongs to one account. Changing the number un-confirms it.

**Upgrading an existing project:** numbers saved before this change start unconfirmed, so those members stop getting texts until they confirm. The upgrade sends each of them a phone notification and email asking them to open Settings and confirm. It's worth a mention in the next BFI announcement too, before storm season.

**STOP and START.** Twilio sends the carrier-required replies and blocks texts after STOP. It also forwards the keyword to `sms-line`, which records it (Settings shows texts as off), and `deliver` turns texting off for anyone Twilio reports as opted out (error 21610). Texting START, UNSTOP or YES turns it back on (YES also still answers an open inquiry).

**Replies come back into the app.** Point the number's "A message comes in" webhook at the `sms-line` function (see the text line steps in the README). When a member who has opted in replies to a text, `sms-line` matches their phone number and:

- if we texted them about a message, inquiry or board reply in the last 3 days, posts their reply in that conversation (marked "by text");
- if it was an inquiry and they're the farmer, YES, PART or NO answers it (anything after the word becomes the note: "PART I have 3 lb");
- if a storm check-in is open for them, SAFE or NEED (plus what they need), or just OK, answers it. Safety comes first: if the text could be either, it answers the check-in, and the confirmation says "Meant for a conversation? Text REPLY and your message." Starting a text with REPLY always sends it to the conversation;
- otherwise treats the text as a search. Members can always force a search by starting with FIND: "FIND HONEY LA".

Outgoing texts end with "Reply to this text to answer" (or "Reply YES, PART or NO" for inquiries) so people know they can. If you use two numbers, replies only work on the number that sent the text, so send from the text line's number.

## 3. Email (Resend)

Create a Resend account, verify a sending domain BFI owns (for example `notify.blackfarmersindex.com`), and create an API key.

## 4. Deploy the functions and set secrets

```bash
npx supabase functions deploy deliver --no-verify-jwt
npx supabase functions deploy transcribe
npx supabase functions deploy translate

npx supabase secrets set \
  CRON_SECRET="$(openssl rand -hex 24)" \
  TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... TWILIO_FROM=+1... \
  RESEND_API_KEY=re_... EMAIL_FROM="The Index <hello@notify.blackfarmersindex.com>" \
  TRANSCRIBE_API_KEY=... \
  DEEPL_API_KEY=...
```

Any channel without its secrets is skipped (marked `skipped`, and not retried later), so you can turn them on one at a time. Set the secrets before telling members a channel is live.

## 5. Run `deliver` every minute

In the Supabase SQL editor, turn on the `pg_cron` and `pg_net` extensions (Database → Extensions), then run, filling in your project ref and the CRON_SECRET you set:

```sql
select cron.schedule(
  'the-index-deliver',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/deliver',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
```

Check it's working in Table Editor → `notification_deliveries`: rows should move from `pending` (briefly `sending`) to `sent`. Each run claims its rows first, so two runs that overlap never send the same notification twice, and a run that stops halfway puts unsent rows back after 10 minutes. Failures retry after 2, 4 and 8 minutes (four tries in all) and keep the error in `last_error`. Long texts are trimmed to about two text-message segments.

## Voice note transcripts

Voice notes are stored privately (bucket `voice-notes`, readable only by people in that conversation). After a member sends one, the app asks `transcribe` for a transcript. It works with any OpenAI-compatible speech-to-text endpoint:

| Secret | Default |
| --- | --- |
| `TRANSCRIBE_API_KEY` | required |
| `TRANSCRIBE_API_URL` | `https://api.openai.com/v1/audio/transcriptions` |
| `TRANSCRIBE_MODEL` | `whisper-1` |

Without a key, voice notes still send and play; they just have no transcript.

## Translation

`translate` uses DeepL (`DEEPL_API_KEY`) or a LibreTranslate server (`LIBRETRANSLATE_URL`, plus `LIBRETRANSLATE_API_KEY` if needed). DeepL doesn't support Haitian Creole, so set up LibreTranslate too if Creole speakers are in the Index; the function falls back to it for `ht`.

## Costs to plan for

| Service | What drives cost |
| --- | --- |
| Expo push | Free |
| Twilio | Per text sent; nonprofit credits may apply (Twilio.org) |
| Resend | Free tier covers a few thousand emails a month |
| Transcription | Per minute of audio |
| DeepL | Free tier covers 500,000 characters a month |

Keep text messages for urgent news; the broadcast composer warns staff before sending by text.
