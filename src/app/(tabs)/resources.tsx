import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

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
import { openLink } from '@/lib/links';

const TYPES = ['Any', 'Produce', 'Meat', 'Honey', 'Eggs', 'Seafood'];
const STAGES = ['Any', 'Starting out', 'Established'];

export default function Resources() {
  const { colors, t } = useSettings();
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

  const saving = useRef(new Set<string>());
  const toggleSave = async (r: Resource) => {
    if (!uid) return router.push('/sign-in');
    if (saving.current.has(r.id)) return; // a double tap sends one request
    saving.current.add(r.id);
    const saved = q.data?.saved.includes(r.id);
    const res = saved
      ? await supabase.from('saved_resources').delete().eq('resource_id', r.id).eq('user_id', uid)
      : await supabase.from('saved_resources').upsert({ resource_id: r.id, user_id: uid }, { onConflict: 'user_id,resource_id', ignoreDuplicates: true });
    if (res.error) Alert.alert('Not saved', res.error.message);
    await q.reload();
    saving.current.delete(r.id);
  };

  const saved = (q.data?.resources ?? []).filter((r) => q.data?.saved.includes(r.id));

  const hero = (
    <Photo picture={sectionImage('resources')} creditTop={10} style={{ height: isTablet ? 300 : 230 }}>
      <Scrim from={0.15} />
      <View style={{ position: 'absolute', left: isTablet ? 48 : 20, right: 20, bottom: 22, gap: 4 }}>
        <Txt variant="display" color="#ffffff">
          Money, land and know-how
        </Txt>
        <Txt color="rgba(255,255,255,0.9)">Programs matched to your farm, with deadline reminders.</Txt>
      </View>
    </Photo>
  );

  return (
    <Screen width="wide" hero={hero}>
      <Card tone="soft">
        <Txt variant="title">{t('deadlines')}</Txt>
        {!saved.length ? (
          <Txt variant="small" muted>
            Save a program below to keep it here. When BFI adds a deadline, you get reminders 30, 7 and 1 day before.
          </Txt>
        ) : (
          saved.map((r) => {
            const left = r.deadline ? daysUntil(r.deadline) : null;
            return (
              <Row key={r.id} style={{ justifyContent: 'space-between' }}>
                <Txt variant="small" style={{ flex: 1 }}>
                  {r.name}
                </Txt>
                <Txt variant="mono">{left === null ? 'No deadline set' : left < 0 ? 'Closed' : `${left} days · ${shortDate(r.deadline!)}`}</Txt>
              </Row>
            );
          })
        )}
      </Card>

      <View style={{ gap: Space.sm }}>
        <Txt variant="title">{t('whatFits')}</Txt>
        <Txt variant="small" muted>
          Farm type
        </Txt>
        <Row gap={6}>
          {TYPES.map((x) => (
            <Chip key={x} label={x} selected={type === x} onPress={() => setType(x)} />
          ))}
        </Row>
        <Txt variant="small" muted>
          Stage
        </Txt>
        <Row gap={6}>
          {STAGES.map((x) => (
            <Chip key={x} label={x} selected={stage === x} onPress={() => setStage(x)} />
          ))}
        </Row>
      </View>

      <SavedCopyNote at={q.cachedAt} />
      {q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : null}
      {!q.data && !q.error ? <Loading /> : null}
      {q.data ? (
        <Txt variant="title" accessibilityLiveRegion="polite">
          {fits.length} programs fit
        </Txt>
      ) : null}
      {q.data && !fits.length ? <Empty>No programs match. Try “Any”.</Empty> : null}

      <Grid>
      {fits.map((r) => {
        const isSaved = q.data?.saved.includes(r.id);
        return (
          // BFI's own programs sit on the brand gradient; public programs on a soft tint.
          r.is_bfi_program ? (
            <GradientBand key={r.id}>
              <Txt variant="smallBold" color="rgba(255,255,255,0.9)">
                {r.kind} from {r.org}
              </Txt>
              <Txt variant="title" color="#ffffff">
                {r.name}
              </Txt>
              <Txt color="rgba(255,255,255,0.92)">{r.summary}</Txt>
              <Row>
                <Button small kind="inverse" icon="open-outline" label="Open on BFI site" onPress={() => openLink(r.url)} />
                <Button small kind="inverse" icon={isSaved ? 'checkmark' : 'bookmark-outline'} label={isSaved ? t('saved') : t('save')} onPress={() => toggleSave(r)} />
              </Row>
            </GradientBand>
          ) : (
            <Card key={r.id}>
              <Txt variant="smallBold" color={colors.onSoft}>
                {r.kind} from {r.org}
              </Txt>
              <Txt variant="title">{r.name}</Txt>
              <Txt muted>{r.summary}</Txt>
              <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
                <Pressable onPress={() => openLink(r.url)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Txt variant="bodyBold" color={colors.leaf}>
                    Official site
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
        Summaries are in plain language. Each program sets its own rules and deadlines, so check the official site before applying.
      </Txt>
    </Screen>
  );
}
