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
  const { t, colors, language } = useSettings();
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
      <Txt muted>{t('s_surveysIntro')}</Txt>
      {isStaff ? (
        <Button label={t('s_writeSurvey')} icon="add-circle-outline" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/survey-builder')} />
      ) : null}
      {list.loading && !list.data ? <Loading /> : null}
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {list.data && !list.data.surveys.length ? <Empty>{t('s_noSurveys')}</Empty> : null}
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
                {done ? (
                  <Pill label={t('s_answered')} tone="leaf" icon="checkmark" />
                ) : open ? (
                  <Pill label={t('s_surveyOpenPill')} tone="sun" />
                ) : (
                  <Pill label={s.status === 'draft' ? t('s_draft') : t('s_surveyClosedPill')} />
                )}
              </Row>
              <Txt variant="mono" color={colors.muted}>
                {s.questions.length === 1 ? t('s_questionsOne') : t('s_questionsN', { n: s.questions.length })}
                {s.closes_at && open ? ` · ${t('s_untilDate', { date: shortDate(s.closes_at, language) })}` : ''}
                {isStaff ? ` · ${audienceLabel(s.audience, regions.data)}` : ''}
              </Txt>
              {isStaff ? (
                <Button small kind="ghost" label={t('s_results')} icon="stats-chart-outline" style={{ alignSelf: 'flex-start' }}
                  onPress={() => router.push({ pathname: '/survey-results/[id]', params: { id: s.id } })} />
              ) : null}
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
