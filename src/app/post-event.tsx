import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, Field, Row, Screen, SignInPrompt, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { showAlert } from '@/lib/alert';

const TYPES = ['Farm day', 'Market', 'Workshop', 'Volunteer', 'Town hall'];

export default function PostEvent() {
  const { session, myFarm, profile } = useAuth();
  const [title, setTitle] = useState('');
  const [type, setType] = useState(TYPES[0]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [place, setPlace] = useState(myFarm ? `${myFarm.name} · ${myFarm.city}, ${myFarm.state}` : '');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  if (!session) return <Screen><SignInPrompt /></Screen>;

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{1,2}:\d{2}$/.test(time);
  const valid = title.trim() && place.trim() && validDate;

  const submit = async () => {
    const startsAt = new Date(`${date}T${time.padStart(5, '0')}:00`);
    if (Number.isNaN(startsAt.getTime())) return showAlert('Check the date', 'Use year-month-day, like 2026-10-24, and a time like 10:00.');
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
    if (error) return showAlert('Event not sent', error.message);
    showAlert('Sent to BFI', 'Your event will appear for everyone once BFI approves it.');
    router.back();
  };

  return (
    <Screen>
      <Txt muted>BFI or a regional coordinator approves events before they go public.</Txt>
      <Field label="Event name" value={title} onChangeText={setTitle} placeholder="U-pick sweet potatoes" />
      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">Type</Txt>
        <Row gap={6}>
          {TYPES.map((x) => (
            <Chip key={x} label={x} selected={type === x} onPress={() => setType(x)} />
          ))}
        </Row>
      </View>
      <Row>
        <View style={{ flex: 2, minWidth: 160 }}>
          <Field label="Date (year-month-day)" value={date} onChangeText={setDate} placeholder="2026-10-24" keyboardType="numbers-and-punctuation" />
        </View>
        <View style={{ flex: 1, minWidth: 100 }}>
          <Field label="Start time" value={time} onChangeText={setTime} placeholder="10:00" keyboardType="numbers-and-punctuation" />
        </View>
      </Row>
      <Field label="Where" value={place} onChangeText={setPlace} />
      <Field label="Details (optional)" value={description} onChangeText={setDescription} multiline />
      <Button label="Send for approval" onPress={submit} busy={busy} disabled={!valid} />
    </Screen>
  );
}
