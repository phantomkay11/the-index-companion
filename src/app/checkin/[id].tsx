import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { audienceLabel, useRegions } from '@/components/audience-picker';
import { Icon as Ionicons } from '@/components/icon';
import { Button, Card, Empty, ErrorNote, Field, Loading, Pill, Row, Screen, SignInPrompt, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { shortDate, timeOfDay } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Checkin, CheckinReport, CheckinResponse } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';

/** "Are you OK?" after a storm: members answer in one tap; BFI staff see who needs help. */
export default function CheckinScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, isStaff } = useAuth();
  const { t, colors, language } = useSettings();
  const regions = useRegions();

  const checkin = useQuery(async () => must(await supabase.from('checkins').select('*').eq('id', id).maybeSingle()) as Checkin | null, [id]);
  const mine = useQuery(
    async () =>
      session
        ? (must(await supabase.from('checkin_responses').select('*').eq('checkin_id', id).eq('user_id', session.user.id).maybeSingle()) as CheckinResponse | null)
        : null,
    [id, session?.user.id],
  );

  if (!session) return <Screen><SignInPrompt /></Screen>;
  if (checkin.loading && !checkin.data) return <Loading />;
  if (checkin.error) return <Screen><ErrorNote message={checkin.error} onRetry={checkin.reload} /></Screen>;
  const c = checkin.data;
  if (!c) return <Screen><Empty>{t('s_checkinMissing')}</Empty></Screen>;
  const open = new Date(c.closes_at) > new Date();

  return (
    <Screen>
      <Stack.Screen options={{ title: t('checkIn') }} />
      <Card tone="sun">
        <Row>
          <Ionicons name="thunderstorm-outline" size={22} color={colors.onSun} />
          <Pill label={audienceLabel(c.audience, regions.data)} tone="sun" />
        </Row>
        <Txt variant="title">{c.title}</Txt>
        {c.message ? <Txt>{c.message}</Txt> : null}
        <Txt variant="mono" muted>
          {open
            ? t('s_checkinMetaOpen', { date: shortDate(c.created_at, language), until: shortDate(c.closes_at, language) })
            : t('s_checkinMetaClosed', { date: shortDate(c.created_at, language) })}
        </Txt>
      </Card>

      {mine.loading && mine.data === undefined ? <Loading /> : (
        <Answer
          key={mine.data?.updated_at ?? 'new'}
          checkin={c}
          mine={mine.data ?? null}
          initialStatus={mine.data ? mine.data.status : null}
          initialNote={mine.data ? mine.data.note : ''}
          open={open}
          onSaved={mine.reload}
        />
      )}

      <Card>
        <Txt variant="smallBold">{t('emergency911')}</Txt>
        <Txt variant="small" muted>
          {t('emergencyHint')}
        </Txt>
      </Card>

      {isStaff ? <Report checkinId={c.id} /> : null}
    </Screen>
  );
}

function Answer({
  checkin,
  mine,
  initialStatus,
  initialNote,
  open,
  onSaved,
}: {
  checkin: Checkin;
  mine: CheckinResponse | null;
  initialStatus: CheckinResponse['status'] | null;
  initialNote: string;
  open: boolean;
  onSaved: () => void;
}) {
  const { t, colors, language } = useSettings();
  const [status, setStatus] = useState(initialStatus);
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);

  const save = async (next: 'ok' | 'need_help') => {
    setBusy(true);
    const { error } = await supabase
      .from('checkin_responses')
      .upsert({ checkin_id: checkin.id, status: next, note: next === 'need_help' ? note.trim() : '', via: 'app' }, { onConflict: 'checkin_id,user_id' });
    setBusy(false);
    if (error) return showAlert(t('s_notSent'), error.message);
    onSaved();
  };

  if (!open) {
    return mine ? (
      <Txt>{t('s_youAnswered', { answer: mine.status === 'ok' ? t('imSafe') : t('needHelp') })}</Txt>
    ) : (
      <Empty>{t('s_checkinClosedEmpty')}</Empty>
    );
  }

  return (
    <View style={{ gap: Space.md }}>
      {mine ? (
        <Card tone={mine.status === 'ok' ? 'leaf' : 'soft'}>
          <Txt variant="bodyBold">
            {mine.status === 'ok' ? t('thanksOk') : t('thanksHelp')}
          </Txt>
          <Txt variant="mono" muted>
            {t(mine.via === 'sms' ? 's_sentByTextCanChange' : 's_sentCanChange', {
              when: `${shortDate(mine.updated_at, language)} ${timeOfDay(mine.updated_at, language)}`,
            })}
          </Txt>
        </Card>
      ) : null}
      <Row>
        <Button label={t('imSafe')} icon="checkmark-circle-outline" busy={busy && status === 'ok'} onPress={() => { setStatus('ok'); save('ok'); }} style={{ flexGrow: 1 }} />
        <Button
          kind={status === 'need_help' ? 'primary' : 'ghost'}
          label={t('needHelp')}
          icon="hand-left-outline"
          onPress={() => setStatus('need_help')}
          style={{ flexGrow: 1 }}
        />
      </Row>
      {status === 'need_help' ? (
        <View style={{ gap: Space.sm }}>
          <Field
            label={t('whatDoYouNeed')}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={1000}
            placeholder={t('s_needPlaceholder')}
          />
          <Button label={t('sendToBfi')} icon="send-outline" busy={busy} onPress={() => save('need_help')} />
          <Txt variant="small" color={colors.muted}>
            {t('s_needPrivacy')}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

function Report({ checkinId }: { checkinId: string }) {
  const { t, colors, language } = useSettings();
  const report = useQuery(async () => {
    const { data, error } = await supabase.rpc('checkin_report', { p_checkin: checkinId });
    if (error) throw new Error(error.message);
    return data as CheckinReport;
  }, [checkinId]);

  if (report.loading && !report.data) return <Loading />;
  if (report.error) return <ErrorNote message={report.error} onRetry={report.reload} />;
  const r = report.data!;
  const noAnswer = Math.max(0, r.reached - r.ok - r.need_help);

  return (
    <View style={{ gap: Space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="heading">{t('s_checkinResults')}</Txt>
        <Button small kind="ghost" label={t('s_refresh')} icon="refresh-outline" onPress={report.reload} />
      </Row>
      <Row>
        <Stat n={r.need_help} label={t('s_statNeedHelp')} color={colors.danger} />
        <Stat n={r.ok} label={t('s_statOk')} color={colors.leaf} />
        <Stat n={noAnswer} label={t('s_statNoAnswer')} color={colors.muted} />
      </Row>
      {r.needs.length ? (
        r.needs.map((n) => (
          <Card key={n.user_id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="bodyBold">{n.name}</Txt>
              <Txt variant="mono" muted>
                {shortDate(n.updated_at, language)} {timeOfDay(n.updated_at, language)}
                {n.via === 'sms' ? ` · ${t('s_byTextShort')}` : ''}
              </Txt>
            </Row>
            <Txt>{n.note || t('s_noDetails')}</Txt>
            {n.phone ? (
              <Row>
                <Button small label={t('s_call')} icon="call-outline" onPress={() => Linking.openURL(`tel:${n.phone}`)} />
                <Button small kind="ghost" label={t('s_text')} icon="chatbubble-outline" onPress={() => Linking.openURL(`sms:${n.phone}`)} />
              </Row>
            ) : (
              <Txt variant="small" muted>
                {t('s_noPhone')}
              </Txt>
            )}
          </Card>
        ))
      ) : (
        <Empty>{t('s_noOneNeedsHelp')}</Empty>
      )}
    </View>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <Card style={{ flexGrow: 1, minWidth: 100, alignItems: 'center' }}>
      <Txt variant="display" color={color}>
        {n}
      </Txt>
      <Txt variant="small" muted>
        {label}
      </Txt>
    </Card>
  );
}
