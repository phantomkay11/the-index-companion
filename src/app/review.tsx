import { router } from 'expo-router';
import { Alert, View } from 'react-native';

import { Button, Card, Empty, ErrorNote, Loading, Row, Screen, Txt, StaffOnly } from '@/components/ui';
import { Space } from '@/constants/theme';
import { shortDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { EventRow, Farm } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';

type Report = { id: string; target_type: string; target_id: string; reason: string; created_at: string };

/** BFI staff and regional coordinators approve listings and events and work through reports. */
export default function Review() {
  const { isStaff } = useAuth();

  const q = useQuery(async () => {
    const farms = must(await supabase.from('farms').select('*').eq('status', 'pending').order('created_at')) as Farm[];
    const events = must(await supabase.from('events').select('*').eq('status', 'pending').order('starts_at')) as EventRow[];
    const reports = must(await supabase.from('reports').select('*').is('resolved_at', null).order('created_at')) as Report[];
    return { farms, events, reports };
  }, [isStaff]);

  if (!isStaff) return <StaffOnly message="Only BFI staff and regional coordinators can see the review queue." />;
  if (q.error) return <Screen><ErrorNote message={q.error} onRetry={q.reload} /></Screen>;
  if (!q.data) return <Screen><Loading /></Screen>;

  const reviewFarm = async (id: string, status: 'approved' | 'rejected') => {
    const { error } = await supabase.rpc('review_farm', { p_farm_id: id, p_status: status });
    if (error) Alert.alert('Not saved', error.message);
    q.reload();
  };
  const reviewEvent = async (id: string, status: 'approved' | 'rejected') => {
    const { error } = await supabase.rpc('review_event', { p_event_id: id, p_status: status });
    if (error) Alert.alert('Not saved', error.message);
    q.reload();
  };
  const resolve = async (id: string) => {
    const { data } = await supabase.auth.getUser();
    const { error } = await supabase.from('reports').update({ resolved_at: new Date().toISOString(), resolved_by: data.user?.id }).eq('id', id);
    if (error) Alert.alert('Not saved', error.message);
    q.reload();
  };

  return (
    <Screen>
      <Txt variant="label">New farm listings · {q.data.farms.length}</Txt>
      {!q.data.farms.length ? <Empty>No listings waiting.</Empty> : null}
      {q.data.farms.map((f) => (
        <Card key={f.id}>
          <Txt variant="heading">{f.name}</Txt>
          <Txt variant="small" muted>
            {f.city}, {f.state} · Region {f.region_id} · {f.categories.join(', ')}
          </Txt>
          {f.story ? <Txt variant="small">{f.story}</Txt> : null}
          <Row>
            <Button small label="Approve and verify" icon="shield-checkmark-outline" onPress={() => reviewFarm(f.id, 'approved')} />
            <Button small kind="ghost" label="Decline" onPress={() => reviewFarm(f.id, 'rejected')} />
            <Button small kind="ghost" label="Open" onPress={() => router.push({ pathname: '/farm/[id]', params: { id: f.id } })} />
          </Row>
        </Card>
      ))}

      <Txt variant="label" style={{ marginTop: Space.md }}>
        Events · {q.data.events.length}
      </Txt>
      {!q.data.events.length ? <Empty>No events waiting.</Empty> : null}
      {q.data.events.map((e) => (
        <Card key={e.id}>
          <Txt variant="heading">{e.title}</Txt>
          <Txt variant="small" muted>
            {shortDate(e.starts_at)} · {e.place} · {e.host_name}
          </Txt>
          <Row>
            <Button small label="Approve" onPress={() => reviewEvent(e.id, 'approved')} />
            <Button small kind="ghost" label="Decline" onPress={() => reviewEvent(e.id, 'rejected')} />
          </Row>
        </Card>
      ))}

      <Txt variant="label" style={{ marginTop: Space.md }}>
        Reports · {q.data.reports.length}
      </Txt>
      {!q.data.reports.length ? <Empty>No open reports.</Empty> : null}
      {q.data.reports.map((r) => (
        <Card key={r.id}>
          <Txt variant="smallBold">
            {r.target_type} · {shortDate(r.created_at)}
          </Txt>
          <Txt variant="small">{r.reason}</Txt>
          <View style={{ flexDirection: 'row', gap: Space.sm }}>
            {r.target_type === 'farm' ? (
              <Button small kind="ghost" label="Open listing" onPress={() => router.push({ pathname: '/farm/[id]', params: { id: r.target_id } })} />
            ) : null}
            <Button small kind="ghost" label="Mark resolved" onPress={() => resolve(r.id)} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
