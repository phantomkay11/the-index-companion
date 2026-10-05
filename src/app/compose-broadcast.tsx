import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, Chip, Empty, Field, Row, Screen, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { Region } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

const AUDIENCES = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'growers', label: 'Growers' },
  { value: 'neighbors', label: 'Neighbors' },
];
const CHANNELS = [
  { value: 'push', label: 'Phone notification' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'Text message' },
];

/** BFI staff send an announcement to everyone, growers, neighbors or one region. */
export default function ComposeBroadcast() {
  const { isStaff } = useAuth();
  const { colors } = useSettings();
  const regions = useQuery(async () => must(await supabase.from('regions').select('*').order('sort_order')) as Region[]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('everyone');
  const [channels, setChannels] = useState<string[]>(['push', 'email']);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isStaff) return <Screen><Empty>Only BFI staff can send announcements.</Empty></Screen>;

  const linkOk = !linkUrl.trim() || /^https:\/\/\S+$/.test(linkUrl.trim());
  const valid = title.trim().length >= 3 && body.trim().length >= 3 && linkOk;
  const audienceLabel =
    AUDIENCES.find((a) => a.value === audience)?.label ?? regions.data?.find((r) => `region:${r.id}` === audience)?.name ?? audience;

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
    if (error) return Alert.alert('Not sent', error.message);
    Alert.alert('Sent', `Your announcement is going out to ${audienceLabel.toLowerCase()}.`);
    router.back();
  };

  return (
    <Screen>
      <Txt muted>Announcements appear under Messages → From BFI and go out on the channels you pick. Members can turn each channel off.</Txt>
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="Collard Green Gala tickets" maxLength={80} />
      <Field label="Message" value={body} onChangeText={setBody} multiline maxLength={600} placeholder="Keep it short. Texts are cut at about 280 characters." />
      <Row>
        <View style={{ flex: 2, minWidth: 200 }}>
          <Field label="Link (optional)" value={linkUrl} onChangeText={setLinkUrl} autoCapitalize="none" keyboardType="url" placeholder="https://" />
        </View>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Field label="Link label" value={linkText} onChangeText={setLinkText} placeholder="Get tickets" />
        </View>
      </Row>
      {!linkOk ? <Txt variant="small" color={colors.danger}>Links must start with https://</Txt> : null}

      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">Who gets it</Txt>
        <Row gap={6}>
          {AUDIENCES.map((a) => (
            <Chip key={a.value} label={a.label} selected={audience === a.value} onPress={() => setAudience(a.value)} />
          ))}
        </Row>
        <Row gap={6}>
          {(regions.data ?? []).map((r) => (
            <Chip key={r.id} label={r.id === 'intl' ? 'International' : r.name} selected={audience === `region:${r.id}`} onPress={() => setAudience(`region:${r.id}`)} />
          ))}
        </Row>
      </View>

      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">How it’s sent</Txt>
        <Row gap={6}>
          {CHANNELS.map((c) => (
            <Chip
              key={c.value}
              label={c.label}
              selected={channels.includes(c.value)}
              onPress={() => setChannels((prev) => (prev.includes(c.value) ? prev.filter((x) => x !== c.value) : [...prev, c.value]))}
            />
          ))}
        </Row>
        <Txt variant="small" muted>
          Text messages cost money per message. Use them for urgent or important news.
        </Txt>
      </View>

      {!confirming ? (
        <Button label="Review and send" onPress={() => setConfirming(true)} disabled={!valid} />
      ) : (
        <Card tone="sun">
          <Txt variant="bodyBold">Send “{title.trim()}” to {audienceLabel.toLowerCase()}?</Txt>
          <Txt variant="small">
            By {channels.length ? channels.map((c) => CHANNELS.find((x) => x.value === c)?.label.toLowerCase()).join(', ') : 'inbox only'}. This can’t be unsent.
          </Txt>
          <Row>
            <Button label="Send now" icon="megaphone-outline" onPress={send} busy={busy} />
            <Button kind="ghost" label="Edit" onPress={() => setConfirming(false)} />
          </Row>
        </Card>
      )}
    </Screen>
  );
}
