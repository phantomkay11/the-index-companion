# Building for TestFlight from an iPad

No Mac needed: this terminal (a GitHub Codespace) runs in Safari, and Expo builds the app on its servers.
Paste each line, press Return, and answer the questions it asks.

1. Sign in to Expo (make a free account at expo.dev first):

   npx eas-cli@latest login

2. Create the Expo project. It prints a project id at the end; copy it.

   npx eas-cli@latest init

3. Save that id into the app (paste it after the command):

   node scripts/set-eas-project-id.mjs PASTE-THE-ID-HERE

4. Tell the build where the server is (Supabase → Project Settings → API):

   npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --visibility plaintext --value https://YOUR-PROJECT.supabase.co
   npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --visibility plaintext --value YOUR-PUBLISHABLE-KEY

5. Build and send it to TestFlight:

   npx eas-cli@latest build --platform ios --profile production --auto-submit

   - "Log in to your Apple account?" → yes. Use your Apple ID; the 6-digit code pops up on this iPad.
   - Say yes when it offers to create the certificate, the app identifier and the provisioning profile.
   - If it asks for an App Store name and "The Index" is taken, try "The Index by BFI".
   - The build takes about 15–25 minutes. You can close Safari; it keeps going, and Expo emails you.

6. When the build is done, App Store Connect takes another 10–30 minutes to process it. Then open
   App Store Connect → your app → TestFlight, add yourself as a tester, and install it with the TestFlight app.

When you're done, stop the Codespace (github.com → Codespaces → … → Stop) so it doesn't use your free hours.
