import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, Field, Row, Screen, SignInPrompt, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { parseLocalDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { StringKey } from '@/lib/i18n';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';

// The stored event type stays in English; this is only what the member sees.
const TYPES: { value: string; label: StringKey }[] = [
  { value: 'Farm day', label: 'm_evFarmDay' },
  { value: 'Market', label: 'm_evMarket' },
  { value: 'Workshop', label: 'm_evWorkshop' },
  { value: 'Volunteer', label: 'm_evVolunteer' },
  { value: 'Town hall', label: 'm_evTownHall' },
];

export default function PostEvent() {
  const { t } = useSettings();
  const { session, myFarm, profile } = useAuth();
  const [title, setTitle] = useState('');
  const [type, setType] = useState(TYPES[0].value);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [place, setPlace] = useState(myFarm ? `${myFarm.name} · ${myFarm.city}, ${myFarm.state}` : '');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  if (!session) return <Screen><SignInPrompt /></Screen>;

  // A real calendar day and a real 24-hour time, in the future (events in the past never show).
  const day = parseLocalDate(date);
  const hm = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  const timeOk = !!hm && Number(hm[1]) < 24 && Number(hm[2]) < 60;
  const startsAt = day && timeOk ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(hm![1]), Number(hm![2])) : null;
  // eslint-disable-next-line react-hooks/purity
  const future = !!startsAt && startsAt.getTime() > Date.now();
  const dateHint = !date.trim() ? undefined : !day ? t('m_useRealDate') : startsAt && !future ? t('m_pickFutureDateTime') : undefined;
  const timeHint = time.trim() && !timeOk ? t('m_use24h') : undefined;
  const valid = title.trim() && place.trim() && future;

  const submit = async () => {
    if (busy || !startsAt || !future) return;
    setBusy(true);
    const { error } = await supabase.from('events').insert({
      title: title.trim(),
      type,
      starts_at: startsAt.toISOString(),
      place: place.trim(),
      description: description.trim() || null,
      region_id: myFarm?.region_id ?? profile?.region_id ?? null,
      host_name: myFarm?.name ?? profile?.display_name ?? 'Index member',
      host_farm_id: myFarm?.id ?? null,
    });
    setBusy(false);
    if (error) return showAlert(t('m_eventNotSent'), error.message);
    showAlert(t('m_sentToBfi'), t('m_eventSentBody'));
    router.back();
  };

  return (
    <Screen>
      <Txt muted>{t('m_eventsApproved')}</Txt>
      <Field label={t('m_eventName')} value={title} onChangeText={setTitle} placeholder={t('m_eventNamePlaceholder')} />
      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">{t('m_type')}</Txt>
        <Row gap={6}>
          {TYPES.map((x) => (
            <Chip key={x.value} label={t(x.label)} selected={type === x.value} onPress={() => setType(x.value)} />
          ))}
        </Row>
      </View>
      <Row>
        <View style={{ flex: 2, minWidth: 160 }}>
          <Field label={t('m_dateYmd')} value={date} onChangeText={setDate} placeholder="2026-10-24" keyboardType="numbers-and-punctuation" hint={dateHint} />
        </View>
        <View style={{ flex: 1, minWidth: 100 }}>
          <Field label={t('m_startTime')} value={time} onChangeText={setTime} placeholder="10:00" keyboardType="numbers-and-punctuation" hint={timeHint} />
        </View>
      </Row>
      <Field label={t('m_where')} value={place} onChangeText={setPlace} />
      <Field label={t('m_detailsOptional')} value={description} onChangeText={setDescription} multiline />
      <Button label={t('m_sendForApproval')} onPress={submit} busy={busy} disabled={!valid} />
    </Screen>
  );
}
