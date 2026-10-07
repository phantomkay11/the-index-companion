import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AudiencePicker, audienceLabel, useRegions } from '@/components/audience-picker';
import { Button, Card, Chip, Empty, Field, Row, Screen, ToggleRow, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { randomId } from '@/lib/files';
import { supabase } from '@/lib/supabase';
import { QUESTION_TYPES } from '@/lib/survey';
import type { SurveyQuestion } from '@/lib/types';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';

const STARTER: SurveyQuestion[] = [
  { id: 'q1', type: 'scale', prompt: 'How was this growing season for you?', required: true },
  { id: 'q2', type: 'multi', prompt: 'What would help your farm most next year?', options: ['Land access', 'Equipment', 'Cold storage', 'Buyers', 'Funding and grants', 'Training'] },
  { id: 'q3', type: 'text', prompt: 'Anything else BFI should know?' },
];

const WEEKS = [1, 2, 4];

/** BFI staff write a survey, pick who gets it, and save it as a draft or open it right away. */
export default function SurveyBuilder() {
  const { isStaff } = useAuth();
  const { colors } = useSettings();
  const regions = useRegions();
  const [title, setTitle] = useState('');
  const [intro, setIntro] = useState('');
  const [audience, setAudience] = useState('growers');
  const [weeks, setWeeks] = useState(2);
  const [questions, setQuestions] = useState<SurveyQuestion[]>(STARTER);
  const [busy, setBusy] = useState<'draft' | 'open' | null>(null);

  if (!isStaff) return <Screen><Empty>Only BFI staff can write surveys.</Empty></Screen>;

  const update = (id: string, patch: Partial<SurveyQuestion>) => setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) =>
    setQuestions((qs) => {
      const next = [...qs];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  const problems = [
    title.trim().length < 3 && 'Add a title.',
    !questions.length && 'Add at least one question.',
    questions.some((q) => !q.prompt.trim()) && 'Every question needs wording.',
    questions.some((q) => (q.type === 'single' || q.type === 'multi') && (q.options ?? []).filter((o) => o.trim()).length < 2) &&
      'Pick-one and pick-any questions need at least two choices.',
  ].filter(Boolean) as string[];

  const save = async (status: 'draft' | 'open') => {
    setBusy(status);
    const clean = questions.map((q) => ({
      ...q,
      prompt: q.prompt.trim(),
      options: q.type === 'single' || q.type === 'multi' ? (q.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined,
    }));
    const { data, error } = await supabase
      .from('surveys')
      .insert({
        title: title.trim(),
        intro: intro.trim(),
        audience,
        questions: clean,
        status,
        closes_at: new Date(Date.now() + weeks * 7 * 86400000).toISOString(),
      })
      .select('id')
      .single();
    setBusy(null);
    if (error) return showAlert('Not saved', error.message);
    router.replace({ pathname: '/survey/[id]', params: { id: data.id } });
  };

  return (
    <Screen>
      <Txt muted>
        Members get a phone notification and email when the survey opens. Keep it short: five questions or fewer gets the most answers.
      </Txt>
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} placeholder="2026 growing season check-in" />
      <Field label="Why you’re asking (shown at the top)" value={intro} onChangeText={setIntro} multiline maxLength={600}
        placeholder="Your answers help BFI make the case for cold storage funding in the next farm bill." />
      <AudiencePicker value={audience} onChange={setAudience} />
      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">Open for</Txt>
        <Row gap={6}>
          {WEEKS.map((w) => (
            <Chip key={w} label={`${w} week${w > 1 ? 's' : ''}`} selected={weeks === w} onPress={() => setWeeks(w)} />
          ))}
        </Row>
      </View>

      <Txt variant="heading">Questions</Txt>
      {questions.map((q, i) => (
        <Card key={q.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label">Question {i + 1}</Txt>
            <Row gap={4}>
              <Button small kind="ghost" label="Up" icon="arrow-up" accessibilityLabel={`Move question ${i + 1} up`} disabled={i === 0} onPress={() => move(i, -1)} />
              <Button small kind="ghost" label="Down" icon="arrow-down" accessibilityLabel={`Move question ${i + 1} down`} disabled={i === questions.length - 1} onPress={() => move(i, 1)} />
              <Button small kind="ghost" label="Remove" icon="trash-outline" accessibilityLabel={`Remove question ${i + 1}`} onPress={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))} />
            </Row>
          </Row>
          <Field label="Question" value={q.prompt} onChangeText={(v) => update(q.id, { prompt: v })} maxLength={240} />
          <Row gap={6}>
            {QUESTION_TYPES.map((qt) => (
              <Chip key={qt.id} label={qt.label} selected={q.type === qt.id} onPress={() => update(q.id, { type: qt.id, options: q.options ?? ['', ''] })} />
            ))}
          </Row>
          {q.type === 'single' || q.type === 'multi' ? (
            <Field
              label="Choices, one per line"
              value={(q.options ?? []).join('\n')}
              onChangeText={(v) => update(q.id, { options: v.split('\n') })}
              multiline
            />
          ) : null}
          <ToggleRow label="Required" value={!!q.required} onChange={(v) => update(q.id, { required: v })} />
        </Card>
      ))}
      <Button kind="ghost" label="Add a question" icon="add-circle-outline" style={{ alignSelf: 'flex-start' }}
        onPress={() => setQuestions((qs) => [...qs, { id: `q${randomId().slice(0, 6)}`, type: 'single', prompt: '', options: ['', ''] }])} />

      {problems.length ? (
        <Txt variant="small" color={colors.danger}>
          {problems.join(' ')}
        </Txt>
      ) : null}
      <Card tone="soft">
        <Txt variant="small">
          Goes to {audienceLabel(audience, regions.data).toLowerCase()} for {weeks} week{weeks > 1 ? 's' : ''}. Answers stay private to BFI staff;
          written answers are only quoted when the member agrees.
        </Txt>
        <Row>
          <Button label="Open survey now" icon="send-outline" busy={busy === 'open'} disabled={!!problems.length} onPress={() => save('open')} />
          <Button kind="ghost" label="Save as draft" busy={busy === 'draft'} disabled={!!problems.length} onPress={() => save('draft')} />
        </Row>
      </Card>
    </Screen>
  );
}
