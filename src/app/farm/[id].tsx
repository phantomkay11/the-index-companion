import { Icon as Ionicons } from '@/components/icon';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState, type ComponentProps } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { PhotoCredit, PhotoSlot, photoUrl } from '@/components/farm-card';
import { SavedCopyNote } from '@/components/network-banner';
import { TranslateToggle, useTranslation } from '@/components/translate';
import { Button, Card, ErrorNote, Loading, Pill, Provenance, Row, Screen, Txt, Verified } from '@/components/ui';
import { Radius, Space } from '@/constants/theme';
import { shortDate, updatedAgo } from '@/lib/format';
import { useLayout } from '@/lib/layout';
import { speak } from '@/lib/speak';
import { supabase } from '@/lib/supabase';
import type { Farm } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

export default function FarmProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, t, language, saveData } = useSettings();
  const { isTablet } = useLayout();
  const { session } = useAuth();
  const [busy, setBusy] = useState<'follow' | 'message' | null>(null);

  const farm = useQuery(
    async () => must(await supabase.from('farms').select('*, farm_products(*), farm_photos(*)').eq('id', id).single()) as Farm,
    [id],
    { cacheKey: `farm:${id}` },
  );
  const story = useTranslation(farm.data?.story ?? '');

  // Count a profile view once per visit (the database ignores the owner's own views).
  useEffect(() => {
    supabase.rpc('log_farm_view', { p_farm_id: id }).then(() => {});
  }, [id]);
  const follow = useQuery(async () => {
    if (!session) return false;
    const { count } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('farm_id', id).eq('user_id', session.user.id);
    return (count ?? 0) > 0;
  }, [id, session?.user.id]);

  if (farm.error)
    return (
      <Screen>
        <ErrorNote message={farm.error} onRetry={farm.reload} />
      </Screen>
    );
  if (!farm.data)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  const f = farm.data;
  const inSeason = (f.farm_products ?? []).filter((p) => p.in_season).map((p) => p.name);
  const isOwner = session?.user.id === f.owner_id;
  const location =
    f.location_visibility === 'exact'
      ? `${f.city}, ${f.state}. Address shared by the farm.`
      : f.location_visibility === 'pickup_point'
        ? `Pickup at ${f.pickup_point ?? f.city}. Farm address stays private.`
        : `${f.city}, ${f.state}. Exact address shared after an order.`;

  const needSignIn = () => {
    router.push('/sign-in');
  };

  const toggleFollow = async () => {
    if (!session) return needSignIn();
    setBusy('follow');
    const following = follow.data;
    const res = following
      ? await supabase.from('follows').delete().eq('farm_id', f.id).eq('user_id', session.user.id)
      : await supabase.from('follows').insert({ farm_id: f.id, user_id: session.user.id });
    setBusy(null);
    if (res.error) Alert.alert('Could not update', res.error.message);
    else follow.setData(!following);
  };

  const openMessage = async () => {
    if (!session) return needSignIn();
    setBusy('message');
    const { data, error } = await supabase.rpc('start_conversation', {
      p_farm_id: f.id,
    });
    setBusy(null);
    if (error) Alert.alert('Message not started', error.message);
    else router.push({ pathname: '/thread/[id]', params: { id: data as string } });
  };

  const report = async () => {
    if (!session) return needSignIn();
    const { error } = await supabase.from('reports').insert({
      target_type: 'farm',
      target_id: f.id,
      reason: 'Reported from farm profile',
    });
    Alert.alert(error ? 'Report not sent' : 'Report sent', error ? error.message : 'BFI moderators will review this listing.');
  };

  const readAloud = () =>
    speak(`${f.name}, ${f.city}, ${f.state}. ${story.text} ${inSeason.length ? `${t('fresh')}: ${inSeason.join(', ')}.` : ''}`, language);

  const canMessage = !!f.owner_id && f.accepts_messages && !isOwner;

  return (
    <Screen width={isTablet ? 'wide' : 'full'} style={isTablet ? undefined : { paddingTop: 0, paddingHorizontal: 0 }}>
      <Stack.Screen options={{ title: f.name }} />
      {/* iPad: photo on the left, details on the right. */}
      <View style={isTablet ? { flexDirection: 'row', gap: Space.xl, alignItems: 'flex-start' } : undefined}>
        {!saveData ? (
          <View style={isTablet ? { flex: 5, borderRadius: Radius.lg, overflow: 'hidden' } : undefined}>
            <PhotoSlot farm={f} tall />
          </View>
        ) : null}
        <View style={[styles.body, isTablet && { flex: 6, paddingHorizontal: 0 }]}>
          <View style={{ gap: 4 }}>
            <Txt variant="label">
              Region {f.region_id} · {f.city}, {f.state}
            </Txt>
            <Txt variant="display" accessibilityRole="header">
              {f.name}
            </Txt>
          </View>
          <Row>
            {f.verified_at ? <Verified /> : <Pill label="Awaiting verification" tone="sun" />}
            <Txt variant="mono" muted>
              On the Index since {new Date(f.listed_since).getFullYear()} · {updatedAgo(f.updated_at).toLowerCase()}
            </Txt>
            {f.is_sample ? <Provenance sample /> : null}
          </Row>
          {f.harvest_mode ? <Pill label="In harvest: replies may take a couple of days" tone="sun" icon="time-outline" /> : null}
          <SavedCopyNote at={farm.cachedAt} />
          {f.story ? (
            <View style={{ gap: 4 }}>
              <Txt>{story.text}</Txt>
              <TranslateToggle tr={story} color={colors.muted} />
            </View>
          ) : null}
          {!saveData && (f.farm_photos?.length ?? 0) > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Space.sm }}>
              {[...(f.farm_photos ?? [])]
                .sort((a, b) => a.sort_order - b.sort_order)
                .slice(1)
                .map((p) => (
                  <View key={p.id} style={{ width: 160, height: 110, borderRadius: Radius.md, overflow: 'hidden' }}>
                    <Image
                      source={{ uri: photoUrl(p.path) }}
                      alt={p.alt_text}
                      accessibilityLabel={p.alt_text}
                      contentFit="cover"
                      style={{ flex: 1 }}
                    />
                    <View style={{ position: 'absolute', left: 4, bottom: 4 }}>
                      <PhotoCredit photo={p} onDark />
                    </View>
                  </View>
                ))}
            </ScrollView>
          ) : null}

          <View style={[styles.facts, { borderColor: colors.line }]}>
            <Fact icon="leaf-outline" label={t('fresh')} value={inSeason.length ? inSeason.join(', ') : 'Nothing posted this week'} />
            <Fact icon="bag-handle-outline" label={t('howToBuy')} value={f.how_to_buy.join(' · ') || 'Message the farm'} />
            <Fact icon="location-outline" label={t('location')} value={location} />
            <Fact
              icon="globe-outline"
              label={t('languages')}
              value={`${f.languages.join(', ')}${f.replies_by_sms ? ' · replies by text message' : ''}`}
              last={!f.website}
            />
            {f.website ? (
              <Pressable onPress={() => WebBrowser.openBrowserAsync(f.website!)} accessibilityRole="link">
                <Fact icon="open-outline" label="Website" value={f.website} last />
              </Pressable>
            ) : null}
          </View>

          <Row gap={6}>
            {[...f.categories, ...f.attributes]
              .filter((x, i, a) => a.indexOf(x) === i)
              .map((x) => (
                <Pill key={x} label={x} />
              ))}
          </Row>

          {f.order_url ? (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
                  <Txt variant="smallBold">{f.order_label || t('orderOnline')}</Txt>
                  <Txt variant="small" muted>
                    Opens the farm’s own page. Orders and payment go straight to the farm.
                  </Txt>
                </View>
                <Button
                  label={t('orderOnline')}
                  icon="cart-outline"
                  accessibilityLabel={`${f.order_label || t('orderOnline')} with ${f.name}`}
                  onPress={() => WebBrowser.openBrowserAsync(f.order_url!)}
                />
              </Row>
            </Card>
          ) : null}

          {!isOwner ? (
            <Row>
              {canMessage ? (
                <Button
                  label={t('sendInquiry')}
                  icon="create-outline"
                  onPress={() =>
                    session
                      ? router.push({
                          pathname: '/inquiry/[farmId]',
                          params: { farmId: f.id },
                        })
                      : needSignIn()
                  }
                />
              ) : null}
              {canMessage ? (
                <Button kind="ghost" label={t('message')} icon="chatbubble-outline" busy={busy === 'message'} onPress={openMessage} />
              ) : null}
              <Button
                kind="ghost"
                label={follow.data ? t('following') : t('follow')}
                icon={follow.data ? 'checkmark' : 'notifications-outline'}
                busy={busy === 'follow'}
                onPress={toggleFollow}
              />
              <Button kind="ghost" label={t('listen')} icon="volume-high-outline" onPress={readAloud} />
            </Row>
          ) : (
            <Button label="Edit my farm" icon="create-outline" onPress={() => router.push('/my-farm')} />
          )}
          {!f.owner_id ? (
            <Card tone="sun">
              <Txt variant="small">This farm is listed on the Index but hasn’t joined the app yet, so it can’t receive messages here.</Txt>
            </Card>
          ) : null}

          <Card>
            <Row gap={6}>
              <Ionicons name="shield-checkmark-outline" size={18} color={colors.leaf} />
              <Txt variant="smallBold">How verification works</Txt>
            </Row>
            <Txt variant="small" muted>
              BFI confirms each farm before it gets the verified mark
              {f.verified_at ? ` (verified ${shortDate(f.verified_at)})` : ''}. Farmers choose how much of their location to show.
            </Txt>
          </Card>
          {!isOwner ? (
            <Pressable onPress={report} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
              <Txt variant="small" muted style={{ textDecorationLine: 'underline' }}>
                {t('reportListing')}
              </Txt>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

function Fact({ icon, label, value, last }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; value: string; last?: boolean }) {
  const { colors } = useSettings();
  return (
    <View style={[styles.fact, !last && { borderBottomWidth: 1, borderBottomColor: colors.line }]}>
      <Ionicons name={icon} size={20} color={colors.leaf} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Txt variant="small" muted>
          {label}
        </Txt>
        <Txt>{value}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Space.lg, gap: Space.md },
  facts: { borderWidth: 1, borderRadius: Radius.md, overflow: 'hidden' },
  fact: { flexDirection: 'row', gap: Space.md, padding: Space.md },
});
