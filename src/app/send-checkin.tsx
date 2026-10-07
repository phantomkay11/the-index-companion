import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AudiencePicker, audienceLabel, useRegions } from '@/components/audience-picker';
import { Button, Card, Chip, Field, Row, Screen, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';
import { StaffOnly } from '@/components/staff-only';

const DAYS = [3, 7, 14];

/** BFI staff ask a region "Are you OK?" after a storm, flood, fire or freeze. */
export default function SendCheckin() {
  const { isStaff } = useAuth();
  const { t } = useSettings();
  const regions = useRegions();
  // Prefilled wording goes out to members as typed, so it stays the same whatever language staff use.
  const [title, setTitle] = useState('Are you OK after the storm?');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('');
  const [days, setDays] = useState(7);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isStaff) return <StaffOnly>{t('s_sendCheckinStaffOnly')}</StaffOnly>;

  const valid = title.trim().length >= 3 && audience;
  const who = audience ? audienceLabel(audience, regions.data) : '';

  const send = async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from('checkins')
      .insert({ title: title.trim(), message: message.trim(), audience, closes_at: new Date(Date.now() + days * 86400000).toISOString() })
      .select('id')
      .single();
    setBusy(false);
    if (error) return showAlert(t('s_notSent'), error.message);
    router.replace({ pathname: '/checkin/[id]', params: { id: data.id } });
  };

  return (
    <Screen>
      <Txt muted>{t('s_checkinIntro')}</Txt>
      <Field label={t('s_title')} value={title} onChangeText={setTitle} maxLength={120} />
      <Field
        label={t('s_messageOptional')}
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={400}
        placeholder={t('s_checkinPlaceholder')}
      />
      <AudiencePicker value={audience} onChange={setAudience} label={t('s_whichArea')} />
      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">{t('s_keepOpenFor')}</Txt>
        <Row gap={6}>
          {DAYS.map((d) => (
            <Chip key={d} label={t('s_nDays', { n: d })} selected={days === d} onPress={() => setDays(d)} />
          ))}
        </Row>
      </View>
      {!confirming ? (
        <Button label={t('s_reviewAndSend')} onPress={() => setConfirming(true)} disabled={!valid} />
      ) : (
        <Card tone="sun">
          <Txt variant="bodyBold">{t('s_confirmSendTo', { title: title.trim(), audience: who.toLowerCase() })}</Txt>
          <Txt variant="small">{t('s_checkinChannels')}</Txt>
          <Row>
            <Button label={t('s_sendNow')} icon="thunderstorm-outline" onPress={send} busy={busy} />
            <Button kind="ghost" label={t('s_edit')} onPress={() => setConfirming(false)} />
          </Row>
        </Card>
      )}
    </Screen>
  );
}
