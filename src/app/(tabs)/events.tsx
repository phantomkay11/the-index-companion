import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { SavedCopyNote } from '@/components/network-banner';
import { Button, Card, Chip, Empty, ErrorNote, Loading, Pill, Provenance, Row, Screen, Txt } from '@/components/ui';
import { Radius, Space } from '@/constants/theme';
import { monthDay, timeOfDay } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { EventRow, Rsvp, Shift } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

type Data = { events: EventRow[]; rsvps: Rsvp[]; shifts: Shift[]; mySignups: string[] };

export default function Events() {
  const { colors, t } = useSettings();
  const { session } = useAuth();
  const uid = session?.user.id;

  const q = useQuery<Data>(async () => {
    const events = must(
      await supabase
        .from('events')
        .select('*')
        .gte('starts_at', new Date(Date.now() - 6 * 3600_000).toISOString())
        .order('starts_at')
        .limit(100),
    ) as EventRow[];
    const ids = events.map((e) => e.id);
    const shifts = ids.length ? (must(await supabase.from('shift_availability').select('*').in('event_id', ids)) as Shift[]) : [];
    if (!uid) return { events, shifts, rsvps: [], mySignups: [] };
    const rsvps = must(await supabase.from('event_rsvps').select('*').eq('user_id', uid)) as Rsvp[];
    const signups = must(await supabase.from('shift_signups').select('shift_id').eq('user_id', uid)) as { shift_id: string }[];
    return { events, shifts, rsvps, mySignups: signups.map((s) => s.shift_id) };
  }, [uid], { cacheKey: `events:${uid ?? 'anon'}` });

  const requireSignIn = () => {
    router.push('/sign-in');
  };

  const toggleRsvp = async (e: EventRow) => {
    if (!uid) return requireSignIn();
    const going = q.data?.rsvps.some((r) => r.event_id === e.id);
    const res = going
      ? await supabase.from('event_rsvps').delete().eq('event_id', e.id).eq('user_id', uid)
      : await supabase.from('event_rsvps').insert({ event_id: e.id, user_id: uid });
    if (res.error) Alert.alert('RSVP not saved', res.error.message);
    q.reload();
  };

  const setReminder = async (r: Rsvp, key: 'remind_push' | 'remind_sms' | 'remind_email') => {
    const { error } = await supabase.from('event_rsvps').update({ [key]: !r[key] }).eq('event_id', r.event_id).eq('user_id', r.user_id);
    if (error) Alert.alert('Reminder not saved', error.message);
    q.reload();
  };

  const toggleShift = async (s: Shift) => {
    if (!uid) return requireSignIn();
    const mine = q.data?.mySignups.includes(s.id);
    const res = mine
      ? await supabase.from('shift_signups').delete().eq('shift_id', s.id).eq('user_id', uid)
      : await supabase.from('shift_signups').insert({ shift_id: s.id, user_id: uid });
    if (res.error) Alert.alert('Sign-up not saved', res.error.message);
    q.reload();
  };

  return (
    <Screen>
      {session ? (
        <Button kind="ghost" label={t('postEvent')} icon="add-circle-outline" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/post-event')} />
      ) : null}
      <SavedCopyNote at={q.cachedAt} />
      {q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : null}
      {!q.data && !q.error ? <Loading /> : null}
      {q.data && !q.data.events.length ? <Empty>No upcoming events yet.</Empty> : null}
      {q.data?.events.map((e) => {
        const { month, day } = monthDay(e.starts_at);
        const rsvp = q.data!.rsvps.find((r) => r.event_id === e.id);
        const shifts = q.data!.shifts.filter((s) => s.event_id === e.id);
        const featured = !e.is_sample && e.host_name === 'Black Farmers Index' && !!e.ticket_url;
        return (
          <Card key={e.id} tone={featured ? 'soft' : 'plain'} style={[styles.event, e.status === 'pending' && { borderStyle: 'dashed' }]}>
            <View style={[styles.date, { backgroundColor: colors.sunk, borderColor: colors.line }]} accessibilityLabel={`${month} ${day}`}>
              <Txt variant="label" color={colors.leaf}>
                {month}
              </Txt>
              <Txt variant="mono" style={{ fontSize: 22, lineHeight: 26 }}>
                {day}
              </Txt>
            </View>
            <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
              <Row gap={6}>
                <Pill label={e.type} tone="leaf" />
                {e.status === 'pending' ? <Pill label="Waiting for BFI approval" tone="sun" /> : null}
                <Provenance sample={e.is_sample} />
              </Row>
              <Txt variant="heading">{e.title}</Txt>
              <Txt variant="small" muted>
                {e.place} · {timeOfDay(e.starts_at)}
              </Txt>
              {e.description ? <Txt variant="small">{e.description}</Txt> : null}
              <Txt variant="small" muted>
                Hosted by {e.host_name}
              </Txt>
              {e.ticket_url ? (
                <Pressable onPress={() => WebBrowser.openBrowserAsync(e.ticket_url!)} accessibilityRole="link" style={{ minHeight: 36, justifyContent: 'center' }}>
                  <Txt variant="bodyBold" color={colors.leaf}>
                    {e.ticket_label ?? 'Tickets'}
                  </Txt>
                </Pressable>
              ) : null}
              {e.status === 'approved' ? (
                <Button
                  small
                  kind={rsvp ? 'primary' : 'ghost'}
                  icon={rsvp ? 'checkmark' : undefined}
                  label={rsvp ? t('going') : t('rsvp')}
                  style={{ alignSelf: 'flex-start' }}
                  onPress={() => toggleRsvp(e)}
                />
              ) : null}
              {rsvp ? (
                <Row gap={6}>
                  <Txt variant="small" muted>
                    {t('remindMe')}
                  </Txt>
                  <Chip label="Push" selected={rsvp.remind_push} onPress={() => setReminder(rsvp, 'remind_push')} />
                  <Chip label="Text" selected={rsvp.remind_sms} onPress={() => setReminder(rsvp, 'remind_sms')} />
                  <Chip label="Email" selected={rsvp.remind_email} onPress={() => setReminder(rsvp, 'remind_email')} />
                </Row>
              ) : null}
              {shifts.length ? (
                <View style={{ gap: 6, marginTop: 4 }}>
                  <Txt variant="label">Volunteer shifts</Txt>
                  {shifts.map((s) => {
                    const mine = q.data!.mySignups.includes(s.id);
                    return (
                      <Row key={s.id} style={[styles.shift, { borderTopColor: colors.line }]}>
                        <Txt variant="small" style={{ flex: 1 }}>
                          <Txt variant="smallBold">{s.label}</Txt> · {s.open_spots} open
                        </Txt>
                        <Button small kind={mine ? 'primary' : 'ghost'} label={mine ? 'Signed up' : 'Sign up'} disabled={!mine && s.open_spots <= 0} onPress={() => toggleShift(s)} />
                      </Row>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </Card>
        );
      })}
      <Txt variant="small" muted>
        Farmers post their own events. BFI or a regional coordinator approves them before they go public.
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  event: { flexDirection: 'row', gap: Space.md, alignItems: 'flex-start' },
  date: { width: 56, borderWidth: 1, borderRadius: Radius.sm, alignItems: 'center', paddingVertical: 6 },
  shift: { justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 6 },
});
