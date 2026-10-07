import { Icon as Ionicons } from '@/components/icon';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThreadView } from '@/components/thread-view';

import { Card, Empty, Grid, ErrorNote, Loading, Provenance, Row, Screen, Segmented, SignInPrompt, Txt } from '@/components/ui';
import { Radius, Space } from '@/constants/theme';
import { initials, shortDate, threadTime } from '@/lib/format';
import { useLayout } from '@/lib/layout';
import { supabase } from '@/lib/supabase';
import type { Broadcast, Conversation } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

type Tab = 'direct' | 'channels' | 'bfi';
type LastMessage = { kind: string; body: string; inquiry: { product: string; amount: string } | null };
type ThreadRow = Conversation & { unread: boolean; last: LastMessage | null };

export default function Messages() {
  const { t, colors } = useSettings();
  const { session } = useAuth();
  const { isTablet } = useLayout();
  const [tab, setTab] = useState<Tab>('direct');
  const [selected, setSelected] = useState<string | null>(null);

  const tabs = (
    <Segmented<Tab>
      value={tab}
      onChange={(v) => {
        setTab(v);
        setSelected(null);
      }}
      options={[
        { value: 'direct', label: t('direct') },
        { value: 'channels', label: t('channels') },
        { value: 'bfi', label: t('fromBfiTab') },
      ]}
    />
  );

  // iPad: conversation list on the left, the open conversation on the right.
  if (isTablet && session && tab !== 'bfi') {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
        <ScrollView style={[styles.listPane, { borderRightColor: colors.line, backgroundColor: colors.surface }]} contentContainerStyle={{ padding: Space.lg, gap: Space.md }}>
          {tabs}
          <Threads kind={tab === 'direct' ? 'direct' : 'channel'} userId={session.user.id} selectedId={selected} onSelect={setSelected} />
        </ScrollView>
        <View style={{ flex: 1 }}>
          {selected ? (
            <ThreadView key={selected} id={selected} embedded />
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="chatbubbles-outline" size={48} color={colors.line} />
              <Txt muted style={{ textAlign: 'center' }}>
                {tab === 'direct' ? t('b_chooseConversation') : t('b_chooseChannel')}
              </Txt>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <Screen width={tab === 'bfi' ? 'wide' : 'reading'}>
      {tabs}
      {tab === 'bfi' ? <Broadcasts /> : session ? <Threads kind={tab === 'direct' ? 'direct' : 'channel'} userId={session.user.id} /> : <SignInPrompt />}
    </Screen>
  );
}

function Threads({
  kind,
  userId,
  selectedId,
  onSelect,
}: {
  kind: 'direct' | 'channel';
  userId: string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const { colors, t, language } = useSettings();
  // Built at render time so the preview follows the current language.
  const previewOf = (c: ThreadRow) =>
    !c.last
      ? t('b_noMessagesYet')
      : c.last.kind === 'inquiry' && c.last.inquiry
        ? t('b_inquiryPreview', { product: c.last.inquiry.product, amount: c.last.inquiry.amount })
        : c.last.body;
  const threads = useQuery(async () => {
    let q = supabase.from('conversations').select('*').eq('kind', kind).order(kind === 'channel' ? 'title' : 'last_message_at', { ascending: kind === 'channel' });
    if (kind === 'direct') {
      const mine = must(await supabase.from('conversation_members').select('conversation_id').eq('user_id', userId)) as { conversation_id: string }[];
      if (!mine.length) return [] as ThreadRow[];
      q = q.in('id', mine.map((m) => m.conversation_id));
    }
    const convs = must(await q) as Conversation[];
    const reads = must(await supabase.from('conversation_members').select('conversation_id, last_read_at').eq('user_id', userId)) as {
      conversation_id: string;
      last_read_at: string;
    }[];
    const readAt = new Map(reads.map((r) => [r.conversation_id, r.last_read_at]));
    // Latest message per thread for the preview line.
    const rows: ThreadRow[] = await Promise.all(
      convs.map(async (c) => {
        const { data } = await supabase
          .from('messages')
          .select('kind, body, inquiry')
          .eq('conversation_id', c.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const last = data as LastMessage | null;
        const seen = readAt.get(c.id);
        return { ...c, last, unread: kind === 'direct' && !!last && !!seen && new Date(c.last_message_at) > new Date(seen) };
      }),
    );
    return rows;
  }, [kind, userId]);

  if (threads.error) return <ErrorNote message={threads.error} onRetry={threads.reload} />;
  if (!threads.data) return <Loading />;
  if (!threads.data.length)
    return <Empty>{kind === 'direct' ? t('b_noConversations') : t('b_noChannels')}</Empty>;

  return (
    <View>
      {kind === 'channel' ? (
        <Row style={{ justifyContent: 'space-between', marginBottom: Space.sm }}>
          <Txt variant="small" muted>
            {t('b_channelsIntro')}
          </Txt>
          <Provenance sample={false} />
        </Row>
      ) : null}
      {threads.data.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => (onSelect ? onSelect(c.id) : router.push({ pathname: '/thread/[id]', params: { id: c.id } }))}
          accessibilityRole="button"
          accessibilityState={{ selected: selectedId === c.id }}
          aria-current={selectedId === c.id ? 'true' : undefined}
          // Starts with the visible title so voice control ("tap Okra Growers") matches.
          accessibilityLabel={`${c.title ?? t('b_conversation')}. ${(kind === 'channel' ? c.subtitle : previewOf(c)) ?? ''}${c.unread ? `. ${t('b_unread')}` : ''}`}
          style={[
            styles.row,
            { borderBottomColor: colors.line },
            selectedId === c.id && { backgroundColor: colors.leafSoft, borderRadius: Radius.md, paddingHorizontal: Space.sm },
          ]}>
          <View style={[styles.mark, { backgroundColor: colors.leafSoft }]}>
            {kind === 'channel' ? (
              <Txt variant="mono" color={colors.leaf}>#</Txt>
            ) : (
              <Txt variant="title" color={colors.leaf} style={{ fontSize: 16 }}>
                {initials(c.title ?? '?')}
              </Txt>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Row gap={6}>
              <Txt variant="heading" numberOfLines={1}>
                {c.title}
              </Txt>
              {c.unread ? <View style={[styles.dot, { backgroundColor: colors.danger }]} /> : null}
            </Row>
            <Txt variant="small" muted numberOfLines={1}>
              {kind === 'channel' ? c.subtitle : previewOf(c)}
            </Txt>
          </View>
          <Txt variant="mono" muted>
            {threadTime(c.last_message_at, undefined, language)}
          </Txt>
        </Pressable>
      ))}
      <Txt variant="small" muted style={{ marginTop: Space.md }}>
        {kind === 'channel'
          ? t('b_channelsRules')
          : t('b_directRules')}
      </Txt>
    </View>
  );
}

function Broadcasts() {
  const { colors, t, language } = useSettings();
  const list = useQuery(async () => must(await supabase.from('broadcasts').select('*').order('created_at', { ascending: false }).limit(30)) as Broadcast[], [], { cacheKey: 'broadcasts' });
  if (list.error) return <ErrorNote message={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  if (!list.data.length) return <Empty>{t('b_noAnnouncements')}</Empty>;
  return (
    <Grid gap={Space.md}>
      {list.data.map((b) => (
        <Card key={b.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={8}>
              <View style={[styles.mark, { backgroundColor: colors.leaf, width: 32, height: 32 }]}>
                <Ionicons name="leaf" size={16} color={colors.onLeaf} />
              </View>
              <View>
                <Txt variant="smallBold">Black Farmers Index</Txt>
                <Row gap={4}>
                  <Ionicons name="shield-checkmark" size={13} color={colors.leaf} />
                  <Txt variant="small" color={colors.leaf}>
                    {t('b_officialAccount')}
                  </Txt>
                </Row>
              </View>
            </Row>
            <Txt variant="mono" muted>
              {shortDate(b.created_at, language)}
            </Txt>
          </Row>
          <Txt variant="heading">{b.title}</Txt>
          <Txt>{b.body}</Txt>
          {b.link_url ? (
            <Pressable onPress={() => WebBrowser.openBrowserAsync(b.link_url!)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
              <Txt variant="bodyBold" color={colors.leaf}>
                {b.link_text ?? t('b_openLink')}
              </Txt>
            </Pressable>
          ) : null}
        </Card>
      ))}
    </Grid>
  );
}

const styles = StyleSheet.create({
  listPane: { width: 380, maxWidth: '42%', flexGrow: 0, borderRightWidth: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Space.md, padding: Space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingVertical: Space.md, borderBottomWidth: 1, minHeight: 64 },
  mark: { width: 42, height: 42, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
