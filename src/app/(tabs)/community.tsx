import { Icon as Ionicons } from '@/components/icon';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { SavedCopyNote } from '@/components/network-banner';
import { TranslateToggle, useTranslation } from '@/components/translate';
import { Button, Card, Chip, Empty, ErrorNote, Loading, Pill, Row, Screen, SignInPrompt, Txt } from '@/components/ui';
import { Space } from '@/constants/theme';
import { kindLabel, POST_KINDS } from '@/lib/board';
import { shortDate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Post, PostKind, Region } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

/** Needs and offers, equipment sharing, rides, buying together and mentoring, by region. */
export default function Community() {
  const { t } = useSettings();
  const { session, profile } = useAuth();
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

  if (!session) {
    return (
      <Screen>
        <Txt muted>Ask for a hand at harvest, share equipment, offer seedlings, find a ride to market or a mentor. Members only.</Txt>
        <SignInPrompt />
      </Screen>
    );
  }

  return (
    <Screen>
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
      {posts.data?.map((p) => (
        <PostCard key={p.id} post={p} mine={p.author_id === session.user.id} onChange={posts.reload} />
      ))}
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
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={6}>
          <Ionicons name={(kind?.icon ?? 'chatbox-outline') as never} size={18} color={colors.leaf} />
          <Pill label={kindLabel(post.kind)} tone="leaf" />
          {post.region_id ? <Pill label={post.region_id === 'intl' ? 'International' : `Region ${post.region_id}`} /> : null}
        </Row>
        <Txt variant="mono" muted>
          {shortDate(post.created_at)}
        </Txt>
      </Row>
      <Txt variant="heading">{post.title}</Txt>
      {post.body ? <Txt variant="small">{body.text}</Txt> : null}
      {post.location_text || post.happens_on ? (
        <Txt variant="small" muted>
          {[post.location_text, post.happens_on ? `On ${shortDate(post.happens_on)}` : null].filter(Boolean).join(' · ')}
        </Txt>
      ) : null}
      <Txt variant="small" muted>
        Posted by {mine ? 'you' : post.author?.display_name ?? 'a member'}
        {post.author?.role === 'grower' ? ' · grower' : post.author?.role === 'admin' || post.author?.role === 'coordinator' ? ' · BFI staff' : ''}
      </Txt>
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
