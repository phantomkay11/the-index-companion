import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { audienceLabel, useRegions } from '@/components/audience-picker';
import { Button, Card, Empty, ErrorNote, Loading, Pill, Row, Screen, SignInPrompt, Txt } from '@/components/ui';
import { shortDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Survey } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

/** Surveys from BFI for this member (staff also see drafts and results). */
export default function Surveys() {
  const { session, isStaff } = useAuth();
  const { colors } = useSettings();
  const regions = useRegions();
  const list = useQuery(
    async () => {
      if (!session) return { surveys: [] as Survey[], answered: new Set<string>() };
      const surveys = must(await supabase.from('surveys').select('*').order('created_at', { ascending: false }).limit(50)) as Survey[];
      const mine = must(await supabase.from('survey_responses').select('survey_id').eq('user_id', session.user.id)) as { survey_id: string }[];
      return { surveys, answered: new Set(mine.map((m) => m.survey_id)) };
    },
    [session?.user.id],
  );

  if (!session) return <Screen><SignInPrompt /></Screen>;

  return (
    <Screen>
      <Txt muted>BFI asks members a few questions now and then. Totals help them speak up for Black growers with funders and lawmakers.</Txt>
      {isStaff ? (
        <Button label="Write a survey" icon="add-circle-outline" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/survey-builder')} />
      ) : null}
      {list.loading && !list.data ? <Loading /> : null}
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.data && !list.data.surveys.length ? <Empty>No surveys right now.</Empty> : null}
      {(list.data?.surveys ?? []).map((s) => {
        const open = s.status === 'open' && (!s.closes_at || new Date(s.closes_at) > new Date());
        const done = list.data!.answered.has(s.id);
        return (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/survey/[id]', params: { id: s.id } })}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt variant="heading" style={{ flex: 1 }}>{s.title}</Txt>
                {done ? <Pill label="Answered" tone="leaf" icon="checkmark" /> : open ? <Pill label="Open" tone="sun" /> : <Pill label={s.status === 'draft' ? 'Draft' : 'Closed'} />}
              </Row>
              <Txt variant="mono" color={colors.muted}>
                {s.questions.length} questions{s.closes_at && open ? ` · until ${shortDate(s.closes_at)}` : ''}
                {isStaff ? ` · ${audienceLabel(s.audience, regions.data)}` : ''}
              </Txt>
              {isStaff ? (
                <Button small kind="ghost" label="Results" icon="stats-chart-outline" style={{ alignSelf: 'flex-start' }}
                  onPress={() => router.push({ pathname: '/survey-results/[id]', params: { id: s.id } })} />
              ) : null}
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
