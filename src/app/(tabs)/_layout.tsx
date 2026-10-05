import { Icon as Ionicons } from '@/components/icon';
import { router, Tabs } from 'expo-router';
import { Pressable, View } from 'react-native';

import { NetworkBanner } from '@/components/network-banner';
import { Txt } from '@/components/ui';
import { Fonts } from '@/constants/theme';
import { useNotifications } from '@/providers/notifications';
import { useSettings } from '@/providers/settings';

export default function TabsLayout() {
  const { colors, t, textScale } = useSettings();
  const { unread } = useNotifications();

  const headerRight = () => (
    <View style={{ flexDirection: 'row', marginRight: 8 }}>
      <Pressable
        onPress={() => router.push('/notifications')}
        accessibilityRole="button"
        accessibilityLabel={unread ? `${t('notifications')}, ${unread} unread` : t('notifications')}
        hitSlop={6}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={unread ? 'notifications' : 'notifications-outline'} size={23} color={colors.text} />
        {unread ? (
          <View
            style={{
              position: 'absolute',
              top: 6,
              right: 4,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              paddingHorizontal: 4,
              backgroundColor: colors.sun,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Txt variant="smallBold" color="#3a2700" style={{ fontSize: 11, lineHeight: 14 }}>
              {unread > 99 ? '99+' : unread}
            </Txt>
          </View>
        ) : null}
      </Pressable>
      <Pressable
        onPress={() => router.push('/settings')}
        accessibilityRole="button"
        accessibilityLabel={t('settings')}
        hitSlop={6}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="accessibility-outline" size={24} color={colors.text} />
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs
        screenOptions={{
          headerTitleStyle: { fontFamily: Fonts.display, fontSize: 21 },
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerRight,
          tabBarActiveTintColor: colors.leaf,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
          tabBarLabelStyle: { fontFamily: Fonts.bodyBold, fontSize: 11 * Math.min(textScale, 1.2) },
        }}
        screenLayout={({ children }) => (
          <View style={{ flex: 1 }}>
            <NetworkBanner />
            {children}
          </View>
        )}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'The Index',
            tabBarLabel: t('discover'),
            tabBarIcon: ({ color, size }) => <Ionicons name="location-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{ title: t('messages'), tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="community"
          options={{ title: t('community'), tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="events"
          options={{ title: t('events'), tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="resources"
          options={{ title: t('resources'), tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} /> }}
        />
      </Tabs>
    </View>
  );
}
