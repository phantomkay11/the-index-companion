import { Icon as Ionicons } from '@/components/icon';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BfiAsks } from '@/components/bfi-asks';
import { FarmCard } from '@/components/farm-card';
import { FarmMap } from '@/components/farm-map';
import { SavedCopyNote } from '@/components/network-banner';
import { PlacePicker } from '@/components/place-picker';
import { Button, Card, Chip, Empty, ErrorNote, Grid, Loading, Pill, Row, Screen, Segmented, Txt } from '@/components/ui';
import { GradientBand, Photo, Scrim, useLightStatusBar } from '@/components/visual';
import { Fonts, Radius, Space } from '@/constants/theme';
import { BFI, CATEGORIES } from '@/lib/bfi';
import { useLayout } from '@/lib/layout';
import { categoryImage, sectionImage } from '@/lib/imagery';
import { locate, miles, setHere, useHere } from '@/lib/location';
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
  const [locating, setLocating] = useState(false);
  const insets = useSafeAreaInsets();
  useLightStatusBar();
  const { isTablet, isWide } = useLayout();

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
  const heroPic = sectionImage('discover');

  const nearMe = async () => {
    setLocating(true);
    const r = await locate();
    setLocating(false);
    if (r.ok) setHere({ point: r.point, label: r.label });
    else Alert.alert('Location unavailable', r.reason);
  };

  const hero = (
    <View>
      <Photo picture={heroPic} style={{ height: isTablet ? 440 : 470 + insets.top }}>
        <Scrim from={0.2} top />
        <View style={[styles.heroCopy, isTablet && styles.heroCopyTablet]}>
          <Txt variant="smallBold" color="rgba(255,255,255,0.92)">
            From Black Farmers Index
          </Txt>
          <Txt variant="hero" color="#ffffff" style={isTablet ? { fontSize: 46 * textScale, lineHeight: 50 * textScale } : undefined}>
            Find Black farmers near you
          </Txt>
          <Txt color="rgba(255,255,255,0.9)">Fresh food and friendly faces, straight from the growers.</Txt>
        </View>
      </Photo>
      {/* The search floats over the bottom edge of the photo. */}
      <View style={[styles.searchWrap, isTablet && styles.searchWrapTablet]}>
        <View style={[styles.search, { backgroundColor: colors.surface }]}>
          <Ionicons name="search" size={20} color={colors.forest} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('search')}
            placeholderTextColor={colors.muted}
            accessibilityLabel={t('search')}
            returnKeyType="search"
            style={{ flex: 1, minHeight: 52, color: colors.text, fontSize: 16 * textScale, fontFamily: Fonts.body }}
          />
          <Pressable
            onPress={nearMe}
            accessibilityRole="button"
            accessibilityLabel={t('useMyLocation')}
            style={({ pressed }) => [styles.nearMe, { backgroundColor: colors.harvest, opacity: pressed ? 0.85 : 1 }]}>
            {locating ? <ActivityIndicator color={colors.onHarvest} /> : <Ionicons name="navigate" size={16} color={colors.onHarvest} />}
            <Txt variant="smallBold" color={colors.onHarvest}>
              Near me
            </Txt>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <Screen width="wide" hero={hero} style={{ paddingTop: 12 }}>
      <PlacePicker compact hideGps />
      <BfiAsks />
      {myFarm ? (
        <Card tone="soft">
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt variant="label" color={colors.forest}>
                {t('myFarm')}
              </Txt>
              <Txt variant="title">{myFarm.name}</Txt>
            </View>
            {myFarm.status !== 'approved' ? <Pill label="Waiting for BFI review" tone="sun" /> : null}
          </Row>
          <Button small label="Update what's fresh" icon="leaf-outline" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/my-farm')} />
        </Card>
      ) : null}

      {isStaff ? <Button kind="ghost" label={t('review')} icon="shield-checkmark-outline" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/review')} /> : null}

      <View style={{ gap: Space.md }}>
        <Txt variant="title" accessibilityRole="header">
          {t('browse')}
        </Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 8 }} style={{ marginHorizontal: -4 }}>
          {CATEGORIES.map((c) => {
            const on = category === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCategory(on ? null : c.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={c.id}
                style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1, marginLeft: 4 }]}>
                <Photo
                  picture={categoryImage(c.id)}
                  rounded={Radius.lg}
                  style={[styles.tile, isTablet && styles.tileTablet, on && { borderWidth: 3, borderColor: colors.forest }]}>
                  <Scrim from={0.35} />
                  {on ? (
                    <View style={[styles.tileCheck, { backgroundColor: colors.harvest }]}>
                      <Ionicons name="checkmark" size={14} color={colors.onHarvest} />
                    </View>
                  ) : null}
                  <Txt variant="heading" color="#ffffff" style={styles.tileLabel}>
                    {c.id}
                  </Txt>
                </Photo>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={{ gap: Space.sm }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label={t('allRegions')} selected={region === 'all'} onPress={() => setRegion('all')} />
          {(regions.data ?? []).map((r) => (
            <Chip key={r.id} label={r.id === 'intl' ? 'International' : `Region ${r.id}`} selected={region === r.id} onPress={() => setRegion(r.id)} />
          ))}
        </ScrollView>
        {selectedRegion && selectedRegion.states.length ? (
          <Txt variant="small" muted>
            {selectedRegion.states.join(', ')}
          </Txt>
        ) : null}
      </View>

      {farms.error ? <ErrorNote message={farms.error} onRetry={farms.reload} /> : null}
      {farms.loading && !farms.data ? <Loading /> : null}
      {farms.data ? (
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View style={{ gap: 2 }}>
            <Txt variant="title" accessibilityRole="header" accessibilityLiveRegion="polite">
              {visible.length} {visible.length === 1 ? 'grower' : 'growers'}
            </Txt>
            <Txt variant="small" muted>
              {here ? `Nearest first, from ${here.label ?? 'your location'}` : category ?? 'Verified by BFI, newest first'}
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
      {view === 'map' && !saveData && visible.length ? (
        isWide ? (
          // iPad landscape: map and list side by side.
          <View style={{ flexDirection: 'row', gap: Space.lg, height: 640 }}>
            <View style={{ flex: 3, borderRadius: Radius.xl, overflow: 'hidden' }}>
              <FarmMap farms={visible} here={here?.point ?? null} height={640} />
            </View>
            <ScrollView style={{ flex: 2 }} contentContainerStyle={{ gap: Space.xl }}>
              {visible.map((f) => (
                <FarmCard key={f.id} farm={f} here={here?.point} compact />
              ))}
            </ScrollView>
          </View>
        ) : (
          <View style={{ borderRadius: Radius.xl, overflow: 'hidden' }}>
            <FarmMap farms={visible} here={here?.point ?? null} height={isTablet ? 520 : 360} />
          </View>
        )
      ) : null}
      {view === 'list' || saveData ? (
        <Grid gap={Space.xl}>
          {visible.map((f) => (
            <FarmCard key={f.id} farm={f} here={here?.point} />
          ))}
        </Grid>
      ) : null}

      <GradientBand>
        <Txt variant="display" color="#ffffff">
          {BFI.tagline}
        </Txt>
        <View style={styles.stats}>
          {BFI.stats.map((x) => (
            <View key={x.label} style={styles.stat}>
              <Txt variant="display" color="#ffffff">
                {x.value}
              </Txt>
              <Txt variant="small" color="rgba(255,255,255,0.88)">
                {x.label}
              </Txt>
            </View>
          ))}
        </View>
        <Button kind="inverse" label="About BFI" icon="information-circle-outline" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/about')} />
      </GradientBand>

      {!myFarm ? (
        <Card>
          <Txt variant="title">Are you a Black farmer or grower?</Txt>
          <Txt muted>Listing on the Index is free. BFI reviews every farm before it goes live.</Txt>
          <Row>
            <Button label="List my farm" icon="add-circle-outline" onPress={() => router.push('/my-farm')} />
            <Button kind="ghost" label={t('nearMeAlerts')} icon="notifications-outline" onPress={() => router.push('/alerts')} />
          </Row>
        </Card>
      ) : (
        <Button kind="ghost" label={t('nearMeAlerts')} icon="notifications-outline" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/alerts')} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCopy: { position: 'absolute', left: 20, right: 20, bottom: 58, gap: 8 },
  heroCopyTablet: { left: 48, right: 48, bottom: 72, maxWidth: 720 },
  searchWrap: { marginTop: -30, paddingHorizontal: 16 },
  searchWrapTablet: { paddingHorizontal: 48, maxWidth: 820, width: '100%', alignSelf: 'flex-start' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.pill,
    paddingLeft: 18,
    paddingRight: 6,
    minHeight: 60,
    shadowColor: '#0b2a1b',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  nearMe: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.pill, paddingHorizontal: 16, minHeight: 46 },
  tile: { width: 136, height: 172, justifyContent: 'flex-end' },
  tileTablet: { width: 168, height: 200 },
  tileLabel: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  tileCheck: { position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: Space.lg, flexWrap: 'wrap' },
  stat: { flex: 1, minWidth: 90, gap: 2 },
});
