import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, Chip, Empty, ErrorNote, Field, Loading, Row, Screen, SignInPrompt, ToggleRow, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { confirmThen } from '@/lib/alert-web';
import { shortDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { missingRequired, SCALE } from '@/lib/survey';
import type { Survey, SurveyAnswer, SurveyQuestion, SurveyResponse } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

/** A member answers a BFI survey. Answers can be changed until it closes, or withdrawn. */
export default function SurveyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, isStaff } = useAuth();
  const { t } = useSettings();

  const survey = useQuery(async () => must(await supabase.from('surveys').select('*').eq('id', id).maybeSingle()) as Survey | null, [id]);
  const mine = useQuery(
    async () =>
      session
        ? (must(await supabase.from('survey_responses').select('*').eq('survey_id', id).eq('user_id', session.user.id).maybeSingle()) as SurveyResponse | null)
        : null,
    [id, session?.user.id],
  );

  if (!session) return <Screen><SignInPrompt /></Screen>;
  // Errors first: a bad link or no connection must not leave the spinner up forever.
  if (survey.error || mine.error) {
    return <Screen><ErrorNote message={survey.error ?? mine.error!} onRetry={() => { survey.reload(); mine.reload(); }} /></Screen>;
  }
  if ((survey.loading && !survey.data) || mine.data === undefined) return <Loading />;
  const s = survey.data;
  if (!s) return <Screen><Empty>This survey isn’t for you, or it has been removed.</Empty></Screen>;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('surveys') }} />
      <View style={{ gap: Space.xs }}>
        <Txt variant="label">Survey from BFI</Txt>
        <Txt variant="title">{s.title}</Txt>
        {s.intro ? <Txt>{s.intro}</Txt> : null}
        <Txt variant="mono" muted>
          {s.questions.length} question{s.questions.length === 1 ? '' : 's'}
          {s.closes_at ? ` · open until ${shortDate(s.closes_at)}` : ''}
          {s.status === 'draft' ? ' · draft, only staff can see it' : ''}
        </Txt>
      </View>
      {isStaff ? (
        <Button small kind="ghost" label="See results" icon="stats-chart-outline" style={{ alignSelf: 'flex-start' }}
          onPress={() => router.push({ pathname: '/survey-results/[id]', params: { id: s.id } })} />
      ) : null}
      <Form
        key={mine.data?.updated_at ?? 'new'}
        survey={s}
        mine={mine.data}
        initialAnswers={mine.data ? mine.data.answers : {}}
        initialConsent={mine.data ? mine.data.consent_share : false}
        onSaved={mine.reload}
      />
    </Screen>
  );
}

// Initial values arrive as separate props: reading optional fields of `mine` inside useState
// trips a React Compiler memoization bug when `mine` is null.
function Form({
  survey,
  mine,
  initialAnswers,
  initialConsent,
  onSaved,
}: {
  survey: Survey;
  mine: SurveyResponse | null;
  initialAnswers: Record<string, SurveyAnswer>;
  initialConsent: boolean;
  onSaved: () => void;
}) {
  const { t, colors } = useSettings();
  const userId = useAuth().session?.user.id ?? '';
  const [answers, setAnswers] = useState<Record<string, SurveyAnswer>>(initialAnswers);
  const [consent, setConsent] = useState(initialConsent);
  const [busy, setBusy] = useState(false);
  const open = survey.status === 'open' && (!survey.closes_at || new Date(survey.closes_at) > new Date());
  const missing = missingRequired(survey.questions, answers);

  const set = (q: SurveyQuestion, a: SurveyAnswer | undefined) =>
    setAnswers((prev) => {
      const next = { ...prev };
      if (a === undefined) delete next[q.id];
      else next[q.id] = a;
      return next;
    });

  const submit = async () => {
    if (busy) return;
    if (missing) return Alert.alert('One more', `Please answer: ${missing.prompt}`);
    setBusy(true);
    const { error } = await supabase
      .from('survey_responses')
      .upsert({ survey_id: survey.id, answers, consent_share: consent }, { onConflict: 'survey_id,user_id' });
    setBusy(false);
    if (error) return Alert.alert('Not sent', error.message);
    onSaved();
  };

  const withdraw = () =>
    confirmThen('Withdraw your answers?', 'BFI will no longer see or count them. You can answer again while the survey is open.', 'Withdraw', async () => {
      setBusy(true);
      const { error } = await supabase.from('survey_responses').delete().eq('survey_id', survey.id).eq('user_id', userId);
      setBusy(false);
      if (error) return Alert.alert('Not removed', error.message);
      onSaved();
    });

  return (
    <View style={{ gap: Space.lg }}>
      {mine ? (
        <Card tone="leaf">
          <Txt variant="bodyBold">Thank you. Your answers are in.</Txt>
          <Txt variant="small">{open ? 'You can change them until the survey closes.' : 'This survey has closed.'}</Txt>
        </Card>
      ) : !open ? (
        <Empty>This survey has closed.</Empty>
      ) : null}

      {survey.questions.map((q, i) => (
        <Question key={q.id} n={i + 1} q={q} value={answers[q.id]} onChange={(a) => set(q, a)} disabled={!open} />
      ))}

      <Card>
        <Txt variant="smallBold">How BFI uses your answers</Txt>
        <Txt variant="small" color={colors.muted}>
          BFI staff can see your answers with your name, so they can follow up if you ask for help. In reports and when speaking up for
          growers, BFI shares totals only. Your written answers are never quoted unless you say yes below, and even then without your name.
        </Txt>
        <ToggleRow
          label="BFI may quote my written answers without my name"
          value={consent}
          onChange={setConsent}
        />
      </Card>

      {open ? (
        <Row>
          <Button label={mine ? 'Update my answers' : t('submitAnswers')} icon="send-outline" busy={busy} onPress={submit} />
          {mine ? <Button kind="ghost" label="Withdraw my answers" disabled={busy} onPress={withdraw} /> : null}
        </Row>
      ) : null}
    </View>
  );
}

function Question({
  n,
  q,
  value,
  onChange,
  disabled,
}: {
  n: number;
  q: SurveyQuestion;
  value: SurveyAnswer | undefined;
  onChange: (a: SurveyAnswer | undefined) => void;
  disabled: boolean;
}) {
  const prompt = `${n}. ${q.prompt}${q.required ? ' *' : ''}`;
  if (q.type === 'text') {
    return (
      <Field
        label={prompt}
        value={typeof value === 'string' ? value : ''}
        onChangeText={(v) => onChange(v ? v : undefined)}
        multiline
        maxLength={2000}
        editable={!disabled}
      />
    );
  }
  return (
    <View style={{ gap: Space.sm }} accessibilityRole={q.type === 'single' || q.type === 'scale' ? 'radiogroup' : undefined} accessibilityLabel={prompt}>
      <Txt variant="smallBold">{prompt}</Txt>
      {q.type === 'scale' ? (
        <>
          <Row gap={6}>
            {SCALE.map((x) => (
              <Chip key={x} label={String(x)} selected={value === x} onPress={() => !disabled && onChange(value === x ? undefined : x)} />
            ))}
          </Row>
          <Txt variant="small" muted>
            1 is poor, 5 is excellent
          </Txt>
        </>
      ) : (
        <Row gap={6}>
          {(q.options ?? []).map((o) => {
            const picked = q.type === 'multi' ? Array.isArray(value) && value.includes(o) : value === o;
            const toggle = () => {
              if (disabled) return;
              if (q.type === 'single') return onChange(picked ? undefined : o);
              const list = Array.isArray(value) ? value : [];
              const next = picked ? list.filter((x) => x !== o) : [...list, o];
              onChange(next.length ? next : undefined);
            };
            return <Chip key={o} label={o} selected={picked} onPress={toggle} />;
          })}
        </Row>
      )}
      {q.type === 'multi' ? (
        <Txt variant="small" muted>
          Pick any that apply
        </Txt>
      ) : null}
    </View>
  );
}
