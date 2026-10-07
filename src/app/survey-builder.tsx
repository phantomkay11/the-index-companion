import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AudiencePicker, audienceLabel, useRegions } from '@/components/audience-picker';
import { Button, Card, Chip, Field, Row, Screen, ToggleRow, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { randomId } from '@/lib/files';
import { supabase } from '@/lib/supabase';
import { QUESTION_TYPES } from '@/lib/survey';
import type { SurveyQuestion } from '@/lib/types';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';
import { StaffOnly } from '@/components/staff-only';

// Starter questions are saved and sent to members as written, so they stay the same whatever language staff use.
const STARTER: SurveyQuestion[] = [
  { id: 'q1', type: 'scale', prompt: 'How was this growing season for you?', required: true },
  { id: 'q2', type: 'multi', prompt: 'What would help your farm most next year?', options: ['Land access', 'Equipment', 'Cold storage', 'Buyers', 'Funding and grants', 'Training'] },
  { id: 'q3', type: 'text', prompt: 'Anything else BFI should know?' },
];

const WEEKS = [1, 2, 4];

/** BFI staff write a survey, pick who gets it, and save it as a draft or open it right away. */
export default function SurveyBuilder() {
  const { isStaff } = useAuth();
  const { t, colors } = useSettings();
  const regions = useRegions();
  const [title, setTitle] = useState('');
  const [intro, setIntro] = useState('');
  const [audience, setAudience] = useState('growers');
  const [weeks, setWeeks] = useState(2);
  const [questions, setQuestions] = useState<SurveyQuestion[]>(STARTER);
  const [busy, setBusy] = useState<'draft' | 'open' | null>(null);

  if (!isStaff) return <StaffOnly>{t('s_builderStaffOnly')}</StaffOnly>;

  const update = (id: string, patch: Partial<SurveyQuestion>) => setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) =>
    setQuestions((qs) => {
      const next = [...qs];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  const problems = [
    title.trim().length < 3 && t('s_needTitle'),
    !questions.length && t('s_needQuestion'),
    questions.some((q) => !q.prompt.trim()) && t('s_needWording'),
    questions.some((q) => (q.type === 'single' || q.type === 'multi') && (q.options ?? []).filter((o) => o.trim()).length < 2) &&
      t('s_needChoices'),
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
    if (error) return showAlert(t('s_notSaved'), error.message);
    router.replace({ pathname: '/survey/[id]', params: { id: data.id } });
  };

  return (
    <Screen>
      <Txt muted>{t('s_builderIntro')}</Txt>
      <Field label={t('s_title')} value={title} onChangeText={setTitle} maxLength={120} placeholder={t('s_surveyTitlePlaceholder')} />
      <Field label={t('s_whyAsking')} value={intro} onChangeText={setIntro} multiline maxLength={600}
        placeholder={t('s_whyAskingPlaceholder')} />
      <AudiencePicker value={audience} onChange={setAudience} />
      <View style={{ gap: Space.sm }}>
        <Txt variant="smallBold">{t('s_openFor')}</Txt>
        <Row gap={6}>
          {WEEKS.map((w) => (
            <Chip key={w} label={w === 1 ? t('s_weekOne') : t('s_weeksN', { n: w })} selected={weeks === w} onPress={() => setWeeks(w)} />
          ))}
        </Row>
      </View>

      <Txt variant="heading">{t('s_questions')}</Txt>
      {questions.map((q, i) => (
        <Card key={q.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label">{t('s_questionN', { n: i + 1 })}</Txt>
            <Row gap={4} style={{ flexShrink: 1, maxWidth: '100%' }}>
              <Button small kind="ghost" label={t('s_up')} icon="arrow-up" accessibilityLabel={t('s_moveUpA11y', { n: i + 1 })} disabled={i === 0} onPress={() => move(i, -1)} />
              <Button small kind="ghost" label={t('s_down')} icon="arrow-down" accessibilityLabel={t('s_moveDownA11y', { n: i + 1 })} disabled={i === questions.length - 1} onPress={() => move(i, 1)} />
              <Button small kind="ghost" label={t('s_remove')} icon="trash-outline" accessibilityLabel={t('s_removeA11y', { n: i + 1 })} onPress={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))} />
            </Row>
          </Row>
          <Field label={t('s_question')} value={q.prompt} onChangeText={(v) => update(q.id, { prompt: v })} maxLength={240} />
          <Row gap={6}>
            {QUESTION_TYPES.map((qt) => (
              <Chip key={qt.id} label={t(qt.labelKey)} selected={q.type === qt.id} onPress={() => update(q.id, { type: qt.id, options: q.options ?? ['', ''] })} />
            ))}
          </Row>
          {q.type === 'single' || q.type === 'multi' ? (
            <Field
              label={t('s_choicesPerLine')}
              value={(q.options ?? []).join('\n')}
              onChangeText={(v) => update(q.id, { options: v.split('\n') })}
              multiline
            />
          ) : null}
          <ToggleRow label={t('s_required')} value={!!q.required} onChange={(v) => update(q.id, { required: v })} />
        </Card>
      ))}
      <Button kind="ghost" label={t('s_addQuestion')} icon="add-circle-outline" style={{ alignSelf: 'flex-start' }}
        onPress={() => setQuestions((qs) => [...qs, { id: `q${randomId().slice(0, 6)}`, type: 'single', prompt: '', options: ['', ''] }])} />

      {problems.length ? (
        <Txt variant="small" color={colors.danger}>
          {problems.join(' ')}
        </Txt>
      ) : null}
      <Card tone="soft">
        <Txt variant="small">
          {t('s_goesTo', {
            audience: audienceLabel(audience, regions.data).toLowerCase(),
            duration: weeks === 1 ? t('s_weekOne') : t('s_weeksN', { n: weeks }),
          })}
        </Txt>
        <Row>
          <Button label={t('s_openSurveyNow')} icon="send-outline" busy={busy === 'open'} disabled={!!problems.length} onPress={() => save('open')} />
          <Button kind="ghost" label={t('s_saveDraft')} busy={busy === 'draft'} disabled={!!problems.length} onPress={() => save('draft')} />
        </Row>
      </Card>
    </Screen>
  );
}
