# Put The Index on the web (a link for any phone)

About 20 minutes, all in a web browser. You end up with a link like `the-index-companion.vercel.app` that opens on any phone, iPad or computer, and that you can send to the BFI team. Every change pushed to GitHub updates it automatically.

## Part 1: the database (Supabase, free)

1. Go to **supabase.com** → **Start your project**, and sign in with GitHub.
2. **New project.** Name: `the-index`. Set a database password (save it in your password manager). Region: **East US**. Click **Create new project** and wait a minute or two.
3. In the left sidebar, open **SQL Editor** → **New query**.
4. On GitHub, open `supabase/setup.sql` in the repo, click **Copy raw file** (the copy icon above the code), paste it into the SQL editor and click **Run**. You should see "Success. No rows returned."
5. For the sample farms and events, do the same with `supabase/seed.sql` in a new query. Skip this once BFI's real directory goes in.
6. **Sign-in codes:** left sidebar → **Authentication** → **Emails** → **Magic Link**. Replace the message body with:

   ```
   <h2>Your code for The Index</h2>
   <p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
   <p>It expires in one hour. If you didn't ask for it, you can ignore this email.</p>
   ```

   Click **Save**.
7. Left sidebar → **Project Settings** → **API Keys** (or **API**). Keep this tab open; you need two values in Part 2:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **Publishable key** (starts with `sb_publishable_`, or the older **anon public** key)

## Part 2: the website (Vercel, free)

1. Go to **vercel.com** → **Sign Up** → **Continue with GitHub**. Choose the free **Hobby** plan.
2. **Add New…** → **Project**. Find **the-index-companion** and click **Import**. (If it isn't listed, click **Adjust GitHub App Permissions** and allow the repo.)
3. Leave the build settings as they are; the repo's `vercel.json` sets them.
4. Open **Environment Variables** and add two:

   | Name | Value |
   | --- | --- |
   | `EXPO_PUBLIC_SUPABASE_URL` | your Project URL |
   | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your publishable key |

5. Click **Deploy**. In two or three minutes you get a link. Open it on your phone.

Tip: in Safari, tap **Share → Add to Home Screen** so it opens like an app.

## Part 3: make yourself BFI staff

1. In the app, tap **Settings** (the accessibility icon, top right) → **Sign in**, and sign in with the code from your email.
2. Back in Supabase → **SQL Editor** → **New query**, run this with your email:

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

3. Reload the app. The review queue, announcement composer and impact report now appear under Settings → BFI staff.

## Good to know

- **Changing the keys later:** Vercel → your project → **Settings → Environment Variables**, then **Deployments → … → Redeploy**. The keys are built into the site, so a redeploy is needed.
- **What's different on the web:** phone notifications and native Apple/Google maps come with the installed app; the web uses the in-app inbox and a plotted map. Voice notes record in Chrome and recent Safari.
- **The publishable key is safe to share** in the site. Never put the service role key in Vercel.
- **Free limits:** both free plans comfortably cover a pilot. Supabase pauses a free project after a week with no use; open the dashboard and click **Restore** if that happens.
- **Your own address:** Vercel → **Settings → Domains** lets BFI use something like `app.blackfarmersindex.com` later.
