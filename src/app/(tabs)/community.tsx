import { Icon as Ionicons } from '@/components/icon';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BfiAsks } from '@/components/bfi-asks';
import { SavedCopyNote } from '@/components/network-banner';
import { TranslateToggle, useTranslation } from '@/components/translate';
import { Button, Card, Grid, Chip, Empty, ErrorNote, Loading, Row, Screen, SignInPrompt, Txt } from '@/components/ui';
import { Photo, Scrim } from '@/components/visual';
import { Space } from '@/constants/theme';
import { kindLabel, POST_KINDS } from '@/lib/board';
import { initials, shortDate } from '@/lib/format';
import { sectionImage } from '@/lib/imagery';
import { useLayout } from '@/lib/layout';
import { supabase } from '@/lib/supabase';
import type { Post, PostKind, Region } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

/** Needs and offers, equipment sharing, rides, buying together and mentoring, by region. */
export default function Community() {
  const { t } = useSettings();
  const { session, profile } = useAuth();
  const { isTablet } = useLayout();
  const [kind, setKind] = useState<PostKind | null>(null);
  const [region, setRegion] = useState<string | null>(profile?.region_id ?? null);

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
    <Photo picture={sectionImage('community')} style={{ height: isTablet ? 300 : 230 }}>
      <Scrim from={0.15} />
      <View style={{ position: 'absolute', left: isTablet ? 48 : 20, right: 20, bottom: 22, gap: 4 }}>
        <Txt variant="display" color="#ffffff">
          Lend a hand. Borrow a seeder.
        </Txt>
        <Txt color="rgba(255,255,255,0.9)">Needs, offers, rides and mentoring in your region.</Txt>
      </View>
    </Photo>
  );

  if (!session) {
    return (
      <Screen hero={hero}>
        <Txt muted>Ask for a hand at harvest, share equipment, offer seedlings, find a ride to market or a mentor. Members only.</Txt>
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
          <Chip label="Everything" selected={!kind} onPress={() => setKind(null)} />
          {POST_KINDS.map((k) => (
            <Chip key={k.id} label={k.label} icon={k.icon as never} selected={kind === k.id} onPress={() => setKind(kind === k.id ? null : k.id)} />
          ))}
        </Row>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <Chip label={t('allRegions')} selected={!region} onPress={() => setRegion(null)} />
          {(regions.data ?? []).map((r) => (
            <Chip key={r.id} label={r.id === 'intl' ? 'International' : r.name} selected={region === r.id} onPress={() => setRegion(r.id)} />
          ))}
        </ScrollView>
      </View>
      <SavedCopyNote at={posts.cachedAt} />
      {posts.error ? <ErrorNote message={posts.error} onRetry={posts.reload} /> : null}
      {!posts.data && !posts.error ? <Loading /> : null}
      {posts.data && !posts.data.length ? <Empty>Nothing posted here yet. Be the first.</Empty> : null}
      <Grid>
      {posts.data?.map((p) => (
        <PostCard key={p.id} post={p} mine={p.author_id === session.user.id} onChange={posts.reload} />
      ))}
      </Grid>
      <Txt variant="small" muted>
        Posts close on their own after 45 days. Reply privately to arrange details; never share bank details on the board.
      </Txt>
    </Screen>
  );
}

function PostCard({ post, mine, onChange }: { post: Post; mine: boolean; onChange: () => void }) {
  const { colors, t } = useSettings();
  const [busy, setBusy] = useState(false);
  const body = useTranslation(post.body);
  const kind = POST_KINDS.find((k) => k.id === post.kind);

  const reply = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('start_post_conversation', { p_post_id: post.id });
    setBusy(false);
    if (error) return Alert.alert('Could not reply', error.message);
    router.push({ pathname: '/thread/[id]', params: { id: data as string } });
  };

  const close = async () => {
    const { error } = await supabase.from('posts').update({ status: 'closed' }).eq('id', post.id);
    if (error) Alert.alert('Not updated', error.message);
    onChange();
  };

  const report = async () => {
    const { error } = await supabase.from('reports').insert({ target_type: 'post', target_id: post.id, reason: 'Reported from community board' });
    Alert.alert(error ? 'Report not sent' : 'Report sent', error ? error.message : 'BFI moderators will review this post.');
  };

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Row gap={10} style={{ flex: 1, flexWrap: 'nowrap' }}>
          <View style={[styles.avatar, { backgroundColor: colors.leafSoft }]}>
            <Txt variant="smallBold" color={colors.forest}>
              {initials(post.author?.display_name ?? 'Member')}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="smallBold" numberOfLines={1}>
              {mine ? 'You' : post.author?.display_name ?? 'A member'}
              {post.author?.role === 'grower' ? ', grower' : post.author?.role === 'admin' || post.author?.role === 'coordinator' ? ', BFI staff' : ''}
            </Txt>
            <Txt variant="small" muted>
              {shortDate(post.created_at)}
              {post.region_id ? `, ${post.region_id === 'intl' ? 'International' : `Region ${post.region_id}`}` : ''}
            </Txt>
          </View>
        </Row>
        <View style={[styles.kind, { backgroundColor: colors.sunSoft }]}>
          <Ionicons name={(kind?.icon ?? 'chatbox-outline') as never} size={14} color={colors.onSun} />
          <Txt variant="smallBold" color={colors.onSun} style={{ fontSize: 12.5 }}>
            {kindLabel(post.kind)}
          </Txt>
        </View>
      </Row>
      <Txt variant="title">{post.title}</Txt>
      {post.body ? <Txt muted>{body.text}</Txt> : null}
      {post.location_text || post.happens_on ? (
        <Txt variant="small" muted>
          {[post.location_text, post.happens_on ? `On ${shortDate(post.happens_on)}` : null].filter(Boolean).join(' · ')}
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
          <Pressable onPress={report} accessibilityRole="button" hitSlop={8} style={{ minHeight: 36, justifyContent: 'center' }}>
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
