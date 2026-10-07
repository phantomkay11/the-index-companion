import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Chip, Field, Row, Screen, SignInPrompt, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { validDate as isValidDate, validTime } from '@/lib/format';

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

  // "2026-02-31" or "24:00" would quietly roll over to another day, so check the date really exists.
  const whenOk = isValidDate(date, { notPast: true }) && validTime(time);
  const valid = title.trim() && place.trim() && whenOk;

  const submit = async () => {
    if (busy) return;
    if (!whenOk) return Alert.alert('Check the date', 'Use a real date that hasn’t passed, like 2026-10-24, and a time like 10:00.');
    const startsAt = new Date(`${date.trim()}T${time.trim().padStart(5, '0')}:00`);
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
    if (error) return Alert.alert('Event not sent', error.message);
    Alert.alert('Sent to BFI', 'Your event will appear for everyone once BFI approves it.');
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
