import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, Field, Row, Screen, SignInPrompt, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { POST_KINDS } from '@/lib/board';
import { supabase } from '@/lib/supabase';
import type { PostKind, Region } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { showAlert } from '@/lib/alert';

export default function NewPost() {
  const { session, profile, myFarm } = useAuth();
  const regions = useQuery(async () => must(await supabase.from('regions').select('*').order('sort_order')) as Region[]);
  const [kind, setKind] = useState<PostKind>('need');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [regionChoice, setRegion] = useState<string | null>(null);
  const [place, setPlace] = useState(myFarm ? `${myFarm.city}, ${myFarm.state}` : '');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  if (!session) return <Screen><SignInPrompt /></Screen>;
  const region = regionChoice ?? myFarm?.region_id ?? profile?.region_id ?? null;
  const dateOk = !date.trim() || /^\d{4}-\d{2}-\d{2}$/.test(date.trim());
  const hint = POST_KINDS.find((k) => k.id === kind)?.hint;

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.from('posts').insert({
      author_id: session.user.id,
      kind,
      title: title.trim(),
      body: body.trim(),
      region_id: region,
      location_text: place.trim() || null,
      happens_on: date.trim() || null,
    });
    setBusy(false);
    if (error) return showAlert('Not posted', error.message);
    router.back();
  };

  return (
    <Screen>
      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">What kind of post?</Txt>
        <Row gap={6}>
          {POST_KINDS.map((k) => (
            <Chip key={k.id} label={k.label} icon={k.icon as never} selected={kind === k.id} onPress={() => setKind(k.id)} />
          ))}
        </Row>
        {hint ? <Txt variant="small" muted>{hint}</Txt> : null}
      </View>
      <Field label="Headline" value={title} onChangeText={setTitle} maxLength={120} placeholder="Need 3 people for sweet potato harvest" />
      <Field label="Details" value={body} onChangeText={setBody} multiline maxLength={2000} placeholder="What, when, and anything people should bring or know" />
      <Row>
        <View style={{ flex: 2, minWidth: 180 }}>
          <Field label="Where (optional)" value={place} onChangeText={setPlace} placeholder="Greenwood, MS" />
        </View>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Field label="Date (optional)" value={date} onChangeText={setDate} placeholder="2026-10-24" keyboardType="numbers-and-punctuation" />
        </View>
      </Row>
      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">Region</Txt>
        <Row gap={6}>
          {(regions.data ?? []).map((r) => (
            <Chip key={r.id} label={r.id === 'intl' ? 'International' : r.name} selected={region === r.id} onPress={() => setRegion(r.id)} />
          ))}
        </Row>
      </View>
      <Button label="Post" onPress={submit} busy={busy} disabled={title.trim().length < 3 || !dateOk} />
      <Txt variant="small" muted>
        Your display name shows on the post. People reply to you privately in Messages.
      </Txt>
    </Screen>
  );
}
