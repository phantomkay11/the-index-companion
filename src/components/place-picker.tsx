import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Field, Row, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { geocode, locate, setHere, useHere } from '@/lib/location';
import { useSettings } from '@/providers/settings';

/** Pick "where I am": phone location, or a typed town or ZIP for people who'd rather not share. */
export function PlacePicker({ compact }: { compact?: boolean }) {
  const { t } = useSettings();
  const here = useHere();
  const [typing, setTyping] = useState(false);
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);

  const useGps = async () => {
    setBusy(true);
    const r = await locate();
    setBusy(false);
    if (r.ok) setHere({ point: r.point, label: r.label });
    else Alert.alert('Location unavailable', r.reason);
  };

  const lookUp = async () => {
    if (!place.trim()) return;
    setBusy(true);
    const r = await geocode(place.trim());
    setBusy(false);
    if (r.ok) {
      setHere({ point: r.point, label: r.label });
      setTyping(false);
    } else Alert.alert('Place not found', r.reason);
  };

  if (here && !typing) {
    return (
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="small" muted style={{ flex: 1 }}>
          Near {here.label ?? 'your location'}
        </Txt>
        <Button small kind="ghost" label="Change" onPress={() => setTyping(true)} />
        <Button small kind="ghost" label="Clear" onPress={() => setHere(null)} />
      </Row>
    );
  }

  return (
    <View style={{ gap: Space.sm }}>
      <Row>
        <Button small={compact} label={t('useMyLocation')} icon="locate-outline" busy={busy && !typing} onPress={useGps} />
        {!typing ? <Button small={compact} kind="ghost" label="Enter a town or ZIP" onPress={() => setTyping(true)} /> : null}
      </Row>
      {typing ? (
        <Row>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Field label="Town and state, or ZIP code" value={place} onChangeText={setPlace} onSubmitEditing={lookUp} placeholder="Lafayette, LA" returnKeyType="search" />
          </View>
          <Button small label="Go" onPress={lookUp} busy={busy} style={{ alignSelf: 'flex-end' }} />
        </Row>
      ) : null}
    </View>
  );
}
