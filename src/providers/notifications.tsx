import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { isExpoGo, registerForPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

type NotificationsContextValue = { unread: number; refresh: () => void };

const NotificationsContext = createContext<NotificationsContextValue>({ unread: 0, refresh: () => {} });

function openRoute(data: unknown) {
  const route = (data as { route?: unknown } | null)?.route;
  if (typeof route === 'string' && route.startsWith('/')) router.push(route as never);
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!uid) return;
    const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', uid).is('read_at', null);
    setUnread(count ?? 0);
  }, [uid]);

  // Live unread count.
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`notifications:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => refresh())
      // Count once the live feed is connected, so nothing slips between the count and the feed.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') refresh();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid, refresh]);

  // Keep the push token fresh for members who already allowed notifications. Never prompts here.
  useEffect(() => {
    if (!uid || Platform.OS === 'web' || (isExpoGo && Platform.OS === 'android')) return;
    Notifications.getPermissionsAsync()
      .then((p) => (p.granted ? registerForPush(uid) : null))
      .catch(() => {});
  }, [uid]);

  // Tapping a notification opens the screen it's about.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Notifications.getLastNotificationResponseAsync()
      .then((last) => last && openRoute(last.notification.request.content.data))
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      openRoute(response.notification.request.content.data);
    });
    return () => sub.remove();
  }, []);

  const value = useMemo(() => ({ unread: uid ? unread : 0, refresh }), [uid, unread, refresh]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationsContext);
}

export { openRoute };
