import { Icon as Ionicons } from '@/components/icon';
import { router, Tabs } from 'expo-router';
import { Pressable, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NetworkBanner } from '@/components/network-banner';
import { Txt } from '@/components/ui';
import { Fonts } from '@/constants/theme';
import { useLayout } from '@/lib/layout';
import { useNotifications } from '@/providers/notifications';
import { useSettings } from '@/providers/settings';

export default function TabsLayout() {
  const { colors, t, textScale } = useSettings();
  const { unread } = useNotifications();
  const { isTablet } = useLayout();
  const insets = useSafeAreaInsets();

  const headerRight = (tint: string = colors.text) => (
    <View style={{ flexDirection: 'row', marginRight: 8 }}>
      <Pressable
        onPress={() => router.push('/notifications')}
        accessibilityRole="button"
        accessibilityLabel={unread ? `${t('notifications')}, ${unread} unread` : t('notifications')}
        hitSlop={6}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={unread ? 'notifications' : 'notifications-outline'} size={23} color={tint} />
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
        <Ionicons name="accessibility-outline" size={24} color={tint} />
      </Pressable>
    </View>
  );

  // Material-style indicator: the active icon sits in a soft green pill and fills in.
  const tabIcon = (name: TabIconName) => {
    const render = ({ color, focused }: { color: ColorValue; focused: boolean }) => <TabIcon name={name} color={color as string} focused={focused} />;
    return render;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs
        screenOptions={{
          headerTitleStyle: { fontFamily: Fonts.hero, fontSize: 22 },
          headerTitleAlign: 'left',
          headerStyle: { backgroundColor: colors.surface },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerRight: () => headerRight(),
          tabBarInactiveTintColor: colors.muted,
          // On iPad the tabs become a sidebar rail on the left.
          tabBarPosition: isTablet ? 'left' : 'bottom',
          tabBarVariant: isTablet ? 'material' : 'uikit',
          tabBarLabelPosition: 'below-icon',
          tabBarStyle: isTablet
            ? { backgroundColor: colors.surface, borderRightColor: colors.line, borderRightWidth: 1, width: 112, paddingTop: 12 }
            : { backgroundColor: colors.surface, borderTopWidth: 0, height: 64 + insets.bottom, paddingTop: 6, shadowColor: '#0b2a1b', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: -2 }, elevation: 8 },
          tabBarItemStyle: isTablet ? { minHeight: 72, marginVertical: 2 } : undefined,
          tabBarActiveBackgroundColor: isTablet ? colors.leafSoft : undefined,
          tabBarLabelStyle: { fontFamily: Fonts.ui, fontSize: 11.5 * Math.min(textScale, 1.2) },
          tabBarActiveTintColor: colors.onSoft,
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
            tabBarIcon: tabIcon('location'),
            // The Discover photo runs up behind the header.
            headerTransparent: true,
            headerStyle: { backgroundColor: 'transparent' },
            headerTitle: () => null,
            headerRight: () => headerRight('#ffffff'),
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{ title: t('messages'), tabBarIcon: tabIcon('chatbubbles') }}
        />
        <Tabs.Screen
          name="community"
          options={{ title: t('community'), tabBarIcon: tabIcon('people') }}
        />
        <Tabs.Screen
          name="events"
          options={{ title: t('events'), tabBarIcon: tabIcon('calendar') }}
        />
        <Tabs.Screen
          name="resources"
          options={{ title: t('resources'), tabBarIcon: tabIcon('book') }}
        />
      </Tabs>
    </View>
  );
}

type TabIconName = 'location' | 'chatbubbles' | 'people' | 'calendar' | 'book';

function TabIcon({ name, color, focused }: { name: TabIconName; color: string; focused: boolean }) {
  const { colors } = useSettings();
  return (
    <View style={{ width: 58, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? colors.leafSoft : 'transparent' }}>
      <Ionicons name={focused ? name : (`${name}-outline` as const)} size={22} color={color} />
    </View>
  );
}
