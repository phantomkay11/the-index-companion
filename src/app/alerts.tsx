import { useState } from 'react';
import { View } from 'react-native';

import { PlacePicker } from '@/components/place-picker';
import { Button, Card, Chip, Empty, ErrorNote, Field, Loading, Row, Screen, SignInPrompt, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { useHere } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import type { SavedAlert } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';

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
    if (!here) return showAlert(t('m_choosePlaceFirst'), t('m_choosePlaceHint'));
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
    if (error) return showAlert(t('m_alertNotSaved'), error.message);
    setKeyword('');
    alerts.reload();
  };

  const remove = async (a: SavedAlert) => {
    const { error } = await supabase.from('saved_alerts').delete().eq('id', a.id);
    if (error) showAlert(t('m_notRemoved'), error.message);
    alerts.reload();
  };

  return (
    <Screen>
      <Txt muted>{t('m_alertsIntro')}</Txt>

      <Card>
        <Txt variant="label">{t('m_newAlert')}</Txt>
        <Field label={t('m_lookingFor')} value={keyword} onChangeText={setKeyword} placeholder={t('m_alertPlaceholder')} maxLength={60} />
        <View style={{ gap: Space.sm }}>
          <Txt variant="smallBold">{t('m_within')}</Txt>
          <Row gap={6}>
            {RADII.map((r) => (
              <Chip key={r} label={t('m_nMiles', { n: r })} selected={radius === r} onPress={() => setRadius(r)} />
            ))}
          </Row>
        </View>
        <PlacePicker compact />
        <Button label={t('m_saveAlert')} icon="notifications-outline" onPress={add} busy={busy} disabled={keyword.trim().length < 2 || !here} />
      </Card>

      <Txt variant="label">{t('nearMeAlerts')}</Txt>
      {alerts.error ? <ErrorNote message={alerts.error} onRetry={alerts.reload} /> : null}
      {!alerts.data && !alerts.error ? <Loading /> : null}
      {alerts.data && !alerts.data.length ? <Empty>{t('m_noAlerts')}</Empty> : null}
      {alerts.data?.map((a) => (
        <Card key={a.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt variant="heading">{a.keyword}</Txt>
              <Txt variant="small" muted>
                {t('m_withinMilesOf', { n: a.radius_miles, place: a.place_label ?? t('m_yourSavedLocation') })}
              </Txt>
            </View>
            <Button small kind="ghost" label={t('m_remove')} onPress={() => remove(a)} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
