import { router } from 'expo-router';
import { useState } from 'react';


import { Button, Field, Screen, Txt } from '@/components/ui';
import { isConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';

/** Email one-time code sign-in: no passwords to remember or reset. */
export default function SignIn() {
  const { t } = useSettings();
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
    if (error) return showAlert(t('m_codeNotSent'), error.message);
    setSent(true);
  };

  const verify = async () => {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) return showAlert(t('m_codeDidNotWork'), t('m_checkEmailCode'));
    await refresh();
    router.back();
  };

  if (!isConfigured) {
    return (
      <Screen>
        <Txt>{t('m_notConfigured')}</Txt>
      </Screen>
    );
  }

  return (
    <Screen>
      <Txt muted>{t('m_emailCodeIntro')}</Txt>
      {!sent ? (
        <>
          <Field label={t('m_yourName')} value={name} onChangeText={setName} autoComplete="name" placeholder={t('m_yourNamePlaceholder')} />
          <Field
            label={t('email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <Button label={t('m_emailMeCode')} onPress={sendCode} busy={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} />
        </>
      ) : (
        <>
          <Txt>{t('m_enterCodeSentTo', { email: email.trim() })}</Txt>
          <Field
            label={t('m_sixDigitCode')}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
          />
          <Button label={t('signIn')} onPress={verify} busy={busy} disabled={code.trim().length < 6} />
          <Button kind="ghost" label={t('m_differentEmail')} onPress={() => setSent(false)} />
        </>
      )}
      <Txt variant="small" muted>
        {t('m_signInConsent')}
      </Txt>
    </Screen>
  );
}
