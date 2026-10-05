import { useState } from 'react';
import { Alert, View } from 'react-native';

import { PlacePicker } from '@/components/place-picker';
import { Button, Card, Chip, Empty, ErrorNote, Field, Loading, Row, Screen, SignInPrompt, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { useHere } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import type { SavedAlert } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

const RADII = [10, 25, 50, 100];

/** "Tell me when honey is fresh within 25 miles." */
export default function Alerts() {
  const { t } = useSettings();
  const { session } = useAuth();
  const here = useHere();
  const [keyword, setKeyword] = useState('');
  const [radius, setRadius] = useState(25);
  const [busy, setBusy] = useState(false);

  const alerts = useQuery(
    async () => (session ? (must(await supabase.from('saved_alerts').select('*').eq('user_id', session.user.id).order('created_at')) as SavedAlert[]) : []),
    [session?.user.id],
  );

  if (!session) return <Screen><SignInPrompt /></Screen>;

  const add = async () => {
    if (!here) return Alert.alert('Choose a place first', 'Use your location or enter a town so we know what “near” means.');
    setBusy(true);
    const { error } = await supabase.from('saved_alerts').insert({
      user_id: session.user.id,
      keyword: keyword.trim(),
      lat: here.point.lat,
      lon: here.point.lon,
      place_label: here.label,
      radius_miles: radius,
    });
    setBusy(false);
    if (error) return Alert.alert('Alert not saved', error.message);
    setKeyword('');
    alerts.reload();
  };

  const remove = async (a: SavedAlert) => {
    const { error } = await supabase.from('saved_alerts').delete().eq('id', a.id);
    if (error) Alert.alert('Not removed', error.message);
    alerts.reload();
  };

  return (
    <Screen>
      <Txt muted>We’ll tell you when a farm near you marks something fresh. Your location is saved only with the alert, and only you can see it.</Txt>

      <Card>
        <Txt variant="label">New alert</Txt>
        <Field label="What are you looking for?" value={keyword} onChangeText={setKeyword} placeholder="Honey, okra, pastured eggs…" maxLength={60} />
        <View style={{ gap: Space.sm }}>
          <Txt variant="smallBold">Within</Txt>
          <Row gap={6}>
            {RADII.map((r) => (
              <Chip key={r} label={`${r} miles`} selected={radius === r} onPress={() => setRadius(r)} />
            ))}
          </Row>
        </View>
        <PlacePicker compact />
        <Button label="Save alert" icon="notifications-outline" onPress={add} busy={busy} disabled={keyword.trim().length < 2 || !here} />
      </Card>

      <Txt variant="label">{t('nearMeAlerts')}</Txt>
      {alerts.error ? <ErrorNote message={alerts.error} onRetry={alerts.reload} /> : null}
      {!alerts.data && !alerts.error ? <Loading /> : null}
      {alerts.data && !alerts.data.length ? <Empty>No alerts yet.</Empty> : null}
      {alerts.data?.map((a) => (
        <Card key={a.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt variant="heading">{a.keyword}</Txt>
              <Txt variant="small" muted>
                Within {a.radius_miles} miles of {a.place_label ?? 'your saved location'}
              </Txt>
            </View>
            <Button small kind="ghost" label="Remove" onPress={() => remove(a)} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
