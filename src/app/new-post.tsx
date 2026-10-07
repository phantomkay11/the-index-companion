import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, Field, Row, Screen, SignInPrompt, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { POST_KINDS } from '@/lib/board';
import { parseLocalDate, ymd } from '@/lib/format';
import type { StringKey } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { PostKind, Region } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';

// Post kinds in the member's language (the stored `kind` stays the id).
const KIND_TEXT = {
  need: { label: 'm_kindNeed', hint: 'm_kindNeedHint' },
  offer: { label: 'm_kindOffer', hint: 'm_kindOfferHint' },
  equipment: { label: 'm_kindEquipment', hint: 'm_kindEquipmentHint' },
  ride: { label: 'm_kindRide', hint: 'm_kindRideHint' },
  bulk: { label: 'm_kindBulk', hint: 'm_kindBulkHint' },
  mentor: { label: 'm_kindMentor', hint: 'm_kindMentorHint' },
} as const satisfies Record<PostKind, { label: StringKey; hint: StringKey }>;

export default function NewPost() {
  const { t } = useSettings();
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
  // Optional, but if given it must be a real day from today on.
  const parsedDay = parseLocalDate(date);
  const dateOk = !date.trim() || (!!parsedDay && date.trim() >= ymd(new Date()));
  const dateHint = dateOk ? undefined : !parsedDay ? t('m_useRealDate') : t('m_pickTodayOrLater');
  const hint = KIND_TEXT[kind] ? t(KIND_TEXT[kind].hint) : POST_KINDS.find((k) => k.id === kind)?.hint;

  const submit = async () => {
    if (busy) return;
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
    if (error) return showAlert(t('m_notPosted'), error.message);
    router.back();
  };

  return (
    <Screen>
      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">{t('m_whatKindOfPost')}</Txt>
        <Row gap={6}>
          {POST_KINDS.map((k) => (
            <Chip key={k.id} label={KIND_TEXT[k.id] ? t(KIND_TEXT[k.id].label) : k.label} icon={k.icon as never} selected={kind === k.id} onPress={() => setKind(k.id)} />
          ))}
        </Row>
        {hint ? <Txt variant="small" muted>{hint}</Txt> : null}
      </View>
      <Field label={t('m_headline')} value={title} onChangeText={setTitle} maxLength={120} placeholder={t('m_headlinePlaceholder')} />
      <Field label={t('m_details')} value={body} onChangeText={setBody} multiline maxLength={2000} placeholder={t('m_detailsPlaceholder')} />
      <Row>
        <View style={{ flex: 2, minWidth: 180 }}>
          <Field label={t('m_whereOptional')} value={place} onChangeText={setPlace} placeholder="Greenwood, MS" />
        </View>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Field label={t('m_dateOptional')} value={date} onChangeText={setDate} placeholder="2026-10-24" keyboardType="numbers-and-punctuation" hint={dateHint} />
        </View>
      </Row>
      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">{t('region')}</Txt>
        <Row gap={6}>
          {(regions.data ?? []).map((r) => (
            <Chip key={r.id} label={r.id === 'intl' ? t('international') : r.name} selected={region === r.id} onPress={() => setRegion(r.id)} />
          ))}
        </Row>
      </View>
      <Button label={t('m_post')} onPress={submit} busy={busy} disabled={title.trim().length < 3 || !dateOk} />
      <Txt variant="small" muted>
        {t('m_displayNameShows')}
      </Txt>
    </Screen>
  );
}
