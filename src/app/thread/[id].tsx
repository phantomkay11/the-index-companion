import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, ErrorNote, Loading, Row, SignInPrompt, Txt } from '@/components/ui';
import { Radius, Space } from '@/constants/theme';
import { shortDate, timeOfDay } from '@/lib/format';
import { speak } from '@/lib/speak';
import { supabase } from '@/lib/supabase';
import type { Conversation, InquiryStatus, Message } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { useSettings } from '@/providers/settings';

const SELECT = '*, sender:profiles(display_name, role)';

export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, t, textScale, language } = useSettings();
  const { session, myFarm } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const conv = useQuery(async () => must(await supabase.from('conversations').select('*').eq('id', id).single()) as Conversation, [id]);
  const canPost = useQuery(async () => {
    const { data } = await supabase.rpc('can_post', { c: id });
    return Boolean(data);
  }, [id, session?.user.id]);

  // Initial load, then live updates for new messages.
  useEffect(() => {
    if (!session) return;
    let active = true;
    supabase
      .from('messages')
      .select(SELECT)
      .eq('conversation_id', id)
      .order('created_at', { ascending: true })
      .limit(300)
      .then(({ data }) => {
        if (active && data) setMessages(data as Message[]);
      });
    supabase.rpc('mark_read', { p_conversation_id: id });

    const channel = supabase
      .channel(`thread:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, async (payload) => {
        const row = payload.new as { id?: string };
        if (!row?.id) return;
        const { data } = await supabase.from('messages').select(SELECT).eq('id', row.id).single();
        if (!data || !active) return;
        setMessages((prev) => {
          const i = prev.findIndex((m) => m.id === row.id);
          if (i === -1) return [...prev, data as Message];
          const next = prev.slice();
          next[i] = data as Message;
          return next;
        });
        supabase.rpc('mark_read', { p_conversation_id: id });
      })
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [id, session]);

  if (!session) return <View style={{ padding: Space.lg }}><SignInPrompt /></View>;
  if (conv.error) return <View style={{ padding: Space.lg }}><ErrorNote message={conv.error} onRetry={conv.reload} /></View>;
  if (!conv.data) return <Loading />;
  const c = conv.data;
  const ownsThisFarm = !!myFarm && c.farm_id === myFarm.id;

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    const { error } = await supabase.from('messages').insert({ conversation_id: id, sender_id: session.user.id, body });
    setSending(false);
    if (error) return Alert.alert('Message not sent', error.message);
    setDraft('');
  };

  const answer = async (m: Message, status: InquiryStatus) => {
    const reply = {
      ready: "Yes, it's ready. See you then!",
      partial: "I have part of that this week. Want me to hold what I have?",
      unavailable: "Not this week, sorry. I'll message you when it's back.",
      open: '',
    }[status];
    const { error } = await supabase.rpc('answer_inquiry', { p_message_id: m.id, p_status: status, p_reply: reply });
    if (error) Alert.alert('Reply not sent', error.message);
  };

  const report = async (m: Message) => {
    const { error } = await supabase.from('reports').insert({ target_type: 'message', target_id: m.id, reason: 'Reported from thread' });
    Alert.alert(error ? 'Report not sent' : 'Report sent', error ? error.message : 'BFI moderators will review this message.');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: c.title ?? 'Conversation' }} />
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: Space.lg, gap: Space.md }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListHeaderComponent={
          <View style={{ gap: Space.sm, marginBottom: Space.sm }}>
            {c.subtitle ? <Txt variant="small" muted>{c.subtitle}</Txt> : null}
            {c.farm_id && !ownsThisFarm ? (
              <Button small kind="ghost" label="View farm profile" icon="storefront-outline" style={{ alignSelf: 'flex-start' }} onPress={() => router.push({ pathname: '/farm/[id]', params: { id: c.farm_id! } })} />
            ) : null}
          </View>
        }
        ListEmptyComponent={<Txt variant="small" muted style={{ textAlign: 'center' }}>No messages yet.</Txt>}
        renderItem={({ item: m }) => {
          const mine = m.sender_id === session.user.id;
          const name = mine ? 'You' : m.sender?.display_name ?? 'Member';
          const staff = m.sender?.role === 'coordinator' || m.sender?.role === 'admin';

          if (m.kind === 'inquiry' && m.inquiry) {
            return (
              <View style={[styles.inquiry, { borderColor: colors.line, backgroundColor: colors.surface, alignSelf: mine ? 'flex-end' : 'flex-start' }]}>
                <Txt variant="label">{mine ? 'Your inquiry' : `Inquiry from ${name}`}</Txt>
                <InquiryRow label="Product" value={m.inquiry.product} />
                <InquiryRow label="Amount" value={m.inquiry.amount} />
                <InquiryRow label="When" value={shortDate(m.inquiry.wanted_on)} />
                <InquiryRow label="How" value={m.inquiry.how} />
                {m.body ? <Txt variant="small">{m.body}</Txt> : null}
                {m.inquiry_status && m.inquiry_status !== 'open' ? (
                  <Txt variant="smallBold" color={colors.leaf}>
                    {{ ready: 'Farmer says: ready', partial: 'Farmer says: partly available', unavailable: 'Farmer says: not this week' }[m.inquiry_status]}
                  </Txt>
                ) : null}
                {ownsThisFarm && !mine && m.inquiry_status === 'open' ? (
                  <Row gap={6}>
                    <Button small label="Yes, it's ready" onPress={() => answer(m, 'ready')} />
                    <Button small kind="ghost" label="I have part of it" onPress={() => answer(m, 'partial')} />
                    <Button small kind="ghost" label="Not this week" onPress={() => answer(m, 'unavailable')} />
                  </Row>
                ) : null}
              </View>
            );
          }

          const text = m.kind === 'voice' ? m.transcript ?? '' : m.body;
          return (
            <View
              style={[
                styles.bubble,
                mine
                  ? { alignSelf: 'flex-end', backgroundColor: colors.leaf, borderColor: colors.leaf }
                  : { alignSelf: 'flex-start', backgroundColor: colors.sunk, borderColor: colors.line },
              ]}>
              {!mine ? (
                <Row gap={4}>
                  <Txt variant="smallBold" color={colors.leaf}>
                    {name}
                  </Txt>
                  {staff ? <Txt variant="small" color={colors.leaf}>· BFI staff</Txt> : null}
                  {m.pinned ? <Txt variant="small" muted>· pinned</Txt> : null}
                </Row>
              ) : null}
              {m.kind === 'voice' ? (
                <Row gap={6}>
                  <Ionicons name="mic-outline" size={16} color={mine ? colors.onLeaf : colors.muted} />
                  <Txt variant="label" color={mine ? colors.onLeaf : colors.muted}>
                    Voice note · transcript
                  </Txt>
                </Row>
              ) : null}
              <Txt color={mine ? colors.onLeaf : colors.text}>{text}</Txt>
              <Row gap={14}>
                <Txt variant="mono" color={mine ? colors.onLeaf : colors.muted} style={{ fontSize: 11 }}>
                  {timeOfDay(m.created_at)}
                  {m.via === 'sms' ? ' · by text message' : ''}
                </Txt>
                <Pressable onPress={() => speak(`${name}: ${text}`, language)} accessibilityRole="button" accessibilityLabel={`${t('listen')} to message from ${name}`} hitSlop={8}>
                  <Txt variant="small" color={mine ? colors.onLeaf : colors.text} style={{ textDecorationLine: 'underline' }}>
                    {t('listen')}
                  </Txt>
                </Pressable>
                {!mine ? (
                  <Pressable onPress={() => report(m)} accessibilityRole="button" accessibilityLabel={`${t('report')} message from ${name}`} hitSlop={8}>
                    <Txt variant="small" style={{ textDecorationLine: 'underline' }}>
                      {t('report')}
                    </Txt>
                  </Pressable>
                ) : null}
              </Row>
            </View>
          );
        }}
      />
      {canPost.data ? (
        <View style={[styles.composer, { borderTopColor: colors.line, backgroundColor: colors.surface }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('writeMessage')}
            placeholderTextColor={colors.muted}
            accessibilityLabel={t('writeMessage')}
            multiline
            style={[styles.input, { borderColor: colors.line, backgroundColor: colors.sunk, color: colors.text, fontSize: 16 * textScale }]}
          />
          <Pressable
            onPress={send}
            disabled={sending || !draft.trim()}
            accessibilityRole="button"
            accessibilityLabel={t('send')}
            style={[styles.send, { backgroundColor: colors.leaf, opacity: sending || !draft.trim() ? 0.5 : 1 }]}>
            <Ionicons name="send" size={20} color={colors.onLeaf} />
          </Pressable>
        </View>
      ) : (
        <View style={[styles.composer, { borderTopColor: colors.line, backgroundColor: colors.surface }]}>
          <Txt variant="small" muted style={{ flex: 1 }}>
            {c.kind === 'channel' ? 'Only verified growers and BFI staff can post in channels.' : 'You can read this conversation but not reply.'}
          </Txt>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function InquiryRow({ label, value }: { label: string; value: string }) {
  return (
    <Row gap={10}>
      <Txt variant="small" muted style={{ width: 70 }}>
        {label}
      </Txt>
      <Txt variant="smallBold" style={{ flex: 1 }}>
        {value}
      </Txt>
    </Row>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '86%', borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  inquiry: { maxWidth: '92%', borderWidth: 1, borderRadius: Radius.md, padding: Space.md, gap: 6 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Space.sm, padding: Space.md, borderTopWidth: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, maxHeight: 140 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
