import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, View } from 'react-native';

import { Button, Card, Chip, Field, Row, Screen, ToggleRow, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { LANGUAGES, type Lang } from '@/lib/i18n';
import { registerForPush, unregisterPush } from '@/lib/push';
import { speak } from '@/lib/speak';
import { supabase } from '@/lib/supabase';
import type { ContactPrefs } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { toE164 } from '@/lib/format';

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
          aria-valuemin={100}
          aria-valuemax={160}
          aria-valuenow={Math.round(s.textScale * 100)}
          aria-valuetext={`${Math.round(s.textScale * 100)}%`}
          style={{ height: 44 }}
        />
        {/* Buttons as well as the slider: easier with a screen reader, a switch control or shaky hands. */}
        <Row>
          <Button small kind="ghost" label="Smaller" icon="remove" disabled={s.textScale <= 1}
            accessibilityLabel="Make text smaller" onPress={() => s.update({ textScale: Math.max(1, Math.round((s.textScale - 0.1) * 10) / 10) })} />
          <Button small kind="ghost" label="Larger" icon="add" disabled={s.textScale >= 1.6}
            accessibilityLabel="Make text larger" onPress={() => s.update({ textScale: Math.min(1.6, Math.round((s.textScale + 0.1) * 10) / 10) })} />
        </Row>
        <Txt variant="small" muted>
          This works on top of your phone’s own text size setting.
        </Txt>
      </Card>

      <ToggleRow label={s.t('highContrast')} hint="Black and white text, stronger borders." value={s.highContrast} onChange={(v) => s.update({ highContrast: v })} />
      <ToggleRow label={s.t('reduceMotion')} hint="Turns off sliding and fading between screens." value={s.reduceMotion} onChange={(v) => s.update({ reduceMotion: v })} />
      <ToggleRow label="Save data" hint="Hides photos and maps on slow or limited connections." value={s.saveData} onChange={(v) => s.update({ saveData: v })} />

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
        Account
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
                Alert.alert('Signed out');
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
  const { t } = useSettings();
  const prefs = useQuery(async () => must(await supabase.from('contact_prefs').select('*').eq('user_id', userId).single()) as ContactPrefs, [userId]);
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);

  if (!prefs.data) return null;
  const p = prefs.data;
  const phoneValue = phone ?? p.phone ?? '';
  const verified = !!p.phone && !!p.phone_verified_at;

  const save = async (patch: Partial<ContactPrefs>) => {
    // Functional update: two quick toggles must not undo each other on screen.
    prefs.setData((prev) => (prev ? { ...prev, ...patch } : prev));
    const { error } = await supabase.from('contact_prefs').update(patch).eq('user_id', userId);
    if (error) {
      Alert.alert('Not saved', error.message);
      prefs.reload();
    }
  };

  const togglePush = async (on: boolean) => {
    if (busy) return;
    if (!on) return save({ push_token: null });
    setBusy(true);
    const result = await registerForPush(userId);
    setBusy(false);
    if (!result.ok) Alert.alert('Phone notifications are off', result.reason);
    prefs.reload();
  };

  const savePhone = async () => {
    const e164 = toE164(phoneValue);
    if (!e164) return Alert.alert('Check the number', 'Use a 10-digit US number, or start with + and the country code.');
    if (e164 === p.phone) return sendCode();
    setCodeBusy(true);
    const { error } = await supabase.from('contact_prefs').update({ phone: e164 }).eq('user_id', userId);
    setCodeBusy(false);
    if (error) return Alert.alert('Not saved', error.message);
    setPhone(e164);
    setCodeSent(false);
    await prefs.reload();
    await sendCode();
  };

  const sendCode = async () => {
    setCodeBusy(true);
    const { error } = await supabase.rpc('request_phone_code');
    setCodeBusy(false);
    if (error) return Alert.alert('Code not sent', error.message);
    setCodeSent(true);
    setCode('');
  };

  const confirmCode = async () => {
    if (codeBusy) return;
    setCodeBusy(true);
    const { data, error } = await supabase.rpc('confirm_phone_code', { p_code: code });
    setCodeBusy(false);
    if (error) return Alert.alert('Not confirmed', error.message);
    if (!data) return Alert.alert('That code didn’t match', 'Check the text and try again, or ask for a new code.');
    setCodeSent(false);
    setCode('');
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
          For members who prefer texts. We text a code first to make sure the number is yours. Message rates may apply. Reply STOP to any
          text to opt out.
        </Txt>
        <Row>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Field label="Mobile number" value={phoneValue} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="337 555 0100" />
          </View>
          <Button
            small
            kind="ghost"
            label={verified && toE164(phoneValue) === p.phone ? 'Confirmed' : 'Text me a code'}
            icon={verified && toE164(phoneValue) === p.phone ? 'checkmark-circle' : 'chatbubble-outline'}
            busy={codeBusy && !codeSent}
            disabled={verified && toE164(phoneValue) === p.phone}
            onPress={savePhone}
            style={{ alignSelf: 'flex-end' }}
          />
        </Row>
        {codeSent && !verified ? (
          <Row>
            <View style={{ flex: 1, minWidth: 140 }}>
              <Field label="6-digit code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" />
            </View>
            <Button small label="Confirm" busy={codeBusy} disabled={code.length !== 6} onPress={confirmCode} style={{ alignSelf: 'flex-end' }} />
            <Button small kind="ghost" label="New code" disabled={codeBusy} onPress={sendCode} style={{ alignSelf: 'flex-end' }} />
          </Row>
        ) : null}
        {p.phone && !verified && !codeSent ? (
          <Txt variant="small" muted>Not confirmed yet. Tap “Text me a code” to start getting texts at this number.</Txt>
        ) : null}
        <ToggleRow
          label="Send me texts"
          hint={p.sms_opt_in && !verified ? 'Texts start once your number is confirmed.' : undefined}
          value={p.sms_opt_in}
          onChange={(v) => (v && !p.phone ? Alert.alert('Add your number first') : save({ sms_opt_in: v }))}
        />
      </Card>
      <Txt variant="smallBold" style={{ marginTop: Space.sm }}>
        Tell me about
      </Txt>
      <ToggleRow label="Messages and inquiries" value={p.notify_messages} onChange={(v) => save({ notify_messages: v })} />
      <ToggleRow label="Farms I follow and near-me alerts" value={p.notify_follows} onChange={(v) => save({ notify_follows: v })} />
      <ToggleRow label="Event reminders" value={p.notify_events} onChange={(v) => save({ notify_events: v })} />
      <ToggleRow label="Program deadlines" value={p.notify_deadlines} onChange={(v) => save({ notify_deadlines: v })} />
      <ToggleRow label="Announcements from BFI" value={p.notify_broadcasts} onChange={(v) => save({ notify_broadcasts: v })} />
      <Txt variant="small" muted>
        Everything also appears in your notifications inbox, whichever channels you choose.
      </Txt>
    </View>
  );
}

