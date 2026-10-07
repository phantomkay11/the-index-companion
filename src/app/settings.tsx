import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { Button, Card, Chip, ErrorNote, Field, Loading, Row, Screen, ToggleRow, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { LANGUAGES, type Lang } from '@/lib/i18n';
import { registerForPush, unregisterPush } from '@/lib/push';
import { speak } from '@/lib/speak';
import { supabase } from '@/lib/supabase';
import type { ContactPrefs } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';

export default function Settings() {
  const s = useSettings();
  const { session, profile, signOut, refresh, isStaff } = useAuth();

  const setLanguage = async (language: Lang) => {
    s.update({ language });
    if (profile) {
      await supabase.from('profiles').update({ language }).eq('id', profile.id);
      refresh();
    }
  };

  return (
    <Screen>
      <Txt variant="label">{s.t('accessibility')}</Txt>
      <Button
        label={s.t('readAloud')}
        icon="volume-high-outline"
        onPress={() =>
          speak(
            `${s.t('settings')}. ${s.t('textSize')}. ${s.t('highContrast')}. ${s.t('reduceMotion')}. ${s.t('language')}. ${s.t('notificationSettings')}.`,
            s.language,
          )
        }
      />

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="bodyBold">{s.t('textSize')}</Txt>
          <Txt variant="mono">{Math.round(s.textScale * 100)}%</Txt>
        </Row>
        {/* Buttons work for everyone (including screen readers and keyboards); the slider is a shortcut on phones. */}
        <Row>
          <Button
            small
            kind="ghost"
            label="A−"
            accessibilityLabel={`A−, ${s.t('smallerText')}, ${Math.round(s.textScale * 100)}%`}
            disabled={s.textScale <= 1}
            onPress={() => s.update({ textScale: Math.max(1, Math.round((s.textScale - 0.1) * 10) / 10) })}
          />
          <Button
            small
            kind="ghost"
            label="A+"
            accessibilityLabel={`A+, ${s.t('largerText')}, ${Math.round(s.textScale * 100)}%`}
            disabled={s.textScale >= 1.6}
            onPress={() => s.update({ textScale: Math.min(1.6, Math.round((s.textScale + 0.1) * 10) / 10) })}
          />
        </Row>
        {Platform.OS !== 'web' ? (
        <Slider
          minimumValue={1}
          maximumValue={1.6}
          step={0.1}
          value={s.textScale}
          onSlidingComplete={(v) => s.update({ textScale: Math.round(v * 10) / 10 })}
          minimumTrackTintColor={s.colors.leaf}
          maximumTrackTintColor={s.colors.line}
          thumbTintColor={s.colors.leaf}
          accessibilityLabel={s.t('textSize')}
          accessibilityValue={{ min: 100, max: 160, now: Math.round(s.textScale * 100), text: `${Math.round(s.textScale * 100)}%` }}
          style={{ height: 44 }}
        />
        ) : null}
        <Txt variant="small" muted>
          This works on top of your phone’s own text size setting.
        </Txt>
      </Card>

      <ToggleRow label={s.t('highContrast')} hint={s.t('highContrastHint')} value={s.highContrast} onChange={(v) => s.update({ highContrast: v })} />
      <ToggleRow label={s.t('reduceMotion')} hint={s.t('reduceMotionHint')} value={s.reduceMotion} onChange={(v) => s.update({ reduceMotion: v })} />
      <ToggleRow label={s.t('saveData')} hint={s.t('saveDataHint')} value={s.saveData} onChange={(v) => s.update({ saveData: v })} />

      <View style={{ gap: Space.sm }}>
        <Txt variant="bodyBold">{s.t('language')}</Txt>
        <Row gap={6}>
          {LANGUAGES.map((l) => (
            <Chip key={l.code} label={l.label} selected={s.language === l.code} onPress={() => setLanguage(l.code)} />
          ))}
        </Row>
        <Txt variant="small" muted>
          Messages and listings can be translated into your language with the Translate button.
        </Txt>
      </View>

      {session ? <NotificationPrefs userId={session.user.id} /> : null}

      <Txt variant="label" style={{ marginTop: Space.md }}>
        {s.t('account')}
      </Txt>
      {session ? (
        <Card>
          <Txt variant="bodyBold">{profile?.display_name ?? 'Member'}</Txt>
          <Txt variant="small" muted>
            {session.user.email}
          </Txt>
          <Row>
            <Button small kind="ghost" label={s.t('myFarm')} onPress={() => router.push('/my-farm')} />
            <Button small kind="ghost" label={s.t('nearMeAlerts')} onPress={() => router.push('/alerts')} />
            <Button small kind="ghost" label={s.t('surveys')} onPress={() => router.push('/surveys')} />
            <Button
              small
              kind="ghost"
              label={s.t('signOut')}
              onPress={async () => {
                await unregisterPush(session.user.id).catch(() => {});
                await signOut();
                showAlert('Signed out');
              }}
            />
          </Row>
        </Card>
      ) : (
        <Button label={s.t('signIn')} onPress={() => router.push('/sign-in')} />
      )}

      {isStaff ? (
        <Card tone="soft">
          <Txt variant="label">BFI staff</Txt>
          <Row>
            <Button small label={s.t('broadcast')} icon="megaphone-outline" onPress={() => router.push('/compose-broadcast')} />
            <Button small kind="ghost" label={s.t('review')} icon="shield-checkmark-outline" onPress={() => router.push('/review')} />
            <Button small kind="ghost" label={s.t('impact')} icon="stats-chart-outline" onPress={() => router.push('/impact')} />
            <Button small kind="ghost" label={s.t('surveys')} icon="clipboard-outline" onPress={() => router.push('/surveys')} />
            <Button small kind="ghost" label={s.t('checkIn')} icon="thunderstorm-outline" onPress={() => router.push('/checkins')} />
          </Row>
        </Card>
      ) : null}

      <Button kind="ghost" label={s.t('about')} icon="information-circle-outline" onPress={() => router.push('/about')} />
    </Screen>
  );
}

function NotificationPrefs({ userId }: { userId: string }) {
  const { t, colors } = useSettings();
  const prefs = useQuery(async () => must(await supabase.from('contact_prefs').select('*').eq('user_id', userId).single()) as ContactPrefs, [userId]);
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  if (!prefs.data) return prefs.error ? <ErrorNote message={prefs.error} onRetry={prefs.reload} /> : <Loading />;
  const p = prefs.data;
  const phoneValue = phone ?? p.phone ?? '';

  const save = async (patch: Partial<ContactPrefs>) => {
    prefs.setData({ ...p, ...patch });
    const { phone_verified_at: _localOnly, ...serverPatch } = patch;
    const { error } = await supabase.from('contact_prefs').update(serverPatch).eq('user_id', userId);
    if (error) {
      showAlert('Not saved', error.message);
      prefs.reload();
    }
  };

  const togglePush = async (on: boolean) => {
    if (!on) return save({ push_token: null });
    setBusy(true);
    const result = await registerForPush(userId);
    setBusy(false);
    if (!result.ok) showAlert('Phone notifications are off', result.reason);
    prefs.reload();
  };

  const savePhone = () => {
    // Text alerts are US-only for now: a 10-digit number, with or without +1 in front.
    const digits = phoneValue.replace(/\D/g, '');
    const plus = phoneValue.trim().startsWith('+');
    const e164 = !plus && digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : null;
    if (!e164 || !/^\+1[2-9]\d{9}$/.test(e164)) return showAlert(t('checkNumber'), t('usNumbersOnly'));
    setPhone(e164);
    setCodeSent(false);
    // A new number is unconfirmed until proven; reflect that right away, then reload what the server holds.
    if (e164 !== p.phone) save({ phone: e164, phone_verified_at: null }).then(() => prefs.reload());
  };

  const removePhone = () => {
    setPhone('');
    setCodeSent(false);
    save({ phone: null, sms_opt_in: false, phone_verified_at: null }).then(() => prefs.reload());
  };

  // Prove the number before any texts go to it, so nobody can sign up with someone else's phone.
  const sendCode = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('request_phone_code');
    setBusy(false);
    if (error) return showAlert('Code not sent', error.message);
    setCodeSent(true);
  };
  const confirmCode = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('confirm_phone_code', { p_code: code.trim() });
    setBusy(false);
    if (error) return showAlert('Not confirmed', error.message);
    if (!data) return showAlert('That code didn’t match', 'Check the text and try again.');
    setCode('');
    setCodeSent(false);
    prefs.reload();
  };

  return (
    <View style={{ gap: Space.sm, marginTop: Space.md }}>
      <Txt variant="label">{t('notificationSettings')}</Txt>
      <ToggleRow
        label={t('pushNotifications')}
        hint={Platform.OS === 'web' ? 'Available in the iPhone and Android apps.' : busy ? 'Turning on…' : 'Replies, fresh products, reminders and BFI news.'}
        value={!!p.push_token}
        onChange={togglePush}
      />
      <ToggleRow label={t('email')} hint="Event reminders, deadlines and BFI announcements." value={p.email_opt_in} onChange={(v) => save({ email_opt_in: v })} />
      <Card>
        <Txt variant="bodyBold">{t('textMessages')}</Txt>
        <Txt variant="small" muted>
          For members who prefer texts. Message rates may apply. Reply STOP to any text to opt out.
        </Txt>
        <Row>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Field label={t('mobileNumber')} value={phoneValue} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="337 555 0100" />
          </View>
          <Button small kind="ghost" label={t('saveNumber')} onPress={savePhone} style={{ alignSelf: 'flex-end' }} />
        </Row>
        {p.phone ? (
          <Button small kind="ghost" label={t('removeNumber')} icon="close-circle-outline" onPress={removePhone} style={{ alignSelf: 'flex-start' }} />
        ) : null}
        {p.phone && p.phone_verified_at && phoneValue === p.phone ? (
          <Txt variant="smallBold" color={colors.leaf}>
            {t('numberConfirmed')}
          </Txt>
        ) : p.phone && phoneValue === p.phone ? (
          <View style={{ gap: Space.sm }}>
            <Txt variant="small" muted>
              {t('confirmNumber')}. {t('codeWillBeSent')} {p.phone}.
            </Txt>
            {!codeSent ? (
              <Button small label={t('sendCode')} icon="chatbubble-ellipses-outline" busy={busy} onPress={sendCode} style={{ alignSelf: 'flex-start' }} />
            ) : (
              <Row>
                <View style={{ flex: 1, minWidth: 140 }}>
                  <Field
                    label={t('enterCode')}
                    value={code}
                    onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={6}
                  />
                </View>
                <Button small label={t('confirm')} busy={busy} disabled={!/^\d{6}$/.test(code)} onPress={confirmCode} style={{ alignSelf: 'flex-end' }} />
              </Row>
            )}
          </View>
        ) : null}
        <ToggleRow
          label={t('sendMeTexts')}
          hint={p.phone_verified_at ? undefined : t('textsStartHint')}
          value={p.sms_opt_in}
          onChange={(v) => (v && !p.phone ? showAlert('Add your number first') : save({ sms_opt_in: v }))}
        />
      </Card>
      <Txt variant="smallBold" style={{ marginTop: Space.sm }}>
        {t('tellMeAbout')}
      </Txt>
      <ToggleRow label={t('notifyMessages')} value={p.notify_messages} onChange={(v) => save({ notify_messages: v })} />
      <ToggleRow label={t('notifyFollows')} value={p.notify_follows} onChange={(v) => save({ notify_follows: v })} />
      <ToggleRow label={t('notifyEvents')} value={p.notify_events} onChange={(v) => save({ notify_events: v })} />
      <ToggleRow label={t('notifyDeadlines')} value={p.notify_deadlines} onChange={(v) => save({ notify_deadlines: v })} />
      <ToggleRow label={t('notifyBroadcasts')} value={p.notify_broadcasts} onChange={(v) => save({ notify_broadcasts: v })} />
      <Txt variant="small" muted>
        Everything also appears in your notifications inbox, whichever channels you choose.
      </Txt>
    </View>
  );
}
