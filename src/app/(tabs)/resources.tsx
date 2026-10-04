import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Button, Card, Chip, Empty, ErrorNote, Loading, Pill, Provenance, Row, Screen, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { daysUntil, shortDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Resource } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

const TYPES = ['Any', 'Produce', 'Meat', 'Honey', 'Eggs', 'Seafood'];
const STAGES = ['Any', 'Starting out', 'Established'];

export default function Resources() {
  const { colors, t } = useSettings();
  const { session, profile } = useAuth();
  const uid = session?.user.id;
  const [type, setType] = useState('Any');
  const [stage, setStage] = useState('Any');

  const q = useQuery(async () => {
    const resources = must(await supabase.from('resources').select('*').order('sort_order')) as Resource[];
    const saved = uid ? (must(await supabase.from('saved_resources').select('resource_id').eq('user_id', uid)) as { resource_id: string }[]) : [];
    return { resources, saved: saved.map((s) => s.resource_id) };
  }, [uid]);

  const fits = (q.data?.resources ?? []).filter((r) => {
    const okType = type === 'Any' || r.farm_types.includes('Any') || r.farm_types.includes(type);
    const okStage = stage === 'Any' || r.stages.includes('Any') || r.stages.includes(stage);
    const okRegion = !r.region_ids || !profile?.region_id || r.region_ids.includes(profile.region_id);
    return okType && okStage && okRegion;
  });

  const toggleSave = async (r: Resource) => {
    if (!uid) return router.push('/sign-in');
    const saved = q.data?.saved.includes(r.id);
    const res = saved
      ? await supabase.from('saved_resources').delete().eq('resource_id', r.id).eq('user_id', uid)
      : await supabase.from('saved_resources').insert({ resource_id: r.id, user_id: uid });
    if (res.error) Alert.alert('Not saved', res.error.message);
    q.reload();
  };

  const saved = (q.data?.resources ?? []).filter((r) => q.data?.saved.includes(r.id));

  return (
    <Screen>
      <Card tone="soft">
        <Txt variant="label">{t('deadlines')}</Txt>
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
        <Txt variant="label">{t('whatFits')}</Txt>
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

      {q.error ? <ErrorNote message={q.error} onRetry={q.reload} /> : null}
      {!q.data && !q.error ? <Loading /> : null}
      {q.data ? (
        <Txt variant="small" muted>
          {fits.length} programs fit
        </Txt>
      ) : null}
      {q.data && !fits.length ? <Empty>No programs match. Try “Any”.</Empty> : null}

      {fits.map((r) => {
        const isSaved = q.data?.saved.includes(r.id);
        return (
          <Card key={r.id} style={r.is_bfi_program ? { borderColor: colors.leaf } : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Pill label={r.kind} tone="leaf" />
              {r.is_bfi_program ? <Provenance sample={false} /> : <Txt variant="small" muted>{r.org}</Txt>}
            </Row>
            <Txt variant="heading">{r.name}</Txt>
            <Txt variant="small">{r.summary}</Txt>
            <Row style={{ justifyContent: 'space-between' }}>
              <Pressable onPress={() => WebBrowser.openBrowserAsync(r.url)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
                <Txt variant="bodyBold" color={colors.leaf}>
                  {r.is_bfi_program ? 'Open on BFI site' : 'Official site'}
                </Txt>
              </Pressable>
              <Button small kind={isSaved ? 'primary' : 'ghost'} icon={isSaved ? 'checkmark' : 'bookmark-outline'} label={isSaved ? t('saved') : t('save')} onPress={() => toggleSave(r)} />
            </Row>
          </Card>
        );
      })}
      <Txt variant="small" muted>
        Summaries are in plain language. Each program sets its own rules and deadlines, so check the official site before applying.
      </Txt>
    </Screen>
  );
}
