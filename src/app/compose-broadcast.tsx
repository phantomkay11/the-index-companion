import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AudiencePicker, audienceLabel as labelFor, useRegions } from '@/components/audience-picker';
import { Button, Card, Chip, Field, Row, Screen, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import type { StringKey } from '@/lib/i18n';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';
import { StaffOnly } from '@/components/staff-only';

// `value` is stored with the broadcast; `labelKey` is the chip, `inlineKey` the same word mid-sentence.
const CHANNELS: { value: string; labelKey: StringKey; inlineKey: StringKey }[] = [
  { value: 'push', labelKey: 's_chPush', inlineKey: 's_chPushInline' },
  { value: 'email', labelKey: 's_chEmail', inlineKey: 's_chEmailInline' },
  { value: 'sms', labelKey: 's_chSms', inlineKey: 's_chSmsInline' },
];

/** BFI staff send an announcement to everyone, growers, neighbors or one region. */
export default function ComposeBroadcast() {
  const { isStaff } = useAuth();
  const { t, colors } = useSettings();
  const regions = useRegions();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('everyone');
  const [channels, setChannels] = useState<string[]>(['push', 'email']);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isStaff) return <StaffOnly>{t('s_broadcastStaffOnly')}</StaffOnly>;

  const linkOk = !linkUrl.trim() || /^https:\/\/\S+$/.test(linkUrl.trim());
  const valid = title.trim().length >= 3 && body.trim().length >= 3 && linkOk;
  const audienceLabel = labelFor(audience, regions.data);

  const send = async () => {
    setBusy(true);
    const { error } = await supabase.from('broadcasts').insert({
      title: title.trim(),
      body: body.trim(),
      audience,
      channels,
      link_url: linkUrl.trim() || null,
      link_text: linkUrl.trim() ? linkText.trim() || 'Learn more' : null,
    });
    setBusy(false);
    if (error) return showAlert(t('s_notSent'), error.message);
    showAlert(t('s_sent'), t('s_broadcastGoing', { audience: audienceLabel.toLowerCase() }));
    router.back();
  };

  return (
    <Screen>
      <Txt muted>{t('s_broadcastIntro')}</Txt>
      <Field label={t('s_title')} value={title} onChangeText={setTitle} placeholder={t('s_broadcastTitlePlaceholder')} maxLength={80} />
      <Field label={t('s_message')} value={body} onChangeText={setBody} multiline maxLength={600} placeholder={t('s_broadcastBodyPlaceholder')} />
      <Row>
        <View style={{ flex: 2, minWidth: 200 }}>
          <Field label={t('s_linkOptional')} value={linkUrl} onChangeText={setLinkUrl} autoCapitalize="none" keyboardType="url" placeholder="https://" />
        </View>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Field label={t('s_linkLabel')} value={linkText} onChangeText={setLinkText} placeholder={t('s_linkLabelPlaceholder')} />
        </View>
      </Row>
      {!linkOk ? <Txt variant="small" color={colors.danger}>{t('s_linkHttps')}</Txt> : null}

      <AudiencePicker value={audience} onChange={setAudience} />

      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">{t('s_howSent')}</Txt>
        <Row gap={6}>
          {CHANNELS.map((c) => (
            <Chip
              key={c.value}
              label={t(c.labelKey)}
              selected={channels.includes(c.value)}
              onPress={() => setChannels((prev) => (prev.includes(c.value) ? prev.filter((x) => x !== c.value) : [...prev, c.value]))}
            />
          ))}
        </Row>
        <Txt variant="small" muted>
          {t('s_smsCost')}
        </Txt>
      </View>

      {!confirming ? (
        <Button label={t('s_reviewAndSend')} onPress={() => setConfirming(true)} disabled={!valid} />
      ) : (
        <Card tone="sun">
          <Txt variant="bodyBold">{t('s_confirmSendTo', { title: title.trim(), audience: audienceLabel.toLowerCase() })}</Txt>
          <Txt variant="small">
            {channels.length
              ? t('s_byChannels', {
                  channels: channels
                    .map((c) => CHANNELS.find((x) => x.value === c))
                    .map((x) => (x ? t(x.inlineKey) : ''))
                    .filter(Boolean)
                    .join(', '),
                })
              : t('s_inboxOnly')}
          </Txt>
          <Row>
            <Button label={t('s_sendNow')} icon="megaphone-outline" onPress={send} busy={busy} />
            <Button kind="ghost" label={t('s_edit')} onPress={() => setConfirming(false)} />
          </Row>
        </Card>
      )}
    </Screen>
  );
}
