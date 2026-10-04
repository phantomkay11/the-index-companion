import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button, Field, Screen, Txt } from '@/components/ui';
import { isConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

/** Email one-time code sign-in: no passwords to remember or reset. */
export default function SignIn() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const sendCode = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, data: name.trim() ? { display_name: name.trim() } : undefined },
    });
    setBusy(false);
    if (error) return Alert.alert('Code not sent', error.message);
    setSent(true);
  };

  const verify = async () => {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) return Alert.alert('That code did not work', 'Check the code in your email, or send a new one.');
    await refresh();
    router.back();
  };

  if (!isConfigured) {
    return (
      <Screen>
        <Txt>This build isn’t connected to a database yet. See the README to add the Supabase settings.</Txt>
      </Screen>
    );
  }

  return (
    <Screen>
      <Txt muted>We’ll email you a 6-digit code. No password needed.</Txt>
      {!sent ? (
        <>
          <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" placeholder="How you'd like to appear to others" />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <Button label="Email me a code" onPress={sendCode} busy={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} />
        </>
      ) : (
        <>
          <Txt>Enter the code we sent to {email.trim()}.</Txt>
          <Field
            label="6-digit code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
          />
          <Button label="Sign in" onPress={verify} busy={busy} disabled={code.trim().length < 6} />
          <Button kind="ghost" label="Use a different email" onPress={() => setSent(false)} />
        </>
      )}
      <Txt variant="small" muted>
        By signing in you agree that BFI may contact you about your account. Your email is never shown to other members.
      </Txt>
    </Screen>
  );
}
