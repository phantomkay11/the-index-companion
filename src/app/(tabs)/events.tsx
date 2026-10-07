import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon as Ionicons } from '@/components/icon';

import { SavedCopyNote } from '@/components/network-banner';
import { Button, Grid, Chip, Empty, ErrorNote, Loading, Pill, Row, Screen, Txt } from '@/components/ui';
import { GlassChip, Photo, Scrim } from '@/components/visual';
import { Radius, Space } from '@/constants/theme';
import { monthDay, timeOfDay } from '@/lib/format';
import { eventImage, sectionImage } from '@/lib/imagery';
import { useLayout } from '@/lib/layout';
import { supabase } from '@/lib/supabase';
import type { EventRow, Rsvp, Shift } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';
import type { StringKey } from '@/lib/i18n';

// Event types are stored in English; only the chip text is translated.
const TYPE_LABELS: Record<string, StringKey> = {
  'Farm day': 'b_evtFarmDay',
  Market: 'b_evtMarket',
  Workshop: 'b_evtWorkshop',
  Volunteer: 'b_evtVolunteer',
  'Town hall': 'b_evtTownHall',
};

type Data = { events: EventRow[]; rsvps: Rsvp[]; shifts: Shift[]; mySignups: string[] };

export default function Events() {
  const { colors, t, language } = useSettings();
  const { session } = useAuth();
  const { isTablet } = useLayout();
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

  // One save at a time per event or shift: a quick second tap would insert a duplicate.
  const saving = useRef(new Set<string>());
  const once = async (id: string, work: () => Promise<void>) => {
    if (saving.current.has(id)) return;
    saving.current.add(id);
    try {
      await work();
    } finally {
      saving.current.delete(id);
    }
  };

  const toggleRsvp = (e: EventRow) => once(`e:${e.id}`, async () => {
    if (!uid) return requireSignIn();
    const going = q.data?.rsvps.some((r) => r.event_id === e.id);
    const res = going
      ? await supabase.from('event_rsvps').delete().eq('event_id', e.id).eq('user_id', uid)
      : await supabase.from('event_rsvps').insert({ event_id: e.id, user_id: uid });
    if (res.error) showAlert(t('b_rsvpNotSaved'), res.error.message);
    await q.reload();
  });

  const setReminder = (r: Rsvp, key: 'remind_push' | 'remind_sms' | 'remind_email') => once(`r:${r.event_id}:${key}`, async () => {
    const { error } = await supabase.from('event_rsvps').update({ [key]: !r[key] }).eq('event_id', r.event_id).eq('user_id', r.user_id);
    if (error) showAlert(t('b_reminderNotSaved'), error.message);
    await q.reload();
  });

  const toggleShift = (s: Shift) => once(`s:${s.id}`, async () => {
    if (!uid) return requireSignIn();
    const mine = q.data?.mySignups.includes(s.id);
    const res = mine
      ? await supabase.from('shift_signups').delete().eq('shift_id', s.id).eq('user_id', uid)
      : await supabase.from('shift_signups').insert({ shift_id: s.id, user_id: uid });
    if (res.error) showAlert(t('b_signupNotSaved'), res.error.message);
    await q.reload();
  });

  const hero = (
    <Photo picture={sectionImage('events')} style={{ minHeight: isTablet ? 300 : 230, justifyContent: 'flex-end' }}>
      <Scrim from={0.15} />
      <View style={[styles.heroCopy, isTablet && { paddingHorizontal: 48 }]}>
        <Txt variant="display" color="#ffffff" accessibilityRole="header">
          {t('eventsHero')}
        </Txt>
        <Txt color="rgba(255,255,255,0.9)">{t('eventsHeroSub')}</Txt>
      </View>
    </Photo>
  );

  return (
    <Screen width="wide" hero={hero}>
      {session ? (
        <Button kind="ghost" label={t('postEvent')} icon="add-circle-outline" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/post-event')} />
      ) : null}
      <SavedCopyNote at={q.cachedAt} />
      {q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : null}
      {!q.data && !q.error ? <Loading /> : null}
      {q.data && !q.data.events.length ? <Empty>{t('b_noEvents')}</Empty> : null}
      <Grid gap={Space.xl}>
        {q.data?.events.map((e) => {
          const { month, day } = monthDay(e.starts_at, language);
          const rsvp = q.data!.rsvps.find((r) => r.event_id === e.id);
          const shifts = q.data!.shifts.filter((s) => s.event_id === e.id);
          return (
            <View key={e.id} style={{ gap: 12, opacity: e.status === 'pending' ? 0.85 : 1 }}>
              <Photo picture={eventImage(e.type)} rounded={Radius.xl} style={{ aspectRatio: 16 / 9 }}>
                <Scrim from={0.55} />
                <View style={[styles.date, { backgroundColor: colors.surface }]} accessible accessibilityLabel={`${month} ${day}`}>
                  <Txt variant="smallBold" color={colors.leaf} style={{ fontSize: 12 }}>
                    {month}
                  </Txt>
                  <Txt variant="display" style={{ fontSize: 26, lineHeight: 28 }}>
                    {day}
                  </Txt>
                </View>
                <View style={styles.chips}>
                  <GlassChip>
                    <Txt variant="smallBold" color="#0b4a2f" style={{ fontSize: 12.5 }}>
                      {TYPE_LABELS[e.type] ? t(TYPE_LABELS[e.type]) : e.type}
                    </Txt>
                  </GlassChip>
                  {e.is_sample ? (
                    <View style={styles.sample}>
                      <Txt variant="smallBold" color="#ffffff" style={{ fontSize: 12 }}>
                        {t('sample')}
                      </Txt>
                    </View>
                  ) : (
                    <GlassChip>
                      <Ionicons name="checkmark-circle" size={14} color={colors.real} />
                      <Txt variant="smallBold" color={colors.real} style={{ fontSize: 12.5 }}>
                        {t('fromBfi')}
                      </Txt>
                    </GlassChip>
                  )}
                </View>
                <Txt variant="small" color="rgba(255,255,255,0.95)" style={styles.place}>
                  {e.place}, {timeOfDay(e.starts_at, language)}
                </Txt>
              </Photo>
              <View style={{ gap: 6, paddingHorizontal: 4 }}>
                {e.status === 'pending' ? <Pill label={t('b_waitingApproval')} tone="sun" /> : null}
                <Txt variant="title">{e.title}</Txt>
                {e.description ? <Txt muted>{e.description}</Txt> : null}
                <Txt variant="small" muted>
                  {t('b_hostedBy', { name: e.host_name })}
                </Txt>
                <Row style={{ marginTop: 4 }}>
                  {e.status === 'approved' ? (
                    <Button
                      small
                      kind={rsvp ? 'primary' : 'ghost'}
                      icon={rsvp ? 'checkmark' : 'calendar-outline'}
                      label={rsvp ? t('going') : t('rsvp')}
                      onPress={() => toggleRsvp(e)}
                    />
                  ) : null}
                  {e.ticket_url ? (
                    <Button small kind="ghost" icon="ticket-outline" label={e.ticket_label ?? t('b_tickets')} onPress={() => WebBrowser.openBrowserAsync(e.ticket_url!)} />
                  ) : null}
                </Row>
                {rsvp ? (
                  <Row gap={6}>
                    <Txt variant="small" muted>
                      {t('remindMe')}
                    </Txt>
                    <Chip label={t('b_remindPush')} selected={rsvp.remind_push} onPress={() => setReminder(rsvp, 'remind_push')} />
                    <Chip label={t('b_remindText')} selected={rsvp.remind_sms} onPress={() => setReminder(rsvp, 'remind_sms')} />
                    <Chip label={t('email')} selected={rsvp.remind_email} onPress={() => setReminder(rsvp, 'remind_email')} />
                  </Row>
                ) : null}
                {shifts.length ? (
                  <View style={[styles.shifts, { backgroundColor: colors.sunk }]}>
                    <Txt variant="heading">{t('volunteerShifts')}</Txt>
                    {shifts.map((s) => {
                      const mine = q.data!.mySignups.includes(s.id);
                      return (
                        <Row key={s.id} style={{ justifyContent: 'space-between' }}>
                          <Txt variant="small" style={{ flex: 1 }}>
                            <Txt variant="smallBold">{s.label}</Txt>, {t(s.open_spots === 1 ? 'b_spotsOpenOne' : 'b_spotsOpenMany', { n: s.open_spots })}
                          </Txt>
                          <Button small kind={mine ? 'primary' : 'inverse'} label={mine ? t('signedUp') : t('signUp')} disabled={!mine && s.open_spots <= 0} onPress={() => toggleShift(s)} />
                        </Row>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </Grid>
      <Txt variant="small" muted>
        {t('b_eventsFooter')}
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCopy: { paddingHorizontal: 20, paddingTop: 110, paddingBottom: 22, gap: 4 },
  date: { position: 'absolute', top: 12, left: 12, width: 58, borderRadius: Radius.md, alignItems: 'center', paddingVertical: 6 },
  chips: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 6 },
  sample: { backgroundColor: 'rgba(6,24,15,0.72)', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.85)', borderRadius: Radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  place: { position: 'absolute', left: 14, right: 14, bottom: 12 },
  shifts: { borderRadius: Radius.lg, padding: 14, gap: 10, marginTop: 4 },
});
