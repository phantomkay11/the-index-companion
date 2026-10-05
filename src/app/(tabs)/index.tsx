import { Icon as Ionicons } from '@/components/icon';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { FarmCard } from '@/components/farm-card';
import { FarmMap } from '@/components/farm-map';
import { SavedCopyNote } from '@/components/network-banner';
import { PlacePicker } from '@/components/place-picker';
import { Button, Card, Chip, Empty, ErrorNote, Loading, Pill, Row, Screen, Segmented, Txt } from '@/components/ui';
import { Radius, Space } from '@/constants/theme';
import { BFI, CATEGORIES } from '@/lib/bfi';
import { miles, useHere } from '@/lib/location';
import { supabase } from '@/lib/supabase';
import type { Farm, Region } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

export default function Discover() {
  const { colors, t, textScale, saveData } = useSettings();
  const { myFarm, isStaff } = useAuth();
  const here = useHere();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [region, setRegion] = useState<string>('all');
  const [view, setView] = useState<'list' | 'map'>('list');

  const regions = useQuery(async () => must(await supabase.from('regions').select('*').order('sort_order')) as Region[], [], { cacheKey: 'regions' });

  const farms = useQuery(
    async () => {
      let q = supabase
        .from('farms')
        .select('*, farm_products(*), farm_photos(*)')
        .eq('status', 'approved')
        .order('verified_at', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .limit(300);
      if (region !== 'all') q = q.eq('region_id', region);
      if (category) q = q.contains('categories', [category]);
      return must(await q) as Farm[];
    },
    [region, category],
    { cacheKey: `farms:${region}:${category ?? 'all'}` },
  );

  // Text search runs on the loaded page so it responds as people type; nearest first when we know where you are.
  const needle = query.trim().toLowerCase();
  const visible = (farms.data ?? [])
    .filter((f) => f.id !== myFarm?.id)
    .filter(
      (f) =>
        !needle ||
        [f.name, f.city, f.state, ...f.categories, ...f.attributes, ...(f.farm_products ?? []).map((p) => p.name)].join(' ').toLowerCase().includes(needle),
    )
    .map((f) => ({ f, d: here && f.lat != null && f.lon != null ? miles(here.point, { lat: f.lat, lon: f.lon }) : Infinity }))
    .sort((a, b) => (here ? a.d - b.d : 0))
    .map((x) => x.f);

  const selectedRegion = regions.data?.find((r) => r.id === region);

  return (
    <Screen>
      {myFarm ? (
        <Card tone="soft">
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt variant="label">{t('myFarm')}</Txt>
              <Txt variant="heading">{myFarm.name}</Txt>
            </View>
            {myFarm.status !== 'approved' ? <Pill label="Waiting for BFI review" tone="sun" /> : null}
          </Row>
          <Button small label="Update what's fresh" icon="leaf-outline" onPress={() => router.push('/my-farm')} />
        </Card>
      ) : (
        <Card tone="leaf" style={{ gap: Space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label" color={colors.onLeaf}>
              Black Farmers Index · 501(c)(3)
            </Txt>
            <Button small kind="inverse" label="About" icon="information-circle-outline" onPress={() => router.push('/about')} />
          </Row>
          <Txt variant="title" color={colors.onLeaf}>
            {BFI.tagline}
          </Txt>
          <View style={styles.stats}>
            {BFI.stats.map((s) => (
              <View key={s.label} style={[styles.stat, { borderTopColor: colors.onLeaf }]}>
                <Txt variant="mono" color={colors.onLeaf} style={{ fontSize: 19 * textScale, lineHeight: 24 * textScale }}>
                  {s.value}
                </Txt>
                <Txt variant="small" color={colors.onLeaf} style={{ fontSize: 12 * textScale }}>
                  {s.label}
                </Txt>
              </View>
            ))}
          </View>
        </Card>
      )}

      {isStaff ? <Button kind="ghost" label={t('review')} icon="shield-checkmark-outline" onPress={() => router.push('/review')} /> : null}

      <View style={[styles.search, { borderColor: colors.line, backgroundColor: colors.sunk }]}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('search')}
          placeholderTextColor={colors.muted}
          accessibilityLabel={t('search')}
          returnKeyType="search"
          style={{ flex: 1, minHeight: 44, color: colors.text, fontSize: 16 * textScale }}
        />
      </View>

      <PlacePicker compact />

      <View style={{ gap: Space.sm }}>
        <Txt variant="label">{t('browse')}</Txt>
        <Row gap={6}>
          {CATEGORIES.map((c) => (
            <Chip key={c.id} label={c.id} icon={c.icon as never} selected={category === c.id} onPress={() => setCategory(category === c.id ? null : c.id)} />
          ))}
        </Row>
      </View>

      <View style={{ gap: Space.sm }}>
        <Txt variant="label">{t('region')}</Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <Chip label={t('allRegions')} selected={region === 'all'} onPress={() => setRegion('all')} />
          {(regions.data ?? []).map((r) => (
            <Chip key={r.id} label={r.id === 'intl' ? 'International' : r.id} selected={region === r.id} onPress={() => setRegion(r.id)} />
          ))}
        </ScrollView>
        {selectedRegion ? (
          <Txt variant="small" muted>
            {selectedRegion.name}: {selectedRegion.states.join(', ')}
          </Txt>
        ) : null}
      </View>

      {farms.error ? <ErrorNote message={farms.error} onRetry={farms.reload} /> : null}
      {farms.loading && !farms.data ? <Loading /> : null}
      {farms.data ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Txt variant="small" muted accessibilityLiveRegion="polite">
              {visible.length} {visible.length === 1 ? 'grower' : 'growers'}
              {here ? ` · ${t('nearest').toLowerCase()}` : ''}
            </Txt>
            <SavedCopyNote at={farms.cachedAt} />
          </View>
          {!saveData ? (
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: t('list') },
                { value: 'map', label: t('map') },
              ]}
            />
          ) : null}
        </Row>
      ) : null}
      {farms.data && !visible.length ? <Empty>{t('noResults')}</Empty> : null}
      {view === 'map' && !saveData && visible.length ? <FarmMap farms={visible} here={here?.point ?? null} /> : null}
      {view === 'list' || saveData ? visible.map((f) => <FarmCard key={f.id} farm={f} here={here?.point} />) : null}

      {!myFarm ? (
        <Card style={{ borderRadius: Radius.lg }}>
          <Txt variant="heading">Are you a Black farmer or grower?</Txt>
          <Txt variant="small" muted>
            Listing on the Index is free. BFI reviews every farm before it goes live.
          </Txt>
          <Button kind="ghost" label="List my farm" icon="add-circle-outline" onPress={() => router.push('/my-farm')} />
        </Card>
      ) : null}
      <Button kind="ghost" label={t('nearMeAlerts')} icon="notifications-outline" onPress={() => router.push('/alerts')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: Space.sm },
  stat: { flex: 1, borderTopWidth: 1, paddingTop: 6, gap: 2 },
  search: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12 },
});
