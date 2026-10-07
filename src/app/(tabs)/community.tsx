import { Icon as Ionicons } from '@/components/icon';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BfiAsks } from '@/components/bfi-asks';
import { SavedCopyNote } from '@/components/network-banner';
import { TranslateToggle, useTranslation } from '@/components/translate';
import { Button, Card, Grid, Chip, Empty, ErrorNote, Loading, Row, Screen, SignInPrompt, Txt } from '@/components/ui';
import { Photo, Scrim } from '@/components/visual';
import { Space } from '@/constants/theme';
import { regionLabel } from '@/lib/bfi';
import { kindLabel, POST_KINDS } from '@/lib/board';
import { initials, shortDate } from '@/lib/format';
import { sectionImage } from '@/lib/imagery';
import { useLayout } from '@/lib/layout';
import { supabase } from '@/lib/supabase';
import type { Post, PostKind, Region } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';
import { showAlert } from '@/lib/alert';

/** Needs and offers, equipment sharing, rides, buying together and mentoring, by region. */
export default function Community() {
  const { t } = useSettings();
  const { session, profile } = useAuth();
  const { isTablet } = useLayout();
  const [kind, setKind] = useState<PostKind | null>(null);
  // Starts on the member's own region once their profile has loaded, until they pick another.
  const [regionChoice, setRegion] = useState<string | null | undefined>(undefined);
  const region = regionChoice === undefined ? (profile?.region_id ?? null) : regionChoice;

  const regions = useQuery(async () => must(await supabase.from('regions').select('*').order('sort_order')) as Region[], [], { cacheKey: 'regions' });
  const posts = useQuery(
    async () => {
      if (!session) return [] as Post[];
      let q = supabase
        .from('posts')
        .select('*, author:profiles(display_name, role)')
        .eq('status', 'open')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(100);
      if (kind) q = q.eq('kind', kind);
      if (region) q = q.eq('region_id', region);
      return must(await q) as Post[];
    },
    [session?.user.id, kind, region],
    { cacheKey: `posts:${kind ?? 'all'}:${region ?? 'all'}` },
  );

  const hero = (
    <Photo picture={sectionImage('community')} style={{ minHeight: isTablet ? 300 : 230, justifyContent: 'flex-end' }}>
      <Scrim from={0.15} />
      <View style={{ paddingLeft: isTablet ? 48 : 20, paddingRight: 20, paddingTop: 110, paddingBottom: 22, gap: 4 }}>
        <Txt variant="display" color="#ffffff" accessibilityRole="header">
          {t('communityHero')}
        </Txt>
        <Txt color="rgba(255,255,255,0.9)">{t('communityHeroSub')}</Txt>
      </View>
    </Photo>
  );

  if (!session) {
    return (
      <Screen hero={hero}>
        <Txt muted>{t('b_communitySignedOut')}</Txt>
        <SignInPrompt />
      </Screen>
    );
  }

  return (
    <Screen width="wide" hero={hero}>
      <BfiAsks />
      <Button label={t('newPost')} icon="add-circle-outline" style={{ alignSelf: 'flex-start' }} onPress={() => router.push('/new-post')} />
      <View style={{ gap: Space.sm }}>
        <Row gap={6}>
          <Chip label={t('b_everything')} selected={!kind} onPress={() => setKind(null)} />
          {POST_KINDS.map((k) => (
            <Chip key={k.id} label={kindLabel(k.id, t)} icon={k.icon as never} selected={kind === k.id} onPress={() => setKind(kind === k.id ? null : k.id)} />
          ))}
        </Row>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <Chip label={t('allRegions')} selected={!region} onPress={() => setRegion(null)} />
          {(regions.data ?? []).map((r) => (
            <Chip key={r.id} label={regionLabel(r.id, t)} selected={region === r.id} onPress={() => setRegion(r.id)} />
          ))}
        </ScrollView>
      </View>
      <SavedCopyNote at={posts.cachedAt} />
      {posts.error ? <ErrorNote message={posts.error} onRetry={posts.reload} /> : null}
      {(!posts.data || (posts.loading && !posts.data.length)) && !posts.error ? <Loading /> : null}
      {posts.data && !posts.data.length && !posts.loading && !posts.error ? <Empty>{t('b_noPostsYet')}</Empty> : null}
      <Grid>
      {posts.data?.map((p) => (
        <PostCard key={p.id} post={p} mine={p.author_id === session.user.id} onChange={posts.reload} />
      ))}
      </Grid>
      <Txt variant="small" muted>
        {t('b_boardRules')}
      </Txt>
    </Screen>
  );
}

function PostCard({ post, mine, onChange }: { post: Post; mine: boolean; onChange: () => void }) {
  const { colors, t, language } = useSettings();
  const [busy, setBusy] = useState(false);
  const body = useTranslation(post.body);
  const kind = POST_KINDS.find((k) => k.id === post.kind);
  const authorName = mine ? t('b_you') : (post.author?.display_name ?? t('b_aMember'));
  const authorLine =
    post.author?.role === 'grower'
      ? t('b_authorGrower', { name: authorName })
      : post.author?.role === 'admin' || post.author?.role === 'coordinator'
        ? t('b_authorStaff', { name: authorName })
        : authorName;

  const reply = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('start_post_conversation', { p_post_id: post.id });
    setBusy(false);
    if (error) return showAlert(t('b_couldNotReply'), error.message);
    router.push({ pathname: '/thread/[id]', params: { id: data as string } });
  };

  const close = async () => {
    const { error } = await supabase.from('posts').update({ status: 'closed' }).eq('id', post.id);
    if (error) showAlert(t('b_notUpdated'), error.message);
    onChange();
  };

  const report = async () => {
    const { error } = await supabase.from('reports').insert({ target_type: 'post', target_id: post.id, reason: 'Reported from community board' });
    showAlert(error ? t('b_reportNotSent') : t('b_reportSent'), error ? error.message : t('b_reportSentBody'));
  };

  return (
    <Card>
      {/* The kind pill drops below the author when space is tight, instead of squeezing the name. */}
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Row gap={10} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 200, flexWrap: 'nowrap' }}>
          <View style={[styles.avatar, { backgroundColor: colors.leafSoft }]}>
            <Txt variant="smallBold" color={colors.forest}>
              {initials(post.author?.display_name ?? t('b_memberFallback'))}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="smallBold" numberOfLines={1}>
              {authorLine}
            </Txt>
            <Txt variant="small" muted>
              {shortDate(post.created_at, language)}
              {post.region_id ? `, ${regionLabel(post.region_id, t)}` : ''}
            </Txt>
          </View>
        </Row>
        <View style={[styles.kind, { backgroundColor: colors.sunSoft }]}>
          <Ionicons name={(kind?.icon ?? 'chatbox-outline') as never} size={14} color={colors.onSun} />
          <Txt variant="smallBold" color={colors.onSun} style={{ fontSize: 12.5 }}>
            {kindLabel(post.kind, t)}
          </Txt>
        </View>
      </Row>
      <Txt variant="title">{post.title}</Txt>
      {post.body ? <Txt muted>{body.text}</Txt> : null}
      {post.location_text || post.happens_on ? (
        <Txt variant="small" muted>
          {[post.location_text, post.happens_on ? t('b_onDate', { date: shortDate(post.happens_on, language) }) : null].filter(Boolean).join(' · ')}
        </Txt>
      ) : null}
      <Row>
        {mine ? (
          <Button small kind="ghost" label={t('closePost')} icon="checkmark-circle-outline" onPress={close} />
        ) : (
          <Button small label={t('reply')} icon="chatbubble-outline" busy={busy} onPress={reply} />
        )}
        {post.body ? <TranslateToggle tr={body} color={colors.muted} /> : null}
        {!mine ? (
          <Pressable
            onPress={report}
            accessibilityRole="button"
            accessibilityLabel={`${t('reportPost')}: ${post.title}`}
            hitSlop={8}
            style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }}>
            <Txt variant="small" muted style={{ textDecorationLine: 'underline' }}>
              {t('report')}
            </Txt>
          </Pressable>
        ) : null}
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
});
