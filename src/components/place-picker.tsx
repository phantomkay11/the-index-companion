import { useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Row, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { geocode, locate, setHere, useHere } from '@/lib/location';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';

/** Pick "where I am": phone location, or a typed town or ZIP for people who'd rather not share. */
export function PlacePicker({ compact, hideGps }: { compact?: boolean; hideGps?: boolean }) {
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
    else showAlert(t('b_locationUnavailable'), r.reason);
  };

  const lookUp = async () => {
    if (!place.trim()) return;
    setBusy(true);
    const r = await geocode(place.trim());
    setBusy(false);
    if (r.ok) {
      setHere({ point: r.point, label: r.label });
      setTyping(false);
    } else showAlert(t('b_placeNotFound'), r.reason);
  };

  if (here && !typing) {
    return (
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="small" muted style={{ flex: 1 }}>
          {t('b_nearPlace', { place: here.label ?? t('b_yourLocation') })}
        </Txt>
        <Button small kind="ghost" label={t('b_change')} onPress={() => setTyping(true)} />
        <Button small kind="ghost" label={t('b_clear')} onPress={() => setHere(null)} />
      </Row>
    );
  }

  return (
    <View style={{ gap: Space.sm }}>
      <Row>
        {!hideGps ? <Button small={compact} label={t('useMyLocation')} icon="locate-outline" busy={busy && !typing} onPress={useGps} /> : null}
        {!typing ? <Button small={compact} kind="ghost" label={t('enterTown')} onPress={() => setTyping(true)} /> : null}
      </Row>
      {typing ? (
        <Row>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Field label={t('b_townOrZip')} value={place} onChangeText={setPlace} onSubmitEditing={lookUp} placeholder="Lafayette, LA" returnKeyType="search" />
          </View>
          <Button small label={t('b_go')} onPress={lookUp} busy={busy} style={{ alignSelf: 'flex-end' }} />
        </Row>
      ) : null}
    </View>
  );
}
