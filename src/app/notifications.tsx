import { Icon as Ionicons } from '@/components/icon';
import { router } from 'expo-router';
import { type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Empty, ErrorNote, Loading, Row, Screen, SignInPrompt, Txt } from '@/components/ui';
import { Radius, Space } from '@/constants/theme';
import { threadTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { AppNotification } from '@/lib/types';
import { must, useQuery } from '@/lib/use-query';
import { useAuth } from '@/providers/auth';
import { openRoute, useNotifications } from '@/providers/notifications';
import { useSettings } from '@/providers/settings';

const ICONS: Record<string, ComponentProps<typeof Ionicons>['name']> = {
  message: 'chatbubble-outline',
  inquiry: 'create-outline',
  board: 'people-outline',
  fresh: 'leaf-outline',
  near_me: 'location-outline',
  broadcast: 'megaphone-outline',
  event_reminder: 'calendar-outline',
  deadline: 'time-outline',
  review: 'shield-checkmark-outline',
  survey: 'clipboard-outline',
  checkin: 'thunderstorm-outline',
};

export default function NotificationsScreen() {
  const { colors, t } = useSettings();
  const { session } = useAuth();
  const { refresh } = useNotifications();

  const list = useQuery(
    async () => {
      if (!session) return [] as AppNotification[];
      return must(
        await supabase.from('notifications').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(100),
      ) as AppNotification[];
    },
    [session?.user.id],
  );

  if (!session) return <Screen><SignInPrompt /></Screen>;

  const open = async (n: AppNotification) => {
    if (!n.read_at) {
      await supabase.rpc('mark_notifications_read', { p_ids: [n.id] });
      refresh();
    }
    openRoute(n.data);
  };

  const markAll = async () => {
    await supabase.rpc('mark_notifications_read', { p_ids: null });
    refresh();
    list.reload();
  };

  const unread = (list.data ?? []).some((n) => !n.read_at);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        {unread ? <Button small kind="ghost" label={t('markAllRead')} icon="checkmark-done-outline" onPress={markAll} /> : <View />}
        <Button small kind="ghost" label={t('notificationSettings')} icon="options-outline" onPress={() => router.push('/settings')} />
      </Row>
      {list.error ? <ErrorNote message={list.error} onRetry={list.reload} /> : null}
      {!list.data && !list.error ? <Loading /> : null}
      {list.data && !list.data.length ? <Empty>{t('noNotifications')}</Empty> : null}
      {list.data?.map((n) => (
        <Pressable
          key={n.id}
          onPress={() => open(n)}
          accessibilityRole="button"
          accessibilityLabel={`${n.read_at ? '' : 'Unread. '}${n.title}. ${n.body}`}
          style={({ pressed }) => [
            styles.item,
            {
              backgroundColor: n.read_at ? colors.surface : colors.leafSoft,
              borderColor: n.read_at ? colors.line : colors.leaf,
              opacity: pressed ? 0.85 : 1,
            },
          ]}>
          <Ionicons name={ICONS[n.kind] ?? 'notifications-outline'} size={22} color={colors.leaf} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant={n.read_at ? 'body' : 'bodyBold'}>{n.title}</Txt>
            {n.body ? (
              <Txt variant="small" muted>
                {n.body}
              </Txt>
            ) : null}
          </View>
          <Txt variant="mono" muted>
            {threadTime(n.created_at)}
          </Txt>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: Space.md, borderWidth: 1, borderRadius: Radius.md, padding: Space.md, alignItems: 'flex-start' },
});
