import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Share, View } from 'react-native';

import { audienceLabel, useRegions } from '@/components/audience-picker';
import { Button, Card, ErrorNote, Loading, Pill, Row, Screen, Txt, StaffOnly } from '@/components/ui';
import { Radius, Space } from '@/constants/theme';
import { shortDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { summarize, toCsv, type QuestionSummary } from '@/lib/survey';
import type { Survey, SurveyResponse } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

/** Staff: totals for each question, quotable written answers, and a CSV with no names in it. */
export default function SurveyResults() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isStaff } = useAuth();
  const regions = useRegions();
  const [busy, setBusy] = useState(false);
  const survey = useQuery(async () => must(await supabase.from('surveys').select('*').eq('id', id).single()) as Survey, [id]);
  const responses = useQuery(
    async () => must(await supabase.from('survey_responses').select('*').eq('survey_id', id).order('created_at')) as SurveyResponse[],
    [id],
  );

  if (!isStaff) return <StaffOnly message="Only BFI staff can see survey results." />;
  if (!survey.data || !responses.data) {
    const err = survey.error ?? responses.error;
    return err ? <Screen><ErrorNote message={err} onRetry={() => { survey.reload(); responses.reload(); }} /></Screen> : <Loading />;
  }
  const s = survey.data;
  const rs = responses.data;

  const setStatus = async (status: Survey['status']) => {
    if (busy) return;
    // A draft keeps the length it was planned with (say two weeks), counted from the day it opens.
    const patch: Partial<Survey> = { status };
    if (status === 'open' && s.status === 'draft' && s.closes_at) {
      const length = Math.max(86_400_000, new Date(s.closes_at).getTime() - new Date(s.created_at).getTime());
      patch.closes_at = new Date(Date.now() + length).toISOString();
    }
    setBusy(true);
    const { error } = await supabase.from('surveys').update(patch).eq('id', s.id);
    setBusy(false);
    if (error) return Alert.alert('Not changed', error.message);
    survey.reload();
  };

  const exportCsv = async () => {
    const csv = toCsv(s.questions, rs);
    const filename = `${s.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      // Revoking straight away can cancel the download in Safari and Firefox.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return;
    }
    try {
      await Share.share({ title: filename, message: csv });
    } catch {
      await Clipboard.setStringAsync(csv);
      Alert.alert('Copied', 'The results are on your clipboard. Paste them into a spreadsheet.');
    }
  };

  return (
    <Screen>
      <View style={{ gap: Space.xs }}>
        <Row>
          <Pill label={s.status === 'open' ? 'Open' : s.status === 'draft' ? 'Draft' : 'Closed'} tone={s.status === 'open' ? 'sun' : 'plain'} />
          <Txt variant="mono" muted>
            {audienceLabel(s.audience, regions.data)}
            {s.closes_at ? ` · closes ${shortDate(s.closes_at)}` : ''}
          </Txt>
        </Row>
        <Txt variant="title">{s.title}</Txt>
        <Txt variant="heading">
          {rs.length} response{rs.length === 1 ? '' : 's'}
          <Txt muted> · {rs.filter((r) => r.consent_share).length} may be quoted</Txt>
        </Txt>
      </View>
      <Row>
        {s.status === 'draft' ? <Button label="Open survey" icon="send-outline" busy={busy} onPress={() => setStatus('open')} /> : null}
        {s.status === 'open' ? <Button kind="ghost" label="Close survey" icon="lock-closed-outline" busy={busy} onPress={() => setStatus('closed')} /> : null}
        <Button kind="ghost" label="Download CSV" icon="download-outline" disabled={!rs.length} onPress={exportCsv} />
        <Button kind="ghost" label="Refresh" icon="refresh-outline" onPress={responses.reload} />
      </Row>
      <Txt variant="small" muted>
        The CSV has no names. Written answers from members who didn’t agree to be quoted are marked “not shared”.
      </Txt>
      {summarize(s.questions, rs).map((sum, i) => (
        <Summary key={sum.q.id} n={i + 1} sum={sum} total={rs.length} />
      ))}
    </Screen>
  );
}

function Summary({ n, sum, total }: { n: number; sum: QuestionSummary; total: number }) {
  const { colors } = useSettings();
  return (
    <Card>
      <Txt variant="smallBold">
        {n}. {sum.q.prompt}
      </Txt>
      <Txt variant="mono" muted>
        {sum.answered} of {total} answered
        {sum.kind === 'scale' && sum.average != null ? ` · average ${sum.average} of 5` : ''}
      </Txt>
      {sum.kind === 'text' ? (
        <View style={{ gap: Space.sm }}>
          {sum.quotes.map((q, i) => (
            <Txt key={i} style={{ borderLeftWidth: 3, borderLeftColor: colors.leaf, paddingLeft: Space.sm }}>
              “{q}”
            </Txt>
          ))}
          {sum.withheld ? (
            <Txt variant="small" muted>
              {sum.withheld} more written answer{sum.withheld === 1 ? '' : 's'} not shown: those members didn’t agree to be quoted.
            </Txt>
          ) : null}
        </View>
      ) : (
        sum.counts.map((c) => {
          const max = Math.max(1, ...sum.counts.map((x) => x.n));
          return (
            <View key={c.label} accessible accessibilityLabel={`${c.label}: ${c.n}`} style={{ gap: 2 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt variant="small">{c.label}</Txt>
                <Txt variant="mono">{c.n}</Txt>
              </Row>
              <View style={{ height: 8, borderRadius: Radius.sm, backgroundColor: colors.sunk }}>
                <View style={{ width: `${(c.n / max) * 100}%`, height: 8, borderRadius: Radius.sm, backgroundColor: colors.leaf }} />
              </View>
            </View>
          );
        })
      )}
    </Card>
  );
}
