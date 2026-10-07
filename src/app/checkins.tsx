import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { audienceLabel, useRegions } from '@/components/audience-picker';
import { Button, Card, Empty, ErrorNote, Loading, Pill, Row, Screen, Txt } from '@/components/ui';
import { shortDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Checkin } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { StaffOnly } from '@/components/staff-only';

/** Staff: every check-in, newest first, with a link to its results. */
export default function Checkins() {
  const { isStaff } = useAuth();
  const { t, colors, language } = useSettings();
  const regions = useRegions();
  const list = useQuery(async () => must(await supabase.from('checkins').select('*').order('created_at', { ascending: false }).limit(50)) as Checkin[]);

  if (!isStaff) return <StaffOnly>{t('s_checkinsStaffOnly')}</StaffOnly>;

  return (
    <Screen>
      <Button label={t('sendCheckin')} icon="thunderstorm-outline" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/send-checkin')} />
      {list.loading && !list.data ? <Loading /> : null}
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.data && !list.data.length ? <Empty>{t('s_noCheckins')}</Empty> : null}
      {(list.data ?? []).map((c) => {
        const open = new Date(c.closes_at) > new Date();
        return (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/checkin/[id]', params: { id: c.id } })}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt variant="heading">{c.title}</Txt>
                <Pill label={open ? t('s_open') : t('s_closed')} tone={open ? 'sun' : 'plain'} />
              </Row>
              <Txt variant="mono" color={colors.muted}>
                {t('s_audienceSentOn', { audience: audienceLabel(c.audience, regions.data), date: shortDate(c.created_at, language) })}
              </Txt>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
