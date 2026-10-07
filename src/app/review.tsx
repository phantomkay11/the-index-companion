import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, Empty, ErrorNote, Loading, Row, Screen, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { categoryLabel, regionLabel } from '@/lib/bfi';
import { shortDate } from '@/lib/format';
import type { StringKey } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { EventRow, Farm } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';
import { StaffOnly } from '@/components/staff-only';

type Report = { id: string; target_type: string; target_id: string; reason: string; created_at: string };

// What a report points at, as stored in reports.target_type, and how to name it.
const TARGET_KEYS: Record<string, StringKey> = {
  farm: 's_target_farm',
  message: 's_target_message',
  event: 's_target_event',
  profile: 's_target_profile',
  post: 's_target_post',
};

/** BFI staff and regional coordinators approve listings and events and work through reports. */
export default function Review() {
  const { isStaff } = useAuth();
  const { t, language } = useSettings();

  const q = useQuery(async () => {
    const farms = must(await supabase.from('farms').select('*').eq('status', 'pending').order('created_at')) as Farm[];
    const events = must(await supabase.from('events').select('*').eq('status', 'pending').order('starts_at')) as EventRow[];
    const reports = must(await supabase.from('reports').select('*').is('resolved_at', null).order('created_at')) as Report[];
    return { farms, events, reports };
  }, [isStaff]);

  if (!isStaff) return <StaffOnly>{t('s_reviewStaffOnly')}</StaffOnly>;
  if (q.error) return <Screen><ErrorNote message={q.error} onRetry={q.reload} /></Screen>;
  if (!q.data) return <Screen><Loading /></Screen>;

  const reviewFarm = async (id: string, status: 'approved' | 'rejected') => {
    const { error } = await supabase.rpc('review_farm', { p_farm_id: id, p_status: status });
    if (error) showAlert(t('s_notSaved'), error.message);
    q.reload();
  };
  const reviewEvent = async (id: string, status: 'approved' | 'rejected') => {
    const { error } = await supabase.rpc('review_event', { p_event_id: id, p_status: status });
    if (error) showAlert(t('s_notSaved'), error.message);
    q.reload();
  };
  const resolve = async (id: string) => {
    const { data } = await supabase.auth.getUser();
    const { error } = await supabase.from('reports').update({ resolved_at: new Date().toISOString(), resolved_by: data.user?.id }).eq('id', id);
    if (error) showAlert(t('s_notSaved'), error.message);
    q.reload();
  };

  return (
    <Screen>
      <Txt variant="label">{t('s_newListings', { n: q.data.farms.length })}</Txt>
      {!q.data.farms.length ? <Empty>{t('s_noListings')}</Empty> : null}
      {q.data.farms.map((f) => (
        <Card key={f.id}>
          <Txt variant="heading">{f.name}</Txt>
          <Txt variant="small" muted>
            {f.city}, {f.state} · {regionLabel(String(f.region_id), t)} · {f.categories.map((c) => categoryLabel(c, t)).join(', ')}
          </Txt>
          {f.story ? <Txt variant="small">{f.story}</Txt> : null}
          <Row>
            <Button small label={t('s_approveVerify')} icon="shield-checkmark-outline" onPress={() => reviewFarm(f.id, 'approved')} />
            <Button small kind="ghost" label={t('s_decline')} onPress={() => reviewFarm(f.id, 'rejected')} />
            <Button small kind="ghost" label={t('s_openAction')} onPress={() => router.push({ pathname: '/farm/[id]', params: { id: f.id } })} />
          </Row>
        </Card>
      ))}

      <Txt variant="label" style={{ marginTop: Space.md }}>
        {t('s_eventsCount', { n: q.data.events.length })}
      </Txt>
      {!q.data.events.length ? <Empty>{t('s_noEventsWaiting')}</Empty> : null}
      {q.data.events.map((e) => (
        <Card key={e.id}>
          <Txt variant="heading">{e.title}</Txt>
          <Txt variant="small" muted>
            {shortDate(e.starts_at, language)} · {e.place} · {e.host_name}
          </Txt>
          <Row>
            <Button small label={t('s_approve')} onPress={() => reviewEvent(e.id, 'approved')} />
            <Button small kind="ghost" label={t('s_decline')} onPress={() => reviewEvent(e.id, 'rejected')} />
          </Row>
        </Card>
      ))}

      <Txt variant="label" style={{ marginTop: Space.md }}>
        {t('s_reportsCount', { n: q.data.reports.length })}
      </Txt>
      {!q.data.reports.length ? <Empty>{t('s_noOpenReports')}</Empty> : null}
      {q.data.reports.map((r) => (
        <Card key={r.id}>
          <Txt variant="smallBold">
            {TARGET_KEYS[r.target_type] ? t(TARGET_KEYS[r.target_type]) : r.target_type} · {shortDate(r.created_at, language)}
          </Txt>
          <Txt variant="small">{r.reason}</Txt>
          <View style={{ flexDirection: 'row', gap: Space.sm }}>
            {r.target_type === 'farm' ? (
              <Button small kind="ghost" label={t('s_openListing')} onPress={() => router.push({ pathname: '/farm/[id]', params: { id: r.target_id } })} />
            ) : null}
            <Button small kind="ghost" label={t('s_markResolved')} onPress={() => resolve(r.id)} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
