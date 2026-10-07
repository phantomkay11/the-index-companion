import { Icon as Ionicons } from '@/components/icon';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TranslateToggle, useTranslation } from '@/components/translate';
import { Button, Card, ErrorNote, Loading, Pill, Row, Screen, Txt } from '@/components/ui';
import { BackDisc, Credit, GlassChip, Photo, Scrim, useLightStatusBar } from '@/components/visual';
import { Radius } from '@/constants/theme';
import { shortDate, updatedAgo } from '@/lib/format';
import { farmCover, farmPhotos } from '@/lib/imagery';
import { useLayout } from '@/lib/layout';
import { speak } from '@/lib/speak';
import { supabase } from '@/lib/supabase';
import type { Farm } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';

export default function FarmProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, t, language, saveData } = useSettings();
  const { isTablet, width } = useLayout();
  const { session } = useAuth();
  const [busy, setBusy] = useState<'follow' | 'message' | null>(null);
  const insets = useSafeAreaInsets();
  useLightStatusBar();

  const farm = useQuery(
    async () => must(await supabase.from('farms').select('*, farm_products(*), farm_photos(*)').eq('id', id).single()) as Farm,
    [id],
    { cacheKey: `farm:${id}` },
  );
  const story = useTranslation(farm.data?.story ?? '');

  // Count a profile view once per visit (the database ignores the owner's own views).
  // Signed-in visits only, so the funder report can't be padded anonymously.
  const viewerId = session?.user.id;
  useEffect(() => {
    if (viewerId) supabase.rpc('log_farm_view', { p_farm_id: id }).then(() => {});
  }, [id, viewerId]);
  const follow = useQuery(async () => {
    if (!session) return false;
    const { count } = await supabase.from('follows').select('*', { count: 'exact', head: true }).eq('farm_id', id).eq('user_id', session.user.id);
    return (count ?? 0) > 0;
  }, [id, session?.user.id]);

  if (farm.error)
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
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
    if (follow.data === undefined || busy) return; // still loading, or already saving
    setBusy('follow');
    const following = follow.data;
    const res = following
      ? await supabase.from('follows').delete().eq('farm_id', f.id).eq('user_id', session.user.id)
      : await supabase.from('follows').insert({ farm_id: f.id, user_id: session.user.id });
    setBusy(null);
    if (res.error) showAlert('Could not update', res.error.message);
    else follow.setData(!following);
  };

  const openMessage = async () => {
    if (!session) return needSignIn();
    setBusy('message');
    const { data, error } = await supabase.rpc('start_conversation', {
      p_farm_id: f.id,
    });
    setBusy(null);
    if (error) showAlert('Message not started', error.message);
    else router.push({ pathname: '/thread/[id]', params: { id: data as string } });
  };

  const report = async () => {
    if (!session) return needSignIn();
    const { error } = await supabase.from('reports').insert({
      target_type: 'farm',
      target_id: f.id,
      reason: 'Reported from farm profile',
    });
    showAlert(error ? 'Report not sent' : 'Report sent', error ? error.message : 'BFI moderators will review this listing.');
  };

  const readAloud = () =>
    speak(`${f.name}, ${f.city}, ${f.state}. ${story.text} ${inSeason.length ? `${t('fresh')}: ${inSeason.join(', ')}.` : ''}`, language);

  const canMessage = !!f.owner_id && f.accepts_messages && !isOwner;

  const cover = farmCover(f);
  const more = farmPhotos(f).slice(1);
  const kind = f.categories[0];
  const tags = [...f.categories.slice(1), ...f.attributes].filter((x, i, a) => a.indexOf(x) === i);
  const showBar = isOwner || canMessage;

  const hero = (
    <Photo picture={cover} style={{ height: (isTablet ? 500 : 420) + insets.top }}>
      <Scrim from={0.3} top />
      <View style={[styles.heroCopy, isTablet && { left: Math.max(48, (width - 760) / 2 + 32), right: 48, bottom: 60 }]}>
        <Row gap={8}>
          {f.verified_at ? (
            <GlassChip>
              <Ionicons name="shield-checkmark" size={14} color={colors.leaf} />
              <Txt variant="smallBold" color="#0b4a2f" style={{ fontSize: 12.5 }}>
                {t('verified')}
              </Txt>
            </GlassChip>
          ) : (
            <GlassChip>
              <Txt variant="smallBold" color="#5f4100" style={{ fontSize: 12.5 }}>
                Awaiting verification
              </Txt>
            </GlassChip>
          )}
          {f.is_sample ? (
            <View style={styles.sample}>
              <Txt variant="smallBold" color="#ffffff" style={{ fontSize: 12 }}>
                {t('sample')}
              </Txt>
            </View>
          ) : null}
        </Row>
        <Txt variant="hero" color="#ffffff" accessibilityRole="header" numberOfLines={3}>
          {f.name}
        </Txt>
        <Txt color="rgba(255,255,255,0.92)">{[`${f.city}, ${f.state}`, kind, `Region ${f.region_id}`].filter(Boolean).join('  ·  ')}</Txt>
      </View>
      <Credit picture={cover} style={{ bottom: 40 }} />
      {/* The page curves up over the photo, like a sheet. */}
      <View style={[styles.lip, { backgroundColor: colors.background }]} />
    </Photo>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: '', headerTransparent: true, headerTintColor: '#ffffff', headerLeft: () => <BackDisc /> }} />
      <Screen hero={hero} style={{ paddingTop: 4, paddingBottom: showBar ? 132 : 48 }}>
        <Txt variant="small" muted>
          On the Index since {new Date(f.listed_since).getFullYear()}
          {f.verified_at ? `, verified by BFI ${shortDate(f.verified_at)}` : ''}. {updatedAgo(f.updated_at)}.
        </Txt>

        {story.text ? (
          <View style={{ gap: 6 }}>
            <Txt style={{ fontSize: 18, lineHeight: 27 }}>{story.text}</Txt>
            <TranslateToggle tr={story} color={colors.muted} />
          </View>
        ) : null}

        {more.length && !saveData ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {more.map((p, i) => (
              <Photo key={i} picture={p} rounded={Radius.lg} style={{ width: 240, height: 170 }}>
                <Credit picture={p} />
              </Photo>
            ))}
          </ScrollView>
        ) : null}

        <View style={{ gap: 10 }}>
          <Txt variant="title">{t('fresh')}</Txt>
          {inSeason.length ? (
            <Row gap={8}>
              {inSeason.map((name) => (
                <View key={name} style={[styles.fresh, { backgroundColor: colors.sunSoft }]}>
                  <View style={[styles.dot, { backgroundColor: colors.sun }]} />
                  <Txt variant="smallBold" color={colors.onSun}>
                    {name}
                  </Txt>
                </View>
              ))}
            </Row>
          ) : (
            <Txt muted>Nothing posted this week. Follow the farm to hear when something comes in.</Txt>
          )}
        </View>

        {f.order_url ? (
          <Pressable
            onPress={() => WebBrowser.openBrowserAsync(f.order_url!)}
            accessibilityRole="link"
            accessibilityLabel={`${f.order_label || t('orderOnline')} with ${f.name}. Opens the farm’s own page.`}
            style={({ pressed }) => [styles.order, { backgroundColor: colors.harvest, opacity: pressed ? 0.9 : 1 }]}>
            <View style={[styles.factIcon, { backgroundColor: 'rgba(255,255,255,0.55)' }]}>
              <Ionicons name="cart" size={18} color={colors.onHarvest} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="heading" color={colors.onHarvest}>
                {f.order_label || t('orderOnline')}
              </Txt>
              <Txt variant="small" color={colors.onHarvest}>
                On the farm’s own site. Orders and payment go straight to the farm.
              </Txt>
            </View>
            <Ionicons name="open-outline" size={20} color={colors.onHarvest} />
          </Pressable>
        ) : null}

        <View style={{ gap: 4 }}>
          <Fact icon="bag-handle" label={t('howToBuy')} value={f.how_to_buy.join('\n') || 'Message the farm'} />
          <Fact icon="location" label={t('location')} value={location} />
          <Fact icon="language" label={t('languages')} value={`${f.languages.join(', ')}${f.replies_by_sms ? '. Replies by text message.' : ''}`} />
          {f.website ? (
            <Pressable onPress={() => WebBrowser.openBrowserAsync(f.website!)} accessibilityRole="link">
              <Fact icon="globe" label="Website" value={f.website} />
            </Pressable>
          ) : null}
        </View>

        {tags.length ? (
          <Row gap={6}>
            {tags.map((x) => (
              <Pill key={x} label={x} />
            ))}
          </Row>
        ) : null}

        <Row>
          {!isOwner ? (
            <Button
              small
              kind="ghost"
              label={follow.data ? t('following') : t('follow')}
              icon={follow.data ? 'checkmark' : 'notifications-outline'}
              busy={busy === 'follow'}
              onPress={toggleFollow}
            />
          ) : null}
          <Button small kind="ghost" label={t('listen')} icon="volume-high-outline" onPress={readAloud} />
        </Row>

        {!f.owner_id ? (
          <Card tone="sun">
            <Txt variant="small">This farm is listed on the Index but hasn’t joined the app yet, so it can’t receive messages here.</Txt>
          </Card>
        ) : null}

        <View style={styles.verify}>
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.leaf} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="heading">{t('howVerification')}</Txt>
            <Txt variant="small" muted>
              {t('verificationHint')}
            </Txt>
          </View>
        </View>
        {!isOwner ? (
          <Pressable onPress={report} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
            <Txt variant="small" muted style={{ textDecorationLine: 'underline' }}>
              {t('reportListing')}
            </Txt>
          </Pressable>
        ) : null}
      </Screen>

      {showBar ? (
        // The main action stays in reach while you read.
        <View style={[styles.bar, { backgroundColor: colors.surface, paddingBottom: 12 + insets.bottom }]}>
          <View style={[styles.barInner, isTablet && { maxWidth: 760, alignSelf: 'center', width: '100%' }]}>
            {isOwner ? (
              <Button label="Edit my farm" icon="create-outline" style={{ flex: 1 }} onPress={() => router.push('/my-farm')} />
            ) : (
              <>
                <Pressable
                  onPress={openMessage}
                  accessibilityRole="button"
                  accessibilityLabel={t('message')}
                  style={({ pressed }) => [styles.round, { backgroundColor: colors.leafSoft, opacity: pressed ? 0.8 : 1 }]}>
                  <Ionicons name="chatbubble-ellipses" size={22} color={colors.forest} />
                </Pressable>
                <Button
                  label={t('sendInquiry')}
                  icon="create-outline"
                  style={{ flex: 1 }}
                  onPress={() => (session ? router.push({ pathname: '/inquiry/[farmId]', params: { farmId: f.id } }) : needSignIn())}
                />
              </>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Fact({ icon, label, value }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  const { colors } = useSettings();
  return (
    <View style={styles.fact}>
      <View style={[styles.factIcon, { backgroundColor: colors.leafSoft }]}>
        <Ionicons name={icon} size={18} color={colors.forest} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="smallBold" muted>
          {label}
        </Txt>
        <Txt>{value}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCopy: { position: 'absolute', left: 20, right: 20, bottom: 44, gap: 8 },
  sample: { backgroundColor: 'rgba(6,24,15,0.72)', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.85)', borderRadius: Radius.pill, paddingHorizontal: 9, paddingVertical: 2 },
  lip: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 26, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  fresh: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.pill, paddingHorizontal: 14, minHeight: 38 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  order: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: Radius.lg, padding: 16 },
  fact: { flexDirection: 'row', gap: 14, paddingVertical: 10, alignItems: 'flex-start' },
  factIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  verify: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: 16,
    shadowColor: '#0b2a1b',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  barInner: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  round: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
