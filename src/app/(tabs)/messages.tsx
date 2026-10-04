import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Empty, ErrorNote, Loading, Provenance, Row, Screen, Segmented, SignInPrompt, Txt } from '@/components/ui';
import { Radius, Space } from '@/constants/theme';
import { initials, shortDate, threadTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Broadcast, Conversation } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

type Tab = 'direct' | 'channels' | 'bfi';
type ThreadRow = Conversation & { unread: boolean; preview: string };

export default function Messages() {
  const { t } = useSettings();
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>('direct');

  return (
    <Screen>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'direct', label: t('direct') },
          { value: 'channels', label: t('channels') },
          { value: 'bfi', label: t('fromBfiTab') },
        ]}
      />
      {tab === 'bfi' ? <Broadcasts /> : session ? <Threads kind={tab === 'direct' ? 'direct' : 'channel'} userId={session.user.id} /> : <SignInPrompt />}
    </Screen>
  );
}

function Threads({ kind, userId }: { kind: 'direct' | 'channel'; userId: string }) {
  const { colors } = useSettings();
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
        const last = data as { kind: string; body: string; inquiry: { product: string; amount: string } | null } | null;
        const preview = !last ? 'No messages yet' : last.kind === 'inquiry' && last.inquiry ? `Inquiry: ${last.inquiry.product}, ${last.inquiry.amount}` : last.body;
        const seen = readAt.get(c.id);
        return { ...c, preview, unread: kind === 'direct' && !!last && !!seen && new Date(c.last_message_at) > new Date(seen) };
      }),
    );
    return rows;
  }, [kind, userId]);

  if (threads.error) return <ErrorNote message={threads.error} onRetry={threads.reload} />;
  if (!threads.data) return <Loading />;
  if (!threads.data.length)
    return <Empty>{kind === 'direct' ? 'No conversations yet. Open a farm and send an inquiry to start one.' : 'No channels yet.'}</Empty>;

  return (
    <View>
      {kind === 'channel' ? (
        <Row style={{ justifyContent: 'space-between', marginBottom: Space.sm }}>
          <Txt variant="small" muted>
            One channel per BFI region, plus topic groups
          </Txt>
          <Provenance sample={false} />
        </Row>
      ) : null}
      {threads.data.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => router.push({ pathname: '/thread/[id]', params: { id: c.id } })}
          accessibilityRole="button"
          accessibilityLabel={`${c.title ?? 'Conversation'}${c.unread ? ', unread' : ''}. ${c.subtitle ?? c.preview}`}
          style={[styles.row, { borderBottomColor: colors.line }]}>
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
              {c.unread ? <View style={[styles.dot, { backgroundColor: colors.sun }]} /> : null}
            </Row>
            <Txt variant="small" muted numberOfLines={1}>
              {kind === 'channel' ? c.subtitle : c.preview}
            </Txt>
          </View>
          <Txt variant="mono" muted>
            {threadTime(c.last_message_at)}
          </Txt>
        </Pressable>
      ))}
      <Txt variant="small" muted style={{ marginTop: Space.md }}>
        {kind === 'channel'
          ? 'Anyone signed in can read channels. Verified growers and BFI staff can post. Every message can be reported.'
          : 'Buyers can message only farms that accept messages.'}
      </Txt>
    </View>
  );
}

function Broadcasts() {
  const { colors } = useSettings();
  const list = useQuery(async () => must(await supabase.from('broadcasts').select('*').order('created_at', { ascending: false }).limit(30)) as Broadcast[]);
  if (list.error) return <ErrorNote message={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  if (!list.data.length) return <Empty>No announcements from BFI yet.</Empty>;
  return (
    <View style={{ gap: Space.md }}>
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
                    Official account
                  </Txt>
                </Row>
              </View>
            </Row>
            <Txt variant="mono" muted>
              {shortDate(b.created_at)}
            </Txt>
          </Row>
          <Txt variant="heading">{b.title}</Txt>
          <Txt>{b.body}</Txt>
          {b.link_url ? (
            <Pressable onPress={() => WebBrowser.openBrowserAsync(b.link_url!)} accessibilityRole="link" style={{ minHeight: 40, justifyContent: 'center' }}>
              <Txt variant="bodyBold" color={colors.leaf}>
                {b.link_text ?? 'Open link'}
              </Txt>
            </Pressable>
          ) : null}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingVertical: Space.md, borderBottomWidth: 1, minHeight: 64 },
  mark: { width: 42, height: 42, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
