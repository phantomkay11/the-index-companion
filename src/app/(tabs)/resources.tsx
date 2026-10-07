import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { SavedCopyNote } from '@/components/network-banner';
import { Button, Card, Grid, Chip, Empty, ErrorNote, Loading, Row, Screen, Txt } from '@/components/ui';
import { GradientBand, Photo, Scrim } from '@/components/visual';
import { Space } from '@/constants/theme';
import { daysUntil, shortDate } from '@/lib/format';
import { sectionImage } from '@/lib/imagery';
import { useLayout } from '@/lib/layout';
import { supabase } from '@/lib/supabase';
import type { Resource } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';
import type { StringKey } from '@/lib/i18n';

// Filter values match what's stored on each resource; only their labels are translated.
const TYPES = ['Any', 'Produce', 'Meat', 'Honey', 'Eggs', 'Seafood'];
const STAGES = ['Any', 'Starting out', 'Established'];
const FILTER_LABELS: Record<string, StringKey> = {
  Any: 'b_rtAny',
  Produce: 'b_rtProduce',
  Meat: 'b_rtMeat',
  Honey: 'b_rtHoney',
  Eggs: 'b_rtEggs',
  Seafood: 'b_rtSeafood',
  'Starting out': 'b_rsStartingOut',
  Established: 'b_rsEstablished',
};
// Known program kinds; anything else shows as stored.
const KIND_LABELS: Record<string, StringKey> = {
  'BFI program': 'b_rkBfiProgram',
  'Cost-share': 'b_rkCostShare',
  Loan: 'b_rkLoan',
  Land: 'b_rkLand',
  Grant: 'b_rkGrant',
  Support: 'b_rkSupport',
};

export default function Resources() {
  const { colors, t, language } = useSettings();
  const { session, profile } = useAuth();
  const { isTablet } = useLayout();
  const uid = session?.user.id;
  const [type, setType] = useState('Any');
  const [stage, setStage] = useState('Any');

  const q = useQuery(async () => {
    const resources = must(await supabase.from('resources').select('*').order('sort_order')) as Resource[];
    const saved = uid ? (must(await supabase.from('saved_resources').select('resource_id').eq('user_id', uid)) as { resource_id: string }[]) : [];
    return { resources, saved: saved.map((s) => s.resource_id) };
  }, [uid], { cacheKey: `resources:${uid ?? 'anon'}` });

  const fits = (q.data?.resources ?? []).filter((r) => {
    const okType = type === 'Any' || r.farm_types.includes('Any') || r.farm_types.includes(type);
    const okStage = stage === 'Any' || r.stages.includes('Any') || r.stages.includes(stage);
    const okRegion = !r.region_ids || !profile?.region_id || r.region_ids.includes(profile.region_id);
    return okType && okStage && okRegion;
  });

  const kindFrom = (r: Resource) => t('b_kindFrom', { kind: KIND_LABELS[r.kind] ? t(KIND_LABELS[r.kind]) : r.kind, org: r.org });

  const toggleSave = async (r: Resource) => {
    if (!uid) return router.push('/sign-in');
    const saved = q.data?.saved.includes(r.id);
    const res = saved
      ? await supabase.from('saved_resources').delete().eq('resource_id', r.id).eq('user_id', uid)
      : await supabase.from('saved_resources').insert({ resource_id: r.id, user_id: uid });
    if (res.error) showAlert(t('b_notSaved'), res.error.message);
    q.reload();
  };

  const saved = (q.data?.resources ?? []).filter((r) => q.data?.saved.includes(r.id));

  const hero = (
    <Photo picture={sectionImage('resources')} style={{ minHeight: isTablet ? 300 : 230, justifyContent: 'flex-end' }}>
      <Scrim from={0.15} />
      <View style={{ paddingLeft: isTablet ? 48 : 20, paddingRight: 20, paddingTop: 110, paddingBottom: 22, gap: 4 }}>
        <Txt variant="display" color="#ffffff" accessibilityRole="header">
          {t('resourcesHero')}
        </Txt>
        <Txt color="rgba(255,255,255,0.9)">{t('resourcesHeroSub')}</Txt>
      </View>
    </Photo>
  );

  return (
    <Screen width="wide" hero={hero}>
      <Card tone="soft">
        <Txt variant="title">{t('deadlines')}</Txt>
        {!q.data ? (
          q.error ? null : <Loading />
        ) : !saved.length ? (
          <Txt variant="small" muted>
            {t('b_deadlinesEmpty')}
          </Txt>
        ) : (
          saved.map((r) => {
            const left = r.deadline ? daysUntil(r.deadline) : null;
            return (
              <Row key={r.id} style={{ justifyContent: 'space-between' }}>
                <Txt variant="small" style={{ flex: 1 }}>
                  {r.name}
                </Txt>
                <Txt variant="mono">{left === null ? t('b_noDeadline') : left < 0 ? t('b_closed') : t(left === 1 ? 'b_daysLeftOne' : 'b_daysLeftMany', { n: left, date: shortDate(r.deadline!, language) })}</Txt>
              </Row>
            );
          })
        )}
      </Card>

      <View style={{ gap: Space.sm }}>
        <Txt variant="title">{t('whatFits')}</Txt>
        <Txt variant="small" muted>
          {t('b_farmType')}
        </Txt>
        <Row gap={6}>
          {TYPES.map((x) => (
            <Chip key={x} label={t(FILTER_LABELS[x])} selected={type === x} onPress={() => setType(x)} />
          ))}
        </Row>
        <Txt variant="small" muted>
          {t('b_stage')}
        </Txt>
        <Row gap={6}>
          {STAGES.map((x) => (
            <Chip key={x} label={t(FILTER_LABELS[x])} selected={stage === x} onPress={() => setStage(x)} />
          ))}
        </Row>
      </View>

      <SavedCopyNote at={q.cachedAt} />
      {q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : null}
      {!q.data && !q.error ? <Loading /> : null}
      {q.data && !(q.loading && !fits.length) ? (
        <Txt variant="title" accessibilityLiveRegion="polite">
          {t(fits.length === 1 ? 'b_programsFitOne' : 'b_programsFitMany', { n: fits.length })}
        </Txt>
      ) : null}
      {q.data && !fits.length && !q.loading && !q.error ? <Empty>{t('b_noProgramsMatch')}</Empty> : null}

      <Grid>
      {fits.map((r) => {
        const isSaved = q.data?.saved.includes(r.id);
        return (
          // BFI's own programs sit on the brand gradient; public programs on a soft tint.
          r.is_bfi_program ? (
            <GradientBand key={r.id}>
              <Txt variant="smallBold" color="rgba(255,255,255,0.9)">
                {kindFrom(r)}
              </Txt>
              <Txt variant="title" color="#ffffff">
                {r.name}
              </Txt>
              <Txt color="rgba(255,255,255,0.92)">{r.summary}</Txt>
              <Row>
                <Button small kind="inverse" icon="open-outline" label={t('openOnBfi')} onPress={() => WebBrowser.openBrowserAsync(r.url)} />
                <Button small kind="inverse" icon={isSaved ? 'checkmark' : 'bookmark-outline'} label={isSaved ? t('saved') : t('save')} onPress={() => toggleSave(r)} />
              </Row>
            </GradientBand>
          ) : (
            <Card key={r.id}>
              <Txt variant="smallBold" color={colors.forest}>
                {kindFrom(r)}
              </Txt>
              <Txt variant="title">{r.name}</Txt>
              <Txt muted>{r.summary}</Txt>
              <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
                <Pressable onPress={() => WebBrowser.openBrowserAsync(r.url)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Txt variant="bodyBold" color={colors.leaf}>
                    {t('officialSite')}
                  </Txt>
                </Pressable>
                <Button small kind={isSaved ? 'primary' : 'inverse'} icon={isSaved ? 'checkmark' : 'bookmark-outline'} label={isSaved ? t('saved') : t('save')} onPress={() => toggleSave(r)} />
              </Row>
            </Card>
          )
        );
      })}
      </Grid>
      <Txt variant="small" muted>
        {t('b_resourcesFooter')}
      </Txt>
    </Screen>
  );
}
