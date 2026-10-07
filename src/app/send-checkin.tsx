import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { AudiencePicker, audienceLabel, useRegions } from '@/components/audience-picker';
import { Button, Card, Chip, Field, Row, Screen, Txt, StaffOnly } from '@/components/ui';
import { Space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

const DAYS = [3, 7, 14];

/** BFI staff ask a region "Are you OK?" after a storm, flood, fire or freeze. */
export default function SendCheckin() {
  const { isStaff } = useAuth();
  const regions = useRegions();
  const [title, setTitle] = useState('Are you OK after the storm?');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('');
  const [days, setDays] = useState(7);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!isStaff) return <StaffOnly message="Only BFI staff can send check-ins." />;

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
    if (error) return Alert.alert('Not sent', error.message);
    router.replace({ pathname: '/checkin/[id]', params: { id: data.id } });
  };

  return (
    <Screen>
      <Txt muted>
        Everyone in the area gets a phone notification and, if they’ve opted in, a text. They answer “I’m OK” or “I need help” in one tap,
        or by replying SAFE or NEED to the text. You’ll see who needs help, with their phone number, as answers come in.
      </Txt>
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} />
      <Field
        label="Message (optional)"
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={400}
        placeholder="Hurricane Delta came through southwest Louisiana last night. Let us know how you and your farm are doing."
      />
      <AudiencePicker value={audience} onChange={setAudience} label="Which area" />
      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">Keep it open for</Txt>
        <Row gap={6}>
          {DAYS.map((d) => (
            <Chip key={d} label={`${d} days`} selected={days === d} onPress={() => setDays(d)} />
          ))}
        </Row>
      </View>
      {!confirming ? (
        <Button label="Review and send" onPress={() => setConfirming(true)} disabled={!valid} />
      ) : (
        <Card tone="sun">
          <Txt variant="bodyBold">Send “{title.trim()}” to {who.toLowerCase()}?</Txt>
          <Txt variant="small">By phone notification and text message. Texts cost money per message. This can’t be unsent.</Txt>
          <Row>
            <Button label="Send now" icon="thunderstorm-outline" onPress={send} busy={busy} />
            <Button kind="ghost" label="Edit" onPress={() => setConfirming(false)} />
          </Row>
        </Card>
      )}
    </Screen>
  );
}
